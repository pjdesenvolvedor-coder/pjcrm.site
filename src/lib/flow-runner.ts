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
    clientData?: any | null;
    clientVariables?: Record<string, string> | null;
}

export function getCanonicalPhone(phone: string): string {
    if (!phone) return '';
    const digits = phone.replace(/\D/g, '');
    if (!digits) return '';
    let local = digits.startsWith('55') && digits.length >= 12 ? digits.slice(2) : digits;
    if (local.length === 11 && local[2] === '9') {
        local = local.slice(0, 2) + local.slice(3);
    }
    if (local.length === 10) return '55' + local;
    return digits;
}

function getTimestampMs(val: any): number | null {
    if (!val) return null;
    if (typeof val === 'number') return val;
    if (typeof val === 'string') {
        const parsed = Date.parse(val);
        return isNaN(parsed) ? null : parsed;
    }
    if (typeof val === 'object') {
        if (typeof val.toMillis === 'function') return val.toMillis();
        if (typeof val.toDate === 'function') return val.toDate().getTime();
        if (val.seconds !== undefined) return val.seconds * 1000;
    }
    return null;
}

function formatDateSafe(val: any): string {
    const ms = getTimestampMs(val);
    if (!ms) return '';
    try {
        const d = new Date(ms);
        return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
    } catch {
        return '';
    }
}

function formatDaysRemaining(val: any): string {
    const ms = getTimestampMs(val);
    if (!ms) return '';
    const now = new Date();
    const diffMs = ms - now.getTime();
    const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
    if (diffDays > 1) return `${diffDays} dias restantes`;
    if (diffDays === 1) return 'Vence amanhã';
    if (diffDays === 0) return 'Vence hoje';
    if (diffDays === -1) return 'Venceu ontem';
    return `Vencido há ${Math.abs(diffDays)} dias`;
}

export async function findClientByPhone(db: any, userId: string, rawPhone: string): Promise<any | null> {
    if (!rawPhone || !userId) return null;
    const digits = cleanPhone(rawPhone);
    if (!digits) return null;

    const candidates = [
        rawPhone,
        digits,
        formatPhoneWith55(digits),
        digits.startsWith('55') && digits.length >= 12 ? digits.slice(2) : `55${digits}`,
    ];
    const uniqueCandidates = Array.from(new Set(candidates.filter(Boolean)));

    const clientsCol = collection(db, 'users', userId, 'clients');
    const matchingDocsMap = new Map<string, any>();

    // 1. Busca direta por telefone exato
    for (const cand of uniqueCandidates) {
        try {
            const q = query(clientsCol, where('phone', '==', cand));
            const snap = await getDocs(q);
            for (const d of snap.docs) {
                matchingDocsMap.set(d.id, { id: d.id, ...d.data() });
            }
        } catch {}
    }

    // 2. Busca fallback com canonical phone (caso o telefone esteja salvo com máscara, ex: (11) 98765-4321)
    if (matchingDocsMap.size === 0) {
        try {
            const allSnap = await getDocs(clientsCol);
            const targetCanonical = getCanonicalPhone(digits);
            for (const d of allSnap.docs) {
                const cData: any = d.data();
                if (cData.phone) {
                    const cDigits = cleanPhone(cData.phone);
                    if (
                        uniqueCandidates.includes(cDigits) ||
                        (targetCanonical && getCanonicalPhone(cDigits) === targetCanonical)
                    ) {
                        matchingDocsMap.set(d.id, { id: d.id, ...cData });
                    }
                }
            }
        } catch (err) {
            console.error('[findClientByPhone] erro ao consultar clientes no fallback:', err);
        }
    }

    if (matchingDocsMap.size === 0) {
        return null;
    }

    const matchingList = Array.from(matchingDocsMap.values());

    // Se houver mais de um registro do mesmo cliente (ex: renovações ou planos adicionais),
    // seleciona o plano ativo e mais recente com maior pontuação:
    const getClientScore = (c: any): number => {
        let score = 0;
        // Prioridade 1: Status Ativo é prioritário
        if (c.status === 'Ativo') score += 1000;
        else if (c.status === 'Vencido') score += 200;

        // Prioridade 2: Vencimento futuro / mais recente
        const dueMs = getTimestampMs(c.dueDate);
        if (dueMs) {
            const nowMs = Date.now();
            if (dueMs > nowMs) {
                score += 500 + Math.min(Math.floor((dueMs - nowMs) / (1000 * 60 * 60 * 24)), 365);
            } else {
                score += Math.max(0, 100 - Math.floor((nowMs - dueMs) / (1000 * 60 * 60 * 24)));
            }
        }

        // Prioridade 3: Possui nome de assinatura/plano preenchido
        if (c.subscription || c.plan || c.plano) score += 60;

        // Prioridade 4: Possui credenciais (email/senha) preenchidas
        if (c.email && (Array.isArray(c.email) ? c.email.length > 0 : String(c.email).trim() !== '')) score += 40;
        if (c.password || c.senha) score += 40;

        // Prioridade 5: Data de cadastro mais recente
        const createdMs = getTimestampMs(c.createdAt) || getTimestampMs(c.firstCreatedAt);
        if (createdMs) {
            score += Math.min(Math.floor(createdMs / 100000000), 50);
        }

        return score;
    };

    matchingList.sort((a, b) => getClientScore(b) - getClientScore(a));
    const bestClient = matchingList[0];

    // Mescla dados complementares se o melhor registro tiver campos em branco (ex: senha em outro registro)
    const mergedClient = { ...bestClient };

    for (const other of matchingList) {
        if (!mergedClient.password && (other.password || other.senha)) {
            mergedClient.password = other.password || other.senha;
        }
        if (!mergedClient.screen && (other.screen || other.tela)) {
            mergedClient.screen = other.screen || other.tela;
        }
        if (!mergedClient.pinScreen && (other.pinScreen || other.pin_tela || other.pin)) {
            mergedClient.pinScreen = other.pinScreen || other.pin_tela || other.pin;
        }
        if (
            (!mergedClient.email || (Array.isArray(mergedClient.email) && mergedClient.email.length === 0)) &&
            other.email
        ) {
            mergedClient.email = other.email;
        }
        if (!mergedClient.accessLink && (other.accessLink || other.link)) {
            mergedClient.accessLink = other.accessLink || other.link;
        }
        if (!mergedClient.paymentMethod && (other.paymentMethod || other.metodo_pagamento || other.pagamento)) {
            mergedClient.paymentMethod = other.paymentMethod || other.metodo_pagamento || other.pagamento;
        }
        if (!mergedClient.amountPaid && (other.amountPaid || other.valor)) {
            mergedClient.amountPaid = other.amountPaid || other.valor;
        }
    }

    // Coleta todas as assinaturas ativas se o cliente tiver múltiplos produtos
    const allSubs = Array.from(
        new Set(
            matchingList
                .filter((c) => c.status === 'Ativo' || matchingList.length === 1)
                .map((c) => (c.subscription || c.plan || c.plano || '').trim())
                .filter(Boolean)
        )
    );
    if (allSubs.length > 1) {
        mergedClient.allSubscriptions = allSubs.join(' + ');
    }

    return mergedClient;
}

export function formatClientVariables(client: any, fallbackName?: string, fallbackPhone?: string): Record<string, string> {
    if (!client) {
        const name = fallbackName || 'Amigo(a)';
        return {
            nome: name,
            cliente: name,
            primeiro_nome: name.split(' ')[0] || name,
            telefone: fallbackPhone || '',
            numero: fallbackPhone || '',
            phone: fallbackPhone || '',
            status: 'Não cadastrado',
            plano: '',
            assinatura: '',
            subscription: '',
            metodo_pagamento: '',
            forma_pagamento: '',
            pagamento: '',
            payment_method: '',
            valor: '',
            valor_pago: '',
            amount_paid: '',
            vencimento: '',
            data_vencimento: '',
            due_date: '',
            dias_restantes: '',
            email: '',
            'e-mail': '',
            emails: '',
            senha: '',
            password: '',
            tela: '',
            screen: '',
            pin_tela: '',
            pin: '',
            link: '',
            link_acesso: '',
            access_link: '',
            quantidade: '',
            notas: '',
            observacoes: '',
            tipo_cliente: '',
        };
    }

    const fullName = (client.name || fallbackName || 'Cliente').trim();
    const firstName = fullName.split(' ')[0] || fullName;
    const phone = (client.phone || fallbackPhone || '').trim();

    // Extrair email com segurança (suporta array de strings, array de objetos {value: string}, ou string direta)
    let emailStr = '';
    if (Array.isArray(client.email)) {
        emailStr = client.email
            .map((e: any) => (typeof e === 'object' && e ? (e.value || '') : String(e || '')))
            .filter(Boolean)
            .join(', ');
    } else if (Array.isArray(client.emails)) {
        emailStr = client.emails
            .map((e: any) => (typeof e === 'object' && e ? (e.value || '') : String(e || '')))
            .filter(Boolean)
            .join(', ');
    } else if (typeof client.email === 'string') {
        emailStr = client.email.trim();
    } else if (typeof client.emails === 'string') {
        emailStr = client.emails.trim();
    } else if (client.login && typeof client.login === 'string') {
        emailStr = client.login.trim();
    }

    // Primeiro e-mail (caso seja lista) ou o e-mail completo
    const firstEmail = emailStr.split(',')[0]?.trim() || emailStr;

    // Senha da conta
    const password = (client.password || client.senha || client.pass || '').trim();

    // Tela de acesso
    const screen = (client.screen || client.tela || '').trim();

    // PIN da tela
    const pinScreen = (client.pinScreen || client.pin_tela || client.pin || '').trim();

    // Plano / Assinatura (busca nas chaves subscription, plan, plano ou allSubscriptions)
    const planName = (
        client.subscription ||
        client.plan ||
        client.plano ||
        client.subscriptionName ||
        client.produto ||
        client.product ||
        client.allSubscriptions ||
        ''
    ).trim();

    // Método de pagamento
    const paymentMethod = (
        client.paymentMethod ||
        client.metodo_pagamento ||
        client.forma_pagamento ||
        client.formaPagamento ||
        client.pagamento ||
        ''
    ).trim();

    // Valor pago / Valor
    let amountStr = '';
    if (client.amountPaid !== undefined && client.amountPaid !== null && String(client.amountPaid).trim() !== '') {
        const rawAmount = String(client.amountPaid).trim();
        amountStr = rawAmount.includes('R$') ? rawAmount : `R$ ${rawAmount}`;
    }

    // Vencimento e dias restantes
    const dueDateStr = formatDateSafe(client.dueDate);
    const daysRemainingStr = formatDaysRemaining(client.dueDate);

    // Link de acesso
    const accessLink = (client.accessLink || client.link || client.link_acesso || '').trim();

    // Status
    const statusStr = (client.status || 'Ativo').trim();

    // Quantidade
    const quantityStr = client.quantity ? String(client.quantity) : '';

    // Observações / Notas
    const notesStr = (client.notes || client.observacoes || client.obs || '').trim();

    // Tipo de cliente
    const clientTypeStr = (client.clientType || '').trim();

    return {
        // Nomes
        nome: fullName,
        cliente: fullName,
        primeiro_nome: firstName,

        // Telefones
        telefone: phone,
        numero: phone,
        phone: phone,

        // Status
        status: statusStr,

        // Plano e Assinatura
        plano: planName,
        assinatura: planName,
        subscription: planName,

        // Método de pagamento
        metodo_pagamento: paymentMethod,
        forma_pagamento: paymentMethod,
        pagamento: paymentMethod,
        payment_method: paymentMethod,

        // Valor
        valor: amountStr,
        valor_pago: amountStr,
        amount_paid: amountStr,

        // Vencimento
        vencimento: dueDateStr,
        data_vencimento: dueDateStr,
        due_date: dueDateStr,
        dias_restantes: daysRemainingStr,

        // E-mail e Senha (duas variáveis independentes)
        email: firstEmail,
        'e-mail': firstEmail,
        emails: emailStr,
        senha: password,
        password: password,

        // Tela e PIN
        tela: screen,
        screen: screen,
        pin_tela: pinScreen,
        pin: pinScreen,

        // Links de acesso
        link: accessLink,
        link_acesso: accessLink,
        access_link: accessLink,

        // Extras
        quantidade: quantityStr,
        notas: notesStr,
        observacoes: notesStr,
        tipo_cliente: clientTypeStr,
    };
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

        const rawOptions = menuData.menuOptions;
        const optionsList = Array.isArray(rawOptions)
            ? rawOptions
            : typeof rawOptions === 'object' && rawOptions !== null
            ? Object.values(rawOptions)
            : [];
        const menuOptions = optionsList.filter(Boolean).map((opt: any, idx: number) => {
            if (typeof opt === 'string') return { id: `opt_${idx + 1}`, label: opt, description: '' };
            return {
                id: String(opt.id || `opt_${idx + 1}`),
                label: String(opt.label || opt.text || opt.title || `Opção ${idx + 1}`),
                description: opt.description ? String(opt.description) : '',
            };
        });

        // Se for menu numérico ou lista simples:
        if (menuData.menuType === 'numeric') {
            let msg = menuData.menuQuestionText || 'Selecione uma opção:\n';
            msg += '\n\n';
            menuOptions.forEach((opt, idx) => {
                msg += `*${idx + 1}* - ${opt.label}${opt.description ? ` (${opt.description})` : ''}\n`;
            });
            return await sendUazapiText(ctx, msg.trim());
        }

        // Se for lista nativa do WhatsApp UazAPI
        if (menuData.menuType === 'list') {
            const choices = menuOptions.map((opt) => {
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
                menuOptions.forEach((opt, idx) => {
                    msg += `*${idx + 1}* - ${opt.label}\n`;
                });
                return await sendUazapiText(ctx, msg.trim());
            }

            return true;
        }

        // Se for botões rápidos (type: button)
        if (menuData.menuType === 'button') {
            const choices = menuOptions.slice(0, 3).map((opt) => `${opt.label}|${opt.id}`);
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
                menuOptions.forEach((opt, idx) => {
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

    // 0. CARREGA OU RECUPERA VARIÁVEIS DO CLIENTE
    let clientVars: Record<string, string> | null = ctx.clientVariables || null;
    if (!clientVars) {
        try {
            const sessionSnap = await getDoc(sessionDocRef);
            if (sessionSnap.exists()) {
                const sData = sessionSnap.data() as FlowContactSession;
                if (sData.variables && Object.keys(sData.variables).length > 0) {
                    clientVars = sData.variables as Record<string, string>;
                    ctx.clientVariables = clientVars;
                }
            }
        } catch {}
    }

    // Substituição de todas as variáveis no texto
    const replaceVars = (str?: string) => {
        if (!str) return '';
        let result = str;
        if (clientVars) {
            for (const [key, val] of Object.entries(clientVars)) {
                const escapedKey = key.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
                const regex = new RegExp(`\\{${escapedKey}\\}`, 'gi');
                result = result.replace(regex, val || '');
            }
        }
        return result
            .replace(/\{nome\}/gi, ctx.contactName || 'Amigo(a)')
            .replace(/\{cliente\}/gi, ctx.contactName || 'Amigo(a)')
            .replace(/\{primeiro_nome\}/gi, (ctx.contactName || 'Amigo(a)').split(' ')[0])
            .replace(/\{telefone\}/gi, ctx.phoneNumber)
            .replace(/\{numero\}/gi, ctx.phoneNumber);
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
            currentNodeLabel: nodeData.label || 'Menu de Opções',
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

            // Atualiza sessão no Kanban como Em Atendimento Humano
            await setDoc(sessionDocRef, {
                status: 'support',
                currentNodeId: nodeId,
                currentNodeLabel: nodeData.label || 'Suporte Humano',
                lastInteractionAt: new Date().toISOString(),
            }, { merge: true });

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
                const targetNodes = targetFlow.nodes || [];
                const targetEdges = targetFlow.edges || [];

                // Identifica nó inicial do fluxo de destino (nó sem entrada ou primeiro nó)
                const targetNodeIds = new Set(targetEdges.map((e: any) => e.target));
                const startNode = targetNodes.find((n: any) => !targetNodeIds.has(n.id)) || targetNodes[0];

                if (startNode) {
                    await setDoc(sessionDocRef, {
                        flowId: nodeData.targetFlowId,
                        flowName: targetFlow.name || 'Fluxo Conectado',
                        currentNodeId: startNode.id,
                        currentNodeLabel: (startNode.data as any)?.label || 'Início',
                        lastInteractionAt: new Date().toISOString(),
                    }, { merge: true });

                    await executeFlowNode(ctx, targetFlow, startNode.id);
                }
            }
        } catch (err) {
            console.error('[FlowRunner] Erro ao transferir fluxo:', err);
        }
        return;
    }

    // 6. CONDIÇÃO (Verificar Cliente no CRM)
    if (nodeData.nodeType === 'condition') {
        console.log(`[FlowRunner] Verificando se ${ctx.phoneNumber} é cliente cadastrado no CRM...`);
        const client = await findClientByPhone(ctx.db, ctx.userId, ctx.phoneNumber);
        const isClient = !!client;

        console.log(`[FlowRunner] Resultado da verificação no CRM: isClient=${isClient} (Cliente: ${client?.name || 'Não cadastrado'})`);

        // Formata e salva as variáveis completas do cliente
        clientVars = formatClientVariables(client, ctx.contactName, ctx.phoneNumber);
        ctx.clientVariables = clientVars;
        ctx.clientData = client;

        // Atualiza sessão com os dados do cliente e variáveis
        await setDoc(
            sessionDocRef,
            {
                userId: ctx.userId,
                flowId: flow.id,
                currentNodeId: nodeId,
                currentNodeLabel: nodeData.label || 'Verificar Cliente CRM',
                variables: clientVars,
                isClient,
                contactName: client?.name || ctx.contactName || 'Cliente WhatsApp',
                lastInteractionAt: new Date().toISOString(),
            },
            { merge: true }
        );

        // Identifica qual saída seguir: is_client (Cliente Cadastrado) ou not_client (Não Cadastrado)
        const targetHandleId = isClient ? 'is_client' : 'not_client';
        let targetEdge = edges.find((e: any) => e.source === nodeId && e.sourceHandle === targetHandleId);

        // Fallback: se o usuário conectou a saída sem especificar handle
        if (!targetEdge) {
            targetEdge = edges.find((e: any) => e.source === nodeId);
        }

        if (targetEdge && targetEdge.target) {
            await executeFlowNode(ctx, flow, targetEdge.target);
        } else {
            console.log(`[FlowRunner] Fim do caminho após condição (${targetHandleId})`);
            await setDoc(
                sessionDocRef,
                {
                    status: 'completed',
                    lastInteractionAt: new Date().toISOString(),
                },
                { merge: true }
            );
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
    const rawOptions = menuData.menuOptions;
    const optionsList = Array.isArray(rawOptions)
        ? rawOptions
        : typeof rawOptions === 'object' && rawOptions !== null
        ? Object.values(rawOptions)
        : [];
    const options = optionsList.filter(Boolean).map((opt: any, idx: number) => {
        if (typeof opt === 'string') return { id: `opt_${idx + 1}`, label: opt, description: '' };
        return {
            id: String(opt.id || `opt_${idx + 1}`),
            label: String(opt.label || opt.text || opt.title || `Opção ${idx + 1}`),
            description: opt.description ? String(opt.description) : '',
        };
    });
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
