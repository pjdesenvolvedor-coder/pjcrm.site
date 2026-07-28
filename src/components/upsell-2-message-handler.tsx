'use client';

import { useEffect, useRef } from 'react';
import { collection, doc, runTransaction, serverTimestamp } from 'firebase/firestore';
import { useFirebase, useCollection, useMemoFirebase, useDoc } from '@/firebase';
import type { Client, Settings, UserProfile, UpsellConfig } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';
import { addDocumentNonBlocking } from '@/firebase/non-blocking-updates';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const MANDATORY_DELAY = 30000; // 30 seconds between multiple sends
const STRICT_CUTOFF_MS = 1770008540000; // 28/07/2026 00:42:20 - ZERO messages to clients created before this time

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

export function Upsell2MessageHandler() {
    const { firestore, user } = useFirebase();
    const { toast } = useToast();
    const isProcessing = useRef(false);

    const settingsDocRef = useMemoFirebase(() => {
        if (!user || !firestore) return null;
        return doc(firestore, 'users', user.uid, 'settings', 'config');
    }, [firestore, user]);
    const { data: settings } = useDoc<Settings>(settingsDocRef);
    
    const userDocRef = useMemoFirebase(() => {
        if (!user || !firestore) return null;
        return doc(firestore, 'users', user.uid);
    }, [firestore, user]);
    const { data: userProfile } = useDoc<UserProfile>(userDocRef);

    const allClientsQuery = useMemoFirebase(() => {
        if (!user || !firestore) return null;
        return collection(firestore, 'users', user.uid, 'clients');
    }, [user, firestore]);
    const { data: clients } = useCollection<Client>(allClientsQuery);

    useEffect(() => {
        const processUpsell2Queue = async () => {
            if (isProcessing.current) return;

            if (userProfile && userProfile.role !== 'Admin' && userProfile.subscriptionEndDate) {
                const subEndMs = getTimestampMs(userProfile.subscriptionEndDate);
                if (subEndMs && subEndMs < Date.now()) return;
            }

            // KILL SWITCH: If no upsell 2.0 rule is active, HALT IMMEDIATELY AND DO NOTHING
            const activeUpsells2 = settings?.upsells2?.filter(u => Boolean(u.isActive) && Boolean(u.upsellMessage && u.upsellMessage.trim())) || [];
            if (activeUpsells2.length === 0) {
                return;
            }

            const mainToken = settings?.webhookToken || settings?.billingWebhookToken;
            const activeClients = clients?.filter(c => c.status !== 'Inativo' && c.status !== 'Vencido') || [];

            if (activeClients.length === 0 || !mainToken || !user || !firestore) {
                return;
            }

            try {
                isProcessing.current = true;
                const now = Date.now();
                
                const tasks: { client: Client, upsell: UpsellConfig }[] = [];
                for (const client of activeClients) {
                    const clientCreatedMs = getTimestampMs(client.createdAt) || now;

                    for (const upsell of activeUpsells2) {
                        const upsellCreatedMs = Number(upsell.createdAt) || STRICT_CUTOFF_MS;
                        
                        // UNIVERSAL RULE: Skip any client created BEFORE this specific upsell rule was created
                        if (clientCreatedMs < upsellCreatedMs) {
                            continue;
                        }

                        const delayMinutes = Number(upsell.upsellDelayMinutes) || 0;
                        const delayMs = delayMinutes * 60 * 1000;
                        
                        if ((now - clientCreatedMs) >= delayMs && !client.sentUpsell2Ids?.includes(upsell.id)) {
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

                    // LIVE CHECK: Re-verify if rule is STILL active before sending
                    const currentRuleState = settings?.upsells2?.find(u => u.id === upsell.id);
                    if (!currentRuleState || !currentRuleState.isActive) {
                        return; // Discard immediately if turned off
                    }

                    const clientDocRef = doc(firestore, 'users', user.uid, 'clients', client.id);
                    const logRef = collection(firestore, 'users', user.uid, 'logs');

                    try {
                        let claimSuccessful = false;

                        // ATOMIC CONCURRENCY LOCK (runTransaction): Prevents duplicate sends across 200 open tabs
                        await runTransaction(firestore, async (transaction) => {
                            const clientSnap = await transaction.get(clientDocRef);
                            if (!clientSnap.exists()) return;
                            const clientData = clientSnap.data() as Client;
                            const currentSentIds = clientData.sentUpsell2Ids || [];

                            if (currentSentIds.includes(upsell.id)) {
                                throw new Error('ALREADY_CLAIMED');
                            }

                            const updatedSentIds = Array.from(new Set([...currentSentIds, upsell.id]));
                            transaction.update(clientDocRef, { sentUpsell2Ids: updatedSentIds });
                            claimSuccessful = true;
                        }).catch(() => {
                            claimSuccessful = false;
                        });

                        // If another tab/thread won the transaction first, ABORT DISPATCH IMMEDIATELY!
                        if (!claimSuccessful) {
                            return;
                        }

                        addDocumentNonBlocking(logRef, {
                            userId: user.uid,
                            type: 'Upsell 2.0',
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

                        let response;
                        if (upsell.messageType === 'button' && upsell.buttons && upsell.buttons.length > 0) {
                            const choices = upsell.buttons.map(b => {
                                const formattedLabel = b.label
                                    .replace(/{cliente}/g, client.name || '')
                                    .replace(/{assinatura}/g, client.subscription || '');
                                return `${formattedLabel.trim()}|${b.url.trim()}`;
                            });

                            let formattedFooter = upsell.footerText ? upsell.footerText.replace(/{cliente}/g, client.name || '') : undefined;

                            // DISPATCH ONLY TO /api/send-menu FOR BUTTON CARDS (NO DOUBLE TEXT MESSAGE)
                            response = await fetch('/api/send-menu', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({
                                    phoneNumber: client.phone,
                                    type: 'button',
                                    text: formattedMessage,
                                    choices: choices,
                                    imageButton: upsell.imageButton,
                                    footerText: formattedFooter,
                                    token: mainToken,
                                }),
                            });
                        } else {
                            // DISPATCH ONLY TO /api/send-message FOR TEXT MESSAGES
                            response = await fetch('/api/send-message', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({
                                    message: formattedMessage,
                                    phoneNumber: client.phone,
                                    token: mainToken,
                                }),
                            });
                        }

                        const resData = await response.json().catch(() => ({}));

                        if (response.ok) {
                            addDocumentNonBlocking(logRef, {
                                userId: user.uid,
                                type: 'Upsell 2.0',
                                clientName: client.name,
                                target: client.phone,
                                status: 'Enviado',
                                delayApplied: currentDelay / 1000,
                                timestamp: serverTimestamp(),
                            });
                            toast({ title: "Upsell 2.0 Enviado! 🚀", description: `Entregue para ${client.name}.` });
                        } else {
                            console.error("Falha ao enviar Upsell 2.0:", resData);
                            addDocumentNonBlocking(logRef, {
                                userId: user.uid,
                                type: 'Upsell 2.0',
                                clientName: client.name,
                                target: client.phone,
                                status: 'Erro',
                                delayApplied: currentDelay / 1000,
                                timestamp: serverTimestamp(),
                                details: resData?.error || resData?.details || 'Erro no envio da API',
                            });
                        }

                        if (!isLast && currentDelay > 0) {
                            await sleep(currentDelay);
                        }

                    } catch (error: any) {
                        console.error("Error processing upsell 2.0 task:", error);
                    }
                };

                for (let i = 0; i < tasks.length; i++) {
                    await processTask(tasks[i], i === tasks.length - 1);
                }
            } catch (err) {
                console.error("Error in processUpsell2Queue:", err);
            } finally {
                isProcessing.current = false;
            }
        };

        const intervalId = setInterval(processUpsell2Queue, 5000);
        processUpsell2Queue();
        return () => clearInterval(intervalId);

    }, [clients, settings, firestore, user, toast, userProfile]);

    return null;
}
