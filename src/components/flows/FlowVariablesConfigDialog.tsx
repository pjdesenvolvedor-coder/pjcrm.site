'use client';

import React, { useState, useEffect } from 'react';
import { useFirebase, useDoc, useMemoFirebase } from '@/firebase';
import { doc, setDoc } from 'firebase/firestore';
import type { FlowVariablesConfig } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
    Sparkles,
    CheckCircle2,
    RotateCcw,
    Save,
    Info,
    HelpCircle,
    Layers,
    ListTree,
    MessageSquare,
    Eye,
} from 'lucide-react';

export const DEFAULT_FLOW_VARIABLES_CONFIG: FlowVariablesConfig = {
    activeSubsTemplate: '• {plano} (Vencimento: {vencimento} - {valor})',
    activeSubsEmptyMessage: 'Nenhuma assinatura ativa encontrada.',

    overdueSubsTemplate: '• {plano} (Vencimento: {vencimento} - {valor})',
    overdueSubsEmptyMessage: 'Nenhuma assinatura vencida encontrada.',

    allSubsTemplate: '• {plano} ({status} - Vencimento: {vencimento} - {valor})',
    allSubsEmptyMessage: 'Nenhuma assinatura cadastrada.',
};

interface FlowVariablesConfigDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

export function FlowVariablesConfigDialog({ open, onOpenChange }: FlowVariablesConfigDialogProps) {
    const { firestore, effectiveUserId } = useFirebase();
    const { toast } = useToast();

    const configDocRef = useMemoFirebase(() => {
        if (!effectiveUserId) return null;
        return doc(firestore, 'users', effectiveUserId, 'settings', 'flow_variables');
    }, [firestore, effectiveUserId]);

    const { data: savedConfig, isLoading } = useDoc<FlowVariablesConfig>(configDocRef);

    const [formState, setFormState] = useState<FlowVariablesConfig>(DEFAULT_FLOW_VARIABLES_CONFIG);
    const [isSaving, setIsSaving] = useState(false);
    const [activeTab, setActiveTab] = useState<'active' | 'overdue' | 'all'>('active');

    // Sincroniza estado inicial com documento do Firestore
    useEffect(() => {
        if (savedConfig) {
            setFormState({
                activeSubsTemplate: savedConfig.activeSubsTemplate ?? DEFAULT_FLOW_VARIABLES_CONFIG.activeSubsTemplate,
                activeSubsEmptyMessage: savedConfig.activeSubsEmptyMessage ?? DEFAULT_FLOW_VARIABLES_CONFIG.activeSubsEmptyMessage,
                overdueSubsTemplate: savedConfig.overdueSubsTemplate ?? DEFAULT_FLOW_VARIABLES_CONFIG.overdueSubsTemplate,
                overdueSubsEmptyMessage: savedConfig.overdueSubsEmptyMessage ?? DEFAULT_FLOW_VARIABLES_CONFIG.overdueSubsEmptyMessage,
                allSubsTemplate: savedConfig.allSubsTemplate ?? DEFAULT_FLOW_VARIABLES_CONFIG.allSubsTemplate,
                allSubsEmptyMessage: savedConfig.allSubsEmptyMessage ?? DEFAULT_FLOW_VARIABLES_CONFIG.allSubsEmptyMessage,
            });
        } else {
            setFormState(DEFAULT_FLOW_VARIABLES_CONFIG);
        }
    }, [savedConfig]);

    const handleInsertTag = (fieldName: keyof FlowVariablesConfig, tag: string) => {
        const currentVal = formState[fieldName] || '';
        setFormState((prev) => ({
            ...prev,
            [fieldName]: currentVal + (currentVal.endsWith(' ') || currentVal === '' ? '' : ' ') + tag,
        }));
    };

    const handleResetDefaults = () => {
        setFormState(DEFAULT_FLOW_VARIABLES_CONFIG);
        toast({
            title: 'Modelos restaurados!',
            description: 'Os valores padrão foram preenchidos. Clique em "Salvar Alterações" para confirmar.',
        });
    };

    const handleSave = async () => {
        if (!effectiveUserId) return;
        setIsSaving(true);
        try {
            const ref = doc(firestore, 'users', effectiveUserId, 'settings', 'flow_variables');
            await setDoc(ref, formState, { merge: true });
            toast({
                title: 'Personalização salva com sucesso! 🎉',
                description: 'As variáveis {assinaturas_ativas}, {assinaturas_vencidas} e {todas_assinaturas} agora seguirão este formato nos seus fluxos.',
            });
            onOpenChange(false);
        } catch (err: any) {
            console.error('Erro ao salvar configuração das variáveis:', err);
            toast({
                variant: 'destructive',
                title: 'Erro ao salvar configurações',
                description: err.message || 'Tente novamente.',
            });
        } finally {
            setIsSaving(false);
        }
    };

    // Dados fictícios para simulação visual da mensagem
    const sampleActiveSubs = [
        {
            plano: 'Netflix 4K Ultra HD',
            status: 'Ativo',
            vencimento: '15/10/2026',
            dias_restantes: '7 dias restantes',
            valor: 'R$ 39,90',
            metodo_pagamento: 'PIX',
            email: 'cliente@exemplo.com',
            senha: 'pass***',
            tela: 'Tela 2',
            pin_tela: '1234',
            link_de_acesso: 'https://netflix.com',
            notas: 'Conta familiar',
        },
        {
            plano: 'Disney+ Premium',
            status: 'Ativo',
            vencimento: '22/10/2026',
            dias_restantes: '14 dias restantes',
            valor: 'R$ 27,90',
            metodo_pagamento: 'Cartão',
            email: 'cliente@exemplo.com',
            senha: 'pass***',
            tela: 'Perfil 1',
            pin_tela: '0000',
            link_de_acesso: 'https://disneyplus.com',
            notas: '',
        },
    ];

    const sampleOverdueSubs = [
        {
            plano: 'Spotify Familiar',
            status: 'Vencido',
            vencimento: '01/10/2026',
            dias_restantes: 'Vencido há 7 dias',
            valor: 'R$ 21,90',
            metodo_pagamento: 'PIX',
            email: 'musica@exemplo.com',
            senha: 'spot***',
            tela: 'Conta Principal',
            pin_tela: '',
            link_de_acesso: 'https://spotify.com',
            notas: 'Renovação pendente',
        },
    ];

    const formatPreview = (template?: string, emptyMsg?: string, subs: any[] = []) => {
        if (!subs || subs.length === 0) return emptyMsg || 'Nenhum item.';
        const tpl = template || '• {plano}';
        return subs
            .map((s) => {
                return tpl
                    .replace(/\{plano\}/gi, s.plano)
                    .replace(/\{nome_assinatura\}/gi, s.plano)
                    .replace(/\{status\}/gi, s.status)
                    .replace(/\{vencimento\}/gi, s.vencimento)
                    .replace(/\{data_vencimento\}/gi, s.vencimento)
                    .replace(/\{dias_restantes\}/gi, s.dias_restantes)
                    .replace(/\{valor\}/gi, s.valor)
                    .replace(/\{mensalidade\}/gi, s.valor)
                    .replace(/\{metodo_pagamento\}/gi, s.metodo_pagamento)
                    .replace(/\{email\}/gi, s.email)
                    .replace(/\{senha\}/gi, s.senha)
                    .replace(/\{tela\}/gi, s.tela)
                    .replace(/\{pin_tela\}/gi, s.pin_tela)
                    .replace(/\{link_de_acesso\}/gi, s.link_de_acesso)
                    .replace(/\{notas\}/gi, s.notas);
            })
            .join('\n');
    };

    const chips = [
        { label: '{plano}', desc: 'Nome do plano/produto' },
        { label: '{status}', desc: 'Ativo ou Vencido' },
        { label: '{vencimento}', desc: 'Data no formato DD/MM/AAAA' },
        { label: '{dias_restantes}', desc: 'Ex: 5 dias restantes' },
        { label: '{valor}', desc: 'Valor da mensalidade (R$)' },
        { label: '{metodo_pagamento}', desc: 'PIX, Cartão, Boleto' },
        { label: '{email}', desc: 'E-mail da assinatura' },
        { label: '{senha}', desc: 'Senha de acesso' },
        { label: '{tela}', desc: 'Nome da tela/perfil' },
        { label: '{pin_tela}', desc: 'PIN de proteção da tela' },
        { label: '{link_de_acesso}', desc: 'Link direto da plataforma' },
        { label: '{notas}', desc: 'Observações cadastradas' },
    ];

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-4xl max-h-[92vh] overflow-y-auto p-0">
                <div className="sticky top-0 bg-background/95 backdrop-blur-md z-10 p-6 border-b">
                    <DialogHeader>
                        <div className="flex items-center gap-2">
                            <div className="w-9 h-9 rounded-lg bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-200 dark:border-indigo-800 flex items-center justify-center text-indigo-600 dark:text-indigo-400">
                                <Sparkles className="w-5 h-5" />
                            </div>
                            <div>
                                <DialogTitle className="text-xl font-bold flex items-center gap-2">
                                    Personalizar Variáveis de Múltiplas Assinaturas
                                </DialogTitle>
                                <DialogDescription className="text-xs text-muted-foreground mt-0.5">
                                    Configure o layout e formato de exibição das variáveis que retornam listas com muitas informações.
                                </DialogDescription>
                            </div>
                        </div>
                    </DialogHeader>
                </div>

                <div className="p-6 space-y-6">
                    {/* Alerta explicativo */}
                    <div className="bg-indigo-50/60 dark:bg-indigo-950/30 border border-indigo-200/80 dark:border-indigo-900/60 rounded-xl p-4 flex items-start gap-3 text-xs leading-relaxed text-indigo-900 dark:text-indigo-200">
                        <Info className="w-4 h-4 text-indigo-600 dark:text-indigo-400 shrink-0 mt-0.5" />
                        <div>
                            <p className="font-semibold mb-1">Como essa formatação funciona?</p>
                            <p className="text-muted-foreground dark:text-indigo-300">
                                Quando você usa <strong>{`{assinaturas_ativas}`}</strong>, <strong>{`{assinaturas_vencidas}`}</strong> ou <strong>{`{todas_assinaturas}`}</strong> em qualquer mensagem de fluxo do Canva, o robô substitui a variável pela lista das assinaturas do cliente, repetindo o <em>Modelo de Cada Linha</em> para cada plano e aplicando a <em>Mensagem Vazia</em> se ele não possuir nenhum registro.
                            </p>
                            <div className="mt-2 pt-2 border-t border-indigo-200/50 dark:border-indigo-900/40 flex items-center gap-1.5 flex-wrap text-[11px]">
                                <span className="font-semibold text-indigo-950 dark:text-indigo-100">Contadores e Links:</span>
                                <span>Use <code>{`{assinaturas_ativas_qtd}`}</code>, <code>{`{total_assinaturas}`}</code> para números, ou <code>{`{link_renovacao}`}</code> para gerar o link onde o cliente seleciona as assinaturas e paga via PIX!</span>
                            </div>
                        </div>
                    </div>

                    <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)} className="w-full">
                        <TabsList className="grid grid-cols-3 w-full bg-muted/60 p-1">
                            <TabsTrigger value="active" className="text-xs font-semibold gap-1.5 py-2">
                                <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                                Assinaturas Ativas
                            </TabsTrigger>
                            <TabsTrigger value="overdue" className="text-xs font-semibold gap-1.5 py-2">
                                <span className="w-2 h-2 rounded-full bg-rose-500"></span>
                                Assinaturas Vencidas
                            </TabsTrigger>
                            <TabsTrigger value="all" className="text-xs font-semibold gap-1.5 py-2">
                                <span className="w-2 h-2 rounded-full bg-indigo-500"></span>
                                Todas as Assinaturas
                            </TabsTrigger>
                        </TabsList>

                        {/* TAB 1: ASSINATURAS ATIVAS */}
                        <TabsContent value="active" className="space-y-5 pt-4">
                            <div className="flex items-center justify-between">
                                <div className="space-y-0.5">
                                    <div className="flex items-center gap-2">
                                        <h3 className="font-bold text-sm">Variável: {'{assinaturas_ativas}'}</h3>
                                        <Badge variant="outline" className="text-[10px] bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300">
                                            Somente Ativas
                                        </Badge>
                                    </div>
                                    <p className="text-xs text-muted-foreground">
                                        Usada para listar todos os serviços vigentes que o cliente contratou.
                                    </p>
                                </div>
                            </div>

                            <div className="space-y-2">
                                <div className="flex items-center justify-between">
                                    <Label className="text-xs font-semibold">Modelo de Cada Linha de Assinatura</Label>
                                    <span className="text-[11px] text-muted-foreground">Repete para cada plano ativo</span>
                                </div>
                                <Textarea
                                    rows={3}
                                    placeholder="Ex: • {plano} (Vencimento: {vencimento} - {valor})"
                                    value={formState.activeSubsTemplate || ''}
                                    onChange={(e) => setFormState({ ...formState, activeSubsTemplate: e.target.value })}
                                    className="font-mono text-xs leading-relaxed"
                                />

                                {/* Tags Chips */}
                                <div className="space-y-1.5 pt-1">
                                    <span className="text-[11px] font-semibold text-muted-foreground block">
                                        Clique para adicionar uma variável à linha:
                                    </span>
                                    <div className="flex flex-wrap gap-1.5">
                                        {chips.map((c) => (
                                            <button
                                                key={c.label}
                                                type="button"
                                                onClick={() => handleInsertTag('activeSubsTemplate', c.label)}
                                                className="px-2 py-0.5 text-[11px] font-mono bg-muted hover:bg-indigo-50 hover:text-indigo-600 hover:border-indigo-300 dark:hover:bg-indigo-950 border rounded-md transition-all text-muted-foreground"
                                                title={c.desc}
                                            >
                                                + {c.label}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            </div>

                            <div className="space-y-2">
                                <Label className="text-xs font-semibold">Mensagem quando não houver nenhuma assinatura ativa</Label>
                                <Input
                                    value={formState.activeSubsEmptyMessage || ''}
                                    onChange={(e) => setFormState({ ...formState, activeSubsEmptyMessage: e.target.value })}
                                    placeholder="Ex: Nenhuma assinatura ativa encontrada."
                                    className="text-xs"
                                />
                            </div>

                            {/* Preview em tempo real */}
                            <div className="rounded-xl border bg-muted/40 p-4 space-y-2">
                                <div className="flex items-center justify-between">
                                    <span className="text-xs font-bold flex items-center gap-1.5 text-muted-foreground">
                                        <Eye className="w-3.5 h-3.5" />
                                        Prévia no WhatsApp (Exemplo Real):
                                    </span>
                                </div>
                                <div className="bg-[#e5ddd5] dark:bg-[#0b141a] p-3 rounded-lg border border-black/5 dark:border-white/5 font-sans">
                                    <div className="bg-white dark:bg-[#1f2c34] text-foreground p-3 rounded-lg rounded-tl-none shadow-sm max-w-md text-xs whitespace-pre-wrap leading-relaxed">
                                        {formatPreview(formState.activeSubsTemplate, formState.activeSubsEmptyMessage, sampleActiveSubs)}
                                    </div>
                                </div>
                            </div>
                        </TabsContent>

                        {/* TAB 2: ASSINATURAS VENCIDAS */}
                        <TabsContent value="overdue" className="space-y-5 pt-4">
                            <div className="flex items-center justify-between">
                                <div className="space-y-0.5">
                                    <div className="flex items-center gap-2">
                                        <h3 className="font-bold text-sm">Variável: {'{assinaturas_vencidas}'}</h3>
                                        <Badge variant="outline" className="text-[10px] bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950 dark:text-rose-300">
                                            Somente Vencidas
                                        </Badge>
                                    </div>
                                    <p className="text-xs text-muted-foreground">
                                        Usada em mensagens de cobrança e lembretes para listar os planos pendentes de pagamento.
                                    </p>
                                </div>
                            </div>

                            <div className="space-y-2">
                                <div className="flex items-center justify-between">
                                    <Label className="text-xs font-semibold">Modelo de Cada Linha de Assinatura</Label>
                                    <span className="text-[11px] text-muted-foreground">Repete para cada plano vencido</span>
                                </div>
                                <Textarea
                                    rows={3}
                                    placeholder="Ex: • {plano} (Vencimento: {vencimento} - {valor})"
                                    value={formState.overdueSubsTemplate || ''}
                                    onChange={(e) => setFormState({ ...formState, overdueSubsTemplate: e.target.value })}
                                    className="font-mono text-xs leading-relaxed"
                                />

                                {/* Tags Chips */}
                                <div className="space-y-1.5 pt-1">
                                    <span className="text-[11px] font-semibold text-muted-foreground block">
                                        Clique para adicionar uma variável à linha:
                                    </span>
                                    <div className="flex flex-wrap gap-1.5">
                                        {chips.map((c) => (
                                            <button
                                                key={c.label}
                                                type="button"
                                                onClick={() => handleInsertTag('overdueSubsTemplate', c.label)}
                                                className="px-2 py-0.5 text-[11px] font-mono bg-muted hover:bg-indigo-50 hover:text-indigo-600 hover:border-indigo-300 dark:hover:bg-indigo-950 border rounded-md transition-all text-muted-foreground"
                                                title={c.desc}
                                            >
                                                + {c.label}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            </div>

                            <div className="space-y-2">
                                <Label className="text-xs font-semibold">Mensagem quando não houver nenhuma assinatura vencida</Label>
                                <Input
                                    value={formState.overdueSubsEmptyMessage || ''}
                                    onChange={(e) => setFormState({ ...formState, overdueSubsEmptyMessage: e.target.value })}
                                    placeholder="Ex: Nenhuma assinatura vencida encontrada."
                                    className="text-xs"
                                />
                            </div>

                            {/* Preview em tempo real */}
                            <div className="rounded-xl border bg-muted/40 p-4 space-y-2">
                                <div className="flex items-center justify-between">
                                    <span className="text-xs font-bold flex items-center gap-1.5 text-muted-foreground">
                                        <Eye className="w-3.5 h-3.5" />
                                        Prévia no WhatsApp (Exemplo Real):
                                    </span>
                                </div>
                                <div className="bg-[#e5ddd5] dark:bg-[#0b141a] p-3 rounded-lg border border-black/5 dark:border-white/5 font-sans">
                                    <div className="bg-white dark:bg-[#1f2c34] text-foreground p-3 rounded-lg rounded-tl-none shadow-sm max-w-md text-xs whitespace-pre-wrap leading-relaxed">
                                        {formatPreview(formState.overdueSubsTemplate, formState.overdueSubsEmptyMessage, sampleOverdueSubs)}
                                    </div>
                                </div>
                            </div>
                        </TabsContent>

                        {/* TAB 3: TODAS AS ASSINATURAS */}
                        <TabsContent value="all" className="space-y-5 pt-4">
                            <div className="flex items-center justify-between">
                                <div className="space-y-0.5">
                                    <div className="flex items-center gap-2">
                                        <h3 className="font-bold text-sm">Variável: {'{todas_assinaturas}'}</h3>
                                        <Badge variant="outline" className="text-[10px] bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-950 dark:text-indigo-300">
                                            Ativas + Vencidas
                                        </Badge>
                                    </div>
                                    <p className="text-xs text-muted-foreground">
                                        Lista o panorama geral de todos os planos contratados (úteis para autoatendimento e painel de status).
                                    </p>
                                </div>
                            </div>

                            <div className="space-y-2">
                                <div className="flex items-center justify-between">
                                    <Label className="text-xs font-semibold">Modelo de Cada Linha de Assinatura</Label>
                                    <span className="text-[11px] text-muted-foreground">Repete para todas as assinaturas do cliente</span>
                                </div>
                                <Textarea
                                    rows={3}
                                    placeholder="Ex: • {plano} ({status} - Vencimento: {vencimento} - {valor})"
                                    value={formState.allSubsTemplate || ''}
                                    onChange={(e) => setFormState({ ...formState, allSubsTemplate: e.target.value })}
                                    className="font-mono text-xs leading-relaxed"
                                />

                                {/* Tags Chips */}
                                <div className="space-y-1.5 pt-1">
                                    <span className="text-[11px] font-semibold text-muted-foreground block">
                                        Clique para adicionar uma variável à linha:
                                    </span>
                                    <div className="flex flex-wrap gap-1.5">
                                        {chips.map((c) => (
                                            <button
                                                key={c.label}
                                                type="button"
                                                onClick={() => handleInsertTag('allSubsTemplate', c.label)}
                                                className="px-2 py-0.5 text-[11px] font-mono bg-muted hover:bg-indigo-50 hover:text-indigo-600 hover:border-indigo-300 dark:hover:bg-indigo-950 border rounded-md transition-all text-muted-foreground"
                                                title={c.desc}
                                            >
                                                + {c.label}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            </div>

                            <div className="space-y-2">
                                <Label className="text-xs font-semibold">Mensagem quando não houver nenhuma assinatura cadastrada</Label>
                                <Input
                                    value={formState.allSubsEmptyMessage || ''}
                                    onChange={(e) => setFormState({ ...formState, allSubsEmptyMessage: e.target.value })}
                                    placeholder="Ex: Nenhuma assinatura cadastrada."
                                    className="text-xs"
                                />
                            </div>

                            {/* Preview em tempo real */}
                            <div className="rounded-xl border bg-muted/40 p-4 space-y-2">
                                <div className="flex items-center justify-between">
                                    <span className="text-xs font-bold flex items-center gap-1.5 text-muted-foreground">
                                        <Eye className="w-3.5 h-3.5" />
                                        Prévia no WhatsApp (Exemplo Real):
                                    </span>
                                </div>
                                <div className="bg-[#e5ddd5] dark:bg-[#0b141a] p-3 rounded-lg border border-black/5 dark:border-white/5 font-sans">
                                    <div className="bg-white dark:bg-[#1f2c34] text-foreground p-3 rounded-lg rounded-tl-none shadow-sm max-w-md text-xs whitespace-pre-wrap leading-relaxed">
                                        {formatPreview(formState.allSubsTemplate, formState.allSubsEmptyMessage, [...sampleActiveSubs, ...sampleOverdueSubs])}
                                    </div>
                                </div>
                            </div>
                        </TabsContent>
                    </Tabs>
                </div>

                <div className="sticky bottom-0 bg-background/95 backdrop-blur-md p-4 border-t flex items-center justify-between">
                    <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={handleResetDefaults}
                        className="text-xs text-muted-foreground hover:text-foreground gap-1.5"
                    >
                        <RotateCcw className="w-3.5 h-3.5" />
                        Restaurar Padrão
                    </Button>

                    <div className="flex items-center gap-2">
                        <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => onOpenChange(false)}
                            className="text-xs"
                        >
                            Cancelar
                        </Button>
                        <Button
                            type="button"
                            size="sm"
                            onClick={handleSave}
                            disabled={isSaving}
                            className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs gap-1.5"
                        >
                            <Save className="w-3.5 h-3.5" />
                            {isSaving ? 'Salvando...' : 'Salvar Alterações'}
                        </Button>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}
