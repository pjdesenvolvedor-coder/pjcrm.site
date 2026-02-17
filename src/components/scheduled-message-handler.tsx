'use client';

import { useEffect, useRef } from 'react';
import { collection, query, where, Timestamp, doc, runTransaction } from 'firebase/firestore';
import { useFirebase, useUser, useCollection, useMemoFirebase, setDocumentNonBlocking, useDoc } from '@/firebase';
import type { ScheduledMessage, Settings, UserProfile } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';
import { addDays } from 'date-fns';

// This component is invisible and handles the logic for sending scheduled messages.
export function ScheduledMessageHandler() {
    const { firestore, user } = useFirebase();
    const { toast } = useToast();
    const processingRef = useRef(new Set<string>()); // Keep track of processing messages

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
        // Fetch messages that are ready to be processed or potentially stuck.
        return query(messagesRef, where("status", "in", ["Scheduled", "Sending"]));
    }, [user, firestore]);

    const { data: messagesToCheck } = useCollection<ScheduledMessage>(scheduledMessagesQuery);

    useEffect(() => {
        const checkScheduledMessages = () => {
            // Check subscription status first
            if (userProfile && userProfile.role !== 'Admin' && userProfile.subscriptionEndDate && userProfile.subscriptionEndDate.toDate() < new Date()) {
                return; // Subscription expired, do nothing.
            }

            if (!messagesToCheck || messagesToCheck.length === 0 || !settings?.webhookToken || !user || !firestore) {
                return;
            }

            const now = new Date();
            const token = settings.webhookToken;
            const STALE_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

            const processMessage = async (msg: ScheduledMessage) => {
                if (processingRef.current.has(msg.id)) {
                    return; // Already processing this message in this client
                }
                
                const messageDocRef = doc(firestore, 'users', user.uid, 'scheduled_messages', msg.id);
                
                try {
                    processingRef.current.add(msg.id); // Mark as processing locally

                    // This transaction will atomically claim the message for sending.
                    await runTransaction(firestore, async (transaction) => {
                        const messageDoc = await transaction.get(messageDocRef);

                        if (!messageDoc.exists()) throw new Error("deleted");
                        
                        const data = messageDoc.data() as ScheduledMessage;
                        
                        // Check if it's a stale 'Sending' message
                        if (data.status === 'Sending') {
                            const claimedAt = data.claimedAt?.toDate();
                            if (claimedAt && (now.getTime() - claimedAt.getTime()) > STALE_TIMEOUT_MS) {
                                // It is stale. This process will take over.
                            } else {
                                // It's not stale, another process is (supposedly) working on it.
                                throw new Error("already being processed");
                            }
                        } 
                        // Check if it's a 'Scheduled' message that is due
                        else if (data.status === 'Scheduled') {
                             if (data.sendAt.toDate() > now) {
                                throw new Error("not due yet");
                            }
                        }
                        // Any other status ('Sent', 'Error') should not be processed
                        else {
                            throw new Error("already processed");
                        }
                        
                        // If we are here, we claim the message
                        transaction.update(messageDocRef, { 
                            status: 'Sending',
                            claimedAt: Timestamp.now()
                        });
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
                        setDocumentNonBlocking(messageDocRef, { status: 'Error', claimedAt: null }, { merge: true });
                        throw new Error(`Falha ao enviar mensagem para o grupo ${msg.jid}`);
                    }

                    // Message sent successfully, now update its final state.
                    if (msg.repeatDaily) {
                        const nextSendAt = addDays(msg.sendAt.toDate(), 1);
                        // Reschedule for the next day and set back to 'Scheduled'
                        setDocumentNonBlocking(messageDocRef, { 
                            sendAt: Timestamp.fromDate(nextSendAt),
                            status: 'Scheduled',
                            claimedAt: null,
                        }, { merge: true });
                        toast({
                            title: "Mensagem recorrente enviada e reagendada.",
                            description: `A mensagem para o grupo ${msg.jid} foi enviada e será enviada novamente amanhã.`,
                        });
                    } else {
                        // Mark as sent permanently.
                        setDocumentNonBlocking(messageDocRef, { status: 'Sent', claimedAt: null }, { merge: true });
                        toast({
                            title: "Mensagem Agendada Enviada!",
                            description: `A mensagem para o grupo ${msg.jid} foi enviada com sucesso.`,
                        });
                    }

                } catch (error: any) {
                    // Filter out non-actionable errors (race conditions, not due yet)
                    if (error.message.includes("already being processed") || error.message.includes("not due yet") || error.message.includes("deleted")) {
                       // Silently ignore
                    } else {
                        // This is a real error (e.g., webhook failed, transaction failed due to network).
                        console.error("Failed to send scheduled message:", error);
                        // The status is already set to 'Error' if webhook fails after transaction
                        toast({
                            variant: "destructive",
                            title: "Erro no Agendamento",
                            description: error.message || `Não foi possível enviar a mensagem agendada para ${msg.jid}.`,
                        });
                    }
                } finally {
                    processingRef.current.delete(msg.id); // Unmark as processing
                }
            };
            
            for (const msg of messagesToCheck) {
                processMessage(msg);
            }
        };
        
        // Check every 30 seconds
        const intervalId = setInterval(checkScheduledMessages, 30 * 1000);

        // Initial check
        checkScheduledMessages();

        // Cleanup on unmount
        return () => clearInterval(intervalId);

    }, [messagesToCheck, settings, firestore, user, toast, userProfile]);

    return null; // This component doesn't render anything
}
