import { getFirestore, doc, getDoc, setDoc, updateDoc, collection, getDocs, query, where } from 'firebase/firestore';
import type { FlowDefinition, FlowNodeData, FlowContactSession, UazapiConnectionConfig, Settings, FlowVariablesConfig } from './types';
import { getOrCreateRenewalSession } from './renewal-service';

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

// Converte qualquer valor vindo do CRM (string, número, lista, objeto {value}) em string segura e já aparada
export function safeStr(v: any): string {
    if (v === undefined || v === null) return '';
    if (typeof v === 'string') return v.trim();
    if (typeof v === 'number' || typeof v === 'boolean') return String(v).trim();
    if (Array.isArray(v)) {
        return v
            .map((item) => safeStr(item))
            .filter(Boolean)
            .join(', ');
    }
    if (typeof v === 'object') {
        if (typeof v.value === 'string' || typeof v.value === 'number') return String(v.value).trim();
        if (typeof v.label === 'string') return v.label.trim();
        if (typeof v.name === 'string') return v.name.trim();
        return '';
    }
    return '';
}

// Retorna o primeiro valor não vazio (já convertido para string segura)
function firstStr(...vals: any[]): string {
    for (const v of vals) {
        const s = safeStr(v);
        if (s) return s;
    }
    return '';
}


// Cache em memória para busca de clientes por telefone (TTL 3 minutos)
const clientPhoneCache = new Map<string, { data: any; cachedAt: number }>();

export async function findClientByPhone(db: any, userId: string, rawPhone: string): Promise<any | null> {
    if (!rawPhone || !userId) return null;
    const digits = cleanPhone(rawPhone);
    if (!digits) return null;

    const cacheKey = `${userId}:${digits}`;
    const cached = clientPhoneCache.get(cacheKey);
    if (cached && (Date.now() - cached.cachedAt) < 180000) {
        return cached.data;
    }

    let local = digits.startsWith('55') && digits.length >= 12 ? digits.slice(2) : digits;
    let with9 = local;
    let without9 = local;
    if (local.length === 10) {
        with9 = local.slice(0, 2) + '9' + local.slice(2);
    } else if (local.length === 11 && local[2] === '9') {
        without9 = local.slice(0, 2) + local.slice(3);
    }

    const maskedWith9 = with9.length === 11 ? `(${with9.slice(0, 2)}) ${with9.slice(2, 7)}-${with9.slice(7)}` : '';
    const maskedWithout9 = without9.length === 10 ? `(${without9.slice(0, 2)}) ${without9.slice(2, 6)}-${without9.slice(6)}` : '';
    const maskedWithSpace = with9.length === 11 ? `${with9.slice(0, 2)} ${with9.slice(2, 7)}-${with9.slice(7)}` : '';

    const candidates = [
        rawPhone,
        digits,
        local,
        with9,
        without9,
        `55${local}`,
        `55${with9}`,
        `55${without9}`,
        `+55${local}`,
        `+55${with9}`,
        `+55${without9}`,
        maskedWith9,
        maskedWithout9,
        maskedWithSpace,
    ];
    const uniqueCandidates = Array.from(new Set(candidates.filter(Boolean)));

    const clientsCol = collection(db, 'users', userId, 'clients');
    const matchingDocsMap = new Map<string, any>();

    // 1. Busca direta por telefone exato (todas as variações em paralelo)
    const directResults = await Promise.all(
        uniqueCandidates.map(async (cand) => {
            try {
                const q = query(clientsCol, where('phone', '==', cand));
                return await getDocs(q);
            } catch {
                return null;
            }
        })
    );
    for (const snap of directResults) {
        if (!snap) continue;
        for (const d of snap.docs) {
            matchingDocsMap.set(d.id, { id: d.id, ...d.data() });
        }
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
        clientPhoneCache.set(cacheKey, { data: null, cachedAt: Date.now() });
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
                .map((c) => firstStr(c.subscription, c.plan, c.plano))
                .filter(Boolean)
        )
    );
    if (allSubs.length > 1) {
        mergedClient.allSubscriptions = allSubs.join(' + ');
    }

    mergedClient._allMatchingDocs = matchingList;
    clientPhoneCache.set(cacheKey, { data: mergedClient, cachedAt: Date.now() });
    return mergedClient;
}

export async function resolveRenewalLinkForClient(
    userId: string,
    client: any,
    originUrl = 'https://pjcrm.site'
): Promise<string> {
    if (!userId || !client) return '';
    try {
        const matchingDocs: any[] = Array.isArray(client._allMatchingDocs) && client._allMatchingDocs.length > 0
            ? client._allMatchingDocs
            : [client];
        const res = await getOrCreateRenewalSession(userId, matchingDocs, originUrl);
        return res?.link || '';
    } catch (err) {
        console.warn('[FlowRunner] Erro ao gerar link de renovação para o cliente:', err);
        return '';
    }
}

export function formatClientVariables(
    client: any,
    fallbackName?: string,
    fallbackPhone?: string,
    variablesConfig?: FlowVariablesConfig,
    renewalLink?: string
): Record<string, string> {
    if (!client) {
        const name = fallbackName || 'Amigo(a)';
        const activeEmptyMsg = variablesConfig?.activeSubsEmptyMessage || 'Nenhuma assinatura ativa encontrada.';
        const overdueEmptyMsg = variablesConfig?.overdueSubsEmptyMessage || 'Nenhuma assinatura vencida encontrada.';
        const allEmptyMsg = variablesConfig?.allSubsEmptyMessage || 'Nenhuma assinatura cadastrada.';

        return {
            nome: name,
            cliente: name,
            primeiro_nome: name.split(' ')[0] || name,
            telefone: fallbackPhone || '',
            numero: fallbackPhone || '',
            phone: fallbackPhone || '',
            status: 'Não cadastrado',
            plano: '',
            nome_assinatura: '',
            assinatura: '',
            subscription: '',
            metodo_pagamento: '',
            forma_pagamento: '',
            pagamento: '',
            payment_method: '',
            valor: '',
            mensalidade: '',
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
            link_de_acesso: '',
            access_link: '',
            link_renovacao: '',
            link_de_renovacao: '',
            link_renovar: '',
            link_pagamento: '',
            link_cobranca: '',
            quantidade: '',
            notas: '',
            observacoes: '',
            tipo_cliente: '',
            assinaturas_ativas: activeEmptyMsg,
            planos_ativos: activeEmptyMsg,
            assinaturas_vencidas: overdueEmptyMsg,
            planos_vencidos: overdueEmptyMsg,
            todas_assinaturas: allEmptyMsg,
            todas_as_assinaturas: allEmptyMsg,
            assinaturas_todas: allEmptyMsg,
            assinaturas: '',
            assinaturas_ativas_qtd: '0',
            qtd_assinaturas_ativas: '0',
            total_assinaturas_ativas: '0',
            numero_assinaturas_ativas: '0',
            num_assinaturas_ativas: '0',
            quantidade_assinaturas_ativas: '0',
            planos_ativos_qtd: '0',
            qtd_planos_ativos: '0',
            assinaturas_vencidas_qtd: '0',
            qtd_assinaturas_vencidas: '0',
            total_assinaturas_vencidas: '0',
            numero_assinaturas_vencidas: '0',
            num_assinaturas_vencidas: '0',
            quantidade_assinaturas_vencidas: '0',
            planos_vencidos_qtd: '0',
            qtd_planos_vencidos: '0',
            total_assinaturas: '0',
            qtd_assinaturas: '0',
            quantidade_assinaturas: '0',
            numero_assinaturas: '0',
            todas_assinaturas_qtd: '0',
            qtd_todas_assinaturas: '0',
        };
    }

    const fullName = firstStr(client.name, fallbackName) || 'Cliente';
    const firstName = fullName.split(' ')[0] || fullName;
    const phone = firstStr(client.phone, fallbackPhone);

    // Extrair email com segurança (suporta array de strings, array de objetos {value: string}, ou string direta)
    const emailStr = firstStr(client.email, client.emails, client.login);

    // Primeiro e-mail (caso seja lista) ou o e-mail completo
    const firstEmail = emailStr.split(',')[0]?.trim() || emailStr;

    // Senha da conta
    const password = firstStr(client.password, client.senha, client.pass);

    // Tela de acesso
    const screen = firstStr(client.screen, client.tela);

    // PIN da tela
    const pinScreen = firstStr(client.pinScreen, client.pin_tela, client.pin);

    // Plano / Assinatura (busca nas chaves subscription, plan, plano ou allSubscriptions)
    const planName = firstStr(
        client.subscription,
        client.plan,
        client.plano,
        client.subscriptionName,
        client.produto,
        client.product,
        client.allSubscriptions
    );

    // Método de pagamento
    const paymentMethod = firstStr(
        client.paymentMethod,
        client.metodo_pagamento,
        client.forma_pagamento,
        client.formaPagamento,
        client.pagamento
    );

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
    const accessLink = firstStr(client.accessLink, client.link, client.link_acesso);

    // Status
    const statusStr = safeStr(client.status) || 'Ativo';

    // Quantidade
    const quantityStr = client.quantity ? String(client.quantity) : '';

    // Observações / Notas
    const notesStr = firstStr(client.notes, client.observacoes, client.obs);

    // Tipo de cliente
    const clientTypeStr = safeStr(client.clientType);

    const matchingDocs: any[] = Array.isArray(client._allMatchingDocs) && client._allMatchingDocs.length > 0
        ? client._allMatchingDocs
        : [client];

    // Helper para formatar cada item de assinatura (usando template customizado se configurado)
    const formatSingleSub = (c: any, customTemplate?: string, defaultWithStatus = false) => {
        if (customTemplate && customTemplate.trim()) {
            const planName = firstStr(c.subscription, c.plan, c.plano, c.subscriptionName, c.product, c.produto) || 'Assinatura';
            const statusVal = safeStr(c.status);
            const dueVal = formatDateSafe(c.dueDate);
            const daysVal = formatDaysRemaining(c.dueDate);
            let amountVal = '';
            if (c.amountPaid !== undefined && c.amountPaid !== null && String(c.amountPaid).trim() !== '') {
                const raw = String(c.amountPaid).trim();
                amountVal = raw.includes('R$') ? raw : `R$ ${raw}`;
            }
            const payMethod = firstStr(c.paymentMethod, c.formaPagamento);
            const emailVal = firstStr(c.email, c.emails);
            const passVal = firstStr(c.password, c.senha);
            const screenVal = firstStr(c.screen, c.tela);
            const pinVal = firstStr(c.pinScreen, c.pin);
            const linkVal = firstStr(c.accessLink, c.link, c.link_acesso);
            const notesVal = firstStr(c.notes, c.observacoes, c.obs);

            return customTemplate
                .replace(/\{plano\}/gi, planName)
                .replace(/\{nome_assinatura\}/gi, planName)
                .replace(/\{assinatura\}/gi, planName)
                .replace(/\{status\}/gi, statusVal)
                .replace(/\{vencimento\}/gi, dueVal)
                .replace(/\{data_vencimento\}/gi, dueVal)
                .replace(/\{dias_restantes\}/gi, daysVal)
                .replace(/\{valor\}/gi, amountVal)
                .replace(/\{mensalidade\}/gi, amountVal)
                .replace(/\{metodo_pagamento\}/gi, payMethod)
                .replace(/\{forma_pagamento\}/gi, payMethod)
                .replace(/\{email\}/gi, emailVal)
                .replace(/\{senha\}/gi, passVal)
                .replace(/\{tela\}/gi, screenVal)
                .replace(/\{pin_tela\}/gi, pinVal)
                .replace(/\{pin\}/gi, pinVal)
                .replace(/\{link_de_acesso\}/gi, linkVal)
                .replace(/\{link\}/gi, linkVal)
                .replace(/\{notas\}/gi, notesVal)
                .replace(/\{observacoes\}/gi, notesVal);
        }

        const name = firstStr(c.subscription, c.plan, c.plano, c.subscriptionName, c.product, c.produto) || 'Assinatura';
        const parts: string[] = [];
        if (defaultWithStatus && safeStr(c.status)) {
            parts.push(safeStr(c.status));
        }
        const due = formatDateSafe(c.dueDate);
        if (due) {
            parts.push(`Vencimento: ${due}`);
        }
        if (c.amountPaid !== undefined && c.amountPaid !== null && String(c.amountPaid).trim() !== '') {
            const raw = String(c.amountPaid).trim();
            parts.push(raw.includes('R$') ? raw : `R$ ${raw}`);
        }
        if (parts.length > 0) {
            return `• ${name} (${parts.join(' - ')})`;
        }
        return `• ${name}`;
    };

    // Assinaturas ativas
    const activeDocs = matchingDocs.filter((c) => {
        const st = safeStr(c.status).toLowerCase();
        if (st === 'ativo' || st === 'active') return true;
        if (st === 'vencido' || st === 'cancelado') return false;
        const dueMs = getTimestampMs(c.dueDate);
        if (dueMs) return dueMs >= Date.now();
        return true;
    });

    // Assinaturas vencidas
    const overdueDocs = matchingDocs.filter((c) => {
        const st = safeStr(c.status).toLowerCase();
        if (st === 'vencido' || st === 'expired' || st === 'atrasado') return true;
        if (st === 'ativo') return false;
        const dueMs = getTimestampMs(c.dueDate);
        if (dueMs) return dueMs < Date.now();
        return false;
    });

    const activeSubsList = activeDocs.length > 0
        ? activeDocs.map((c) => formatSingleSub(c, variablesConfig?.activeSubsTemplate, false)).join('\n')
        : (variablesConfig?.activeSubsEmptyMessage || 'Nenhuma assinatura ativa encontrada.');

    const overdueSubsList = overdueDocs.length > 0
        ? overdueDocs.map((c) => formatSingleSub(c, variablesConfig?.overdueSubsTemplate, false)).join('\n')
        : (variablesConfig?.overdueSubsEmptyMessage || 'Nenhuma assinatura vencida encontrada.');

    const allSubsList = matchingDocs.length > 0
        ? matchingDocs.map((c) => formatSingleSub(c, variablesConfig?.allSubsTemplate, true)).join('\n')
        : (variablesConfig?.allSubsEmptyMessage || 'Nenhuma assinatura cadastrada.');

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
        nome_assinatura: planName,
        assinatura: planName,
        subscription: planName,

        // Método de pagamento
        metodo_pagamento: paymentMethod,
        forma_pagamento: paymentMethod,
        pagamento: paymentMethod,
        payment_method: paymentMethod,

        // Valor e Mensalidade
        valor: amountStr,
        mensalidade: amountStr,
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
        link_de_acesso: accessLink,
        access_link: accessLink,

        // Link de Renovação / Pagamento Dinâmico
        link_renovacao: renewalLink || '',
        link_de_renovacao: renewalLink || '',
        link_renovar: renewalLink || '',
        link_pagamento: renewalLink || '',
        link_cobranca: renewalLink || '',

        // Extras
        quantidade: quantityStr,
        notas: notesStr,
        observacoes: notesStr,
        tipo_cliente: clientTypeStr,

        // Listas de Assinaturas (Novas Variáveis)
        assinaturas_ativas: activeSubsList,
        planos_ativos: activeSubsList,
        assinaturas_vencidas: overdueSubsList,
        planos_vencidos: overdueSubsList,
        todas_assinaturas: allSubsList,
        todas_as_assinaturas: allSubsList,
        assinaturas_todas: allSubsList,
        assinaturas: matchingDocs.length > 1 ? allSubsList : planName,

        // Quantidades numéricas de assinaturas (úteis para menus e detalhes)
        assinaturas_ativas_qtd: String(activeDocs.length),
        qtd_assinaturas_ativas: String(activeDocs.length),
        total_assinaturas_ativas: String(activeDocs.length),
        numero_assinaturas_ativas: String(activeDocs.length),
        num_assinaturas_ativas: String(activeDocs.length),
        quantidade_assinaturas_ativas: String(activeDocs.length),
        planos_ativos_qtd: String(activeDocs.length),
        qtd_planos_ativos: String(activeDocs.length),

        assinaturas_vencidas_qtd: String(overdueDocs.length),
        qtd_assinaturas_vencidas: String(overdueDocs.length),
        total_assinaturas_vencidas: String(overdueDocs.length),
        numero_assinaturas_vencidas: String(overdueDocs.length),
        num_assinaturas_vencidas: String(overdueDocs.length),
        quantidade_assinaturas_vencidas: String(overdueDocs.length),
        planos_vencidos_qtd: String(overdueDocs.length),
        qtd_planos_vencidos: String(overdueDocs.length),

        total_assinaturas: String(matchingDocs.length),
        qtd_assinaturas: String(matchingDocs.length),
        quantidade_assinaturas: String(matchingDocs.length),
        numero_assinaturas: String(matchingDocs.length),
        todas_assinaturas_qtd: String(matchingDocs.length),
        qtd_todas_assinaturas: String(matchingDocs.length),
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
        const phone = formatPhoneWith55(ctx.phoneNumber);
        const headers = {
            'Content-Type': 'application/json',
            'token': ctx.instanceToken,
            'apikey': ctx.instanceToken,
        };

        // Endpoint oficial da Uazapi: POST /message/presence
        const res = await fetch(`${base}/message/presence`, {
            method: 'POST',
            headers,
            body: JSON.stringify({
                number: phone,
                presence,
            }),
        });

        if (res.ok) {
            return true;
        }

        // Fallback para variantes legadas de gateway
        const fallbackRes = await fetch(`${base}/send/presence`, {
            method: 'POST',
            headers,
            body: JSON.stringify({
                number: phone,
                presence,
            }),
        });
        return fallbackRes.ok;
    } catch (err) {
        console.error('[sendUazapiPresence] error:', err);
        return false;
    }
}

export async function sendUazapiContact(
    ctx: FlowRunnerContext,
    fullName: string,
    phoneNumber: string,
    organization?: string
): Promise<boolean> {
    try {
        const base = cleanServerUrl(ctx.serverUrl);
        const recipientPhone = formatPhoneWith55(ctx.phoneNumber);
        const contactFormattedPhone = formatPhoneWith55(cleanPhone(phoneNumber));

        const res = await fetch(`${base}/send/contact`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'token': ctx.instanceToken,
                'apikey': ctx.instanceToken,
            },
            body: JSON.stringify({
                number: recipientPhone,
                fullName: fullName.trim() || 'Contato',
                phoneNumber: contactFormattedPhone,
                organization: organization?.trim() || '',
            }),
        });

        if (!res.ok) {
            const errTxt = await res.text().catch(() => '');
            console.warn(`[sendUazapiContact] Falha ao enviar via /send/contact (${res.status}): ${errTxt}. Enviando fallback em texto.`);
            const fallbackText = `👤 *Contato:*\n*Nome:* ${fullName.trim()}\n*WhatsApp:* https://wa.me/${contactFormattedPhone}`;
            return await sendUazapiText(ctx, fallbackText);
        }

        return true;
    } catch (err) {
        console.error('[sendUazapiContact] error:', err);
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
                    msg += `*${idx + 1}* - ${opt.label}${opt.description ? ` (${opt.description})` : ''}\n`;
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
            if (!clientVars && ctx.phoneNumber) {
                // Tenta carregar do CRM automaticamente com as configurações customizadas de variáveis
                const client = await findClientByPhone(ctx.db, ctx.userId, ctx.phoneNumber);
                let varCfg: FlowVariablesConfig | undefined = undefined;
                try {
                    const varDoc = await getDoc(doc(ctx.db, 'users', ctx.userId, 'settings', 'flow_variables'));
                    if (varDoc.exists()) {
                        varCfg = varDoc.data() as FlowVariablesConfig;
                    }
                } catch {}
                let renewalLink = '';
                if (client) {
                    renewalLink = await resolveRenewalLinkForClient(ctx.userId, client);
                }
                clientVars = formatClientVariables(client, ctx.contactName, ctx.phoneNumber, varCfg, renewalLink);
                ctx.clientVariables = clientVars;
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

    // 0. START (Ponto de Partida / Início do Fluxo)
    if (nodeData.nodeType === 'start') {
        const nextEdge = edges.find((e: any) => e.source === nodeId);
        if (nextEdge && nextEdge.target) {
            await executeFlowNode(ctx, flow, nextEdge.target);
        } else {
            console.log(`[FlowRunner] Nó de início ${nodeId} não possui saída conectada.`);
        }
        return;
    }

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
        const rawOptions = nodeData.menuOptions;
        const optionsList = Array.isArray(rawOptions)
            ? rawOptions
            : typeof rawOptions === 'object' && rawOptions !== null
            ? Object.values(rawOptions)
            : [];
        const processedOptions = optionsList.map((opt: any, idx: number) => {
            if (typeof opt === 'string') return replaceVars(opt);
            return {
                ...opt,
                id: String(opt.id || `opt_${idx + 1}`),
                label: replaceVars(opt.label || opt.text || opt.title || `Opção ${idx + 1}`),
                description: opt.description ? replaceVars(opt.description) : '',
            };
        });

        await sendUazapiMenu(ctx, {
            ...nodeData,
            menuQuestionText: replaceVars(nodeData.menuQuestionText),
            menuOptions: processedOptions,
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
        let totalSeconds = nodeData.delaySeconds || 3;
        if (nodeData.delayUnit === 'hours') {
            totalSeconds = (nodeData.delayValue || 1) * 3600;
        } else if (nodeData.delayUnit === 'minutes') {
            totalSeconds = (nodeData.delayValue || 1) * 60;
        } else if (nodeData.delayValue) {
            totalSeconds = nodeData.delayValue;
        }

        const seconds = Math.min(Math.max(totalSeconds, 1), 30);
        const presence = (nodeData.delayPresence || 'composing') as 'composing' | 'recording' | 'none';

        if (presence !== 'none') {
            await sendUazapiPresence(ctx, presence);
        }

        // Aguarda os segundos definidos, renovando a presença no WhatsApp a cada 4 segundos
        if (seconds > 4 && presence !== 'none') {
            let elapsed = 0;
            while (elapsed < seconds) {
                const step = Math.min(4, seconds - elapsed);
                await new Promise((resolve) => setTimeout(resolve, step * 1000));
                elapsed += step;
                if (elapsed < seconds) {
                    await sendUazapiPresence(ctx, presence).catch(() => {});
                }
            }
        } else {
            await new Promise((resolve) => setTimeout(resolve, seconds * 1000));
        }

        const nextEdge = edges.find((e: any) => e.source === nodeId);
        if (nextEdge && nextEdge.target) {
            await executeFlowNode(ctx, flow, nextEdge.target);
        } else if (presence !== 'none') {
            await sendUazapiPresence(ctx, 'paused').catch(() => {});
        }
        return;
    }

    // 4. AÇÃO
    if (nodeData.nodeType === 'action') {
        if (nodeData.actionType === 'send_contact') {
            const rawName = nodeData.contactCardName || 'Contato';
            const rawPhone = nodeData.contactCardPhone || '';
            const rawOrg = nodeData.contactCardOrganization || '';

            const contactName = replaceVars(rawName);
            const contactPhone = replaceVars(rawPhone);
            const contactOrg = rawOrg ? replaceVars(rawOrg) : undefined;

            if (contactPhone) {
                console.log(`[FlowRunner] Enviando card de contato para ${ctx.phoneNumber}: ${contactName} (${contactPhone})`);
                await sendUazapiContact(ctx, contactName, contactPhone, contactOrg);
            } else {
                console.warn(`[FlowRunner] Ação send_contact no nó ${nodeId} não possui telefone configurado.`);
            }

            if (nodeData.text) {
                await sendUazapiText(ctx, replaceVars(nodeData.text));
            }
        } else if (nodeData.actionType === 'open_support') {
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

                // Identifica nó inicial do fluxo de destino (prioriza nó start, depois nó sem entrada ou primeiro nó)
                const explicitStartNode = targetNodes.find((n: any) => n.data?.nodeType === 'start');
                const targetNodeIds = new Set(targetEdges.map((e: any) => e.target));
                const startNode = explicitStartNode || targetNodes.find((n: any) => !targetNodeIds.has(n.id)) || targetNodes[0];

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
        let client: any = null;
        try {
            client = await findClientByPhone(ctx.db, ctx.userId, ctx.phoneNumber);
        } catch (err) {
            console.error('[FlowRunner] Erro ao buscar cliente no CRM:', err);
        }
        const isClient = !!client;

        console.log(`[FlowRunner] Resultado da verificação no CRM: isClient=${isClient} (Cliente: ${client?.name || 'Não cadastrado'})`);

        // Busca configurações customizadas de variáveis, se houver
        let varCfg: FlowVariablesConfig | undefined = undefined;
        try {
            const varDoc = await getDoc(doc(ctx.db, 'users', ctx.userId, 'settings', 'flow_variables'));
            if (varDoc.exists()) {
                varCfg = varDoc.data() as FlowVariablesConfig;
            }
        } catch {}

        let renewalLink = '';
        if (client) {
            renewalLink = await resolveRenewalLinkForClient(ctx.userId, client);
        }

        // Formata e salva as variáveis completas do cliente
        // (se algum dado do CRM vier em formato inesperado, não deixa o fluxo travar)
        try {
            clientVars = formatClientVariables(client, ctx.contactName, ctx.phoneNumber, varCfg, renewalLink);
        } catch (err) {
            console.error('[FlowRunner] Erro ao formatar variáveis do cliente, usando fallback básico:', err);
            clientVars = formatClientVariables(null, client?.name || ctx.contactName, ctx.phoneNumber, varCfg, renewalLink);
            if (client) {
                clientVars.status = 'Ativo';
            }
        }
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
            targetEdge = edges.find((e: any) => e.source === nodeId && !e.sourceHandle);
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

// Helper de sanitização de texto para comparação ultra-resiliente
const sanitizeOptionText = (str: string) => {
    return (str || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '') // remove acentos
        .replace(/[\p{Emoji}\p{Symbol}\p{Punctuation}\s]/gu, '') // remove emojis, símbolos, pontuações e espaços
        .trim();
};

/**
 * Trata resposta do usuário quando ele já está em um menu esperando input
 */
export async function handleUserMenuResponse(
    ctx: FlowRunnerContext,
    session: FlowContactSession,
    userText: string,
    selectedButtonId?: string,
    selectedIndex?: number
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
        if (typeof opt === 'string') return { id: `opt_${idx + 1}`, label: opt, description: '', index: idx };
        return {
            id: String(opt.id || `opt_${idx + 1}`),
            label: String(opt.label || opt.text || opt.title || `Opção ${idx + 1}`),
            description: opt.description ? String(opt.description) : '',
            index: idx,
        };
    });

    if (options.length === 0) return false;

    const rawInput = (userText || '').trim();
    const btnId = (selectedButtonId || '').trim();

    // Se não há nenhum input, retorna false imediatamente para evitar falsos positivos
    if (!rawInput && !btnId && selectedIndex === undefined) {
        return false;
    }

    let matchedOption: typeof options[0] | null = null;

    // 1. Correspondência direta por selectedButtonId (clique no botão do WhatsApp UazAPI)
    if (btnId) {
        matchedOption = options.find((opt) => opt.id.toLowerCase() === btnId.toLowerCase()) || null;
        if (!matchedOption) {
            // Se o botão ID foi enviado como índice (ex: "opt_1", "1")
            const numFromBtn = parseInt(btnId.replace(/\D/g, ''));
            if (!isNaN(numFromBtn) && numFromBtn >= 1 && numFromBtn <= options.length) {
                matchedOption = options[numFromBtn - 1];
            }
        }
    }

    // 2. Correspondência direta por selectedIndex do payload do WhatsApp
    if (!matchedOption && selectedIndex !== undefined && selectedIndex !== null && selectedIndex >= 0 && selectedIndex < options.length) {
        matchedOption = options[selectedIndex];
    }

    // 3. Correspondência por número digitado ("1", "2", "3")
    if (!matchedOption && rawInput) {
        const numIdx = parseInt(rawInput);
        if (!isNaN(numIdx) && numIdx >= 1 && numIdx <= options.length && String(numIdx) === rawInput) {
            matchedOption = options[numIdx - 1];
        }
    }

    // 4. Correspondência exata por ID ou pelo texto exato da opção
    if (!matchedOption && rawInput) {
        const lowerInput = rawInput.toLowerCase();
        matchedOption = options.find(
            (opt) => opt.id.toLowerCase() === lowerInput || opt.label.trim().toLowerCase() === lowerInput
        ) || null;
    }

    // 5. Correspondência por texto sanitizado (ignora emojis, espaços extras, acentos e pontuação)
    if (!matchedOption && rawInput) {
        const cleanInput = sanitizeOptionText(rawInput);
        if (cleanInput.length >= 2) {
            // Match exato no texto limpo
            matchedOption = options.find((opt) => sanitizeOptionText(opt.label) === cleanInput) || null;

            // Se ainda não achou e o texto tem ao menos 4 caracteres úteis, tenta inclusão
            if (!matchedOption && cleanInput.length >= 4) {
                matchedOption = options.find((opt) => {
                    const cleanOpt = sanitizeOptionText(opt.label);
                    return cleanOpt.length >= 4 && (cleanOpt.includes(cleanInput) || cleanInput.includes(cleanOpt));
                }) || null;
            }
        }
    }

    // Se nenhuma opção foi correspondida, retorna false
    if (!matchedOption) {
        console.log(`[FlowRunner] Nenhuma opção do menu "${currentNode.id}" correspondeu ao input: "${rawInput}" (btnId: "${btnId}")`);
        return false;
    }

    const edges = flow.edges || [];
    const nodeEdges = edges.filter((e: any) => e.source === currentNode.id);

    // Procura aresta específica conectada à saída desta opção
    let targetEdge = nodeEdges.find((e: any) => e.sourceHandle === matchedOption!.id);

    // Fallback 1: se não achou por opt.id, tenta pelo índice "opt_1", "opt_2", etc.
    if (!targetEdge) {
        const fallbackHandle = `opt_${matchedOption!.index + 1}`;
        targetEdge = nodeEdges.find((e: any) => e.sourceHandle === fallbackHandle);
    }

    // Fallback 2: tenta pelo número "1", "2", etc.
    if (!targetEdge) {
        targetEdge = nodeEdges.find((e: any) => e.sourceHandle === String(matchedOption!.index + 1));
    }

    const sessionDocRef = doc(ctx.db, 'users', ctx.userId, 'flow_sessions', session.phoneNumber);

    if (targetEdge && targetEdge.target) {
        console.log(`[FlowRunner] Opção "${matchedOption.label}" selecionada com sucesso. Avançando para o bloco: ${targetEdge.target}`);
        // Encontrou o próximo nó conectado à saída desta opção! Executa-o
        await executeFlowNode(ctx, flow, targetEdge.target);
        return true;
    }

    // Se o cliente escolheu uma opção válida, mas NÃO há bloco conectado a essa opção específica:
    // O fluxo para por aqui (nunca deve saltar para um bloco aleatório ou de outra opção!)
    console.warn(`[FlowRunner] Opção "${matchedOption.label}" selecionada no nó "${currentNode.id}", mas NÃO há bloco conectado a esta saída. Encerrando sessão.`);
    await setDoc(sessionDocRef, {
        status: 'completed',
        lastInteractionAt: new Date().toISOString(),
    }, { merge: true });
    return true;
}
