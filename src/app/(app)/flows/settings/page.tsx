'use client';

import React, { useState, useEffect } from 'react';
import { useFirebase, useDoc, useCollection, useMemoFirebase } from '@/firebase';
import { doc, collection, setDoc } from 'firebase/firestore';
import type { FlowDefinition, FlowTriggerSettings, FlowKeywordTrigger } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';
import { PageHeader } from '@/components/page-header';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { 
    MessageSquare, 
    KeyRound, 
    Plus, 
    Trash2, 
    Save, 
    Loader2, 
    Sparkles, 
    CheckCircle2, 
    HelpCircle,
    Info
} from 'lucide-react';

export default function FlowSettingsPage() {
    const { firestore, effectiveUserId } = useFirebase();
    const { toast } = useToast();

    // Query dos fluxos cadastrados para os selects
    const flowsQuery = useMemoFirebase(() => {
        if (!effectiveUserId) return null;
        return collection(firestore, 'users', effectiveUserId, 'flows');
    }, [firestore, effectiveUserId]);
    const { data: flows, isLoading: isLoadingFlows } = useCollection<FlowDefinition>(flowsQuery);

    // Documento de configurações de gatilho
    const configDocRef = useMemoFirebase(() => {
        if (!effectiveUserId) return null;
        return doc(firestore, 'users', effectiveUserId, 'settings', 'flow_config');
    }, [firestore, effectiveUserId]);
    const { data: savedConfig, isLoading: isLoadingConfig } = useDoc<FlowTriggerSettings>(configDocRef);

    // Estados do formulário
    const [triggerMode, setTriggerMode] = useState<'all_messages' | 'keywords'>('keywords');
    const [defaultFlowId, setDefaultFlowId] = useState<string>('');
    const [keywords, setKeywords] = useState<FlowKeywordTrigger[]>([]);
    const [ignoreIfActiveFlow, setIgnoreIfActiveFlow] = useState<boolean>(true);
    const [restartKeywordsInput, setRestartKeywordsInput] = useState<string>('menu, reiniciar, voltar');
    const [isSaving, setIsSaving] = useState(false);

    // Novo item de palavra-chave
    const [newKeyword, setNewKeyword] = useState('');
    const [newMatchType, setNewMatchType] = useState<'exact' | 'contains'>('contains');
    const [newFlowId, setNewFlowId] = useState('');

    useEffect(() => {
        if (savedConfig) {
            setTriggerMode(savedConfig.triggerMode || 'all_messages');
            setDefaultFlowId(savedConfig.defaultFlowId || '');
            setKeywords(savedConfig.keywords || []);
            setIgnoreIfActiveFlow(savedConfig.ignoreIfActiveFlow !== false);
            if (savedConfig.restartKeywords) {
                setRestartKeywordsInput(savedConfig.restartKeywords.join(', '));
            }
        }
    }, [savedConfig]);

    useEffect(() => {
        if (flows && flows.length > 0 && !defaultFlowId) {
            const firstActive = flows.find(f => f.isActive !== false) || flows[0];
            if (firstActive) setDefaultFlowId(firstActive.id);
        }
    }, [flows, defaultFlowId]);

    // Adicionar palavra-chave
    const handleAddKeyword = () => {
        const kw = newKeyword.trim().toLowerCase();
        if (!kw) {
            toast({ variant: 'destructive', title: 'Palavra-chave vazia', description: 'Digite uma palavra ou frase.' });
            return;
        }
        if (!newFlowId) {
            toast({ variant: 'destructive', title: 'Selecione um fluxo', description: 'Escolha qual fluxo será disparado por essa palavra-chave.' });
            return;
        }

        const item: FlowKeywordTrigger = {
            id: 'kw_' + Date.now(),
            keyword: kw,
            matchType: newMatchType,
            flowId: newFlowId,
        };

        setKeywords((prev) => [...prev, item]);
        setNewKeyword('');
        setNewFlowId('');
        toast({ title: 'Palavra-chave adicionada!', description: `"${kw}" configurada.` });
    };

    // Remover palavra-chave
    const handleRemoveKeyword = (id: string) => {
        setKeywords((prev) => prev.filter((k) => k.id !== id));
    };

    // Salvar configurações no Firestore
    const handleSave = async () => {
        if (!effectiveUserId) return;
        setIsSaving(true);

        const restartKeywordsList = restartKeywordsInput
            .split(',')
            .map((s) => s.trim().toLowerCase())
            .filter(Boolean);

        const payload: FlowTriggerSettings = {
            triggerMode,
            defaultFlowId: defaultFlowId || undefined,
            keywords,
            ignoreIfActiveFlow,
            restartKeywords: restartKeywordsList,
            updatedAt: new Date().toISOString(),
        };

        try {
            await setDoc(configDocRef!, payload, { merge: true });
            toast({ title: 'Configurações salvas com sucesso!', description: 'O gatilho de mensagens foi atualizado.' });
        } catch (err: any) {
            toast({ variant: 'destructive', title: 'Erro ao salvar', description: err.message });
        } finally {
            setIsSaving(false);
        }
    };

    const activeFlowsList = (flows || []).filter((f) => f.isActive !== false);

    return (
        <div className="flex-1 space-y-6 p-4 md:p-8 pt-6">
            <PageHeader
                title="Configurações de Gatilho de Fluxo"
                description="Escolha quando e como seus fluxos automáticos serão iniciados quando os clientes enviarem mensagens."
            />

            <div className="max-w-4xl space-y-6">
                {/* CARD GATILHO PRINCIPAL */}
                <Card className="border shadow-sm">
                    <CardHeader>
                        <CardTitle className="text-lg flex items-center gap-2">
                            <Sparkles className="h-5 w-5 text-indigo-600" />
                            Quando iniciar o fluxo?
                        </CardTitle>
                        <CardDescription>
                            Defina se o fluxo deve responder a qualquer mensagem recebida ou apenas a palavras-chaves específicas.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-6">
                        <RadioGroup
                            value={triggerMode}
                            onValueChange={(val: any) => setTriggerMode(val)}
                            className="grid grid-cols-1 md:grid-cols-2 gap-4"
                        >
                            {/* OPÇÃO 1: QUALQUER MENSAGEM */}
                            <label
                                htmlFor="trigger-all"
                                className={`cursor-pointer flex flex-col p-4 rounded-xl border-2 transition-all ${
                                    triggerMode === 'all_messages'
                                        ? 'border-indigo-600 bg-indigo-50/50 dark:bg-indigo-950/20 shadow-sm'
                                        : 'border-slate-200 dark:border-slate-800 hover:border-slate-300'
                                }`}
                            >
                                <div className="flex items-center gap-3">
                                    <RadioGroupItem value="all_messages" id="trigger-all" />
                                    <div className="flex items-center gap-2 font-semibold text-sm">
                                        <MessageSquare className="h-4 w-4 text-indigo-600" />
                                        Mandar qualquer mensagem
                                    </div>
                                </div>
                                <p className="text-xs text-muted-foreground mt-3 pl-7">
                                    Inicia automaticamente o fluxo padrão selecionado sempre que um cliente enviar qualquer mensagem inicial no WhatsApp.
                                </p>
                            </label>

                            {/* OPÇÃO 2: PALAVRAS-CHAVES */}
                            <label
                                htmlFor="trigger-keywords"
                                className={`cursor-pointer flex flex-col p-4 rounded-xl border-2 transition-all ${
                                    triggerMode === 'keywords'
                                        ? 'border-indigo-600 bg-indigo-50/50 dark:bg-indigo-950/20 shadow-sm'
                                        : 'border-slate-200 dark:border-slate-800 hover:border-slate-300'
                                }`}
                            >
                                <div className="flex items-center gap-3">
                                    <RadioGroupItem value="keywords" id="trigger-keywords" />
                                    <div className="flex items-center gap-2 font-semibold text-sm">
                                        <KeyRound className="h-4 w-4 text-indigo-600" />
                                        Mandar mensagem específica (Palavras-chaves)
                                    </div>
                                </div>
                                <p className="text-xs text-muted-foreground mt-3 pl-7">
                                    O fluxo só é disparado quando a mensagem do cliente contiver ou for idêntica a uma palavra-chave configurada.
                                </p>
                            </label>
                        </RadioGroup>

                        {/* SEÇÃO QUALQUER MENSAGEM: FLUXO PADRÃO */}
                        {triggerMode === 'all_messages' && (
                            <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-3 animate-in fade-in-50">
                                <Label className="text-sm font-semibold flex items-center gap-2">
                                    Fluxo Padrão a Disparar
                                </Label>
                                <Select value={defaultFlowId} onValueChange={setDefaultFlowId}>
                                    <SelectTrigger className="w-full bg-white dark:bg-slate-950">
                                        <SelectValue placeholder="Selecione o fluxo padrão..." />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {flows && flows.length > 0 ? (
                                            flows.map((f) => (
                                                <SelectItem key={f.id} value={f.id}>
                                                    {f.name} {!f.isActive ? '(Inativo)' : ''}
                                                </SelectItem>
                                            ))
                                        ) : (
                                            <SelectItem value="none" disabled>
                                                Nenhum fluxo criado ainda
                                            </SelectItem>
                                        )}
                                    </SelectContent>
                                </Select>
                                <p className="text-xs text-muted-foreground">
                                    Ao receber qualquer mensagem de um contato que não esteja em um atendimento ativo, esse fluxo responderá.
                                </p>
                            </div>
                        )}

                        {/* SEÇÃO PALAVRAS-CHAVES */}
                        {triggerMode === 'keywords' && (
                            <div className="space-y-4 animate-in fade-in-50">
                                <div className="flex items-center justify-between">
                                    <Label className="text-sm font-bold flex items-center gap-2">
                                        <KeyRound className="h-4 w-4 text-indigo-600" />
                                        Palavras-chaves cadastradas ({keywords.length})
                                    </Label>
                                </div>

                                {/* FORMULÁRIO DE ADIÇÃO RÁPIDA */}
                                <div className="p-4 rounded-xl border border-indigo-100 bg-indigo-50/40 dark:bg-indigo-950/20 dark:border-indigo-900/50 space-y-3">
                                    <p className="text-xs font-semibold text-indigo-900 dark:text-indigo-300">
                                        + Cadastrar nova palavra-chave e fluxo correspondente:
                                    </p>
                                    <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
                                        <div className="md:col-span-5 space-y-1">
                                            <Label className="text-xs">Palavra ou Frase</Label>
                                            <Input
                                                placeholder="Ex: oi, menu, comprar, plano..."
                                                value={newKeyword}
                                                onChange={(e) => setNewKeyword(e.target.value)}
                                                className="bg-white dark:bg-slate-950"
                                            />
                                        </div>

                                        <div className="md:col-span-3 space-y-1">
                                            <Label className="text-xs">Correspondência</Label>
                                            <Select
                                                value={newMatchType}
                                                onValueChange={(val: any) => setNewMatchType(val)}
                                            >
                                                <SelectTrigger className="bg-white dark:bg-slate-950">
                                                    <SelectValue />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="contains">Contém o texto</SelectItem>
                                                    <SelectItem value="exact">Mensagem Exata</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        </div>

                                        <div className="md:col-span-3 space-y-1">
                                            <Label className="text-xs">Disparar Fluxo</Label>
                                            <Select value={newFlowId} onValueChange={setNewFlowId}>
                                                <SelectTrigger className="bg-white dark:bg-slate-950">
                                                    <SelectValue placeholder="Escolha o fluxo..." />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    {flows && flows.length > 0 ? (
                                                        flows.map((f) => (
                                                            <SelectItem key={f.id} value={f.id}>
                                                                {f.name}
                                                            </SelectItem>
                                                        ))
                                                    ) : (
                                                        <SelectItem value="none" disabled>
                                                            Nenhum fluxo disponível
                                                        </SelectItem>
                                                    )}
                                                </SelectContent>
                                            </Select>
                                        </div>

                                        <div className="md:col-span-1">
                                            <Button
                                                onClick={handleAddKeyword}
                                                size="sm"
                                                className="w-full bg-indigo-600 hover:bg-indigo-700 text-white"
                                                title="Adicionar palavra-chave"
                                            >
                                                <Plus className="h-4 w-4" />
                                            </Button>
                                        </div>
                                    </div>
                                </div>

                                {/* LISTA DE PALAVRAS CADASTRADAS */}
                                {keywords.length === 0 ? (
                                    <div className="text-center p-6 border border-dashed rounded-xl text-muted-foreground text-sm">
                                        Nenhuma palavra-chave cadastrada ainda. Adicione acima as palavras que ativarão seus fluxos (Ex: &quot;oi&quot;, &quot;menu&quot;, etc).
                                    </div>
                                ) : (
                                    <div className="divide-y border rounded-xl overflow-hidden bg-card">
                                        {keywords.map((item) => {
                                            const matchedFlow = flows?.find((f) => f.id === item.flowId);
                                            return (
                                                <div
                                                    key={item.id}
                                                    className="flex items-center justify-between p-3 px-4 hover:bg-muted/40 transition-colors"
                                                >
                                                    <div className="flex items-center gap-3">
                                                        <Badge variant="outline" className="font-mono text-xs px-2 py-0.5 bg-background">
                                                            {item.keyword}
                                                        </Badge>
                                                        <span className="text-xs text-muted-foreground">
                                                            {item.matchType === 'exact' ? '(Exata)' : '(Contém)'}
                                                        </span>
                                                        <span className="text-xs font-medium text-indigo-600 dark:text-indigo-400">
                                                            ➔ Dispara: <strong>{matchedFlow?.name || 'Fluxo não encontrado'}</strong>
                                                        </span>
                                                    </div>
                                                    <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        onClick={() => handleRemoveKeyword(item.id)}
                                                        className="text-destructive hover:bg-destructive/10 h-8 w-8"
                                                    >
                                                        <Trash2 className="h-4 w-4" />
                                                    </Button>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        )}
                    </CardContent>
                </Card>

                {/* CARD REGRAS ADICIONAIS */}
                <Card className="border shadow-sm">
                    <CardHeader>
                        <CardTitle className="text-base flex items-center gap-2">
                            <Info className="h-4 w-4 text-indigo-600" />
                            Regras de Comportamento e Sessão
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="flex items-center justify-between">
                            <div className="space-y-0.5 pr-4">
                                <Label className="text-sm font-semibold">
                                    Não reiniciar fluxo se o cliente já estiver em um fluxo ativo
                                </Label>
                                <p className="text-xs text-muted-foreground">
                                    Impede que mensagens enviadas pelo cliente enquanto ele está respondendo a um menu reiniciem a conversa do zero.
                                </p>
                            </div>
                            <Switch
                                checked={ignoreIfActiveFlow}
                                onCheckedChange={setIgnoreIfActiveFlow}
                            />
                        </div>

                        <div className="space-y-2 pt-2 border-t">
                            <Label className="text-sm font-semibold">
                                Palavras para Forçar Reinício do Menu
                            </Label>
                            <Input
                                value={restartKeywordsInput}
                                onChange={(e) => setRestartKeywordsInput(e.target.value)}
                                placeholder="menu, reiniciar, voltar, sair"
                                className="font-mono text-xs"
                            />
                            <p className="text-xs text-muted-foreground">
                                Separadas por vírgula. Se o cliente digitar qualquer uma dessas palavras, o fluxo atual é cancelado e ele volta ao menu principal.
                            </p>
                        </div>
                    </CardContent>
                    <CardFooter className="border-t pt-4 flex justify-end">
                        <Button
                            onClick={handleSave}
                            disabled={isSaving}
                            className="bg-indigo-600 hover:bg-indigo-700 text-white gap-2"
                        >
                            {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                            Salvar Configurações
                        </Button>
                    </CardFooter>
                </Card>
            </div>
        </div>
    );
}
