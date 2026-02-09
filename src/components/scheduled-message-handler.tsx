'use client';

import { useEffect } from 'react';
import { collection, query, where, Timestamp, doc } from 'firebase/firestore';
import { useFirebase, useUser, useCollection, useMemoFirebase, setDocumentNonBlocking, useDoc } from '@/firebase';
import type { ScheduledMessage, Settings } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';
import { add } from 'date-fns';

// This component is invisible and handles the logic for sending scheduled messages.
export function ScheduledMessageHandler() {
    const { firestore, user } = useFirebase();
    const { toast } = useToast();

    const settingsDocRef = useMemoFirebase(() => {
        if (!user) return null;
        return doc(firestore, 'users', user.uid, 'settings', 'config');
    }, [firestore, user]);
    const { data: settings } = useDoc<Settings>(settingsDocRef);
    
    const scheduledMessagesQuery = useMemoFirebase(() => {
        if (!user) return null;
        const messagesRef = collection(firestore, 'users', user.uid, 'scheduled_messages');
        // Only fetch messages that are 'Scheduled'.
        return query(messagesRef, where("status", "==", "Scheduled"));
    }, [user, firestore]);

    const { data: scheduledMessages } = useCollection<ScheduledMessage>(scheduledMessagesQuery);

    useEffect(() => {
        const checkScheduledMessages = async () => {
            if (!scheduledMessages || scheduledMessages.length === 0 || !settings?.webhookToken) {
                return;
            }

            const now = new Date();
            const token = settings.webhookToken;

            for (const msg of scheduledMessages) {
                if (msg.sendAt.toDate() <= now) {
                    // Time to send the message
                    try {
                        const response = await fetch('/api/send-group-message', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                jid: msg.jid,
                                message: msg.message,
                                imageUrl: msg.imageUrl,
                                token: token,
                            }),
                        });

                        if (!response.ok) {
                           throw new Error(`Falha ao enviar mensagem agendada para ${msg.jid}`);
                        }
                        
                        const messageDocRef = doc(firestore, 'users', user!.uid, 'scheduled_messages', msg.id);

                        if (msg.repeatDaily) {
                            // Reschedule for the next day
                            const nextSendAt = add(msg.sendAt.toDate(), { days: 1 });
                            setDocumentNonBlocking(messageDocRef, { sendAt: Timestamp.fromDate(nextSendAt) }, { merge: true });
                            toast({
                                title: "Mensagem recorrente reenviada e reagendada.",
                                description: `A mensagem para o grupo ${msg.jid} foi enviada e será enviada novamente amanhã.`,
                            });
                        } else {
                            // Mark as sent
                            setDocumentNonBlocking(messageDocRef, { status: 'Sent' }, { merge: true });
                            toast({
                                title: "Mensagem Agendada Enviada!",
                                description: `A mensagem para o grupo ${msg.jid} foi enviada com sucesso.`,
                            });
                        }

                    } catch (error: any) {
                        console.error("Failed to send scheduled message:", error);
                        const messageDocRef = doc(firestore, 'users', user!.uid, 'scheduled_messages', msg.id);
                        setDocumentNonBlocking(messageDocRef, { status: 'Error' }, { merge: true });
                        toast({
                            variant: "destructive",
                            title: "Erro no Agendamento",
                            description: error.message || `Não foi possível enviar a mensagem agendada para ${msg.jid}.`,
                        });
                    }
                }
            }
        };
        
        // Check every minute
        const intervalId = setInterval(checkScheduledMessages, 60 * 1000);

        // Initial check
        checkScheduledMessages();

        // Cleanup on unmount
        return () => clearInterval(intervalId);

    }, [scheduledMessages, settings, firestore, user, toast]);

    return null; // This component doesn't render anything
}
