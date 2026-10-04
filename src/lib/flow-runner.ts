import { getFirestore, doc, getDoc, setDoc, updateDoc, collection, getDocs, query, where } from 'firebase/firestore';
import type { FlowDefinition, FlowNodeData, FlowContactSession, UazapiConnectionConfig, Settings } from './types';

export function cleanPhone(raw: string): string {
    if (!raw) return '';
    const withoutDomain = raw.split('@')[0];
    const withoutDevice = withoutDomain.split(':')[0];
    return withoutDevice.replace(/\D/g, '');
}

export function formatPhoneWith55(phone: string): string {
    if (!phone) return '';
    let digits = cleanPhone(phone);
    if (!digits) return '';
    if (!digits.startsWith('55') && (digits.length === 10 || digits.length === 11)) {
        digits = '55' + digits;
    }
    return digits;
}

export function cleanServerUrl(url?: string): string {
    let cleaned = (url || '').trim();
    if (!cleaned) cleaned = 'https://travelflow.uazapi.com';
    if (!cleaned.startsWith('http://') && !cleaned.startsWith('https://')) {
        cleaned = `https://${cleaned}`;
    }
    if (cleaned.endsWith('/')) {
        cleaned = cleaned.slice(0, -1);
    }
    return cleaned;
}

export interface FlowRunnerContext {
    db: any;
    userId: string;
    serverUrl: string;
    instanceToken: string;
    phoneNumber: string;
    contactName?: string;
}

export async function sendUazapiText(
    ctx: FlowRunnerContext,
    text: string
): Promise<boolean> {
    try {
        const base = cleanServerUrl(ctx.serverUrl);
        const res = await fetch(`${base}/send/text`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'token': ctx.instanceToken,
                'apikey': ctx.instanceToken,
            },
            body: JSON.stringify({
                number: formatPhoneWith55(ctx.phoneNumber),
                text,
            }),
        });
        return res.ok;
    } catch (err) {
        console.error('[sendUazapiText] error:', err);
        return false;
    }
}

export async function sendUazapiMedia(
    ctx: FlowRunnerContext,
    type: 'image' | 'audio' | 'video' | 'document',
    url: string,
    caption?: string
): Promise<boolean> {
    try {
        const base = cleanServerUrl(ctx.serverUrl);
        const res = await fetch(`${base}/send/media`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'token': ctx.instanceToken,
                'apikey': ctx.instanceToken,
            },
            body: JSON.stringify({
                number: formatPhoneWith55(ctx.phoneNumber),
                type,
                url,
                caption: caption || '',
            }),
        });
        return res.ok;
    } catch (err) {
        console.error('[sendUazapiMedia] error:', err);
        return false;
    }
}

export async function sendUazapiPresence(
    ctx: FlowRunnerContext,
    presence: 'composing' | 'recording' | 'paused'
): Promise<boolean> {
    try {
        const base = cleanServerUrl(ctx.serverUrl);
        await fetch(`${base}/send/presence`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'token': ctx.instanceToken,
                'apikey': ctx.instanceToken,
            },
            body: JSON.stringify({
                number: formatPhoneWith55(ctx.phoneNumber),
                presence,
            }),
        });
        return true;
    } catch {
        return false;
    }
}

export async function sendUazapiMenu(
    ctx: FlowRunnerContext,
    menuData: FlowNodeData
): Promise<boolean> {
    try {
        const base = cleanServerUrl(ctx.serverUrl);
        const phone = formatPhoneWith55(ctx.phoneNumber);

        // Se for menu numérico ou lista simples:
        if (menuData.menuType === 'numeric') {
            let msg = menuData.menuQuestionText || 'Selecione uma opção:\n';
            msg += '\n\n';
            (menuData.menuOptions || []).forEach((opt, idx) => {
                msg += `*${idx + 1}* - ${opt.label}${opt.description ? ` (${opt.description})` : ''}\n`;
            });
            return await sendUazapiText(ctx, msg.trim());
        }

        // Se for lista nativa do WhatsApp UazAPI
        if (menuData.menuType === 'list') {
            const choices = (menuData.menuOptions || []).map((opt) => {
                if (opt.description) {
                    return `${opt.label}|${opt.id}|${opt.description}`;
                }
                return `${opt.label}|${opt.id}`;
            });

            const res = await fetch(`${base}/send/menu`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'token': ctx.instanceToken,
                    'apikey': ctx.instanceToken,
                },
                body: JSON.stringify({
                    number: phone,
                    type: 'list',
                    text: menuData.menuQuestionText || 'Escolha uma opção:',
                    listButton: menuData.menuButtonTitle || 'VER OPÇÕES',
                    choices,
                }),
            });

            // Se falhar ou a instância não suportar lista nativa, fallback para menu texto
            if (!res.ok) {
                let msg = `*${menuData.menuQuestionText || 'Escolha uma opção:'}*\n\n`;
                (menuData.menuOptions || []).forEach((opt, idx) => {
                    msg += `*${idx + 1}* - ${opt.label}\n`;
                });
                return await sendUazapiText(ctx, msg.trim());
            }

            return true;
        }

        // Se for botões rápidos (type: button)
        if (menuData.menuType === 'button') {
            const choices = (menuData.menuOptions || []).slice(0, 3).map((opt) => `${opt.label}|${opt.id}`);
            const res = await fetch(`${base}/send/menu`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'token': ctx.instanceToken,
                    'apikey': ctx.instanceToken,
                },
                body: JSON.stringify({
                    number: phone,
                    type: 'button',
                    text: menuData.menuQuestionText || 'Escolha uma opção:',
                    choices,
                }),
            });

            if (!res.ok) {
                let msg = `*${menuData.menuQuestionText || 'Escolha uma opção:'}*\n\n`;
                (menuData.menuOptions || []).forEach((opt, idx) => {
                    msg += `*${idx + 1}* - ${opt.label}\n`;
                });
                return await sendUazapiText(ctx, msg.trim());
            }

            return true;
        }

        return false;
    } catch (err) {
        console.error('[sendUazapiMenu] error:', err);
        return false;
    }
}

/**
 * Executa um bloco/nó do fluxo e avança para os próximos nós conectados se forem automáticos
 */
export async function executeFlowNode(
    ctx: FlowRunnerContext,
    flow: FlowDefinition,
    nodeId: string
): Promise<void> {
    const nodes = flow.nodes || [];
    const edges = flow.edges || [];

    const currentNode = nodes.find((n: any) => n.id === nodeId);
    if (!currentNode) {
        console.warn(`[FlowRunner] Nó ${nodeId} não encontrado no fluxo ${flow.id}.`);
        return;
    }

    const nodeData = currentNode.data as FlowNodeData;
    const sessionDocRef = doc(ctx.db, 'users', ctx.userId, 'flow_sessions', ctx.phoneNumber);

    // Substituição de variáveis no texto
    const replaceVars = (str?: string) => {
        if (!str) return '';
        return str
            .replace(/\{nome\}/gi, ctx.contactName || 'Amigo(a)')
            .replace(/\{telefone\}/gi, ctx.phoneNumber);
    };

    // 1. CONTEÚDO
    if (nodeData.nodeType === 'content') {
        const text = replaceVars(nodeData.text);

        if (nodeData.contentType && nodeData.contentType !== 'text' && nodeData.mediaUrl) {
            await sendUazapiMedia(ctx, nodeData.contentType, nodeData.mediaUrl, text);
        } else if (text) {
            await sendUazapiText(ctx, text);
        }

        // Encontrar próximo nó conectado na saída padrão
        const nextEdge = edges.find((e: any) => e.source === nodeId);
        if (nextEdge && nextEdge.target) {
            // Pequeno delay para garantir entrega sequencial no WhatsApp
            await new Promise((resolve) => setTimeout(resolve, 1000));
            await executeFlowNode(ctx, flow, nextEdge.target);
        } else {
            // Fim do caminho do fluxo
            await setDoc(sessionDocRef, {
                userId: ctx.userId,
                flowId: flow.id,
                currentNodeId: nodeId,
                status: 'completed',
                lastInteractionAt: new Date().toISOString(),
            }, { merge: true });
        }
        return;
    }

    // 2. MENU (Aguarda interação do usuário)
    if (nodeData.nodeType === 'menu') {
        await sendUazapiMenu(ctx, {
            ...nodeData,
            menuQuestionText: replaceVars(nodeData.menuQuestionText),
        });

        // Salvar estado na sessão aguardando input do usuário
        await setDoc(sessionDocRef, {
            userId: ctx.userId,
            flowId: flow.id,
            currentNodeId: nodeId,
            status: 'waiting_user_input',
            lastInteractionAt: new Date().toISOString(),
        }, { merge: true });
        return;
    }

    // 3. ATRASO INTELIGENTE
    if (nodeData.nodeType === 'delay') {
        const seconds = Math.min(Math.max(nodeData.delaySeconds || 3, 1), 15);
        if (nodeData.delayPresence && nodeData.delayPresence !== 'none') {
            await sendUazapiPresence(ctx, nodeData.delayPresence);
        }

        // Aguarda os segundos definidos
        await new Promise((resolve) => setTimeout(resolve, seconds * 1000));

        const nextEdge = edges.find((e: any) => e.source === nodeId);
        if (nextEdge && nextEdge.target) {
            await executeFlowNode(ctx, flow, nextEdge.target);
        }
        return;
    }

    // 4. AÇÃO
    if (nodeData.nodeType === 'action') {
        if (nodeData.actionType === 'open_support') {
            // Procura o cliente e marca como necessitando suporte
            try {
                const clientsRef = collection(ctx.db, 'users', ctx.userId, 'clients');
                const q = query(clientsRef, where('phone', '==', ctx.phoneNumber));
                const snap = await getDocs(q);
                if (!snap.empty) {
                    const clientDoc = snap.docs[0];
                    await updateDoc(clientDoc.ref, {
                        needsSupport: true,
                        supportRequestedAt: new Date().toISOString(),
                    });
                }
            } catch (err) {
                console.error('[FlowRunner] Erro ao marcar suporte:', err);
            }

            if (nodeData.text) {
                await sendUazapiText(ctx, replaceVars(nodeData.text));
            }
        }

        const nextEdge = edges.find((e: any) => e.source === nodeId);
        if (nextEdge && nextEdge.target) {
            await executeFlowNode(ctx, flow, nextEdge.target);
        }
        return;
    }

    // 5. CONEXÃO DE FLUXO (Subfluxo)
    if (nodeData.nodeType === 'flow_connect' && nodeData.targetFlowId) {
        try {
            const targetFlowRef = doc(ctx.db, 'users', ctx.userId, 'flows', nodeData.targetFlowId);
            const targetSnap = await getDoc(targetFlowRef);
            if (targetSnap.exists()) {
                const targetFlow = targetSnap.data() as FlowDefinition;
                const startNode = (targetFlow.nodes || [])[0];
                if (startNode) {
                    await executeFlowNode(ctx, targetFlow, startNode.id);
                }
            }
        } catch (err) {
            console.error('[FlowRunner] Erro ao transferir fluxo:', err);
        }
        return;
    }

    // Fallback: avança para a próxima aresta se existir
    const defaultNextEdge = edges.find((e: any) => e.source === nodeId);
    if (defaultNextEdge && defaultNextEdge.target) {
        await executeFlowNode(ctx, flow, defaultNextEdge.target);
    }
}

/**
 * Trata resposta do usuário quando ele já está em um menu esperando input
 */
export async function handleUserMenuResponse(
    ctx: FlowRunnerContext,
    session: FlowContactSession,
    userText: string
): Promise<boolean> {
    const flowRef = doc(ctx.db, 'users', ctx.userId, 'flows', session.flowId);
    const flowSnap = await getDoc(flowRef);
    if (!flowSnap.exists()) return false;

    const flow = flowSnap.data() as FlowDefinition;
    const currentNode = (flow.nodes || []).find((n: any) => n.id === session.currentNodeId);
    if (!currentNode || currentNode.data?.nodeType !== 'menu') return false;

    const menuData = currentNode.data as FlowNodeData;
    const options = menuData.menuOptions || [];
    const normalizedInput = userText.trim().toLowerCase();

    // 1. Tenta correspondência exata por ID ou pelo número digitado (ex: "1", "2")
    let matchedOptionId: string | null = null;

    // Se o cliente digitou um número exato
    const numIdx = parseInt(normalizedInput);
    if (!isNaN(numIdx) && numIdx >= 1 && numIdx <= options.length) {
        matchedOptionId = options[numIdx - 1].id;
    }

    // Se bateu com o ID da opção ou o label
    if (!matchedOptionId) {
        const found = options.find(
            (opt) =>
                opt.id.toLowerCase() === normalizedInput ||
                opt.label.toLowerCase() === normalizedInput ||
                normalizedInput.includes(opt.label.toLowerCase()) ||
                opt.label.toLowerCase().includes(normalizedInput)
        );
        if (found) {
            matchedOptionId = found.id;
        }
    }

    const edges = flow.edges || [];

    // Procura a aresta cuja sourceHandle seja o matchedOptionId
    let targetEdge = null;
    if (matchedOptionId) {
        targetEdge = edges.find(
            (e: any) => e.source === currentNode.id && e.sourceHandle === matchedOptionId
        );
    }

    // Se não encontrou aresta específica da opção, tenta a aresta padrão do nó de menu
    if (!targetEdge) {
        targetEdge = edges.find((e: any) => e.source === currentNode.id && !e.sourceHandle);
    }

    if (targetEdge && targetEdge.target) {
        // Encontrou o próximo nó! Executa-o
        await executeFlowNode(ctx, flow, targetEdge.target);
        return true;
    }

    // Se o cliente não digitou uma opção válida do menu, retorna false
    // para permitir que o webhook trate a mensagem como novo gatilho ou reinício de fluxo
    return false;
}
