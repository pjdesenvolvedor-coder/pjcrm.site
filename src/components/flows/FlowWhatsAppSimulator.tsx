'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import type { Node, Edge } from '@xyflow/react';
import type { FlowNodeData } from '@/lib/types';
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
        menuOptions?: Array<{ id: string; label: string; description?: string }>;
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
function normalizeMenuOptions(options: any): Array<{ id: string; label: string; description?: string }> {
    if (!options) return [];
    const list = Array.isArray(options)
        ? options
        : typeof options === 'object' && options !== null
        ? Object.values(options)
        : [];
    return list.filter(Boolean).map((opt: any, idx: number) => {
        if (typeof opt === 'string') return { id: String(idx + 1), label: opt, description: '' };
        return {
            id: String(opt.id || idx + 1),
            label: String(opt.label || opt.text || opt.title || `Opção ${idx + 1}`),
            description: opt.description ? String(opt.description) : '',
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

    // Encontra o melhor cliente ativo da base do CRM para testar com fidelidade máxima
    const sampleClient = React.useMemo(() => {
        if (!clients || clients.length === 0) return null;
        return clients.find((c: any) => c.status === 'Ativo') || clients[0];
    }, [clients]);

    // Rola para a última mensagem automaticamente
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages, isTyping, currentNotice]);

    // Executa um nó com fidelidade total ao fluxo
    const executeNode = useCallback(
        async (nodeId: string) => {
            if (executionRef.current.isCancelled) return;

            const node = nodes.find((n) => n.id === nodeId);
            if (!node) {
                setCurrentNotice('Nó não encontrado no fluxo.');
                return;
            }

            const data = node.data as FlowNodeData;

            const formatText = (txt?: string) => {
                if (!txt) return '';

                const cName = sampleClient?.name || 'Pedro Henrique';
                const cFirstName = cName.split(' ')[0] || 'Pedro';
                const cPhone = sampleClient?.phone || '5511999999999';

                let cEmail = 'cliente@email.com';
                if (sampleClient?.email) {
                    if (Array.isArray(sampleClient.email)) {
                        cEmail = sampleClient.email[0] || 'cliente@email.com';
                    } else if (typeof sampleClient.email === 'string') {
                        cEmail = sampleClient.email;
                    }
                }

                const cPassword = sampleClient?.password || sampleClient?.senha || '123456';
                const cScreen = sampleClient?.screen || sampleClient?.tela || 'Tela 1';
                const cPinScreen = sampleClient?.pinScreen || sampleClient?.pin_tela || '8888';
                const cPlan = sampleClient?.subscription || sampleClient?.plan || sampleClient?.plano || 'Plano Completo VIP';
                const cPayment = sampleClient?.paymentMethod || sampleClient?.metodo_pagamento || 'PIX';

                let cAmount = 'R$ 35,00';
                if (sampleClient?.amountPaid) {
                    const raw = String(sampleClient.amountPaid);
                    cAmount = raw.includes('R$') ? raw : `R$ ${raw}`;
                }

                let cDueDate = '15/10/2026';
                if (sampleClient?.dueDate) {
                    try {
                        const d = typeof sampleClient.dueDate.toDate === 'function'
                            ? sampleClient.dueDate.toDate()
                            : new Date(sampleClient.dueDate);
                        cDueDate = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
                    } catch {}
                }

                const cStatus = sampleClient?.status || 'Ativo';
                const cLink = sampleClient?.accessLink || sampleClient?.link || 'https://pjcrm.site/acesso';
                const cNotes = sampleClient?.notes || 'Cliente VIP';

                // Buscar registros do mesmo cliente na lista de clientes para simulação realista de múltiplas assinaturas
                const clientPhoneDigits = (sampleClient?.phone || '').replace(/\D/g, '');
                const relatedDocs = Array.isArray(clients) && clients.length > 0 && clientPhoneDigits
                    ? clients.filter((c: any) => (c.phone || '').replace(/\D/g, '') === clientPhoneDigits)
                    : sampleClient ? [sampleClient] : [];

                const sampleDocs = relatedDocs.length > 0 ? relatedDocs : [
                    { subscription: cPlan, status: 'Ativo', dueDate: '2026-10-15', amountPaid: '35,00' },
                    { subscription: 'Spotify Premium Família', status: 'Vencido', dueDate: '2026-10-01', amountPaid: '21,90' },
                ];

                const formatSimSubLine = (c: any, withStatus = false) => {
                    const name = (c.subscription || c.plan || c.plano || 'Assinatura').trim();
                    const parts: string[] = [];
                    if (withStatus && c.status) parts.push(c.status);
                    if (c.dueDate) {
                        try {
                            const d = typeof c.dueDate.toDate === 'function' ? c.dueDate.toDate() : new Date(c.dueDate);
                            parts.push(`Vencimento: ${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`);
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
                    ? activeListSim.map((c: any) => formatSimSubLine(c, false)).join('\n')
                    : `• ${cPlan} (Vencimento: ${cDueDate} - ${cAmount})`;

                const cOverdueSubs = overdueListSim.length > 0
                    ? overdueListSim.map((c: any) => formatSimSubLine(c, false)).join('\n')
                    : 'Nenhuma assinatura vencida encontrada.';

                const cAllSubs = sampleDocs.map((c: any) => formatSimSubLine(c, true)).join('\n');

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
                    .replace(/\{notas\}/gi, cNotes)
                    .replace(/\{observacoes\}/gi, cNotes)
                    .replace(/\{assinaturas_ativas\}/gi, cActiveSubs)
                    .replace(/\{planos_ativos\}/gi, cActiveSubs)
                    .replace(/\{assinaturas_vencidas\}/gi, cOverdueSubs)
                    .replace(/\{planos_vencidos\}/gi, cOverdueSubs)
                    .replace(/\{todas_assinaturas\}/gi, cAllSubs)
                    .replace(/\{todas_as_assinaturas\}/gi, cAllSubs)
                    .replace(/\{assinaturas\}/gi, sampleDocs.length > 1 ? cAllSubs : cPlan);
            };

            // 0. START (Ponto de Partida / Início do Fluxo)
            if (data.nodeType === 'start') {
                const nextEdge = edges.find((e) => e.source === nodeId);
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
                const nextEdge = edges.find((e) => e.source === nodeId);
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

                // Espera entre 1 e 3 segundos no preview para fluidez
                const waitSeconds = Math.min(Math.max(data.delaySeconds || 2, 1), 3);
                await sleep(waitSeconds * 1000);
                if (executionRef.current.isCancelled) return;
                setIsTyping(false);

                const nextEdge = edges.find((e) => e.source === nodeId);
                if (nextEdge && nextEdge.target) {
                    await executeNode(nextEdge.target);
                } else {
                    setCurrentNotice('Fim do fluxo após o atraso inteligente.');
                }
            }
            // 3. AÇÃO
            else if (data.nodeType === 'action') {
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

                const nextEdge = edges.find((e) => e.source === nodeId);
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
                        menuButtonTitle: data.menuButtonTitle || 'VER OPÇÕES',
                        menuOptions: normalizeMenuOptions(data.menuOptions),
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
                setMessages((prev) => [
                    ...prev,
                    {
                        id: `sys_${Date.now()}`,
                        sender: 'system',
                        text: '🔍 *Simulação:* Contato verificado no CRM como *Cliente Cadastrado* (Pedro Henrique - Plano VIP). Seguindo rota verde...',
                        time: getCurrentTime(),
                    },
                ]);
                await sleep(700);
                if (executionRef.current.isCancelled) return;

                // Segue a saída 'is_client' (Cliente Cadastrado) se existir, ou fallback
                const clientEdge =
                    edges.find((e) => e.source === nodeId && e.sourceHandle === 'is_client') ||
                    edges.find((e) => e.source === nodeId);

                if (clientEdge && clientEdge.target) {
                    await executeNode(clientEdge.target);
                } else {
                    const notClientEdge = edges.find((e) => e.source === nodeId && e.sourceHandle === 'not_client');
                    if (notClientEdge && notClientEdge.target) {
                        await executeNode(notClientEdge.target);
                    } else {
                        setCurrentNotice('Fim do fluxo após a verificação de cliente CRM.');
                    }
                }
            }
        },
        [nodes, edges]
    );

    // Inicia a simulação a partir do nó inicial (in-degree == 0)
    const restartSimulation = useCallback(() => {
        executionRef.current.isCancelled = true;
        executionRef.current = { isCancelled: false };

        setMessages([]);
        setCurrentNotice(null);
        setIsTyping(false);
        setActiveMenuNodeId(null);
        setIsListDrawerOpen(false);

        if (!nodes || nodes.length === 0) {
            setCurrentNotice('O fluxo está vazio. Adicione blocos no canva para testar.');
            return;
        }

        // Identifica o nó de início (prioriza o bloco de início 'start', ou nó sem entrada / primeiro nó)
        const explicitStartNode = nodes.find((n) => (n.data as any)?.nodeType === 'start');
        const targetNodeIds = new Set(edges.map((e) => e.target));
        const rootNode = explicitStartNode || nodes.find((n) => !targetNodeIds.has(n.id)) || nodes[0];

        if (rootNode) {
            // Executa com leve atraso inicial para efeito realista
            setTimeout(() => {
                if (!executionRef.current.isCancelled) {
                    executeNode(rootNode.id);
                }
            }, 300);
        }
    }, [nodes, edges, executeNode]);

    // Ao abrir o componente, inicia a simulação automaticamente
    useEffect(() => {
        if (open) {
            restartSimulation();
        } else {
            executionRef.current.isCancelled = true;
        }
    }, [open, restartSimulation]);

    // Tratar clique em opção de menu (com fidelidade estrita às arestas conectadas)
    const handleSelectOption = async (option: { id: string; label: string }, menuNodeId: string) => {
        if (!activeMenuNodeId) return;

        // 1. Mensagem de resposta do usuário
        const userMsg: SimMessage = {
            id: `user_${Date.now()}`,
            sender: 'user',
            text: option.label,
            time: getCurrentTime(),
        };
        setMessages((prev) => [...prev, userMsg]);
        setActiveMenuNodeId(null);
        setIsListDrawerOpen(false);
        setCurrentNotice(null);

        // 2. Procurar aresta que sai dessa opção específica (sourceHandle === option.id ou opt_${idx+1})
        const nodeEdges = edges.filter((e) => e.source === menuNodeId);
        let matchedEdge = nodeEdges.find((e) => e.sourceHandle === option.id);

        if (!matchedEdge) {
            const menuNode = nodes.find((n) => n.id === menuNodeId);
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
            const menuNode = nodes.find((n) => n.id === activeMenuNodeId);
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
                const nodeEdges = edges.filter((e) => e.source === activeMenuNodeId);
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
            }
        }

        // Se o usuário digitou algo fora do menu ou nenhuma opção bateu:
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
                        onClick={restartSimulation}
                        className="p-1.5 rounded-lg hover:bg-white/15 text-white/90 hover:text-white transition-all group"
                        title="Reiniciar fluxo do início"
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
                                            <div className="space-y-1 pt-1">
                                                {normalizeMenuOptions(msg.menuData.menuOptions).map((opt, idx) => (
                                                    <button
                                                        key={opt.id || `btn_${idx}`}
                                                        type="button"
                                                        disabled={activeMenuNodeId !== msg.nodeId}
                                                        onClick={() => msg.nodeId && handleSelectOption(opt, msg.nodeId)}
                                                        className="w-full py-2 px-3 text-center rounded-lg bg-slate-50 dark:bg-slate-800 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 text-indigo-700 dark:text-indigo-400 font-bold text-xs border border-slate-200 dark:border-slate-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.99]"
                                                    >
                                                        {opt.label}
                                                    </button>
                                                ))}
                                            </div>
                                        )}

                                        {/* 3. MODO NUMÉRICO: OPÇÕES CLICÁVEIS */}
                                        {msg.menuData.menuType === 'numeric' && (
                                            <div className="space-y-1.5 pt-1 font-medium">
                                                {normalizeMenuOptions(msg.menuData.menuOptions).map((opt, idx) => (
                                                    <button
                                                        key={opt.id || `num_${idx}`}
                                                        type="button"
                                                        disabled={activeMenuNodeId !== msg.nodeId}
                                                        onClick={() => msg.nodeId && handleSelectOption(opt, msg.nodeId)}
                                                        className="w-full flex items-center justify-between p-1.5 px-2.5 rounded-lg bg-slate-50 dark:bg-slate-800/80 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 text-left text-xs border border-slate-200 dark:border-slate-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                                    >
                                                        <div>
                                                            <span className="font-bold text-indigo-600 dark:text-indigo-400 mr-1.5">
                                                                {idx + 1}.
                                                            </span>
                                                            <span className="font-semibold text-slate-800 dark:text-slate-200">
                                                                {opt.label}
                                                            </span>
                                                            {opt.description && (
                                                                <p className="text-[10px] text-muted-foreground italic pl-4">
                                                                    {opt.description}
                                                                </p>
                                                            )}
                                                        </div>
                                                        <span className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950 px-1.5 py-0.5 rounded">
                                                            Enviar
                                                        </span>
                                                    </button>
                                                ))}
                                            </div>
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
                        {currentDrawerMenu.options.map((opt) => (
                            <button
                                key={opt.id}
                                type="button"
                                onClick={() => handleSelectOption(opt, currentDrawerMenu.nodeId)}
                                className="w-full flex items-center justify-between p-2 rounded-xl bg-slate-50 dark:bg-slate-800 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 text-left border border-slate-200 dark:border-slate-700 hover:border-emerald-300 dark:hover:border-emerald-800 transition-colors group"
                            >
                                <div>
                                    <p className="text-xs font-bold text-slate-800 dark:text-slate-100 group-hover:text-emerald-700 dark:group-hover:text-emerald-400">
                                        {opt.label}
                                    </p>
                                    {opt.description && (
                                        <p className="text-[10px] text-muted-foreground">
                                            {opt.description}
                                        </p>
                                    )}
                                </div>
                                <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400">
                                    Enviar ➔
                                </span>
                            </button>
                        ))}
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
