
'use client';

import { useEffect, useRef } from 'react';
import { collection, query, where, Timestamp, doc, runTransaction, serverTimestamp } from 'firebase/firestore';
import { useFirebase, useUser, useCollection, useMemoFirebase, setDocumentNonBlocking, useDoc } from '@/firebase';
import type { ScheduledMessage, Settings, UserProfile } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';
import { addDays } from 'date-fns';
import { addDocumentNonBlocking } from '@/firebase/non-blocking-updates';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const MANDATORY_DELAY = 30000; // 30 seconds

export function ScheduledMessageHandler() {
    const { firestore, user } = useFirebase();
    const { toast } = useToast();
    const processingRef = useRef(new Set<string>());

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
        const checkScheduledMessages = async () => {
            if (userProfile && userProfile.role !== 'Admin' && userProfile.subscriptionEndDate && userProfile.subscriptionEndDate.toDate() < new Date()) {
                return;
            }

            if (!messagesToCheck || messagesToCheck.length === 0 || !settings?.webhookToken || !user || !firestore) {
                return;
            }

            const now = new Date();
            const token = settings.webhookToken;
            const STALE_TIMEOUT_MS = 2 * 60 * 1000;
            
            const dueMessages = messagesToCheck.filter(msg => {
                if (msg.status === 'Sending') {
                    const claimedAt = msg.claimedAt?.toDate();
                    return claimedAt && (now.getTime() - claimedAt.getTime()) > STALE_TIMEOUT_MS;
                }
                return msg.sendAt.toDate() <= now;
            });

            if (dueMessages.length === 0) return;

            // Regra: Se tem mais de 1 mensagem pendente, delay de 30s entre elas
            const currentDelay = dueMessages.length > 1 ? MANDATORY_DELAY : 0;

            const processMessage = async (msg: ScheduledMessage, isLast: boolean) => {
                if (processingRef.current.has(msg.id)) return;
                
                const messageDocRef = doc(firestore, 'users', user.uid, 'scheduled_messages', msg.id);
                const logRef = collection(firestore, 'users', user.uid, 'logs');
                
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

                    addDocumentNonBlocking(logRef, {
                        userId: user.uid,
                        type: 'Grupo',
                        clientName: 'Grupo WhatsApp',
                        target: msg.jid,
                        status: 'Enviando',
                        delayApplied: currentDelay / 1000,
                        timestamp: serverTimestamp(),
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
                        addDocumentNonBlocking(logRef, {
                            userId: user.uid,
                            type: 'Grupo',
                            clientName: 'Grupo WhatsApp',
                            target: msg.jid,
                            status: 'Erro',
                            delayApplied: currentDelay / 1000,
                            timestamp: serverTimestamp(),
                        });
                        throw new Error(`Falha no envio para o grupo ${msg.jid}`);
                    }

                    addDocumentNonBlocking(logRef, {
                        userId: user.uid,
                        type: 'Grupo',
                        clientName: 'Grupo WhatsApp',
                        target: msg.jid,
                        status: 'Enviado',
                        delayApplied: currentDelay / 1000,
                        timestamp: serverTimestamp(),
                    });

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
                            title: "Grupo Processado",
                            description: `Mensagem enviada com sucesso.`,
                        });
                    }

                    if (!isLast && currentDelay > 0) {
                        await sleep(currentDelay);
                    }

                } catch (error: any) {
                } finally {
                    processingRef.current.delete(msg.id);
                }
            };
            
            for (let i = 0; i < dueMessages.length; i++) {
                await processMessage(dueMessages[i], i === dueMessages.length - 1);
            }
        };
        
        const intervalId = setInterval(checkScheduledMessages, 30000); // Check every 30 seconds
        checkScheduledMessages();
        return () => clearInterval(intervalId);

    }, [messagesToCheck, settings, firestore, user, toast, userProfile]);

    return null;
}
