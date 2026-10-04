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
} from '@/lib/flow-runner';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
const db = getFirestore(app);

// Cache em memória para deduplicação rápida de IDs de mensagens
const processedMessageIds = new Set<string>();

function cleanPhone(raw: string): string {
    if (!raw) return '';
    return raw.replace(/\D/g, '');
}

export async function POST(req: NextRequest) {
    try {
        const body = await req.json().catch(() => null);
        if (!body) {
            return NextResponse.json({ received: true }, { status: 200 });
        }

        // Token da instância no header ou no payload
        const headerToken =
            req.headers.get('token') ||
            req.headers.get('apikey') ||
            req.headers.get('x-api-key') ||
            body.token ||
            body.instanceToken ||
            '';

        // 1. Extração da mensagem e remetente do payload UazAPI
        let msgId = '';
        let remoteJid = '';
        let fromMe = false;
        let text = '';

        // Formato 1: Evento messages padrão da UazAPI
        // { event: "messages", data: { key: { id, remoteJid, fromMe }, message: { conversation, ... } } }
        if (body.data && typeof body.data === 'object') {
            const d = body.data;
            msgId = d.key?.id || '';
            remoteJid = d.key?.remoteJid || '';
            fromMe = d.key?.fromMe === true;

            const m = d.message || {};
            text =
                m.conversation ||
                m.extendedTextMessage?.text ||
                m.listResponseMessage?.singleSelectReply?.selectedRowId ||
                m.listResponseMessage?.title ||
                m.buttonsResponseMessage?.selectedButtonId ||
                m.buttonsResponseMessage?.selectedDisplayText ||
                m.templateButtonReplyMessage?.selectedId ||
                '';
        } else if (body.message && typeof body.message === 'object') {
            msgId = body.id || body.key?.id || '';
            remoteJid = body.remoteJid || body.sender || body.from || '';
            fromMe = body.fromMe === true;
            text =
                body.message.conversation ||
                body.message.text ||
                body.text ||
                '';
        } else {
            // Outro formato direto
            msgId = body.id || '';
            remoteJid = body.remoteJid || body.sender || body.number || '';
            fromMe = body.fromMe === true;
            text = body.text || body.body || '';
        }

        // Ignora mensagens enviadas pelo próprio bot/usuário para não gerar loops
        if (fromMe) {
            return NextResponse.json({ ignored: 'fromMe' }, { status: 200 });
        }

        // Ignora mensagens de grupos (@g.us) e status (@broadcast)
        if (remoteJid.includes('@g.us') || remoteJid.includes('@broadcast')) {
            return NextResponse.json({ ignored: 'group_or_broadcast' }, { status: 200 });
        }

        // Deduplicação de mensagens
        if (msgId) {
            if (processedMessageIds.has(msgId)) {
                return NextResponse.json({ ignored: 'duplicate_message' }, { status: 200 });
            }
            processedMessageIds.add(msgId);
            if (processedMessageIds.size > 2000) {
                // Limpeza do cache
                const first = processedMessageIds.values().next().value;
                if (first) processedMessageIds.delete(first);
            }
        }

        const phoneNumber = cleanPhone(remoteJid);
        const userText = (text || '').trim();

        if (!phoneNumber) {
            return NextResponse.json({ ignored: 'no_phone' }, { status: 200 });
        }

        // 2. Localizar o usuário dono desta instância UazAPI
        let targetUserId: string | null = null;
        let userServerUrl = 'https://travelflow.uazapi.com';
        let userInstanceToken = headerToken;

        // Procura primeiro pelo token informado
        if (headerToken) {
            const usersSnap = await getDocs(collection(db, 'users'));
            for (const userDoc of usersSnap.docs) {
                const uid = userDoc.id;
                // Checa uazapi_flow
                const flowConnRef = doc(db, 'users', uid, 'settings', 'uazapi_flow');
                const flowConnSnap = await getDoc(flowConnRef);
                if (flowConnSnap.exists()) {
                    const data = flowConnSnap.data() as UazapiConnectionConfig;
                    if (data.instanceToken === headerToken) {
                        targetUserId = uid;
                        userServerUrl = data.serverUrl || userServerUrl;
                        userInstanceToken = data.instanceToken;
                        break;
                    }
                }

                // Checa settings/config (Hub Principal)
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

        // Se não achou pelo token ou não veio token no header, tenta encontrar o primeiro usuário com uazapi_flow ativo
        if (!targetUserId) {
            const usersSnap = await getDocs(collection(db, 'users'));
            for (const userDoc of usersSnap.docs) {
                const uid = userDoc.id;
                const flowConnRef = doc(db, 'users', uid, 'settings', 'uazapi_flow');
                const flowConnSnap = await getDoc(flowConnRef);
                if (flowConnSnap.exists()) {
                    const data = flowConnSnap.data() as UazapiConnectionConfig;
                    if (data.instanceToken) {
                        targetUserId = uid;
                        userServerUrl = data.serverUrl || userServerUrl;
                        userInstanceToken = data.instanceToken;
                        break;
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
            serverUrl: userServerUrl,
            instanceToken: userInstanceToken,
            phoneNumber,
        };

        // 3. Checar configurações de gatilho do usuário (`flow_config`)
        const configDocRef = doc(db, 'users', targetUserId, 'settings', 'flow_config');
        const configSnap = await getDoc(configDocRef);
        const flowConfig: FlowTriggerSettings = configSnap.exists()
            ? (configSnap.data() as FlowTriggerSettings)
            : { triggerMode: 'keywords', keywords: [], ignoreIfActiveFlow: true };

        // 4. Checar sessão atual do contato (`flow_sessions/{phoneNumber}`)
        const sessionDocRef = doc(db, 'users', targetUserId, 'flow_sessions', phoneNumber);
        const sessionSnap = await getDoc(sessionDocRef);
        const currentSession = sessionSnap.exists()
            ? (sessionSnap.data() as FlowContactSession)
            : null;

        const normalizedText = userText.toLowerCase();

        // 5. Palavras para forçar reinício
        const restartKeywords = (flowConfig.restartKeywords || ['menu', 'reiniciar', 'voltar', 'sair']).map((k) =>
            k.toLowerCase().trim()
        );
        const isRestart = restartKeywords.includes(normalizedText);

        if (isRestart && currentSession) {
            // Limpa sessão ativa
            await setDoc(sessionDocRef, {
                status: 'completed',
                lastInteractionAt: new Date().toISOString(),
            }, { merge: true });
        }

        // 6. Se está em sessão aguardando input do menu e NÃO pediu reinício
        if (currentSession && currentSession.status === 'waiting_user_input' && !isRestart) {
            const handled = await handleUserMenuResponse(runnerCtx, currentSession, userText);
            if (handled) {
                return NextResponse.json({ handled: 'user_menu_response' }, { status: 200 });
            }
        }

        // 7. Se ignora se já tiver fluxo ativo e ainda não terminou
        if (
            flowConfig.ignoreIfActiveFlow &&
            currentSession &&
            currentSession.status === 'active' &&
            !isRestart
        ) {
            return NextResponse.json({ ignored: 'already_active_flow' }, { status: 200 });
        }

        // 8. Determinar qual fluxo disparar
        let flowToTriggerId: string | null = null;

        if (flowConfig.triggerMode === 'all_messages') {
            flowToTriggerId = flowConfig.defaultFlowId || null;
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
            // Nenhuma palavra-chave bateu
            return NextResponse.json({ ignored: 'no_keyword_match' }, { status: 200 });
        }

        // Carrega o fluxo e inicia
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

        // Encontra o nó inicial (nó que não possui nenhuma aresta apontando para ele, ou o primeiro nó)
        const edges = flow.edges || [];
        const targetNodeIds = new Set(edges.map((e: any) => e.target));
        const rootNode = nodes.find((n: any) => !targetNodeIds.has(n.id)) || nodes[0];

        // Atualiza a sessão
        await setDoc(sessionDocRef, {
            userId: targetUserId,
            flowId: flow.id,
            currentNodeId: rootNode.id,
            status: 'active',
            lastInteractionAt: new Date().toISOString(),
        });

        // Executa o primeiro nó
        await executeFlowNode(runnerCtx, flow, rootNode.id);

        return NextResponse.json({ success: true, startedFlow: flow.name }, { status: 200 });

    } catch (err: any) {
        console.error('[api/flows/webhook] error:', err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
