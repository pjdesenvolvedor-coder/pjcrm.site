'use client';

import React, { useState, useEffect } from 'react';
import { useFirebase, useDoc, useCollection, useMemoFirebase } from '@/firebase';
import { doc, collection, setDoc } from 'firebase/firestore';
import type { FlowDefinition, FlowTriggerSettings, FlowKeywordTrigger } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import {
    Accordion,
    AccordionContent,
    AccordionItem,
    AccordionTrigger,
} from '@/components/ui/accordion';
import {
    MessageSquare,
    KeyRound,
    Plus,
    Trash2,
    Save,
    Loader2,
    Sparkles,
    RotateCcw,
    UserCheck,
    PhoneCall,
    SlidersHorizontal,
    ShieldAlert,
    Building2,
    User,
    ChevronDown,
} from 'lucide-react';

export default function FlowSettingsPage() {
    const { firestore, effectiveUserId } = useFirebase();
    const { toast } = useToast();

    // Query dos fluxos cadastrados para os selects
    const flowsQuery = useMemoFirebase(() => {
        if (!effectiveUserId) return null;
        return collection(firestore, 'users', effectiveUserId, 'flows');
    }, [firestore, effectiveUserId]);
    const { data: flows } = useCollection<FlowDefinition>(flowsQuery);

    // Documento de configurações de gatilho
    const configDocRef = useMemoFirebase(() => {
        if (!effectiveUserId) return null;
        return doc(firestore, 'users', effectiveUserId, 'settings', 'flow_config');
    }, [firestore, effectiveUserId]);
    const { data: savedConfig } = useDoc<FlowTriggerSettings>(configDocRef);

    // Estados do formulário
    const [triggerMode, setTriggerMode] = useState<'all_messages' | 'keywords'>('all_messages');
    const [defaultFlowId, setDefaultFlowId] = useState<string>('');
    const [keywords, setKeywords] = useState<FlowKeywordTrigger[]>([]);
    const [ignoreIfActiveFlow, setIgnoreIfActiveFlow] = useState<boolean>(true);
    const [restartKeywordsInput, setRestartKeywordsInput] = useState<string>('menu, reiniciar, voltar');
    const [resetKeyword, setResetKeyword] = useState<string>('reset');
    const [invalidOptionMessage, setInvalidOptionMessage] = useState<string>('Selecione a opção acima');
    const [humanSupportKeywordsInput, setHumanSupportKeywordsInput] = useState<string>(
        'falar com atendente, atendimento humanizado, atendimento humano, humano'
    );
    const [humanSupportPhone, setHumanSupportPhone] = useState<string>('');
    const [humanSupportName, setHumanSupportName] = useState<string>('Suporte Oficial');
    const [humanSupportOrg, setHumanSupportOrg] = useState<string>('');
    const [isSaving, setIsSaving] = useState(false);

    // Novo item de palavra-chave
    const [newKeyword, setNewKeyword] = useState('');
    const [newMatchType, setNewMatchType] = useState<'exact' | 'contains'>('contains');
    const [newFlowId, setNewFlowId] = useState('');
    const [showAddKeywordForm, setShowAddKeywordForm] = useState(false);

    useEffect(() => {
        if (savedConfig) {
            setTriggerMode(savedConfig.triggerMode || 'all_messages');
            setDefaultFlowId(savedConfig.defaultFlowId || '');
            setKeywords(savedConfig.keywords || []);
            setIgnoreIfActiveFlow(savedConfig.ignoreIfActiveFlow !== false);
            if (savedConfig.restartKeywords) {
                setRestartKeywordsInput(savedConfig.restartKeywords.join(', '));
            }
            if (savedConfig.resetKeyword) {
                setResetKeyword(savedConfig.resetKeyword);
            }
            if (savedConfig.invalidOptionMessage) {
                setInvalidOptionMessage(savedConfig.invalidOptionMessage);
            }
            if (savedConfig.humanSupportKeywords) {
                setHumanSupportKeywordsInput(savedConfig.humanSupportKeywords.join(', '));
            }
            if (savedConfig.humanSupportPhone) {
                setHumanSupportPhone(savedConfig.humanSupportPhone);
            }
            if (savedConfig.humanSupportName) {
                setHumanSupportName(savedConfig.humanSupportName);
            }
            if (savedConfig.humanSupportOrg) {
                setHumanSupportOrg(savedConfig.humanSupportOrg);
            }
        }
    }, [savedConfig]);

    useEffect(() => {
        if (flows && flows.length > 0 && !defaultFlowId) {
            const firstActive = flows.find((f) => f.isActive !== false) || flows[0];
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
            toast({
                variant: 'destructive',
                title: 'Selecione um fluxo',
                description: 'Escolha qual fluxo será disparado por essa palavra-chave.',
            });
            return;
        }

        const item: FlowKeywordTrigger = {
            id: 'kw_' + Date.now(),
            keyword: kw,
            matchType: newMatchType,
            flowId: newFlowId,
        };

        const updatedKeywords = [...keywords, item];
        setKeywords(updatedKeywords);
        setNewKeyword('');
        setNewFlowId('');
        setShowAddKeywordForm(false);

        if (effectiveUserId && configDocRef) {
            setDoc(
                configDocRef,
                {
                    triggerMode: 'keywords',
                    keywords: updatedKeywords,
                    updatedAt: new Date().toISOString(),
                },
                { merge: true }
            )
                .then(() => {
                    toast({
                        title: 'Palavra-chave salva e ativada!',
                        description: `"${kw}" configurada para disparar o fluxo.`,
                    });
                })
                .catch((err) => {
                    toast({
                        variant: 'destructive',
                        title: 'Erro ao salvar palavra-chave',
                        description: err.message,
                    });
                });
        } else {
            toast({ title: 'Palavra-chave adicionada!', description: `"${kw}" configurada.` });
        }
    };

    // Remover palavra-chave
    const handleRemoveKeyword = (id: string) => {
        const updatedKeywords = keywords.filter((k) => k.id !== id);
        setKeywords(updatedKeywords);
        if (effectiveUserId && configDocRef) {
            setDoc(
                configDocRef,
                {
                    keywords: updatedKeywords,
                    updatedAt: new Date().toISOString(),
                },
                { merge: true }
            ).catch(() => {});
        }
    };

    // Salvar configurações no Firestore
    const handleSave = async () => {
        if (!effectiveUserId) return;
        setIsSaving(true);

        const restartKeywordsList = restartKeywordsInput
            .split(',')
            .map((s) => s.trim().toLowerCase())
            .filter(Boolean);

        const humanSupportKeywordsList = humanSupportKeywordsInput
            .split(',')
            .map((s) => s.trim().toLowerCase())
            .filter(Boolean);

        const rawPayload: Record<string, any> = {
            triggerMode,
            defaultFlowId: defaultFlowId || '',
            keywords,
            ignoreIfActiveFlow,
            restartKeywords: restartKeywordsList,
            resetKeyword: resetKeyword.trim().toLowerCase() || 'reset',
            invalidOptionMessage: invalidOptionMessage.trim() || 'Selecione a opção acima',
            humanSupportKeywords: humanSupportKeywordsList,
            humanSupportPhone: humanSupportPhone.trim(),
            humanSupportName: humanSupportName.trim() || 'Suporte Oficial',
            humanSupportOrg: humanSupportOrg.trim(),
            updatedAt: new Date().toISOString(),
        };

        const payload: Record<string, any> = {};
        for (const [key, val] of Object.entries(rawPayload)) {
            if (val !== undefined) {
                payload[key] = val;
            }
        }

        try {
            await setDoc(configDocRef!, payload, { merge: true });
            toast({ title: 'Configurações salvas com sucesso!', description: 'O gatilho de mensagens foi atualizado.' });
        } catch (err: any) {
            toast({ variant: 'destructive', title: 'Erro ao salvar', description: err.message });
        } finally {
            setIsSaving(false);
        }
    };

    const selectedDefaultFlowName = flows?.find((f) => f.id === defaultFlowId)?.name || 'Padrão';

    return (
        <div className="flex-1 space-y-5 p-4 sm:p-6 md:p-8 max-w-4xl mx-auto">
            {/* CABEÇALHO RESPONSIVO COM BOTÃO DE SALVAR UNIFICADO */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b">
                <div>
                    <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">
                        Configurações de Gatilho de Fluxo
                    </h1>
                    <p className="text-xs sm:text-sm text-muted-foreground mt-1">
                        Clique nas seções abaixo para expandir e configurar os gatilhos, sessão e suporte.
                    </p>
                </div>
                <Button
                    onClick={handleSave}
                    disabled={isSaving}
                    className="bg-indigo-600 hover:bg-indigo-700 text-white gap-2 shrink-0 w-full sm:w-auto shadow-xs"
                >
                    {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                    Salvar Alterações
                </Button>
            </div>

            {/* SEÇÕES AGRUPADAS EM ACCORDION (DROPDOWN) */}
            <Accordion type="multiple" defaultValue={['trigger']} className="space-y-3">
                {/* 1. QUANDO INICIAR O FLUXO */}
                <AccordionItem
                    value="trigger"
                    className="border rounded-2xl bg-card shadow-2xs overflow-hidden px-4 sm:px-5"
                >
                    <AccordionTrigger className="hover:no-underline py-4 gap-3">
                        <div className="flex items-center gap-3 text-left min-w-0 flex-1">
                            <div className="h-9 w-9 rounded-xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0">
                                <Sparkles className="h-4 w-4" />
                            </div>
                            <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2 flex-wrap">
                                    <span className="font-semibold text-sm sm:text-base text-foreground">
                                        Quando iniciar o fluxo?
                                    </span>
                                    <Badge
                                        variant="secondary"
                                        className="text-[11px] font-medium bg-indigo-50 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300 border-indigo-200/60"
                                    >
                                        {triggerMode === 'all_messages'
                                            ? `Qualquer mensagem (${selectedDefaultFlowName})`
                                            : `Palavras-chaves (${keywords.length})`}
                                    </Badge>
                                </div>
                                <p className="text-xs text-muted-foreground truncate mt-0.5">
                                    Escolha se o robô responde a qualquer mensagem ou apenas palavras-chaves.
                                </p>
                            </div>
                        </div>
                    </AccordionTrigger>

                    <AccordionContent className="pt-2 pb-5 space-y-4 border-t">
                        <RadioGroup
                            value={triggerMode}
                            onValueChange={(val: 'all_messages' | 'keywords') => {
                                setTriggerMode(val);
                                if (effectiveUserId && configDocRef) {
                                    setDoc(
                                        configDocRef,
                                        { triggerMode: val, updatedAt: new Date().toISOString() },
                                        { merge: true }
                                    ).catch(() => {});
                                }
                            }}
                            className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2"
                        >
                            {/* OPÇÃO 1: QUALQUER MENSAGEM */}
                            <label
                                htmlFor="trigger-all"
                                className={`cursor-pointer flex items-start gap-3 p-3.5 rounded-xl border transition-all ${
                                    triggerMode === 'all_messages'
                                        ? 'border-indigo-600 bg-indigo-50/40 dark:bg-indigo-950/25 ring-1 ring-indigo-600/20'
                                        : 'border-border hover:border-slate-300 dark:hover:border-slate-700'
                                }`}
                            >
                                <RadioGroupItem value="all_messages" id="trigger-all" className="mt-0.5" />
                                <div className="space-y-1 min-w-0">
                                    <div className="flex items-center gap-1.5 font-semibold text-xs sm:text-sm">
                                        <MessageSquare className="h-3.5 w-3.5 text-indigo-600 shrink-0" />
                                        <span>Qualquer mensagem</span>
                                    </div>
                                    <p className="text-[11px] text-muted-foreground leading-relaxed">
                                        Inicia o fluxo padrão sempre que o cliente mandar a primeira mensagem.
                                    </p>
                                </div>
                            </label>

                            {/* OPÇÃO 2: PALAVRAS-CHAVES */}
                            <label
                                htmlFor="trigger-keywords"
                                className={`cursor-pointer flex items-start gap-3 p-3.5 rounded-xl border transition-all ${
                                    triggerMode === 'keywords'
                                        ? 'border-indigo-600 bg-indigo-50/40 dark:bg-indigo-950/25 ring-1 ring-indigo-600/20'
                                        : 'border-border hover:border-slate-300 dark:hover:border-slate-700'
                                }`}
                            >
                                <RadioGroupItem value="keywords" id="trigger-keywords" className="mt-0.5" />
                                <div className="space-y-1 min-w-0">
                                    <div className="flex items-center gap-1.5 font-semibold text-xs sm:text-sm">
                                        <KeyRound className="h-3.5 w-3.5 text-indigo-600 shrink-0" />
                                        <span>Palavras-chaves específicas</span>
                                    </div>
                                    <p className="text-[11px] text-muted-foreground leading-relaxed">
                                        Só dispara quando a mensagem contiver ou for igual a uma palavra cadastrada.
                                    </p>
                                </div>
                            </label>
                        </RadioGroup>

                        {/* SEÇÃO QUALQUER MENSAGEM: FLUXO PADRÃO */}
                        {triggerMode === 'all_messages' && (
                            <div className="p-3.5 rounded-xl bg-muted/40 border space-y-2">
                                <Label className="text-xs font-semibold">Fluxo Padrão a Disparar</Label>
                                <Select value={defaultFlowId} onValueChange={setDefaultFlowId}>
                                    <SelectTrigger className="w-full bg-background h-9 text-xs sm:text-sm">
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
                            </div>
                        )}

                        {/* SEÇÃO PALAVRAS-CHAVES */}
                        {triggerMode === 'keywords' && (
                            <div className="space-y-3 pt-1">
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                    <Label className="text-xs font-semibold flex items-center gap-1.5 text-muted-foreground">
                                        <KeyRound className="h-3.5 w-3.5 text-indigo-600" />
                                        Palavras-chaves ativas ({keywords.length})
                                    </Label>
                                    <Button
                                        type="button"
                                        variant={showAddKeywordForm ? 'secondary' : 'outline'}
                                        size="sm"
                                        onClick={() => setShowAddKeywordForm((v) => !v)}
                                        className="h-8 text-xs gap-1.5 border-indigo-200 dark:border-indigo-800 text-indigo-700 dark:text-indigo-300"
                                    >
                                        <Plus className="h-3.5 w-3.5" />
                                        {showAddKeywordForm ? 'Fechar formulário' : 'Nova Palavra-chave'}
                                    </Button>
                                </div>

                                {/* DROPDOWN DE ADIÇÃO DE PALAVRA-CHAVE */}
                                {(showAddKeywordForm || keywords.length === 0) && (
                                    <div className="p-3.5 rounded-xl border border-indigo-200/70 bg-indigo-50/30 dark:bg-indigo-950/20 dark:border-indigo-900/50 space-y-3 animate-in fade-in-50">
                                        <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5 items-end">
                                            <div className="sm:col-span-4 space-y-1">
                                                <Label className="text-[11px]">Palavra ou Frase</Label>
                                                <Input
                                                    placeholder="Ex: oi, menu, plano..."
                                                    value={newKeyword}
                                                    onChange={(e) => setNewKeyword(e.target.value)}
                                                    className="bg-background h-8 text-xs"
                                                />
                                            </div>

                                            <div className="sm:col-span-3 space-y-1">
                                                <Label className="text-[11px]">Correspondência</Label>
                                                <Select
                                                    value={newMatchType}
                                                    onValueChange={(val: any) => setNewMatchType(val)}
                                                >
                                                    <SelectTrigger className="bg-background h-8 text-xs">
                                                        <SelectValue />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        <SelectItem value="contains">Contém o texto</SelectItem>
                                                        <SelectItem value="exact">Mensagem Exata</SelectItem>
                                                    </SelectContent>
                                                </Select>
                                            </div>

                                            <div className="sm:col-span-4 space-y-1">
                                                <Label className="text-[11px]">Disparar Fluxo</Label>
                                                <Select value={newFlowId} onValueChange={setNewFlowId}>
                                                    <SelectTrigger className="bg-background h-8 text-xs">
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

                                            <div className="sm:col-span-1">
                                                <Button
                                                    onClick={handleAddKeyword}
                                                    size="sm"
                                                    className="w-full h-8 bg-indigo-600 hover:bg-indigo-700 text-white"
                                                    title="Adicionar palavra-chave"
                                                >
                                                    <Plus className="h-4 w-4" />
                                                    <span className="sm:hidden ml-1.5 text-xs">Adicionar</span>
                                                </Button>
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {/* LISTA COMPACTA DE PALAVRAS CADASTRADAS */}
                                {keywords.length === 0 ? (
                                    <div className="text-center py-4 px-3 border border-dashed rounded-xl text-muted-foreground text-xs">
                                        Nenhuma palavra-chave cadastrada. Use o formulário acima para adicionar.
                                    </div>
                                ) : (
                                    <div className="divide-y border rounded-xl overflow-hidden bg-background">
                                        {keywords.map((item) => {
                                            const matchedFlow = flows?.find((f) => f.id === item.flowId);
                                            return (
                                                <div
                                                    key={item.id}
                                                    className="flex items-center justify-between gap-2 py-2 px-3 hover:bg-muted/40 transition-colors"
                                                >
                                                    <div className="flex items-center gap-2 flex-wrap min-w-0">
                                                        <Badge
                                                            variant="outline"
                                                            className="font-mono text-xs px-2 py-0.5 bg-muted/40"
                                                        >
                                                            {item.keyword}
                                                        </Badge>
                                                        <span className="text-[11px] text-muted-foreground">
                                                            {item.matchType === 'exact' ? 'Exata' : 'Contém'}
                                                        </span>
                                                        <span className="text-xs font-medium text-indigo-600 dark:text-indigo-400 truncate">
                                                            → {matchedFlow?.name || 'Fluxo não encontrado'}
                                                        </span>
                                                    </div>
                                                    <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        onClick={() => handleRemoveKeyword(item.id)}
                                                        className="text-destructive hover:bg-destructive/10 h-7 w-7 shrink-0"
                                                    >
                                                        <Trash2 className="h-3.5 w-3.5" />
                                                    </Button>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        )}
                    </AccordionContent>
                </AccordionItem>

                {/* 2. REGRAS DE COMPORTAMENTO E SESSÃO */}
                <AccordionItem
                    value="session"
                    className="border rounded-2xl bg-card shadow-2xs overflow-hidden px-4 sm:px-5"
                >
                    <AccordionTrigger className="hover:no-underline py-4 gap-3">
                        <div className="flex items-center gap-3 text-left min-w-0 flex-1">
                            <div className="h-9 w-9 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
                                <SlidersHorizontal className="h-4 w-4" />
                            </div>
                            <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2 flex-wrap">
                                    <span className="font-semibold text-sm sm:text-base text-foreground">
                                        Regras de Comportamento e Sessão
                                    </span>
                                    <Badge variant="outline" className="text-[11px] font-normal">
                                        Reset: &quot;{resetKeyword || 'reset'}&quot;
                                    </Badge>
                                </div>
                                <p className="text-xs text-muted-foreground truncate mt-0.5">
                                    Proteção de sessão ativa, palavras para voltar ao menu, reset de testes e aviso de opção inválida.
                                </p>
                            </div>
                        </div>
                    </AccordionTrigger>

                    <AccordionContent className="pt-3 pb-5 space-y-4 border-t">
                        {/* SWITCH SESSÃO ATIVA */}
                        <div className="flex items-center justify-between gap-4 p-3 rounded-xl bg-muted/30 border">
                            <div className="space-y-0.5">
                                <Label className="text-xs sm:text-sm font-semibold">
                                    Não reiniciar fluxo se o cliente já estiver em atendimento
                                </Label>
                                <p className="text-[11px] text-muted-foreground">
                                    Evita que novas mensagens reiniciem a conversa enquanto o cliente responde a um menu.
                                </p>
                            </div>
                            <Switch checked={ignoreIfActiveFlow} onCheckedChange={setIgnoreIfActiveFlow} />
                        </div>

                        {/* GRID 2 COLUNAS PARA PALAVRAS DE REINÍCIO E RESET */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div className="p-3 rounded-xl border bg-background space-y-1.5">
                                <Label className="text-xs font-semibold flex items-center justify-between">
                                    <span>Palavras para Voltar ao Menu</span>
                                    <span className="text-[10px] font-normal text-muted-foreground">Separe por vírgula</span>
                                </Label>
                                <Input
                                    value={restartKeywordsInput}
                                    onChange={(e) => setRestartKeywordsInput(e.target.value)}
                                    placeholder="menu, reiniciar, voltar"
                                    className="font-mono text-xs h-8"
                                />
                                <p className="text-[11px] text-muted-foreground leading-snug">
                                    Cancela a etapa atual e volta ao menu principal.
                                </p>
                            </div>

                            <div className="p-3 rounded-xl border bg-background space-y-1.5">
                                <div className="flex items-center justify-between">
                                    <Label className="text-xs font-semibold flex items-center gap-1 text-indigo-700 dark:text-indigo-400">
                                        <RotateCcw className="h-3.5 w-3.5" />
                                        Palavra de Reset (Testes)
                                    </Label>
                                    <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                                        Imediato
                                    </Badge>
                                </div>
                                <Input
                                    value={resetKeyword}
                                    onChange={(e) => setResetKeyword(e.target.value)}
                                    placeholder="reset"
                                    className="font-mono text-xs h-8"
                                />
                                <p className="text-[11px] text-muted-foreground leading-snug">
                                    Zera a sessão no WhatsApp na hora para você testar do início.
                                </p>
                            </div>
                        </div>

                        {/* MENSAGEM FORA DO MENU */}
                        <div className="p-3 rounded-xl border bg-background space-y-1.5">
                            <Label className="text-xs font-semibold flex items-center gap-1.5">
                                <ShieldAlert className="h-3.5 w-3.5 text-amber-600" />
                                Mensagem Padrão para Resposta Fora do Menu
                            </Label>
                            <Input
                                value={invalidOptionMessage}
                                onChange={(e) => setInvalidOptionMessage(e.target.value)}
                                placeholder="👆 *Selecione uma das Opções Acima para Continuar.*"
                                className="text-xs h-8"
                            />
                            <p className="text-[11px] text-muted-foreground">
                                Enviada quando o cliente digita algo que não corresponde a nenhuma opção do menu.
                            </p>
                        </div>
                    </AccordionContent>
                </AccordionItem>

                {/* 3. ATENDIMENTO HUMANIZADO / CARD DE SUPORTE */}
                <AccordionItem
                    value="support"
                    className="border border-emerald-500/25 rounded-2xl bg-card shadow-2xs overflow-hidden px-4 sm:px-5"
                >
                    <AccordionTrigger className="hover:no-underline py-4 gap-3">
                        <div className="flex items-center gap-3 text-left min-w-0 flex-1">
                            <div className="h-9 w-9 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
                                <UserCheck className="h-4 w-4" />
                            </div>
                            <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2 flex-wrap">
                                    <span className="font-semibold text-sm sm:text-base text-foreground">
                                        Atendimento Humanizado / Card de Suporte
                                    </span>
                                    <Badge
                                        variant="outline"
                                        className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30 text-[11px]"
                                    >
                                        Automático
                                    </Badge>
                                </div>
                                <p className="text-xs text-muted-foreground truncate mt-0.5">
                                    Envia o cartão de contato do suporte quando o cliente pede para falar com um atendente.
                                </p>
                            </div>
                        </div>
                    </AccordionTrigger>

                    <AccordionContent className="pt-3 pb-5 space-y-3 border-t">
                        <div className="p-3 rounded-xl border bg-background space-y-1.5">
                            <Label className="text-xs font-semibold">
                                Palavras-Chave para Solicitar Atendente Humano
                            </Label>
                            <Input
                                value={humanSupportKeywordsInput}
                                onChange={(e) => setHumanSupportKeywordsInput(e.target.value)}
                                placeholder="falar com atendente, atendimento humanizado, humano, suporte"
                                className="font-mono text-xs h-8"
                            />
                            <p className="text-[11px] text-muted-foreground">
                                Separadas por vírgula. Se o cliente enviar alguma dessas frases, o robô envia o contato abaixo e pausa a automação.
                            </p>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                            <div className="p-3 rounded-xl border bg-background space-y-1.5">
                                <Label className="text-xs font-semibold flex items-center gap-1.5">
                                    <PhoneCall className="h-3.5 w-3.5 text-emerald-600" />
                                    WhatsApp (Opcional)
                                </Label>
                                <Input
                                    value={humanSupportPhone}
                                    onChange={(e) => setHumanSupportPhone(e.target.value)}
                                    placeholder="Ex: 5511999999999"
                                    className="text-xs font-mono h-8"
                                />
                                <p className="text-[10.5px] text-muted-foreground">
                                    Vazio = usa o contato do Fluxo Principal.
                                </p>
                            </div>

                            <div className="p-3 rounded-xl border bg-background space-y-1.5">
                                <Label className="text-xs font-semibold flex items-center gap-1.5">
                                    <User className="h-3.5 w-3.5 text-emerald-600" />
                                    Nome do Contato
                                </Label>
                                <Input
                                    value={humanSupportName}
                                    onChange={(e) => setHumanSupportName(e.target.value)}
                                    placeholder="Suporte Oficial"
                                    className="text-xs h-8"
                                />
                            </div>

                            <div className="p-3 rounded-xl border bg-background space-y-1.5">
                                <Label className="text-xs font-semibold flex items-center gap-1.5">
                                    <Building2 className="h-3.5 w-3.5 text-emerald-600" />
                                    Empresa (Opcional)
                                </Label>
                                <Input
                                    value={humanSupportOrg}
                                    onChange={(e) => setHumanSupportOrg(e.target.value)}
                                    placeholder="Minha Empresa"
                                    className="text-xs h-8"
                                />
                            </div>
                        </div>
                    </AccordionContent>
                </AccordionItem>
            </Accordion>
        </div>
    );
}
