'use client';

import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Search, Send, PlusCircle, User, Briefcase, Paperclip, ChevronRight, XCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from './ui/skeleton';
import { useCollection, useFirebase, useUser, useMemoFirebase } from '@/firebase';
import { addDocumentNonBlocking, setDocumentNonBlocking } from '@/firebase/non-blocking-updates';
import { collection, query, orderBy, serverTimestamp, Timestamp, where, doc, onSnapshot } from 'firebase/firestore';
import type { Ticket, TicketMessage, UserProfile } from '@/lib/types';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog"
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { useToast } from '@/hooks/use-toast';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';

const newTicketSchema = z.object({
    subject: z.string().min(5, { message: 'O assunto deve ter pelo menos 5 caracteres.' }),
});

function NewTicketDialog({ onFinished }: { onFinished: () => void }) {
    const { firestore } = useFirebase();
    const { user } = useUser();
    const { toast } = useToast();

    const form = useForm<z.infer<typeof newTicketSchema>>({
        resolver: zodResolver(newTicketSchema),
        defaultValues: { subject: '' },
    });

    const onSubmit = (values: z.infer<typeof newTicketSchema>) => {
        if (!user) return;

        const ticketData = {
            userId: user.uid,
            userName: user.displayName || 'Usuário',
            userEmail: user.email,
            subject: values.subject,
            status: 'Aberto' as const,
            createdAt: serverTimestamp(),
            lastMessage: "Ticket criado. Aguardando resposta do suporte.",
            lastMessageAt: serverTimestamp(),
            unreadByAdmin: true,
            unreadByUser: false,
        };

        addDocumentNonBlocking(collection(firestore, 'tickets'), ticketData);
        toast({ title: "Ticket Aberto!", description: "Seu ticket de suporte foi criado. Um administrador responderá em breve." });
        onFinished();
    };

    return (
        <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <DialogHeader>
                    <DialogTitle>Abrir Novo Ticket de Suporte</DialogTitle>
                    <DialogDescription>
                        Descreva seu problema ou dúvida. Nossa equipe responderá o mais rápido possível.
                    </DialogDescription>
                </DialogHeader>
                <FormField
                    control={form.control}
                    name="subject"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>Assunto</FormLabel>
                            <FormControl>
                                <Input placeholder="Ex: Problema com a conexão do WhatsApp" {...field} />
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                    )}
                />
                <DialogFooter>
                    <Button type="button" variant="ghost" onClick={onFinished}>Cancelar</Button>
                    <Button type="submit">Abrir Ticket</Button>
                </DialogFooter>
            </form>
        </Form>
    );
}

export function LiveChatView() {
    const { firestore } = useFirebase();
    const { user } = useUser();
    const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
    
    const [isNewTicketOpen, setIsNewTicketOpen] = useState(false);

    useEffect(() => {
        if (user) {
            const userDocRef = doc(firestore, 'users', user.uid);
            const unsub = onSnapshot(userDocRef, (doc) => {
                setUserProfile(doc.data() as UserProfile);
            });
            return () => unsub();
        }
    }, [user, firestore]);

    const isAdmin = userProfile?.role === 'Admin';
    
    const ticketsQuery = useMemoFirebase(() => {
        if (!user) return null;
        if (isAdmin) {
            return query(collection(firestore, 'tickets'), orderBy('lastMessageAt', 'desc'));
        }
        return query(collection(firestore, 'tickets'), where('userId', '==', user.uid), orderBy('lastMessageAt', 'desc'));
    }, [firestore, user, isAdmin]);

    const { data: tickets, isLoading: isLoadingTickets } = useCollection<Ticket>(ticketsQuery);

    const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);

    useEffect(() => {
        if (!selectedTicket && tickets && tickets.length > 0) {
            setSelectedTicket(tickets[0]);
        } else if (selectedTicket) {
            const updatedTicket = tickets?.find(t => t.id === selectedTicket.id);
            if (updatedTicket) {
                setSelectedTicket(updatedTicket);
            }
        }
    }, [tickets, selectedTicket]);

    const handleSelectTicket = async (ticket: Ticket) => {
        setSelectedTicket(ticket);
        const ticketRef = doc(firestore, 'tickets', ticket.id);
        if (isAdmin && ticket.unreadByAdmin) {
            setDocumentNonBlocking(ticketRef, { unreadByAdmin: false }, { merge: true });
        } else if (!isAdmin && ticket.unreadByUser) {
            setDocumentNonBlocking(ticketRef, { unreadByUser: false }, { merge: true });
        }
    };
    
    const getStatusVariant = (status: 'Aberto' | 'Em Andamento' | 'Fechado') => {
        switch (status) {
            case 'Aberto': return 'default';
            case 'Em Andamento': return 'secondary';
            case 'Fechado': return 'outline';
            default: return 'outline';
        }
    };

    return (
        <div className="flex-1 grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 border-t h-[calc(100vh-4rem-1px)]">
            <aside className="md:col-span-1 lg:col-span-1 border-r flex flex-col h-full">
                <div className="p-4 border-b flex items-center justify-between gap-2">
                    <div className="relative flex-1">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input placeholder="Pesquisar tickets..." className="pl-9" />
                    </div>
                    {!isAdmin && (
                        <Dialog open={isNewTicketOpen} onOpenChange={setIsNewTicketOpen}>
                            <DialogTrigger asChild>
                                <Button size="sm" className="gap-1">
                                    <PlusCircle className="h-4 w-4" />
                                    Novo Ticket
                                </Button>
                            </DialogTrigger>
                            <DialogContent>
                                <NewTicketDialog onFinished={() => setIsNewTicketOpen(false)} />
                            </DialogContent>
                        </Dialog>
                    )}
                </div>
                <ScrollArea className="flex-1">
                    {isLoadingTickets ? (
                        <div className="p-4 space-y-4">
                            {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-20 w-full" />)}
                        </div>
                    ) : (
                        tickets?.map((ticket) => (
                            <button
                                key={ticket.id}
                                onClick={() => handleSelectTicket(ticket)}
                                className={cn(
                                    'flex w-full text-left items-start gap-3 p-4 transition-colors hover:bg-muted/50',
                                    selectedTicket?.id === ticket.id && 'bg-muted'
                                )}
                            >
                                <div className="flex-1 overflow-hidden">
                                    <div className="flex items-start justify-between gap-2">
                                        <p className="font-semibold truncate">{ticket.subject}</p>
                                        <Badge variant={getStatusVariant(ticket.status)}>{ticket.status}</Badge>
                                    </div>
                                    <p className="text-sm text-muted-foreground truncate mt-1">{ticket.lastMessage}</p>
                                    <div className="flex items-center justify-between mt-2">
                                        <p className="text-xs text-muted-foreground">{ticket.userName}</p>
                                        <p className="text-xs text-muted-foreground">
                                            {ticket.lastMessageAt ? formatDistanceToNow(ticket.lastMessageAt.toDate(), { addSuffix: true, locale: ptBR }) : ''}
                                        </p>
                                    </div>
                                </div>
                                {((isAdmin && ticket.unreadByAdmin) || (!isAdmin && ticket.unreadByUser)) && (
                                    <div className="w-2 h-2 rounded-full bg-primary mt-1" />
                                )}
                            </button>
                        ))
                    )}
                </ScrollArea>
            </aside>

            <main className="md:col-span-2 lg:col-span-3 flex flex-col h-full">
                {selectedTicket ? (
                    <TicketPanel ticket={selectedTicket} isAdmin={isAdmin} />
                ) : (
                    <div className="flex flex-1 items-center justify-center text-muted-foreground">
                        <p>Selecione um ticket para começar</p>
                    </div>
                )}
            </main>
        </div>
    );
}

function TicketPanel({ ticket, isAdmin }: { ticket: Ticket, isAdmin: boolean }) {
    const { firestore } = useFirebase();
    const { user } = useUser();
    const [message, setMessage] = useState('');
    const endOfMessagesRef = useRef<HTMLDivElement>(null);

    const messagesQuery = useMemoFirebase(() => {
        if (!user) return null;
        return query(collection(firestore, 'tickets', ticket.id, 'messages'), orderBy('timestamp', 'asc'));
    }, [firestore, user, ticket.id]);

    const { data: messages, isLoading: isLoadingMessages } = useCollection<TicketMessage>(messagesQuery);

    const scrollToBottom = () => {
        endOfMessagesRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    useEffect(() => {
        scrollToBottom();
    }, [messages]);

    const handleSendMessage = () => {
        if (message.trim() && user) {
            const messagesCol = collection(firestore, 'tickets', ticket.id, 'messages');
            addDocumentNonBlocking(messagesCol, {
                ticketId: ticket.id,
                senderId: user.uid,
                senderName: user.displayName || 'Usuário',
                content: message,
                timestamp: serverTimestamp(),
                isAgent: !isAdmin,
            });
            
            const ticketRef = doc(firestore, 'tickets', ticket.id);
            setDocumentNonBlocking(ticketRef, {
                lastMessage: message,
                lastMessageAt: serverTimestamp(),
                unreadByAdmin: !isAdmin,
                unreadByUser: isAdmin,
                status: 'Em Andamento',
            }, { merge: true });

            setMessage('');
        }
    };
    
    const handleCloseTicket = () => {
        const ticketRef = doc(firestore, 'tickets', ticket.id);
        setDocumentNonBlocking(ticketRef, { status: 'Fechado' }, { merge: true });
    };

    const formatTimestamp = (timestamp: any) => {
        if (!timestamp) return '';
        const date = timestamp instanceof Timestamp ? timestamp.toDate() : new Date(timestamp.seconds * 1000);
        return formatDistanceToNow(date, { addSuffix: true, locale: ptBR });
    }

    const renderSender = (msg: TicketMessage) => {
        return (
            <div className="flex items-center gap-2">
                {msg.isAgent ? <User className="h-4 w-4 text-muted-foreground" /> : <Briefcase className="h-4 w-4 text-primary" />}
                <p className="font-semibold text-sm">{msg.senderName}</p>
            </div>
        );
    }

    return (
        <>
            <header className="flex items-center justify-between gap-4 p-4 border-b">
                <div className='overflow-hidden'>
                    <h2 className="font-semibold text-lg truncate">{ticket.subject}</h2>
                    <p className="text-sm text-muted-foreground">Ticket aberto por {ticket.userName}</p>
                </div>
                {isAdmin && ticket.status !== 'Fechado' && (
                    <Button variant="outline" size="sm" onClick={handleCloseTicket}>
                        <XCircle className="mr-2 h-4 w-4" />
                        Fechar Ticket
                    </Button>
                )}
            </header>
            <ScrollArea className="flex-1 p-4 md:p-6 bg-muted/20">
                <div className="space-y-6">
                    {isLoadingMessages ? (
                        <div className="flex justify-center items-center h-full">Carregando mensagens...</div>
                    ) : (
                        messages?.map((msg) => (
                            <div
                                key={msg.id}
                                className={cn(
                                    'flex items-start gap-4',
                                    (isAdmin && !msg.isAgent) || (!isAdmin && msg.isAgent) ? 'flex-row-reverse' : 'flex-row'
                                )}
                            >
                                <div className={cn(
                                    'flex flex-col gap-2 p-3 rounded-lg shadow-sm max-w-lg',
                                    (isAdmin && !msg.isAgent) || (!isAdmin && msg.isAgent) ? 'bg-primary text-primary-foreground' : 'bg-card'
                                )}>
                                    {renderSender(msg)}
                                    <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                                    <p className="text-xs opacity-70 text-right mt-1">{formatTimestamp(msg.timestamp)}</p>
                                </div>
                            </div>
                        ))
                    )}
                    <div ref={endOfMessagesRef} />
                </div>
            </ScrollArea>
            <footer className="p-4 border-t bg-background">
                 {ticket.status === 'Fechado' ? (
                    <div className="text-center text-muted-foreground p-4 border rounded-md">
                        Este ticket foi fechado.
                    </div>
                ) : (
                    <div className="relative">
                        <Textarea
                            placeholder="Digite sua resposta..."
                            value={message}
                            onChange={(e) => setMessage(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' && !e.shiftKey) {
                                    e.preventDefault();
                                    handleSendMessage();
                                }
                            }}
                            className="pr-20"
                            rows={3}
                        />
                        <Button
                            size="icon"
                            className="absolute right-3 top-1/2 -translate-y-1/2"
                            onClick={handleSendMessage}
                            disabled={!message.trim()}
                        >
                            <Send className="h-5 w-5" />
                            <span className="sr-only">Enviar</span>
                        </Button>
                    </div>
                )}
            </footer>
        </>
    );
}
