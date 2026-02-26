'use client';

import { useEffect, useRef } from 'react';
import { collection, query, where, Timestamp, doc, runTransaction } from 'firebase/firestore';
import { useFirebase, useUser, useCollection, useMemoFirebase, setDocumentNonBlocking, useDoc } from '@/firebase';
import type { ScheduledMessage, Settings, UserProfile } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';
import { addDays } from 'date-fns';

export function ScheduledMessageHandler() {
    const { firestore, user } = useFirebase();
    const { toast } = useToast();
    const processingRef = useRef(new Set<string>());
    const lastErrorTimeRef = useRef<number>(0);
    const quotaExceededRef = useRef<boolean>(false);
    const ERROR_THROTTLE_MS = 300000; // Mostra apenas um erro a cada 5 minutos em caso de cota

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
        return query(messagesRef, where("status", "in", ["Scheduled", "Sending"]));
    }, [user, firestore]);

    const { data: messagesToCheck } = useCollection<ScheduledMessage>(scheduledMessagesQuery);

    useEffect(() => {
        const checkScheduledMessages = () => {
            // Se já detectamos cota excedida recentemente, esperamos o reset
            if (quotaExceededRef.current) {
                const now = Date.now();
                if (now - lastErrorTimeRef.current < ERROR_THROTTLE_MS) return;
                quotaExceededRef.current = false;
            }

            if (userProfile && userProfile.role !== 'Admin' && userProfile.subscriptionEndDate && userProfile.subscriptionEndDate.toDate() < new Date()) {
                return;
            }

            if (!messagesToCheck || messagesToCheck.length === 0 || !settings?.webhookToken || !user || !firestore) {
                return;
            }

            const now = new Date();
            const token = settings.webhookToken;
            const STALE_TIMEOUT_MS = 5 * 60 * 1000;

            const processMessage = async (msg: ScheduledMessage) => {
                if (processingRef.current.has(msg.id)) return;
                
                const messageDocRef = doc(firestore, 'users', user.uid, 'scheduled_messages', msg.id);
                
                try {
                    processingRef.current.add(msg.id);

                    await runTransaction(firestore, async (transaction) => {
                        const messageDoc = await transaction.get(messageDocRef);
                        if (!messageDoc.exists()) throw new Error("deleted");
                        const data = messageDoc.data() as ScheduledMessage;
                        
                        if (data.status === 'Sending') {
                            const claimedAt = data.claimedAt?.toDate();
                            if (!claimedAt || (now.getTime() - claimedAt.getTime()) <= STALE_TIMEOUT_MS) {
                                throw new Error("already being processed");
                            }
                        } else if (data.status === 'Scheduled') {
                             if (data.sendAt.toDate() > now) {
                                throw new Error("not due yet");
                            }
                        } else {
                            throw new Error("already processed");
                        }
                        
                        transaction.update(messageDocRef, { 
                            status: 'Sending',
                            claimedAt: Timestamp.now()
                        });
                    });

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

                    if (msg.repeatDaily) {
                        const nextSendAt = addDays(msg.sendAt.toDate(), 1);
                        setDocumentNonBlocking(messageDocRef, { 
                            sendAt: Timestamp.fromDate(nextSendAt),
                            status: 'Scheduled',
                            claimedAt: null,
                        }, { merge: true });
                    } else {
                        setDocumentNonBlocking(messageDocRef, { status: 'Sent', claimedAt: null }, { merge: true });
                        toast({
                            title: "Mensagem Agendada Enviada!",
                            description: `A mensagem para o grupo foi enviada com sucesso.`,
                        });
                    }

                } catch (error: any) {
                    const isQuota = error.message?.includes("Quota exceeded") || error.code === 'resource-exhausted';
                    
                    if (isQuota) {
                        quotaExceededRef.current = true;
                        const currentTime = Date.now();
                        if (currentTime - lastErrorTimeRef.current > ERROR_THROTTLE_MS) {
                            toast({
                                variant: "destructive",
                                title: "Cota de Uso Atingida",
                                description: "O limite gratuito do banco de dados foi atingido. As automações voltarão a funcionar em breve.",
                            });
                            lastErrorTimeRef.current = currentTime;
                        }
                    } else if (!error.message.includes("already being processed") && !error.message.includes("not due yet") && !error.message.includes("deleted")) {
                        console.error("Failed to send scheduled message:", error);
                    }
                } finally {
                    processingRef.current.delete(msg.id);
                }
            };
            
            for (const msg of messagesToCheck) {
                processMessage(msg);
            }
        };
        
        // Interval increased to 2 minutes to save Firebase credits
        const intervalId = setInterval(checkScheduledMessages, 2 * 60 * 1000);
        checkScheduledMessages();
        return () => clearInterval(intervalId);

    }, [messagesToCheck, settings, firestore, user, toast, userProfile]);

    return null;
}
