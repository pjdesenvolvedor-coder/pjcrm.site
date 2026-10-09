'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import type { Node, Edge } from '@xyflow/react';
import type { FlowNodeData, FlowVariablesConfig } from '@/lib/types';
import { useFirebase, useDoc, useMemoFirebase } from '@/firebase';
import { doc } from 'firebase/firestore';
import {
    ArrowLeft,
    Phone,
    Video,
    MoreVertical,
    Paperclip,
    Smile,
    Send,
    Mic,
    RotateCcw,
    X,
    Check,
    CheckCheck,
    Sparkles,
    Smartphone,
    Play,
    Pause,
    FileText,
    Image as ImageIcon,
    Volume2,
    Grid,
    ListFilter,
    ChevronRight,
    AlertCircle,
    Info,
    UserCheck,
    UserX,
    MessageSquare,
    ExternalLink,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

export interface FlowWhatsAppSimulatorProps {
    open: boolean;
    onClose: () => void;
    nodes: Node[];
    edges: Edge[];
    flowName: string;
    onOpenRealTest?: () => void;
    clients?: any[];
}

interface SimMessage {
    id: string;
    sender: 'bot' | 'user' | 'system';
    nodeId?: string;
    nodeType?: string;
    text?: string;
    contentType?: 'text' | 'image' | 'audio' | 'video' | 'document';
    mediaUrl?: string;
    menuData?: {
        menuType?: 'list' | 'button' | 'numeric';
        menuQuestionText?: string;
        menuButtonTitle?: string;
        menuFooterText?: string;
        menuOptions?: Array<{ id: string; label: string; description?: string; type?: 'reply' | 'url'; url?: string }>;
    };
    contactCard?: {
        name: string;
        phone: string;
        organization?: string;
    };
    time: string;
}

function sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function getCurrentTime() {
    const d = new Date();
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}
function normalizeMenuOptions(options: any): Array<{ id: string; label: string; description?: string; type?: 'reply' | 'url'; url?: string }> {
    if (!options) return [];
    const list = Array.isArray(options)
        ? options
        : typeof options === 'object' && options !== null
        ? Object.values(options)
        : [];
    return list.filter(Boolean).map((opt: any, idx: number) => {
        if (typeof opt === 'string') return { id: String(idx + 1), label: opt, description: '', type: 'reply', url: '' };
        const isUrl = opt.type === 'url';
        return {
            id: String(opt.id || idx + 1),
            label: String(opt.label || opt.text || opt.title || `Opção ${idx + 1}`),
            description: opt.description ? String(opt.description) : '',
            type: isUrl ? 'url' : 'reply',
            url: isUrl && opt.url ? String(opt.url) : '',
        };
    });
}

const sanitizeOptionText = (str: string) => {
    return (str || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[\p{Emoji}\p{Symbol}\p{Punctuation}\s]/gu, '')
        .trim();
};

function getClientPhone(c: any): string {
    if (!c || typeof c !== 'object') return '';
    return (
        c.phone ||
        c.telefone ||
        c.whatsapp ||
        c.cellphone ||
        c.celular ||
        c.numero ||
        c.contact ||
        c.number ||
        ''
    );
}

function getPhoneVariations(phone: string): string[] {
    const d = (phone || '').replace(/\D/g, '');
    if (!d) return [];
    const set = new Set<string>();
    set.add(d);

    const withoutCountry = d.startsWith('55') && d.length >= 10 ? d.slice(2) : d;
    set.add(withoutCountry);

    if (!d.startsWith('55')) {
        set.add('55' + d);
    }

    if (withoutCountry.length === 10) {
        const with9 = withoutCountry.slice(0, 2) + '9' + withoutCountry.slice(2);
        set.add(with9);
        set.add('55' + with9);
    } else if (withoutCountry.length === 11 && withoutCountry[2] === '9') {
        const without9 = withoutCountry.slice(0, 2) + withoutCountry.slice(3);
        set.add(without9);
        set.add('55' + without9);
    }

    if (d.length >= 8) {
        set.add(d.slice(-8));
    }

    return Array.from(set);
}

function matchesPhone(raw1: string, raw2: string): boolean {
    const d1 = (raw1 || '').replace(/\D/g, '');
    const d2 = (raw2 || '').replace(/\D/g, '');
    if (!d1 || !d2) return false;
    if (d1 === d2) return true;

    const vars1 = getPhoneVariations(raw1);
    const vars2 = getPhoneVariations(raw2);

    for (const v1 of vars1) {
        if (vars2.includes(v1)) return true;
    }

    const w1 = d1.startsWith('55') && d1.length >= 10 ? d1.slice(2) : d1;
    const w2 = d2.startsWith('55') && d2.length >= 10 ? d2.slice(2) : d2;
    if (w1.length >= 10 && w2.length >= 10) {
        const ddd1 = w1.slice(0, 2);
        const ddd2 = w2.slice(0, 2);
        const last8_1 = w1.slice(-8);
        const last8_2 = w2.slice(-8);
        if (ddd1 === ddd2 && last8_1 === last8_2) return true;
    }

    return false;
}

export function FlowWhatsAppSimulator({
    open,
    onClose,
    nodes,
    edges,
    flowName,
    onOpenRealTest,
    clients,
}: FlowWhatsAppSimulatorProps) {
    const [messages, setMessages] = useState<SimMessage[]>([]);
    const [isTyping, setIsTyping] = useState(false);
    const [typingText, setTypingText] = useState<'digitando...' | 'gravando áudio...'>('digitando...');
    const [activeMenuNodeId, setActiveMenuNodeId] = useState<string | null>(null);
    const [isListDrawerOpen, setIsListDrawerOpen] = useState(false);
    const [currentDrawerMenu, setCurrentDrawerMenu] = useState<{
        nodeId: string;
        title: string;
        options: Array<{ id: string; label: string; description?: string }>;
    } | null>(null);
    const [currentNotice, setCurrentNotice] = useState<string | null>(null);
    const [inputMessage, setInputMessage] = useState('');

    const messagesEndRef = useRef<HTMLDivElement>(null);
    const executionRef = useRef<{ isCancelled: boolean }>({ isCancelled: false });

    // Modo de teste para verificação de cliente CRM: 'registered' (Cadastrado) ou 'unregistered' (Não Cadastrado)
    const [clientTestMode, setClientTestMode] = useState<'registered' | 'unregistered'>('registered');
    const clientTestModeRef = useRef<'registered' | 'unregistered'>('registered');
    clientTestModeRef.current = clientTestMode;

    // Telefone específico digitado pelo usuário para testar dados reais de um cliente do CRM no preview
    const [testPhoneNumber, setTestPhoneNumber] = useState('');
    const testPhoneNumberRef = useRef(testPhoneNumber);
    testPhoneNumberRef.current = testPhoneNumber;

    // Snapshot isolado e estável dos nós e arestas ativos no preview para evitar bugs enquanto edita no Canva
    const [activeNodes, setActiveNodes] = useState<Node[]>(nodes);
    const [activeEdges, setActiveEdges] = useState<Edge[]>(edges);
    const activeNodesRef = useRef<Node[]>(nodes);
    const activeEdgesRef = useRef<Edge[]>(edges);

    // Guarda as alterações mais recentes recebidas do Canva
    const latestPropsRef = useRef({ nodes, edges });
    useEffect(() => {
        latestPropsRef.current = { nodes, edges };
    }, [nodes, edges]);

    // Busca cliente específico no CRM pelo telefone digitado no preview (reconhece variações brasileiras com/sem 55, com/sem 9)
    const customMatchedClient = React.useMemo(() => {
        const cleanInput = (testPhoneNumber || '').replace(/\D/g, '');
        if (!cleanInput || !clients || clients.length === 0) return null;
        return clients.find((c: any) => matchesPhone(cleanInput, getClientPhone(c))) || null;
    }, [testPhoneNumber, clients]);

    // Encontra o melhor cliente ativo da base do CRM para testar caso não tenha digitado um número específico
    const sampleClient = React.useMemo(() => {
        if (!clients || clients.length === 0) return null;
        return clients.find((c: any) => c.status === 'Ativo') || clients[0];
    }, [clients]);

    const { firestore, effectiveUserId } = useFirebase();
    const varConfigRef = useMemoFirebase(() => {
        if (!effectiveUserId) return null;
        return doc(firestore, 'users', effectiveUserId, 'settings', 'flow_variables');
    }, [firestore, effectiveUserId]);
    const { data: varConfig } = useDoc<FlowVariablesConfig>(varConfigRef);

    // Rola para a última mensagem automaticamente
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages, isTyping, currentNotice]);

    // Executa um nó com fidelidade total ao fluxo
    const executeNode = useCallback(
        async (nodeId: string) => {
            if (executionRef.current.isCancelled) return;

            const currentNodes = activeNodesRef.current;
            const currentEdges = activeEdgesRef.current;

            const phoneInput = testPhoneNumberRef.current.trim();
            const cleanInput = phoneInput.replace(/\D/g, '');

            let matchedCustomClient: any = null;
            if (cleanInput && clients && clients.length > 0) {
                matchedCustomClient = clients.find((c: any) => matchesPhone(cleanInput, getClientPhone(c))) || null;
            }

            const isRegistered = matchedCustomClient
                ? clientTestModeRef.current !== 'unregistered'
                : clientTestModeRef.current === 'registered';

            const simulatedClient = {
                id: 'sim_cli_123',
                name: 'Pedro Henrique',
                phone: phoneInput || '5577998413534',
                subscription: 'Plano Completo VIP',
                status: 'Ativo',
                amountPaid: '35,00',
                dueDate: new Date(Date.now() + 15 * 86400000),
                email: 'cliente@email.com',
                password: 'senha_secreta',
                screen: 'Tela 1',
                pinScreen: '1234',
                paymentMethod: 'PIX',
                accessLink: 'https://pjcrm.site/acesso',
                notes: 'Cliente VIP',
            };

            const activeClient = matchedCustomClient || sampleClient || simulatedClient;

            const node = currentNodes.find((n) => n.id === nodeId);
            if (!node) {
                setCurrentNotice('Nó não encontrado no fluxo.');
                return;
            }

            const data = node.data as FlowNodeData;

            const formatText = (txt?: string) => {
                if (!txt) return '';

                if (!isRegistered) {
                    const fallbackName = 'Visitante';
                    const activeEmpty = varConfig?.activeSubsEmptyMessage || 'Nenhuma assinatura ativa encontrada.';
                    const overdueEmpty = varConfig?.overdueSubsEmptyMessage || 'Nenhuma assinatura vencida encontrada.';
                    const allEmpty = varConfig?.allSubsEmptyMessage || 'Nenhuma assinatura cadastrada.';

                    return txt
                        .replace(/\{nome\}/gi, fallbackName)
                        .replace(/\{cliente\}/gi, fallbackName)
                        .replace(/\{primeiro_nome\}/gi, 'Visitante')
                        .replace(/\{telefone\}/gi, phoneInput || '5511999999999')
                        .replace(/\{numero\}/gi, phoneInput || '5511999999999')
                        .replace(/\{phone\}/gi, phoneInput || '5511999999999')
                        .replace(/\{vencimento\}/gi, '')
                        .replace(/\{data_vencimento\}/gi, '')
                        .replace(/\{dias_restantes\}/gi, '')
                        .replace(/\{status\}/gi, 'Não cadastrado')
                        .replace(/\{plano\}/gi, '')
                        .replace(/\{nome_assinatura\}/gi, '')
                        .replace(/\{assinatura\}/gi, '')
                        .replace(/\{subscription\}/gi, '')
                        .replace(/\{email\}/gi, '')
                        .replace(/\{e-mail\}/gi, '')
                        .replace(/\{senha\}/gi, '')
                        .replace(/\{password\}/gi, '')
                        .replace(/\{tela\}/gi, '')
                        .replace(/\{screen\}/gi, '')
                        .replace(/\{pin_tela\}/gi, '')
                        .replace(/\{pin\}/gi, '')
                        .replace(/\{metodo_pagamento\}/gi, '')
                        .replace(/\{forma_pagamento\}/gi, '')
                        .replace(/\{pagamento\}/gi, '')
                        .replace(/\{valor\}/gi, '')
                        .replace(/\{mensalidade\}/gi, '')
                        .replace(/\{valor_pago\}/gi, '')
                        .replace(/\{link\}/gi, '')
                        .replace(/\{link_acesso\}/gi, '')
                        .replace(/\{link_de_acesso\}/gi, '')
                        .replace(/\{link_renovacao\}/gi, '')
                        .replace(/\{link_de_renovacao\}/gi, '')
                        .replace(/\{link_renovar\}/gi, '')
                        .replace(/\{link_pagamento\}/gi, '')
                        .replace(/\{link_cobranca\}/gi, '')
                        .replace(/\{notas\}/gi, '')
                        .replace(/\{observacoes\}/gi, '')
                        .replace(/\{assinaturas_ativas\}/gi, activeEmpty)
                        .replace(/\{planos_ativos\}/gi, activeEmpty)
                        .replace(/\{assinaturas_vencidas\}/gi, overdueEmpty)
                        .replace(/\{planos_vencidos\}/gi, overdueEmpty)
                        .replace(/\{todas_assinaturas\}/gi, allEmpty)
                        .replace(/\{todas_as_assinaturas\}/gi, allEmpty)
                        .replace(/\{assinaturas\}/gi, '')
                        .replace(/\{assinaturas_ativas_qtd\}/gi, '0')
                        .replace(/\{qtd_assinaturas_ativas\}/gi, '0')
                        .replace(/\{total_assinaturas_ativas\}/gi, '0')
                        .replace(/\{numero_assinaturas_ativas\}/gi, '0')
                        .replace(/\{num_assinaturas_ativas\}/gi, '0')
                        .replace(/\{quantidade_assinaturas_ativas\}/gi, '0')
                        .replace(/\{planos_ativos_qtd\}/gi, '0')
                        .replace(/\{qtd_planos_ativos\}/gi, '0')
                        .replace(/\{assinaturas_vencidas_qtd\}/gi, '0')
                        .replace(/\{qtd_assinaturas_vencidas\}/gi, '0')
                        .replace(/\{total_assinaturas_vencidas\}/gi, '0')
                        .replace(/\{numero_assinaturas_vencidas\}/gi, '0')
                        .replace(/\{num_assinaturas_vencidas\}/gi, '0')
                        .replace(/\{quantidade_assinaturas_vencidas\}/gi, '0')
                        .replace(/\{planos_vencidos_qtd\}/gi, '0')
                        .replace(/\{qtd_planos_vencidos\}/gi, '0')
                        .replace(/\{total_assinaturas\}/gi, '0')
                        .replace(/\{qtd_assinaturas\}/gi, '0')
                        .replace(/\{quantidade_assinaturas\}/gi, '0')
                        .replace(/\{numero_assinaturas\}/gi, '0')
                        .replace(/\{todas_assinaturas_qtd\}/gi, '0')
                        .replace(/\{qtd_todas_assinaturas\}/gi, '0');
                }

                const cName = activeClient?.name || 'Pedro Henrique';
                const cFirstName = cName.split(' ')[0] || 'Pedro';
                const cPhone = getClientPhone(activeClient) || phoneInput || '5577998413534';

                let cEmail = 'cliente@email.com';
                if (activeClient?.email) {
                    if (Array.isArray(activeClient.email)) {
                        cEmail = activeClient.email[0] || 'cliente@email.com';
                    } else if (typeof activeClient.email === 'string') {
                        cEmail = activeClient.email;
                    }
                }

                const cPassword = activeClient?.password || activeClient?.senha || '123456';
                const cScreen = activeClient?.screen || activeClient?.tela || 'Tela 1';
                const cPinScreen = activeClient?.pinScreen || activeClient?.pin_tela || '8888';
                const cPlan = activeClient?.subscription || activeClient?.plan || activeClient?.plano || 'Plano Completo VIP';
                const cPayment = activeClient?.paymentMethod || activeClient?.metodo_pagamento || 'PIX';

                let cAmount = 'R$ 35,00';
                if (activeClient?.amountPaid) {
                    const raw = String(activeClient.amountPaid);
                    cAmount = raw.includes('R$') ? raw : `R$ ${raw}`;
                }

                let cDueDate = '15/10/2026';
                if (activeClient?.dueDate) {
                    try {
                        const d = typeof activeClient.dueDate.toDate === 'function'
                            ? activeClient.dueDate.toDate()
                            : typeof activeClient.dueDate === 'string' && activeClient.dueDate.includes('T')
                            ? new Date(activeClient.dueDate)
                            : typeof activeClient.dueDate === 'string' && activeClient.dueDate.includes('-')
                            ? new Date(activeClient.dueDate + 'T12:00:00')
                            : new Date(activeClient.dueDate);
                        if (!isNaN(d.getTime())) {
                            cDueDate = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
                        }
                    } catch {}
                }

                const cStatus = activeClient?.status || 'Ativo';
                const cLink = activeClient?.accessLink || activeClient?.link || 'https://pjcrm.site/acesso';
                const cNotes = activeClient?.notes || 'Cliente VIP';

                // Buscar registros do mesmo cliente na lista de clientes para simulação realista de múltiplas assinaturas
                const targetPhone = getClientPhone(activeClient) || phoneInput;
                const relatedDocs = Array.isArray(clients) && clients.length > 0 && targetPhone
                    ? clients.filter((c: any) => matchesPhone(targetPhone, getClientPhone(c)))
                    : activeClient ? [activeClient] : [];

                const sampleDocs = relatedDocs.length > 0 ? relatedDocs : [
                    { subscription: cPlan, status: 'Ativo', dueDate: '2026-10-15', amountPaid: '35,00' },
                    { subscription: 'Spotify Premium Família', status: 'Vencido', dueDate: '2026-10-01', amountPaid: '21,90' },
                ];

                const formatSimSubLine = (c: any, customTemplate?: string, withStatus = false) => {
                    if (customTemplate && customTemplate.trim()) {
                        const planName = (c.subscription || c.plan || c.plano || 'Assinatura').trim();
                        const statusVal = (c.status || '').trim();
                        let dueVal = '';
                        if (c.dueDate) {
                            try {
                                const d = typeof c.dueDate.toDate === 'function'
                                    ? c.dueDate.toDate()
                                    : typeof c.dueDate === 'string' && c.dueDate.includes('T')
                                    ? new Date(c.dueDate)
                                    : typeof c.dueDate === 'string' && c.dueDate.includes('-')
                                    ? new Date(c.dueDate + 'T12:00:00')
                                    : new Date(c.dueDate);
                                if (!isNaN(d.getTime())) {
                                    dueVal = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
                                }
                            } catch {}
                        }
                        let amountVal = '';
                        if (c.amountPaid) {
                            const raw = String(c.amountPaid);
                            amountVal = raw.includes('R$') ? raw : `R$ ${raw}`;
                        }
                        const payMethod = (c.paymentMethod || 'PIX').trim();
                        const emailVal = (c.email || 'cliente@email.com').trim();
                        const passVal = (c.password || c.senha || '********').trim();
                        const screenVal = (c.screen || 'Tela 1').trim();
                        const pinVal = (c.pinScreen || c.pin || '1234').trim();
                        const linkVal = (c.accessLink || 'https://link.com').trim();
                        const notesVal = (c.notes || '').trim();

                        return customTemplate
                            .replace(/\{plano\}/gi, planName)
                            .replace(/\{nome_assinatura\}/gi, planName)
                            .replace(/\{assinatura\}/gi, planName)
                            .replace(/\{status\}/gi, statusVal)
                            .replace(/\{vencimento\}/gi, dueVal)
                            .replace(/\{data_vencimento\}/gi, dueVal)
                            .replace(/\{dias_restantes\}/gi, '5 dias restantes')
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

                    const name = (c.subscription || c.plan || c.plano || 'Assinatura').trim();
                    const parts: string[] = [];
                    if (withStatus && c.status) parts.push(c.status);
                    if (c.dueDate) {
                        try {
                            const d = typeof c.dueDate.toDate === 'function'
                                ? c.dueDate.toDate()
                                : typeof c.dueDate === 'string' && c.dueDate.includes('T')
                                ? new Date(c.dueDate)
                                : typeof c.dueDate === 'string' && c.dueDate.includes('-')
                                ? new Date(c.dueDate + 'T12:00:00')
                                : new Date(c.dueDate);
                            if (!isNaN(d.getTime())) {
                                parts.push(`Vencimento: ${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`);
                            }
                        } catch {}
                    }
                    if (c.amountPaid) {
                        const raw = String(c.amountPaid);
                        parts.push(raw.includes('R$') ? raw : `R$ ${raw}`);
                    }
                    if (parts.length > 0) return `• ${name} (${parts.join(' - ')})`;
                    return `• ${name}`;
                };

                const activeListSim = sampleDocs.filter((c: any) => c.status === 'Ativo');
                const overdueListSim = sampleDocs.filter((c: any) => c.status === 'Vencido');

                const cActiveSubs = activeListSim.length > 0
                    ? activeListSim.map((c: any) => formatSimSubLine(c, varConfig?.activeSubsTemplate, false)).join('\n')
                    : (varConfig?.activeSubsEmptyMessage || `• ${cPlan} (Vencimento: ${cDueDate} - ${cAmount})`);

                const cOverdueSubs = overdueListSim.length > 0
                    ? overdueListSim.map((c: any) => formatSimSubLine(c, varConfig?.overdueSubsTemplate, false)).join('\n')
                    : (varConfig?.overdueSubsEmptyMessage || 'Nenhuma assinatura vencida encontrada.');

                const cAllSubs = sampleDocs.length > 0
                    ? sampleDocs.map((c: any) => formatSimSubLine(c, varConfig?.allSubsTemplate, true)).join('\n')
                    : (varConfig?.allSubsEmptyMessage || 'Nenhuma assinatura cadastrada.');

                const renewalUrl = activeClient?.id && !String(activeClient.id).startsWith('sim_')
                    ? `https://pjcrm.site/renovar/${activeClient.id}`
                    : 'https://pjcrm.site/renovar/ren_simulacao123';

                return txt
                    .replace(/\{nome\}/gi, cName)
                    .replace(/\{cliente\}/gi, cName)
                    .replace(/\{primeiro_nome\}/gi, cFirstName)
                    .replace(/\{telefone\}/gi, cPhone)
                    .replace(/\{numero\}/gi, cPhone)
                    .replace(/\{phone\}/gi, cPhone)
                    .replace(/\{vencimento\}/gi, cDueDate)
                    .replace(/\{data_vencimento\}/gi, cDueDate)
                    .replace(/\{dias_restantes\}/gi, '5 dias restantes')
                    .replace(/\{status\}/gi, cStatus)
                    .replace(/\{plano\}/gi, cPlan)
                    .replace(/\{nome_assinatura\}/gi, cPlan)
                    .replace(/\{assinatura\}/gi, cPlan)
                    .replace(/\{subscription\}/gi, cPlan)
                    .replace(/\{email\}/gi, cEmail)
                    .replace(/\{e-mail\}/gi, cEmail)
                    .replace(/\{senha\}/gi, cPassword)
                    .replace(/\{password\}/gi, cPassword)
                    .replace(/\{tela\}/gi, cScreen)
                    .replace(/\{screen\}/gi, cScreen)
                    .replace(/\{pin_tela\}/gi, cPinScreen)
                    .replace(/\{pin\}/gi, cPinScreen)
                    .replace(/\{metodo_pagamento\}/gi, cPayment)
                    .replace(/\{forma_pagamento\}/gi, cPayment)
                    .replace(/\{pagamento\}/gi, cPayment)
                    .replace(/\{valor\}/gi, cAmount)
                    .replace(/\{mensalidade\}/gi, cAmount)
                    .replace(/\{valor_pago\}/gi, cAmount)
                    .replace(/\{link\}/gi, cLink)
                    .replace(/\{link_acesso\}/gi, cLink)
                    .replace(/\{link_de_acesso\}/gi, cLink)
                    .replace(/\{link_renovacao\}/gi, renewalUrl)
                    .replace(/\{link_de_renovacao\}/gi, renewalUrl)
                    .replace(/\{link_renovar\}/gi, renewalUrl)
                    .replace(/\{link_pagamento\}/gi, renewalUrl)
                    .replace(/\{link_cobranca\}/gi, renewalUrl)
                    .replace(/\{notas\}/gi, cNotes)
                    .replace(/\{observacoes\}/gi, cNotes)
                    .replace(/\{assinaturas_ativas\}/gi, cActiveSubs)
                    .replace(/\{planos_ativos\}/gi, cActiveSubs)
                    .replace(/\{assinaturas_vencidas\}/gi, cOverdueSubs)
                    .replace(/\{planos_vencidos\}/gi, cOverdueSubs)
                    .replace(/\{todas_assinaturas\}/gi, cAllSubs)
                    .replace(/\{todas_as_assinaturas\}/gi, cAllSubs)
                    .replace(/\{assinaturas\}/gi, sampleDocs.length > 1 ? cAllSubs : cPlan)
                    .replace(/\{assinaturas_ativas_qtd\}/gi, String(activeListSim.length))
                    .replace(/\{qtd_assinaturas_ativas\}/gi, String(activeListSim.length))
                    .replace(/\{total_assinaturas_ativas\}/gi, String(activeListSim.length))
                    .replace(/\{numero_assinaturas_ativas\}/gi, String(activeListSim.length))
                    .replace(/\{num_assinaturas_ativas\}/gi, String(activeListSim.length))
                    .replace(/\{quantidade_assinaturas_ativas\}/gi, String(activeListSim.length))
                    .replace(/\{planos_ativos_qtd\}/gi, String(activeListSim.length))
                    .replace(/\{qtd_planos_ativos\}/gi, String(activeListSim.length))
                    .replace(/\{assinaturas_vencidas_qtd\}/gi, String(overdueListSim.length))
                    .replace(/\{qtd_assinaturas_vencidas\}/gi, String(overdueListSim.length))
                    .replace(/\{total_assinaturas_vencidas\}/gi, String(overdueListSim.length))
                    .replace(/\{numero_assinaturas_vencidas\}/gi, String(overdueListSim.length))
                    .replace(/\{num_assinaturas_vencidas\}/gi, String(overdueListSim.length))
                    .replace(/\{quantidade_assinaturas_vencidas\}/gi, String(overdueListSim.length))
                    .replace(/\{planos_vencidos_qtd\}/gi, String(overdueListSim.length))
                    .replace(/\{qtd_planos_vencidos\}/gi, String(overdueListSim.length))
                    .replace(/\{total_assinaturas\}/gi, String(sampleDocs.length))
                    .replace(/\{qtd_assinaturas\}/gi, String(sampleDocs.length))
                    .replace(/\{quantidade_assinaturas\}/gi, String(sampleDocs.length))
                    .replace(/\{numero_assinaturas\}/gi, String(sampleDocs.length))
                    .replace(/\{todas_assinaturas_qtd\}/gi, String(sampleDocs.length))
                    .replace(/\{qtd_todas_assinaturas\}/gi, String(sampleDocs.length));
            };

            // 0. START (Ponto de Partida / Início do Fluxo)
            if (data.nodeType === 'start') {
                const nextEdge = currentEdges.find((e) => e.source === nodeId);
                if (nextEdge && nextEdge.target) {
                    await executeNode(nextEdge.target);
                } else {
                    setCurrentNotice('Início do fluxo: Conecte a saída deste bloco ao próximo passo para simular.');
                }
                return;
            }

            // 1. CONTEÚDO
            if (data.nodeType === 'content') {
                setIsTyping(true);
                setTypingText('digitando...');
                await sleep(700);
                if (executionRef.current.isCancelled) return;
                setIsTyping(false);

                const newMsg: SimMessage = {
                    id: `msg_${Date.now()}_${Math.random()}`,
                    sender: 'bot',
                    nodeId,
                    nodeType: 'content',
                    text: formatText(data.text),
                    contentType: data.contentType || 'text',
                    mediaUrl: data.mediaUrl,
                    time: getCurrentTime(),
                };
                setMessages((prev) => [...prev, newMsg]);

                // Avança para a próxima aresta se existir
                const nextEdge = currentEdges.find((e) => e.source === nodeId);
                if (nextEdge && nextEdge.target) {
                    await sleep(900);
                    if (executionRef.current.isCancelled) return;
                    await executeNode(nextEdge.target);
                } else {
                    setCurrentNotice('Fim do fluxo. Não há blocos conectados após esta mensagem.');
                }
            }
            // 2. ATRASO INTELIGENTE
            else if (data.nodeType === 'delay') {
                const presence = data.delayPresence || 'composing';
                if (presence === 'recording') {
                    setIsTyping(true);
                    setTypingText('gravando áudio...');
                } else if (presence === 'composing') {
                    setIsTyping(true);
                    setTypingText('digitando...');
                }

                // Informa e simula o tempo de espera
                const unit = data.delayUnit || (data.delaySeconds && data.delaySeconds >= 3600 ? 'hours' : data.delaySeconds && data.delaySeconds >= 60 ? 'minutes' : 'seconds');
                const val = data.delayValue || (unit === 'hours' ? Math.round((data.delaySeconds || 3600) / 3600) : unit === 'minutes' ? Math.round((data.delaySeconds || 60) / 60) : data.delaySeconds || 2);

                if (unit === 'hours') {
                    setCurrentNotice(`⏳ Aguardando atraso de ${val} hora(s) (simulação acelerada)...`);
                } else if (unit === 'minutes') {
                    setCurrentNotice(`⏳ Aguardando atraso de ${val} minuto(s) (simulação acelerada)...`);
                }

                // Espera entre 1 e 3 segundos no preview para fluidez
                const waitSeconds = Math.min(Math.max(unit === 'seconds' ? val : 2, 1), 3);
                await sleep(waitSeconds * 1000);
                if (executionRef.current.isCancelled) return;
                setIsTyping(false);
                setCurrentNotice(null);

                const nextEdge = currentEdges.find((e) => e.source === nodeId);
                if (nextEdge && nextEdge.target) {
                    await executeNode(nextEdge.target);
                } else {
                    setCurrentNotice('Fim do fluxo após o atraso inteligente.');
                }
            }
            // 3. AÇÃO
            else if (data.nodeType === 'action') {
                if (data.actionType === 'send_contact') {
                    const cardName = formatText(data.contactCardName || 'Contato');
                    const cardPhone = formatText(data.contactCardPhone || '');
                    const cardOrg = data.contactCardOrganization ? formatText(data.contactCardOrganization) : undefined;

                    if (data.text) {
                        setIsTyping(true);
                        setTypingText('digitando...');
                        await sleep(600);
                        if (executionRef.current.isCancelled) return;
                        setIsTyping(false);
                        setMessages((prev) => [
                            ...prev,
                            {
                                id: `msg_${Date.now()}_intro`,
                                sender: 'bot',
                                nodeId,
                                nodeType: 'action',
                                text: formatText(data.text!),
                                time: getCurrentTime(),
                            },
                        ]);
                    }

                    setIsTyping(true);
                    setTypingText('enviando contato...');
                    await sleep(600);
                    if (executionRef.current.isCancelled) return;
                    setIsTyping(false);

                    setMessages((prev) => [
                        ...prev,
                        {
                            id: `msg_contact_${Date.now()}`,
                            sender: 'bot',
                            nodeId,
                            nodeType: 'action',
                            contactCard: {
                                name: cardName,
                                phone: cardPhone,
                                organization: cardOrg,
                            },
                            time: getCurrentTime(),
                        },
                        {
                            id: `sys_${Date.now()}`,
                            sender: 'system',
                            text: `👤 Card de contato enviado: ${cardName} (${cardPhone || 'Sem número'})`,
                            time: getCurrentTime(),
                        },
                    ]);
                } else {
                    if (data.text) {
                        setIsTyping(true);
                        setTypingText('digitando...');
                        await sleep(600);
                        if (executionRef.current.isCancelled) return;
                        setIsTyping(false);
                        setMessages((prev) => [
                            ...prev,
                            {
                                id: `msg_${Date.now()}_${Math.random()}`,
                                sender: 'bot',
                                nodeId,
                                nodeType: 'action',
                                text: formatText(data.text),
                                time: getCurrentTime(),
                            },
                        ]);
                    }

                    const actionLabel =
                        data.actionType === 'open_support'
                            ? 'Transferido para Atendimento Humano'
                            : data.actionType === 'add_tag'
                            ? `Tag adicionada: ${data.actionValue || 'Tag'}`
                            : data.actionType === 'notify_attendant'
                            ? 'Atendente Notificado'
                            : 'Ação do Sistema disparada';

                    setMessages((prev) => [
                        ...prev,
                        {
                            id: `sys_${Date.now()}`,
                            sender: 'system',
                            text: `⚡ ${actionLabel}`,
                            time: getCurrentTime(),
                        },
                    ]);
                }

                const nextEdge = currentEdges.find((e) => e.source === nodeId);
                if (nextEdge && nextEdge.target) {
                    await sleep(800);
                    if (executionRef.current.isCancelled) return;
                    await executeNode(nextEdge.target);
                } else {
                    setCurrentNotice('Fim do fluxo após a ação.');
                }
            }
            // 4. MENU
            else if (data.nodeType === 'menu') {
                setIsTyping(true);
                setTypingText('digitando...');
                await sleep(700);
                if (executionRef.current.isCancelled) return;
                setIsTyping(false);

                const newMsg: SimMessage = {
                    id: `msg_${Date.now()}_${Math.random()}`,
                    sender: 'bot',
                    nodeId,
                    nodeType: 'menu',
                    menuData: {
                        menuType: data.menuType || 'list',
                        menuQuestionText: formatText(data.menuQuestionText) || 'Escolha uma opção:',
                        menuButtonTitle: formatText(data.menuButtonTitle) || 'VER OPÇÕES',
                        menuFooterText: formatText(data.menuFooterText),
                        menuOptions: normalizeMenuOptions(data.menuOptions).map((opt) => ({
                            ...opt,
                            label: formatText(opt.label),
                            description: opt.description ? formatText(opt.description) : '',
                            url: opt.url ? formatText(opt.url) : '',
                        })),
                    },
                    time: getCurrentTime(),
                };

                setMessages((prev) => [...prev, newMsg]);
                setActiveMenuNodeId(nodeId);
                // O bot para aqui e aguarda a interação do usuário!
            }
            // 5. CONEXÃO DE FLUXO
            else if (data.nodeType === 'flow_connect') {
                setMessages((prev) => [
                    ...prev,
                    {
                        id: `sys_${Date.now()}`,
                        sender: 'system',
                        text: `🔄 Conectado ao subfluxo (${data.label || 'Outro Fluxo'})`,
                        time: getCurrentTime(),
                    },
                ]);
                setCurrentNotice('Transição de fluxo concluída.');
            }
            // 6. CONDIÇÃO: VERIFICAR CLIENTE NO CRM
            else if (data.nodeType === 'condition') {
                if (isRegistered) {
                    const clientName = activeClient?.name || 'Cliente Cadastrado';
                    const clientPhone = getClientPhone(activeClient) || phoneInput || '';
                    const clientPlan = activeClient?.subscription || activeClient?.plan || activeClient?.plano || 'Plano VIP';
                    const clientPhoneDisplay = clientPhone ? ` (${clientPhone})` : '';
                    setMessages((prev) => [
                        ...prev,
                        {
                            id: `sys_${Date.now()}`,
                            sender: 'system',
                            text: `🔍 *Simulação:* Contato verificado no CRM como *Cliente Cadastrado* — ${clientName}${clientPhoneDisplay} [${clientPlan}]. Seguindo rota verde...`,
                            time: getCurrentTime(),
                        },
                    ]);
                    await sleep(700);
                    if (executionRef.current.isCancelled) return;

                    // Segue a saída 'is_client' (Cliente Cadastrado)
                    const clientEdge =
                        currentEdges.find((e) => e.source === nodeId && (e.sourceHandle === 'is_client' || e.sourceHandle === 'client' || e.sourceHandle === 'isClient')) ||
                        currentEdges.find((e) => e.source === nodeId && e.sourceHandle !== 'not_client' && e.sourceHandle !== 'not_registered' && e.sourceHandle !== 'notClient');

                    if (clientEdge && clientEdge.target) {
                        await executeNode(clientEdge.target);
                    } else {
                        setCurrentNotice('Fim do fluxo após a verificação de cliente CRM (rota de cliente cadastrado não conectada).');
                    }
                } else {
                    const searchInfo = phoneInput ? ` para o número ${phoneInput}` : '';
                    setMessages((prev) => [
                        ...prev,
                        {
                            id: `sys_${Date.now()}`,
                            sender: 'system',
                            text: `🔍 *Simulação:* Contato não encontrado no CRM${searchInfo} (*Não Cadastrado* / Lead Novo). Seguindo rota vermelha...`,
                            time: getCurrentTime(),
                        },
                    ]);
                    await sleep(700);
                    if (executionRef.current.isCancelled) return;

                    // Segue a saída 'not_client' (Não Cadastrado)
                    const notClientEdge =
                        currentEdges.find((e) => e.source === nodeId && (e.sourceHandle === 'not_client' || e.sourceHandle === 'not_registered' || e.sourceHandle === 'notClient')) ||
                        currentEdges.find((e) => e.source === nodeId && e.sourceHandle !== 'is_client' && e.sourceHandle !== 'client' && e.sourceHandle !== 'isClient');

                    if (notClientEdge && notClientEdge.target) {
                        await executeNode(notClientEdge.target);
                    } else {
                        setCurrentNotice('Fim do fluxo após a verificação de cliente CRM (rota de não cadastrado não conectada).');
                    }
                }
            }
            // 7. PAUSAR AUTOMAÇÃO (COOLDOWN / BLOCO FINAL)
            else if (data.nodeType === 'pause_automation') {
                const finalMsgText = formatText(data.text || data.pauseMessage);
                if (finalMsgText) {
                    setIsTyping(true);
                    setTypingText('digitando...');
                    await sleep(700);
                    if (executionRef.current.isCancelled) return;
                    setIsTyping(false);

                    setMessages((prev) => [
                        ...prev,
                        {
                            id: `msg_${Date.now()}_pause_final`,
                            sender: 'bot',
                            nodeId,
                            nodeType: 'pause_automation',
                            text: finalMsgText,
                            time: getCurrentTime(),
                        },
                    ]);
                }

                const unit = data.pauseDurationUnit || 'hours';
                const val = Math.max(1, Number(data.pauseDurationValue) || 1);
                const unitLabel = unit === 'days' ? `${val} dia(s)` : unit === 'minutes' ? `${val} minuto(s)` : `${val} hora(s)`;

                setMessages((prev) => [
                    ...prev,
                    {
                        id: `sys_${Date.now()}`,
                        sender: 'system',
                        text: `⏸️ *Atendimento Finalizado:* Automação pausada para este contato por *${unitLabel}*. Durante esse período, novas mensagens não reiniciarão o fluxo.`,
                        time: getCurrentTime(),
                    },
                ]);

                setCurrentNotice(`Fluxo finalizado com sucesso. Automação em pausa por ${unitLabel}.`);
            }
        },
        [sampleClient, varConfig, clients]
    );

    // Inicia a simulação a partir do nó inicial usando o snapshot fornecido
    const startSimulationWithSnapshot = useCallback(
        (nodesSnapshot: Node[], edgesSnapshot: Edge[]) => {
            executionRef.current.isCancelled = true;
            executionRef.current = { isCancelled: false };

            setMessages([]);
            setCurrentNotice(null);
            setIsTyping(false);
            setActiveMenuNodeId(null);
            setIsListDrawerOpen(false);

            if (!nodesSnapshot || nodesSnapshot.length === 0) {
                setCurrentNotice('O fluxo está vazio. Adicione blocos no canva para testar.');
                return;
            }

            // Identifica o nó de início (prioriza o bloco de início 'start', ou nó sem entrada / primeiro nó)
            const explicitStartNode = nodesSnapshot.find((n) => (n.data as any)?.nodeType === 'start');
            const targetNodeIds = new Set(edgesSnapshot.map((e) => e.target));
            const rootNode = explicitStartNode || nodesSnapshot.find((n) => !targetNodeIds.has(n.id)) || nodesSnapshot[0];

            if (rootNode) {
                // Executa com leve atraso inicial para efeito realista
                setTimeout(() => {
                    if (!executionRef.current.isCancelled) {
                        executeNode(rootNode.id);
                    }
                }, 300);
            }
        },
        [executeNode]
    );

    // Reinicia usando o snapshot ativo atual
    const restartSimulation = useCallback(() => {
        startSimulationWithSnapshot(activeNodesRef.current, activeEdgesRef.current);
    }, [startSimulationWithSnapshot]);

    // Reinício manual acionado pelo usuário no preview: captura as alterações mais recentes do Canva!
    const handleManualRestart = useCallback(() => {
        const latest = latestPropsRef.current;
        setActiveNodes(latest.nodes);
        setActiveEdges(latest.edges);
        activeNodesRef.current = latest.nodes;
        activeEdgesRef.current = latest.edges;
        startSimulationWithSnapshot(latest.nodes, latest.edges);
    }, [startSimulationWithSnapshot]);

    // Aplicar teste com o número digitado
    const handleApplyPhoneTest = useCallback(() => {
        testPhoneNumberRef.current = testPhoneNumber;
        startSimulationWithSnapshot(activeNodesRef.current, activeEdgesRef.current);
    }, [testPhoneNumber, startSimulationWithSnapshot]);

    // Alternar modo de simulação (Cadastrado / Não Cadastrado)
    const handleChangeClientMode = useCallback(
        (mode: 'registered' | 'unregistered') => {
            setClientTestMode(mode);
            clientTestModeRef.current = mode;
            // Reinicia a simulação com o novo modo imediatamente usando o snapshot ativo
            startSimulationWithSnapshot(activeNodesRef.current, activeEdgesRef.current);
        },
        [startSimulationWithSnapshot]
    );

    // Ao abrir o componente, captura o snapshot do canva e inicia a simulação
    // IMPORTANTE: Não recria nem reseta a simulação ao editar nós no Canva com o preview aberto!
    useEffect(() => {
        if (open) {
            const latest = latestPropsRef.current;
            setActiveNodes(latest.nodes);
            setActiveEdges(latest.edges);
            activeNodesRef.current = latest.nodes;
            activeEdgesRef.current = latest.edges;
            startSimulationWithSnapshot(latest.nodes, latest.edges);
        } else {
            executionRef.current.isCancelled = true;
        }
    }, [open, startSimulationWithSnapshot]);

    // Tratar clique em opção de menu (com fidelidade estrita às arestas conectadas do snapshot)
    const handleSelectOption = async (option: { id: string; label: string; type?: 'reply' | 'url'; url?: string }, menuNodeId: string) => {
        if (!activeMenuNodeId) return;

        const currentNodes = activeNodesRef.current;
        const currentEdges = activeEdgesRef.current;

        const isUrlBtn = option.type === 'url';

        if (isUrlBtn) {
            const cleanUrl = option.url?.trim() || '';
            setMessages((prev) => [
                ...prev,
                {
                    id: `sys_${Date.now()}`,
                    sender: 'system',
                    text: `🔗 Botão de Link (CTA) clicado: "${option.label}" ➔ ${cleanUrl}`,
                    time: getCurrentTime(),
                },
            ]);
            if (cleanUrl.startsWith('http://') || cleanUrl.startsWith('https://')) {
                try {
                    window.open(cleanUrl, '_blank');
                } catch {}
            }
        } else {
            // 1. Mensagem de resposta do usuário
            const userMsg: SimMessage = {
                id: `user_${Date.now()}`,
                sender: 'user',
                text: option.label,
                time: getCurrentTime(),
            };
            setMessages((prev) => [...prev, userMsg]);
        }

        setActiveMenuNodeId(null);
        setIsListDrawerOpen(false);
        setCurrentNotice(null);

        // 2. Procurar aresta que sai dessa opção específica (sourceHandle === option.id ou opt_${idx+1})
        const nodeEdges = currentEdges.filter((e) => e.source === menuNodeId);
        let matchedEdge = nodeEdges.find((e) => e.sourceHandle === option.id);

        if (!matchedEdge) {
            const menuNode = currentNodes.find((n) => n.id === menuNodeId);
            const menuOptions = (menuNode?.data as FlowNodeData)?.menuOptions || [];
            const optIdx = menuOptions.findIndex((o) => o.id === option.id || o.label === option.label);
            if (optIdx !== -1) {
                matchedEdge = nodeEdges.find(
                    (e) => e.sourceHandle === `opt_${optIdx + 1}` || e.sourceHandle === String(optIdx + 1)
                );
            }
        }

        if (matchedEdge && matchedEdge.target) {
            // Bloco conectado encontrado!
            await sleep(600);
            if (!executionRef.current.isCancelled) {
                await executeNode(matchedEdge.target);
            }
        } else if (isUrlBtn) {
            setCurrentNotice(`Botão de link "${option.label}" acionado no navegador.`);
        } else {
            // FIDELIDADE TOTAL AO FLUXO: Não há nada conectado a esta opção!
            setCurrentNotice(`Nenhum bloco conectado à opção "${option.label}". O fluxo encerra aqui.`);
        }
    };

    // Tratar envio manual de mensagem no campo de texto
    const handleSendMessage = async (e?: React.FormEvent) => {
        if (e) e.preventDefault();
        if (!inputMessage.trim()) return;

        const text = inputMessage.trim();
        setInputMessage('');

        const userMsg: SimMessage = {
            id: `user_${Date.now()}`,
            sender: 'user',
            text,
            time: getCurrentTime(),
        };
        setMessages((prev) => [...prev, userMsg]);
        setCurrentNotice(null);

        // Se houver um menu aguardando resposta:
        if (activeMenuNodeId) {
            const currentNodes = activeNodesRef.current;
            const currentEdges = activeEdgesRef.current;
            const menuNode = currentNodes.find((n) => n.id === activeMenuNodeId);
            const menuData = menuNode?.data as FlowNodeData;
            const rawOptions = menuData?.menuOptions || [];
            const options = rawOptions.map((opt: any, idx: number) => ({
                id: String(opt.id || `opt_${idx + 1}`),
                label: String(opt.label || opt.text || opt.title || `Opção ${idx + 1}`),
                description: opt.description ? String(opt.description) : '',
                index: idx,
            }));

            let matchedOpt: typeof options[0] | null = null;

            // 1. Número digitado ("1", "2")
            const numIdx = parseInt(text);
            if (!isNaN(numIdx) && numIdx >= 1 && numIdx <= options.length && String(numIdx) === text) {
                matchedOpt = options[numIdx - 1];
            }

            // 2. Exato por ID ou Label
            if (!matchedOpt) {
                const lower = text.toLowerCase();
                matchedOpt = options.find(
                    (opt) => opt.id.toLowerCase() === lower || opt.label.trim().toLowerCase() === lower
                ) || null;
            }

            // 3. Sanitizado (sem emojis, acentos, pontuação)
            if (!matchedOpt) {
                const cleanInput = sanitizeOptionText(text);
                if (cleanInput.length >= 2) {
                    matchedOpt = options.find((opt) => sanitizeOptionText(opt.label) === cleanInput) || null;
                    if (!matchedOpt && cleanInput.length >= 4) {
                        matchedOpt = options.find((opt) => {
                            const cleanOpt = sanitizeOptionText(opt.label);
                            return cleanOpt.length >= 4 && (cleanOpt.includes(cleanInput) || cleanInput.includes(cleanOpt));
                        }) || null;
                    }
                }
            }

            if (matchedOpt) {
                setActiveMenuNodeId(null);
                const nodeEdges = currentEdges.filter((e) => e.source === activeMenuNodeId);
                let matchedEdge = nodeEdges.find((e) => e.sourceHandle === matchedOpt!.id);

                if (!matchedEdge) {
                    matchedEdge = nodeEdges.find(
                        (e) => e.sourceHandle === `opt_${matchedOpt!.index + 1}` || e.sourceHandle === String(matchedOpt!.index + 1)
                    );
                }

                if (matchedEdge && matchedEdge.target) {
                    await sleep(600);
                    if (!executionRef.current.isCancelled) {
                        await executeNode(matchedEdge.target);
                    }
                } else {
                    setCurrentNotice(`Nenhum bloco conectado à opção "${matchedOpt!.label}". O fluxo encerra aqui.`);
                }
                return;
            } else {
                // Usuário digitou um texto livre que NÃO é opção do menu
                const warnMsg = menuData?.invalidOptionMessage || '⚠️ *Por favor, selecione ou digite uma das opções válidas acima para continuar.*';
                setIsTyping(true);
                setTypingText('digitando...');
                await sleep(700);
                if (executionRef.current.isCancelled) return;
                setIsTyping(false);

                setMessages((prev) => [
                    ...prev,
                    {
                        id: `msg_warn_${Date.now()}`,
                        sender: 'bot',
                        nodeId: activeMenuNodeId,
                        text: warnMsg,
                        time: getCurrentTime(),
                    },
                ]);
                setCurrentNotice('Opção não reconhecida. Selecione ou digite uma das opções acima.');
                return;
            }
        }

        // Se o usuário digitou algo fora de qualquer menu:
        await sleep(600);
        setCurrentNotice('Mensagem enviada. Nenhuma condição ou bloco está aguardando este texto.');
    };

    if (!open) return null;

    return (
        <div className="absolute top-3 right-4 z-40 w-[360px] sm:w-[380px] h-[580px] max-h-[calc(100vh-5.5rem)] rounded-2xl overflow-hidden border-2 border-slate-300 dark:border-slate-800 bg-[#efeae2] dark:bg-[#0b141a] shadow-2xl flex flex-col animate-in fade-in-50 zoom-in-95 slide-in-from-top-3 select-none">
            {/* CABEÇALHO DO WHATSAPP CLONADO */}
            <div className="h-14 bg-[#075e54] dark:bg-[#1f2c34] text-white px-3 flex items-center justify-between shrink-0 shadow-md">
                <div className="flex items-center gap-2 overflow-hidden">
                    <button
                        type="button"
                        onClick={onClose}
                        className="p-1 rounded-full hover:bg-white/10 transition-colors"
                        title="Fechar visualizador"
                    >
                        <ArrowLeft className="h-4 w-4" />
                    </button>
                    <div className="w-8 h-8 rounded-full bg-emerald-700 dark:bg-emerald-800 flex items-center justify-center font-bold text-xs shadow-inner shrink-0">
                        🤖
                    </div>
                    <div className="leading-tight truncate">
                        <p className="text-xs font-bold leading-none truncate max-w-[130px]">
                            {flowName || 'Bot de Teste'}
                        </p>
                        <span className="text-[10px] text-emerald-200 dark:text-emerald-400">
                            {isTyping ? typingText : 'online'}
                        </span>
                    </div>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                    {/* BOTÃO REINICIAR FLUXO */}
                    <button
                        type="button"
                        onClick={handleManualRestart}
                        className="p-1.5 rounded-lg hover:bg-white/15 text-white/90 hover:text-white transition-all group"
                        title="Reiniciar fluxo e sincronizar com o canva"
                    >
                        <RotateCcw className="h-4 w-4 group-hover:-rotate-90 transition-transform duration-300" />
                    </button>

                    {/* BOTÃO DISPARAR TESTE REAL (WHATSAPP FÍSICO) */}
                    {onOpenRealTest && (
                        <button
                            type="button"
                            onClick={onOpenRealTest}
                            className="p-1.5 rounded-lg hover:bg-white/15 text-white/90 hover:text-white transition-colors"
                            title="Disparar no seu WhatsApp real"
                        >
                            <Smartphone className="h-4 w-4" />
                        </button>
                    )}

                    {/* BOTÃO FECHAR */}
                    <button
                        type="button"
                        onClick={onClose}
                        className="p-1.5 rounded-lg hover:bg-white/15 text-white/90 hover:text-white transition-colors ml-0.5"
                        title="Fechar preview"
                    >
                        <X className="h-4 w-4" />
                    </button>
                </div>
            </div>

            {/* BARRA DE TESTE POR NÚMERO DO CRM & MODO DE SIMULAÇÃO */}
            <div className="bg-[#f0f2f5] dark:bg-[#111b21] border-b border-slate-300 dark:border-slate-800 px-3 py-2 space-y-1.5 shrink-0 shadow-xs z-10">
                {/* LINHA 1: INPUT DE TELEFONE DO CLIENTE */}
                <div className="flex items-center gap-1.5">
                    <div className="relative flex-1">
                        <Phone className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 pointer-events-none" />
                        <input
                            type="text"
                            value={testPhoneNumber}
                            onChange={(e) => {
                                setTestPhoneNumber(e.target.value);
                                testPhoneNumberRef.current = e.target.value;
                            }}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                    handleApplyPhoneTest();
                                }
                            }}
                            placeholder="Testar com tel do CRM (ex: 77998413534)..."
                            className="w-full pl-8 pr-7 py-1 text-xs bg-white dark:bg-[#202c33] border border-slate-300 dark:border-slate-700 rounded-md placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-emerald-500 text-slate-800 dark:text-slate-100"
                        />
                        {testPhoneNumber && (
                            <button
                                type="button"
                                onClick={() => {
                                    setTestPhoneNumber('');
                                    testPhoneNumberRef.current = '';
                                    handleManualRestart();
                                }}
                                className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 rounded-full hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                                title="Limpar telefone"
                            >
                                <X className="h-3 w-3" />
                            </button>
                        )}
                    </div>
                    <button
                        type="button"
                        onClick={handleApplyPhoneTest}
                        className="px-2.5 py-1 rounded-md bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-semibold transition-colors shrink-0 shadow-xs"
                        title="Simular fluxo com este número"
                    >
                        Testar
                    </button>
                </div>

                {/* LINHA 2: STATUS DO CLIENTE LOCALIZADO OU SELETOR CADASTRADO / NÃO CADASTRADO */}
                <div className="flex items-center justify-between gap-2 px-0.5 pt-0.5">
                    <div className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-700 dark:text-slate-300 min-w-0 flex-1 truncate">
                        {customMatchedClient ? (
                            <span className="text-emerald-700 dark:text-emerald-400 truncate flex items-center gap-1 font-bold">
                                <UserCheck className="h-3.5 w-3.5 shrink-0 text-emerald-600" />
                                {customMatchedClient.name}
                            </span>
                        ) : testPhoneNumber.trim() ? (
                            <span className="text-slate-600 dark:text-slate-400 truncate text-[10.5px]">
                                {clientTestMode === 'registered' ? 'Simulando com dados cadastrados' : 'Simulando novo lead'}
                            </span>
                        ) : (
                            <span className="text-slate-700 dark:text-slate-300 flex items-center gap-1">
                                <UserCheck className="h-3.5 w-3.5 text-indigo-600 dark:text-indigo-400 shrink-0" />
                                Simular:
                            </span>
                        )}
                    </div>

                    <div className="flex items-center bg-slate-200 dark:bg-slate-800 p-0.5 rounded-lg border border-slate-300 dark:border-slate-700 shrink-0">
                        <button
                            type="button"
                            onClick={() => handleChangeClientMode('registered')}
                            className={`px-2 py-0.5 rounded-md text-[10.5px] font-bold transition-all flex items-center gap-1 cursor-pointer ${
                                clientTestMode === 'registered'
                                    ? 'bg-emerald-600 text-white shadow-xs'
                                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
                            }`}
                            title="Simular rota de cliente cadastrado no CRM"
                        >
                            <UserCheck className="h-3 w-3" />
                            <span>Cadastrado</span>
                        </button>
                        <button
                            type="button"
                            onClick={() => handleChangeClientMode('unregistered')}
                            className={`px-2 py-0.5 rounded-md text-[10.5px] font-bold transition-all flex items-center gap-1 cursor-pointer ${
                                clientTestMode === 'unregistered'
                                    ? 'bg-amber-600 text-white shadow-xs'
                                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
                            }`}
                            title="Simular rota de novo lead (não cadastrado)"
                        >
                            <UserX className="h-3 w-3" />
                            <span>Novo Lead</span>
                        </button>
                    </div>
                </div>
            </div>

            {/* ÁREA DE MENSAGENS COM BACKGROUND TÍPICO DO WHATSAPP */}
            <div className="flex-1 p-3 overflow-y-auto space-y-2.5 relative kanban-scroll">
                {/* DATA TAG */}
                <div className="flex justify-center">
                    <span className="bg-white/80 dark:bg-[#1f2c34]/80 text-[10px] text-muted-foreground px-2.5 py-0.5 rounded-md shadow-xs uppercase tracking-wider font-semibold">
                        Hoje
                    </span>
                </div>

                {/* CRIPTOGRAFIA TAG */}
                <div className="flex justify-center">
                    <div className="bg-[#ffeecd] dark:bg-[#182229] border border-amber-200 dark:border-amber-900/40 text-[9.5px] text-amber-900 dark:text-amber-200/80 px-2.5 py-1 rounded-md text-center max-w-[90%] shadow-xs leading-tight">
                        🔒 Simulador fiel do WhatsApp. As mensagens e cliques seguem as ligações feitas no Canva.
                    </div>
                </div>

                {/* LISTAGEM DE MENSAGENS */}
                {messages.map((msg) => {
                    // MENSAGEM DO SISTEMA
                    if (msg.sender === 'system') {
                        return (
                            <div key={msg.id} className="flex justify-center my-1">
                                <span className="bg-indigo-50 dark:bg-indigo-950/70 border border-indigo-200 dark:border-indigo-900/60 text-indigo-700 dark:text-indigo-300 text-[10.5px] px-2.5 py-1 rounded-full shadow-xs font-medium">
                                    {msg.text}
                                </span>
                            </div>
                        );
                    }

                    // MENSAGEM DO USUÁRIO (LADO DIREITO - VERDE)
                    if (msg.sender === 'user') {
                        return (
                            <div key={msg.id} className="flex justify-end animate-in fade-in-50 slide-in-from-bottom-1">
                                <div className="bg-[#d9fdd3] dark:bg-[#005c4b] text-[#111b21] dark:text-[#e9edef] rounded-xl rounded-tr-xs p-2 px-3 shadow-xs max-w-[85%] text-xs relative leading-relaxed">
                                    <p className="whitespace-pre-wrap break-words">{msg.text}</p>
                                    <div className="flex items-center justify-end gap-1 mt-1 -mb-0.5 text-[9.5px] text-[#667781] dark:text-emerald-200/70 float-right ml-3">
                                        <span>{msg.time}</span>
                                        <CheckCheck className="h-3 w-3 text-[#53bdeb]" />
                                    </div>
                                </div>
                            </div>
                        );
                    }

                    // MENSAGEM DO BOT (LADO ESQUERDO - BRANCO)
                    return (
                        <div key={msg.id} className="flex justify-start animate-in fade-in-50 slide-in-from-bottom-1">
                            <div className="bg-white dark:bg-[#202c33] text-[#111b21] dark:text-[#e9edef] rounded-xl rounded-tl-xs p-2.5 px-3 shadow-xs max-w-[88%] text-xs relative leading-relaxed space-y-2 border border-slate-200/40 dark:border-slate-800/60">
                                {/* SE TIVER MÍDIA */}
                                {msg.contentType && msg.contentType !== 'text' && msg.mediaUrl && (
                                    <div className="rounded-lg overflow-hidden border bg-muted/20 my-1">
                                        {msg.contentType === 'image' && (
                                            <img
                                                src={msg.mediaUrl}
                                                alt="Mídia"
                                                className="w-full h-auto max-h-44 object-cover rounded-md"
                                            />
                                        )}
                                        {msg.contentType === 'audio' && (
                                            <div className="p-2 flex items-center gap-2 bg-slate-50 dark:bg-slate-900/60">
                                                <div className="p-2 rounded-full bg-emerald-600 text-white">
                                                    <Volume2 className="h-3.5 w-3.5" />
                                                </div>
                                                <div className="flex-1">
                                                    <div className="h-1.5 bg-slate-200 dark:bg-slate-700 rounded-full w-full" />
                                                    <span className="text-[10px] text-muted-foreground">0:07</span>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                )}

                                {/* CARD DE CONTATO DO WHATSAPP (vCard) */}
                                {msg.contactCard && (
                                    <div className="bg-white dark:bg-[#1f2c34] rounded-xl border border-slate-200 dark:border-slate-700/80 overflow-hidden shadow-xs my-1 min-w-[210px] max-w-[260px]">
                                        <div className="p-3 flex items-center gap-3 border-b border-slate-100 dark:border-slate-800">
                                            <div className="w-10 h-10 rounded-full bg-emerald-100 dark:bg-emerald-950/70 text-emerald-700 dark:text-emerald-400 flex items-center justify-center font-bold text-sm shrink-0 border border-emerald-300 dark:border-emerald-800">
                                                {msg.contactCard.name ? msg.contactCard.name.slice(0, 2).toUpperCase() : <UserCheck className="h-5 w-5" />}
                                            </div>
                                            <div className="min-w-0 flex-1">
                                                <p className="font-bold text-xs text-slate-800 dark:text-slate-100 truncate">
                                                    {msg.contactCard.name}
                                                </p>
                                                <p className="text-[10px] text-muted-foreground truncate">
                                                    {msg.contactCard.phone || 'Sem telefone'}
                                                </p>
                                                {msg.contactCard.organization && (
                                                    <p className="text-[9px] text-indigo-600 dark:text-indigo-400 font-medium truncate">
                                                        {msg.contactCard.organization}
                                                    </p>
                                                )}
                                            </div>
                                        </div>
                                        <div className="bg-slate-50/70 dark:bg-slate-900/40 p-2 text-center">
                                            <span className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400 flex items-center justify-center gap-1.5">
                                                <MessageSquare className="h-3.5 w-3.5" />
                                                Conversar
                                            </span>
                                        </div>
                                    </div>
                                )}

                                {/* TEXTO PRINCIPAL */}
                                {msg.text && (
                                    <p className="whitespace-pre-wrap break-words">{msg.text}</p>
                                )}

                                {/* SE FOR NÓ DE MENU */}
                                {msg.nodeType === 'menu' && msg.menuData && (
                                    <div className="space-y-2 pt-1 border-t border-slate-100 dark:border-slate-700/60">
                                        <p className="font-semibold text-[11.5px] leading-tight">
                                            {msg.menuData.menuQuestionText}
                                        </p>

                                        {/* 1. MODO LISTA: BOTÃO 'VER OPÇÕES' */}
                                        {msg.menuData.menuType === 'list' && (
                                            <div className="pt-1">
                                                <button
                                                    type="button"
                                                    disabled={activeMenuNodeId !== msg.nodeId}
                                                    onClick={() => {
                                                        if (msg.nodeId && msg.menuData?.menuOptions) {
                                                            setCurrentDrawerMenu({
                                                                nodeId: msg.nodeId,
                                                                title: msg.menuData.menuQuestionText || 'Selecione uma opção',
                                                                options: msg.menuData.menuOptions,
                                                            });
                                                            setIsListDrawerOpen(true);
                                                        }
                                                    }}
                                                    className="w-full flex items-center justify-between p-2 px-3 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 font-bold text-xs border border-emerald-300 dark:border-emerald-800 hover:bg-emerald-100 dark:hover:bg-emerald-900/40 transition-colors disabled:opacity-50 disabled:cursor-not-allowed group shadow-xs"
                                                >
                                                    <div className="flex items-center gap-2">
                                                        <ListFilter className="h-3.5 w-3.5" />
                                                        <span>{msg.menuData.menuButtonTitle || 'VER OPÇÕES'}</span>
                                                    </div>
                                                    <ChevronRight className="h-3.5 w-3.5 group-hover:translate-x-0.5 transition-transform" />
                                                </button>
                                            </div>
                                        )}

                                        {/* 2. MODO BOTÕES: LISTA DE BOTÕES DO WHATSAPP */}
                                        {msg.menuData.menuType === 'button' && (
                                            <div className="space-y-1.5 pt-1">
                                                {normalizeMenuOptions(msg.menuData.menuOptions).map((opt, idx) => {
                                                    const isUrl = opt.type === 'url';
                                                    return (
                                                        <button
                                                            key={opt.id || `btn_${idx}`}
                                                            type="button"
                                                            disabled={activeMenuNodeId !== msg.nodeId}
                                                            onClick={() => msg.nodeId && handleSelectOption(opt, msg.nodeId)}
                                                            className={`w-full py-2 px-3 text-center rounded-lg font-bold text-xs border transition-all disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.99] flex items-center justify-center gap-1.5 ${
                                                                isUrl
                                                                    ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border-emerald-300 dark:border-emerald-700 hover:bg-emerald-100 dark:hover:bg-emerald-900/60 shadow-2xs'
                                                                    : 'bg-slate-50 dark:bg-slate-800 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 text-indigo-700 dark:text-indigo-400 border-slate-200 dark:border-slate-700 shadow-2xs'
                                                            }`}
                                                        >
                                                            {isUrl && <ExternalLink className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />}
                                                            <span>{opt.label}</span>
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        )}

                                        {/* 3. MODO NUMÉRICO: OPÇÕES CLICÁVEIS */}
                                        {msg.menuData.menuType === 'numeric' && (
                                            <div className="space-y-1.5 pt-1 font-medium">
                                                {normalizeMenuOptions(msg.menuData.menuOptions).map((opt, idx) => {
                                                    const isUrl = opt.type === 'url';
                                                    return (
                                                        <button
                                                            key={opt.id || `num_${idx}`}
                                                            type="button"
                                                            disabled={activeMenuNodeId !== msg.nodeId}
                                                            onClick={() => msg.nodeId && handleSelectOption(opt, msg.nodeId)}
                                                            className="w-full flex items-center justify-between p-1.5 px-2.5 rounded-lg bg-slate-50 dark:bg-slate-800/80 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 text-left text-xs border border-slate-200 dark:border-slate-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                                        >
                                                            <div className="flex items-center gap-1.5">
                                                                <span className="font-bold text-indigo-600 dark:text-indigo-400 mr-1">
                                                                    {idx + 1}.
                                                                </span>
                                                                {isUrl && <ExternalLink className="h-3 w-3 text-emerald-600 shrink-0" />}
                                                                <div>
                                                                    <span className="font-semibold text-slate-800 dark:text-slate-200">
                                                                        {opt.label}
                                                                    </span>
                                                                    {opt.description && (
                                                                        <p className="text-[10px] text-muted-foreground italic">
                                                                            {opt.description}
                                                                        </p>
                                                                    )}
                                                                </div>
                                                            </div>
                                                            <span className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950 px-1.5 py-0.5 rounded">
                                                                {isUrl ? 'Abrir' : 'Enviar'}
                                                            </span>
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        )}

                                        {/* RODAPÉ DO MENU (OPCIONAL) */}
                                        {msg.menuData.menuFooterText && (
                                            <p className="text-[10px] text-muted-foreground italic pt-1 border-t border-slate-100 dark:border-slate-800 leading-tight">
                                                {msg.menuData.menuFooterText}
                                            </p>
                                        )}
                                    </div>
                                )}

                                {/* HORA DA MENSAGEM */}
                                <div className="text-[9.5px] text-[#667781] dark:text-[#8696a0] text-right mt-1">
                                    {msg.time}
                                </div>
                            </div>
                        </div>
                    );
                })}

                {/* DIGITANDO... / GRAVANDO... */}
                {isTyping && (
                    <div className="flex justify-start animate-in fade-in-50">
                        <div className="bg-white dark:bg-[#202c33] rounded-2xl rounded-tl-xs p-2.5 px-3.5 shadow-xs flex items-center gap-1.5 border border-slate-200/40 dark:border-slate-800/60">
                            <span className="w-1.5 h-1.5 rounded-full bg-slate-400 dark:bg-slate-500 animate-bounce" style={{ animationDelay: '0ms' }} />
                            <span className="w-1.5 h-1.5 rounded-full bg-slate-400 dark:bg-slate-500 animate-bounce" style={{ animationDelay: '150ms' }} />
                            <span className="w-1.5 h-1.5 rounded-full bg-slate-400 dark:bg-slate-500 animate-bounce" style={{ animationDelay: '300ms' }} />
                            <span className="text-[10.5px] text-muted-foreground ml-1 font-medium">{typingText}</span>
                        </div>
                    </div>
                )}

                {/* AVISO DE FEEDBACK (EX: FIM DO FLUXO OU SEM BLOCO CONECTADO) */}
                {currentNotice && (
                    <div className="flex justify-center my-2 animate-in fade-in-50 slide-in-from-bottom-2">
                        <div className="bg-amber-100 dark:bg-amber-950/70 border border-amber-300 dark:border-amber-800 text-amber-900 dark:text-amber-200 text-[11px] p-2 px-3 rounded-xl shadow-sm max-w-[92%] flex items-start gap-1.5">
                            <Info className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                            <span className="leading-tight font-medium">{currentNotice}</span>
                        </div>
                    </div>
                )}

                <div ref={messagesEndRef} />
            </div>

            {/* DRAWER FLUTUANTE DA LISTA DO WHATSAPP (QUANDO CLICA EM 'VER OPÇÕES') */}
            {isListDrawerOpen && currentDrawerMenu && (
                <div className="absolute inset-x-0 bottom-12 bg-white dark:bg-[#1f2c34] rounded-t-2xl shadow-2xl border-t-2 border-slate-200 dark:border-slate-700 z-50 p-3 max-h-[280px] overflow-y-auto animate-in slide-in-from-bottom-4 space-y-2">
                    <div className="flex items-center justify-between pb-1 border-b">
                        <span className="text-xs font-bold text-slate-800 dark:text-slate-100">
                            {currentDrawerMenu.title}
                        </span>
                        <button
                            type="button"
                            onClick={() => setIsListDrawerOpen(false)}
                            className="p-1 rounded-md text-muted-foreground hover:text-foreground"
                        >
                            <X className="h-4 w-4" />
                        </button>
                    </div>

                    <div className="space-y-1.5">
                        {currentDrawerMenu.options.map((opt) => {
                            const isUrl = opt.type === 'url';
                            return (
                                <button
                                    key={opt.id}
                                    type="button"
                                    onClick={() => handleSelectOption(opt, currentDrawerMenu.nodeId)}
                                    className={`w-full flex items-center justify-between p-2 rounded-xl text-left border transition-colors group ${
                                        isUrl
                                            ? 'bg-emerald-50/60 dark:bg-emerald-950/40 border-emerald-300 dark:border-emerald-800 hover:bg-emerald-100'
                                            : 'bg-slate-50 dark:bg-slate-800 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 border-slate-200 dark:border-slate-700 hover:border-emerald-300 dark:hover:border-emerald-800'
                                    }`}
                                >
                                    <div className="flex items-center gap-2 min-w-0 flex-1 pr-2">
                                        {isUrl && <ExternalLink className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />}
                                        <div className="min-w-0">
                                            <p className={`text-xs font-bold truncate ${isUrl ? 'text-emerald-800 dark:text-emerald-300' : 'text-slate-800 dark:text-slate-100 group-hover:text-emerald-700 dark:group-hover:text-emerald-400'}`}>
                                                {opt.label}
                                            </p>
                                            {opt.description && (
                                                <p className="text-[10px] text-muted-foreground truncate">
                                                    {opt.description}
                                                </p>
                                            )}
                                        </div>
                                    </div>
                                    <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400 shrink-0">
                                        {isUrl ? 'Abrir ➔' : 'Enviar ➔'}
                                    </span>
                                </button>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* BARRA INFERIOR DE ENVIO DE MENSAGEM DO WHATSAPP */}
            <form
                onSubmit={handleSendMessage}
                className="h-12 bg-[#f0f2f5] dark:bg-[#202c33] px-2 flex items-center gap-1.5 shrink-0 border-t border-slate-200/60 dark:border-slate-800/80"
            >
                <button
                    type="button"
                    className="p-1.5 text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
                    title="Emojis"
                >
                    <Smile className="h-4 w-4" />
                </button>
                <button
                    type="button"
                    className="p-1.5 text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
                    title="Anexar arquivo"
                >
                    <Paperclip className="h-4 w-4" />
                </button>

                <input
                    type="text"
                    value={inputMessage}
                    onChange={(e) => setInputMessage(e.target.value)}
                    placeholder="Mensagem..."
                    className="flex-1 bg-white dark:bg-[#2a3942] text-xs px-3 py-1.5 rounded-full border border-slate-200 dark:border-slate-700 focus:outline-hidden focus:ring-1 focus:ring-emerald-500 text-slate-900 dark:text-slate-100"
                />

                <button
                    type="submit"
                    className="p-2 rounded-full bg-[#00a884] hover:bg-[#008f6f] text-white transition-colors shrink-0 shadow-xs"
                    title="Enviar resposta"
                >
                    {inputMessage.trim() ? (
                        <Send className="h-3.5 w-3.5" />
                    ) : (
                        <Mic className="h-3.5 w-3.5" />
                    )}
                </button>
            </form>
        </div>
    );
}
