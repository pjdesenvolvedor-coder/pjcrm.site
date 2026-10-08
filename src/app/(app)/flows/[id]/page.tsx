'use client';

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
    ReactFlow,
    Background,
    Controls,
    MiniMap,
    Panel,
    ControlButton,
    useNodesState,
    useEdgesState,
    addEdge,
    Connection,
    Edge,
    Node,
    BackgroundVariant,
    ConnectionMode,
    ConnectionLineType,
    ReactFlowProvider,
    useReactFlow,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import dagre from '@dagrejs/dagre';

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
    Undo2,
    Redo2,
    AlertTriangle,
    Trash2,
    Eye,
    EyeOff,
    UserCheck,
    GripVertical,
    PlayCircle,
} from 'lucide-react';

const nodeTypes = {
    customFlow: FlowCustomNode,
};

function FlowCanvasEditorContent() {
    const params = useParams();
    const router = useRouter();
    const flowId = params?.id as string;
    const { screenToFlowPosition, fitView } = useReactFlow();

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

    // Buscar clientes cadastrados no CRM (para simulação fiel com dados reais)
    const clientsQuery = useMemoFirebase(() => {
        if (!effectiveUserId) return null;
        return collection(firestore, 'users', effectiveUserId, 'clients');
    }, [firestore, effectiveUserId]);
    const { data: allClients } = useCollection<any>(clientsQuery);

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

    // Controle do MiniMap (minimizado por padrão, só aparece ao clicar no olhinho)
    const [showMiniMap, setShowMiniMap] = useState(false);

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

    // Confirmação antes de excluir nó
    const [nodePendingDelete, setNodePendingDelete] = useState<string | null>(null);

    // Rastreamento do mouse para colar blocos na coordenada exata do cursor
    const mousePosRef = useRef<{ clientX: number; clientY: number } | null>(null);
    // Bloco copiado para a área de transferência interna (Ctrl+C / Ctrl+V)
    const copiedNodeRef = useRef<Node | null>(null);
    // Bloco atualmente sob o ponteiro do mouse
    const hoveredNodeRef = useRef<Node | null>(null);

    // Histórico de alterações para Voltar (Desfazer / Ctrl+Z) e Refazer (Ctrl+Y)
    const historyRef = useRef<Array<{ nodes: Node[]; edges: Edge[] }>>([]);
    const redoStackRef = useRef<Array<{ nodes: Node[]; edges: Edge[] }>>([]);
    const [canUndo, setCanUndo] = useState(false);
    const [canRedo, setCanRedo] = useState(false);

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
            // Deduplicar nós por id para garantir que nunca fiquem duplicados no banco
            const uniqueNodesMap = new Map<string, any>();
            (snapshot.nodes || []).forEach((n: any) => {
                if (n && n.id) {
                    uniqueNodesMap.set(n.id, n);
                }
            });
            const deduplicatedNodes = Array.from(uniqueNodesMap.values());

            await updateDoc(flowDocRef, {
                name: snapshot.flowName.trim() || 'Fluxo sem nome',
                isActive: snapshot.isActive,
                nodes: deduplicatedNodes,
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

    // Salvar estado atual no histórico antes de alterações importantes
    const pushHistory = useCallback(() => {
        historyRef.current = [
            ...historyRef.current.slice(-30),
            { nodes: stateRef.current.nodes, edges: stateRef.current.edges },
        ];
        redoStackRef.current = [];
        setCanUndo(true);
        setCanRedo(false);
    }, []);

    // Função Voltar (Desfazer / Undo)
    const handleUndo = useCallback(() => {
        if (historyRef.current.length === 0) return;

        redoStackRef.current.push({
            nodes: stateRef.current.nodes,
            edges: stateRef.current.edges,
        });

        const previous = historyRef.current.pop();
        if (previous) {
            setNodes(previous.nodes);
            setEdges(previous.edges);
            scheduleAutoSave(400);
            toast({
                title: 'Ação desfeita!',
                description: 'O estado anterior foi restaurado com sucesso.',
            });
        }

        setCanUndo(historyRef.current.length > 0);
        setCanRedo(true);
    }, [setNodes, setEdges, scheduleAutoSave, toast]);

    // Função Avançar (Refazer / Redo)
    const handleRedo = useCallback(() => {
        if (redoStackRef.current.length === 0) return;

        historyRef.current.push({
            nodes: stateRef.current.nodes,
            edges: stateRef.current.edges,
        });

        const next = redoStackRef.current.pop();
        if (next) {
            setNodes(next.nodes);
            setEdges(next.edges);
            scheduleAutoSave(400);
            toast({
                title: 'Ação refeita!',
                description: 'Alteração reaplicada com sucesso.',
            });
        }

        setCanUndo(true);
        setCanRedo(redoStackRef.current.length > 0);
    }, [setNodes, setEdges, scheduleAutoSave, toast]);

    // Duplicar um bloco no canvas (via menu de 3 pontinhos, Ctrl+C / Ctrl+V ou Ctrl+D)
    const duplicateNode = useCallback(
        (nodeIdOrNode: string | Node, customPosition?: { x: number; y: number }) => {
            let sourceNode: Node | undefined;
            if (typeof nodeIdOrNode === 'string') {
                sourceNode = nodes.find((n) => n.id === nodeIdOrNode);
            } else {
                sourceNode = nodeIdOrNode;
            }

            if (!sourceNode) return;

            pushHistory();

            const newId = `node_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;

            // Clona profundamente os dados
            const clonedData: FlowNodeData = JSON.parse(JSON.stringify(sourceNode.data || {}));

            // Se for um nó de menu, gerar novos IDs únicos para as opções
            if (Array.isArray(clonedData.menuOptions)) {
                clonedData.menuOptions = clonedData.menuOptions.map((opt: any, idx: number) => ({
                    ...opt,
                    id: `opt_${Date.now()}_${idx + 1}`,
                }));
            }

            // Posição informada (ex: Ctrl+V na coordenada do cursor) ou deslocada do original
            const targetPos = customPosition || {
                x: Math.round(sourceNode.position.x + 50),
                y: Math.round(sourceNode.position.y + 50),
            };

            const newNode: Node = {
                id: newId,
                type: sourceNode.type || 'customFlow',
                position: targetPos,
                data: clonedData,
                selected: true,
            };

            // Desmarcar os outros nós e selecionar o bloco recém-duplicado
            setNodes((nds) => [
                ...nds.map((n) => ({ ...n, selected: false })),
                newNode,
            ]);
            setSelectedNode(newNode);

            scheduleAutoSave(500);

            toast({
                title: 'Bloco duplicado!',
                description: 'O novo bloco foi criado com sucesso.',
            });
        },
        [nodes, pushHistory, setNodes, scheduleAutoSave, toast]
    );

    // Abrir modal de configuração para um bloco específico (usado pelo menu de 3 pontinhos)
    const handleConfigureNode = useCallback(
        (nodeId: string) => {
            const node = nodes.find((n) => n.id === nodeId);
            if (node) {
                setSelectedNode(node);
                setIsConfigOpen(true);
            }
        },
        [nodes]
    );

    // Rastrear posição do cursor na tela para posicionar o bloco no Ctrl+V
    useEffect(() => {
        const handleMouseMove = (e: MouseEvent) => {
            mousePosRef.current = { clientX: e.clientX, clientY: e.clientY };
        };
        window.addEventListener('mousemove', handleMouseMove);
        return () => window.removeEventListener('mousemove', handleMouseMove);
    }, []);

    // Atalhos globais de teclado (Ctrl+Z Voltar / Ctrl+Y Refazer / Ctrl+C Copiar / Ctrl+V Colar no cursor / Ctrl+D Duplicar)
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            const target = e.target as HTMLElement;
            if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
                return;
            }

            // Ignorar atalhos de canvas se modais de configuração ou teste estiverem abertos
            if (isConfigOpen || isSimulatorOpen || isTestOpen || !!nodePendingDelete) {
                return;
            }

            const isCtrl = e.ctrlKey || e.metaKey;
            const key = e.key.toLowerCase();

            // Desfazer (Ctrl+Z) e Refazer (Ctrl+Y ou Ctrl+Shift+Z)
            if (isCtrl && key === 'z') {
                if (e.shiftKey) {
                    e.preventDefault();
                    handleRedo();
                } else {
                    e.preventDefault();
                    handleUndo();
                }
            } else if (isCtrl && key === 'y') {
                e.preventDefault();
                handleRedo();
            } else if (isCtrl && key === 'c') {
                // Copiar bloco selecionado ou sob o ponteiro do mouse
                const activeNode =
                    selectedNode ||
                    nodes.find((n) => n.selected) ||
                    hoveredNodeRef.current;
                if (activeNode) {
                    e.preventDefault();
                    copiedNodeRef.current = activeNode;
                    toast({
                        title: 'Bloco copiado!',
                        description: 'Mova o mouse para onde deseja colar e pressione Ctrl+V.',
                    });
                }
            } else if (isCtrl && key === 'v') {
                // Colar bloco duplicado exatamente na posição do cursor do mouse
                if (copiedNodeRef.current) {
                    e.preventDefault();
                    let pastePos: { x: number; y: number } | undefined;
                    if (mousePosRef.current) {
                        const flowPos = screenToFlowPosition({
                            x: mousePosRef.current.clientX,
                            y: mousePosRef.current.clientY,
                        });
                        pastePos = {
                            x: Math.round(flowPos.x - 140),
                            y: Math.round(flowPos.y - 45),
                        };
                    }
                    duplicateNode(copiedNodeRef.current, pastePos);
                }
            } else if (isCtrl && key === 'd') {
                // Duplicar rapidamente (Ctrl+D)
                const activeNode =
                    selectedNode ||
                    nodes.find((n) => n.selected) ||
                    hoveredNodeRef.current;
                if (activeNode) {
                    e.preventDefault();
                    duplicateNode(activeNode);
                }
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [
        handleUndo,
        handleRedo,
        isConfigOpen,
        isSimulatorOpen,
        isTestOpen,
        nodePendingDelete,
        selectedNode,
        nodes,
        screenToFlowPosition,
        duplicateNode,
        toast,
    ]);

    // Solicitar exclusão do nó (abre modal de confirmação)
    const handleDeleteNode = useCallback(
        (nodeId: string) => {
            setNodePendingDelete(nodeId);
        },
        []
    );

    // Confirmar exclusão do nó após o usuário aceitar no modal
    const confirmDeleteNode = useCallback(() => {
        if (!nodePendingDelete) return;
        const nodeId = nodePendingDelete;
        setNodePendingDelete(null);

        // Salvar estado no histórico para o botão 'Voltar' poder desfazer!
        pushHistory();

        setNodes((nds) => nds.filter((n) => n.id !== nodeId));
        setEdges((eds) => eds.filter((e) => e.source !== nodeId && e.target !== nodeId));
        if (selectedNode?.id === nodeId) {
            setSelectedNode(null);
            setIsConfigOpen(false);
        }
        scheduleAutoSave(400);
        toast({
            title: 'Bloco excluído',
            description: 'O bloco foi removido. Você pode clicar em "Voltar" caso queira restaurá-lo.',
        });
    }, [nodePendingDelete, pushHistory, setNodes, setEdges, selectedNode, scheduleAutoSave, toast]);

    // Interceptar mudanças de nós (ex: arrastar, selecionar, remover) sem travar
    const handleNodesChange = useCallback(
        (changes: any) => {
            onNodesChange(changes);
            // Se algum nó foi removido diretamente
            const removedIds = changes.filter((c: any) => c.type === 'remove').map((c: any) => c.id);
            if (removedIds.length > 0) {
                pushHistory();
                setEdges((eds) => eds.filter((e) => !removedIds.includes(e.source) && !removedIds.includes(e.target)));
            }
            // Salvar apenas se houver movimentação de posição, dimensão ou remoção (ignorar simples clique/seleção)
            const hasStructuralChange = changes.some((c: any) => c.type !== 'select');
            if (hasStructuralChange) {
                scheduleAutoSave(1200); // 1.2s após parar de arrastar
            }
        },
        [onNodesChange, setEdges, scheduleAutoSave, pushHistory]
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
            pushHistory();
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
        [setEdges, pushHistory, scheduleAutoSave]
    );

    // Seleção de aresta ao clicar (fica vermelho para identificar no fluxo)
    const onEdgeClick = useCallback((_: React.MouseEvent, edge: Edge) => {
        setSelectedEdgeId(edge.id);
    }, []);

    // Excluir aresta ao clicar 2 vezes (duplo clique)
    const onEdgeDoubleClick = useCallback(
        (_: React.MouseEvent, edge: Edge) => {
            pushHistory();
            setEdges((eds) => eds.filter((e) => e.id !== edge.id));
            setSelectedEdgeId((current) => (current === edge.id ? null : current));
            scheduleAutoSave(500);
            toast({
                title: 'Conexão removida',
                description: 'A ligação entre os blocos foi excluída.',
            });
        },
        [setEdges, pushHistory, scheduleAutoSave, toast]
    );

    // Desmarcar aresta e nó selecionados ao clicar no fundo
    const onPaneClick = useCallback(() => {
        setSelectedEdgeId(null);
        setSelectedNode(null);
    }, []);

    // Mapear arestas com destaque em vermelho para a selecionada e cores para saídas de condição
    const displayEdges = useMemo(() => {
        return edges.map((edge) => {
            const isSelected = edge.id === selectedEdgeId;
            let strokeColor = '#6366f1';
            let edgeLabel = edge.label;
            if (edge.sourceHandle === 'is_client') {
                strokeColor = '#10b981'; // Emerald para Cliente Cadastrado
                if (!edgeLabel) edgeLabel = 'Cliente';
            } else if (edge.sourceHandle === 'not_client') {
                strokeColor = '#f43f5e'; // Rose para Não Cadastrado
                if (!edgeLabel) edgeLabel = 'Novo Lead';
            }
            return {
                ...edge,
                label: edgeLabel,
                selected: isSelected,
                animated: true,
                style: {
                    ...edge.style,
                    stroke: isSelected ? '#ef4444' : strokeColor,
                    strokeWidth: isSelected ? 3.5 : 2.5,
                },
            };
        });
    }, [edges, selectedEdgeId]);

    // Ao clicar em um nó no canvas (seleciona o bloco)
    const onNodeClick = useCallback((_: any, node: Node) => {
        setSelectedNode(node);
    }, []);

    // Ao dar duplo clique em um nó no canvas (abre o modal de configuração)
    const onNodeDoubleClick = useCallback((_: any, node: Node) => {
        setSelectedNode(node);
        setIsConfigOpen(true);
    }, []);

    // Criar novo bloco em posição informada ou padrão
    const createNodeAtPosition = useCallback(
        (type: FlowNodeData['nodeType'], position?: { x: number; y: number }) => {
            pushHistory();
            const id = `node_${Date.now()}`;
            // Posição informada (drag and drop) ou centralizada/escalonada padrão (clique)
            const targetPos = position || {
                x: 250 + Math.random() * 80,
                y: 180 + Math.random() * 80,
            };

            let initialData: FlowNodeData = {
                nodeType: type,
                label: '',
            };

            switch (type) {
                case 'start':
                    initialData = {
                        nodeType: 'start',
                        label: 'Início do Fluxo',
                    };
                    break;
                case 'condition':
                    initialData = {
                        nodeType: 'condition',
                        label: 'Verificar Cliente CRM',
                        conditionType: 'is_client',
                    };
                    break;
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
                        actionType: 'send_contact',
                        contactCardName: 'Suporte Oficial',
                        contactCardPhone: '',
                        contactCardOrganization: '',
                        text: '',
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
                position: targetPos,
                data: initialData,
            };

            setNodes((nds) => [...nds, newNode]);
            scheduleAutoSave(500);
            toast({ title: 'Bloco adicionado!', description: 'Dê dois cliques no bloco ou use o menu (⋮) para configurar.' });
        },
        [pushHistory, setNodes, scheduleAutoSave, toast]
    );

    // Adicionar novo bloco através do clique na paleta flutuante
    const handleAddBlock = useCallback(
        (type: FlowNodeData['nodeType']) => {
            createNodeAtPosition(type);
        },
        [createNodeAtPosition]
    );

    // Handlers para Arrastar e Soltar (Drag and Drop) da paleta para o Canva
    const onDragStart = (event: React.DragEvent, nodeType: FlowNodeData['nodeType']) => {
        event.dataTransfer.setData('application/reactflow', nodeType);
        event.dataTransfer.effectAllowed = 'move';
    };

    const onDragOver = useCallback((event: React.DragEvent) => {
        event.preventDefault();
        event.dataTransfer.dropEffect = 'move';
    }, []);

    const onDrop = useCallback(
        (event: React.DragEvent) => {
            event.preventDefault();

            const type = event.dataTransfer.getData('application/reactflow') as FlowNodeData['nodeType'];
            if (!type) {
                return;
            }

            // Converter a coordenada do mouse da tela para a coordenada interna do canva (com zoom/pan)
            const position = screenToFlowPosition({
                x: event.clientX,
                y: event.clientY,
            });

            // Centralizar o nó no cursor do mouse (cards medem aprox 260px de largura e 70px de cabeçalho)
            const centeredPosition = {
                x: Math.round(position.x - 130),
                y: Math.round(position.y - 35),
            };

            createNodeAtPosition(type, centeredPosition);
        },
        [screenToFlowPosition, createNodeAtPosition]
    );

    // Organizar e alinhar automaticamente os blocos do fluxo no canvas (Arrumar Fluxo)
    // Segue rigorosamente a ordem dos botões e links para evitar cruzamento de linhas:
    // Botão 1 -> Informações em cima; Botão 2 -> Informações no meio; Botão 3 -> Informações embaixo
    const handleAutoArrangeFlow = useCallback(() => {
        if (nodes.length === 0) {
            toast({
                title: 'Nenhum bloco para arrumar',
                description: 'Adicione blocos ao fluxo antes de organizar.',
            });
            return;
        }

        try {
            pushHistory();

            const nodeMap = new Map<string, Node>(nodes.map((n) => [n.id, n]));

            // 1. Estima ou lê as dimensões precisas de cada bloco
            const getNodeDimensions = (node: Node) => {
                const width = node.measured?.width || 280;
                let height = node.measured?.height;
                if (!height) {
                    const type = (node.data as any)?.nodeType;
                    if (type === 'start') height = 130;
                    else if (type === 'condition') height = 210;
                    else if (type === 'menu') {
                        const opts = (node.data as any)?.menuOptions;
                        const count = Array.isArray(opts)
                            ? opts.length
                            : typeof opts === 'object' && opts
                            ? Object.keys(opts).length
                            : 2;
                        height = 140 + count * 38;
                    } else if (type === 'delay') height = 130;
                    else if (type === 'action') height = 150;
                    else if (type === 'flow_connect') height = 130;
                    else height = 160;
                }
                return { width, height };
            };

            // 2. Determina o índice visual do handle de saída no bloco (de cima para baixo: 0, 1, 2...)
            const getHandleIndex = (srcNode: Node | undefined, sourceHandle?: string | null): number => {
                if (!srcNode || !sourceHandle) return 0;
                const type = (srcNode.data as any)?.nodeType;

                if (type === 'menu') {
                    const raw = (srcNode.data as any)?.menuOptions;
                    const list: any[] = Array.isArray(raw)
                        ? raw
                        : typeof raw === 'object' && raw
                        ? Object.values(raw)
                        : [];

                    const idx = list.findIndex((o: any, i: number) => {
                        if (!o) return false;
                        if (o.id && String(o.id) === String(sourceHandle)) return true;
                        if (`opt_${i + 1}` === String(sourceHandle)) return true;
                        if (String(i + 1) === String(sourceHandle)) return true;
                        return false;
                    });
                    if (idx !== -1) return idx;

                    const match = String(sourceHandle).match(/^opt_(\d+)$/);
                    if (match) return parseInt(match[1], 10) - 1;
                    return 999;
                }

                if (type === 'condition') {
                    // is_client: Cliente Cadastrado (Fica no topo -> 0)
                    // not_client: Não Cadastrado (Fica embaixo -> 1)
                    if (sourceHandle === 'is_client') return 0;
                    if (sourceHandle === 'not_client') return 1;
                }

                const numMatch = String(sourceHandle).match(/(\d+)/);
                if (numMatch) return parseInt(numMatch[1], 10) - 1;

                return 0;
            };

            // 3. Agrupa e ordena as arestas que saem de cada nó estritamente pela ordem dos handles
            const outgoingEdges = new Map<string, Edge[]>();
            for (const node of nodes) {
                outgoingEdges.set(node.id, []);
            }
            for (const edge of edges) {
                if (nodeMap.has(edge.source) && nodeMap.has(edge.target)) {
                    outgoingEdges.get(edge.source)?.push(edge);
                }
            }
            for (const [nodeId, edgeList] of outgoingEdges.entries()) {
                const srcNode = nodeMap.get(nodeId);
                edgeList.sort((a, b) => {
                    const idxA = getHandleIndex(srcNode, a.sourceHandle);
                    const idxB = getHandleIndex(srcNode, b.sourceHandle);
                    return idxA - idxB;
                });
            }

            // 4. Identifica raízes e constrói a árvore de expansão (Spanning Forest)
            const inDegree = new Map<string, number>();
            for (const node of nodes) inDegree.set(node.id, 0);
            for (const edge of edges) {
                if (nodeMap.has(edge.source) && nodeMap.has(edge.target)) {
                    inDegree.set(edge.target, (inDegree.get(edge.target) || 0) + 1);
                }
            }

            const roots: string[] = [];
            // Nós 'start' têm prioridade absoluta como raiz principal
            const startNodes = nodes.filter((n) => (n.data as any)?.nodeType === 'start').map((n) => n.id);
            roots.push(...startNodes);

            // Nós sem entrada
            for (const node of nodes) {
                if (!roots.includes(node.id) && (inDegree.get(node.id) || 0) === 0) {
                    roots.push(node.id);
                }
            }

            const treeChildren = new Map<string, string[]>();
            const treeParent = new Map<string, string>();
            const visited = new Set<string>();

            for (const node of nodes) {
                treeChildren.set(node.id, []);
            }

            const processComponent = (rootId: string) => {
                if (visited.has(rootId)) return;
                visited.add(rootId);
                const queue = [rootId];

                while (queue.length > 0) {
                    const curr = queue.shift()!;
                    const outEdges = outgoingEdges.get(curr) || [];

                    for (const edge of outEdges) {
                        const targetId = edge.target;
                        if (!visited.has(targetId) && targetId !== curr) {
                            visited.add(targetId);
                            treeChildren.get(curr)!.push(targetId);
                            treeParent.set(targetId, curr);
                            queue.push(targetId);
                        }
                    }
                }
            };

            for (const rootId of [...roots]) {
                processComponent(rootId);
            }

            // Processa blocos isolados ou cíclicos restantes
            for (const node of nodes) {
                if (!visited.has(node.id)) {
                    roots.push(node.id);
                    processComponent(node.id);
                }
            }

            // 5. Calcula colunas horizontais (X) para cada nó
            const column = new Map<string, number>();
            for (const rootId of roots) {
                column.set(rootId, 0);
            }

            const isAncestor = (ancestorId: string, childId: string): boolean => {
                let curr: string | undefined = childId;
                const seen = new Set<string>();
                while (curr && !seen.has(curr)) {
                    seen.add(curr);
                    if (curr === ancestorId) return true;
                    curr = treeParent.get(curr);
                }
                return false;
            };

            let changed = true;
            let pass = 0;
            while (changed && pass < nodes.length + 5) {
                changed = false;
                pass++;
                for (const edge of edges) {
                    if (!nodeMap.has(edge.source) || !nodeMap.has(edge.target)) continue;
                    const u = edge.source;
                    const v = edge.target;
                    // Não empurra para a frente se for um link de volta para um ancestral
                    if (!isAncestor(v, u)) {
                        const desired = (column.get(u) || 0) + 1;
                        if ((column.get(v) || 0) < desired) {
                            column.set(v, desired);
                            changed = true;
                        }
                    }
                }
            }

            const colMap = new Map<number, string[]>();
            for (const node of nodes) {
                const c = column.get(node.id) || 0;
                if (!colMap.has(c)) colMap.set(c, []);
                colMap.get(c)!.push(node.id);
            }

            const maxCol = Math.max(...Array.from(colMap.keys()), 0);
            const colWidths = new Map<number, number>();
            for (let c = 0; c <= maxCol; c++) {
                const list = colMap.get(c) || [];
                const maxW = list.length > 0
                    ? Math.max(...list.map((id) => getNodeDimensions(nodeMap.get(id)!).width))
                    : 280;
                colWidths.set(c, maxW);
            }

            const HORIZONTAL_GAP = 130;
            const colX = new Map<number, number>();
            let curX = 80;
            for (let c = 0; c <= maxCol; c++) {
                colX.set(c, curX);
                curX += (colWidths.get(c) || 280) + HORIZONTAL_GAP;
            }

            const finalX = new Map<string, number>();
            for (const node of nodes) {
                const c = column.get(node.id) || 0;
                finalX.set(node.id, colX.get(c) || 80);
            }

            // 6. Calcula a altura necessária de cada subárvore e distribui corredores verticais (Y)
            // Isso garante que o Botão 1 fique em cima, o Botão 2 no meio e o Botão 3 embaixo!
            const VERTICAL_GAP = 60;
            const subtreeHeights = new Map<string, number>();

            const calcSubtreeHeight = (nodeId: string, vis = new Set<string>()): number => {
                if (vis.has(nodeId)) return getNodeDimensions(nodeMap.get(nodeId)!).height;
                vis.add(nodeId);

                const dims = getNodeDimensions(nodeMap.get(nodeId)!);
                const kids = treeChildren.get(nodeId) || [];

                if (kids.length === 0) {
                    subtreeHeights.set(nodeId, dims.height);
                    return dims.height;
                }

                let sum = 0;
                for (let i = 0; i < kids.length; i++) {
                    const h = calcSubtreeHeight(kids[i], vis);
                    sum += h;
                    if (i > 0) sum += VERTICAL_GAP;
                }

                const total = Math.max(dims.height, sum);
                subtreeHeights.set(nodeId, total);
                return total;
            };

            for (const rootId of roots) {
                calcSubtreeHeight(rootId);
            }

            const finalY = new Map<string, number>();

            const assignY = (nodeId: string, yStart: number, vis = new Set<string>()) => {
                if (vis.has(nodeId)) return;
                vis.add(nodeId);

                const dims = getNodeDimensions(nodeMap.get(nodeId)!);
                const totalHeight = subtreeHeights.get(nodeId) || dims.height;
                const kids = treeChildren.get(nodeId) || [];

                if (kids.length === 0) {
                    finalY.set(nodeId, yStart);
                    return;
                }

                let sumKids = 0;
                for (let i = 0; i < kids.length; i++) {
                    sumKids += (subtreeHeights.get(kids[i]) || dims.height);
                    if (i > 0) sumKids += VERTICAL_GAP;
                }

                // Centraliza o nó pai verticalmente em relação a todos os seus filhos
                finalY.set(nodeId, Math.round(yStart + (totalHeight - dims.height) / 2));

                // Ponto inicial para posicionar os filhos
                let currentKidY = yStart;
                if (dims.height > sumKids) {
                    currentKidY = yStart + (dims.height - sumKids) / 2;
                }

                // Distribui os filhos na ordem exata dos botões/handles:
                // Filho 0 -> Fica no topo da faixa
                // Filho 1 -> Fica no meio
                // Filho 2 -> Fica embaixo
                for (const kidId of kids) {
                    const kidHeight = subtreeHeights.get(kidId) || dims.height;
                    assignY(kidId, currentKidY, vis);
                    currentKidY += kidHeight + VERTICAL_GAP;
                }
            };

            let curRootY = 80;
            const COMPONENT_GAP = 120;
            for (const rootId of roots) {
                assignY(rootId, curRootY);
                curRootY += (subtreeHeights.get(rootId) || 160) + COMPONENT_GAP;
            }

            // 7. Passada de segurança anti-colisão por coluna
            for (let c = 0; c <= maxCol; c++) {
                const list = colMap.get(c) || [];
                if (list.length <= 1) continue;

                list.sort((a, b) => (finalY.get(a) || 0) - (finalY.get(b) || 0));

                for (let i = 0; i < list.length - 1; i++) {
                    const aId = list[i];
                    const bId = list[i + 1];
                    const aDims = getNodeDimensions(nodeMap.get(aId)!);
                    const aY = finalY.get(aId) || 0;
                    const bY = finalY.get(bId) || 0;
                    const minBY = aY + aDims.height + 40;

                    if (bY < minBY) {
                        const diff = minBY - bY;
                        const q = [bId];
                        const sVis = new Set<string>();
                        while (q.length > 0) {
                            const curr = q.shift()!;
                            if (sVis.has(curr)) continue;
                            sVis.add(curr);
                            finalY.set(curr, (finalY.get(curr) || 0) + diff);
                            const kList = treeChildren.get(curr) || [];
                            q.push(...kList);
                        }
                    }
                }
            }

            // 8. Normalização de coordenadas (garante margem inicial de 80px)
            let minX = Infinity;
            let minY = Infinity;
            for (const node of nodes) {
                const x = finalX.get(node.id) ?? node.position.x;
                const y = finalY.get(node.id) ?? node.position.y;
                if (x < minX) minX = x;
                if (y < minY) minY = y;
            }

            const shiftX = 80 - (isFinite(minX) ? minX : 0);
            const shiftY = 80 - (isFinite(minY) ? minY : 0);

            const nextNodes = nodes.map((node) => {
                const rx = finalX.get(node.id) ?? node.position.x;
                const ry = finalY.get(node.id) ?? node.position.y;
                return {
                    ...node,
                    position: {
                        x: Math.round(rx + shiftX),
                        y: Math.round(ry + shiftY),
                    },
                };
            });

            setNodes(nextNodes);
            scheduleAutoSave(600);

            setTimeout(() => {
                fitView({ duration: 600, padding: 0.18 });
            }, 50);

            toast({
                title: 'Fluxo arrumado com sucesso!',
                description: 'Os blocos foram organizados seguindo a ordem exata dos botões e links.',
            });
        } catch (err: any) {
            console.error('Erro ao arrumar fluxo:', err);
            toast({
                variant: 'destructive',
                title: 'Erro ao organizar fluxo',
                description: err?.message || 'Não foi possível alinhar os blocos automaticamente.',
            });
        }
    }, [nodes, edges, pushHistory, setNodes, scheduleAutoSave, fitView, toast]);

    // Atualizar dados do nó configurado
    const handleSaveNodeData = (nodeId: string, updatedData: FlowNodeData) => {
        pushHistory();
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
        <div className="flex flex-col h-screen max-h-screen w-full overflow-hidden bg-slate-50 dark:bg-slate-950">
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

                        {/* BOTÕES VOLTAR (DESFAZER) E REFAZER */}
                        <div className="flex items-center border-l pl-2 ml-1 gap-1 border-border/70">
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={handleUndo}
                                disabled={!canUndo}
                                className="h-8 px-2.5 text-xs gap-1.5 border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:text-indigo-600 hover:border-indigo-300 disabled:opacity-40 disabled:pointer-events-none transition-all shadow-2xs"
                                title="Voltar / Desfazer última alteração (Ctrl+Z)"
                            >
                                <Undo2 className="h-3.5 w-3.5" />
                                <span className="font-semibold text-xs">Voltar</span>
                            </Button>
                            {canRedo && (
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    onClick={handleRedo}
                                    className="h-8 px-2 text-xs gap-1 border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:text-indigo-600 hover:border-indigo-300 shadow-2xs"
                                    title="Avançar / Refazer (Ctrl+Y)"
                                >
                                    <Redo2 className="h-3.5 w-3.5" />
                                </Button>
                            )}
                        </div>

                        {/* BOTÃO ARRUMAR FLUXO */}
                        <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={handleAutoArrangeFlow}
                            className="h-8 px-2.5 text-xs gap-1.5 border-indigo-200 dark:border-indigo-800/60 bg-indigo-50/60 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-100 hover:text-indigo-800 dark:hover:bg-indigo-900/60 shadow-2xs font-semibold transition-all"
                            title="Organizar e alinhar blocos do fluxo automaticamente"
                        >
                            <Sparkles className="h-3.5 w-3.5 text-indigo-600 dark:text-indigo-400" />
                            <span>Arrumar Fluxo</span>
                        </Button>
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
            <div
                className="relative flex-1 w-full min-h-0 overflow-hidden"
                onDragOver={onDragOver}
                onDrop={onDrop}
                onPointerMove={(e) => {
                    mousePosRef.current = { clientX: e.clientX, clientY: e.clientY };
                }}
            >
                {/* SIMULADOR CLONADO DO WHATSAPP (DROPDOWN NO CANTO DIREITO SOB O BOTÃO) */}
                <FlowWhatsAppSimulator
                    open={isSimulatorOpen}
                    onClose={() => setIsSimulatorOpen(false)}
                    nodes={nodes}
                    edges={edges}
                    flowName={flowName}
                    onOpenRealTest={() => setIsTestOpen(true)}
                    clients={allClients || []}
                />

                {/* PALETA LATERAL FLUTUANTE (MINIMIZÁVEL E COMPACTA COM ARRASTAR E SOLTAR) */}
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
                    <div className="absolute top-4 left-4 z-20 bg-card/95 backdrop-blur-md rounded-2xl border-2 border-slate-200/80 dark:border-slate-800 shadow-xl p-2 py-2.5 w-[218px] space-y-0.5 select-none animate-in fade-in-50 slide-in-from-left-4">
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

                        {/* 0. INÍCIO DO FLUXO (START) */}
                        <button
                            type="button"
                            draggable
                            onDragStart={(e) => onDragStart(e, 'start')}
                            onClick={() => handleAddBlock('start')}
                            className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-[11.5px] font-semibold text-slate-800 dark:text-slate-200 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 transition-all text-left group cursor-grab active:cursor-grabbing active:scale-[0.98]"
                            title="Clique para adicionar ou arraste para dentro do canva"
                        >
                            <div className="p-1 rounded-md bg-emerald-100 dark:bg-emerald-950 text-emerald-600 group-hover:scale-110 transition-transform shrink-0">
                                <PlayCircle className="h-3.5 w-3.5" />
                            </div>
                            <span className="flex-1 truncate">Início do Fluxo</span>
                            <GripVertical className="h-3.5 w-3.5 text-slate-400 group-hover:text-slate-600 dark:group-hover:text-slate-300 opacity-60 shrink-0" />
                        </button>

                        {/* 1. VERIFICAR CLIENTE CRM (CONDIÇÃO) */}
                        <button
                            type="button"
                            draggable
                            onDragStart={(e) => onDragStart(e, 'condition')}
                            onClick={() => handleAddBlock('condition')}
                            className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-[11.5px] font-semibold text-slate-800 dark:text-slate-200 hover:bg-sky-50 dark:hover:bg-sky-950/30 transition-all text-left group cursor-grab active:cursor-grabbing active:scale-[0.98]"
                            title="Clique para adicionar ou arraste para dentro do canva"
                        >
                            <div className="p-1 rounded-md bg-sky-100 dark:bg-sky-950 text-sky-600 group-hover:scale-110 transition-transform shrink-0">
                                <UserCheck className="h-3.5 w-3.5" />
                            </div>
                            <span className="flex-1 truncate">Verificar Cliente CRM</span>
                            <GripVertical className="h-3.5 w-3.5 text-slate-400 group-hover:text-slate-600 dark:group-hover:text-slate-300 opacity-60 shrink-0" />
                        </button>

                        {/* 1. CONTEÚDO */}
                        <button
                            type="button"
                            draggable
                            onDragStart={(e) => onDragStart(e, 'content')}
                            onClick={() => handleAddBlock('content')}
                            className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-[11.5px] font-semibold text-slate-800 dark:text-slate-200 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-all text-left group cursor-grab active:cursor-grabbing active:scale-[0.98]"
                            title="Clique para adicionar ou arraste para dentro do canva"
                        >
                            <div className="p-1 rounded-md bg-rose-100 dark:bg-rose-950 text-rose-500 group-hover:scale-110 transition-transform shrink-0">
                                <Star className="h-3.5 w-3.5 fill-current" />
                            </div>
                            <span className="flex-1 truncate">Conteúdo</span>
                            <GripVertical className="h-3.5 w-3.5 text-slate-400 group-hover:text-slate-600 dark:group-hover:text-slate-300 opacity-60 shrink-0" />
                        </button>

                        {/* 2. MENU */}
                        <button
                            type="button"
                            draggable
                            onDragStart={(e) => onDragStart(e, 'menu')}
                            onClick={() => handleAddBlock('menu')}
                            className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-[11.5px] font-semibold text-slate-800 dark:text-slate-200 hover:bg-indigo-50 dark:hover:bg-indigo-950/30 transition-all text-left group cursor-grab active:cursor-grabbing active:scale-[0.98]"
                            title="Clique para adicionar ou arraste para dentro do canva"
                        >
                            <div className="p-1 rounded-md bg-indigo-100 dark:bg-indigo-950 text-indigo-600 group-hover:scale-110 transition-transform shrink-0">
                                <Grid className="h-3.5 w-3.5" />
                            </div>
                            <span className="flex-1 truncate">Menu</span>
                            <GripVertical className="h-3.5 w-3.5 text-slate-400 group-hover:text-slate-600 dark:group-hover:text-slate-300 opacity-60 shrink-0" />
                        </button>

                        {/* 3. AÇÃO */}
                        <button
                            type="button"
                            draggable
                            onDragStart={(e) => onDragStart(e, 'action')}
                            onClick={() => handleAddBlock('action')}
                            className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-[11.5px] font-semibold text-slate-800 dark:text-slate-200 hover:bg-amber-50 dark:hover:bg-amber-950/30 transition-all text-left group cursor-grab active:cursor-grabbing active:scale-[0.98]"
                            title="Clique para adicionar ou arraste para dentro do canva"
                        >
                            <div className="p-1 rounded-md bg-amber-100 dark:bg-amber-950 text-amber-500 group-hover:scale-110 transition-transform shrink-0">
                                <Zap className="h-3.5 w-3.5 fill-current" />
                            </div>
                            <span className="flex-1 truncate">Ação</span>
                            <GripVertical className="h-3.5 w-3.5 text-slate-400 group-hover:text-slate-600 dark:group-hover:text-slate-300 opacity-60 shrink-0" />
                        </button>

                        {/* 4. CONEXÃO DE FLUXO */}
                        <button
                            type="button"
                            draggable
                            onDragStart={(e) => onDragStart(e, 'flow_connect')}
                            onClick={() => handleAddBlock('flow_connect')}
                            className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-[11.5px] font-semibold text-slate-800 dark:text-slate-200 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 transition-all text-left group cursor-grab active:cursor-grabbing active:scale-[0.98]"
                            title="Clique para adicionar ou arraste para dentro do canva"
                        >
                            <div className="p-1 rounded-md bg-emerald-100 dark:bg-emerald-950 text-emerald-500 group-hover:scale-110 transition-transform shrink-0">
                                <Rocket className="h-3.5 w-3.5" />
                            </div>
                            <span className="flex-1 truncate">Conexão de fluxo</span>
                            <GripVertical className="h-3.5 w-3.5 text-slate-400 group-hover:text-slate-600 dark:group-hover:text-slate-300 opacity-60 shrink-0" />
                        </button>

                        {/* 5. ATRASO INTELIGENTE */}
                        <button
                            type="button"
                            draggable
                            onDragStart={(e) => onDragStart(e, 'delay')}
                            onClick={() => handleAddBlock('delay')}
                            className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-[11.5px] font-semibold text-slate-800 dark:text-slate-200 hover:bg-orange-50 dark:hover:bg-orange-950/30 transition-all text-left group cursor-grab active:cursor-grabbing active:scale-[0.98]"
                            title="Clique para adicionar ou arraste para dentro do canva"
                        >
                            <div className="p-1 rounded-md bg-orange-100 dark:bg-orange-950 text-orange-500 group-hover:scale-110 transition-transform shrink-0">
                                <Clock className="h-3.5 w-3.5" />
                            </div>
                            <span className="flex-1 truncate">Atraso inteligente</span>
                            <GripVertical className="h-3.5 w-3.5 text-slate-400 group-hover:text-slate-600 dark:group-hover:text-slate-300 opacity-60 shrink-0" />
                        </button>
                    </div>
                )}

                {/* REACT FLOW CANVAS */}
                <FlowNodeActionsContext.Provider
                    value={{
                        onDeleteNode: handleDeleteNode,
                        onDuplicateNode: duplicateNode,
                        onConfigureNode: handleConfigureNode,
                    }}
                >
                    <ReactFlow
                        nodes={nodes}
                        edges={displayEdges}
                        onNodesChange={handleNodesChange}
                        onEdgesChange={handleEdgesChange}
                        onConnect={onConnect}
                        onNodeClick={onNodeClick}
                        onNodeDoubleClick={onNodeDoubleClick}
                        onNodeMouseEnter={(_, node) => {
                            hoveredNodeRef.current = node;
                        }}
                        onNodeMouseLeave={() => {
                            hoveredNodeRef.current = null;
                        }}
                        onEdgeClick={onEdgeClick}
                        onEdgeDoubleClick={onEdgeDoubleClick}
                        onPaneClick={onPaneClick}
                        onDragOver={onDragOver}
                        onDrop={onDrop}
                        deleteKeyCode={null}
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
                        proOptions={{ hideAttribution: true }}
                        className="bg-slate-50 dark:bg-slate-950 w-full h-full"
                    >
                        <Background variant={BackgroundVariant.Dots} gap={16} size={1} color="#94a3b8" />
                        <Controls className="!bg-card !border-border !shadow-md">
                            <ControlButton
                                onClick={handleAutoArrangeFlow}
                                title="Arrumar Fluxo (alinhar blocos automaticamente)"
                                aria-label="Arrumar Fluxo"
                                className="!text-indigo-600 dark:!text-indigo-400 hover:!text-indigo-700"
                            >
                                <Sparkles className="h-3.5 w-3.5" />
                            </ControlButton>
                            <ControlButton
                                onClick={() => setShowMiniMap((prev) => !prev)}
                                title={showMiniMap ? 'Minimizar mapa do fluxo' : 'Mostrar mapa do fluxo (olhinho)'}
                                aria-label="Alternar mapa do fluxo"
                                className="!text-slate-700 dark:!text-slate-200 hover:!text-indigo-600"
                            >
                                {showMiniMap ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                            </ControlButton>
                        </Controls>

                        {showMiniMap && (
                            <MiniMap
                                className="!bg-card !border !border-border !rounded-xl !shadow-lg"
                                nodeColor={(n: any) => {
                                    const type = n.data?.nodeType;
                                    if (type === 'start') return '#10b981';
                                    if (type === 'condition') return '#0284c7';
                                    if (type === 'menu') return '#818cf8';
                                    if (type === 'content') return '#f87171';
                                    if (type === 'delay') return '#fb923c';
                                    if (type === 'action') return '#facc15';
                                    if (type === 'flow_connect') return '#4ade80';
                                    return '#94a3b8';
                                }}
                            />
                        )}

                        {/* BOTÃO FLUTUANTE (OLHINHO) NO CANTO INFERIOR DIREITO */}
                        <Panel position="bottom-right" className="!m-3">
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => setShowMiniMap((prev) => !prev)}
                                className="h-8 px-2.5 gap-1.5 rounded-lg bg-card/95 backdrop-blur-xs border border-border shadow-md hover:shadow-lg text-slate-700 dark:text-slate-200 hover:text-indigo-600 transition-all font-medium text-xs"
                                title={showMiniMap ? 'Minimizar mapa do fluxo' : 'Mostrar mapa do fluxo (olhinho)'}
                            >
                                {showMiniMap ? (
                                    <>
                                        <EyeOff className="h-3.5 w-3.5 text-slate-500" />
                                        <span>Minimizar</span>
                                    </>
                                ) : (
                                    <>
                                        <Eye className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
                                        <span>Mapa</span>
                                    </>
                                )}
                            </Button>
                        </Panel>
                    </ReactFlow>
                </FlowNodeActionsContext.Provider>
            </div>

            {/* MODAL DE CONFIGURAÇÃO DO NÓ (media_1791138953499.png) */}
            <NodeConfigDialog
                open={isConfigOpen && !!selectedNode}
                onOpenChange={(isOpen) => {
                    setIsConfigOpen(isOpen);
                    if (!isOpen) setSelectedNode(null);
                }}
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

            {/* MODAL DE CONFIRMAÇÃO DE EXCLUSÃO DE BLOCO */}
            <Dialog open={!!nodePendingDelete} onOpenChange={(open) => !open && setNodePendingDelete(null)}>
                <DialogContent className="max-w-md">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2 text-rose-600 dark:text-rose-400">
                            <AlertTriangle className="h-5 w-5" />
                            Excluir este bloco?
                        </DialogTitle>
                        <DialogDescription className="space-y-2 pt-1 text-slate-700 dark:text-slate-300 text-xs leading-relaxed">
                            <span>
                                Tem certeza que deseja remover o bloco{' '}
                                <strong className="text-slate-900 dark:text-slate-100 font-bold">
                                    &quot;{((nodes.find((n) => n.id === nodePendingDelete)?.data as any)?.label) || 'Bloco selecionado'}&quot;
                                </strong>?
                            </span>
                            <br />
                            <span className="text-muted-foreground block pt-1">
                                Todas as conexões ligadas a este bloco também serão excluídas. (Você poderá usar o botão <strong>&quot;Voltar&quot;</strong> para desfazer).
                            </span>
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter className="gap-2 sm:gap-0 pt-2">
                        <Button type="button" variant="outline" onClick={() => setNodePendingDelete(null)}>
                            Cancelar
                        </Button>
                        <Button type="button" onClick={confirmDeleteNode} className="bg-rose-600 hover:bg-rose-700 text-white gap-1.5 shadow-sm">
                            <Trash2 className="h-4 w-4" />
                            Sim, Excluir Bloco
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}

export default function FlowCanvasEditorPage() {
    return (
        <ReactFlowProvider>
            <FlowCanvasEditorContent />
        </ReactFlowProvider>
    );
}

