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
} from 'lucide-react';
import { WhatsAppMenuPreviewDialog } from '@/components/flows/WhatsAppMenuPreviewDialog';
import type { FlowNodeData, FlowDefinition } from '@/lib/types';

interface NodeConfigDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    node: any | null;
    flowsList?: FlowDefinition[];
    onSave: (nodeId: string, updatedData: FlowNodeData) => void;
}

export function NodeConfigDialog({
    open,
    onOpenChange,
    node,
    flowsList = [],
    onSave,
}: NodeConfigDialogProps) {
    const [formData, setFormData] = useState<FlowNodeData>({
        nodeType: 'content',
    });
    const [isPreviewOpen, setIsPreviewOpen] = useState(false);

    useEffect(() => {
        if (node?.data) {
            setFormData({
                ...node.data,
                menuOptions: node.data.menuOptions ? [...node.data.menuOptions] : [],
            });
        }
    }, [node]);

    if (!node) return null;

    const handleInsertVariable = (field: 'text' | 'menuQuestionText' | 'menuButtonTitle', variable: string) => {
        setFormData((prev) => ({
            ...prev,
            [field]: (prev[field] || '') + ` {${variable}} `,
        }));
    };

    const handleAddMenuOption = () => {
        const newId = 'opt_' + Date.now();
        const currentOptions = formData.menuOptions || [];
        setFormData((prev) => ({
            ...prev,
            menuOptions: [
                ...currentOptions,
                { id: newId, label: `Opção ${currentOptions.length + 1}`, description: '' },
            ],
        }));
    };

    const handleUpdateMenuOption = (index: number, key: 'label' | 'description', value: string) => {
        const updated = [...(formData.menuOptions || [])];
        if (updated[index]) {
            updated[index] = { ...updated[index], [key]: value };
            setFormData((prev) => ({ ...prev, menuOptions: updated }));
        }
    };

    const handleRemoveMenuOption = (index: number) => {
        const updated = [...(formData.menuOptions || [])];
        updated.splice(index, 1);
        setFormData((prev) => ({ ...prev, menuOptions: updated }));
    };

    // Arrastar e soltar para mudar a ordem das respostas do menu
    const [draggedOptionIndex, setDraggedOptionIndex] = useState<number | null>(null);
    const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

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

        const currentOptions = [...(formData.menuOptions || [])];
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
        onSave(node.id, formData);
        onOpenChange(false);
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
                <DialogHeader className="border-b pb-3">
                    <DialogTitle className="flex items-center gap-2 text-lg">
                        {formData.nodeType === 'menu' && <Grid className="h-5 w-5 text-indigo-600" />}
                        {formData.nodeType === 'content' && <Star className="h-5 w-5 text-rose-500" />}
                        {formData.nodeType === 'delay' && <Clock className="h-5 w-5 text-orange-500" />}
                        {formData.nodeType === 'action' && <Zap className="h-5 w-5 text-amber-500" />}
                        {formData.nodeType === 'flow_connect' && <Rocket className="h-5 w-5 text-emerald-500" />}
                        <span>
                            {formData.nodeType === 'menu' && 'Menu'}
                            {formData.nodeType === 'content' && 'Conteúdo'}
                            {formData.nodeType === 'delay' && 'Atraso Inteligente'}
                            {formData.nodeType === 'action' && 'Ação'}
                            {formData.nodeType === 'flow_connect' && 'Conexão de Fluxo'}
                        </span>
                    </DialogTitle>
                </DialogHeader>

                <div className="space-y-5 py-3">
                    {/* NOME / RÓTULO DO BLOCO */}
                    <div className="space-y-1.5">
                        <Label className="text-xs font-semibold">Identificação do Bloco</Label>
                        <Input
                            placeholder="Ex: Menu Principal, Boas-vindas..."
                            value={formData.label || ''}
                            onChange={(e) => setFormData({ ...formData, label: e.target.value })}
                        />
                    </div>

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
                                        {formData.menuOptions?.length || 0} opção(ões)
                                    </Badge>
                                </div>

                                <div className="space-y-2.5">
                                    {(formData.menuOptions || []).map((opt, idx) => {
                                        const isDragging = draggedOptionIndex === idx;
                                        const isDragOver = dragOverIndex === idx && draggedOptionIndex !== idx;

                                        return (
                                            <div
                                                key={opt.id || idx}
                                                draggable
                                                onDragStart={(e) => handleDragStart(e, idx)}
                                                onDragOver={(e) => handleDragOver(e, idx)}
                                                onDragLeave={() => handleDragLeave(idx)}
                                                onDrop={(e) => handleDrop(e, idx)}
                                                onDragEnd={handleDragEnd}
                                                className={`p-3 rounded-xl border transition-all duration-150 space-y-2 relative group ${
                                                    isDragging
                                                        ? 'opacity-40 border-dashed border-indigo-400 bg-indigo-50/20 dark:bg-indigo-950/20 scale-[0.98]'
                                                        : isDragOver
                                                        ? 'border-2 border-indigo-500 bg-indigo-50/70 dark:bg-indigo-950/50 shadow-md scale-[1.01]'
                                                        : 'bg-slate-50/50 dark:bg-slate-900/40 hover:border-slate-300 dark:hover:border-slate-700'
                                                }`}
                                            >
                                                <div className="flex items-center gap-2">
                                                    {/* Ícone de arrastar para mudar a ordem */}
                                                    <div
                                                        className="cursor-grab active:cursor-grabbing p-0.5 text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 rounded transition-colors shrink-0"
                                                        title="Clique e arraste para mudar a ordem"
                                                    >
                                                        <GripVertical className="h-4 w-4" />
                                                    </div>

                                                    <Badge className="bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300 text-[10px] h-5 px-1.5 shrink-0 select-none">
                                                        #{idx + 1}
                                                    </Badge>

                                                    <Input
                                                        placeholder="Título da opção (Ex: Renovar Assinatura)"
                                                        value={opt.label}
                                                        draggable={false}
                                                        onDragStart={(e) => e.stopPropagation()}
                                                        onChange={(e) =>
                                                            handleUpdateMenuOption(idx, 'label', e.target.value)
                                                        }
                                                        className="bg-white dark:bg-slate-950 font-medium text-xs h-8"
                                                    />

                                                    <Button
                                                        type="button"
                                                        variant="ghost"
                                                        size="icon"
                                                        onClick={() => handleRemoveMenuOption(idx)}
                                                        className="text-destructive h-8 w-8 hover:bg-destructive/10 shrink-0"
                                                        title="Excluir resposta"
                                                    >
                                                        <Trash2 className="h-4 w-4" />
                                                    </Button>
                                                </div>

                                                <Input
                                                    placeholder="Descrição (opcional, aparece embaixo no menu lista)"
                                                    value={opt.description || ''}
                                                    draggable={false}
                                                    onDragStart={(e) => e.stopPropagation()}
                                                    onChange={(e) =>
                                                        handleUpdateMenuOption(idx, 'description', e.target.value)
                                                    }
                                                    className="bg-white dark:bg-slate-950 text-xs h-7 text-muted-foreground ml-6"
                                                />
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
                                <div className="flex gap-2 pt-1">
                                    <Button
                                        type="button"
                                        variant="outline"
                                        size="sm"
                                        className="text-xs h-7"
                                        onClick={() => handleInsertVariable('text', 'nome')}
                                    >
                                        + {'{nome}'}
                                    </Button>
                                    <Button
                                        type="button"
                                        variant="outline"
                                        size="sm"
                                        className="text-xs h-7"
                                        onClick={() => handleInsertVariable('text', 'telefone')}
                                    >
                                        + {'{telefone}'}
                                    </Button>
                                    <Button
                                        type="button"
                                        variant="outline"
                                        size="sm"
                                        className="text-xs h-7"
                                        onClick={() => handleInsertVariable('text', 'vencimento')}
                                    >
                                        + {'{vencimento}'}
                                    </Button>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* ---------------- 3. CONFIGURAÇÃO DE ATRASO INTELIGENTE ---------------- */}
                    {formData.nodeType === 'delay' && (
                        <div className="space-y-4">
                            <div className="space-y-1.5">
                                <Label className="text-xs font-semibold">Tempo de Atraso (em segundos)</Label>
                                <Input
                                    type="number"
                                    min={1}
                                    max={60}
                                    value={formData.delaySeconds || 3}
                                    onChange={(e) =>
                                        setFormData({ ...formData, delaySeconds: parseInt(e.target.value) || 1 })
                                    }
                                />
                                <p className="text-xs text-muted-foreground">
                                    Tempo que o bot vai esperar antes de enviar o próximo bloco.
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
                                        <SelectItem value="open_support">
                                            Transferir para Atendimento Humano / Suporte
                                        </SelectItem>
                                        <SelectItem value="add_tag">Adicionar Tag / Etiqueta</SelectItem>
                                        <SelectItem value="notify_attendant">
                                            Notificar Atendente Responsável
                                        </SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>

                            <div className="space-y-1.5">
                                <Label className="text-xs font-semibold">Mensagem de Notificação / Valor</Label>
                                <Input
                                    placeholder="Ex: Cliente solicitou suporte no WhatsApp"
                                    value={formData.text || ''}
                                    onChange={(e) => setFormData({ ...formData, text: e.target.value })}
                                />
                            </div>
                        </div>
                    )}

                    {/* ---------------- 5. CONFIGURAÇÃO DE CONEXÃO DE FLUXO ---------------- */}
                    {formData.nodeType === 'flow_connect' && (
                        <div className="space-y-4">
                            <div className="space-y-1.5">
                                <Label className="text-xs font-semibold">Conectar a Outro Fluxo</Label>
                                <Select
                                    value={formData.targetFlowId || ''}
                                    onValueChange={(val) => setFormData({ ...formData, targetFlowId: val })}
                                >
                                    <SelectTrigger>
                                        <SelectValue placeholder="Selecione o fluxo de destino..." />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {flowsList.map((f) => (
                                            <SelectItem key={f.id} value={f.id}>
                                                {f.name}
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
                </div>

                <DialogFooter className="border-t pt-3 flex flex-row items-center justify-between sm:justify-between w-full">
                    {formData.nodeType === 'menu' ? (
                        <Button
                            type="button"
                            variant="outline"
                            onClick={() => setIsPreviewOpen(true)}
                            className="gap-1.5 text-xs text-emerald-700 dark:text-emerald-400 border-emerald-300 dark:border-emerald-800 hover:bg-emerald-50 dark:hover:bg-emerald-950/40"
                        >
                            <Eye className="h-3.5 w-3.5" />
                            Pré-visualizar
                        </Button>
                    ) : (
                        <div />
                    )}

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

            {/* MODAL DE PRÉ-VISUALIZAÇÃO NO WHATSAPP */}
            <WhatsAppMenuPreviewDialog
                open={isPreviewOpen}
                onOpenChange={setIsPreviewOpen}
                data={formData}
            />
        </Dialog>
    );
}
