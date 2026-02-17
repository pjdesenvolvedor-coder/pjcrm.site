'use client';

import { useEffect } from 'react';
import { collection, query, where, Timestamp, doc, runTransaction } from 'firebase/firestore';
import { useFirebase, useUser, useCollection, useMemoFirebase, setDocumentNonBlocking, useDoc } from '@/firebase';
import type { ScheduledMessage, Settings, UserProfile } from '@/lib/types';
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
    
    const userDocRef = useMemoFirebase(() => {
        if (!user) return null;
        return doc(firestore, 'users', user.uid);
    }, [firestore, user]);
    const { data: userProfile } = useDoc<UserProfile>(userDocRef);
    
    const scheduledMessagesQuery = useMemoFirebase(() => {
        if (!user) return null;
        const messagesRef = collection(firestore, 'users', user.uid, 'scheduled_messages');
        // Only fetch messages that are 'Scheduled'.
        return query(messagesRef, where("status", "==", "Scheduled"));
    }, [user, firestore]);

    const { data: scheduledMessages } = useCollection<ScheduledMessage>(scheduledMessagesQuery);

    useEffect(() => {
        const checkScheduledMessages = () => {
            // Check subscription status first
            if (userProfile && userProfile.role !== 'Admin' && userProfile.subscriptionEndDate && userProfile.subscriptionEndDate.toDate() < new Date()) {
                return; // Subscription expired, do nothing.
            }

            if (!scheduledMessages || scheduledMessages.length === 0 || !settings?.webhookToken || !user || !firestore) {
                return;
            }

            const now = new Date();
            const token = settings.webhookToken;

            const processMessage = async (msg: ScheduledMessage) => {
                const messageDocRef = doc(firestore, 'users', user.uid, 'scheduled_messages', msg.id);
                
                try {
                    // This transaction will atomically claim the message for sending.
                    await runTransaction(firestore, async (transaction) => {
                        const messageDoc = await transaction.get(messageDocRef);

                        if (!messageDoc.exists()) {
                            // The document was deleted, do nothing.
                            throw new Error("Document deleted."); 
                        }
                        
                        // Check if the message is still in 'Scheduled' state.
                        if (messageDoc.data().status !== 'Scheduled') {
                            // Another process has already claimed this message. Stop processing.
                            throw new Error("Message already being processed.");
                        }
                        
                        // Claim the message by updating its status.
                        transaction.update(messageDocRef, { status: 'Sending' });
                    });

                    // If the transaction succeeded, this client instance now "owns" the job.
                    // Proceed to send the message.
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
                        throw new Error(`Falha ao enviar mensagem para o grupo ${msg.jid}`);
                    }

                    // Message sent successfully, now update its final state.
                    if (msg.repeatDaily) {
                        const nextSendAt = add(msg.sendAt.toDate(), { days: 1 });
                        // Reschedule for the next day and set back to 'Scheduled'
                        setDocumentNonBlocking(messageDocRef, { 
                            sendAt: Timestamp.fromDate(nextSendAt),
                            status: 'Scheduled' 
                        }, { merge: true });
                        toast({
                            title: "Mensagem recorrente enviada e reagendada.",
                            description: `A mensagem para o grupo ${msg.jid} foi enviada e será enviada novamente amanhã.`,
                        });
                    } else {
                        // Mark as sent permanently.
                        setDocumentNonBlocking(messageDocRef, { status: 'Sent' }, { merge: true });
                        toast({
                            title: "Mensagem Agendada Enviada!",
                            description: `A mensagem para o grupo ${msg.jid} foi enviada com sucesso.`,
                        });
                    }

                } catch (error: any) {
                    if (error.message.includes("already being processed") || error.message.includes("deleted")) {
                        // This is not a "real" error, just another client instance winning the race.
                        // We can safely ignore it.
                    } else {
                        // This is a real error (e.g., webhook failed, transaction failed due to network).
                        console.error("Failed to send scheduled message:", error);
                        // Mark the message as 'Error' so we don't try to send it again.
                        setDocumentNonBlocking(messageDocRef, { status: 'Error' }, { merge: true });
                        toast({
                            variant: "destructive",
                            title: "Erro no Agendamento",
                            description: error.message || `Não foi possível enviar a mensagem agendada para ${msg.jid}.`,
                        });
                    }
                }
            };
            
            for (const msg of scheduledMessages) {
                if (msg.sendAt.toDate() <= now) {
                    processMessage(msg);
                }
            }
        };
        
        // Check every minute
        const intervalId = setInterval(checkScheduledMessages, 60 * 1000);

        // Initial check
        checkScheduledMessages();

        // Cleanup on unmount
        return () => clearInterval(intervalId);

    }, [scheduledMessages, settings, firestore, user, toast, userProfile]);

    return null; // This component doesn't render anything
}
