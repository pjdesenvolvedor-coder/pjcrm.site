'use client';

import React, { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useFirebase, useCollection, useMemoFirebase } from '@/firebase';
import { collection, doc, updateDoc, deleteDoc, writeBatch } from 'firebase/firestore';
import type { FlowContactSession } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';
import { PageHeader } from '@/components/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
    MessageSquare,
    Clock,
    RefreshCw,
    Search,
    ExternalLink,
    Trash2,
    Users,
    Headphones,
    CheckCircle2,
    Play,
    MoreVertical,
    Workflow,
    ArrowRight,
    Sparkles,
    Settings,
} from 'lucide-react';

type ColumnDef = {
    id: FlowContactSession['status'];
    title: string;
    icon: any;
    color: string;
    bgColor: string;
    badgeColor: string;
};

const COLUMNS: ColumnDef[] = [
    {
        id: 'active',
        title: 'Novos / Iniciados',
        icon: Play,
        color: 'text-blue-600',
        bgColor: 'bg-blue-50/40 dark:bg-blue-950/20 border-blue-200 dark:border-blue-900',
        badgeColor: 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300',
    },
    {
        id: 'waiting_user_input',
        title: 'Aguardando Menu',
        icon: Clock,
        color: 'text-indigo-600',
        bgColor: 'bg-indigo-50/40 dark:bg-indigo-950/20 border-indigo-200 dark:border-indigo-900',
        badgeColor: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300',
    },
    {
        id: 'support',
        title: 'Em Atendimento Humano',
        icon: Headphones,
        color: 'text-amber-600',
        bgColor: 'bg-amber-50/40 dark:bg-amber-950/20 border-amber-200 dark:border-amber-900',
        badgeColor: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300',
    },
    {
        id: 'completed',
        title: 'Finalizados / Concluídos',
        icon: CheckCircle2,
        color: 'text-emerald-600',
        bgColor: 'bg-emerald-50/40 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-900',
        badgeColor: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300',
    },
];

function formatPhoneDisplay(phone?: string): string {
    if (!phone) return 'Sem número';
    const clean = phone.replace(/\D/g, '');
    if (clean.length === 13 && clean.startsWith('55')) {
        return `+55 (${clean.slice(2, 4)}) ${clean.slice(4, 9)}-${clean.slice(9)}`;
    }
    if (clean.length === 12 && clean.startsWith('55')) {
        return `+55 (${clean.slice(2, 4)}) ${clean.slice(4, 8)}-${clean.slice(8)}`;
    }
    if (clean.length === 11) {
        return `(${clean.slice(0, 2)}) ${clean.slice(2, 7)}-${clean.slice(7)}`;
    }
    return phone;
}

function timeAgo(dateString?: string): string {
    if (!dateString) return 'Recentemente';
    const diff = Math.floor((Date.now() - new Date(dateString).getTime()) / 1000);
    if (diff < 60) return `${diff}s atrás`;
    if (diff < 3600) return `${Math.floor(diff / 60)}m atrás`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h atrás`;
    return `${Math.floor(diff / 86400)}d atrás`;
}

export default function FlowKanbanPage() {
    const router = useRouter();
    const { firestore, effectiveUserId } = useFirebase();
    const { toast } = useToast();

    const [searchTerm, setSearchTerm] = useState('');
    const [draggedSessionId, setDraggedSessionId] = useState<string | null>(null);

    // Query de todas as sessões do usuário
    const sessionsQuery = useMemoFirebase(() => {
        if (!effectiveUserId) return null;
        return collection(firestore, 'users', effectiveUserId, 'flow_sessions');
    }, [firestore, effectiveUserId]);
    const { data: rawSessions, isLoading } = useCollection<FlowContactSession>(sessionsQuery);

    const sessions = useMemo(() => {
        if (!rawSessions) return [];
        return rawSessions.filter((s) => {
            if (!searchTerm.trim()) return true;
            const term = searchTerm.toLowerCase();
            return (
                s.phoneNumber?.toLowerCase().includes(term) ||
                s.contactName?.toLowerCase().includes(term) ||
                s.flowName?.toLowerCase().includes(term) ||
                s.lastMessageText?.toLowerCase().includes(term) ||
                s.id.toLowerCase().includes(term)
            );
        });
    }, [rawSessions, searchTerm]);

    // Drag and Drop handlers
    const handleDragStart = (e: React.DragEvent, sessionId: string) => {
        setDraggedSessionId(sessionId);
        e.dataTransfer.setData('text/plain', sessionId);
        e.dataTransfer.effectAllowed = 'move';
    };

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
    };

    const handleDrop = async (e: React.DragEvent, targetStatus: FlowContactSession['status']) => {
        e.preventDefault();
        const sessionId = e.dataTransfer.getData('text/plain') || draggedSessionId;
        if (!sessionId || !effectiveUserId) return;

        try {
            const sessionRef = doc(firestore, 'users', effectiveUserId, 'flow_sessions', sessionId);
            await updateDoc(sessionRef, {
                status: targetStatus,
                lastInteractionAt: new Date().toISOString(),
            });

            const colName = COLUMNS.find((c) => c.id === targetStatus)?.title || targetStatus;
            toast({
                title: 'Status atualizado!',
                description: `Cliente movido para "${colName}".`,
            });
        } catch (err: any) {
            toast({ variant: 'destructive', title: 'Erro ao mover cliente', description: err.message });
        } finally {
            setDraggedSessionId(null);
        }
    };

    // Resetar chat de um cliente individual (reinicia o fluxo para ele)
    const handleResetClient = async (session: FlowContactSession) => {
        if (!effectiveUserId) return;
        const phone = session.phoneNumber || session.id;

        try {
            // Dispara teste com o fluxo
            const res = await fetch('/api/flows/test', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    userId: effectiveUserId,
                    flowId: session.flowId,
                    phoneNumber: phone,
                }),
            });

            if (res.ok) {
                toast({
                    title: 'Chat resetado com sucesso!',
                    description: `O fluxo foi reiniciado no WhatsApp para ${formatPhoneDisplay(phone)}.`,
                });
            } else {
                toast({
                    variant: 'destructive',
                    title: 'Falha ao resetar',
                    description: 'Verifique se o WhatsApp está conectado.',
                });
            }
        } catch (err: any) {
            toast({ variant: 'destructive', title: 'Erro', description: err.message });
        }
    };

    // Excluir card de sessão
    const handleDeleteSession = async (sessionId: string) => {
        if (!effectiveUserId) return;
        try {
            await deleteDoc(doc(firestore, 'users', effectiveUserId, 'flow_sessions', sessionId));
            toast({ title: 'Sessão removida do Kanban.' });
        } catch (err: any) {
            toast({ variant: 'destructive', title: 'Erro ao remover', description: err.message });
        }
    };

    // Limpar todas as sessões
    const handleClearAllSessions = async () => {
        if (!effectiveUserId || !rawSessions || rawSessions.length === 0) return;
        if (!confirm('Deseja limpar todos os chats do Kanban? As conversas no WhatsApp não serão apagadas.')) return;

        try {
            const batch = writeBatch(firestore);
            rawSessions.forEach((s) => {
                batch.delete(doc(firestore, 'users', effectiveUserId, 'flow_sessions', s.id));
            });
            await batch.commit();
            toast({ title: 'Todas as sessões foram limpas com sucesso!' });
        } catch (err: any) {
            toast({ variant: 'destructive', title: 'Erro ao limpar', description: err.message });
        }
    };

    return (
        <div className="flex-1 space-y-6 p-4 md:p-8 pt-6">
            <PageHeader
                title="CRM Kanban dos Chats"
                description="Acompanhe em tempo real os clientes conversando no fluxo. Arraste e solte os blocos entre as etapas."
            />

            {/* BARRA DE AÇÕES E BUSCA */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                <div className="relative w-full sm:w-80">
                    <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                        placeholder="Buscar cliente, número ou mensagem..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="pl-9 text-xs"
                    />
                </div>

                <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => router.push('/flows/settings')}
                        className="text-xs gap-1.5 h-9"
                    >
                        <Settings className="h-3.5 w-3.5" />
                        Gatilhos & Reset
                    </Button>

                    <Button
                        variant="outline"
                        size="sm"
                        onClick={handleClearAllSessions}
                        disabled={!rawSessions || rawSessions.length === 0}
                        className="text-xs text-destructive hover:bg-destructive/10 gap-1.5 h-9"
                    >
                        <Trash2 className="h-3.5 w-3.5" />
                        Limpar Todos
                    </Button>
                </div>
            </div>

            {/* KANBAN BOARD */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 items-start min-h-[600px]">
                {COLUMNS.map((col) => {
                    const colSessions = sessions.filter((s) => (s.status || 'active') === col.id);
                    const ColIcon = col.icon;

                    return (
                        <div
                            key={col.id}
                            onDragOver={handleDragOver}
                            onDrop={(e) => handleDrop(e, col.id)}
                            className={`rounded-2xl border-2 p-3 transition-colors flex flex-col min-h-[550px] ${col.bgColor}`}
                        >
                            {/* CABEÇALHO DA COLUNA */}
                            <div className="flex items-center justify-between pb-3 border-b border-border/50 mb-3 px-1">
                                <div className="flex items-center gap-2">
                                    <div className={`p-1.5 rounded-lg bg-card shadow-sm ${col.color}`}>
                                        <ColIcon className="h-4 w-4" />
                                    </div>
                                    <h3 className="font-bold text-xs">{col.title}</h3>
                                </div>
                                <Badge className={`text-[10px] font-mono h-5 px-1.5 ${col.badgeColor}`}>
                                    {colSessions.length}
                                </Badge>
                            </div>

                            {/* LISTA DE CARDS DA COLUNA */}
                            <div className="space-y-3 flex-1">
                                {colSessions.length === 0 ? (
                                    <div className="h-40 border border-dashed rounded-xl flex flex-col items-center justify-center text-center p-4 text-muted-foreground/60 text-xs select-none">
                                        Nenhum cliente nesta etapa.
                                        <br />
                                        <span className="text-[10px] opacity-75">Arraste um card para cá</span>
                                    </div>
                                ) : (
                                    colSessions.map((session) => {
                                        const phone = session.phoneNumber || session.id;
                                        const name = session.contactName || formatPhoneDisplay(phone);
                                        const cleanPhone = phone.replace(/\D/g, '');

                                        return (
                                            <div
                                                key={session.id}
                                                draggable
                                                onDragStart={(e) => handleDragStart(e, session.id)}
                                                className="group bg-card rounded-xl border shadow-sm hover:shadow-md transition-all p-3.5 space-y-2.5 cursor-grab active:cursor-grabbing hover:border-indigo-300 dark:hover:border-indigo-700 animate-in fade-in-50"
                                            >
                                                {/* TOPO DO CARD: NOME E MENU */}
                                                <div className="flex items-start justify-between gap-2">
                                                    <div className="space-y-0.5 min-w-0">
                                                        <p className="font-bold text-xs truncate text-foreground group-hover:text-indigo-600 transition-colors">
                                                            {name}
                                                        </p>
                                                        <p className="font-mono text-[11px] text-muted-foreground truncate">
                                                            {formatPhoneDisplay(phone)}
                                                        </p>
                                                    </div>

                                                    <DropdownMenu>
                                                        <DropdownMenuTrigger asChild>
                                                            <Button
                                                                variant="ghost"
                                                                size="icon"
                                                                className="h-7 w-7 text-muted-foreground hover:text-foreground"
                                                            >
                                                                <MoreVertical className="h-3.5 w-3.5" />
                                                            </Button>
                                                        </DropdownMenuTrigger>
                                                        <DropdownMenuContent align="end">
                                                            <DropdownMenuItem onClick={() => handleResetClient(session)}>
                                                                <RefreshCw className="h-3.5 w-3.5 mr-2" /> Resetar Chat & Reiniciar
                                                            </DropdownMenuItem>
                                                            <DropdownMenuItem asChild>
                                                                <a
                                                                    href={`https://wa.me/${cleanPhone}`}
                                                                    target="_blank"
                                                                    rel="noopener noreferrer"
                                                                >
                                                                    <ExternalLink className="h-3.5 w-3.5 mr-2" /> Abrir no WhatsApp Web
                                                                </a>
                                                            </DropdownMenuItem>
                                                            <DropdownMenuItem
                                                                onClick={() => handleDeleteSession(session.id)}
                                                                className="text-destructive"
                                                            >
                                                                <Trash2 className="h-3.5 w-3.5 mr-2" /> Remover do Kanban
                                                            </DropdownMenuItem>
                                                        </DropdownMenuContent>
                                                    </DropdownMenu>
                                                </div>

                                                {/* BLOCO ATUAL NO FLUXO */}
                                                <div className="flex items-center gap-1.5 flex-wrap">
                                                    {session.flowName && (
                                                        <Badge variant="outline" className="text-[10px] gap-1 font-medium bg-muted/30">
                                                            <Workflow className="h-3 w-3 text-indigo-500" />
                                                            {session.flowName}
                                                        </Badge>
                                                    )}
                                                    {session.currentNodeLabel && (
                                                        <Badge variant="secondary" className="text-[10px] truncate max-w-[150px]">
                                                            Etapa: {session.currentNodeLabel}
                                                        </Badge>
                                                    )}
                                                </div>

                                                {/* ÚLTIMA MENSAGEM */}
                                                {session.lastMessageText && (
                                                    <div className="bg-muted/40 p-2 rounded-lg border text-[11px] text-muted-foreground line-clamp-2 italic">
                                                        &quot;{session.lastMessageText}&quot;
                                                    </div>
                                                )}

                                                {/* RODAPÉ DO CARD */}
                                                <div className="flex items-center justify-between pt-2 border-t text-[10px] text-muted-foreground">
                                                    <span>{timeAgo(session.lastInteractionAt)}</span>
                                                    <div className="flex items-center gap-1.5">
                                                        <button
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                handleResetClient(session);
                                                            }}
                                                            className="hover:text-indigo-600 transition-colors flex items-center gap-1 text-[10px] font-semibold"
                                                            title="Resetar e Reiniciar Fluxo"
                                                        >
                                                            <RefreshCw className="h-3 w-3" />
                                                            Resetar
                                                        </button>
                                                        <span className="text-muted-foreground/30">•</span>
                                                        <a
                                                            href={`https://wa.me/${cleanPhone}`}
                                                            target="_blank"
                                                            rel="noopener noreferrer"
                                                            className="hover:text-emerald-600 transition-colors flex items-center gap-0.5"
                                                            title="Conversar no WhatsApp"
                                                        >
                                                            <ExternalLink className="h-3 w-3" />
                                                        </a>
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
