'use client';

import React, { useState } from 'react';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
    Smartphone,
    ListFilter,
    Check,
    CheckCheck,
    ArrowLeft,
    Phone,
    Video,
    MoreVertical,
    Paperclip,
    Mic,
    Smile,
    Camera,
    Sparkles,
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
 * Formata texto com suporte básico a formatação do WhatsApp:
 * **negrito** ou *negrito*, _itálico_, ~tachado~ e quebras de linha
 */
function formatWhatsAppText(text?: string) {
    if (!text) return 'Selecione uma das opções abaixo:';

    // Substituir marcações básicas
    const lines = text.split('\n');
    return lines.map((line, lineIdx) => {
        // Parse simples de negrito (*texto*), itálico (_texto_) e tachado (~texto~)
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
    // Permitir alternar os 3 tipos no preview para o usuário testar visualmente
    const [selectedType, setSelectedType] = useState<'list' | 'numeric' | 'button'>(
        data.menuType || 'list'
    );
    const [isListExpanded, setIsListExpanded] = useState(true);

    const options = data.menuOptions && data.menuOptions.length > 0
        ? data.menuOptions
        : [
              { id: '1', label: 'Opção 1', description: 'Detalhes da primeira opção' },
              { id: '2', label: 'Opção 2', description: 'Detalhes da segunda opção' },
              { id: '3', label: 'Opção 3', description: 'Detalhes da terceira opção' },
          ];

    const buttonTitle = data.menuButtonTitle || 'VER OPÇÕES';
    const questionText = data.menuQuestionText || 'Olá! Por favor, selecione uma das opções abaixo:';

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-md p-0 overflow-hidden rounded-2xl border bg-card shadow-2xl">
                {/* CABEÇALHO DO MODAL */}
                <DialogHeader className="p-4 pb-2 border-b bg-muted/20">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <div className="p-1.5 rounded-lg bg-emerald-100 dark:bg-emerald-950 text-emerald-600 dark:text-emerald-400">
                                <Smartphone className="h-4 w-4" />
                            </div>
                            <div>
                                <DialogTitle className="text-sm font-bold">
                                    Pré-visualização no WhatsApp
                                </DialogTitle>
                                <DialogDescription className="text-[11px] text-muted-foreground">
                                    Veja como seu menu será recebido pelo cliente.
                                </DialogDescription>
                            </div>
                        </div>
                    </div>

                    {/* SELETOR DE MODO DE VISUALIZAÇÃO */}
                    <div className="flex items-center gap-1.5 pt-2">
                        <span className="text-[10px] text-muted-foreground font-semibold mr-1">
                            Modo:
                        </span>
                        <button
                            type="button"
                            onClick={() => setSelectedType('list')}
                            className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-all ${
                                selectedType === 'list'
                                    ? 'bg-emerald-600 text-white shadow-sm'
                                    : 'bg-muted hover:bg-muted/80 text-muted-foreground'
                            }`}
                        >
                            Lista
                        </button>
                        <button
                            type="button"
                            onClick={() => setSelectedType('button')}
                            className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-all ${
                                selectedType === 'button'
                                    ? 'bg-emerald-600 text-white shadow-sm'
                                    : 'bg-muted hover:bg-muted/80 text-muted-foreground'
                            }`}
                        >
                            Botões
                        </button>
                        <button
                            type="button"
                            onClick={() => setSelectedType('numeric')}
                            className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-all ${
                                selectedType === 'numeric'
                                    ? 'bg-emerald-600 text-white shadow-sm'
                                    : 'bg-muted hover:bg-muted/80 text-muted-foreground'
                            }`}
                        >
                            Numérico
                        </button>
                    </div>
                </DialogHeader>

                {/* SIMULADOR DE TELA DO WHATSAPP */}
                <div className="flex flex-col bg-[#efeae2] dark:bg-[#0b141a] text-slate-800 dark:text-slate-100 min-h-[460px] max-h-[500px]">
                    {/* BARRA SUPERIOR DO CHAT WHATSAPP */}
                    <div className="h-12 bg-[#075e54] dark:bg-[#1f2c34] text-white px-3 flex items-center justify-between shrink-0 shadow-sm">
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
                            <div className="bg-white dark:bg-[#1f2c34] rounded-2xl rounded-tl-sm p-3 shadow-sm border border-slate-200/50 dark:border-slate-800/80 relative text-xs leading-relaxed space-y-2">
                                {/* TEXTO DA PERGUNTA */}
                                <div className="text-slate-800 dark:text-slate-100 whitespace-pre-wrap">
                                    {formatWhatsAppText(questionText)}
                                </div>

                                {/* SE FOR MODO NUMÉRICO: LISTA AS OPÇÕES COM NÚMEROS DIRETAMENTE NO TEXTO */}
                                {selectedType === 'numeric' && (
                                    <div className="pt-2 border-t border-slate-100 dark:border-slate-800/80 space-y-1.5 font-medium">
                                        {options.map((opt, idx) => (
                                            <div key={opt.id || idx} className="text-[11.5px]">
                                                <span className="font-bold text-indigo-600 dark:text-indigo-400">
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

                                {/* SE FOR MODO LISTA: BOTÃO DE ABRIR A LISTA NATIVO DO WHATSAPP */}
                                {selectedType === 'list' && (
                                    <div className="pt-1 border-t border-slate-100 dark:border-slate-800">
                                        <button
                                            type="button"
                                            onClick={() => setIsListExpanded(!isListExpanded)}
                                            className="w-full py-1.5 px-2 flex items-center justify-center gap-1.5 text-xs font-bold text-[#00a884] dark:text-[#00a884] hover:bg-emerald-50/50 dark:hover:bg-emerald-950/30 rounded-lg transition-colors cursor-pointer select-none"
                                        >
                                            <ListFilter className="h-3.5 w-3.5" />
                                            <span>{buttonTitle}</span>
                                        </button>
                                    </div>
                                )}
                            </div>

                            {/* SE FOR MODO LISTA E ESTIVER EXPANDIDO: SIMULA O BOTTOM SHEET DE OPÇÕES DO WHATSAPP */}
                            {selectedType === 'list' && isListExpanded && (
                                <div className="w-full bg-white dark:bg-[#1f2c34] rounded-xl shadow-md border border-slate-200/80 dark:border-slate-800 p-2 space-y-1 animate-in fade-in-50 slide-in-from-top-1">
                                    <p className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground px-2 pt-1 pb-1">
                                        Opções disponíveis
                                    </p>
                                    {options.map((opt, idx) => (
                                        <div
                                            key={opt.id || idx}
                                            className="flex items-center justify-between p-2 rounded-lg hover:bg-emerald-50 dark:hover:bg-emerald-950/30 transition-colors cursor-pointer border border-transparent hover:border-emerald-200 dark:hover:border-emerald-900 group"
                                        >
                                            <div className="space-y-0.5 min-w-0 pr-2">
                                                <p className="text-xs font-semibold text-slate-800 dark:text-slate-100 group-hover:text-emerald-700 dark:group-hover:text-emerald-400">
                                                    {opt.label}
                                                </p>
                                                {opt.description && (
                                                    <p className="text-[10px] text-muted-foreground truncate">
                                                        {opt.description}
                                                    </p>
                                                )}
                                            </div>
                                            <div className="w-4 h-4 rounded-full border-2 border-slate-300 dark:border-slate-600 group-hover:border-emerald-500 flex items-center justify-center shrink-0" />
                                        </div>
                                    ))}
                                </div>
                            )}

                            {/* SE FOR MODO BOTÕES RÁPIDOS: BOTÕES EMPILHADOS ABAIXO DO BALÃO */}
                            {selectedType === 'button' && (
                                <div className="w-full space-y-1.5 pt-0.5">
                                    {options.slice(0, 3).map((opt, idx) => (
                                        <div
                                            key={opt.id || idx}
                                            className="w-full py-2 px-3 bg-white dark:bg-[#1f2c34] rounded-xl shadow-xs border border-slate-200 dark:border-slate-800 text-center text-xs font-semibold text-[#00a884] dark:text-[#00a884] hover:bg-emerald-50/60 dark:hover:bg-emerald-950/40 transition-colors cursor-pointer select-none"
                                        >
                                            {opt.label}
                                        </div>
                                    ))}
                                    {options.length > 3 && (
                                        <p className="text-[10px] text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40 p-1.5 rounded-lg text-center">
                                            ℹ️ O WhatsApp oficial suporta até 3 botões rápidos. Mais que isso, use o modo <strong>Lista</strong>.
                                        </p>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* BARRA INFERIOR DE DIGITAÇÃO SIMULADA DO WHATSAPP */}
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
                <DialogFooter className="p-3 px-4 border-t bg-muted/20 flex flex-row items-center justify-between">
                    <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                        <Sparkles className="h-3.5 w-3.5 text-emerald-600" />
                        Simulação exata do WhatsApp Uazapi
                    </span>
                    <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => onOpenChange(false)}
                        className="text-xs h-8"
                    >
                        Fechar
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
