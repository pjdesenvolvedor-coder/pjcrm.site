'use client';

import React, { useState, useEffect } from 'react';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from '@/components/ui/dialog';
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
    X,
    Plus,
    Trash2,
    Bold,
    Italic,
    Strikethrough,
    Code,
    Sparkles,
    GripVertical,
    Eye,
    UserCheck,
    UserX,
    CheckCircle2,
    Mail,
    KeyRound,
    Tv,
    CreditCard,
    PlayCircle,
    Layers,
} from 'lucide-react';
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
            { key: 'notas', label: '{notas}', desc: 'Observações / notas do cliente' },
        ],
    },
    {
        id: 'multi_subscriptions',
        title: 'Listas de Assinaturas (Múltiplas)',
        icon: Layers,
        colorClass: 'text-amber-600 dark:text-amber-400',
        badgeClass: 'bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300 border-amber-200 dark:border-amber-800',
        variables: [
            { key: 'assinaturas_ativas', label: '{assinaturas_ativas}', desc: 'Lista de todas as assinaturas ativas do cliente' },
            { key: 'assinaturas_vencidas', label: '{assinaturas_vencidas}', desc: 'Lista de todas as assinaturas vencidas do cliente' },
            { key: 'todas_assinaturas', label: '{todas_assinaturas}', desc: 'Lista de todas as assinaturas (ativas e vencidas)' },
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

function normalizeMenuOptions(options: any): Array<{ id: string; label: string; description?: string }> {
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
                return { id: `opt_${idx + 1}`, label: item, description: '' };
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
                return {
                    id: String(item.id || `opt_${idx + 1}`),
                    label,
                    description: item.description !== undefined && item.description !== null ? String(item.description) : '',
                };
            }
            return { id: `opt_${idx + 1}`, label: String(item), description: '' };
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

    // Arrastar e soltar para mudar a ordem das respostas do menu
    const [draggedOptionIndex, setDraggedOptionIndex] = useState<number | null>(null);
    const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

    useEffect(() => {
        if (node?.data) {
            setFormData({
                ...node.data,
                menuOptions: normalizeMenuOptions(node.data.menuOptions),
            });
        }
    }, [node]);

    useEffect(() => {
        if (!open) {
            setIsPreviewOpen(false);
        }
    }, [open]);

    const handleInsertVariable = (field: 'text' | 'menuQuestionText' | 'menuButtonTitle', variable: string) => {
        setFormData((prev) => ({
            ...prev,
            [field]: (prev[field] || '') + ` {${variable}} `,
        }));
    };

    const handleAddMenuOption = () => {
        const newId = 'opt_' + Date.now();
        const currentOptions = normalizeMenuOptions(formData.menuOptions);
        setFormData((prev) => ({
            ...prev,
            menuOptions: [
                ...currentOptions,
                { id: newId, label: `Opção ${currentOptions.length + 1}`, description: '' },
            ],
        }));
    };

    const handleUpdateMenuOption = (index: number, key: 'label' | 'description', value: string) => {
        setFormData((prev) => {
            const list = normalizeMenuOptions(prev.menuOptions);
            if (!list[index]) return prev;
            const updated = list.map((item, i) => (i === index ? { ...item, [key]: value } : item));
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
                <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
                <DialogHeader className="border-b pb-3">
                    <DialogTitle className="flex items-center gap-2 text-lg">
                        {formData.nodeType === 'start' && <PlayCircle className="h-5 w-5 text-emerald-500" />}
                        {formData.nodeType === 'menu' && <Grid className="h-5 w-5 text-indigo-600" />}
                        {formData.nodeType === 'content' && <Star className="h-5 w-5 text-rose-500" />}
                        {formData.nodeType === 'delay' && <Clock className="h-5 w-5 text-orange-500" />}
                        {formData.nodeType === 'action' && <Zap className="h-5 w-5 text-amber-500" />}
                        {formData.nodeType === 'flow_connect' && <Rocket className="h-5 w-5 text-emerald-500" />}
                        {formData.nodeType === 'condition' && <UserCheck className="h-5 w-5 text-sky-500" />}
                        <span>
                            {formData.nodeType === 'start' && 'Início do Fluxo'}
                            {formData.nodeType === 'menu' && 'Menu'}
                            {formData.nodeType === 'content' && 'Conteúdo'}
                            {formData.nodeType === 'delay' && 'Atraso Inteligente'}
                            {formData.nodeType === 'action' && 'Ação'}
                            {formData.nodeType === 'flow_connect' && 'Conexão de Fluxo'}
                            {formData.nodeType === 'condition' && 'Verificar Cliente no CRM'}
                        </span>
                    </DialogTitle>
                </DialogHeader>

                <div className="space-y-5 py-3">
                    {/* NOME / RÓTULO DO BLOCO */}
                    <div className="space-y-1.5">
                        <Label className="text-xs font-semibold">Identificação do Bloco</Label>
                        <Input
                            placeholder="Ex: Ponto de Partida, Início..."
                            value={formData.label || ''}
                            onChange={(e) => setFormData({ ...formData, label: e.target.value })}
                        />
                    </div>

                    {/* ---------------- 0. CONFIGURAÇÃO DE START (INÍCIO DO FLUXO) ---------------- */}
                    {formData.nodeType === 'start' && (
                        <div className="rounded-xl border border-emerald-200 dark:border-emerald-800/60 bg-emerald-50/50 dark:bg-emerald-950/20 p-4 space-y-3">
                            <div className="flex items-start gap-3">
                                <div className="p-2 rounded-lg bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600 dark:text-emerald-400">
                                    <PlayCircle className="h-5 w-5" />
                                </div>
                                <div>
                                    <h4 className="text-sm font-semibold text-emerald-950 dark:text-emerald-200">Ponto de Entrada do Fluxo</h4>
                                    <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                                        Este bloco define exatamente onde a conversa é iniciada quando acionada via WhatsApp, webhook ou teste.
                                    </p>
                                </div>
                            </div>
                            <div className="text-xs text-slate-600 dark:text-slate-300 bg-white/70 dark:bg-slate-900/60 p-3 rounded-lg border border-emerald-100 dark:border-emerald-900 space-y-1">
                                <p className="font-medium text-emerald-800 dark:text-emerald-300">💡 Como conectar:</p>
                                <p>Conecte o ponto verde à direita deste bloco ao primeiro elemento que deseja executar (por exemplo: <strong>Verificar Cliente CRM</strong>, uma <strong>Mensagem</strong> ou um <strong>Menu</strong>).</p>
                            </div>
                        </div>
                    )}

                    {/* ---------------- 1. CONFIGURAÇÃO DE MENU (BOTCONVERSA STYLE) ---------------- */}
                    {formData.nodeType === 'menu' && (
                        <div className="space-y-5">
                            {/* TIPO DE MENU */}
                            <RadioGroup
                                value={formData.menuType || 'list'}
                                onValueChange={(val: any) => setFormData({ ...formData, menuType: val })}
                                className="flex gap-6"
                            >
                                <div className="flex items-center space-x-2">
                                    <RadioGroupItem value="list" id="menu-list" />
                                    <Label htmlFor="menu-list" className="cursor-pointer font-medium text-sm">
                                        Botão de lista
                                    </Label>
                                </div>
                                <div className="flex items-center space-x-2">
                                    <RadioGroupItem value="numeric" id="menu-numeric" />
                                    <Label htmlFor="menu-numeric" className="cursor-pointer font-medium text-sm">
                                        Número
                                    </Label>
                                </div>
                                <div className="flex items-center space-x-2">
                                    <RadioGroupItem value="button" id="menu-button" />
                                    <Label htmlFor="menu-button" className="cursor-pointer font-medium text-sm">
                                        Botões Rápidos
                                    </Label>
                                </div>
                            </RadioGroup>

                            {/* TEXTO DA PERGUNTA */}
                            <div className="space-y-2">
                                <Label className="text-xs font-semibold">Texto da pergunta</Label>
                                <div className="border rounded-xl p-2 bg-background focus-within:ring-2 focus-within:ring-indigo-500">
                                    <Textarea
                                        placeholder="Digite aqui o texto que acompanha o menu..."
                                        rows={4}
                                        value={formData.menuQuestionText || ''}
                                        onChange={(e) =>
                                            setFormData({ ...formData, menuQuestionText: e.target.value })
                                        }
                                        className="border-0 focus-visible:ring-0 p-1 resize-none"
                                    />
                                    <div className="flex items-center justify-between pt-2 border-t mt-1">
                                        <div className="flex items-center gap-1">
                                            <Button
                                                type="button"
                                                variant="ghost"
                                                size="sm"
                                                className="h-7 w-7 p-0"
                                                onClick={() =>
                                                    setFormData((p) => ({
                                                        ...p,
                                                        menuQuestionText: (p.menuQuestionText || '') + ' **texto** ',
                                                    }))
                                                }
                                                title="Negrito"
                                            >
                                                <Bold className="h-3.5 w-3.5" />
                                            </Button>
                                            <Button
                                                type="button"
                                                variant="ghost"
                                                size="sm"
                                                className="h-7 w-7 p-0"
                                                onClick={() =>
                                                    setFormData((p) => ({
                                                        ...p,
                                                        menuQuestionText: (p.menuQuestionText || '') + ' _texto_ ',
                                                    }))
                                                }
                                                title="Itálico"
                                            >
                                                <Italic className="h-3.5 w-3.5" />
                                            </Button>
                                            <Button
                                                type="button"
                                                variant="ghost"
                                                size="sm"
                                                className="h-7 w-7 p-0"
                                                onClick={() =>
                                                    setFormData((p) => ({
                                                        ...p,
                                                        menuQuestionText: (p.menuQuestionText || '') + ' ~texto~ ',
                                                    }))
                                                }
                                                title="Tachado"
                                            >
                                                <Strikethrough className="h-3.5 w-3.5" />
                                            </Button>
                                            <Button
                                                type="button"
                                                variant="ghost"
                                                size="sm"
                                                className="h-7 px-2 text-xs font-mono"
                                                onClick={() => handleInsertVariable('menuQuestionText', 'nome')}
                                                title="Inserir variável {nome}"
                                            >
                                                {'{ }'}
                                            </Button>
                                        </div>
                                    </div>
                                    <div className="space-y-2 pt-2 border-t mt-1.5 max-h-36 overflow-y-auto pr-1">
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
                                                            className="text-[10px] px-1.5 py-0.5 rounded bg-muted hover:bg-muted/80 text-muted-foreground hover:text-foreground transition-colors cursor-pointer font-mono"
                                                            title={v.desc}
                                                        >
                                                            +{v.label}
                                                        </button>
                                                    ))}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>

                            {/* TÍTULO DO BOTÃO DE LISTA */}
                            {formData.menuType !== 'numeric' && (
                                <div className="space-y-2">
                                    <Label className="text-xs font-semibold">Título do botão</Label>
                                    <div className="relative">
                                        <Input
                                            placeholder="Ex: VER OPÇÕES"
                                            value={formData.menuButtonTitle || ''}
                                            onChange={(e) =>
                                                setFormData({ ...formData, menuButtonTitle: e.target.value })
                                            }
                                        />
                                    </div>
                                </div>
                            )}

                            {/* SEÇÃO RESPOSTAS / ITENS DO MENU */}
                            <div className="space-y-3 pt-2">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <div className="h-px bg-slate-200 dark:bg-slate-800 flex-1 w-12" />
                                        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                                            Respostas
                                        </span>
                                        <div className="h-px bg-slate-200 dark:bg-slate-800 flex-1 w-12" />
                                    </div>
                                    <Badge variant="outline" className="text-[11px]">
                                        {normalizeMenuOptions(formData.menuOptions).length} opção(ões)
                                    </Badge>
                                </div>

                                <div className="space-y-2.5">
                                    {normalizeMenuOptions(formData.menuOptions).map((opt, idx) => {
                                        const isDragging = draggedOptionIndex === idx;
                                        const isDragOver = dragOverIndex === idx && draggedOptionIndex !== idx;

                                        return (
                                            <div
                                                key={opt.id || `opt_${idx}`}
                                                draggable
                                                onDragStart={(e) => handleDragStart(e, idx)}
                                                onDragOver={(e) => handleDragOver(e, idx)}
                                                onDragLeave={() => handleDragLeave(idx)}
                                                onDrop={(e) => handleDrop(e, idx)}
                                                onDragEnd={handleDragEnd}
                                                className={`p-3 rounded-xl border transition-all duration-150 relative group overflow-hidden ${
                                                    isDragging
                                                        ? 'opacity-40 border-dashed border-indigo-400 bg-indigo-50/20 dark:bg-indigo-950/20 scale-[0.98]'
                                                        : isDragOver
                                                        ? 'border-2 border-indigo-500 bg-indigo-50/70 dark:bg-indigo-950/50 shadow-md scale-[1.01]'
                                                        : 'bg-slate-50/50 dark:bg-slate-900/40 hover:border-slate-300 dark:hover:border-slate-700'
                                                }`}
                                            >
                                                <div className="flex items-start gap-2.5">
                                                    {/* Ícone de arrastar para mudar a ordem */}
                                                    <div
                                                        className="cursor-grab active:cursor-grabbing p-1 mt-1 text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 rounded transition-colors shrink-0"
                                                        title="Clique e arraste para mudar a ordem"
                                                    >
                                                        <GripVertical className="h-4 w-4" />
                                                    </div>

                                                    <Badge className="bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300 text-[10px] h-5 px-1.5 mt-1.5 shrink-0 select-none font-mono">
                                                        #{idx + 1}
                                                    </Badge>

                                                    <div className="flex-1 min-w-0 space-y-1.5">
                                                        <Input
                                                            placeholder="Título da opção (Ex: Suporte, Vendas...)"
                                                            value={opt.label}
                                                            draggable={false}
                                                            onDragStart={(e) => e.stopPropagation()}
                                                            onChange={(e) =>
                                                                handleUpdateMenuOption(idx, 'label', e.target.value)
                                                            }
                                                            className="bg-white dark:bg-slate-950 font-medium text-xs h-8 w-full shadow-2xs"
                                                        />

                                                        <Input
                                                            placeholder="Descrição (opcional, aparece embaixo no menu lista)"
                                                            value={opt.description || ''}
                                                            draggable={false}
                                                            onDragStart={(e) => e.stopPropagation()}
                                                            onChange={(e) =>
                                                                handleUpdateMenuOption(idx, 'description', e.target.value)
                                                            }
                                                            className="bg-white dark:bg-slate-950 text-xs h-7 text-muted-foreground w-full shadow-2xs"
                                                        />
                                                    </div>

                                                    <Button
                                                        type="button"
                                                        variant="ghost"
                                                        size="icon"
                                                        onClick={() => handleRemoveMenuOption(idx)}
                                                        className="text-destructive h-8 w-8 hover:bg-destructive/10 shrink-0 mt-0.5"
                                                        title="Excluir resposta"
                                                    >
                                                        <Trash2 className="h-4 w-4" />
                                                    </Button>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>

                                <Button
                                    type="button"
                                    variant="outline"
                                    onClick={handleAddMenuOption}
                                    className="w-full border-dashed border-2 border-indigo-200 dark:border-indigo-900 text-indigo-700 dark:text-indigo-400 hover:bg-indigo-50/60 dark:hover:bg-indigo-950/30 gap-1.5 py-5"
                                >
                                    <Plus className="h-4 w-4" />
                                    Adicionar nova resposta
                                </Button>
                            </div>
                        </div>
                    )}

                    {/* ---------------- 2. CONFIGURAÇÃO DE CONTEÚDO ---------------- */}
                    {formData.nodeType === 'content' && (
                        <div className="space-y-4">
                            <div className="space-y-1.5">
                                <Label className="text-xs font-semibold">Tipo de Conteúdo</Label>
                                <Select
                                    value={formData.contentType || 'text'}
                                    onValueChange={(val: any) => setFormData({ ...formData, contentType: val })}
                                >
                                    <SelectTrigger>
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
                                    />
                                </div>
                            )}

                            <div className="space-y-2">
                                <Label className="text-xs font-semibold">
                                    {formData.contentType && formData.contentType !== 'text'
                                        ? 'Legenda da Mídia (Opcional)'
                                        : 'Mensagem de Texto'}
                                </Label>
                                <Textarea
                                    placeholder="Escreva a mensagem que será enviada pelo WhatsApp..."
                                    rows={5}
                                    value={formData.text || ''}
                                    onChange={(e) => setFormData({ ...formData, text: e.target.value })}
                                />
                                <div className="space-y-1.5 pt-1">
                                    <span className="text-[10px] text-muted-foreground font-semibold flex items-center gap-1">
                                        <Sparkles className="h-3 w-3 text-indigo-500" />
                                        Variáveis disponíveis (substituídas automaticamente com os dados do cliente):
                                    </span>
                                    <div className="space-y-2 max-h-48 overflow-y-auto p-2 bg-slate-50 dark:bg-slate-900/40 rounded-xl border border-slate-200/80 dark:border-slate-800">
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
                                                            className="text-[11px] h-6 px-2 bg-background hover:bg-indigo-50 dark:hover:bg-indigo-950/40 hover:text-indigo-600 border-slate-200 dark:border-slate-800 transition-colors shadow-2xs font-mono"
                                                            onClick={() => handleInsertVariable('text', v.key)}
                                                            title={v.desc}
                                                        >
                                                            + {v.label}
                                                        </Button>
                                                    ))}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* ---------------- 3. CONFIGURAÇÃO DE ATRASO INTELIGENTE ---------------- */}
                    {formData.nodeType === 'delay' && (
                        <div className="space-y-4">
                            <div className="space-y-1.5">
                                <Label className="text-xs font-semibold">Tempo de Atraso</Label>
                                <div className="grid grid-cols-2 gap-2">
                                    <div>
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
                                            placeholder="Tempo..."
                                        />
                                    </div>
                                    <div>
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
                                                        ? (formData.delayUnit === 'hours'
                                                              ? Math.round(formData.delaySeconds / 3600)
                                                              : formData.delayUnit === 'minutes'
                                                              ? Math.round(formData.delaySeconds / 60)
                                                              : formData.delaySeconds)
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
                                            <SelectTrigger>
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="seconds">⏱️ Segundos</SelectItem>
                                                <SelectItem value="hours">🕒 Horas</SelectItem>
                                                <SelectItem value="minutes">⏳ Minutos</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                </div>
                                <p className="text-xs text-muted-foreground">
                                    {(formData.delayUnit || 'seconds') === 'hours'
                                        ? `O bot vai aguardar ${formData.delayValue || (formData.delaySeconds ? Math.round(formData.delaySeconds / 3600) : 1)} hora(s) antes de enviar o próximo bloco.`
                                        : (formData.delayUnit || 'seconds') === 'minutes'
                                        ? `O bot vai aguardar ${formData.delayValue || (formData.delaySeconds ? Math.round(formData.delaySeconds / 60) : 1)} minuto(s) antes de enviar o próximo bloco.`
                                        : `Tempo que o bot vai esperar antes de enviar o próximo bloco (${formData.delayValue || formData.delaySeconds || 3} segundo(s)).`}
                                </p>
                            </div>

                            <div className="space-y-1.5">
                                <Label className="text-xs font-semibold">Simulação de Presença no WhatsApp</Label>
                                <Select
                                    value={formData.delayPresence || 'composing'}
                                    onValueChange={(val: any) =>
                                        setFormData({ ...formData, delayPresence: val })
                                    }
                                >
                                    <SelectTrigger>
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="composing">Digitando...</SelectItem>
                                        <SelectItem value="recording">Gravando áudio...</SelectItem>
                                        <SelectItem value="none">Nenhuma presença</SelectItem>
                                    </SelectContent>
                                </Select>
                                <p className="text-xs text-muted-foreground">
                                    Exibe a mensagem &quot;digitando...&quot; no topo da conversa durante a espera.
                                </p>
                            </div>
                        </div>
                    )}

                    {/* ---------------- 4. CONFIGURAÇÃO DE AÇÃO ---------------- */}
                    {formData.nodeType === 'action' && (
                        <div className="space-y-4">
                            <div className="space-y-1.5">
                                <Label className="text-xs font-semibold">Tipo de Ação</Label>
                                <Select
                                    value={formData.actionType || 'open_support'}
                                    onValueChange={(val: any) => setFormData({ ...formData, actionType: val })}
                                >
                                    <SelectTrigger>
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="send_contact">
                                            👤 Enviar Card de Contato (WhatsApp vCard)
                                        </SelectItem>
                                        <SelectItem value="open_support">
                                            🎧 Transferir para Atendimento Humano / Suporte
                                        </SelectItem>
                                        <SelectItem value="add_tag">
                                            🏷️ Adicionar Tag / Etiqueta
                                        </SelectItem>
                                        <SelectItem value="notify_attendant">
                                            🔔 Notificar Atendente Responsável
                                        </SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>

                            {/* Se for Enviar Card de Contato */}
                            {formData.actionType === 'send_contact' ? (
                                <div className="space-y-3.5 p-3.5 bg-slate-50 dark:bg-slate-900/60 rounded-xl border border-slate-200 dark:border-slate-800">
                                    <div className="flex items-center gap-2 text-xs font-semibold text-indigo-600 dark:text-indigo-400">
                                        <UserCheck className="h-4 w-4" />
                                        <span>Dados do Card de Contato (WhatsApp)</span>
                                    </div>

                                    <div className="space-y-1.5">
                                        <Label className="text-xs font-medium">Nome da Pessoa / Contato</Label>
                                        <Input
                                            placeholder="Ex: Pedro Suporte / Atendimento VIP"
                                            value={formData.contactCardName || ''}
                                            onChange={(e) => setFormData({ ...formData, contactCardName: e.target.value })}
                                        />
                                        <p className="text-[11px] text-muted-foreground">
                                            Nome que aparecerá no cartão de contato no WhatsApp. Aceita variáveis como {'{nome}'}.
                                        </p>
                                    </div>

                                    <div className="space-y-1.5">
                                        <Label className="text-xs font-medium">Número do WhatsApp</Label>
                                        <Input
                                            placeholder="Ex: 5511999999999"
                                            value={formData.contactCardPhone || ''}
                                            onChange={(e) => setFormData({ ...formData, contactCardPhone: e.target.value })}
                                        />
                                        <p className="text-[11px] text-muted-foreground">
                                            Número com código do país e DDD (somente dígitos). Aceita variáveis como {'{telefone}'}.
                                        </p>
                                    </div>

                                    <div className="space-y-1.5">
                                        <Label className="text-xs font-medium">Empresa / Organização (Opcional)</Label>
                                        <Input
                                            placeholder="Ex: PJ CRM Suporte"
                                            value={formData.contactCardOrganization || ''}
                                            onChange={(e) => setFormData({ ...formData, contactCardOrganization: e.target.value })}
                                        />
                                    </div>

                                    <div className="space-y-1.5">
                                        <Label className="text-xs font-medium">Mensagem Adicional (Opcional)</Label>
                                        <Input
                                            placeholder="Ex: Segue o contato do nosso suporte oficial:"
                                            value={formData.text || ''}
                                            onChange={(e) => setFormData({ ...formData, text: e.target.value })}
                                        />
                                        <p className="text-[11px] text-muted-foreground">
                                            Se preenchido, esta mensagem é enviada junto com o cartão de contato.
                                        </p>
                                    </div>

                                    <div className="p-2.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-[11px] text-emerald-800 dark:text-emerald-300 leading-relaxed">
                                        💡 <strong>API UazAPI Nativa:</strong> Envia um cartão de contato nativo (vCard) do WhatsApp. O cliente recebe um botão direto para <em>Conversar</em> ou <em>Salvar Contato</em> na agenda do telefone com apenas 1 clique.
                                    </div>
                                </div>
                            ) : (
                                <div className="space-y-1.5">
                                    <Label className="text-xs font-semibold">Mensagem de Notificação / Valor</Label>
                                    <Input
                                        placeholder="Ex: Cliente solicitou suporte no WhatsApp"
                                        value={formData.text || ''}
                                        onChange={(e) => setFormData({ ...formData, text: e.target.value })}
                                    />
                                </div>
                            )}
                        </div>
                    )}

                    {/* ---------------- 5. CONFIGURAÇÃO DE CONEXÃO DE FLUXO ---------------- */}
                    {formData.nodeType === 'flow_connect' && (
                        <div className="space-y-4">
                            <div className="space-y-1.5">
                                <Label className="text-xs font-semibold">Conectar a Outro Fluxo</Label>
                                <Select
                                    value={formData.targetFlowId || undefined}
                                    onValueChange={(val) => setFormData({ ...formData, targetFlowId: val })}
                                >
                                    <SelectTrigger>
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
                                <p className="text-xs text-muted-foreground">
                                    Quando o cliente alcançar esse nó, a conversa continuará a partir do início do outro fluxo.
                                </p>
                            </div>
                        </div>
                    )}

                    {/* ---------------- 6. CONFIGURAÇÃO DE CONDIÇÃO: CLIENTE CRM ---------------- */}
                    {formData.nodeType === 'condition' && (
                        <div className="space-y-4">
                            <div className="p-3.5 rounded-xl border border-sky-200 dark:border-sky-900 bg-sky-50/50 dark:bg-sky-950/20 space-y-2">
                                <div className="flex items-center gap-2">
                                    <div className="p-1.5 rounded-md bg-sky-100 dark:bg-sky-900 text-sky-600 dark:text-sky-300">
                                        <UserCheck className="h-4 w-4" />
                                    </div>
                                    <h4 className="text-xs font-bold text-sky-900 dark:text-sky-200">
                                        Verificação Inteligente de Cliente no CRM
                                    </h4>
                                </div>
                                <p className="text-[11.5px] text-sky-800/90 dark:text-sky-300/90 leading-relaxed">
                                    Quando a pessoa manda mensagem pelo WhatsApp, este bloco consulta instantaneamente o número no seu CRM. O fluxo se divide em 2 saídas automáticas:
                                </p>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                {/* Saída 1 */}
                                <div className="p-3 rounded-xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50/40 dark:bg-emerald-950/20 space-y-1.5">
                                    <div className="flex items-center gap-1.5 font-bold text-xs text-emerald-700 dark:text-emerald-300">
                                        <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                                        <span>Saída: Cliente Cadastrado</span>
                                    </div>
                                    <p className="text-[11px] text-emerald-900/80 dark:text-emerald-200/80 leading-relaxed">
                                        Acionada quando o número já existe no seu CRM. Libera todas as variáveis de cliente para uso em mensagens e menus.
                                    </p>
                                </div>

                                {/* Saída 2 */}
                                <div className="p-3 rounded-xl border border-rose-200 dark:border-rose-800 bg-rose-50/40 dark:bg-rose-950/20 space-y-1.5">
                                    <div className="flex items-center gap-1.5 font-bold text-xs text-rose-700 dark:text-rose-300">
                                        <UserX className="h-4 w-4 text-rose-600 shrink-0" />
                                        <span>Saída: Não Cadastrado</span>
                                    </div>
                                    <p className="text-[11px] text-rose-900/80 dark:text-rose-200/80 leading-relaxed">
                                        Acionada quando o contato não é encontrado no CRM. Conecte no funil de apresentação, tabela de planos ou vendas.
                                    </p>
                                </div>
                            </div>

                            {/* Guia de Variáveis disponíveis separadas por grupos */}
                            <div className="p-3.5 rounded-xl border bg-muted/20 space-y-3.5">
                                <div className="space-y-1">
                                    <span className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                                        <Sparkles className="h-3.5 w-3.5 text-indigo-500" />
                                        Variáveis disponíveis na saída &quot;Cliente Cadastrado&quot; (Separadas por Grupos):
                                    </span>
                                    <p className="text-[11px] text-muted-foreground">
                                        Nos blocos de mensagem ou menu conectados a esta saída, você pode utilizar qualquer uma das variáveis abaixo. Elas serão substituídas automaticamente pelos dados cadastrados do cliente no CRM:
                                    </p>
                                </div>

                                <div className="space-y-3.5 max-h-[380px] overflow-y-auto pr-1">
                                    {FLOW_VARIABLE_GROUPS.map((group) => {
                                        const GroupIcon = group.icon;
                                        return (
                                            <div key={group.id} className="space-y-1.5 p-2.5 rounded-lg bg-background/60 border border-slate-200/60 dark:border-slate-800">
                                                <div className="flex items-center justify-between pb-1 border-b border-border/50">
                                                    <span className={`text-[11px] font-bold flex items-center gap-1.5 ${group.colorClass}`}>
                                                        <GroupIcon className="h-3.5 w-3.5" />
                                                        {group.title}
                                                    </span>
                                                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${group.badgeClass}`}>
                                                        {group.variables.length} variáveis
                                                    </span>
                                                </div>

                                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 pt-1 text-[11px]">
                                                    {group.variables.map((v) => (
                                                        <div
                                                            key={v.key}
                                                            className="p-1.5 px-2.5 rounded-lg bg-background border flex items-center justify-between font-mono shadow-2xs hover:border-indigo-300 dark:hover:border-indigo-700 transition-colors"
                                                        >
                                                            <span className="font-semibold text-indigo-600 dark:text-indigo-400">
                                                                {v.label}
                                                            </span>
                                                            <span
                                                                className="text-[10px] text-muted-foreground font-sans truncate ml-2 text-right"
                                                                title={v.desc}
                                                            >
                                                                {v.desc}
                                                            </span>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                <DialogFooter className="border-t pt-3 flex flex-row items-center justify-between sm:justify-between w-full">
                    <div className="flex items-center gap-2">
                        {formData.nodeType === 'menu' && (
                            <Button
                                type="button"
                                variant="outline"
                                onClick={() => setIsPreviewOpen(true)}
                                className="gap-1.5 text-xs text-emerald-700 dark:text-emerald-400 border-emerald-300 dark:border-emerald-800 hover:bg-emerald-50 dark:hover:bg-emerald-950/40"
                            >
                                <Eye className="h-3.5 w-3.5" />
                                Pré-visualizar
                            </Button>
                        )}
                        {onDelete && node && (
                            <Button
                                type="button"
                                variant="ghost"
                                onClick={() => {
                                    onDelete(node.id);
                                    onOpenChange(false);
                                }}
                                className="gap-1.5 text-xs text-rose-600 hover:text-rose-700 hover:bg-rose-50 dark:hover:bg-rose-950/40"
                            >
                                <Trash2 className="h-3.5 w-3.5" />
                                Excluir Bloco
                            </Button>
                        )}
                    </div>

                    <div className="flex items-center gap-2">
                        <Button variant="outline" onClick={() => onOpenChange(false)}>
                            Cancelar
                        </Button>
                        <Button onClick={handleSave} className="bg-indigo-600 hover:bg-indigo-700 text-white">
                            Salvar Bloco
                        </Button>
                    </div>
                </DialogFooter>
            </DialogContent>
        </Dialog>

        {/* MODAL DE PRÉ-VISUALIZAÇÃO NO WHATSAPP (FORA DO DIALOG PRINCIPAL) */}
        <WhatsAppMenuPreviewDialog
            open={isPreviewOpen}
            onOpenChange={setIsPreviewOpen}
            data={formData}
        />
    </>
    );
}
