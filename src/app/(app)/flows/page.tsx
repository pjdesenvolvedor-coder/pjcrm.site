'use client';

import React, { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useFirebase, useCollection, useDoc, useMemoFirebase } from '@/firebase';
import { collection, doc, setDoc, deleteDoc, updateDoc } from 'firebase/firestore';
import type { FlowDefinition, FlowTriggerSettings, UazapiConnectionConfig } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';
import { PageHeader } from '@/components/page-header';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from '@/components/ui/dialog';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
    Workflow,
    Plus,
    MoreVertical,
    Copy,
    Trash2,
    Edit3,
    ArrowRight,
    Loader2,
    Layers,
    CheckCircle2,
    Sparkles,
    Settings,
    Zap,
    ExternalLink
} from 'lucide-react';
import { FlowVariablesConfigDialog } from '@/components/flows/FlowVariablesConfigDialog';

function VariablesParamListener({ onOpen }: { onOpen: () => void }) {
    const searchParams = useSearchParams();
    useEffect(() => {
        if (searchParams.get('open') === 'variables') {
            onOpen();
        }
    }, [searchParams, onOpen]);
    return null;
}

export default function FlowsListPage() {
    const router = useRouter();
    const { firestore, effectiveUserId } = useFirebase();
    const { toast } = useToast();

    // Query dos fluxos
    const flowsQuery = useMemoFirebase(() => {
        if (!effectiveUserId) return null;
        return collection(firestore, 'users', effectiveUserId, 'flows');
    }, [firestore, effectiveUserId]);
    const { data: flows, isLoading: isLoadingFlows } = useCollection<FlowDefinition>(flowsQuery);

    // Configurações de gatilho
    const configDocRef = useMemoFirebase(() => {
        if (!effectiveUserId) return null;
        return doc(firestore, 'users', effectiveUserId, 'settings', 'flow_config');
    }, [firestore, effectiveUserId]);
    const { data: triggerConfig } = useDoc<FlowTriggerSettings>(configDocRef);

    // Status da conexão
    const connectionDocRef = useMemoFirebase(() => {
        if (!effectiveUserId) return null;
        return doc(firestore, 'users', effectiveUserId, 'settings', 'uazapi_flow');
    }, [firestore, effectiveUserId]);
    const { data: connectionConfig } = useDoc<UazapiConnectionConfig>(connectionDocRef);

    // Modal de criação
    const [isCreateOpen, setIsCreateOpen] = useState(false);
    const [isVariablesOpen, setIsVariablesOpen] = useState(false);
    const [newFlowName, setNewFlowName] = useState('');
    const [newFlowDescription, setNewFlowDescription] = useState('');
    const [useTemplate, setUseTemplate] = useState(true);
    const [isCreating, setIsCreating] = useState(false);

    // Template padrão com menu e boas-vindas
    const createDefaultTemplate = (flowId: string) => {
        return {
            nodes: [
                {
                    id: 'node-start',
                    type: 'customFlow',
                    position: { x: 100, y: 150 },
                    data: {
                        label: 'Início',
                        nodeType: 'content',
                        contentType: 'text',
                        text: 'Olá! Seja bem-vindo(a) ao nosso atendimento! Como podemos te ajudar hoje?',
                    },
                },
                {
                    id: 'node-menu',
                    type: 'customFlow',
                    position: { x: 500, y: 120 },
                    data: {
                        label: 'Menu de Opções',
                        nodeType: 'menu',
                        menuType: 'list',
                        menuButtonTitle: 'VER OPÇÕES',
                        menuQuestionText: 'Selecione uma das opções abaixo no menu:',
                        menuOptions: [
                            { id: 'opt_1', label: '💳 Renovar Assinatura', description: 'Receber código PIX de renovação' },
                            { id: 'opt_2', label: '🛒 Comprar Novo Plano', description: 'Ver nossos planos disponíveis' },
                            { id: 'opt_3', label: '💬 Falar com Atendente', description: 'Transferir para suporte humano' },
                        ],
                    },
                },
                {
                    id: 'node-delay',
                    type: 'customFlow',
                    position: { x: 920, y: 100 },
                    data: {
                        label: 'Digitando...',
                        nodeType: 'delay',
                        delaySeconds: 3,
                        delayPresence: 'composing',
                    },
                },
                {
                    id: 'node-suporte',
                    type: 'customFlow',
                    position: { x: 920, y: 320 },
                    data: {
                        label: 'Suporte',
                        nodeType: 'action',
                        actionType: 'open_support',
                        text: 'Um atendente da nossa equipe foi notificado e responderá em breve!',
                    },
                },
            ],
            edges: [
                {
                    id: 'e-start-menu',
                    source: 'node-start',
                    target: 'node-menu',
                    animated: true,
                },
                {
                    id: 'e-menu-opt1',
                    source: 'node-menu',
                    sourceHandle: 'opt_1',
                    target: 'node-delay',
                    animated: true,
                },
                {
                    id: 'e-menu-opt3',
                    source: 'node-menu',
                    sourceHandle: 'opt_3',
                    target: 'node-suporte',
                    animated: true,
                },
            ],
        };
    };

    const handleCreateFlow = async () => {
        if (!effectiveUserId) return;
        if (!newFlowName.trim()) {
            toast({ variant: 'destructive', title: 'Nome obrigatório', description: 'Dê um nome para seu fluxo.' });
            return;
        }

        setIsCreating(true);
        const flowId = 'flow_' + Date.now();

        const initialData = useTemplate ? createDefaultTemplate(flowId) : { nodes: [], edges: [] };

        const newFlow: FlowDefinition = {
            id: flowId,
            userId: effectiveUserId,
            name: newFlowName.trim(),
            description: newFlowDescription.trim() || 'Fluxo de atendimento automatizado',
            isActive: true,
            nodes: initialData.nodes,
            edges: initialData.edges,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
        };

        try {
            const flowRef = doc(firestore, 'users', effectiveUserId, 'flows', flowId);
            await setDoc(flowRef, newFlow);

            toast({ title: 'Fluxo criado com sucesso!', description: 'Abrindo o Canva de edição...' });
            setIsCreateOpen(false);
            setNewFlowName('');
            setNewFlowDescription('');
            router.push(`/flows/${flowId}`);
        } catch (err: any) {
            toast({ variant: 'destructive', title: 'Erro ao criar fluxo', description: err.message });
        } finally {
            setIsCreating(false);
        }
    };

    const handleToggleActive = async (flow: FlowDefinition) => {
        if (!effectiveUserId) return;
        try {
            const flowRef = doc(firestore, 'users', effectiveUserId, 'flows', flow.id);
            await updateDoc(flowRef, {
                isActive: !flow.isActive,
                updatedAt: new Date().toISOString(),
            });
            toast({
                title: !flow.isActive ? 'Fluxo ativado!' : 'Fluxo pausado',
                description: `"${flow.name}" está agora ${!flow.isActive ? 'ativo' : 'inativo'}.`,
            });
        } catch (err: any) {
            toast({ variant: 'destructive', title: 'Erro ao atualizar', description: err.message });
        }
    };

    const handleDuplicateFlow = async (flow: FlowDefinition) => {
        if (!effectiveUserId) return;
        const newFlowId = 'flow_' + Date.now();
        const duplicated: FlowDefinition = {
            ...flow,
            id: newFlowId,
            name: `${flow.name} (Cópia)`,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
        };

        try {
            const flowRef = doc(firestore, 'users', effectiveUserId, 'flows', newFlowId);
            await setDoc(flowRef, duplicated);
            toast({ title: 'Fluxo duplicado com sucesso!' });
        } catch (err: any) {
            toast({ variant: 'destructive', title: 'Erro ao duplicar', description: err.message });
        }
    };

    const handleDeleteFlow = async (flow: FlowDefinition) => {
        if (!effectiveUserId) return;
        if (!confirm(`Tem certeza que deseja excluir o fluxo "${flow.name}"?`)) return;

        try {
            const flowRef = doc(firestore, 'users', effectiveUserId, 'flows', flow.id);
            await deleteDoc(flowRef);
            toast({ title: 'Fluxo excluído com sucesso.' });
        } catch (err: any) {
            toast({ variant: 'destructive', title: 'Erro ao excluir', description: err.message });
        }
    };

    return (
        <div className="flex-1 space-y-6 p-4 md:p-8 pt-6">
            <Suspense fallback={null}>
                <VariablesParamListener onOpen={() => setIsVariablesOpen(true)} />
            </Suspense>

            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <PageHeader
                    title="Criador de Fluxos (Canva)"
                    description="Crie e gerencie fluxos visuais inteligentes de mensagens, menus e automações com o WhatsApp."
                />
                <div className="flex items-center gap-2">
                    <Button
                        variant="outline"
                        onClick={() => setIsVariablesOpen(true)}
                        className="border-indigo-200 dark:border-indigo-800 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-50 dark:hover:bg-indigo-950/50 gap-2 shadow-sm text-xs h-9"
                    >
                        <Sparkles className="h-3.5 w-3.5 text-indigo-600 dark:text-indigo-400" />
                        Personalizar Variáveis ({'{assinaturas}'})
                    </Button>
                    <Button
                        onClick={() => setIsCreateOpen(true)}
                        className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs gap-1.5 h-9"
                    >
                        <Plus className="h-4 w-4" />
                        Novo Fluxo
                    </Button>
                </div>
            </div>

            {/* BANNER INFORMATIVO DE STATUS */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <Card className="p-4 flex items-center justify-between border shadow-sm">
                    <div className="space-y-1">
                        <p className="text-xs text-muted-foreground font-medium">WhatsApp UazAPI</p>
                        <p className="text-sm font-bold">
                            {connectionConfig?.status === 'connected' ? 'Conectado e Ativo' : 'Desconectado'}
                        </p>
                    </div>
                    <Badge
                        className={
                            connectionConfig?.status === 'connected'
                                ? 'bg-emerald-100 text-emerald-800'
                                : 'bg-rose-100 text-rose-800'
                        }
                    >
                        {connectionConfig?.status === 'connected' ? '🟢 Online' : '🔴 Offline'}
                    </Badge>
                </Card>

                <Card className="p-4 flex items-center justify-between border shadow-sm">
                    <div className="space-y-1">
                        <p className="text-xs text-muted-foreground font-medium">Gatilho Configurado</p>
                        <p className="text-sm font-bold">
                            {triggerConfig?.triggerMode === 'all_messages'
                                ? 'Qualquer Mensagem'
                                : `${triggerConfig?.keywords?.length || 0} Palavras-Chaves`}
                        </p>
                    </div>
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => router.push('/flows/settings')}
                        className="text-xs text-indigo-600 gap-1 h-8"
                    >
                        <Settings className="h-3.5 w-3.5" />
                        Ajustar
                    </Button>
                </Card>

                <Card className="p-4 flex items-center justify-between border shadow-sm">
                    <div className="space-y-1">
                        <p className="text-xs text-muted-foreground font-medium">Personalizar Variáveis</p>
                        <p className="text-sm font-bold text-indigo-600 dark:text-indigo-400">Listas ({'{assinaturas}'})</p>
                    </div>
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setIsVariablesOpen(true)}
                        className="text-xs border-indigo-200 dark:border-indigo-800 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-50 dark:hover:bg-indigo-950/50 gap-1 h-8"
                    >
                        <Sparkles className="h-3.5 w-3.5 text-indigo-600" />
                        Configurar
                    </Button>
                </Card>

                <Card className="p-4 flex items-center justify-between border shadow-sm">
                    <div className="space-y-1">
                        <p className="text-xs text-muted-foreground font-medium">Total de Fluxos</p>
                        <p className="text-sm font-bold">{flows?.length || 0} Fluxo(s)</p>
                    </div>
                    <Button
                        onClick={() => setIsCreateOpen(true)}
                        size="sm"
                        className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs gap-1 h-8"
                    >
                        <Plus className="h-3.5 w-3.5" />
                        Novo Fluxo
                    </Button>
                </Card>
            </div>

            {/* LISTAGEM DE FLUXOS */}
            <div className="space-y-4">
                <div className="flex items-center justify-between">
                    <h2 className="text-lg font-bold flex items-center gap-2">
                        <Layers className="h-5 w-5 text-indigo-600" />
                        Seus Fluxos de Atendimento
                    </h2>
                </div>

                {isLoadingFlows ? (
                    <div className="flex items-center justify-center py-12">
                        <Loader2 className="h-8 w-8 text-indigo-600 animate-spin" />
                    </div>
                ) : !flows || flows.length === 0 ? (
                    <Card className="border-dashed p-12 text-center flex flex-col items-center justify-center gap-4">
                        <div className="w-16 h-16 rounded-full bg-indigo-50 dark:bg-indigo-950/40 flex items-center justify-center text-indigo-600">
                            <Workflow className="h-8 w-8" />
                        </div>
                        <div className="max-w-md space-y-1">
                            <h3 className="font-bold text-lg">Nenhum fluxo criado ainda</h3>
                            <p className="text-sm text-muted-foreground">
                                Comece criando seu primeiro fluxo com mensagens automáticas, menus interativos e botões em formato visual.
                            </p>
                        </div>
                        <Button
                            onClick={() => setIsCreateOpen(true)}
                            className="bg-indigo-600 hover:bg-indigo-700 text-white gap-2 mt-2"
                        >
                            <Plus className="h-4 w-4" />
                            Criar Primeiro Fluxo
                        </Button>
                    </Card>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                        {flows.map((flow) => {
                            const nodeCount = flow.nodes?.length || 0;
                            return (
                                <Card
                                    key={flow.id}
                                    className="border shadow-sm hover:shadow-md transition-shadow flex flex-col justify-between"
                                >
                                    <CardHeader className="pb-3">
                                        <div className="flex items-start justify-between gap-2">
                                            <div className="space-y-1 min-w-0">
                                                <CardTitle className="text-base font-bold truncate">
                                                    {flow.name}
                                                </CardTitle>
                                                <CardDescription className="text-xs line-clamp-2">
                                                    {flow.description || 'Sem descrição'}
                                                </CardDescription>
                                            </div>
                                            <DropdownMenu>
                                                <DropdownMenuTrigger asChild>
                                                    <Button variant="ghost" size="icon" className="h-8 w-8">
                                                        <MoreVertical className="h-4 w-4" />
                                                    </Button>
                                                </DropdownMenuTrigger>
                                                <DropdownMenuContent align="end">
                                                    <DropdownMenuItem onClick={() => router.push(`/flows/${flow.id}`)}>
                                                        <Edit3 className="h-4 w-4 mr-2" /> Editar no Canva
                                                    </DropdownMenuItem>
                                                    <DropdownMenuItem onClick={() => handleDuplicateFlow(flow)}>
                                                        <Copy className="h-4 w-4 mr-2" /> Duplicar
                                                    </DropdownMenuItem>
                                                    <DropdownMenuItem
                                                        onClick={() => handleDeleteFlow(flow)}
                                                        className="text-destructive"
                                                    >
                                                        <Trash2 className="h-4 w-4 mr-2" /> Excluir
                                                    </DropdownMenuItem>
                                                </DropdownMenuContent>
                                            </DropdownMenu>
                                        </div>
                                    </CardHeader>

                                    <CardContent className="space-y-3 pb-3">
                                        <div className="flex items-center gap-2">
                                            <Badge variant="secondary" className="text-[11px] gap-1 font-mono">
                                                {nodeCount} {nodeCount === 1 ? 'bloco' : 'blocos'}
                                            </Badge>
                                            <Badge
                                                variant="outline"
                                                className={`text-[11px] ${
                                                    flow.isActive
                                                        ? 'border-emerald-300 text-emerald-700 bg-emerald-50 dark:bg-emerald-950/20'
                                                        : 'text-muted-foreground'
                                                }`}
                                            >
                                                {flow.isActive ? 'Ativo' : 'Pausado'}
                                            </Badge>
                                        </div>
                                    </CardContent>

                                    <CardFooter className="pt-3 border-t flex items-center justify-between">
                                        <div className="flex items-center gap-2">
                                            <Switch
                                                checked={flow.isActive !== false}
                                                onCheckedChange={() => handleToggleActive(flow)}
                                            />
                                            <span className="text-xs text-muted-foreground">
                                                {flow.isActive ? 'Ativo' : 'Pausado'}
                                            </span>
                                        </div>

                                        <Button
                                            onClick={() => router.push(`/flows/${flow.id}`)}
                                            size="sm"
                                            className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs gap-1.5 h-8"
                                        >
                                            Abrir no Canva
                                            <ArrowRight className="h-3.5 w-3.5" />
                                        </Button>
                                    </CardFooter>
                                </Card>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* MODAL NOVO FLUXO */}
            <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
                <DialogContent className="max-w-md">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <Workflow className="h-5 w-5 text-indigo-600" />
                            Criar Novo Fluxo
                        </DialogTitle>
                        <DialogDescription>
                            Dê um nome e descrição para seu fluxo visual automatizado.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-4 py-2">
                        <div className="space-y-2">
                            <Label htmlFor="flowName" className="text-sm font-semibold">
                                Nome do Fluxo *
                            </Label>
                            <Input
                                id="flowName"
                                placeholder="Ex: Menu Principal de Boas-vindas"
                                value={newFlowName}
                                onChange={(e) => setNewFlowName(e.target.value)}
                            />
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="flowDesc" className="text-sm font-semibold">
                                Descrição (Opcional)
                            </Label>
                            <Textarea
                                id="flowDesc"
                                placeholder="Ex: Disparado quando o cliente manda 'oi' ou 'menu'"
                                value={newFlowDescription}
                                onChange={(e) => setNewFlowDescription(e.target.value)}
                                rows={2}
                            />
                        </div>

                        <div className="p-3 rounded-lg bg-indigo-50/50 dark:bg-indigo-950/20 border border-indigo-100 dark:border-indigo-900/50 flex items-center justify-between">
                            <div className="space-y-0.5">
                                <p className="text-xs font-semibold text-indigo-900 dark:text-indigo-300">
                                    Começar com Template de Menu
                                </p>
                                <p className="text-[11px] text-muted-foreground">
                                    Cria automaticamente os blocos de Início, Menu e Suporte prontos.
                                </p>
                            </div>
                            <Switch checked={useTemplate} onCheckedChange={setUseTemplate} />
                        </div>
                    </div>

                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsCreateOpen(false)}>
                            Cancelar
                        </Button>
                        <Button
                            onClick={handleCreateFlow}
                            disabled={isCreating || !newFlowName.trim()}
                            className="bg-indigo-600 hover:bg-indigo-700 text-white gap-2"
                        >
                            {isCreating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                            Criar e Abrir no Canva
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* MODAL DE PERSONALIZAR VARIÁVEIS */}
            <FlowVariablesConfigDialog
                open={isVariablesOpen}
                onOpenChange={setIsVariablesOpen}
            />
        </div>
    );
}
