'use client';

import React, { useState, useEffect } from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { Button } from '@/components/ui/button';
import {
    Smartphone,
    ListFilter,
    Check,
    ArrowLeft,
    Phone,
    Video,
    MoreVertical,
    Paperclip,
    Mic,
    Smile,
    Camera,
    Sparkles,
    X,
} from 'lucide-react';

export interface WhatsAppMenuPreviewDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    data: {
        label?: string;
        menuType?: 'list' | 'numeric' | 'button';
        menuQuestionText?: string;
        menuButtonTitle?: string;
        menuOptions?: Array<{
            id?: string;
            label: string;
            description?: string;
        }>;
    };
}

/**
 * Formata texto com suporte a marcações simples do WhatsApp (*negrito*, _itálico_, ~tachado~)
 */
function formatWhatsAppText(text?: string) {
    if (!text) return 'Selecione uma das opções abaixo:';

    const lines = text.split('\n');
    return lines.map((line, lineIdx) => {
        const parts = line.split(/(\*[^*]+\*|_[^_]+_|~[^~]+~)/g);

        return (
            <React.Fragment key={lineIdx}>
                {parts.map((part, partIdx) => {
                    if ((part.startsWith('**') && part.endsWith('**')) || (part.startsWith('*') && part.endsWith('*'))) {
                        const clean = part.replace(/^\*+|\*+$/g, '');
                        return <strong key={partIdx} className="font-bold">{clean}</strong>;
                    }
                    if (part.startsWith('_') && part.endsWith('_')) {
                        const clean = part.replace(/^_+|_+$/g, '');
                        return <em key={partIdx} className="italic">{clean}</em>;
                    }
                    if (part.startsWith('~') && part.endsWith('~')) {
                        const clean = part.replace(/^~+|~+$/g, '');
                        return <span key={partIdx} className="line-through">{clean}</span>;
                    }
                    return <span key={partIdx}>{part}</span>;
                })}
                {lineIdx < lines.length - 1 && <br />}
            </React.Fragment>
        );
    });
}

export function WhatsAppMenuPreviewDialog({
    open,
    onOpenChange,
    data,
}: WhatsAppMenuPreviewDialogProps) {
    const [selectedType, setSelectedType] = useState<'list' | 'numeric' | 'button'>('list');
    const [isListExpanded, setIsListExpanded] = useState(true);
    const [selectedOptionId, setSelectedOptionId] = useState<string | null>(null);

    // Sincroniza tipo de menu quando data mudar
    useEffect(() => {
        if (data?.menuType) {
            setSelectedType(data.menuType);
        }
    }, [data?.menuType, open]);

    const rawOptions = data?.menuOptions;
    let normalizedOptions: Array<{ id: string; label: string; description?: string }> = [];
    if (Array.isArray(rawOptions)) {
        normalizedOptions = rawOptions.filter(Boolean).map((opt: any, idx: number) => {
            if (typeof opt === 'string') return { id: String(idx + 1), label: opt, description: '' };
            return {
                id: String(opt.id || idx + 1),
                label: String(opt.label || opt.text || opt.title || `Opção ${idx + 1}`),
                description: opt.description ? String(opt.description) : '',
            };
        });
    } else if (typeof rawOptions === 'object' && rawOptions !== null) {
        normalizedOptions = Object.values(rawOptions).filter(Boolean).map((opt: any, idx: number) => {
            if (typeof opt === 'string') return { id: String(idx + 1), label: opt, description: '' };
            return {
                id: String(opt.id || idx + 1),
                label: String(opt.label || opt.text || opt.title || `Opção ${idx + 1}`),
                description: opt.description ? String(opt.description) : '',
            };
        });
    }

    const options = normalizedOptions.length > 0
        ? normalizedOptions
        : [
              { id: '1', label: 'Opção 1', description: 'Detalhes da primeira opção' },
              { id: '2', label: 'Opção 2', description: 'Detalhes da segunda opção' },
              { id: '3', label: 'Opção 3', description: 'Detalhes da terceira opção' },
          ];

    const buttonTitle = data?.menuButtonTitle || 'VER OPÇÕES';
    const questionText = data?.menuQuestionText || 'Olá! Por favor, selecione uma das opções abaixo:';

    return (
        <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
            <DialogPrimitive.Portal>
                {/* BACKDROP / OVERLAY */}
                <DialogPrimitive.Overlay
                    className="fixed inset-0 z-[110] bg-black/60 backdrop-blur-xs data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0"
                />

                {/* CONTEÚDO DO MODAL */}
                <DialogPrimitive.Content
                    className="fixed left-1/2 top-1/2 z-[111] w-[95vw] max-w-md -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-2xl border bg-card shadow-2xl duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 flex flex-col focus:outline-none"
                >
                    <DialogPrimitive.Title className="sr-only">
                        Pré-visualização no WhatsApp
                    </DialogPrimitive.Title>
                    <DialogPrimitive.Description className="sr-only">
                        Veja e teste como o cliente receberá e interagirá com o menu no WhatsApp.
                    </DialogPrimitive.Description>

                    {/* CABEÇALHO DO MODAL */}
                    <div className="p-4 pb-3 border-b bg-muted/20 shrink-0">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <div className="p-1.5 rounded-lg bg-emerald-100 dark:bg-emerald-950 text-emerald-600 dark:text-emerald-400">
                                    <Smartphone className="h-4 w-4" />
                                </div>
                                <div>
                                    <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                                        Pré-visualização no WhatsApp
                                    </h3>
                                    <p className="text-[11px] text-muted-foreground">
                                        Veja e teste como o cliente receberá e interagirá com o menu.
                                    </p>
                                </div>
                            </div>

                            <DialogPrimitive.Close asChild>
                                <button
                                    type="button"
                                    onClick={() => onOpenChange(false)}
                                    className="p-1 rounded-md text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                                    title="Fechar"
                                >
                                    <X className="h-4 w-4" />
                                </button>
                            </DialogPrimitive.Close>
                        </div>

                        {/* SELETOR DE MODO DE VISUALIZAÇÃO */}
                        <div className="flex items-center gap-1.5 pt-2.5">
                            <span className="text-[10px] text-muted-foreground font-semibold mr-1">
                                Modo:
                            </span>
                            <button
                                type="button"
                                onClick={() => setSelectedType('list')}
                                className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-all cursor-pointer ${
                                    selectedType === 'list'
                                        ? 'bg-emerald-600 text-white shadow-xs'
                                        : 'bg-muted hover:bg-muted/80 text-muted-foreground'
                                }`}
                            >
                                Lista
                            </button>
                            <button
                                type="button"
                                onClick={() => setSelectedType('button')}
                                className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-all cursor-pointer ${
                                    selectedType === 'button'
                                        ? 'bg-emerald-600 text-white shadow-xs'
                                        : 'bg-muted hover:bg-muted/80 text-muted-foreground'
                                }`}
                            >
                                Botões
                            </button>
                            <button
                                type="button"
                                onClick={() => setSelectedType('numeric')}
                                className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-all cursor-pointer ${
                                    selectedType === 'numeric'
                                        ? 'bg-emerald-600 text-white shadow-xs'
                                        : 'bg-muted hover:bg-muted/80 text-muted-foreground'
                                }`}
                            >
                                Numérico
                            </button>
                        </div>
                    </div>

                    {/* SIMULADOR DE TELA DO WHATSAPP */}
                    <div className="flex flex-col bg-[#efeae2] dark:bg-[#0b141a] text-slate-800 dark:text-slate-100 min-h-[460px] max-h-[500px]">
                        {/* BARRA SUPERIOR DO CHAT WHATSAPP */}
                        <div className="h-12 bg-[#075e54] dark:bg-[#1f2c34] text-white px-3 flex items-center justify-between shrink-0 shadow-xs">
                            <div className="flex items-center gap-2">
                                <ArrowLeft className="h-4 w-4 cursor-pointer opacity-80 hover:opacity-100" />
                                <div className="w-8 h-8 rounded-full bg-emerald-700 dark:bg-emerald-800 flex items-center justify-center font-bold text-xs shadow-inner">
                                    🤖
                                </div>
                                <div className="leading-tight">
                                    <p className="text-xs font-bold leading-none">Atendimento Virtual</p>
                                    <span className="text-[10px] text-emerald-200 dark:text-emerald-400">
                                        online
                                    </span>
                                </div>
                            </div>

                            <div className="flex items-center gap-3 text-white/80">
                                <Video className="h-4 w-4" />
                                <Phone className="h-3.5 w-3.5" />
                                <MoreVertical className="h-3.5 w-3.5" />
                            </div>
                        </div>

                        {/* ÁREA DE MENSAGENS COM BACKGROUND TÍPICO DO WHATSAPP */}
                        <div className="flex-1 p-3 overflow-y-auto space-y-3 kanban-scroll">
                            {/* TAG DE DATA */}
                            <div className="flex justify-center">
                                <span className="bg-white/80 dark:bg-[#1f2c34]/80 text-[10px] text-muted-foreground px-2.5 py-0.5 rounded-md shadow-xs uppercase tracking-wider font-medium">
                                    Hoje
                                </span>
                            </div>

                            {/* BALÃO DE MENSAGEM DO BOT (ESQUERDA) */}
                            <div className="flex flex-col items-start max-w-[88%] space-y-1 animate-in fade-in-50">
                                {/* BALÃO PRINCIPAL */}
                                <div className="bg-white dark:bg-[#1f2c34] rounded-2xl rounded-tl-xs p-3 shadow-xs border border-slate-200/50 dark:border-slate-800/80 relative text-xs leading-relaxed space-y-2 w-full">
                                    {/* TEXTO DA PERGUNTA */}
                                    <div className="text-slate-800 dark:text-slate-100 whitespace-pre-wrap">
                                        {formatWhatsAppText(questionText)}
                                    </div>

                                    {/* SE FOR MODO NUMÉRICO */}
                                    {selectedType === 'numeric' && (
                                        <div className="pt-2 border-t border-slate-100 dark:border-slate-800/80 space-y-1.5 font-medium">
                                            {options.map((opt, idx) => (
                                                <div
                                                    key={opt.id || idx}
                                                    onClick={() => setSelectedOptionId(opt.id || idx.toString())}
                                                    className={`p-1.5 rounded-lg text-[11.5px] cursor-pointer transition-colors ${
                                                        selectedOptionId === (opt.id || idx.toString())
                                                            ? 'bg-indigo-50 dark:bg-indigo-950/50 text-indigo-700 dark:text-indigo-300'
                                                            : 'hover:bg-slate-50 dark:hover:bg-slate-800/50'
                                                    }`}
                                                >
                                                    <span className="font-bold text-indigo-600 dark:text-indigo-400 mr-1.5">
                                                        {idx + 1}️⃣ {opt.label}
                                                    </span>
                                                    {opt.description && (
                                                        <p className="text-[10px] text-muted-foreground italic pl-5">
                                                            {opt.description}
                                                        </p>
                                                    )}
                                                </div>
                                            ))}
                                            <p className="text-[10px] text-muted-foreground italic pt-1">
                                                👉 Digite o número da opção desejada.
                                            </p>
                                        </div>
                                    )}

                                    {/* HORA E STATUS DO BALÃO */}
                                    <div className="flex items-center justify-end gap-1 text-[9px] text-muted-foreground pt-0.5">
                                        <span>10:42</span>
                                    </div>

                                    {/* SE FOR MODO LISTA: BOTÃO 'VER OPÇÕES' */}
                                    {selectedType === 'list' && (
                                        <div className="pt-1 border-t border-slate-100 dark:border-slate-800">
                                            <button
                                                type="button"
                                                onClick={() => setIsListExpanded(!isListExpanded)}
                                                className="w-full py-1.5 px-2 flex items-center justify-center gap-1.5 text-xs font-bold text-[#00a884] hover:bg-emerald-50/50 dark:hover:bg-emerald-950/30 rounded-lg transition-colors cursor-pointer select-none"
                                            >
                                                <ListFilter className="h-3.5 w-3.5" />
                                                <span>{buttonTitle}</span>
                                            </button>
                                        </div>
                                    )}
                                </div>

                                {/* SE FOR MODO LISTA E ESTIVER EXPANDIDO: SIMULA O BOTTOM SHEET DO WHATSAPP */}
                                {selectedType === 'list' && isListExpanded && (
                                    <div className="w-full bg-white dark:bg-[#1f2c34] rounded-xl shadow-md border border-slate-200/80 dark:border-slate-800 p-2 space-y-1 animate-in fade-in-50 slide-in-from-top-1">
                                        <p className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground px-2 pt-1 pb-1">
                                            Opções disponíveis
                                        </p>
                                        {options.map((opt, idx) => {
                                            const optKey = opt.id || idx.toString();
                                            const isSelected = selectedOptionId === optKey;
                                            return (
                                                <div
                                                    key={optKey}
                                                    onClick={() => setSelectedOptionId(optKey)}
                                                    className={`flex items-center justify-between p-2 rounded-lg transition-colors cursor-pointer border ${
                                                        isSelected
                                                            ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-300 dark:border-emerald-800'
                                                            : 'hover:bg-slate-50 dark:hover:bg-slate-850 border-transparent hover:border-slate-200 dark:hover:border-slate-700'
                                                    }`}
                                                >
                                                    <div className="space-y-0.5 min-w-0 pr-2">
                                                        <p className={`text-xs font-semibold ${isSelected ? 'text-emerald-700 dark:text-emerald-300' : 'text-slate-800 dark:text-slate-100'}`}>
                                                            {opt.label}
                                                        </p>
                                                        {opt.description && (
                                                            <p className="text-[10px] text-muted-foreground truncate">
                                                                {opt.description}
                                                            </p>
                                                        )}
                                                    </div>
                                                    <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 ${
                                                        isSelected
                                                            ? 'border-emerald-600 bg-emerald-600 text-white'
                                                            : 'border-slate-300 dark:border-slate-600'
                                                    }`}>
                                                        {isSelected && <Check className="h-2.5 w-2.5 stroke-[3]" />}
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}

                                {/* SE FOR MODO BOTÕES RÁPIDOS */}
                                {selectedType === 'button' && (
                                    <div className="w-full space-y-1.5 pt-0.5">
                                        {options.slice(0, 3).map((opt, idx) => {
                                            const optKey = opt.id || idx.toString();
                                            const isSelected = selectedOptionId === optKey;
                                            return (
                                                <button
                                                    key={optKey}
                                                    type="button"
                                                    onClick={() => setSelectedOptionId(optKey)}
                                                    className={`w-full py-2 px-3 rounded-xl shadow-xs border text-center text-xs font-semibold transition-all cursor-pointer ${
                                                        isSelected
                                                            ? 'bg-emerald-600 text-white border-emerald-600 shadow-sm'
                                                            : 'bg-white dark:bg-[#1f2c34] text-[#00a884] dark:text-[#00a884] border-slate-200 dark:border-slate-800 hover:bg-emerald-50/60 dark:hover:bg-emerald-950/40'
                                                    }`}
                                                >
                                                    {opt.label}
                                                </button>
                                            );
                                        })}
                                        {options.length > 3 && (
                                            <p className="text-[10px] text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40 p-1.5 rounded-lg text-center">
                                                ℹ️ O WhatsApp oficial suporta até 3 botões rápidos. Mais que isso, use o modo <strong>Lista</strong>.
                                            </p>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* BARRA INFERIOR DE DIGITAÇÃO SIMULADA */}
                        <div className="h-12 bg-[#f0f2f5] dark:bg-[#1f2c34] px-3 flex items-center gap-2 shrink-0 border-t border-slate-200/50 dark:border-slate-800">
                            <div className="flex-1 bg-white dark:bg-[#2a3942] rounded-full h-8 px-3 flex items-center gap-2 text-xs text-muted-foreground shadow-xs">
                                <Smile className="h-4 w-4 text-slate-400" />
                                <span className="flex-1 text-[11px] select-none">Mensagem</span>
                                <Paperclip className="h-3.5 w-3.5 text-slate-400" />
                                <Camera className="h-3.5 w-3.5 text-slate-400" />
                            </div>
                            <div className="w-8 h-8 rounded-full bg-[#00a884] flex items-center justify-center text-white shadow-xs">
                                <Mic className="h-4 w-4" />
                            </div>
                        </div>
                    </div>

                    {/* RODAPÉ DO DIALOG */}
                    <div className="p-3 px-4 border-t bg-muted/20 flex flex-row items-center justify-between shrink-0">
                        <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                            <Sparkles className="h-3.5 w-3.5 text-emerald-600" />
                            Simulação exata do WhatsApp Uazapi
                        </span>
                        <DialogPrimitive.Close asChild>
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => onOpenChange(false)}
                                className="text-xs h-8 cursor-pointer"
                            >
                                Fechar
                            </Button>
                        </DialogPrimitive.Close>
                    </div>
                </DialogPrimitive.Content>
            </DialogPrimitive.Portal>
        </DialogPrimitive.Root>
    );
}
