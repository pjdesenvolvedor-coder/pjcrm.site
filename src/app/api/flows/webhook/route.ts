import { NextRequest, NextResponse } from 'next/server';
import { initializeApp, getApps, getApp } from 'firebase/app';
import {
    getFirestore,
    collection,
    query,
    where,
    getDocs,
    doc,
    getDoc,
    setDoc,
    deleteDoc,
} from 'firebase/firestore';
import { firebaseConfig } from '@/firebase/config';
import type {
    FlowDefinition,
    FlowTriggerSettings,
    FlowContactSession,
    UazapiConnectionConfig,
    Settings,
} from '@/lib/types';
import {
    executeFlowNode,
    handleUserMenuResponse,
    FlowRunnerContext,
    cleanPhone,
    cleanServerUrl,
} from '@/lib/flow-runner';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
const db = getFirestore(app);

// Cache em memória para deduplicação rápida de IDs de mensagens
const processedMessageIds = new Set<string>();

// Helper que prioriza JID com @s.whatsapp.net ou @c.us e ignora @lid
function extractRealPhoneNumber(candidates: any[]): string {
    for (const c of candidates) {
        if (typeof c === 'string' && (c.includes('@s.whatsapp.net') || c.includes('@c.us'))) {
            const num = cleanPhone(c);
            if (num.length >= 10 && num.length <= 15) return num;
        }
    }
    for (const c of candidates) {
        if (typeof c === 'string' && !c.includes('@lid') && !c.includes('@g.us') && !c.includes('@broadcast')) {
            const num = cleanPhone(c);
            if (num.length >= 10 && num.length <= 15) return num;
        }
    }
    return '';
}

export async function GET(req: NextRequest) {
    return NextResponse.json({ status: 'ok', service: 'flows-webhook' });
}

export async function POST(req: NextRequest) {
    try {
        const queryUserId = req.nextUrl.searchParams.get('userId');
        const queryToken = req.nextUrl.searchParams.get('token');

        const body = await req.json().catch(() => null);
        if (!body) {
            return NextResponse.json({ received: true }, { status: 200 });
        }

        // Token da instância no header, query ou no payload
        const headerToken =
            queryToken ||
            req.headers.get('token') ||
            req.headers.get('apikey') ||
            req.headers.get('x-api-key') ||
            body.token ||
            body.instanceToken ||
            body.data?.token ||
            body.instance?.token ||
            '';

        // 1. Extração da mensagem e remetente do payload UazAPI
        let msgId = '';
        let fromMe = false;
        let text = '';
        let contactName = '';
        const phoneCandidates: any[] = [];

        // Formato 1: Evento messages padrão da UazAPI
        if (body.data && typeof body.data === 'object') {
            const d = body.data;
            msgId = d.id || d.messageid || d.key?.id || '';
            fromMe = d.fromMe === true || d.key?.fromMe === true;
            contactName = d.senderName || d.pushName || '';

            phoneCandidates.push(d.chatid, d.key?.remoteJid, d.sender, d.from);

            const m = d.message || {};
            text =
                d.text ||
                d.content?.text ||
                m.conversation ||
                m.extendedTextMessage?.text ||
                m.listResponseMessage?.singleSelectReply?.selectedRowId ||
                m.listResponseMessage?.title ||
                m.buttonsResponseMessage?.selectedButtonId ||
                m.buttonsResponseMessage?.selectedDisplayText ||
                m.templateButtonReplyMessage?.selectedId ||
                '';
        } else if (body.message && typeof body.message === 'object') {
            msgId = body.id || body.messageid || body.key?.id || '';
            fromMe = body.fromMe === true || body.key?.fromMe === true;
            contactName = body.senderName || body.pushName || '';

            phoneCandidates.push(body.chatid, body.key?.remoteJid, body.remoteJid, body.sender, body.from);

            text =
                body.text ||
                body.content?.text ||
                body.message.conversation ||
                body.message.extendedTextMessage?.text ||
                body.message.text ||
                '';
        } else {
            // Formato direto
            msgId = body.id || body.messageid || '';
            fromMe = body.fromMe === true;
            contactName = body.senderName || body.pushName || '';
            phoneCandidates.push(body.chatid, body.chat, body.remoteJid, body.sender, body.number, body.from);
            text = body.text || body.body || body.content?.text || '';
        }

        // Adiciona candidatos de raiz caso não tenham sido capturados
        phoneCandidates.push(
            body.chatid,
            body.chat,
            body.remoteJid,
            body.sender,
            body.from,
            body.key?.remoteJid,
            body.data?.chatid,
            body.data?.chat,
            body.data?.remoteJid,
            body.data?.key?.remoteJid,
            body.data?.sender,
            body.data?.from
        );

        if (!text) {
            if (typeof body.data?.message === 'string') text = body.data.message;
            else if (typeof body.message === 'string') text = body.message;
            else if (body.text) text = body.text;
            else if (body.body) text = body.body;
            else if (body.content?.text) text = body.content.text;
        }

        const phoneNumber = extractRealPhoneNumber(phoneCandidates);
        const userText = (text || '').trim();
        const normalizedText = userText.toLowerCase();

        if (!phoneNumber) {
            return NextResponse.json({ ignored: 'no_phone' }, { status: 200 });
        }

        // Ignora mensagens de grupos (@g.us) e status (@broadcast)
        for (const c of phoneCandidates) {
            if (typeof c === 'string' && (c.includes('@g.us') || c.includes('@broadcast'))) {
                return NextResponse.json({ ignored: 'group_or_broadcast' }, { status: 200 });
            }
        }

        // Deduplicação de mensagens
        if (msgId) {
            if (processedMessageIds.has(msgId)) {
                return NextResponse.json({ ignored: 'duplicate_message' }, { status: 200 });
            }
            processedMessageIds.add(msgId);
            if (processedMessageIds.size > 2000) {
                const first = processedMessageIds.values().next().value;
                if (first) processedMessageIds.delete(first);
            }
        }

        console.log(`[Flow Webhook] Mensagem recebida de ${phoneNumber} (${contactName || 'Sem nome'}): "${userText}" | fromMe=${fromMe}`);

        // 2. Localizar o usuário dono desta instância UazAPI
        let targetUserId: string | null = queryUserId;
        let userServerUrl = 'https://travelflow.uazapi.com';
        let userInstanceToken = headerToken;

        if (targetUserId) {
            // Carrega credenciais do usuário direto
            const flowConnRef = doc(db, 'users', targetUserId, 'settings', 'uazapi_flow');
            const flowConnSnap = await getDoc(flowConnRef);
            if (flowConnSnap.exists()) {
                const data = flowConnSnap.data() as UazapiConnectionConfig;
                userServerUrl = data.serverUrl || userServerUrl;
                if (data.instanceToken) userInstanceToken = data.instanceToken;
            } else {
                const mainConfigRef = doc(db, 'users', targetUserId, 'settings', 'config');
                const mainConfigSnap = await getDoc(mainConfigRef);
                if (mainConfigSnap.exists()) {
                    const mainData = mainConfigSnap.data() as Settings;
                    if (mainData.webhookToken) userInstanceToken = mainData.webhookToken;
                }
            }
        } else {
            // Tenta encontrar por token
            const usersSnap = await getDocs(collection(db, 'users'));
            for (const userDoc of usersSnap.docs) {
                const uid = userDoc.id;
                const flowConnRef = doc(db, 'users', uid, 'settings', 'uazapi_flow');
                const flowConnSnap = await getDoc(flowConnRef);
                if (flowConnSnap.exists()) {
                    const data = flowConnSnap.data() as UazapiConnectionConfig;
                    if (headerToken && data.instanceToken === headerToken) {
                        targetUserId = uid;
                        userServerUrl = data.serverUrl || userServerUrl;
                        userInstanceToken = data.instanceToken;
                        break;
                    } else if (!headerToken && data.instanceToken) {
                        targetUserId = uid;
                        userServerUrl = data.serverUrl || userServerUrl;
                        userInstanceToken = data.instanceToken;
                        break;
                    }
                }

                if (!targetUserId && headerToken) {
                    const mainConfigRef = doc(db, 'users', uid, 'settings', 'config');
                    const mainConfigSnap = await getDoc(mainConfigRef);
                    if (mainConfigSnap.exists()) {
                        const mainData = mainConfigSnap.data() as Settings;
                        if (mainData.webhookToken === headerToken) {
                            targetUserId = uid;
                            userInstanceToken = mainData.webhookToken;
                            break;
                        }
                    }
                }
            }
        }

        if (!targetUserId || !userInstanceToken) {
            console.warn('[Flow Webhook] Nenhum usuário encontrado para a instância.');
            return NextResponse.json({ error: 'Nenhum usuário configurado para este webhook.' }, { status: 200 });
        }

        const runnerCtx: FlowRunnerContext = {
            db,
            userId: targetUserId,
            serverUrl: cleanServerUrl(userServerUrl),
            instanceToken: userInstanceToken,
            phoneNumber,
            contactName,
        };

        // 3. Checar configurações de gatilho do usuário (`flow_config`)
        const configDocRef = doc(db, 'users', targetUserId, 'settings', 'flow_config');
        const configSnap = await getDoc(configDocRef);
        const flowConfig: FlowTriggerSettings = configSnap.exists()
            ? (configSnap.data() as FlowTriggerSettings)
            : { triggerMode: 'all_messages', keywords: [], ignoreIfActiveFlow: false };

        const resetWord = (flowConfig.resetKeyword || 'reset').toLowerCase().trim();
        const isReset = normalizedText === resetWord || normalizedText === 'reset';

        // Se a mensagem NÃO for de reset e for fromMe, ignora para não causar loop
        if (fromMe && !isReset) {
            return NextResponse.json({ ignored: 'fromMe' }, { status: 200 });
        }

        // 4. Checar sessão atual do contato (`flow_sessions/{phoneNumber}`)
        const sessionDocRef = doc(db, 'users', targetUserId, 'flow_sessions', phoneNumber);
        const sessionSnap = await getDoc(sessionDocRef);
        const currentSession = sessionSnap.exists()
            ? (sessionSnap.data() as FlowContactSession)
            : null;

        // 5. PALAVRA DE RESET DO CHAT (Solicitado pelo usuário: comando reset personalizável)
        if (isReset) {
            console.log(`[Flow Webhook] Palavra de reset "${resetWord}" recebida de ${phoneNumber}. Resetando sessão do chat...`);

            // Remove ou limpa a sessão
            await deleteDoc(sessionDocRef).catch(() => {});

            // Notifica o WhatsApp
            await fetch(`${cleanServerUrl(userServerUrl)}/send/text`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', token: userInstanceToken, apikey: userInstanceToken },
                body: JSON.stringify({
                    number: phoneNumber,
                    text: '🔄 *Chat resetado com sucesso!*\nIniciando fluxo...',
                }),
            }).catch(() => {});

            // Imediatamente busca o fluxo e dispara do início
            let flowToRestartId = flowConfig.defaultFlowId;
            if (!flowToRestartId) {
                const flowsSnap = await getDocs(collection(db, 'users', targetUserId, 'flows'));
                const active = flowsSnap.docs
                    .map((d) => ({ id: d.id, ...d.data() } as FlowDefinition))
                    .find((f) => f.isActive !== false);
                if (active) flowToRestartId = active.id;
            }

            if (flowToRestartId) {
                const flowSnap = await getDoc(doc(db, 'users', targetUserId, 'flows', flowToRestartId));
                if (flowSnap.exists()) {
                    const flow = flowSnap.data() as FlowDefinition;
                    const edges = flow.edges || [];
                    const targetNodeIds = new Set(edges.map((e: any) => e.target));
                    const rootNode = flow.nodes?.find((n: any) => !targetNodeIds.has(n.id)) || flow.nodes?.[0];

                    if (rootNode) {
                        await setDoc(sessionDocRef, {
                            userId: targetUserId,
                            flowId: flow.id,
                            flowName: flow.name,
                            phoneNumber,
                            contactName: contactName || 'Cliente WhatsApp',
                            currentNodeId: rootNode.id,
                            currentNodeLabel: rootNode.data?.label || 'Início',
                            lastMessageText: userText,
                            status: 'active',
                            lastInteractionAt: new Date().toISOString(),
                        });
                        await executeFlowNode(runnerCtx, flow, rootNode.id);
                        return NextResponse.json({ success: true, reset: true, startedFlow: flow.name }, { status: 200 });
                    }
                }
            }

            return NextResponse.json({ success: true, reset: true }, { status: 200 });
        }

        // 6. Palavras de forçar reinício do menu
        const restartKeywords = (flowConfig.restartKeywords || ['menu', 'reiniciar', 'voltar', 'sair']).map((k) =>
            k.toLowerCase().trim()
        );
        const isRestart = restartKeywords.includes(normalizedText);

        if (isRestart && currentSession) {
            await setDoc(sessionDocRef, {
                status: 'completed',
                lastInteractionAt: new Date().toISOString(),
            }, { merge: true });
        }

        // 7. Se está em sessão aguardando resposta de um menu:
        if (currentSession && currentSession.status === 'waiting_user_input' && !isRestart) {
            // Tenta processar como escolha de uma das opções do menu
            const handled = await handleUserMenuResponse(runnerCtx, currentSession, userText);
            if (handled) {
                console.log(`[Flow Webhook] Opção de menu selecionada por ${phoneNumber}`);
                // Atualiza última mensagem na sessão
                await updateDoc(sessionDocRef, {
                    lastMessageText: userText,
                    lastInteractionAt: new Date().toISOString(),
                }).catch(() => {});
                return NextResponse.json({ handled: 'user_menu_response' }, { status: 200 });
            }
            // Se NÃO bateu com nenhuma opção do menu:
            // A mensagem do usuário é tratada como novo gatilho, reiniciando o fluxo!
            console.log(`[Flow Webhook] Texto "${userText}" não era opção de menu. Reiniciando fluxo para ${phoneNumber}.`);
        }

        // 8. Determinar qual fluxo disparar
        let flowToTriggerId: string | null = null;
        const triggerMode = flowConfig.triggerMode || 'all_messages';

        if (triggerMode === 'all_messages') {
            flowToTriggerId = flowConfig.defaultFlowId || null;

            // Se defaultFlowId não estiver salvo, busca automaticamente o fluxo ativo do usuário
            if (!flowToTriggerId) {
                const flowsSnap = await getDocs(collection(db, 'users', targetUserId, 'flows'));
                const active = flowsSnap.docs
                    .map((d) => ({ id: d.id, ...d.data() } as FlowDefinition))
                    .find((f) => f.isActive !== false);
                if (active) {
                    flowToTriggerId = active.id;
                }
            }
        } else {
            // Modo palavras-chave
            const triggers = flowConfig.keywords || [];
            for (const trig of triggers) {
                const kw = trig.keyword.toLowerCase().trim();
                if (!kw) continue;

                if (trig.matchType === 'exact') {
                    if (normalizedText === kw) {
                        flowToTriggerId = trig.flowId;
                        break;
                    }
                } else {
                    // Contém
                    if (normalizedText.includes(kw)) {
                        flowToTriggerId = trig.flowId;
                        break;
                    }
                }
            }
        }

        if (!flowToTriggerId) {
            console.log(`[Flow Webhook] Nenhuma correspondência de fluxo para: "${userText}"`);
            return NextResponse.json({ ignored: 'no_keyword_match' }, { status: 200 });
        }

        // 9. Carrega o fluxo e inicia a execução
        const flowRef = doc(db, 'users', targetUserId, 'flows', flowToTriggerId);
        const flowDocSnap = await getDoc(flowRef);
        if (!flowDocSnap.exists()) {
            return NextResponse.json({ error: 'Fluxo configurado não existe mais.' }, { status: 200 });
        }

        const flow = flowDocSnap.data() as FlowDefinition;
        if (!flow.isActive) {
            return NextResponse.json({ ignored: 'flow_is_inactive' }, { status: 200 });
        }

        const nodes = flow.nodes || [];
        if (nodes.length === 0) {
            return NextResponse.json({ ignored: 'flow_has_no_nodes' }, { status: 200 });
        }

        // Identifica o nó raiz (sem aresta de entrada) ou o primeiro nó
        const edges = flow.edges || [];
        const targetNodeIds = new Set(edges.map((e: any) => e.target));
        const rootNode = nodes.find((n: any) => !targetNodeIds.has(n.id)) || nodes[0];

        console.log(`[Flow Webhook] Disparando fluxo "${flow.name}" (nó raiz: ${rootNode.id}) para ${phoneNumber}`);

        // Atualiza a sessão para o Kanban
        await setDoc(sessionDocRef, {
            userId: targetUserId,
            flowId: flow.id,
            flowName: flow.name,
            phoneNumber,
            contactName: contactName || 'Cliente WhatsApp',
            currentNodeId: rootNode.id,
            currentNodeLabel: rootNode.data?.label || 'Início',
            lastMessageText: userText,
            status: 'active',
            lastInteractionAt: new Date().toISOString(),
        });

        // Executa o primeiro nó do fluxo
        await executeFlowNode(runnerCtx, flow, rootNode.id);

        return NextResponse.json({ success: true, startedFlow: flow.name }, { status: 200 });

    } catch (err: any) {
        console.error('[api/flows/webhook] error:', err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
