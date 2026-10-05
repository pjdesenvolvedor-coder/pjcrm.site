'use client';

import React, { memo, useState } from 'react';
import { Handle, Position, NodeProps } from '@xyflow/react';
import {
    Star,
    Grid,
    Zap,
    Rocket,
    Clock,
    MoreHorizontal,
    MoreVertical,
    Eye,
    Trash2,
    FileText,
    Image as ImageIcon,
    Volume2,
    Video,
    File,
    HelpCircle,
    CheckCircle2,
} from 'lucide-react';
import {
    DropdownMenu,
    DropdownMenuTrigger,
    DropdownMenuContent,
    DropdownMenuItem,
} from '@/components/ui/dropdown-menu';
import { WhatsAppMenuPreviewDialog } from '@/components/flows/WhatsAppMenuPreviewDialog';
import { useFlowNodeActions } from '@/components/flows/FlowNodeActionsContext';
import type { FlowNodeData } from '@/lib/types';

const nodeTypeConfigs: Record<
    string,
    {
        title: string;
        icon: any;
        color: string;
        borderClass: string;
        bgClass: string;
        badgeClass: string;
        iconClass: string;
    }
> = {
    content: {
        title: 'Conteúdo',
        icon: Star,
        color: '#f87171',
        borderClass: 'border-rose-300 dark:border-rose-900',
        bgClass: 'bg-rose-50/30 dark:bg-rose-950/20',
        badgeClass: 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300',
        iconClass: 'text-rose-500',
    },
    menu: {
        title: 'Menu',
        icon: Grid,
        color: '#818cf8',
        borderClass: 'border-indigo-300 dark:border-indigo-900',
        bgClass: 'bg-indigo-50/30 dark:bg-indigo-950/20',
        badgeClass: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300',
        iconClass: 'text-indigo-600',
    },
    delay: {
        title: 'Atraso Inteligente',
        icon: Clock,
        color: '#fb923c',
        borderClass: 'border-orange-300 dark:border-orange-900',
        bgClass: 'bg-orange-50/30 dark:bg-orange-950/20',
        badgeClass: 'bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-300',
        iconClass: 'text-orange-500',
    },
    action: {
        title: 'Ação',
        icon: Zap,
        color: '#facc15',
        borderClass: 'border-amber-300 dark:border-amber-900',
        bgClass: 'bg-amber-50/30 dark:bg-amber-950/20',
        badgeClass: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300',
        iconClass: 'text-amber-500',
    },
    flow_connect: {
        title: 'Conexão de Fluxo',
        icon: Rocket,
        color: '#4ade80',
        borderClass: 'border-emerald-300 dark:border-emerald-900',
        bgClass: 'bg-emerald-50/30 dark:bg-emerald-950/20',
        badgeClass: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300',
        iconClass: 'text-emerald-500',
    },
};

export const FlowCustomNode = memo(({ id, data, selected }: NodeProps) => {
    const nodeData = data as unknown as FlowNodeData;
    const config = nodeTypeConfigs[nodeData?.nodeType || 'content'] || nodeTypeConfigs.content;
    const Icon = config.icon;
    const [isPreviewOpen, setIsPreviewOpen] = useState(false);
    const { onDeleteNode } = useFlowNodeActions();

    return (
        <div
            className={`min-w-[260px] max-w-[320px] rounded-xl border-2 bg-card shadow-md transition-all duration-200 ${
                config.borderClass
            } ${selected ? 'ring-2 ring-indigo-500 ring-offset-2 shadow-lg scale-[1.02]' : 'hover:shadow-lg'}`}
        >
            {/* ENTRADA (Target Handle) */}
            <Handle
                type="target"
                position={Position.Left}
                id="target"
                className="!w-4 !h-4 !bg-slate-400 hover:!bg-indigo-500 !border-2 !border-white dark:!border-slate-900 !rounded-full -ml-[8px] cursor-crosshair shadow-sm z-10"
                title="Ponto de entrada: solte a conexão aqui"
            />

            {/* CABEÇALHO DO NÓ */}
            <div className={`flex items-center justify-between p-2.5 px-3 border-b rounded-t-[10px] ${config.bgClass}`}>
                <div className="flex items-center gap-2">
                    <div className={`p-1 rounded-md bg-white dark:bg-slate-900 shadow-sm ${config.iconClass}`}>
                        <Icon className="h-4 w-4" />
                    </div>
                    <span className="text-xs font-bold tracking-tight">
                        {nodeData?.label || config.title}
                    </span>
                </div>

                <div className="flex items-center gap-1">
                    <span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold ${config.badgeClass}`}>
                        {config.title}
                    </span>

                    {/* BOTÃO LIXEIRINHA PARA APAGAR O BLOCO */}
                    <button
                        type="button"
                        className="nodrag nopan p-1 rounded-md text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/50 transition-colors"
                        title="Excluir este bloco"
                        onClick={(e) => {
                            e.stopPropagation();
                            if (onDeleteNode) {
                                onDeleteNode(id);
                            }
                        }}
                    >
                        <Trash2 className="h-3.5 w-3.5" />
                    </button>

                    {/* DROPDOWN DO CARD (com opções) */}
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <button
                                type="button"
                                className="nodrag nopan p-1 rounded-md text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-white/60 dark:hover:bg-slate-800/60 transition-colors"
                                title="Opções do bloco"
                                onClick={(e) => e.stopPropagation()}
                            >
                                <MoreVertical className="h-3.5 w-3.5" />
                            </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-40 nodrag nopan">
                            {nodeData?.nodeType === 'menu' && (
                                <DropdownMenuItem
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        setIsPreviewOpen(true);
                                    }}
                                    className="text-xs gap-2 cursor-pointer font-medium"
                                >
                                    <Eye className="h-3.5 w-3.5 text-emerald-600" />
                                    Pré-visualizar
                                </DropdownMenuItem>
                            )}
                            <DropdownMenuItem
                                onClick={(e) => {
                                    e.stopPropagation();
                                    if (onDeleteNode) {
                                        onDeleteNode(id);
                                    }
                                }}
                                className="text-xs gap-2 cursor-pointer font-medium text-rose-600 dark:text-rose-400 focus:text-rose-600 focus:bg-rose-50 dark:focus:bg-rose-950/40"
                            >
                                <Trash2 className="h-3.5 w-3.5" />
                                Excluir bloco
                            </DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>
                </div>
            </div>

            {/* CORPO DO NÓ */}
            <div className="p-3 text-xs space-y-2">
                {/* 1. NÓ DE CONTEÚDO */}
                {nodeData?.nodeType === 'content' && (
                    <div className="space-y-1.5">
                        <div className="flex items-center gap-1.5 text-muted-foreground text-[11px]">
                            {nodeData.contentType === 'image' && <ImageIcon className="h-3.5 w-3.5 text-rose-500" />}
                            {nodeData.contentType === 'audio' && <Volume2 className="h-3.5 w-3.5 text-rose-500" />}
                            {nodeData.contentType === 'video' && <Video className="h-3.5 w-3.5 text-rose-500" />}
                            {nodeData.contentType === 'document' && <File className="h-3.5 w-3.5 text-rose-500" />}
                            {(!nodeData.contentType || nodeData.contentType === 'text') && <FileText className="h-3.5 w-3.5 text-rose-500" />}
                            <span className="capitalize">{nodeData.contentType || 'Texto'}</span>
                        </div>
                        <p className="line-clamp-3 text-slate-700 dark:text-slate-300 font-normal leading-relaxed bg-muted/40 p-2 rounded border border-muted">
                            {nodeData.text || 'Clique para configurar a mensagem...'}
                        </p>
                    </div>
                )}

                {/* 2. NÓ DE MENU */}
                {nodeData?.nodeType === 'menu' && (
                    <div className="space-y-2">
                        <p className="font-medium text-slate-800 dark:text-slate-200 line-clamp-2">
                            {nodeData.menuQuestionText || 'Selecione uma opção:'}
                        </p>
                        {nodeData.menuButtonTitle && (
                            <div className="text-[11px] font-semibold text-indigo-600 bg-indigo-50 dark:bg-indigo-950/40 p-1 px-2 rounded border border-indigo-200 dark:border-indigo-900 inline-block">
                                🔘 {nodeData.menuButtonTitle}
                            </div>
                        )}

                        <div className="space-y-1.5 pt-1">
                            {(nodeData.menuOptions || []).map((opt, idx) => (
                                <div
                                    key={opt.id || idx}
                                    className="relative flex items-center justify-between p-1.5 px-2.5 rounded-md bg-slate-100 dark:bg-slate-800 text-[11px] font-medium border border-slate-200 dark:border-slate-700"
                                >
                                    <span className="truncate pr-3">{opt.label}</span>
                                    {/* Handle individual para cada opção do menu */}
                                    <Handle
                                        type="source"
                                        position={Position.Right}
                                        id={opt.id}
                                        className="!w-3.5 !h-3.5 !bg-indigo-500 hover:!bg-indigo-600 !border-2 !border-white dark:!border-slate-900 !rounded-full !-mr-[19px] cursor-crosshair shadow-sm z-10"
                                        title={`Clique e arraste para ligar a opção ${opt.label} a outro bloco`}
                                    />
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* 3. NÓ DE ATRASO INTELIGENTE */}
                {nodeData?.nodeType === 'delay' && (
                    <div className="flex items-center gap-2 p-2 bg-orange-50/50 dark:bg-orange-950/20 rounded border border-orange-100 dark:border-orange-900/50 text-orange-900 dark:text-orange-300">
                        <Clock className="h-4 w-4 text-orange-500 shrink-0" />
                        <div>
                            <p className="font-semibold text-xs">
                                Esperar {nodeData.delaySeconds || 3} segundo(s)
                            </p>
                            <p className="text-[10px] text-muted-foreground">
                                {nodeData.delayPresence === 'composing' ? 'Simulando "Digitando..."' : nodeData.delayPresence === 'recording' ? 'Simulando "Gravando..."' : 'Sem presença'}
                            </p>
                        </div>
                    </div>
                )}

                {/* 4. NÓ DE AÇÃO */}
                {nodeData?.nodeType === 'action' && (
                    <div className="p-2 bg-amber-50/50 dark:bg-amber-950/20 rounded border border-amber-100 dark:border-amber-900/50 space-y-1">
                        <div className="flex items-center gap-1.5 font-semibold text-amber-800 dark:text-amber-300">
                            <Zap className="h-3.5 w-3.5 text-amber-500" />
                            <span>
                                {nodeData.actionType === 'open_support'
                                    ? 'Transferir para Suporte'
                                    : nodeData.actionType === 'add_tag'
                                    ? 'Adicionar Tag'
                                    : 'Ação do Sistema'}
                            </span>
                        </div>
                        {nodeData.text && (
                            <p className="text-[11px] text-muted-foreground line-clamp-2">
                                {nodeData.text}
                            </p>
                        )}
                    </div>
                )}

                {/* 5. NÓ DE CONEXÃO DE FLUXO */}
                {nodeData?.nodeType === 'flow_connect' && (
                    <div className="p-2 bg-emerald-50/50 dark:bg-emerald-950/20 rounded border border-emerald-100 dark:border-emerald-900/50 flex items-center gap-2">
                        <Rocket className="h-4 w-4 text-emerald-500 shrink-0" />
                        <span className="font-semibold text-xs text-emerald-800 dark:text-emerald-300">
                            {nodeData.targetFlowId ? 'Transferir para outro fluxo' : 'Configurar fluxo de destino'}
                        </span>
                    </div>
                )}
            </div>

            {/* SAÍDA PADRÃO (Source Handle para nós que não são menu com múltiplas saídas) */}
            {nodeData?.nodeType !== 'menu' && (
                <Handle
                    type="source"
                    position={Position.Right}
                    id="source"
                    className="!w-4 !h-4 !bg-indigo-500 hover:!bg-indigo-600 !border-2 !border-white dark:!border-slate-900 !rounded-full -mr-[8px] cursor-crosshair shadow-sm z-10"
                    title="Ponto de saída: clique e arraste para ligar a outro bloco"
                />
            )}

            {/* MODAL DE PRÉ-VISUALIZAÇÃO DO WHATSAPP */}
            <WhatsAppMenuPreviewDialog
                open={isPreviewOpen}
                onOpenChange={setIsPreviewOpen}
                data={nodeData}
            />
        </div>
    );
});

FlowCustomNode.displayName = 'FlowCustomNode';
