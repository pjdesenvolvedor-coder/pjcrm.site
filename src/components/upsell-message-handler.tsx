
'use client';

import { useEffect, useRef } from 'react';
import { collection, query, where, doc, runTransaction, arrayUnion, serverTimestamp } from 'firebase/firestore';
import { useFirebase, useUser, useCollection, useMemoFirebase, useDoc } from '@/firebase';
import type { Client, Settings, UserProfile, UpsellConfig } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';
import { addDocumentNonBlocking } from '@/firebase/non-blocking-updates';

import { getZapToken } from '@/lib/zapToken';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const MANDATORY_DELAY = 30000; // 30 seconds

function getTimestampMs(val: any): number | null {
    if (!val) return null;
    if (typeof val === 'number') return val;
    if (typeof val.toMillis === 'function') return val.toMillis();
    if (typeof val.toDate === 'function') return val.toDate().getTime();
    if (val.seconds !== undefined) return val.seconds * 1000;
    if (val instanceof Date) return val.getTime();
    if (typeof val === 'string') {
        const ms = new Date(val).getTime();
        return isNaN(ms) ? null : ms;
    }
    return null;
}

function formatDateSafe(val: any): string {
    const ms = getTimestampMs(val);
    if (!ms) return 'N/A';
    try {
        return format(new Date(ms), 'dd/MM/yyyy');
    } catch {
        return 'N/A';
    }
}

export function UpsellMessageHandler() {
    const { firestore, user } = useFirebase();
    const { toast } = useToast();
    const isProcessing = useRef(false);

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

    const activeClientsQuery = useMemoFirebase(() => {
        if (!user || !firestore) return null;
        const clientsRef = collection(firestore, 'users', user.uid, 'clients');
        return query(clientsRef, where("status", "==", "Ativo"));
    }, [user, firestore]);
    const { data: activeClients } = useCollection<Client>(activeClientsQuery);

    useEffect(() => {
        const processUpsellQueue = async () => {
            if (isProcessing.current) return;

            if (userProfile && userProfile.role !== 'Admin' && userProfile.subscriptionEndDate && userProfile.subscriptionEndDate.toDate() < new Date()) {
                return;
            }

            let activeUpsells: UpsellConfig[] = [];
            if (settings?.upsells && settings.upsells.length > 0) {
                activeUpsells = settings.upsells.filter(u => u.isActive && u.upsellMessage);
            } else if (settings?.isUpsellActive && settings?.upsellMessage) {
                activeUpsells = [{
                    id: 'legacy-1',
                    isActive: true,
                    upsellDelayMinutes: settings.upsellDelayMinutes ?? 5,
                    upsellMessage: settings.upsellMessage,
                    createdAt: 0,
                }];
            }

            const mainToken = settings?.webhookToken || settings?.billingWebhookToken;

            if (!activeClients || activeClients.length === 0 || activeUpsells.length === 0 || !mainToken || !user || !firestore) {
                return;
            }

            try {
                isProcessing.current = true;
                const now = new Date();
                
                const tasks: { client: Client, upsell: UpsellConfig }[] = [];
                for (const client of activeClients) {
                    const clientCreatedMs = getTimestampMs(client.createdAt);
                    if (!clientCreatedMs) continue;

                    for (const upsell of activeUpsells) {
                        const upsellCreatedMs = Number(upsell.createdAt) || 0;
                        // Skip historical clients created more than 10 minutes before the upsell rule was created
                        if (upsellCreatedMs > 0) {
                            const cutoffMs = upsellCreatedMs - (10 * 60 * 1000);
                            if (clientCreatedMs < cutoffMs) continue;
                        }

                        const delayMinutes = Number(upsell.upsellDelayMinutes) || 0;
                        const delayMs = delayMinutes * 60 * 1000;
                        
                        if ((now.getTime() - clientCreatedMs) >= delayMs && !client.sentUpsellIds?.includes(upsell.id)) {
                            tasks.push({ client, upsell });
                        }
                    }
                }

                if (tasks.length === 0) {
                    return;
                }

                const currentDelay = tasks.length > 1 ? MANDATORY_DELAY : 0;

                const processTask = async (task: typeof tasks[0], isLast: boolean) => {
                    const { client, upsell } = task;
                    const clientDocRef = doc(firestore, 'users', user.uid, 'clients', client.id);
                    const logRef = collection(firestore, 'users', user.uid, 'logs');

                    try {
                        let shouldSend = false;
                        await runTransaction(firestore, async (transaction) => {
                            const clientDoc = await transaction.get(clientDocRef);
                            if (!clientDoc.exists()) throw new Error("deleted");
                            const sentIds = clientDoc.data().sentUpsellIds || [];
                            if (sentIds.includes(upsell.id)) throw new Error("already sent");
                            transaction.update(clientDocRef, { sentUpsellIds: arrayUnion(upsell.id) });
                            shouldSend = true;
                        });

                        if (!shouldSend) return;

                        addDocumentNonBlocking(logRef, {
                            userId: user.uid,
                            type: 'Upsell',
                            clientName: client.name,
                            target: client.phone,
                            status: 'Enviando',
                            delayApplied: currentDelay / 1000,
                            timestamp: serverTimestamp(),
                        });

                        let formattedMessage = upsell.upsellMessage
                            .replace(/{cliente}/g, client.name || '')
                            .replace(/{telefone}/g, client.phone || '')
                            .replace(/{email}/g, Array.isArray(client.email) ? client.email.join(', ') : (client.email || ''))
                            .replace(/{assinatura}/g, client.subscription || '')
                            .replace(/{vencimento}/g, formatDateSafe(client.dueDate))
                            .replace(/{valor}/g, client.amountPaid || '0,00')
                            .replace(/{senha}/g, client.password || 'N/A')
                            .replace(/{tela}/g, client.screen || 'N/A')
                            .replace(/{pin_tela}/g, client.pinScreen || 'N/A')
                            .replace(/{status}/g, client.status || 'Ativo');

                        const response = await fetch('/api/send-message', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                message: formattedMessage,
                                phoneNumber: client.phone,
                                token: mainToken,
                            }),
                        });

                        if (response.ok) {
                            addDocumentNonBlocking(logRef, {
                                userId: user.uid,
                                type: 'Upsell',
                                clientName: client.name,
                                target: client.phone,
                                status: 'Enviado',
                                delayApplied: currentDelay / 1000,
                                timestamp: serverTimestamp(),
                            });
                            toast({ title: "Upsell OK", description: `Enviado para ${client.name}.` });
                        } else {
                            addDocumentNonBlocking(logRef, {
                                userId: user.uid,
                                type: 'Upsell',
                                clientName: client.name,
                                target: client.phone,
                                status: 'Erro',
                                delayApplied: currentDelay / 1000,
                                timestamp: serverTimestamp(),
                            });
                        }

                        if (!isLast && currentDelay > 0) {
                            await sleep(currentDelay);
                        }

                    } catch (error: any) {
                        console.error("Error processing upsell task:", error);
                    }
                };

                for (let i = 0; i < tasks.length; i++) {
                    await processTask(tasks[i], i === tasks.length - 1);
                }
            } catch (err) {
                console.error("Error in processUpsellQueue:", err);
            } finally {
                isProcessing.current = false;
            }
        };

        const intervalId = setInterval(processUpsellQueue, 60000); // Check every minute
        processUpsellQueue();
        return () => clearInterval(intervalId);

    }, [activeClients, settings, firestore, user, toast, userProfile]);

    return null;
}
