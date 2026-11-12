'use client';

import React, { useState, useEffect } from 'react';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from '@/components/ui/dialog';
import {
    Accordion,
    AccordionContent,
    AccordionItem,
    AccordionTrigger,
} from '@/components/ui/accordion';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import {
    Grid,
    Star,
    Clock,
    Zap,
    Rocket,
    Plus,
    Trash2,
    Bold,
    Italic,
    Strikethrough,
    Sparkles,
    GripVertical,
    Eye,
    UserCheck,
    UserX,
    CheckCircle2,
    KeyRound,
    CreditCard,
    PlayCircle,
    Layers,
    ExternalLink,
    PauseCircle,
    QrCode,
    Package,
    Copy,
    DollarSign,
    MessageSquareText,
    SlidersHorizontal,
    Info,
} from 'lucide-react';
import Link from 'next/link';
import { Switch } from '@/components/ui/switch';
import { collection } from 'firebase/firestore';
import { useFirebase, useCollection, useMemoFirebase } from '@/firebase';
import { DEFAULT_FLOW_PIX_BILLING_MESSAGE } from '@/lib/flow-product-delivery';
import { WhatsAppMenuPreviewDialog } from '@/components/flows/WhatsAppMenuPreviewDialog';
import type { FlowNodeData, FlowDefinition } from '@/lib/types';

export interface FlowVariableItem {
    key: string;
    label: string;
    desc: string;
}

export interface FlowVariableGroup {
    id: string;
    title: string;
    icon: any;
    colorClass: string;
    badgeClass: string;
    variables: FlowVariableItem[];
}

export const FLOW_VARIABLE_GROUPS: FlowVariableGroup[] = [
    {
        id: 'client_data',
        title: 'Dados do Cliente',
        icon: UserCheck,
        colorClass: 'text-blue-600 dark:text-blue-400',
        badgeClass: 'bg-blue-50 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300 border-blue-200 dark:border-blue-800',
        variables: [
            { key: 'nome', label: '{nome}', desc: 'Nome completo cadastrado' },
            { key: 'primeiro_nome', label: '{primeiro_nome}', desc: 'Primeiro nome do cliente' },
            { key: 'telefone', label: '{telefone}', desc: 'Telefone WhatsApp cadastrado' },
        ],
    },
    {
        id: 'access_data',
        title: 'Dados de Assinatura (Acesso / Conta)',
        icon: KeyRound,
        colorClass: 'text-violet-600 dark:text-violet-400',
        badgeClass: 'bg-violet-50 text-violet-700 dark:bg-violet-950/50 dark:text-violet-300 border-violet-200 dark:border-violet-800',
        variables: [
            { key: 'email', label: '{email}', desc: 'E-mail da conta de acesso' },
            { key: 'senha', label: '{senha}', desc: 'Senha da conta de acesso' },
            { key: 'tela', label: '{tela}', desc: 'Tela de acesso (ex: Tela 1)' },
            { key: 'pin_tela', label: '{pin_tela}', desc: 'PIN da tela de acesso' },
        ],
    },
    {
        id: 'subscription_data',
        title: 'Dados Assinatura',
        icon: CreditCard,
        colorClass: 'text-emerald-600 dark:text-emerald-400',
        badgeClass: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800',
        variables: [
            { key: 'nome_assinatura', label: '{nome_assinatura}', desc: 'Nome da assinatura contratada (ou {assinatura})' },
            { key: 'plano', label: '{plano}', desc: 'Nome do plano cadastrado' },
            { key: 'metodo_pagamento', label: '{metodo_pagamento}', desc: 'Método de pagamento (PIX, Cartão...)' },
            { key: 'valor', label: '{valor}', desc: 'Valor da assinatura' },
            { key: 'mensalidade', label: '{mensalidade}', desc: 'Mensalidade da assinatura' },
            { key: 'vencimento', label: '{vencimento}', desc: 'Data de vencimento (dd/mm/aaaa)' },
            { key: 'dias_restantes', label: '{dias_restantes}', desc: 'Dias restantes para vencer' },
            { key: 'status', label: '{status}', desc: 'Status no CRM (Ativo, Vencido...)' },
            { key: 'link_de_acesso', label: '{link_de_acesso}', desc: 'Link de acesso à plataforma' },
            { key: 'link_renovacao', label: '{link_renovacao}', desc: 'Link dinâmico para o cliente renovar via PIX' },
            { key: 'notas', label: '{notas}', desc: 'Observações / notas do cliente' },
        ],
    },
    {
        id: 'multi_subscriptions',
        title: 'Listas e Contagem de Assinaturas',
        icon: Layers,
        colorClass: 'text-amber-600 dark:text-amber-400',
        badgeClass: 'bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300 border-amber-200 dark:border-amber-800',
        variables: [
            { key: 'assinaturas_ativas', label: '{assinaturas_ativas}', desc: 'Lista formatada de todas as assinaturas ativas' },
            { key: 'assinaturas_vencidas', label: '{assinaturas_vencidas}', desc: 'Lista formatada de todas as assinaturas vencidas' },
            { key: 'todas_assinaturas', label: '{todas_assinaturas}', desc: 'Lista formatada de todas as assinaturas (ativas e vencidas)' },
            { key: 'link_renovacao', label: '{link_renovacao}', desc: 'Link dinâmico onde o cliente escolhe quais assinaturas renovar via PIX' },
            { key: 'assinaturas_ativas_qtd', label: '{assinaturas_ativas_qtd}', desc: 'Número de assinaturas ativas (ex: 2)' },
            { key: 'assinaturas_vencidas_qtd', label: '{assinaturas_vencidas_qtd}', desc: 'Número de assinaturas vencidas (ex: 1)' },
            { key: 'total_assinaturas', label: '{total_assinaturas}', desc: 'Total geral de assinaturas cadastradas' },
        ],
    },
];

export const AVAILABLE_FLOW_VARIABLES: FlowVariableItem[] = FLOW_VARIABLE_GROUPS.flatMap((g) => g.variables);

interface NodeConfigDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    node: any | null;
    flowsList?: FlowDefinition[];
    onSave: (nodeId: string, updatedData: FlowNodeData) => void;
    onDelete?: (nodeId: string) => void;
}

function normalizeMenuOptions(options: any): Array<{ id: string; label: string; description?: string; type?: 'reply' | 'url'; url?: string }> {
    if (!options) return [];
    let list: any[] = [];
    if (Array.isArray(options)) {
        list = options;
    } else if (typeof options === 'object') {
        list = Object.values(options);
    }
    return list
        .filter((item) => item !== null && item !== undefined)
        .map((item, idx) => {
            if (typeof item === 'string') {
                return { id: `opt_${idx + 1}`, label: item, description: '', type: 'reply' as const, url: '' };
            }
            if (typeof item === 'object') {
                const label =
                    item.label !== undefined && item.label !== null
                        ? String(item.label)
                        : item.text !== undefined && item.text !== null
                        ? String(item.text)
                        : item.title !== undefined && item.title !== null
                        ? String(item.title)
                        : '';
                const type: 'reply' | 'url' = item.type === 'url' ? 'url' : 'reply';
                return {
                    id: String(item.id || `opt_${idx + 1}`),
                    label,
                    description: item.description !== undefined && item.description !== null ? String(item.description) : '',
                    type,
                    url: type === 'url' && item.url !== undefined && item.url !== null ? String(item.url) : '',
                };
            }
            return { id: `opt_${idx + 1}`, label: String(item), description: '', type: 'reply' as const, url: '' };
        });
}

export function NodeConfigDialog({
    open,
    onOpenChange,
    node,
    flowsList = [],
    onSave,
    onDelete,
}: NodeConfigDialogProps) {
    const [formData, setFormData] = useState<FlowNodeData>({
        nodeType: 'content',
    });
    const [isPreviewOpen, setIsPreviewOpen] = useState(false);
    const [showVariablesPicker, setShowVariablesPicker] = useState(false);
    const { firestore, effectiveUserId } = useFirebase();

    const stockQuery = useMemoFirebase(() => {
        if (!effectiveUserId) return null;
        return collection(firestore, 'users', effectiveUserId, 'flow_product_stock');
    }, [firestore, effectiveUserId]);
    const { data: stockItems } = useCollection<any>(stockQuery);

    const flowProductsQuery = useMemoFirebase(() => {
        if (!effectiveUserId) return null;
        return collection(firestore, 'users', effectiveUserId, 'flow_products');
    }, [firestore, effectiveUserId]);
    const { data: flowProductsList } = useCollection<any>(flowProductsQuery);

    const availableProductsSummary = React.useMemo(() => {
        const map = new Map<string, { name: string; availableCount: number; defaultPrice?: number }>();
        (flowProductsList || []).forEach((prod: any) => {
            const name = String(prod?.name || '').trim();
            if (!name) return;
            const key = name.toLowerCase();
            if (!map.has(key)) {
                map.set(key, {
                    name,
                    availableCount: 0,
                    defaultPrice: prod?.defaultPrice ? Number(prod.defaultPrice) : undefined,
                });
            }
        });
        (stockItems || []).forEach((item: any) => {
            const name = String(item?.productName || '').trim();
            if (!name) return;
            const key = name.toLowerCase();
            const existing = map.get(key) || { name, availableCount: 0, defaultPrice: item?.defaultPrice };
            if (item?.status === 'available') {
                existing.availableCount += 1;
            }
            if (!existing.defaultPrice && item?.defaultPrice) {
                existing.defaultPrice = Number(item.defaultPrice);
            }
            map.set(key, existing);
        });
        return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
    }, [stockItems, flowProductsList]);

    // Arrastar e soltar para mudar a ordem das respostas do menu
    const [draggedOptionIndex, setDraggedOptionIndex] = useState<number | null>(null);
    const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

    useEffect(() => {
        if (node?.data) {
            let initialAmount = node.data.pixAmount;
            let initialName = node.data.pixProductName;
            // Se for nó de pagamento PIX com produto selecionado, sincroniza com o preço e nome mais recente do produto
            if (node.data.nodeType === 'pix_payment' && node.data.pixProductName && availableProductsSummary.length > 0) {
                const matched = availableProductsSummary.find(
                    (p) => p.name.toLowerCase() === (node.data.pixProductName || '').trim().toLowerCase()
                );
                if (matched) {
                    initialName = matched.name;
                    if (matched.defaultPrice !== undefined && matched.defaultPrice !== null) {
                        initialAmount = Number(matched.defaultPrice).toFixed(2).replace('.', ',');
                    }
                }
            }
            setFormData({
                ...node.data,
                pixProductName: initialName || node.data.pixProductName,
                pixAmount: initialAmount !== undefined ? initialAmount : node.data.pixAmount,
                menuOptions: normalizeMenuOptions(node.data.menuOptions),
            });
            setShowVariablesPicker(false);
        }
    }, [node, availableProductsSummary]);

    useEffect(() => {
        if (!open) {
            setIsPreviewOpen(false);
            setShowVariablesPicker(false);
        }
    }, [open]);

    const handleInsertVariable = (field: 'text' | 'menuQuestionText' | 'menuButtonTitle' | 'menuFooterText', variable: string) => {
        setFormData((prev) => ({
            ...prev,
            [field]: (prev[field] || '') + ` {${variable}} `,
        }));
    };

    const handleAddMenuOption = (type: 'reply' | 'url' = 'reply') => {
        const newId = 'opt_' + Date.now();
        const currentOptions = normalizeMenuOptions(formData.menuOptions);
        const nextIdx = currentOptions.length + 1;
        setFormData((prev) => ({
            ...prev,
            menuOptions: [
                ...currentOptions,
                {
                    id: newId,
                    label: type === 'url' ? 'SIM, RENOVAR AGORA' : `Opção ${nextIdx}`,
                    description: '',
                    type,
                    url: type === 'url' ? '{link_renovacao}' : '',
                },
            ],
        }));
    };

    const handleUpdateMenuOption = (index: number, key: 'label' | 'description' | 'type' | 'url', value: any) => {
        setFormData((prev) => {
            const list = normalizeMenuOptions(prev.menuOptions);
            if (!list[index]) return prev;
            const updated = list.map((item, i) => {
                if (i !== index) return item;
                if (key === 'type') {
                    if (value === 'reply') {
                        return { ...item, type: 'reply' as const, url: '' };
                    } else if (value === 'url') {
                        return { ...item, type: 'url' as const, url: item.url && item.url.trim() !== '' ? item.url : '{link_renovacao}' };
                    }
                }
                return { ...item, [key]: value };
            });
            return { ...prev, menuOptions: updated };
        });
    };

    const handleRemoveMenuOption = (index: number) => {
        setFormData((prev) => {
            const list = normalizeMenuOptions(prev.menuOptions);
            const updated = list.filter((_, i) => i !== index);
            return { ...prev, menuOptions: updated };
        });
    };

    const handleDragStart = (e: React.DragEvent, index: number) => {
        setDraggedOptionIndex(index);
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', index.toString());
    };

    const handleDragOver = (e: React.DragEvent, index: number) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        if (dragOverIndex !== index) {
            setDragOverIndex(index);
        }
    };

    const handleDragLeave = (index: number) => {
        if (dragOverIndex === index) {
            setDragOverIndex(null);
        }
    };

    const handleDrop = (e: React.DragEvent, targetIndex: number) => {
        e.preventDefault();
        if (draggedOptionIndex === null || draggedOptionIndex === targetIndex) {
            setDraggedOptionIndex(null);
            setDragOverIndex(null);
            return;
        }

        const currentOptions = [...normalizeMenuOptions(formData.menuOptions)];
        const [movedItem] = currentOptions.splice(draggedOptionIndex, 1);
        currentOptions.splice(targetIndex, 0, movedItem);

        setFormData((prev) => ({
            ...prev,
            menuOptions: currentOptions,
        }));

        setDraggedOptionIndex(null);
        setDragOverIndex(null);
    };

    const handleDragEnd = () => {
        setDraggedOptionIndex(null);
        setDragOverIndex(null);
    };

    const handleSave = () => {
        if (!node?.id) return;
        const normalized = normalizeMenuOptions(formData.menuOptions);
        const cleanedOptions = normalized.map((opt, idx) => ({
            ...opt,
            label: opt.label.trim() || `Opção ${idx + 1}`,
            type: opt.type === 'url' ? ('url' as const) : ('reply' as const),
            url: opt.type === 'url' ? (opt.url ? opt.url.trim() : '') : '',
        }));
        onSave(node.id, {
            ...formData,
            menuOptions: cleanedOptions,
        });
        onOpenChange(false);
    };

    return (
        <>
            <Dialog open={open && !!node} onOpenChange={onOpenChange}>
                <DialogContent className="w-[95vw] max-w-xl max-h-[88vh] overflow-y-auto p-4 sm:p-6">
                    <DialogHeader className="border-b pb-3 pr-6">
                        <DialogTitle className="flex items-center gap-2 text-base sm:text-lg">
                            {formData.nodeType === 'start' && <PlayCircle className="h-5 w-5 text-emerald-500 shrink-0" />}
                            {formData.nodeType === 'menu' && <Grid className="h-5 w-5 text-indigo-600 shrink-0" />}
                            {formData.nodeType === 'content' && <Star className="h-5 w-5 text-rose-500 shrink-0" />}
                            {formData.nodeType === 'delay' && <Clock className="h-5 w-5 text-orange-500 shrink-0" />}
                            {formData.nodeType === 'pause_automation' && <PauseCircle className="h-5 w-5 text-purple-600 shrink-0" />}
                            {formData.nodeType === 'action' && <Zap className="h-5 w-5 text-amber-500 shrink-0" />}
                            {formData.nodeType === 'flow_connect' && <Rocket className="h-5 w-5 text-emerald-500 shrink-0" />}
                            {formData.nodeType === 'condition' && <UserCheck className="h-5 w-5 text-sky-500 shrink-0" />}
                            {formData.nodeType === 'pix_payment' && <QrCode className="h-5 w-5 text-emerald-600 shrink-0" />}
                            <span className="truncate">
                                {formData.nodeType === 'start' && 'Início do Fluxo'}
                                {formData.nodeType === 'menu' && 'Configurar Menu Interativo'}
                                {formData.nodeType === 'content' && 'Bloco de Conteúdo'}
                                {formData.nodeType === 'delay' && 'Atraso Inteligente'}
                                {formData.nodeType === 'pause_automation' && 'Pausar Automação (Cooldown)'}
                                {formData.nodeType === 'action' && 'Bloco de Ação'}
                                {formData.nodeType === 'flow_connect' && 'Conexão de Fluxo'}
                                {formData.nodeType === 'condition' && 'Verificar Cliente no CRM'}
                                {formData.nodeType === 'pix_payment' && 'Cobrança PIX + Entrega Automática'}
                            </span>
                        </DialogTitle>
                    </DialogHeader>

                    <div className="space-y-3 py-2">
                        {/* NOME / RÓTULO DO BLOCO COMPACTO */}
                        <div className="flex flex-col sm:flex-row sm:items-center gap-1.5 sm:gap-3 p-2.5 rounded-xl bg-muted/30 border">
                            <Label className="text-xs font-semibold text-muted-foreground shrink-0 sm:w-36">
                                Nome do Bloco:
                            </Label>
                            <Input
                                placeholder="Ex: Ponto de Partida, Menu Inicial..."
                                value={formData.label || ''}
                                onChange={(e) => setFormData({ ...formData, label: e.target.value })}
                                className="h-8 text-xs bg-background"
                            />
                        </div>

                        {/* ---------------- 0. CONFIGURAÇÃO DE START (INÍCIO DO FLUXO) ---------------- */}
                        {formData.nodeType === 'start' && (
                            <div className="rounded-xl border border-emerald-200 dark:border-emerald-800/60 bg-emerald-50/40 dark:bg-emerald-950/20 p-3.5 space-y-2.5">
                                <div className="flex items-start gap-2.5">
                                    <div className="p-1.5 rounded-lg bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600 dark:text-emerald-400">
                                        <PlayCircle className="h-4 w-4" />
                                    </div>
                                    <div>
                                        <h4 className="text-xs font-semibold text-emerald-950 dark:text-emerald-200">
                                            Ponto de Entrada do Fluxo
                                        </h4>
                                        <p className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed">
                                            Conecte o ponto verde deste bloco ao primeiro passo do seu atendimento (ex: Menu, Mensagem ou Verificar Cliente).
                                        </p>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* ---------------- 1. CONFIGURAÇÃO DE MENU ---------------- */}
                        {formData.nodeType === 'menu' && (
                            <Accordion type="multiple" defaultValue={['menu-main', 'menu-options']} className="space-y-2.5">
                                {/* SEÇÃO 1: PERGUNTA E TIPO DE MENU */}
                                <AccordionItem value="menu-main" className="border rounded-xl bg-card px-3.5 overflow-hidden">
                                    <AccordionTrigger className="hover:no-underline py-3 text-xs sm:text-sm font-semibold">
                                        <div className="flex items-center gap-2">
                                            <MessageSquareText className="h-4 w-4 text-indigo-600" />
                                            <span>1. Pergunta e Tipo de Menu</span>
                                            <Badge variant="secondary" className="text-[10px] font-normal">
                                                {formData.menuType === 'numeric'
                                                    ? 'Numérico'
                                                    : formData.menuType === 'button'
                                                    ? 'Botões Rápidos'
                                                    : 'Lista'}
                                            </Badge>
                                        </div>
                                    </AccordionTrigger>
                                    <AccordionContent className="pt-2 pb-3.5 space-y-3 border-t">
                                        <RadioGroup
                                            value={formData.menuType || 'list'}
                                            onValueChange={(val: any) => setFormData({ ...formData, menuType: val })}
                                            className="grid grid-cols-3 gap-2"
                                        >
                                            <label
                                                htmlFor="menu-list"
                                                className={`cursor-pointer flex items-center gap-2 p-2 rounded-lg border text-xs font-medium ${
                                                    (formData.menuType || 'list') === 'list'
                                                        ? 'border-indigo-600 bg-indigo-50/50 dark:bg-indigo-950/30 text-indigo-700 dark:text-indigo-300'
                                                        : 'border-border'
                                                }`}
                                            >
                                                <RadioGroupItem value="list" id="menu-list" />
                                                <span>Lista</span>
                                            </label>
                                            <label
                                                htmlFor="menu-numeric"
                                                className={`cursor-pointer flex items-center gap-2 p-2 rounded-lg border text-xs font-medium ${
                                                    formData.menuType === 'numeric'
                                                        ? 'border-indigo-600 bg-indigo-50/50 dark:bg-indigo-950/30 text-indigo-700 dark:text-indigo-300'
                                                        : 'border-border'
                                                }`}
                                            >
                                                <RadioGroupItem value="numeric" id="menu-numeric" />
                                                <span>Número</span>
                                            </label>
                                            <label
                                                htmlFor="menu-button"
                                                className={`cursor-pointer flex items-center gap-2 p-2 rounded-lg border text-xs font-medium ${
                                                    formData.menuType === 'button'
                                                        ? 'border-indigo-600 bg-indigo-50/50 dark:bg-indigo-950/30 text-indigo-700 dark:text-indigo-300'
                                                        : 'border-border'
                                                }`}
                                            >
                                                <RadioGroupItem value="button" id="menu-button" />
                                                <span>Botões</span>
                                            </label>
                                        </RadioGroup>

                                        <div className="space-y-1.5">
                                            <Label className="text-xs font-semibold">Texto da Pergunta</Label>
                                            <div className="border rounded-xl p-2 bg-background focus-within:ring-1 focus-within:ring-indigo-500">
                                                <Textarea
                                                    placeholder="Digite aqui o texto que acompanha o menu..."
                                                    rows={3}
                                                    value={formData.menuQuestionText || ''}
                                                    onChange={(e) =>
                                                        setFormData({ ...formData, menuQuestionText: e.target.value })
                                                    }
                                                    className="border-0 focus-visible:ring-0 p-1 resize-none text-xs sm:text-sm"
                                                />
                                                <div className="flex items-center justify-between pt-1.5 border-t mt-1">
                                                    <div className="flex items-center gap-1">
                                                        <Button
                                                            type="button"
                                                            variant="ghost"
                                                            size="sm"
                                                            className="h-6 w-6 p-0"
                                                            onClick={() =>
                                                                setFormData((p) => ({
                                                                    ...p,
                                                                    menuQuestionText: (p.menuQuestionText || '') + ' *texto* ',
                                                                }))
                                                            }
                                                            title="Negrito"
                                                        >
                                                            <Bold className="h-3 w-3" />
                                                        </Button>
                                                        <Button
                                                            type="button"
                                                            variant="ghost"
                                                            size="sm"
                                                            className="h-6 w-6 p-0"
                                                            onClick={() =>
                                                                setFormData((p) => ({
                                                                    ...p,
                                                                    menuQuestionText: (p.menuQuestionText || '') + ' _texto_ ',
                                                                }))
                                                            }
                                                            title="Itálico"
                                                        >
                                                            <Italic className="h-3 w-3" />
                                                        </Button>
                                                        <Button
                                                            type="button"
                                                            variant="ghost"
                                                            size="sm"
                                                            className="h-6 w-6 p-0"
                                                            onClick={() =>
                                                                setFormData((p) => ({
                                                                    ...p,
                                                                    menuQuestionText: (p.menuQuestionText || '') + ' ~texto~ ',
                                                                }))
                                                            }
                                                            title="Tachado"
                                                        >
                                                            <Strikethrough className="h-3 w-3" />
                                                        </Button>
                                                    </div>

                                                    <Button
                                                        type="button"
                                                        variant="outline"
                                                        size="sm"
                                                        className="h-6 px-2 text-[11px] gap-1"
                                                        onClick={() => setShowVariablesPicker((v) => !v)}
                                                    >
                                                        <Sparkles className="h-3 w-3 text-indigo-500" />
                                                        {showVariablesPicker ? 'Ocultar Variáveis' : 'Inserir Variável'}
                                                    </Button>
                                                </div>

                                                {showVariablesPicker && (
                                                    <div className="space-y-2 pt-2 border-t mt-2 max-h-36 overflow-y-auto pr-1 animate-in fade-in-50">
                                                        {FLOW_VARIABLE_GROUPS.map((grp) => (
                                                            <div key={grp.id} className="space-y-1">
                                                                <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block">
                                                                    {grp.title}:
                                                                </span>
                                                                <div className="flex flex-wrap gap-1">
                                                                    {grp.variables.map((v) => (
                                                                        <button
                                                                            key={v.key}
                                                                            type="button"
                                                                            onClick={() => handleInsertVariable('menuQuestionText', v.key)}
                                                                            className="text-[10px] px-1.5 py-0.5 rounded bg-muted hover:bg-indigo-50 dark:hover:bg-indigo-950/40 text-muted-foreground hover:text-indigo-600 transition-colors cursor-pointer font-mono"
                                                                            title={v.desc}
                                                                        >
                                                                            +{v.label}
                                                                        </button>
                                                                    ))}
                                                                </div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </AccordionContent>
                                </AccordionItem>

                                {/* SEÇÃO 2: BOTÕES / OPÇÕES DO MENU */}
                                <AccordionItem value="menu-options" className="border rounded-xl bg-card px-3.5 overflow-hidden">
                                    <AccordionTrigger className="hover:no-underline py-3 text-xs sm:text-sm font-semibold">
                                        <div className="flex items-center gap-2">
                                            <Grid className="h-4 w-4 text-indigo-600" />
                                            <span>2. Opções / Botões do Menu</span>
                                            <Badge variant="outline" className="text-[10px]">
                                                {normalizeMenuOptions(formData.menuOptions).length}
                                            </Badge>
                                        </div>
                                    </AccordionTrigger>
                                    <AccordionContent className="pt-2 pb-3.5 space-y-2.5 border-t">
                                        <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                                            {normalizeMenuOptions(formData.menuOptions).map((opt, idx) => {
                                                const isDragging = draggedOptionIndex === idx;
                                                const isDragOver = dragOverIndex === idx && draggedOptionIndex !== idx;
                                                const isUrlOption = opt.type === 'url';

                                                return (
                                                    <div
                                                        key={opt.id || `opt_${idx}`}
                                                        draggable
                                                        onDragStart={(e) => handleDragStart(e, idx)}
                                                        onDragOver={(e) => handleDragOver(e, idx)}
                                                        onDragLeave={() => handleDragLeave(idx)}
                                                        onDrop={(e) => handleDrop(e, idx)}
                                                        onDragEnd={handleDragEnd}
                                                        className={`p-2.5 rounded-xl border transition-all duration-150 relative ${
                                                            isDragging
                                                                ? 'opacity-40 border-dashed border-indigo-400'
                                                                : isDragOver
                                                                ? 'border-2 border-indigo-500 bg-indigo-50/50 dark:bg-indigo-950/40'
                                                                : isUrlOption
                                                                ? 'bg-emerald-50/20 dark:bg-emerald-950/15 border-emerald-200/70 dark:border-emerald-900/50'
                                                                : 'bg-muted/20'
                                                        }`}
                                                    >
                                                        <div className="flex items-start gap-2">
                                                            <div
                                                                className="cursor-grab active:cursor-grabbing p-0.5 mt-1 text-slate-400 hover:text-indigo-600 shrink-0"
                                                                title="Arraste para reordenar"
                                                            >
                                                                <GripVertical className="h-3.5 w-3.5" />
                                                            </div>

                                                            <div className="flex-1 min-w-0 space-y-2">
                                                                <div className="flex items-center justify-between gap-1.5">
                                                                    <div className="flex items-center gap-1.5 flex-wrap">
                                                                        <Badge variant="secondary" className="text-[10px] h-4 px-1.5 font-mono">
                                                                            #{idx + 1}
                                                                        </Badge>
                                                                        <div className="flex items-center bg-muted p-0.5 rounded-md text-[10px]">
                                                                            <button
                                                                                type="button"
                                                                                onClick={() => handleUpdateMenuOption(idx, 'type', 'reply')}
                                                                                className={`px-1.5 py-0.5 rounded font-medium transition-all ${
                                                                                    !isUrlOption
                                                                                        ? 'bg-background text-foreground shadow-2xs'
                                                                                        : 'text-muted-foreground'
                                                                                }`}
                                                                            >
                                                                                Fluxo
                                                                            </button>
                                                                            <button
                                                                                type="button"
                                                                                onClick={() => {
                                                                                    handleUpdateMenuOption(idx, 'type', 'url');
                                                                                    if (!opt.url) {
                                                                                        handleUpdateMenuOption(idx, 'url', '{link_renovacao}');
                                                                                    }
                                                                                }}
                                                                                className={`px-1.5 py-0.5 rounded font-medium transition-all flex items-center gap-1 ${
                                                                                    isUrlOption
                                                                                        ? 'bg-emerald-600 text-white shadow-2xs'
                                                                                        : 'text-muted-foreground'
                                                                                }`}
                                                                            >
                                                                                <ExternalLink className="h-2.5 w-2.5" />
                                                                                Link URL
                                                                            </button>
                                                                        </div>
                                                                    </div>

                                                                    <Button
                                                                        type="button"
                                                                        variant="ghost"
                                                                        size="icon"
                                                                        onClick={() => handleRemoveMenuOption(idx)}
                                                                        className="text-destructive h-6 w-6 hover:bg-destructive/10 shrink-0"
                                                                    >
                                                                        <Trash2 className="h-3 w-3" />
                                                                    </Button>
                                                                </div>

                                                                <Input
                                                                    placeholder={isUrlOption ? 'Texto do botão (Ex: RENOVAR AGORA)' : 'Título da opção'}
                                                                    value={opt.label}
                                                                    draggable={false}
                                                                    onDragStart={(e) => e.stopPropagation()}
                                                                    onChange={(e) => handleUpdateMenuOption(idx, 'label', e.target.value)}
                                                                    className="bg-background font-medium text-xs h-7"
                                                                />

                                                                {isUrlOption ? (
                                                                    <div className="space-y-1">
                                                                        <Input
                                                                            placeholder="URL (Ex: {link_renovacao} ou https://...)"
                                                                            value={opt.url || ''}
                                                                            draggable={false}
                                                                            onDragStart={(e) => e.stopPropagation()}
                                                                            onChange={(e) => handleUpdateMenuOption(idx, 'url', e.target.value)}
                                                                            className="bg-background font-mono text-[11px] h-7 text-emerald-700 dark:text-emerald-300"
                                                                        />
                                                                        <div className="flex items-center gap-1 flex-wrap">
                                                                            <button
                                                                                type="button"
                                                                                onClick={() => handleUpdateMenuOption(idx, 'url', '{link_renovacao}')}
                                                                                className="text-[9.5px] px-1.5 py-0.5 rounded bg-emerald-100 dark:bg-emerald-900/50 text-emerald-800 dark:text-emerald-200 font-mono"
                                                                            >
                                                                                +{'{link_renovacao}'}
                                                                            </button>
                                                                            <button
                                                                                type="button"
                                                                                onClick={() => handleUpdateMenuOption(idx, 'url', '{link_de_acesso}')}
                                                                                className="text-[9.5px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground font-mono"
                                                                            >
                                                                                +{'{link_de_acesso}'}
                                                                            </button>
                                                                        </div>
                                                                    </div>
                                                                ) : (
                                                                    <Input
                                                                        placeholder="Descrição curta (opcional)"
                                                                        value={opt.description || ''}
                                                                        draggable={false}
                                                                        onDragStart={(e) => e.stopPropagation()}
                                                                        onChange={(e) => handleUpdateMenuOption(idx, 'description', e.target.value)}
                                                                        className="bg-background text-[11px] h-7 text-muted-foreground"
                                                                    />
                                                                )}
                                                            </div>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>

                                        <div className="grid grid-cols-2 gap-2 pt-1">
                                            <Button
                                                type="button"
                                                variant="outline"
                                                size="sm"
                                                onClick={() => handleAddMenuOption('reply')}
                                                className="border-dashed border-indigo-300 dark:border-indigo-800 text-indigo-700 dark:text-indigo-300 h-8 text-xs gap-1"
                                            >
                                                <Plus className="h-3.5 w-3.5" />
                                                Opção de Fluxo
                                            </Button>
                                            <Button
                                                type="button"
                                                variant="outline"
                                                size="sm"
                                                onClick={() => handleAddMenuOption('url')}
                                                className="border-dashed border-emerald-300 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300 h-8 text-xs gap-1"
                                            >
                                                <ExternalLink className="h-3.5 w-3.5" />
                                                Botão com Link
                                            </Button>
                                        </div>
                                    </AccordionContent>
                                </AccordionItem>

                                {/* SEÇÃO 3: AJUSTES EXTRAS DO MENU (MINIMIZADO) */}
                                <AccordionItem value="menu-advanced" className="border rounded-xl bg-card px-3.5 overflow-hidden">
                                    <AccordionTrigger className="hover:no-underline py-3 text-xs sm:text-sm font-semibold">
                                        <div className="flex items-center gap-2">
                                            <SlidersHorizontal className="h-4 w-4 text-slate-500" />
                                            <span>3. Rodapé, Botão da Lista e Aviso de Erro</span>
                                            <Badge variant="outline" className="text-[10px] font-normal">
                                                Opcional
                                            </Badge>
                                        </div>
                                    </AccordionTrigger>
                                    <AccordionContent className="pt-2 pb-3.5 space-y-3 border-t">
                                        {(formData.menuType || 'list') === 'list' && (
                                            <div className="space-y-1">
                                                <Label className="text-xs font-semibold">Título do botão de abrir a lista</Label>
                                                <Input
                                                    placeholder="Ex: VER OPÇÕES"
                                                    value={formData.menuButtonTitle || ''}
                                                    onChange={(e) =>
                                                        setFormData({ ...formData, menuButtonTitle: e.target.value })
                                                    }
                                                    className="h-8 text-xs"
                                                />
                                            </div>
                                        )}

                                        <div className="space-y-1">
                                            <Label className="text-xs font-semibold">Texto de Rodapé (Opcional)</Label>
                                            <Input
                                                placeholder="Ex: Entrega Automática • Clique no botão abaixo"
                                                value={formData.menuFooterText || ''}
                                                onChange={(e) =>
                                                    setFormData({ ...formData, menuFooterText: e.target.value })
                                                }
                                                className="h-8 text-xs"
                                            />
                                        </div>

                                        <div className="space-y-1">
                                            <Label className="text-xs font-semibold">
                                                Mensagem se o Cliente Digitar Fora do Menu (Opcional)
                                            </Label>
                                            <Input
                                                placeholder="Ex: Selecione uma das opções acima"
                                                value={formData.invalidOptionMessage || ''}
                                                onChange={(e) =>
                                                    setFormData({ ...formData, invalidOptionMessage: e.target.value })
                                                }
                                                className="h-8 text-xs"
                                            />
                                        </div>
                                    </AccordionContent>
                                </AccordionItem>
                            </Accordion>
                        )}

                        {/* ---------------- 2. CONFIGURAÇÃO DE CONTEÚDO ---------------- */}
                        {formData.nodeType === 'content' && (
                            <div className="space-y-3">
                                <div className="p-3.5 rounded-xl border bg-card space-y-3">
                                    <div className="space-y-1.5">
                                        <Label className="text-xs font-semibold">Tipo de Conteúdo</Label>
                                        <Select
                                            value={formData.contentType || 'text'}
                                            onValueChange={(val: any) => setFormData({ ...formData, contentType: val })}
                                        >
                                            <SelectTrigger className="h-8 text-xs">
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="text">Texto</SelectItem>
                                                <SelectItem value="image">Imagem</SelectItem>
                                                <SelectItem value="audio">Áudio</SelectItem>
                                                <SelectItem value="video">Vídeo</SelectItem>
                                                <SelectItem value="document">Documento / PDF</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>

                                    {formData.contentType && formData.contentType !== 'text' && (
                                        <div className="space-y-1.5">
                                            <Label className="text-xs font-semibold">URL da Mídia</Label>
                                            <Input
                                                placeholder="https://exemplo.com/imagem.png"
                                                value={formData.mediaUrl || ''}
                                                onChange={(e) => setFormData({ ...formData, mediaUrl: e.target.value })}
                                                className="h-8 text-xs"
                                            />
                                        </div>
                                    )}

                                    <div className="space-y-1.5">
                                        <Label className="text-xs font-semibold">
                                            {formData.contentType && formData.contentType !== 'text'
                                                ? 'Legenda da Mídia (Opcional)'
                                                : 'Mensagem de Texto'}
                                        </Label>
                                        <Textarea
                                            placeholder="Escreva a mensagem que será enviada pelo WhatsApp..."
                                            rows={4}
                                            value={formData.text || ''}
                                            onChange={(e) => setFormData({ ...formData, text: e.target.value })}
                                            className="text-xs sm:text-sm"
                                        />
                                    </div>
                                </div>

                                <Accordion type="single" collapsible className="border rounded-xl bg-card px-3.5">
                                    <AccordionItem value="vars" className="border-0">
                                        <AccordionTrigger className="hover:no-underline py-2.5 text-xs font-semibold">
                                            <span className="flex items-center gap-1.5">
                                                <Sparkles className="h-3.5 w-3.5 text-indigo-500" />
                                                Inserir Variáveis Dinâmicas do Cliente
                                            </span>
                                        </AccordionTrigger>
                                        <AccordionContent className="pt-2 pb-3 space-y-2 border-t max-h-44 overflow-y-auto">
                                            {FLOW_VARIABLE_GROUPS.map((grp) => (
                                                <div key={grp.id} className="space-y-1">
                                                    <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block">
                                                        {grp.title}:
                                                    </span>
                                                    <div className="flex flex-wrap gap-1">
                                                        {grp.variables.map((v) => (
                                                            <Button
                                                                key={v.key}
                                                                type="button"
                                                                variant="outline"
                                                                size="sm"
                                                                className="text-[10.5px] h-6 px-2 font-mono"
                                                                onClick={() => handleInsertVariable('text', v.key)}
                                                                title={v.desc}
                                                            >
                                                                +{v.label}
                                                            </Button>
                                                        ))}
                                                    </div>
                                                </div>
                                            ))}
                                        </AccordionContent>
                                    </AccordionItem>
                                </Accordion>
                            </div>
                        )}

                        {/* ---------------- 3. CONFIGURAÇÃO DE ATRASO INTELIGENTE ---------------- */}
                        {formData.nodeType === 'delay' && (
                            <div className="p-3.5 rounded-xl border bg-card space-y-3">
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    <div className="space-y-1.5">
                                        <Label className="text-xs font-semibold">Tempo de Atraso</Label>
                                        <div className="grid grid-cols-2 gap-2">
                                            <Input
                                                type="number"
                                                min={1}
                                                max={
                                                    (formData.delayUnit || 'seconds') === 'hours'
                                                        ? 720
                                                        : (formData.delayUnit || 'seconds') === 'minutes'
                                                        ? 1440
                                                        : 3600
                                                }
                                                value={(() => {
                                                    if (formData.delayValue !== undefined && formData.delayValue !== null) {
                                                        return formData.delayValue;
                                                    }
                                                    const unit =
                                                        formData.delayUnit ||
                                                        (formData.delaySeconds && formData.delaySeconds >= 3600 && formData.delaySeconds % 3600 === 0
                                                            ? 'hours'
                                                            : formData.delaySeconds && formData.delaySeconds >= 60 && formData.delaySeconds % 60 === 0
                                                            ? 'minutes'
                                                            : 'seconds');
                                                    if (unit === 'hours' && formData.delaySeconds) {
                                                        return Math.max(1, Math.round(formData.delaySeconds / 3600));
                                                    }
                                                    if (unit === 'minutes' && formData.delaySeconds) {
                                                        return Math.max(1, Math.round(formData.delaySeconds / 60));
                                                    }
                                                    return formData.delaySeconds || 3;
                                                })()}
                                                onChange={(e) => {
                                                    const val = Math.max(1, parseInt(e.target.value) || 1);
                                                    const unit = formData.delayUnit || 'seconds';
                                                    let secs = val;
                                                    if (unit === 'hours') secs = val * 3600;
                                                    else if (unit === 'minutes') secs = val * 60;
                                                    setFormData({
                                                        ...formData,
                                                        delayValue: val,
                                                        delayUnit: unit,
                                                        delaySeconds: secs,
                                                    });
                                                }}
                                                className="h-8 text-xs"
                                            />
                                            <Select
                                                value={
                                                    formData.delayUnit ||
                                                    (formData.delaySeconds && formData.delaySeconds >= 3600 && formData.delaySeconds % 3600 === 0
                                                        ? 'hours'
                                                        : formData.delaySeconds && formData.delaySeconds >= 60 && formData.delaySeconds % 60 === 0
                                                        ? 'minutes'
                                                        : 'seconds')
                                                }
                                                onValueChange={(unit: 'seconds' | 'hours' | 'minutes') => {
                                                    const currentVal =
                                                        formData.delayValue !== undefined && formData.delayValue !== null
                                                            ? formData.delayValue
                                                            : formData.delaySeconds
                                                            ? formData.delayUnit === 'hours'
                                                                ? Math.round(formData.delaySeconds / 3600)
                                                                : formData.delayUnit === 'minutes'
                                                                ? Math.round(formData.delaySeconds / 60)
                                                                : formData.delaySeconds
                                                            : 3;
                                                    let secs = currentVal;
                                                    if (unit === 'hours') secs = currentVal * 3600;
                                                    else if (unit === 'minutes') secs = currentVal * 60;
                                                    setFormData({
                                                        ...formData,
                                                        delayUnit: unit,
                                                        delayValue: currentVal,
                                                        delaySeconds: secs,
                                                    });
                                                }}
                                            >
                                                <SelectTrigger className="h-8 text-xs">
                                                    <SelectValue />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="seconds">Segundos</SelectItem>
                                                    <SelectItem value="minutes">Minutos</SelectItem>
                                                    <SelectItem value="hours">Horas</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        </div>
                                    </div>

                                    <div className="space-y-1.5">
                                        <Label className="text-xs font-semibold">Simulação no WhatsApp</Label>
                                        <Select
                                            value={formData.delayPresence || 'composing'}
                                            onValueChange={(val: any) => setFormData({ ...formData, delayPresence: val })}
                                        >
                                            <SelectTrigger className="h-8 text-xs">
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="composing">Digitando...</SelectItem>
                                                <SelectItem value="recording">Gravando áudio...</SelectItem>
                                                <SelectItem value="none">Nenhuma presença</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* ---------------- 4. CONFIGURAÇÃO DE AÇÃO ---------------- */}
                        {formData.nodeType === 'action' && (
                            <div className="p-3.5 rounded-xl border bg-card space-y-3">
                                <div className="space-y-1.5">
                                    <Label className="text-xs font-semibold">Tipo de Ação</Label>
                                    <Select
                                        value={formData.actionType || 'send_contact'}
                                        onValueChange={(val: any) => setFormData({ ...formData, actionType: val })}
                                    >
                                        <SelectTrigger className="h-8 text-xs">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="send_contact">
                                                👤 Enviar Card de Contato (WhatsApp vCard)
                                            </SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>

                                {formData.actionType === 'send_contact' ? (
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
                                        <div className="space-y-1">
                                            <Label className="text-xs">Nome do Contato</Label>
                                            <Input
                                                placeholder="Ex: Suporte Oficial"
                                                value={formData.contactCardName || ''}
                                                onChange={(e) => setFormData({ ...formData, contactCardName: e.target.value })}
                                                className="h-8 text-xs"
                                            />
                                        </div>
                                        <div className="space-y-1">
                                            <Label className="text-xs">WhatsApp (com DDD)</Label>
                                            <Input
                                                placeholder="Ex: 5511999999999"
                                                value={formData.contactCardPhone || ''}
                                                onChange={(e) => setFormData({ ...formData, contactCardPhone: e.target.value })}
                                                className="h-8 text-xs font-mono"
                                            />
                                        </div>
                                        <div className="space-y-1">
                                            <Label className="text-xs">Empresa (Opcional)</Label>
                                            <Input
                                                placeholder="Ex: Minha Empresa"
                                                value={formData.contactCardOrganization || ''}
                                                onChange={(e) => setFormData({ ...formData, contactCardOrganization: e.target.value })}
                                                className="h-8 text-xs"
                                            />
                                        </div>
                                        <div className="space-y-1">
                                            <Label className="text-xs">Mensagem Junto (Opcional)</Label>
                                            <Input
                                                placeholder="Ex: Fale com nosso suporte:"
                                                value={formData.text || ''}
                                                onChange={(e) => setFormData({ ...formData, text: e.target.value })}
                                                className="h-8 text-xs"
                                            />
                                        </div>
                                    </div>
                                ) : (
                                    <div className="space-y-1">
                                        <Label className="text-xs font-semibold">Mensagem / Valor</Label>
                                        <Input
                                            placeholder="Ex: Cliente solicitou suporte"
                                            value={formData.text || ''}
                                            onChange={(e) => setFormData({ ...formData, text: e.target.value })}
                                            className="h-8 text-xs"
                                        />
                                    </div>
                                )}
                            </div>
                        )}

                        {/* ---------------- 5. CONFIGURAÇÃO DE CONEXÃO DE FLUXO ---------------- */}
                        {formData.nodeType === 'flow_connect' && (
                            <div className="p-3.5 rounded-xl border bg-card space-y-2">
                                <Label className="text-xs font-semibold">Conectar a Outro Fluxo</Label>
                                <Select
                                    value={formData.targetFlowId || undefined}
                                    onValueChange={(val) => setFormData({ ...formData, targetFlowId: val })}
                                >
                                    <SelectTrigger className="h-9 text-xs">
                                        <SelectValue placeholder="Selecione o fluxo de destino..." />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {Array.isArray(flowsList) &&
                                            flowsList
                                                .filter((f) => Boolean(f?.id))
                                                .map((f) => (
                                                    <SelectItem key={f.id} value={f.id}>
                                                        {f.name || 'Fluxo sem nome'}
                                                    </SelectItem>
                                                ))}
                                    </SelectContent>
                                </Select>
                                <p className="text-[11px] text-muted-foreground">
                                    Ao chegar neste bloco, o atendimento continua automaticamente no fluxo selecionado.
                                </p>
                            </div>
                        )}

                        {/* ---------------- 6. CONFIGURAÇÃO DE CONDIÇÃO: CLIENTE CRM ---------------- */}
                        {formData.nodeType === 'condition' && (
                            <div className="space-y-2.5">
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                                    <div className="p-3 rounded-xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50/40 dark:bg-emerald-950/20 space-y-1">
                                        <div className="flex items-center gap-1.5 font-bold text-xs text-emerald-700 dark:text-emerald-300">
                                            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                                            <span>Saída 1: Cadastrado</span>
                                        </div>
                                        <p className="text-[11px] text-muted-foreground leading-snug">
                                            Número encontrado no CRM. Libera as variáveis do cliente.
                                        </p>
                                    </div>

                                    <div className="p-3 rounded-xl border border-rose-200 dark:border-rose-800 bg-rose-50/40 dark:bg-rose-950/20 space-y-1">
                                        <div className="flex items-center gap-1.5 font-bold text-xs text-rose-700 dark:text-rose-300">
                                            <UserX className="h-3.5 w-3.5 text-rose-600 shrink-0" />
                                            <span>Saída 2: Não Cadastrado</span>
                                        </div>
                                        <p className="text-[11px] text-muted-foreground leading-snug">
                                            Contato novo. Ideal para conectar ao menu de vendas.
                                        </p>
                                    </div>
                                </div>

                                <Accordion type="single" collapsible className="border rounded-xl bg-card px-3.5">
                                    <AccordionItem value="crm-vars" className="border-0">
                                        <AccordionTrigger className="hover:no-underline py-2.5 text-xs font-semibold">
                                            <span className="flex items-center gap-1.5">
                                                <Sparkles className="h-3.5 w-3.5 text-indigo-500" />
                                                Ver Variáveis Disponíveis na Saída &quot;Cliente Cadastrado&quot;
                                            </span>
                                        </AccordionTrigger>
                                        <AccordionContent className="pt-2 pb-3 space-y-2.5 border-t max-h-56 overflow-y-auto">
                                            {FLOW_VARIABLE_GROUPS.map((group) => {
                                                const GroupIcon = group.icon;
                                                return (
                                                    <div key={group.id} className="space-y-1 p-2 rounded-lg bg-muted/30 border">
                                                        <span className={`text-[11px] font-bold flex items-center gap-1.5 ${group.colorClass}`}>
                                                            <GroupIcon className="h-3 w-3" />
                                                            {group.title}
                                                        </span>
                                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1 pt-1 text-[10.5px]">
                                                            {group.variables.map((v) => (
                                                                <div
                                                                    key={v.key}
                                                                    className="px-2 py-1 rounded bg-background border flex items-center justify-between font-mono"
                                                                >
                                                                    <span className="font-semibold text-indigo-600 dark:text-indigo-400">
                                                                        {v.label}
                                                                    </span>
                                                                    <span className="text-[10px] text-muted-foreground font-sans truncate ml-2">
                                                                        {v.desc}
                                                                    </span>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </AccordionContent>
                                    </AccordionItem>
                                </Accordion>
                            </div>
                        )}

                        {/* ---------------- 7. CONFIGURAÇÃO DE PAUSAR AUTOMAÇÃO (COOLDOWN) ---------------- */}
                        {formData.nodeType === 'pause_automation' && (
                            <Accordion type="multiple" defaultValue={['pause-time']} className="space-y-2.5">
                                <AccordionItem value="pause-time" className="border rounded-xl bg-card px-3.5 overflow-hidden">
                                    <AccordionTrigger className="hover:no-underline py-3 text-xs sm:text-sm font-semibold">
                                        <div className="flex items-center gap-2">
                                            <PauseCircle className="h-4 w-4 text-purple-600" />
                                            <span>Tempo de Pausa e Mensagem Final</span>
                                        </div>
                                    </AccordionTrigger>
                                    <AccordionContent className="pt-2 pb-3.5 space-y-3 border-t">
                                        <div className="grid grid-cols-2 gap-2.5">
                                            <div className="space-y-1">
                                                <Label className="text-xs">Tempo de Silêncio</Label>
                                                <Input
                                                    type="number"
                                                    min={1}
                                                    value={formData.pauseDurationValue !== undefined ? formData.pauseDurationValue : 1}
                                                    onChange={(e) =>
                                                        setFormData({
                                                            ...formData,
                                                            pauseDurationValue: Math.max(1, parseInt(e.target.value) || 1),
                                                        })
                                                    }
                                                    className="h-8 text-xs"
                                                />
                                            </div>
                                            <div className="space-y-1">
                                                <Label className="text-xs">Unidade</Label>
                                                <Select
                                                    value={formData.pauseDurationUnit || 'hours'}
                                                    onValueChange={(val: any) => setFormData({ ...formData, pauseDurationUnit: val })}
                                                >
                                                    <SelectTrigger className="h-8 text-xs">
                                                        <SelectValue />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        <SelectItem value="minutes">Minutos</SelectItem>
                                                        <SelectItem value="hours">Horas</SelectItem>
                                                        <SelectItem value="days">Dias</SelectItem>
                                                    </SelectContent>
                                                </Select>
                                            </div>
                                        </div>

                                        <div className="space-y-1.5">
                                            <Label className="text-xs font-semibold">Mensagem Final ao Cliente (Opcional)</Label>
                                            <Textarea
                                                placeholder="Ex: Obrigado pelo contato! Em breve um atendente responderá."
                                                rows={3}
                                                value={formData.text || ''}
                                                onChange={(e) => setFormData({ ...formData, text: e.target.value })}
                                                className="text-xs"
                                            />
                                            <div className="flex flex-wrap gap-1 pt-0.5">
                                                {AVAILABLE_FLOW_VARIABLES.slice(0, 6).map((v) => (
                                                    <Badge
                                                        key={v.key}
                                                        variant="outline"
                                                        className="cursor-pointer hover:bg-indigo-50 text-[10px] py-0 px-1.5 font-mono"
                                                        onClick={() => handleInsertVariable('text', v.key)}
                                                    >
                                                        +{v.label}
                                                    </Badge>
                                                ))}
                                            </div>
                                        </div>
                                    </AccordionContent>
                                </AccordionItem>
                            </Accordion>
                        )}

                        {/* ---------------- 8. CONFIGURAÇÃO DE COBRANÇA PIX + ENTREGA AUTOMÁTICA DE PRODUTO ---------------- */}
                        {formData.nodeType === 'pix_payment' && (
                            <div className="space-y-2.5">
                                {/* BARRA RESUMO COMPACTA NO TOPO */}
                                <div className="flex items-center justify-between gap-2 px-3 py-2 rounded-xl border border-emerald-200 dark:border-emerald-800/70 bg-emerald-50/40 dark:bg-emerald-950/20">
                                    <div className="flex items-center gap-2 min-w-0">
                                        <div className="p-1.5 rounded-lg bg-emerald-600 text-white shrink-0">
                                            <QrCode className="h-3.5 w-3.5" />
                                        </div>
                                        <span className="text-xs font-medium text-emerald-950 dark:text-emerald-200 truncate">
                                            Gera PIX e entrega 1 login do estoque após pago
                                        </span>
                                    </div>
                                    <Button
                                        asChild
                                        variant="outline"
                                        size="sm"
                                        className="h-7 text-[11px] shrink-0 border-emerald-300 text-emerald-800 hover:bg-emerald-100 dark:border-emerald-700 dark:text-emerald-300"
                                    >
                                        <Link href="/flows/product-delivery" target="_blank">
                                            <Package className="h-3 w-3 mr-1" />
                                            Estoque
                                        </Link>
                                    </Button>
                                </div>

                                {/* DROPDOWNS AGRUPADOS (ACCORDION) */}
                                <Accordion type="multiple" defaultValue={['pix-product']} className="space-y-2">
                                    {/* 1. PRODUTO E VALOR DA COBRANÇA */}
                                    <AccordionItem
                                        value="pix-product"
                                        className="border rounded-xl bg-card px-3.5 overflow-hidden"
                                    >
                                        <AccordionTrigger className="hover:no-underline py-3 text-xs sm:text-sm font-semibold">
                                            <div className="flex items-center justify-between w-full pr-2 gap-2">
                                                <span className="flex items-center gap-2">
                                                    <Package className="h-4 w-4 text-emerald-600 shrink-0" />
                                                    <span>1. Produto e Valor do PIX</span>
                                                </span>
                                                <div className="flex items-center gap-1.5">
                                                    {formData.pixProductName && (
                                                        <Badge variant="secondary" className="text-[10px] font-normal max-w-28 truncate">
                                                            {formData.pixProductName}
                                                        </Badge>
                                                    )}
                                                    <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30 text-[10px] font-mono">
                                                        R$ {formData.pixAmount || '19,90'}
                                                    </Badge>
                                                </div>
                                            </div>
                                        </AccordionTrigger>
                                        <AccordionContent className="pt-2.5 pb-3.5 space-y-3 border-t">
                                            <div className="space-y-2">
                                                <Label className="text-xs font-semibold">
                                                    Produto a entregar após o pagamento
                                                </Label>

                                                {availableProductsSummary.length > 0 && (
                                                    <Select
                                                        value={
                                                            availableProductsSummary.some(
                                                                (p) =>
                                                                    p.name.toLowerCase() ===
                                                                    (formData.pixProductName || '').trim().toLowerCase()
                                                            )
                                                                ? availableProductsSummary.find(
                                                                      (p) =>
                                                                          p.name.toLowerCase() ===
                                                                          (formData.pixProductName || '').trim().toLowerCase()
                                                                  )?.name
                                                                : undefined
                                                        }
                                                        onValueChange={(val) => {
                                                            const found = availableProductsSummary.find((p) => p.name === val);
                                                            const nextAmount =
                                                                found?.defaultPrice !== undefined && found?.defaultPrice !== null
                                                                    ? Number(found.defaultPrice).toFixed(2).replace('.', ',')
                                                                    : formData.pixAmount || '19,90';
                                                            setFormData({
                                                                ...formData,
                                                                pixProductName: val,
                                                                pixAmount: nextAmount,
                                                                label: `PIX: ${val}`,
                                                            });
                                                        }}
                                                    >
                                                        <SelectTrigger className="h-8 text-xs">
                                                            <SelectValue placeholder="Escolher produto cadastrado no estoque..." />
                                                        </SelectTrigger>
                                                        <SelectContent>
                                                            {availableProductsSummary.map((prod) => (
                                                                <SelectItem key={prod.name} value={prod.name}>
                                                                    📦 {prod.name} ({prod.availableCount} disp.)
                                                                </SelectItem>
                                                            ))}
                                                        </SelectContent>
                                                    </Select>
                                                )}

                                                <Input
                                                    placeholder="Ou digite o nome do produto (Ex: Netflix, Disney+, Canva...)"
                                                    value={formData.pixProductName || ''}
                                                    onChange={(e) =>
                                                        setFormData({
                                                            ...formData,
                                                            pixProductName: e.target.value,
                                                            label: e.target.value
                                                                ? `PIX: ${e.target.value}`
                                                                : 'PIX + Entrega Produto',
                                                        })
                                                    }
                                                    className="h-8 text-xs"
                                                />
                                            </div>

                                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
                                                <div className="space-y-1">
                                                    <div className="flex items-center justify-between">
                                                        <Label className="text-xs font-semibold flex items-center gap-1">
                                                            <DollarSign className="h-3.5 w-3.5 text-emerald-600" />
                                                            Valor do PIX (R$)
                                                        </Label>
                                                        {(() => {
                                                            const matched = availableProductsSummary.find(
                                                                (p) => p.name.toLowerCase() === (formData.pixProductName || '').trim().toLowerCase()
                                                            );
                                                            if (matched?.defaultPrice !== undefined && matched?.defaultPrice !== null) {
                                                                const pPrice = Number(matched.defaultPrice).toFixed(2).replace('.', ',');
                                                                if (formData.pixAmount !== pPrice) {
                                                                    return (
                                                                        <button
                                                                            type="button"
                                                                            onClick={() => setFormData({ ...formData, pixAmount: pPrice })}
                                                                            className="text-[10.5px] text-emerald-600 dark:text-emerald-400 hover:underline font-semibold"
                                                                            title="Clique para atualizar com o valor cadastrado no produto"
                                                                        >
                                                                            ⚡ Usar R$ {pPrice} (Produto)
                                                                        </button>
                                                                    );
                                                                }
                                                            }
                                                            return null;
                                                        })()}
                                                    </div>
                                                    <Input
                                                        placeholder="Ex: 19,90"
                                                        value={
                                                            formData.pixAmount !== undefined
                                                                ? String(formData.pixAmount)
                                                                : '19,90'
                                                        }
                                                        onChange={(e) =>
                                                            setFormData({ ...formData, pixAmount: e.target.value })
                                                        }
                                                        className="h-8 text-xs font-mono"
                                                    />
                                                </div>

                                                <div className="space-y-1">
                                                    <Label className="text-xs font-semibold">
                                                        Descrição no PIX (Opcional)
                                                    </Label>
                                                    <Input
                                                        placeholder="Ex: Acesso Mensal"
                                                        value={formData.pixDescription || ''}
                                                        onChange={(e) =>
                                                            setFormData({ ...formData, pixDescription: e.target.value })
                                                        }
                                                        className="h-8 text-xs"
                                                    />
                                                </div>
                                            </div>
                                        </AccordionContent>
                                    </AccordionItem>

                                    {/* 2. MENSAGEM ENVIADA JUNTO COM O PIX (DROPDOWN MINIMIZADO) */}
                                    <AccordionItem
                                        value="pix-message"
                                        className="border rounded-xl bg-card px-3.5 overflow-hidden"
                                    >
                                        <AccordionTrigger className="hover:no-underline py-3 text-xs sm:text-sm font-semibold">
                                            <div className="flex items-center justify-between w-full pr-2 gap-2">
                                                <span className="flex items-center gap-2">
                                                    <MessageSquareText className="h-4 w-4 text-indigo-600 shrink-0" />
                                                    <span>2. Mensagem Enviada ao Gerar PIX</span>
                                                </span>
                                                <Badge variant="outline" className="text-[10px] font-normal">
                                                    Personalizar
                                                </Badge>
                                            </div>
                                        </AccordionTrigger>
                                        <AccordionContent className="pt-2.5 pb-3.5 space-y-2.5 border-t">
                                            <div className="flex items-center justify-between">
                                                <span className="text-[11px] text-muted-foreground">
                                                    Texto enviado junto com a cobrança:
                                                </span>
                                                <Button
                                                    type="button"
                                                    variant="ghost"
                                                    size="sm"
                                                    className="h-6 px-2 text-[11px] text-emerald-700"
                                                    onClick={() =>
                                                        setFormData({
                                                            ...formData,
                                                            pixMessageText: DEFAULT_FLOW_PIX_BILLING_MESSAGE,
                                                        })
                                                    }
                                                >
                                                    Restaurar Padrão
                                                </Button>
                                            </div>
                                            <Textarea
                                                rows={4}
                                                placeholder={DEFAULT_FLOW_PIX_BILLING_MESSAGE}
                                                value={formData.pixMessageText ?? DEFAULT_FLOW_PIX_BILLING_MESSAGE}
                                                onChange={(e) =>
                                                    setFormData({ ...formData, pixMessageText: e.target.value })
                                                }
                                                className="text-xs"
                                            />
                                            <div className="flex flex-wrap gap-1">
                                                {[
                                                    { key: '{primeiro_nome}', label: '+{primeiro_nome}' },
                                                    { key: '{cliente}', label: '+{cliente}' },
                                                    { key: '{produto}', label: '+{produto}' },
                                                    { key: '{valor}', label: '+{valor}' },
                                                    { key: '{pix_copia_e_cola}', label: '+{pix_copia_e_cola}' },
                                                ].map((v) => (
                                                    <Badge
                                                        key={v.key}
                                                        variant="outline"
                                                        className="cursor-pointer hover:bg-emerald-50 dark:hover:bg-emerald-950/50 text-[10px] font-mono py-0 px-1.5"
                                                        onClick={() =>
                                                            setFormData({
                                                                ...formData,
                                                                pixMessageText:
                                                                    (formData.pixMessageText ??
                                                                        DEFAULT_FLOW_PIX_BILLING_MESSAGE) + ` ${v.key}`,
                                                            })
                                                        }
                                                    >
                                                        {v.label}
                                                    </Badge>
                                                ))}
                                            </div>
                                        </AccordionContent>
                                    </AccordionItem>

                                    {/* 3. OPÇÕES DE ENVIO E ENTREGA (DROPDOWN MINIMIZADO) */}
                                    <AccordionItem
                                        value="pix-options"
                                        className="border rounded-xl bg-card px-3.5 overflow-hidden"
                                    >
                                        <AccordionTrigger className="hover:no-underline py-3 text-xs sm:text-sm font-semibold">
                                            <div className="flex items-center justify-between w-full pr-2 gap-2">
                                                <span className="flex items-center gap-2">
                                                    <SlidersHorizontal className="h-4 w-4 text-slate-600 shrink-0" />
                                                    <span>3. Opções de Envio (Copia e Cola / QR Code)</span>
                                                </span>
                                                <Badge variant="outline" className="text-[10px] font-normal">
                                                    {formData.pixSendQrImage ? 'Copia e Cola + QR' : 'Copia e Cola'}
                                                </Badge>
                                            </div>
                                        </AccordionTrigger>
                                        <AccordionContent className="pt-2.5 pb-3.5 space-y-2.5 border-t">
                                            <div className="flex items-center justify-between gap-3 p-2.5 rounded-lg bg-muted/30 border">
                                                <div className="space-y-0.5">
                                                    <Label className="text-xs font-semibold">
                                                        Enviar PIX Copia e Cola separado
                                                    </Label>
                                                    <p className="text-[10.5px] text-muted-foreground">
                                                        Envia o código sozinho em outra mensagem para facilitar a cópia.
                                                    </p>
                                                </div>
                                                <Switch
                                                    checked={formData.pixSendCopyPasteSeparate !== false}
                                                    onCheckedChange={(val) =>
                                                        setFormData({ ...formData, pixSendCopyPasteSeparate: val })
                                                    }
                                                />
                                            </div>

                                            <div className="flex items-center justify-between gap-3 p-2.5 rounded-lg bg-emerald-50/40 dark:bg-emerald-950/20 border border-emerald-200/60 dark:border-emerald-900/50">
                                                <div className="space-y-0.5">
                                                    <Label className="text-xs font-semibold flex items-center gap-1.5 text-emerald-900 dark:text-emerald-200">
                                                        <Copy className="h-3.5 w-3.5 text-emerald-600" />
                                                        Botão de Copiar Código PIX (Estilo Grupo)
                                                    </Label>
                                                    <p className="text-[10.5px] text-muted-foreground">
                                                        Adiciona o botão nativo no WhatsApp que copia o código Pix com 1 toque no celular.
                                                    </p>
                                                </div>
                                                <Switch
                                                    checked={formData.pixSendCopyButton !== false}
                                                    onCheckedChange={(val) =>
                                                        setFormData({ ...formData, pixSendCopyButton: val })
                                                    }
                                                />
                                            </div>

                                            <div className="flex items-center justify-between gap-3 p-2.5 rounded-lg bg-muted/30 border">
                                                <div className="space-y-0.5">
                                                    <Label className="text-xs font-semibold">
                                                        Enviar também Imagem do QR Code
                                                    </Label>
                                                    <p className="text-[10.5px] text-muted-foreground">
                                                        Útil caso o cliente esteja conversando pelo computador.
                                                    </p>
                                                </div>
                                                <Switch
                                                    checked={Boolean(formData.pixSendQrImage)}
                                                    onCheckedChange={(val) =>
                                                        setFormData({ ...formData, pixSendQrImage: val })
                                                    }
                                                />
                                            </div>

                                            <div className="p-2.5 rounded-lg bg-indigo-50/60 dark:bg-indigo-950/30 border border-indigo-200/70 dark:border-indigo-800 text-[11px] text-indigo-900 dark:text-indigo-200 flex items-start gap-2">
                                                <Info className="h-3.5 w-3.5 text-indigo-600 shrink-0 mt-0.5" />
                                                <span>
                                                    A mensagem de entrega com E-mail e Senha pode ser personalizada em{' '}
                                                    <strong>Fluxo &rarr; Entrega de Produtos</strong>.
                                                </span>
                                            </div>
                                        </AccordionContent>
                                    </AccordionItem>
                                </Accordion>
                            </div>
                        )}
                    </div>

                    <DialogFooter className="border-t pt-3 flex flex-row items-center justify-between sm:justify-between gap-2 w-full">
                        <div className="flex items-center gap-1.5">
                            {formData.nodeType === 'menu' && (
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    onClick={() => setIsPreviewOpen(true)}
                                    className="gap-1.5 text-xs h-8 text-emerald-700 dark:text-emerald-400 border-emerald-300 dark:border-emerald-800"
                                >
                                    <Eye className="h-3.5 w-3.5" />
                                    <span className="hidden sm:inline">Pré-visualizar</span>
                                </Button>
                            )}
                            {onDelete && node && (
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => {
                                        onDelete(node.id);
                                        onOpenChange(false);
                                    }}
                                    className="gap-1 text-xs h-8 text-rose-600 hover:text-rose-700 hover:bg-rose-50 dark:hover:bg-rose-950/40 px-2"
                                >
                                    <Trash2 className="h-3.5 w-3.5" />
                                    <span>Excluir</span>
                                </Button>
                            )}
                        </div>

                        <div className="flex items-center gap-2">
                            <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => onOpenChange(false)}>
                                Cancelar
                            </Button>
                            <Button
                                size="sm"
                                onClick={handleSave}
                                className="h-8 text-xs bg-indigo-600 hover:bg-indigo-700 text-white"
                            >
                                Salvar Bloco
                            </Button>
                        </div>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* MODAL DE PRÉ-VISUALIZAÇÃO NO WHATSAPP */}
            <WhatsAppMenuPreviewDialog
                open={isPreviewOpen}
                onOpenChange={setIsPreviewOpen}
                data={formData}
            />
        </>
    );
}
