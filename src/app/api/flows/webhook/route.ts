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
    sendUazapiText,
    formatPhoneWith55,
} from '@/lib/flow-runner';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
const db = getFirestore(app);

// Cache em memória para deduplicação rápida de IDs de mensagens
const processedMessageIds = new Set<string>();

// Cache em memória de alta performance para credenciais de instâncias (TTL: 10 minutos)
interface CachedUserCredentials {
    userId: string;
    serverUrl: string;
    instanceToken: string;
    cachedAt: number;
}
const CACHE_TTL_MS = 10 * 60 * 1000;
const tokenToUserCache = new Map<string, CachedUserCredentials>();
const userIdToCredsCache = new Map<string, CachedUserCredentials>();

// Cache em memória para configurações de gatilho (flow_config) (TTL: 30 segundos)
interface CachedFlowConfig {
    config: FlowTriggerSettings;
    cachedAt: number;
}
const flowConfigCache = new Map<string, CachedFlowConfig>();

// Helper de normalização resiliente de texto para comparação de palavras-chave
function normalizeTextForMatch(str: string): string {
    return (str || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '') // remove acentos
        .replace(/[\p{Emoji}\p{Symbol}\p{Punctuation}]/gu, ' ') // remove emojis e pontuação
        .replace(/\s+/g, ' ')
        .trim();
}

// Resolução instantânea do usuário dono da instância WhatsApp
async function resolveUserCredentials(
    queryUserId: string | null,
    headerToken: string
): Promise<CachedUserCredentials | null> {
    const now = Date.now();

    // 1. Se targetUserId foi passado na query e está em cache
    if (queryUserId) {
        const cached = userIdToCredsCache.get(queryUserId);
        if (cached && (now - cached.cachedAt) < CACHE_TTL_MS) {
            return cached;
        }
    }

    // 2. Se headerToken foi passado e está em cache
    if (headerToken) {
        const cached = tokenToUserCache.get(headerToken);
        if (cached && (now - cached.cachedAt) < CACHE_TTL_MS) {
            return cached;
        }
    }

    // 3. Se temos queryUserId, busca direto no Firestore
    if (queryUserId) {
        let serverUrl = 'https://travelflow.uazapi.com';
        let instanceToken = headerToken;

        const flowConnRef = doc(db, 'users', queryUserId, 'settings', 'uazapi_flow');
        const flowConnSnap = await getDoc(flowConnRef);
        if (flowConnSnap.exists()) {
            const data = flowConnSnap.data() as UazapiConnectionConfig;
            serverUrl = data.serverUrl || serverUrl;
            if (data.instanceToken) instanceToken = data.instanceToken;
        } else {
            const mainConfigRef = doc(db, 'users', queryUserId, 'settings', 'config');
            const mainConfigSnap = await getDoc(mainConfigRef);
            if (mainConfigSnap.exists()) {
                const mainData = mainConfigSnap.data() as Settings;
                if (mainData.webhookToken) instanceToken = mainData.webhookToken;
            }
        }

        if (instanceToken) {
            const creds: CachedUserCredentials = {
                userId: queryUserId,
                serverUrl,
                instanceToken,
                cachedAt: now,
            };
            userIdToCredsCache.set(queryUserId, creds);
            tokenToUserCache.set(instanceToken, creds);
            return creds;
        }
    }

    // 4. Se não temos queryUserId ou token específico, busca em paralelo em todos os usuários (0 serial loop)
    try {
        const usersSnap = await getDocs(collection(db, 'users'));
        const userDocs = usersSnap.docs;

        const results = await Promise.all(
            userDocs.map(async (uDoc) => {
                const uid = uDoc.id;
                try {
                    const flowSnap = await getDoc(doc(db, 'users', uid, 'settings', 'uazapi_flow'));
                    if (flowSnap.exists()) {
                        const data = flowSnap.data() as UazapiConnectionConfig;
                        if (data.instanceToken) {
                            return {
                                userId: uid,
                                serverUrl: data.serverUrl || 'https://travelflow.uazapi.com',
                                instanceToken: data.instanceToken,
                                cachedAt: now,
                            };
                        }
                    }
                    const mainSnap = await getDoc(doc(db, 'users', uid, 'settings', 'config'));
                    if (mainSnap.exists()) {
                        const mData = mainSnap.data() as Settings;
                        if (mData.webhookToken) {
                            return {
                                userId: uid,
                                serverUrl: 'https://travelflow.uazapi.com',
                                instanceToken: mData.webhookToken,
                                cachedAt: now,
                            };
                        }
                    }
                } catch {}
                return null;
            })
        );

        let matchedCreds: CachedUserCredentials | null = null;
        let firstAvailable: CachedUserCredentials | null = null;

        for (const res of results) {
            if (!res) continue;
            tokenToUserCache.set(res.instanceToken, res);
            userIdToCredsCache.set(res.userId, res);

            if (!firstAvailable) firstAvailable = res;
            if (headerToken && res.instanceToken === headerToken) {
                matchedCreds = res;
            }
        }

        return matchedCreds || (!headerToken ? firstAvailable : null);
    } catch (err) {
        console.error('[Flow Webhook] Erro ao resolver credenciais de usuários:', err);
        return null;
    }
}

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

// Extrator universal e ultra-resiliente para mensagens da UazAPI
function extractMessageInfo(body: any) {
    if (!body || typeof body !== 'object') {
        return { msgId: '', fromMe: false, text: '', contactName: '', phoneCandidates: [] };
    }

    const candidateObjects: any[] = [];
    candidateObjects.push(body);

    if (Array.isArray(body.data)) {
        candidateObjects.push(...body.data);
    } else if (body.data && typeof body.data === 'object') {
        candidateObjects.push(body.data);
        if (body.data.message && typeof body.data.message === 'object') {
            candidateObjects.push(body.data.message);
        }
    }

    if (Array.isArray(body.message)) {
        candidateObjects.push(...body.message);
    } else if (body.message && typeof body.message === 'object') {
        candidateObjects.push(body.message);
    }

    if (Array.isArray(body.messages)) {
        candidateObjects.push(...body.messages);
    }

    if (body.payload && typeof body.payload === 'object') candidateObjects.push(body.payload);
    if (body.event && typeof body.event === 'object') candidateObjects.push(body.event);

    const phoneCandidates: any[] = [];
    let text = '';
    let selectedButtonId = '';
    let selectedIndex: number | undefined = undefined;
    let msgId = '';
    let fromMe = false;
    let contactName = '';

    for (const obj of candidateObjects) {
        if (!obj || typeof obj !== 'object') continue;

        if (!msgId) {
            msgId = obj.id || obj.messageid || obj.messageId || obj.key?.id || '';
        }

        if (obj.fromMe === true || obj.key?.fromMe === true) {
            fromMe = true;
        }

        if (!contactName) {
            contactName = obj.senderName || obj.pushName || obj.pushname || obj.name || obj.notifyName || '';
        }

        phoneCandidates.push(
            obj.chatid,
            obj.chatId,
            obj.chat,
            obj.remoteJid,
            obj.key?.remoteJid,
            obj.sender,
            obj.from,
            obj.number,
            obj.phone,
            obj.user
        );

        // Extrai selectedButtonId se vier de clique interativo de botão ou lista
        if (!selectedButtonId) {
            if (typeof obj.content?.selectedID === 'string' && obj.content.selectedID.trim()) {
                selectedButtonId = obj.content.selectedID.trim();
            } else if (typeof obj.content?.selectedId === 'string' && obj.content.selectedId.trim()) {
                selectedButtonId = obj.content.selectedId.trim();
            } else if (typeof obj.buttonOrListid === 'string' && obj.buttonOrListid.trim()) {
                selectedButtonId = obj.buttonOrListid.trim();
            } else if (typeof obj.content?.buttonOrListid === 'string' && obj.content.buttonOrListid.trim()) {
                selectedButtonId = obj.content.buttonOrListid.trim();
            } else if (typeof obj.buttonsResponseMessage?.selectedButtonId === 'string' && obj.buttonsResponseMessage.selectedButtonId.trim()) {
                selectedButtonId = obj.buttonsResponseMessage.selectedButtonId.trim();
            } else if (typeof obj.listResponseMessage?.singleSelectReply?.selectedRowId === 'string' && obj.listResponseMessage.singleSelectReply.selectedRowId.trim()) {
                selectedButtonId = obj.listResponseMessage.singleSelectReply.selectedRowId.trim();
            } else if (typeof obj.templateButtonReplyMessage?.selectedId === 'string' && obj.templateButtonReplyMessage.selectedId.trim()) {
                selectedButtonId = obj.templateButtonReplyMessage.selectedId.trim();
            }
        }

        // Extrai selectedIndex se vier no payload
        if (selectedIndex === undefined) {
            if (typeof obj.content?.selectedIndex === 'number') {
                selectedIndex = obj.content.selectedIndex;
            } else if (typeof obj.selectedIndex === 'number') {
                selectedIndex = obj.selectedIndex;
            }
        }

        // Extrai texto legível da mensagem
        if (!text) {
            if (typeof obj.content?.selectedDisplayText === 'string' && obj.content.selectedDisplayText.trim()) {
                text = obj.content.selectedDisplayText.trim();
            } else if (typeof obj.vote === 'string' && obj.vote.trim()) {
                text = obj.vote.trim();
            } else if (typeof obj.buttonsResponseMessage?.selectedDisplayText === 'string' && obj.buttonsResponseMessage.selectedDisplayText.trim()) {
                text = obj.buttonsResponseMessage.selectedDisplayText.trim();
            } else if (typeof obj.templateButtonReplyMessage?.selectedDisplayText === 'string' && obj.templateButtonReplyMessage.selectedDisplayText.trim()) {
                text = obj.templateButtonReplyMessage.selectedDisplayText.trim();
            } else if (typeof obj.listResponseMessage?.title === 'string' && obj.listResponseMessage.title.trim()) {
                text = obj.listResponseMessage.title.trim();
            } else if (typeof obj.text === 'string' && obj.text.trim()) {
                text = obj.text.trim();
            } else if (typeof obj.content?.text === 'string' && obj.content.text.trim()) {
                text = obj.content.text.trim();
            } else if (typeof obj.body === 'string' && obj.body.trim()) {
                text = obj.body.trim();
            } else if (typeof obj.message === 'string' && obj.message.trim()) {
                text = obj.message.trim();
            } else if (typeof obj.conversation === 'string' && obj.conversation.trim()) {
                text = obj.conversation.trim();
            } else if (typeof obj.extendedTextMessage?.text === 'string' && obj.extendedTextMessage.text.trim()) {
                text = obj.extendedTextMessage.text.trim();
            } else if (typeof obj.listResponseMessage?.singleSelectReply?.selectedRowId === 'string' && obj.listResponseMessage.singleSelectReply.selectedRowId.trim()) {
                text = obj.listResponseMessage.singleSelectReply.selectedRowId.trim();
            } else if (typeof obj.buttonsResponseMessage?.selectedButtonId === 'string' && obj.buttonsResponseMessage.selectedButtonId.trim()) {
                text = obj.buttonsResponseMessage.selectedButtonId.trim();
            } else if (typeof obj.templateButtonReplyMessage?.selectedId === 'string' && obj.templateButtonReplyMessage.selectedId.trim()) {
                text = obj.templateButtonReplyMessage.selectedId.trim();
            }
        }
    }

    // Se text estiver vazio mas tivermos selectedButtonId, usa como fallback de text
    if (!text && selectedButtonId) {
        text = selectedButtonId;
    }

    return {
        msgId,
        fromMe,
        text,
        selectedButtonId: selectedButtonId || undefined,
        selectedIndex,
        contactName,
        phoneCandidates
    };
}

export async function GET(req: NextRequest) {
    return NextResponse.json({ status: 'ok', service: 'flows-webhook', version: 'v3_extractMessageInfo' });
}

export async function POST(req: NextRequest) {
    let currentMsgId = '';
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

        // 1. Extração universal e resiliente da mensagem e remetente
        const { msgId, fromMe, text, selectedButtonId, selectedIndex, contactName, phoneCandidates } = extractMessageInfo(body);
        currentMsgId = msgId;

        const phoneNumber = extractRealPhoneNumber(phoneCandidates);
        const userText = (text || '').trim();
        const normalizedText = userText.toLowerCase();

        if (!phoneNumber) {
            console.warn('[Flow Webhook] Nenhum telefone válido identificado no payload:', JSON.stringify(body));
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

        console.log(`[Flow Webhook] Mensagem recebida de ${phoneNumber} (${contactName || 'Sem nome'}): "${userText}" | btnId="${selectedButtonId || ''}" | fromMe=${fromMe}`);

        // 2. Localizar o usuário dono desta instância UazAPI (alta performance com cache em memória)
        const userCreds = await resolveUserCredentials(queryUserId, headerToken);

        if (!userCreds || !userCreds.userId || !userCreds.instanceToken) {
            console.warn('[Flow Webhook] Nenhum usuário encontrado para a instância.');
            return NextResponse.json({ error: 'Nenhum usuário configurado para este webhook.' }, { status: 200 });
        }

        const targetUserId = userCreds.userId;
        const userServerUrl = userCreds.serverUrl;
        const userInstanceToken = userCreds.instanceToken;

        const runnerCtx: FlowRunnerContext = {
            db,
            userId: targetUserId,
            serverUrl: cleanServerUrl(userServerUrl),
            instanceToken: userInstanceToken,
            phoneNumber,
            contactName,
        };

        // 3. Checar configurações de gatilho do usuário (`flow_config`) com cache em memória
        let flowConfig: FlowTriggerSettings;
        const cachedCfg = flowConfigCache.get(targetUserId);
        const now = Date.now();
        if (cachedCfg && (now - cachedCfg.cachedAt) < 30000) {
            flowConfig = cachedCfg.config;
        } else {
            const configDocRef = doc(db, 'users', targetUserId, 'settings', 'flow_config');
            const configSnap = await getDoc(configDocRef);
            flowConfig = configSnap.exists()
                ? (configSnap.data() as FlowTriggerSettings)
                : { triggerMode: 'all_messages', keywords: [], ignoreIfActiveFlow: false };
            flowConfigCache.set(targetUserId, { config: flowConfig, cachedAt: now });
        }

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
            await sendUazapiText(runnerCtx, '🔄 *Chat resetado com sucesso!*\nIniciando fluxo...').catch(() => {});

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
            const handled = await handleUserMenuResponse(runnerCtx, currentSession, userText, selectedButtonId, selectedIndex);
            if (handled) {
                console.log(`[Flow Webhook] Opção de menu selecionada por ${phoneNumber}`);
                // Atualiza última mensagem na sessão
                await updateDoc(sessionDocRef, {
                    lastMessageText: userText || selectedButtonId || '',
                    lastInteractionAt: new Date().toISOString(),
                }).catch(() => {});
                return NextResponse.json({ handled: 'user_menu_response' }, { status: 200 });
            }
            // Se NÃO bateu com nenhuma opção do menu:
            // A mensagem do usuário é tratada como novo gatilho, reiniciando o fluxo!
            console.log(`[Flow Webhook] Texto "${userText}" (btnId: "${selectedButtonId || ''}") não era opção de menu. Reiniciando fluxo para ${phoneNumber}.`);
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
            const cleanUserText = normalizeTextForMatch(userText);

            for (const trig of triggers) {
                if (!trig.keyword) continue;

                // Suporta múltiplas palavras-chave separadas por vírgula, ponto e vírgula, barra ou quebra de linha
                const variants = trig.keyword.split(/[,;\n|]+/);

                for (const rawVar of variants) {
                    const varTrim = rawVar.trim();
                    if (!varTrim) continue;

                    const cleanVar = normalizeTextForMatch(varTrim);
                    const lowerVar = varTrim.toLowerCase();

                    if (trig.matchType === 'exact') {
                        if (
                            (cleanVar && cleanUserText === cleanVar) ||
                            normalizedText === lowerVar
                        ) {
                            flowToTriggerId = trig.flowId;
                            break;
                        }
                    } else {
                        // Contém
                        if (
                            (cleanVar && cleanUserText.includes(cleanVar)) ||
                            normalizedText.includes(lowerVar)
                        ) {
                            flowToTriggerId = trig.flowId;
                            break;
                        }
                    }
                }

                if (flowToTriggerId) break;
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
        if (flow.isActive === false) {
            return NextResponse.json({ ignored: 'flow_is_inactive' }, { status: 200 });
        }

        const nodes = flow.nodes || [];
        if (nodes.length === 0) {
            return NextResponse.json({ ignored: 'flow_has_no_nodes' }, { status: 200 });
        }

        // Identifica o nó raiz (prioriza o bloco de início 'start', depois nó sem entrada ou primeiro nó)
        const edges = flow.edges || [];
        const explicitStartNode = nodes.find((n: any) => n.data?.nodeType === 'start');
        const targetNodeIds = new Set(edges.map((e: any) => e.target));
        const rootNode = explicitStartNode || nodes.find((n: any) => !targetNodeIds.has(n.id)) || nodes[0];

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
        if (currentMsgId) {
            processedMessageIds.delete(currentMsgId);
        }
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
