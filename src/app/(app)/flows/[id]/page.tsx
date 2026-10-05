'use client';

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
    ReactFlow,
    Background,
    Controls,
    MiniMap,
    useNodesState,
    useEdgesState,
    addEdge,
    Connection,
    Edge,
    Node,
    BackgroundVariant,
    ConnectionMode,
    ConnectionLineType,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import { useFirebase, useDoc, useCollection, useMemoFirebase } from '@/firebase';
import { doc, collection, setDoc, updateDoc } from 'firebase/firestore';
import type { FlowDefinition, FlowNodeData, UazapiConnectionConfig } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';
import { FlowCustomNode } from '@/components/flows/FlowCustomNode';
import { NodeConfigDialog } from '@/components/flows/NodeConfigDialog';
import { FlowNodeActionsContext } from '@/components/flows/FlowNodeActionsContext';
import { FlowWhatsAppSimulator } from '@/components/flows/FlowWhatsAppSimulator';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import {
    ArrowLeft,
    Save,
    Play,
    Loader2,
    Star,
    Grid,
    Clock,
    Zap,
    Rocket,
    Plus,
    CheckCircle2,
    Sparkles,
    ChevronLeft,
    ChevronRight,
} from 'lucide-react';

const nodeTypes = {
    customFlow: FlowCustomNode,
};

export default function FlowCanvasEditorPage() {
    const params = useParams();
    const router = useRouter();
    const flowId = params?.id as string;

    const { firestore, effectiveUserId } = useFirebase();
    const { toast } = useToast();

    // Buscar dados do fluxo
    const flowDocRef = useMemoFirebase(() => {
        if (!effectiveUserId || !flowId) return null;
        return doc(firestore, 'users', effectiveUserId, 'flows', flowId);
    }, [firestore, effectiveUserId, flowId]);
    const { data: flowData, isLoading: isLoadingFlow } = useDoc<FlowDefinition>(flowDocRef);

    // Buscar lista de fluxos (para conectar subfluxos)
    const flowsQuery = useMemoFirebase(() => {
        if (!effectiveUserId) return null;
        return collection(firestore, 'users', effectiveUserId, 'flows');
    }, [firestore, effectiveUserId]);
    const { data: allFlows } = useCollection<FlowDefinition>(flowsQuery);

    // Buscar conexão WhatsApp
    const connectionDocRef = useMemoFirebase(() => {
        if (!effectiveUserId) return null;
        return doc(firestore, 'users', effectiveUserId, 'settings', 'uazapi_flow');
    }, [firestore, effectiveUserId]);
    const { data: connectionConfig } = useDoc<UazapiConnectionConfig>(connectionDocRef);

    // Estado do fluxo
    const [flowName, setFlowName] = useState('Novo Fluxo');
    const [isActive, setIsActive] = useState(true);
    const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
    const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
    const [isSaving, setIsSaving] = useState(false);
    const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'unsaved'>('saved');

    // Refs para controle do salvamento automático em segundo plano sem travar o canva
    const isInitialLoadedRef = useRef(false);
    const autoSaveTimerRef = useRef<NodeJS.Timeout | null>(null);
    const isSavingRef = useRef(false);
    const pendingSaveRef = useRef(false);
    const stateRef = useRef({
        nodes,
        edges,
        flowName,
        isActive,
    });

    // Manter stateRef sempre atualizado de forma síncrona com os valores mais recentes
    useEffect(() => {
        stateRef.current = { nodes, edges, flowName, isActive };
    }, [nodes, edges, flowName, isActive]);

    // Controle da paleta de blocos (minimizar / expandir)
    const [isPaletteMinimized, setIsPaletteMinimized] = useState(false);

    // Seleção de arestas/conexões (destaque em vermelho e exclusão com duplo clique)
    const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);

    // Modal de edição do nó
    const [selectedNode, setSelectedNode] = useState<any | null>(null);
    const [isConfigOpen, setIsConfigOpen] = useState(false);

    // Modal de teste real
    const [isTestOpen, setIsTestOpen] = useState(false);
    const [testPhone, setTestPhone] = useState('');
    const [isTesting, setIsTesting] = useState(false);

    // Simulador interativo do WhatsApp no canvas
    const [isSimulatorOpen, setIsSimulatorOpen] = useState(false);

    // Carregar nós e arestas iniciais (somente uma vez, para não resetar o canva nem interromper o usuário)
    useEffect(() => {
        if (flowData && !isInitialLoadedRef.current) {
            isInitialLoadedRef.current = true;
            setFlowName(flowData.name || 'Fluxo sem nome');
            setIsActive(flowData.isActive !== false);
            if (Array.isArray(flowData.nodes) && flowData.nodes.length > 0) {
                setNodes(flowData.nodes);
            }
            if (Array.isArray(flowData.edges)) {
                setEdges(flowData.edges);
            }
            setSaveStatus('saved');
        }
    }, [flowData, setNodes, setEdges]);

    // Execução assíncrona do salvamento em segundo plano sem congelar a UI
    const executeAutoSave = useCallback(async () => {
        if (!effectiveUserId || !flowDocRef || !isInitialLoadedRef.current) return;
        if (isSavingRef.current) {
            pendingSaveRef.current = true;
            return;
        }

        isSavingRef.current = true;
        setSaveStatus('saving');

        const snapshot = stateRef.current;

        try {
            await updateDoc(flowDocRef, {
                name: snapshot.flowName.trim() || 'Fluxo sem nome',
                isActive: snapshot.isActive,
                nodes: snapshot.nodes,
                edges: snapshot.edges,
                updatedAt: new Date().toISOString(),
            });
            setSaveStatus('saved');
        } catch (err: any) {
            console.error('[FlowAutoSave] Erro ao salvar fluxo:', err);
            setSaveStatus('unsaved');
        } finally {
            isSavingRef.current = false;
            if (pendingSaveRef.current) {
                pendingSaveRef.current = false;
                scheduleAutoSave(1000);
            }
        }
    }, [effectiveUserId, flowDocRef]);

    // Agendador de salvamento com debounce inteligente
    const scheduleAutoSave = useCallback(
        (delayMs = 1200) => {
            if (!isInitialLoadedRef.current) return;
            setSaveStatus('unsaved');

            if (autoSaveTimerRef.current) {
                clearTimeout(autoSaveTimerRef.current);
            }

            autoSaveTimerRef.current = setTimeout(() => {
                executeAutoSave();
            }, delayMs);
        },
        [executeAutoSave]
    );

    // Limpar timer pendente ao desmontar o componente
    useEffect(() => {
        return () => {
            if (autoSaveTimerRef.current) {
                clearTimeout(autoSaveTimerRef.current);
            }
        };
    }, []);

    // Excluir nó do fluxo e todas as suas conexões
    const handleDeleteNode = useCallback(
        (nodeId: string) => {
            setNodes((nds) => nds.filter((n) => n.id !== nodeId));
            setEdges((eds) => eds.filter((e) => e.source !== nodeId && e.target !== nodeId));
            if (selectedNode?.id === nodeId) {
                setSelectedNode(null);
                setIsConfigOpen(false);
            }
            scheduleAutoSave(400);
            toast({
                title: 'Bloco excluído',
                description: 'O bloco e suas conexões foram removidos com sucesso.',
            });
        },
        [setNodes, setEdges, selectedNode, scheduleAutoSave, toast]
    );

    // Interceptar mudanças de nós (ex: arrastar, selecionar, remover) sem travar
    const handleNodesChange = useCallback(
        (changes: any) => {
            onNodesChange(changes);
            // Se algum nó foi removido (ex: pelo teclado Delete/Backspace)
            const removedIds = changes.filter((c: any) => c.type === 'remove').map((c: any) => c.id);
            if (removedIds.length > 0) {
                setEdges((eds) => eds.filter((e) => !removedIds.includes(e.source) && !removedIds.includes(e.target)));
            }
            // Salvar apenas se houver movimentação de posição, dimensão ou remoção (ignorar simples clique/seleção)
            const hasStructuralChange = changes.some((c: any) => c.type !== 'select');
            if (hasStructuralChange) {
                scheduleAutoSave(1200); // 1.2s após parar de arrastar
            }
        },
        [onNodesChange, setEdges, scheduleAutoSave]
    );

    // Interceptar mudanças de arestas
    const handleEdgesChange = useCallback(
        (changes: any) => {
            onEdgesChange(changes);
            const hasStructuralChange = changes.some((c: any) => c.type !== 'select');
            if (hasStructuralChange) {
                scheduleAutoSave(800);
            }
        },
        [onEdgesChange, scheduleAutoSave]
    );

    // Conectar nós (ligando bolinha com bolinha)
    const onConnect = useCallback(
        (connection: Connection) => {
            setEdges((eds) =>
                addEdge(
                    {
                        ...connection,
                        animated: true,
                        style: { stroke: '#6366f1', strokeWidth: 2.5 },
                    },
                    eds
                )
            );
            scheduleAutoSave(500);
        },
        [setEdges, scheduleAutoSave]
    );

    // Seleção de aresta ao clicar (fica vermelho para identificar no fluxo)
    const onEdgeClick = useCallback((_: React.MouseEvent, edge: Edge) => {
        setSelectedEdgeId(edge.id);
    }, []);

    // Excluir aresta ao clicar 2 vezes (duplo clique)
    const onEdgeDoubleClick = useCallback(
        (_: React.MouseEvent, edge: Edge) => {
            setEdges((eds) => eds.filter((e) => e.id !== edge.id));
            setSelectedEdgeId((current) => (current === edge.id ? null : current));
            scheduleAutoSave(500);
            toast({
                title: 'Conexão removida',
                description: 'A ligação entre os blocos foi excluída.',
            });
        },
        [setEdges, scheduleAutoSave, toast]
    );

    // Desmarcar aresta selecionada ao clicar no fundo
    const onPaneClick = useCallback(() => {
        setSelectedEdgeId(null);
    }, []);

    // Mapear arestas com destaque em vermelho para a selecionada
    const displayEdges = useMemo(() => {
        return edges.map((edge) => {
            const isSelected = edge.id === selectedEdgeId;
            return {
                ...edge,
                selected: isSelected,
                animated: true,
                style: {
                    ...edge.style,
                    stroke: isSelected ? '#ef4444' : '#6366f1',
                    strokeWidth: isSelected ? 3.5 : 2.5,
                },
            };
        });
    }, [edges, selectedEdgeId]);

    // Ao clicar em um nó no canvas
    const onNodeClick = useCallback((_: any, node: Node) => {
        setSelectedNode(node);
        setIsConfigOpen(true);
    }, []);

    // Adicionar novo bloco através da paleta flutuante (sem Condição e sem Randomizador)
    const handleAddBlock = (type: FlowNodeData['nodeType']) => {
        const id = `node_${Date.now()}`;
        // Posição no centro da tela ou escalonada
        const xOffset = 250 + Math.random() * 80;
        const yOffset = 180 + Math.random() * 80;

        let initialData: FlowNodeData = {
            nodeType: type,
            label: '',
        };

        switch (type) {
            case 'content':
                initialData = {
                    nodeType: 'content',
                    contentType: 'text',
                    label: 'Mensagem',
                    text: 'Olá! Como posso ajudar você hoje?',
                };
                break;
            case 'menu':
                initialData = {
                    nodeType: 'menu',
                    label: 'Menu',
                    menuType: 'list',
                    menuButtonTitle: 'VER OPÇÕES',
                    menuQuestionText: 'Escolha uma das opções abaixo:',
                    menuOptions: [
                        { id: 'opt_1', label: 'Opção 1', description: 'Detalhes da opção 1' },
                        { id: 'opt_2', label: 'Opção 2', description: 'Detalhes da opção 2' },
                    ],
                };
                break;
            case 'delay':
                initialData = {
                    nodeType: 'delay',
                    label: 'Atraso Inteligente',
                    delaySeconds: 3,
                    delayPresence: 'composing',
                };
                break;
            case 'action':
                initialData = {
                    nodeType: 'action',
                    label: 'Ação',
                    actionType: 'open_support',
                    text: 'Transferido para atendimento humano',
                };
                break;
            case 'flow_connect':
                initialData = {
                    nodeType: 'flow_connect',
                    label: 'Conectar Fluxo',
                };
                break;
            default:
                return;
        }

        const newNode: Node = {
            id,
            type: 'customFlow',
            position: { x: xOffset, y: yOffset },
            data: initialData,
        };

        setNodes((nds) => [...nds, newNode]);
        scheduleAutoSave(500);
        toast({ title: 'Bloco adicionado!', description: 'Clique no bloco para configurar.' });
    };

    // Atualizar dados do nó configurado
    const handleSaveNodeData = (nodeId: string, updatedData: FlowNodeData) => {
        setNodes((nds) =>
            nds.map((node) => {
                if (node.id === nodeId) {
                    return {
                        ...node,
                        data: updatedData,
                    };
                }
                return node;
            })
        );
        scheduleAutoSave(300);
        toast({ title: 'Bloco atualizado!' });
    };

    // Salvar manualmente (se o usuário clicar no botão Salvar)
    const handleSaveFlow = async () => {
        if (!effectiveUserId || !flowDocRef) return;
        if (autoSaveTimerRef.current) {
            clearTimeout(autoSaveTimerRef.current);
        }
        setIsSaving(true);

        try {
            await executeAutoSave();
            toast({
                title: 'Fluxo salvo com sucesso!',
                description: 'Todas as alterações foram salvas.',
            });
        } catch (err: any) {
            toast({ variant: 'destructive', title: 'Erro ao salvar fluxo', description: err.message });
        } finally {
            setIsSaving(false);
        }
    };

    // Disparar teste do fluxo para um WhatsApp
    const handleTestFlow = async () => {
        if (!testPhone.trim()) {
            toast({ variant: 'destructive', title: 'Número obrigatório', description: 'Informe o número com DDD para receber o teste.' });
            return;
        }

        if (nodes.length === 0) {
            toast({ variant: 'destructive', title: 'Fluxo vazio', description: 'Adicione pelo menos um bloco antes de testar.' });
            return;
        }

        setIsTesting(true);
        try {
            const res = await fetch('/api/flows/test', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    userId: effectiveUserId,
                    flowId,
                    phoneNumber: testPhone.trim(),
                }),
            });

            const data = await res.json();
            if (res.ok && data.success) {
                toast({
                    title: 'Teste enviado!',
                    description: `O início do fluxo foi disparado para ${testPhone}.`,
                });
                setIsTestOpen(false);
            } else {
                toast({
                    variant: 'destructive',
                    title: 'Falha no teste',
                    description: data.error || 'Não foi possível disparar o teste para o WhatsApp.',
                });
            }
        } catch (err: any) {
            toast({ variant: 'destructive', title: 'Erro ao testar', description: err.message });
        } finally {
            setIsTesting(false);
        }
    };

    return (
        <div className="flex flex-col h-[calc(100vh-4rem)] w-full overflow-hidden bg-slate-50 dark:bg-slate-950">
            {/* BARRA SUPERIOR DO CANVA */}
            <div className="h-14 border-b bg-card px-4 flex items-center justify-between z-10 shadow-sm shrink-0">
                <div className="flex items-center gap-3">
                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => router.push('/flows')}
                        className="h-8 w-8 text-muted-foreground hover:text-foreground"
                    >
                        <ArrowLeft className="h-4 w-4" />
                    </Button>

                    <div className="flex items-center gap-2">
                        <Input
                            value={flowName}
                            onChange={(e) => {
                                setFlowName(e.target.value);
                                scheduleAutoSave(1000);
                            }}
                            className="font-bold text-sm h-8 max-w-[260px] bg-transparent border-transparent hover:border-slate-300 focus:border-indigo-500 focus:bg-background"
                        />
                        <Badge
                            variant="outline"
                            className={`text-[11px] cursor-pointer ${
                                isActive
                                    ? 'border-emerald-300 text-emerald-700 bg-emerald-50 dark:bg-emerald-950/20'
                                    : 'text-muted-foreground'
                            }`}
                            onClick={() => {
                                setIsActive(!isActive);
                                scheduleAutoSave(300);
                            }}
                        >
                            {isActive ? '🟢 Ativo' : '⚪ Pausado'}
                        </Badge>
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    {/* INDICADOR DE STATUS DO SALVAMENTO AUTOMÁTICO */}
                    <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs transition-colors bg-slate-100 dark:bg-slate-800">
                        {saveStatus === 'saved' && (
                            <div className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400">
                                <CheckCircle2 className="h-3.5 w-3.5" />
                                <span className="font-medium text-[11px] hidden sm:inline">Salvo automaticamente</span>
                            </div>
                        )}
                        {saveStatus === 'saving' && (
                            <div className="flex items-center gap-1.5 text-indigo-600 dark:text-indigo-400">
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                <span className="font-medium text-[11px] hidden sm:inline">Salvando alterações...</span>
                            </div>
                        )}
                        {saveStatus === 'unsaved' && (
                            <div className="flex items-center gap-1.5 text-amber-600 dark:text-amber-400">
                                <span className="h-2 w-2 rounded-full bg-amber-500 animate-pulse" />
                                <span className="font-medium text-[11px] hidden sm:inline">Alterações pendentes...</span>
                            </div>
                        )}
                    </div>

                    <Button
                        variant={isSimulatorOpen ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => setIsSimulatorOpen(!isSimulatorOpen)}
                        className={`text-xs gap-1.5 h-8 transition-all ${
                            isSimulatorOpen
                                ? 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm ring-2 ring-emerald-400/40'
                                : 'border-indigo-200 text-indigo-700 hover:bg-indigo-50 dark:border-indigo-800 dark:text-indigo-300'
                        }`}
                        title="Simular e testar fluxo no WhatsApp interativo"
                    >
                        <Play className="h-3.5 w-3.5 fill-current" />
                        Testar Fluxo
                    </Button>

                    <Button
                        onClick={handleSaveFlow}
                        disabled={isSaving || saveStatus === 'saving'}
                        size="sm"
                        className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs gap-1.5 h-8 shadow-sm"
                    >
                        {isSaving || saveStatus === 'saving' ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                            <Save className="h-3.5 w-3.5" />
                        )}
                        Salvar
                    </Button>
                </div>
            </div>

            {/* ÁREA CENTRAL DO CANVA COM PALETA FLUTUANTE */}
            <div className="relative flex-1 w-full h-full">
                {/* SIMULADOR CLONADO DO WHATSAPP (DROPDOWN NO CANTO DIREITO SOB O BOTÃO) */}
                <FlowWhatsAppSimulator
                    open={isSimulatorOpen}
                    onClose={() => setIsSimulatorOpen(false)}
                    nodes={nodes}
                    edges={edges}
                    flowName={flowName}
                    onOpenRealTest={() => setIsTestOpen(true)}
                />

                {/* PALETA LATERAL FLUTUANTE (MINIMIZÁVEL E COMPACTA) */}
                {isPaletteMinimized ? (
                    <div className="absolute top-4 left-4 z-20 animate-in fade-in-50 slide-in-from-left-2">
                        <button
                            type="button"
                            onClick={() => setIsPaletteMinimized(false)}
                            className="flex items-center gap-2 px-3 py-2 bg-card/95 hover:bg-card backdrop-blur-md rounded-xl border-2 border-slate-200/80 dark:border-slate-800 shadow-xl text-xs font-semibold text-slate-800 dark:text-slate-200 hover:border-indigo-300 dark:hover:border-indigo-700 transition-all group"
                            title="Expandir painel de blocos"
                        >
                            <div className="p-1 rounded-md bg-indigo-50 dark:bg-indigo-950 text-indigo-600 group-hover:scale-110 transition-transform">
                                <Plus className="h-3.5 w-3.5" />
                            </div>
                            <span>Blocos</span>
                            <ChevronRight className="h-3.5 w-3.5 text-muted-foreground group-hover:text-indigo-600 group-hover:translate-x-0.5 transition-all" />
                        </button>
                    </div>
                ) : (
                    <div className="absolute top-4 left-4 z-20 bg-card/95 backdrop-blur-md rounded-2xl border-2 border-slate-200/80 dark:border-slate-800 shadow-xl p-2 py-2.5 w-[204px] space-y-0.5 select-none animate-in fade-in-50 slide-in-from-left-4">
                        <div className="flex items-center justify-between px-2 pb-1.5 pt-0.5 border-b border-border/50 mb-1">
                            <span className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground">
                                Adicionar Bloco
                            </span>
                            <button
                                type="button"
                                onClick={() => setIsPaletteMinimized(true)}
                                className="p-1 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors"
                                title="Minimizar painel"
                            >
                                <ChevronLeft className="h-3.5 w-3.5" />
                            </button>
                        </div>

                        {/* 1. CONTEÚDO */}
                        <button
                            type="button"
                            onClick={() => handleAddBlock('content')}
                            className="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-[11.5px] font-semibold text-slate-800 dark:text-slate-200 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-all text-left group"
                        >
                            <div className="p-1 rounded-md bg-rose-100 dark:bg-rose-950 text-rose-500 group-hover:scale-110 transition-transform">
                                <Star className="h-3.5 w-3.5 fill-current" />
                            </div>
                            <span>Conteúdo</span>
                        </button>

                        {/* 2. MENU */}
                        <button
                            type="button"
                            onClick={() => handleAddBlock('menu')}
                            className="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-[11.5px] font-semibold text-slate-800 dark:text-slate-200 hover:bg-indigo-50 dark:hover:bg-indigo-950/30 transition-all text-left group"
                        >
                            <div className="p-1 rounded-md bg-indigo-100 dark:bg-indigo-950 text-indigo-600 group-hover:scale-110 transition-transform">
                                <Grid className="h-3.5 w-3.5" />
                            </div>
                            <span>Menu</span>
                        </button>

                        {/* 3. AÇÃO */}
                        <button
                            type="button"
                            onClick={() => handleAddBlock('action')}
                            className="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-[11.5px] font-semibold text-slate-800 dark:text-slate-200 hover:bg-amber-50 dark:hover:bg-amber-950/30 transition-all text-left group"
                        >
                            <div className="p-1 rounded-md bg-amber-100 dark:bg-amber-950 text-amber-500 group-hover:scale-110 transition-transform">
                                <Zap className="h-3.5 w-3.5 fill-current" />
                            </div>
                            <span>Ação</span>
                        </button>

                        {/* 4. CONEXÃO DE FLUXO */}
                        <button
                            type="button"
                            onClick={() => handleAddBlock('flow_connect')}
                            className="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-[11.5px] font-semibold text-slate-800 dark:text-slate-200 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 transition-all text-left group"
                        >
                            <div className="p-1 rounded-md bg-emerald-100 dark:bg-emerald-950 text-emerald-500 group-hover:scale-110 transition-transform">
                                <Rocket className="h-3.5 w-3.5" />
                            </div>
                            <span>Conexão de fluxo</span>
                        </button>

                        {/* 5. ATRASO INTELIGENTE */}
                        <button
                            type="button"
                            onClick={() => handleAddBlock('delay')}
                            className="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-[11.5px] font-semibold text-slate-800 dark:text-slate-200 hover:bg-orange-50 dark:hover:bg-orange-950/30 transition-all text-left group"
                        >
                            <div className="p-1 rounded-md bg-orange-100 dark:bg-orange-950 text-orange-500 group-hover:scale-110 transition-transform">
                                <Clock className="h-3.5 w-3.5" />
                            </div>
                            <span>Atraso inteligente</span>
                        </button>
                    </div>
                )}

                {/* REACT FLOW CANVAS */}
                <FlowNodeActionsContext.Provider value={{ onDeleteNode: handleDeleteNode }}>
                    <ReactFlow
                        nodes={nodes}
                        edges={displayEdges}
                        onNodesChange={handleNodesChange}
                        onEdgesChange={handleEdgesChange}
                        onConnect={onConnect}
                        onNodeClick={onNodeClick}
                        onEdgeClick={onEdgeClick}
                        onEdgeDoubleClick={onEdgeDoubleClick}
                        onPaneClick={onPaneClick}
                        connectionMode={ConnectionMode.Loose}
                        connectionLineType={ConnectionLineType.SmoothStep}
                        connectionLineStyle={{ stroke: '#6366f1', strokeWidth: 2.5 }}
                        nodeTypes={nodeTypes}
                        fitView
                        minZoom={0.2}
                        maxZoom={2}
                        defaultEdgeOptions={{
                            animated: true,
                            style: { stroke: '#6366f1', strokeWidth: 2.5 },
                        }}
                        className="bg-slate-50 dark:bg-slate-950"
                    >
                        <Background variant={BackgroundVariant.Dots} gap={16} size={1} color="#94a3b8" />
                        <Controls className="!bg-card !border-border !shadow-md" />
                        <MiniMap
                            className="!bg-card !border !border-border !rounded-xl !shadow-lg"
                            nodeColor={(n: any) => {
                                const type = n.data?.nodeType;
                                if (type === 'menu') return '#818cf8';
                                if (type === 'content') return '#f87171';
                                if (type === 'delay') return '#fb923c';
                                if (type === 'action') return '#facc15';
                                if (type === 'flow_connect') return '#4ade80';
                                return '#94a3b8';
                            }}
                        />
                    </ReactFlow>
                </FlowNodeActionsContext.Provider>
            </div>

            {/* MODAL DE CONFIGURAÇÃO DO NÓ (media_1791138953499.png) */}
            <NodeConfigDialog
                open={isConfigOpen}
                onOpenChange={setIsConfigOpen}
                node={selectedNode}
                flowsList={allFlows || []}
                onSave={handleSaveNodeData}
                onDelete={handleDeleteNode}
            />

            {/* MODAL DE DISPARO DE TESTE */}
            <Dialog open={isTestOpen} onOpenChange={setIsTestOpen}>
                <DialogContent className="max-w-md">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <Play className="h-5 w-5 text-indigo-600 fill-current" />
                            Testar Fluxo no WhatsApp
                        </DialogTitle>
                        <DialogDescription>
                            Envie a mensagem inicial deste fluxo diretamente para seu WhatsApp para testar a experiência.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-4 py-2">
                        <div className="space-y-2">
                            <Label htmlFor="testPhone" className="text-sm font-semibold">
                                Número de Telefone (com DDD)
                            </Label>
                            <Input
                                id="testPhone"
                                placeholder="Ex: 5511999999999"
                                value={testPhone}
                                onChange={(e) => setTestPhone(e.target.value)}
                            />
                            <p className="text-xs text-muted-foreground">
                                Inclua o código do país (55) e o DDD.
                            </p>
                        </div>

                        {connectionConfig?.status !== 'connected' && (
                            <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-xs">
                                ⚠️ Seu WhatsApp UazAPI não consta como conectado. Certifique-se de conectar a instância em &quot;Conectar WhatsApp&quot;.
                            </div>
                        )}
                    </div>

                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsTestOpen(false)}>
                            Cancelar
                        </Button>
                        <Button
                            onClick={handleTestFlow}
                            disabled={isTesting || !testPhone.trim()}
                            className="bg-indigo-600 hover:bg-indigo-700 text-white gap-2"
                        >
                            {isTesting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4 fill-current" />}
                            Disparar Teste
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
