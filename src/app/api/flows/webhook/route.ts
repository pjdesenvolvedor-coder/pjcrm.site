import { NextRequest, NextResponse } from 'next/server';
import { initializeApp, getApps, getApp } from 'firebase/app';
import {
    getFirestore,
    collection,
    getDocs,
    doc,
    getDoc,
    setDoc,
    updateDoc,
    deleteDoc,
    runTransaction,
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
    MenuResponseDiag,
    cleanPhone,
    cleanServerUrl,
    sendUazapiText,
    sendUazapiContact,
    findSupportContactCard,
    isHumanSupportRequest,
    getCanonicalPhone,
    clearOutboundDedupForContact,
} from '@/lib/flow-runner';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
const db = getFirestore(app);

// Cache em memória para deduplicação rápida de IDs de mensagens
const processedMessageIds = new Set<string>();

// Mutex em memória por contato (userId:canonicalPhone) para impedir execuções concorrentes
// quando o cliente manda 2, 3 ou mais mensagens seguidas rapidamente
const activeContactLocks = new Map<string, number>();
const CONTACT_LOCK_TTL_MS = 40000;

// Cache em memória para credenciais de instâncias (TTL: 30 segundos)
interface CachedUserCredentials {
    userId: string;
    serverUrl: string;
    instanceToken: string;
    cachedAt: number;
}
const CREDS_CACHE_TTL_MS = 30 * 1000;
const tokenToUserCache = new Map<string, CachedUserCredentials>();
const userIdToCredsCache = new Map<string, CachedUserCredentials>();

// Cache em memória para configurações de gatilho (flow_config) (TTL: 5 segundos)
interface CachedFlowConfig {
    config: FlowTriggerSettings;
    cachedAt: number;
}
const flowConfigCache = new Map<string, CachedFlowConfig>();

function safeTrimString(val: any): string {
    if (typeof val === 'string') return val.trim();
    return '';
}

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

function getTimestampMs(val: any): number {
    if (!val) return 0;
    if (typeof val === 'number') return val;
    if (typeof val === 'string') {
        const parsed = Date.parse(val);
        return isNaN(parsed) ? 0 : parsed;
    }
    if (typeof val === 'object') {
        if (typeof val.toMillis === 'function') return val.toMillis();
        if (typeof val.toDate === 'function') return val.toDate().getTime();
        if (typeof val.seconds === 'number') return val.seconds * 1000;
    }
    return 0;
}

// Extrai apenas tokens reais em formato string (nunca confunde objetos `body.key` do WhatsApp ou nomes de instância)
function extractIncomingToken(req: NextRequest, body: any, queryToken: string | null): string {
    const candidates = [
        queryToken,
        req.headers.get('token'),
        req.headers.get('apikey'),
        req.headers.get('x-api-key'),
        req.headers.get('instance-token'),
        req.headers.get('authorization')?.replace(/^Bearer\s+/i, ''),
        safeTrimString(body?.token),
        safeTrimString(body?.instanceToken),
        safeTrimString(body?.apikey),
        safeTrimString(body?.instance?.token),
        safeTrimString(body?.instance?.apikey),
        safeTrimString(body?.data?.token),
        safeTrimString(body?.data?.instanceToken),
        safeTrimString(body?.data?.apikey),
        typeof body?.key === 'string' ? body.key : '',
    ];

    for (const c of candidates) {
        const s = safeTrimString(c);
        if (s) return s;
    }
    return '';
}

// Resolução instantânea e resiliente do usuário dono da instância de fluxo (uazapi_flow)
async function resolveUserCredentials(
    queryUserId: string | null,
    incomingToken: string
): Promise<{ creds: CachedUserCredentials | null; mismatch?: boolean }> {
    const now = Date.now();
    const cleanIncoming = safeTrimString(incomingToken);

    // 1. Se temos queryUserId na URL do Webhook (?userId=...):
    if (queryUserId) {
        const flowConnRef = doc(db, 'users', queryUserId, 'settings', 'uazapi_flow');
        const flowConnSnap = await getDoc(flowConnRef);

        let flowInstanceToken = '';
        let serverUrl = 'https://travelflow.uazapi.com';

        if (flowConnSnap.exists()) {
            const data = flowConnSnap.data() as UazapiConnectionConfig;
            flowInstanceToken = safeTrimString(data.instanceToken);
            if (data.serverUrl) serverUrl = data.serverUrl;
        }

        // Fallback: se uazapi_flow ainda não tiver token salvo, verifica settings/config
        if (!flowInstanceToken) {
            try {
                const mainSnap = await getDoc(doc(db, 'users', queryUserId, 'settings', 'config'));
                if (mainSnap.exists()) {
                    const mainData = mainSnap.data() as Settings;
                    flowInstanceToken = safeTrimString(mainData.webhookToken);
                }
            } catch {}
        }

        if (!flowInstanceToken) {
            return { creds: null };
        }

        // Se recebemos um token explícito diferente do token da instância de fluxo,
        // verifica se esse token pertence a outra instância do mesmo usuário (para evitar conflito entre dois WhatsApps)
        if (cleanIncoming && cleanIncoming !== flowInstanceToken) {
            // Se o token enviado for um UUID/token de outra instância (e não apenas o nome da instância), ignora
            const looksLikeToken = cleanIncoming.length >= 16 || cleanIncoming.includes('-');
            if (looksLikeToken) {
                console.warn(`[Flow Webhook] Token mismatch para userId ${queryUserId}: webhookToken="${cleanIncoming}" !== flowToken="${flowInstanceToken}". Ignorando.`);
                return { creds: null, mismatch: true };
            }
        }

        const creds: CachedUserCredentials = {
            userId: queryUserId,
            serverUrl,
            instanceToken: flowInstanceToken,
            cachedAt: now,
        };

        userIdToCredsCache.set(queryUserId, creds);
        tokenToUserCache.set(flowInstanceToken, creds);
        return { creds };
    }

    // 2. Se NÃO temos queryUserId, mas temos incomingToken:
    if (cleanIncoming) {
        const cached = tokenToUserCache.get(cleanIncoming);
        if (cached && (now - cached.cachedAt) < CREDS_CACHE_TTL_MS) {
            return { creds: cached };
        }

        try {
            const usersSnap = await getDocs(collection(db, 'users'));
            const results = await Promise.all(
                usersSnap.docs.map(async (uDoc) => {
                    const uid = uDoc.id;
                    try {
                        const flowSnap = await getDoc(doc(db, 'users', uid, 'settings', 'uazapi_flow'));
                        if (flowSnap.exists()) {
                            const data = flowSnap.data() as UazapiConnectionConfig;
                            const t = safeTrimString(data.instanceToken);
                            if (t) {
                                return {
                                    userId: uid,
                                    serverUrl: data.serverUrl || 'https://travelflow.uazapi.com',
                                    instanceToken: t,
                                    cachedAt: now,
                                };
                            }
                        }
                    } catch {}
                    return null;
                })
            );

            let matchedCreds: CachedUserCredentials | null = null;
            for (const res of results) {
                if (!res) continue;
                tokenToUserCache.set(res.instanceToken, res);
                userIdToCredsCache.set(res.userId, res);
                if (res.instanceToken === cleanIncoming) {
                    matchedCreds = res;
                }
            }

            return { creds: matchedCreds };
        } catch (err) {
            console.error('[Flow Webhook] Erro ao resolver credenciais de fluxo:', err);
            return { creds: null };
        }
    }

    return { creds: null };
}

// Helper que extrai o número de telefone real priorizando @s.whatsapp.net / @c.us / campos _pn,
// e faz fallback seguro para @lid quando o WhatsApp oculta o número do contato
function extractPhoneAndJid(candidates: any[]): { phoneNumber: string; recipientJid?: string } {
    // 1. Prioridade máxima: JID padrão de telefone (@s.whatsapp.net ou @c.us)
    for (const c of candidates) {
        if (typeof c === 'string' && (c.includes('@s.whatsapp.net') || c.includes('@c.us'))) {
            if (c.includes('@g.us') || c.includes('@broadcast')) continue;
            const num = cleanPhone(c);
            if (num.length >= 10 && num.length <= 15) {
                return { phoneNumber: num, recipientJid: c.trim() };
            }
        }
    }

    // 2. Segunda prioridade: campos numéricos diretos (sender_pn, chat.phone, etc.) sem @lid
    for (const c of candidates) {
        if (typeof c === 'number') {
            const s = String(c);
            if (s.length >= 10 && s.length <= 15) {
                return { phoneNumber: s };
            }
        }
        if (typeof c === 'string' && !c.includes('@lid') && !c.includes('@g.us') && !c.includes('@broadcast') && !c.includes('@newsletter')) {
            const num = cleanPhone(c);
            if (num.length >= 10 && num.length <= 15) {
                return { phoneNumber: num };
            }
        }
    }

    // 3. Fallback para contatos que usam exclusivamente @lid (Linked Identity do WhatsApp) sem número exposto
    for (const c of candidates) {
        if (typeof c === 'string' && c.includes('@lid')) {
            const lidDigits = cleanPhone(c);
            if (lidDigits.length >= 8) {
                return {
                    phoneNumber: `lid_${lidDigits}`,
                    recipientJid: c.trim(),
                };
            }
        }
    }

    return { phoneNumber: '' };
}

// Extrator universal e ultra-resiliente para mensagens da UazAPI (v1, v2, Baileys, WhatsMeow)
function extractMessageInfo(body: any) {
    if (!body || typeof body !== 'object') {
        return {
            msgId: '',
            fromMe: false,
            wasSentByApi: false,
            isNonMessageEvent: true,
            isMediaMessage: false,
            text: '',
            contactName: '',
            phoneCandidates: [],
        };
    }

    // Verifica tipo de evento na raiz para descartar eventos de ACK / leitura / presença / status
    const rawEventType = String(body.event || body.EventType || body.type || body.action || '').toLowerCase().trim();
    const ignoredEventTypes = [
        'messages.update',
        'message.ack',
        'messages.reaction',
        'message.revoke',
        'presence.update',
        'presence',
        'chats.update',
        'chats.upsert',
        'contacts.update',
        'contacts.upsert',
        'connection.update',
        'call',
        'readreceipt',
        'receipt',
        'ack',
        'status',
    ];
    if (rawEventType && ignoredEventTypes.includes(rawEventType)) {
        return {
            msgId: '',
            fromMe: false,
            wasSentByApi: false,
            isNonMessageEvent: true,
            isMediaMessage: false,
            text: '',
            contactName: '',
            phoneCandidates: [],
        };
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
        if (body.data.chat && typeof body.data.chat === 'object') {
            candidateObjects.push(body.data.chat);
        }
    }

    if (Array.isArray(body.message)) {
        candidateObjects.push(...body.message);
    } else if (body.message && typeof body.message === 'object') {
        candidateObjects.push(body.message);
        if (body.message.content && typeof body.message.content === 'object') {
            candidateObjects.push(body.message.content);
        }
    }

    if (Array.isArray(body.messages)) {
        candidateObjects.push(...body.messages);
    }

    if (body.chat && typeof body.chat === 'object') candidateObjects.push(body.chat);
    if (body.payload && typeof body.payload === 'object') candidateObjects.push(body.payload);
    if (body.event && typeof body.event === 'object') candidateObjects.push(body.event);

    const phoneCandidates: any[] = [];
    let text = '';
    let selectedButtonId = '';
    let selectedIndex: number | undefined = undefined;
    let msgId = '';
    let fromMe = false;
    let wasSentByApi = false;
    let isNonMessageEvent = false;
    let isMediaMessage = false;
    let contactName = '';

    for (const obj of candidateObjects) {
        if (!obj || typeof obj !== 'object') continue;

        if (!msgId) {
            const candidateId = obj.id || obj.messageid || obj.messageId || obj.key?.id || '';
            // Evita pegar ID de chat (que contém @) como msgId
            if (typeof candidateId === 'string' && candidateId && !candidateId.includes('@')) {
                msgId = candidateId;
            }
        }

        if (obj.fromMe === true || obj.key?.fromMe === true || obj.isFromMe === true || obj.owner === true) {
            fromMe = true;
        }

        if (obj.wasSentByApi === true || obj.sentByApi === true) {
            wasSentByApi = true;
        }

        // Ignora mensagens de reação ou protocolo internas do WhatsApp
        const msgTypeLower = String(obj.messageType || obj.type || obj.mediaType || '').toLowerCase().trim();
        if (
            msgTypeLower === 'reactionmessage' ||
            msgTypeLower === 'reaction' ||
            msgTypeLower === 'protocolmessage' ||
            msgTypeLower === 'protocol' ||
            msgTypeLower === 'senderkeydistributionmessage' ||
            (obj.reactionMessage && !obj.conversation && !obj.extendedTextMessage) ||
            (obj.protocolMessage && !obj.conversation && !obj.extendedTextMessage)
        ) {
            isNonMessageEvent = true;
        }

        // Detecta se é uma mensagem de mídia válida (áudio, imagem, vídeo, figurinha, documento, localização, contato)
        if (
            ['image', 'audio', 'ptt', 'voice', 'video', 'sticker', 'document', 'location', 'contact', 'vcard', 'media', 'imagemessage', 'audiomessage', 'videomessage', 'stickermessage', 'documentmessage', 'locationmessage', 'contactmessage'].includes(msgTypeLower) ||
            obj.audioMessage ||
            obj.imageMessage ||
            obj.videoMessage ||
            obj.stickerMessage ||
            obj.documentMessage ||
            obj.locationMessage ||
            obj.contactMessage ||
            obj.content?.mimetype ||
            obj.content?.URL
        ) {
            isMediaMessage = true;
        }

        if (!contactName) {
            const candidateName =
                obj.senderName ||
                obj.pushName ||
                obj.pushname ||
                obj.wa_name ||
                obj.wa_contactName ||
                obj.notifyName ||
                obj.verifiedName ||
                (obj !== body.chat ? obj.name : '') ||
                '';
            if (typeof candidateName === 'string' && candidateName.trim()) {
                contactName = candidateName.trim();
            }
        }

        // Coleta todos os campos possíveis onde o número real ou JID aparece na UazAPI
        phoneCandidates.push(
            obj.sender_pn,
            obj.chatid_pn,
            obj.chatId_pn,
            obj.participant_pn,
            obj.senderPn,
            obj.chatidPn,
            obj.participantPn,
            obj.remoteJidAlt,
            obj.key?.remoteJidAlt,
            obj.key?.senderPn,
            obj.key?.participantPn,
            obj.phone,
            obj.chat?.phone,
            obj.chat?.wa_chatid,
            obj.chat?.wa_fastid,
            obj.chat?.jid,
            obj.chat?.remoteJid,
            obj.chat?.id,
            obj.wa_chatid,
            obj.wa_sender,
            obj.chatid,
            obj.chatId,
            typeof obj.chat === 'string' ? obj.chat : undefined,
            obj.remoteJid,
            obj.key?.remoteJid,
            typeof obj.sender === 'string' ? obj.sender : obj.sender?.id || obj.sender?.phone,
            obj.from,
            obj.number,
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
            } else if (typeof obj.interactiveResponseMessage?.nativeFlowResponseMessage?.paramsJson === 'string') {
                try {
                    const parsedParams = JSON.parse(obj.interactiveResponseMessage.nativeFlowResponseMessage.paramsJson);
                    if (parsedParams?.id) selectedButtonId = String(parsedParams.id).trim();
                } catch {}
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
            } else if (typeof obj.content === 'string' && obj.content.trim()) {
                text = obj.content.trim();
            } else if (typeof obj.body === 'string' && obj.body.trim()) {
                text = obj.body.trim();
            } else if (typeof obj.message === 'string' && obj.message.trim()) {
                text = obj.message.trim();
            } else if (typeof obj.conversation === 'string' && obj.conversation.trim()) {
                text = obj.conversation.trim();
            } else if (typeof obj.extendedTextMessage?.text === 'string' && obj.extendedTextMessage.text.trim()) {
                text = obj.extendedTextMessage.text.trim();
            } else if (typeof obj.imageMessage?.caption === 'string' && obj.imageMessage.caption.trim()) {
                text = obj.imageMessage.caption.trim();
            } else if (typeof obj.videoMessage?.caption === 'string' && obj.videoMessage.caption.trim()) {
                text = obj.videoMessage.caption.trim();
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
        wasSentByApi,
        isNonMessageEvent,
        isMediaMessage,
        text,
        selectedButtonId: selectedButtonId || undefined,
        selectedIndex,
        contactName,
        phoneCandidates,
    };
}

// Localiza o fluxo a ser disparado com fallback automático caso o defaultFlowId esteja vazio, inativo ou tenha sido excluído
async function resolveFlowToExecute(
    targetUserId: string,
    preferredFlowId: string | null
): Promise<FlowDefinition | null> {
    if (preferredFlowId) {
        try {
            const flowRef = doc(db, 'users', targetUserId, 'flows', preferredFlowId);
            const flowSnap = await getDoc(flowRef);
            if (flowSnap.exists()) {
                const flowData = { id: flowSnap.id, ...flowSnap.data() } as FlowDefinition;
                if (flowData.isActive !== false && Array.isArray(flowData.nodes) && flowData.nodes.length > 0) {
                    return flowData;
                }
            }
        } catch (err) {
            console.error('[Flow Webhook] Erro ao buscar fluxo preferido:', err);
        }
    }

    // Fallback: busca automaticamente nos fluxos do usuário o primeiro ativo que tenha blocos
    try {
        const flowsSnap = await getDocs(collection(db, 'users', targetUserId, 'flows'));
        const allFlows = flowsSnap.docs.map((d) => ({ id: d.id, ...d.data() } as FlowDefinition));
        const activeWithNodes = allFlows.find(
            (f) => f.isActive !== false && Array.isArray(f.nodes) && f.nodes.length > 0
        );
        if (activeWithNodes) return activeWithNodes;

        // Último fallback: se o usuário só tem 1 fluxo com blocos (mesmo que isActive esteja desmarcado por engano)
        const anyWithNodes = allFlows.find((f) => Array.isArray(f.nodes) && f.nodes.length > 0);
        if (anyWithNodes) return anyWithNodes;
    } catch (err) {
        console.error('[Flow Webhook] Erro ao buscar fluxos no fallback:', err);
    }

    return null;
}

export async function GET() {
    return NextResponse.json({ status: 'ok', service: 'flows-webhook', version: 'v4_atomic_lock_and_lid_support' });
}

export async function POST(req: NextRequest) {
    let currentMsgId = '';
    let acquiredLockKey = '';
    try {
        const queryUserId = req.nextUrl.searchParams.get('userId');
        const queryToken = req.nextUrl.searchParams.get('token');

        const body = await req.json().catch(() => null);
        if (!body) {
            return NextResponse.json({ received: true }, { status: 200 });
        }

        const incomingToken = extractIncomingToken(req, body, queryToken);

        // 1. Extração universal e resiliente da mensagem e remetente
        const {
            msgId,
            fromMe,
            wasSentByApi,
            isNonMessageEvent,
            isMediaMessage,
            text,
            selectedButtonId,
            selectedIndex,
            contactName,
            phoneCandidates,
        } = extractMessageInfo(body);
        currentMsgId = msgId;

        if (isNonMessageEvent) {
            return NextResponse.json({ ignored: 'non_message_event' }, { status: 200 });
        }

        if (wasSentByApi) {
            return NextResponse.json({ ignored: 'was_sent_by_api' }, { status: 200 });
        }

        // Ignora mensagens de grupos (@g.us), canais (@newsletter) e status (@broadcast)
        for (const c of phoneCandidates) {
            if (typeof c === 'string' && (c.includes('@g.us') || c.includes('@broadcast') || c.includes('@newsletter'))) {
                return NextResponse.json({ ignored: 'group_or_broadcast' }, { status: 200 });
            }
        }

        const { phoneNumber, recipientJid } = extractPhoneAndJid(phoneCandidates);
        const userText = (text || '').trim();
        const normalizedText = userText.toLowerCase();

        if (!phoneNumber) {
            console.warn('[Flow Webhook] Nenhum telefone válido identificado no payload:', JSON.stringify(body).slice(0, 500));
            return NextResponse.json({ ignored: 'no_phone' }, { status: 200 });
        }

        // Se o evento não tem texto, não tem clique em botão e não é mídia (ex: ACK vazio da UazAPI), ignora
        if (!userText && !selectedButtonId && selectedIndex === undefined && !isMediaMessage) {
            return NextResponse.json({ ignored: 'empty_ack_or_status_payload' }, { status: 200 });
        }

        // Deduplicação rápida de mensagens por ID em memória
        if (msgId) {
            if (processedMessageIds.has(msgId)) {
                return NextResponse.json({ ignored: 'duplicate_message_id' }, { status: 200 });
            }
            processedMessageIds.add(msgId);
            if (processedMessageIds.size > 2500) {
                const first = processedMessageIds.values().next().value;
                if (first) processedMessageIds.delete(first);
            }
        }

        // 2. Localizar o usuário dono desta instância de fluxo UazAPI
        const { creds: userCreds, mismatch } = await resolveUserCredentials(queryUserId, incomingToken);

        if (mismatch) {
            return NextResponse.json({
                ignored: 'instance_token_mismatch',
                message: 'Webhook recebido de outra instância de WhatsApp do CRM.',
            }, { status: 200 });
        }

        if (!userCreds || !userCreds.userId || !userCreds.instanceToken) {
            console.warn('[Flow Webhook] Nenhuma instância de fluxo conectada para este webhook.');
            return NextResponse.json({ ignored: 'no_flow_instance_configured' }, { status: 200 });
        }

        const targetUserId = userCreds.userId;
        const userServerUrl = userCreds.serverUrl;
        const userInstanceToken = userCreds.instanceToken;

        // 3. Checar configurações de gatilho do usuário (`flow_config`) com cache curto (5s)
        let flowConfig: FlowTriggerSettings;
        const cachedCfg = flowConfigCache.get(targetUserId);
        const now = Date.now();
        if (cachedCfg && (now - cachedCfg.cachedAt) < 5000) {
            flowConfig = cachedCfg.config;
        } else {
            const configDocRef = doc(db, 'users', targetUserId, 'settings', 'flow_config');
            const configSnap = await getDoc(configDocRef);
            flowConfig = configSnap.exists()
                ? (configSnap.data() as FlowTriggerSettings)
                : { triggerMode: 'all_messages', keywords: [], ignoreIfActiveFlow: true };
            flowConfigCache.set(targetUserId, { config: flowConfig, cachedAt: now });
        }

        const resetWord = (flowConfig.resetKeyword || 'reset').toLowerCase().trim();
        const isReset = Boolean(userText && (normalizedText === resetWord || normalizedText === 'reset'));

        // Se a mensagem NÃO for de reset e for enviada por nós mesmos (fromMe), ignora imediatamente
        if (fromMe && !isReset) {
            return NextResponse.json({ ignored: 'fromMe' }, { status: 200 });
        }

        // 3.5 TRAVA DE CONCORRÊNCIA EM MEMÓRIA POR CONTATO
        // Impede que 2 mensagens seguidas ("Ouu" e "Me ajuda meu brother") executem o fluxo simultaneamente
        const canonicalPhone = getCanonicalPhone(phoneNumber) || cleanPhone(phoneNumber) || phoneNumber;
        const contactLockKey = `${targetUserId}:${canonicalPhone}`;
        const existingLockTs = activeContactLocks.get(contactLockKey);

        if (!isReset && existingLockTs && (now - existingLockTs) < CONTACT_LOCK_TTL_MS) {
            console.log(`[Flow Webhook] Ignorando mensagem concorrente de ${phoneNumber} ("${userText}"): fluxo já está em execução para este contato.`);
            return NextResponse.json({ ignored: 'contact_flow_already_executing' }, { status: 200 });
        }

        activeContactLocks.set(contactLockKey, now);
        acquiredLockKey = contactLockKey;

        console.log(`[Flow Webhook] Mensagem recebida de ${phoneNumber} (${contactName || 'Sem nome'}): "${userText}" | btnId="${selectedButtonId || ''}" | media=${isMediaMessage}`);

        const runnerCtx: FlowRunnerContext = {
            db,
            userId: targetUserId,
            serverUrl: cleanServerUrl(userServerUrl),
            instanceToken: userInstanceToken,
            phoneNumber,
            recipientJid,
            contactName,
        };

        // 4. Checar sessão atual do contato (`flow_sessions/{phoneNumber}`)
        const sessionDocRef = doc(db, 'users', targetUserId, 'flow_sessions', phoneNumber);
        const sessionSnap = await getDoc(sessionDocRef);
        const currentSession = sessionSnap.exists()
            ? (sessionSnap.data() as FlowContactSession)
            : null;

        // Deduplicação persistente de msgId na sessão (protege contra retries em instâncias serverless diferentes)
        if (msgId && currentSession?.recentMsgIds?.includes(msgId)) {
            return NextResponse.json({ ignored: 'duplicate_message_in_session' }, { status: 200 });
        }

        // 5. PALAVRA DE RESET DO CHAT (comando reset personalizável)
        if (isReset) {
            console.log(`[Flow Webhook] Palavra de reset "${resetWord}" recebida de ${phoneNumber}. Resetando sessão do chat...`);
            clearOutboundDedupForContact(targetUserId, phoneNumber);

            await deleteDoc(sessionDocRef).catch(() => {});
            await sendUazapiText({ ...runnerCtx, bypassDedup: true }, '🔄 *Chat resetado com sucesso!*\nIniciando fluxo...').catch(() => {});

            const flow = await resolveFlowToExecute(targetUserId, flowConfig.defaultFlowId || null);
            if (flow) {
                const nodes = flow.nodes || [];
                const edges = flow.edges || [];
                const explicitStartNode = nodes.find((n: any) => n.data?.nodeType === 'start');
                const targetNodeIds = new Set(edges.map((e: any) => e.target));
                const rootNode = explicitStartNode || nodes.find((n: any) => !targetNodeIds.has(n.id)) || nodes[0];

                if (rootNode) {
                    const nowStart = Date.now();
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
                        executingUntilMs: nowStart + 35000,
                        lastFlowStartedAtMs: nowStart,
                        recentMsgIds: msgId ? [msgId] : [],
                        lastInteractionAt: new Date().toISOString(),
                    });
                    await executeFlowNode(runnerCtx, flow, rootNode.id);
                    return NextResponse.json({ success: true, reset: true, startedFlow: flow.name }, { status: 200 });
                }
            }

            return NextResponse.json({ success: true, reset: true }, { status: 200 });
        }

        // 5.05 SE A SESSÃO ESTÁ EM EXECUÇÃO ATIVA (ex: aguardando bloco de Delay "Digitando..." de uma mensagem enviada segundos atrás),
        // IGNORA novas mensagens enviadas durante a execução para nunca duplicar o início ou o menu!
        if (
            currentSession &&
            currentSession.status === 'active' &&
            currentSession.executingUntilMs &&
            Date.now() < currentSession.executingUntilMs
        ) {
            console.log(`[Flow Webhook] Ignorando mensagem "${userText}" de ${phoneNumber}: sessão já está executando blocos/delay (até ${new Date(currentSession.executingUntilMs).toISOString()}).`);
            return NextResponse.json({ ignored: 'session_currently_executing_nodes' }, { status: 200 });
        }

        // 5.1 VERIFICAR SE O CONTATO ESTÁ EM PAUSA TEMPORÁRIA / COOLDOWN (Bloco Pausar Automação)
        if (currentSession && (currentSession.status === 'paused' || currentSession.pausedUntilMs || currentSession.pausedUntil)) {
            const untilMs = currentSession.pausedUntilMs || (currentSession.pausedUntil ? Date.parse(currentSession.pausedUntil) : 0);
            const nowMs = Date.now();
            if (untilMs && nowMs < untilMs) {
                const remainingMinutes = Math.ceil((untilMs - nowMs) / (60 * 1000));
                console.log(`[Flow Webhook] Mensagem de ${phoneNumber} ignorada: automação pausada até ${currentSession.pausedUntil} (${remainingMinutes} min restantes).`);
                return NextResponse.json({
                    ignored: 'automation_paused',
                    pausedUntil: currentSession.pausedUntil,
                    remainingMinutes,
                }, { status: 200 });
            } else if (untilMs && nowMs >= untilMs) {
                // A pausa expirou! Despausa e permite reiniciar normalmente
                console.log(`[Flow Webhook] Tempo de pausa para ${phoneNumber} expirou. Reativando automação normalmente.`);
                await updateDoc(sessionDocRef, {
                    status: 'completed',
                    pausedUntil: null,
                    pausedUntilMs: null,
                }).catch(() => {});
                currentSession.status = 'completed';
            }
        }

        // 5.2 SOLICITAÇÃO DE ATENDIMENTO HUMANO (FALLBACK)
        const isHumanSupport = isHumanSupportRequest(userText, flowConfig.humanSupportKeywords);
        const tryDispatchHumanSupport = async (): Promise<NextResponse | null> => {
            if (!isHumanSupport) return null;
            console.log(`[Flow Webhook] Solicitação de atendimento humano recebida de ${phoneNumber}: "${userText}". Buscando card de suporte configurado...`);

            const supportCard = await findSupportContactCard(db, targetUserId, flowConfig);
            if (supportCard && supportCard.phone) {
                await sendUazapiContact(runnerCtx, supportCard.name, supportCard.phone, supportCard.org);
                await setDoc(sessionDocRef, {
                    userId: targetUserId,
                    phoneNumber,
                    contactName: contactName || 'Cliente WhatsApp',
                    lastMessageText: userText,
                    status: 'completed',
                    executingUntilMs: 0,
                    lastInteractionAt: new Date().toISOString(),
                }, { merge: true });
                return NextResponse.json({ success: true, humanSupportDispatched: true, contact: supportCard }, { status: 200 });
            }
            console.warn(`[Flow Webhook] Nenhum card de suporte/atendente encontrado para o usuário ${targetUserId}.`);
            return null;
        };

        // 6. Palavras de forçar reinício do menu
        const restartKeywords = (flowConfig.restartKeywords || ['menu', 'reiniciar', 'voltar', 'sair']).map((k) =>
            k.toLowerCase().trim()
        );
        const isRestart = Boolean(userText && restartKeywords.includes(normalizedText));

        if (isRestart && currentSession) {
            clearOutboundDedupForContact(targetUserId, phoneNumber);
            await setDoc(sessionDocRef, {
                status: 'completed',
                executingUntilMs: 0,
                lastFlowStartedAtMs: 0,
                lastInteractionAt: new Date().toISOString(),
            }, { merge: true });
            currentSession.status = 'completed';
        }

        // 7. Se está em sessão aguardando resposta de um menu:
        if (currentSession && currentSession.status === 'waiting_user_input' && !isRestart) {
            const diag: MenuResponseDiag = {};
            const handled = await handleUserMenuResponse(
                runnerCtx,
                currentSession,
                userText,
                selectedButtonId,
                selectedIndex,
                diag
            );

            if (handled) {
                console.log(`[Flow Webhook] Opção de menu selecionada por ${phoneNumber}`);
                const updatedMsgIds = msgId
                    ? Array.from(new Set([...(currentSession.recentMsgIds || []).slice(-14), msgId]))
                    : currentSession.recentMsgIds || [];
                await updateDoc(sessionDocRef, {
                    lastMessageText: userText || selectedButtonId || '',
                    recentMsgIds: updatedMsgIds,
                    lastInteractionAt: new Date().toISOString(),
                }).catch(() => {});
                return NextResponse.json({ handled: 'user_menu_response' }, { status: 200 });
            }

            // Se NÃO bateu com nenhuma opção do menu: antes de avisar ou reiniciar, vê se pediu atendimento humano
            const humanResp = await tryDispatchHumanSupport();
            if (humanResp) return humanResp;

            const nowMs = Date.now();
            const lastInterMs = getTimestampMs(currentSession.lastInteractionAt);
            const menuSentAtMs = currentSession.menuSentAtMs || 0;
            const lastFlowStartedAtMs = currentSession.lastFlowStartedAtMs || 0;

            // Se o menu acabou de ser enviado há menos de 4.5 segundos (cliente ainda estava digitando a 2ª/3ª frase inicial como "Me ajuda meu brother" / "O código qual é"),
            // ignora silenciosamente essa frase extra para não poluir o chat nem reiniciar o fluxo!
            if (
                (menuSentAtMs && (nowMs - menuSentAtMs) < 4500) ||
                (lastFlowStartedAtMs && (nowMs - lastFlowStartedAtMs) < 8000)
            ) {
                console.log(`[Flow Webhook] Ignorando mensagem complementar enviada logo após o menu inicial por ${phoneNumber}: "${userText}"`);
                return NextResponse.json({ ignored: 'trailing_burst_after_menu' }, { status: 200 });
            }

            // Se o nó de menu não existe mais no fluxo (ex: fluxo foi editado),
            // OU se a sessão de menu é antiga (mais de 30 minutos de inatividade) e o cliente mandou uma nova mensagem,
            // OU se o usuário desativou "ignoreIfActiveFlow":
            // Reinicia o fluxo do começo em vez de prender o cliente em um menu antigo!
            const isStaleMenuSession = lastInterMs > 0 && (nowMs - lastInterMs) > 30 * 60 * 1000;
            if (diag.invalidMenuNode || isStaleMenuSession || flowConfig.ignoreIfActiveFlow === false) {
                console.log(
                    `[Flow Webhook] Reiniciando fluxo para ${phoneNumber} (invalidMenuNode=${!!diag.invalidMenuNode}, isStale=${isStaleMenuSession}, ignoreIfActiveFlow=${flowConfig.ignoreIfActiveFlow}).`
                );
            } else {
                // O menu é recente e válido, e o cliente digitou algo fora das opções:
                // Evita mandar aviso repetido se já avisou nos últimos 4 segundos
                if (currentSession.lastInvalidWarnAtMs && (nowMs - currentSession.lastInvalidWarnAtMs) < 4000) {
                    return NextResponse.json({ ignored: 'invalid_option_warn_cooldown' }, { status: 200 });
                }

                let invalidMsg = flowConfig.invalidOptionMessage;
                try {
                    const currentFlowRef = doc(db, 'users', targetUserId, 'flows', currentSession.flowId);
                    const currentFlowSnap = await getDoc(currentFlowRef);
                    if (currentFlowSnap.exists()) {
                        const currentFlowData = currentFlowSnap.data() as FlowDefinition;
                        const menuNode = (currentFlowData.nodes || []).find((n: any) => n.id === currentSession.currentNodeId);
                        if (menuNode?.data?.invalidOptionMessage) {
                            invalidMsg = menuNode.data.invalidOptionMessage;
                        }
                    }
                } catch {}

                if (!invalidMsg || !invalidMsg.trim()) {
                    invalidMsg = 'Selecione a opção acima';
                }

                console.log(`[Flow Webhook] Mensagem de ${phoneNumber} ("${userText}") não corresponde a nenhuma opção do menu. Enviando aviso: "${invalidMsg}"`);
                await sendUazapiText(runnerCtx, invalidMsg).catch(() => {});

                const updatedMsgIds = msgId
                    ? Array.from(new Set([...(currentSession.recentMsgIds || []).slice(-14), msgId]))
                    : currentSession.recentMsgIds || [];

                await updateDoc(sessionDocRef, {
                    lastMessageText: userText || '',
                    lastInvalidWarnAtMs: nowMs,
                    recentMsgIds: updatedMsgIds,
                    lastInteractionAt: new Date().toISOString(),
                }).catch(() => {});

                return NextResponse.json({ handled: 'invalid_menu_option_warned', message: invalidMsg }, { status: 200 });
            }
        }

        // 7.1 Cliente não está em menu: se pediu atendimento humano explicitamente, envia o card
        const humanRespOutside = await tryDispatchHumanSupport();
        if (humanRespOutside) return humanRespOutside;

        // 8. Determinar qual fluxo disparar
        let preferredFlowId: string | null = null;
        const triggerMode = flowConfig.triggerMode || 'all_messages';
        const hasConfiguredKeywords = Array.isArray(flowConfig.keywords) && flowConfig.keywords.length > 0;

        if (triggerMode === 'all_messages' || !hasConfiguredKeywords) {
            preferredFlowId = flowConfig.defaultFlowId || null;
        } else {
            // Modo palavras-chave
            const triggers = flowConfig.keywords || [];
            const cleanUserText = normalizeTextForMatch(userText);

            for (const trig of triggers) {
                if (!trig.keyword) continue;

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
                            preferredFlowId = trig.flowId;
                            break;
                        }
                    } else {
                        if (
                            (cleanVar && cleanUserText.includes(cleanVar)) ||
                            normalizedText.includes(lowerVar)
                        ) {
                            preferredFlowId = trig.flowId;
                            break;
                        }
                    }
                }

                if (preferredFlowId) break;
            }

            if (!preferredFlowId) {
                console.log(`[Flow Webhook] Nenhuma correspondência de palavra-chave para: "${userText}"`);
                return NextResponse.json({ ignored: 'no_keyword_match' }, { status: 200 });
            }
        }

        // 9. Carrega o fluxo (com fallback automático se defaultFlowId estiver vazio ou desatualizado)
        const flow = await resolveFlowToExecute(targetUserId, preferredFlowId);
        if (!flow) {
            console.warn(`[Flow Webhook] Nenhum fluxo ativo com blocos encontrado para o usuário ${targetUserId}.`);
            return NextResponse.json({ ignored: 'no_active_flow_found' }, { status: 200 });
        }

        const nodes = flow.nodes || [];
        const edges = flow.edges || [];
        const explicitStartNode = nodes.find((n: any) => n.data?.nodeType === 'start');
        const targetNodeIds = new Set(edges.map((e: any) => e.target));
        const rootNode = explicitStartNode || nodes.find((n: any) => !targetNodeIds.has(n.id)) || nodes[0];

        if (!rootNode) {
            return NextResponse.json({ ignored: 'flow_has_no_root_node' }, { status: 200 });
        }

        // 10. Trava Transacional Atômica no Firestore antes de iniciar o fluxo:
        // Garante 100% que mesmo em múltiplas instâncias serverless na Vercel,
        // duas mensagens enviadas juntas NUNCA iniciarão o fluxo duas vezes!
        const lockResult = await runTransaction(db, async (transaction) => {
            const snap = await transaction.get(sessionDocRef);
            const nowMs = Date.now();
            let prevMsgIds: string[] = [];

            if (snap.exists()) {
                const sData = snap.data() as FlowContactSession;
                prevMsgIds = Array.isArray(sData.recentMsgIds) ? sData.recentMsgIds : [];

                if (msgId && prevMsgIds.includes(msgId)) {
                    return { allowed: false, reason: 'duplicate_msg_id' };
                }

                if (!isRestart) {
                    // Se já está executando um nó/delay neste exato momento
                    if (sData.status === 'active' && sData.executingUntilMs && nowMs < sData.executingUntilMs) {
                        return { allowed: false, reason: 'already_executing' };
                    }
                    // Cooldown de 12 segundos entre inícios de fluxo para o mesmo contato (evita disparo duplo em rajada de mensagens)
                    if (sData.lastFlowStartedAtMs && (nowMs - sData.lastFlowStartedAtMs) < 12000) {
                        return { allowed: false, reason: 'start_cooldown' };
                    }
                }
            }

            const updatedMsgIds = msgId
                ? Array.from(new Set([...prevMsgIds.slice(-14), msgId]))
                : prevMsgIds;

            transaction.set(
                sessionDocRef,
                {
                    userId: targetUserId,
                    flowId: flow.id,
                    flowName: flow.name,
                    phoneNumber,
                    contactName: contactName || 'Cliente WhatsApp',
                    currentNodeId: rootNode.id,
                    currentNodeLabel: rootNode.data?.label || 'Início',
                    lastMessageText: userText || (isMediaMessage ? '[Mídia]' : ''),
                    status: 'active',
                    executingUntilMs: nowMs + 35000,
                    lastFlowStartedAtMs: nowMs,
                    recentMsgIds: updatedMsgIds,
                    lastInteractionAt: new Date().toISOString(),
                },
                { merge: true }
            );

            return { allowed: true, reason: 'ok' };
        });

        if (!lockResult.allowed) {
            console.log(`[Flow Webhook] Disparo de fluxo bloqueado pela trava atômica para ${phoneNumber} (${lockResult.reason}).`);
            return NextResponse.json({ ignored: lockResult.reason }, { status: 200 });
        }

        console.log(`[Flow Webhook] Disparando fluxo "${flow.name}" (nó raiz: ${rootNode.id}) para ${phoneNumber}`);

        // Executa o primeiro nó do fluxo
        await executeFlowNode(runnerCtx, flow, rootNode.id);

        return NextResponse.json({ success: true, startedFlow: flow.name }, { status: 200 });

    } catch (err: any) {
        console.error('[api/flows/webhook] error:', err);
        if (currentMsgId) {
            processedMessageIds.delete(currentMsgId);
        }
        return NextResponse.json({ error: err.message }, { status: 500 });
    } finally {
        if (acquiredLockKey) {
            activeContactLocks.delete(acquiredLockKey);
        }
    }
}
