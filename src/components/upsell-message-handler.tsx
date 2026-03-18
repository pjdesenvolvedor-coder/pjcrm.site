
'use client';

import { useEffect, useRef } from 'react';
import { collection, query, where, doc, runTransaction, arrayUnion, serverTimestamp } from 'firebase/firestore';
import { useFirebase, useUser, useCollection, useMemoFirebase, useDoc } from '@/firebase';
import type { Client, Settings, UserProfile, UpsellConfig } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';
import { addDocumentNonBlocking } from '@/firebase/non-blocking-updates';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const MANDATORY_DELAY = 30000; // 30 seconds

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

            const activeUpsells = settings?.upsells?.filter(u => u.isActive && u.upsellMessage) || [];

            if (!activeClients || activeClients.length === 0 || activeUpsells.length === 0 || !settings?.webhookToken || !user || !firestore) {
                return;
            }

            isProcessing.current = true;
            const now = new Date();
            
            const tasks: { client: Client, upsell: UpsellConfig }[] = [];
            for (const client of activeClients) {
                for (const upsell of activeUpsells) {
                    if (!client.createdAt) continue;
                    if (upsell.createdAt && client.createdAt.toMillis() < upsell.createdAt) continue;
                    
                    const delayMs = (upsell.upsellDelayMinutes || 0) * 60 * 1000;
                    const creationTime = client.createdAt.toDate().getTime();
                    
                    if ((now.getTime() - creationTime) >= delayMs && !client.sentUpsellIds?.includes(upsell.id)) {
                        tasks.push({ client, upsell });
                    }
                }
            }

            if (tasks.length === 0) {
                isProcessing.current = false;
                return;
            }

            const currentDelay = tasks.length > 1 ? MANDATORY_DELAY : 0;

            const processTask = async (task: typeof tasks[0], isLast: boolean) => {
                const { client, upsell } = task;
                const clientDocRef = doc(firestore, 'users', user.uid, 'clients', client.id);
                const logRef = collection(firestore, 'users', user.uid, 'logs');

                try {
                    await runTransaction(firestore, async (transaction) => {
                        const clientDoc = await transaction.get(clientDocRef);
                        if (!clientDoc.exists()) throw new Error("deleted");
                        const sentIds = clientDoc.data().sentUpsellIds || [];
                        if (sentIds.includes(upsell.id)) throw new Error("already sent");
                        transaction.update(clientDocRef, { sentUpsellIds: arrayUnion(upsell.id) });
                    });

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
                        .replace(/{cliente}/g, client.name)
                        .replace(/{telefone}/g, client.phone)
                        .replace(/{email}/g, Array.isArray(client.email) ? client.email.join(', ') : client.email)
                        .replace(/{assinatura}/g, client.subscription || '')
                        .replace(/{vencimento}/g, client.dueDate ? format(client.dueDate.toDate(), 'dd/MM/yyyy') : '')
                        .replace(/{valor}/g, client.amountPaid || '0,00')
                        .replace(/{senha}/g, client.password || 'N/A')
                        .replace(/{tela}/g, client.screen || 'N/A')
                        .replace(/{pin_tela}/g, client.pinScreen || 'N/A')
                        .replace(/{status}/g, client.status);

                    const response = await fetch('/api/send-message', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            message: formattedMessage,
                            phoneNumber: client.phone,
                            token: settings.webhookToken,
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

                } catch (error: any) {}
            };
            
            for (let i = 0; i < tasks.length; i++) {
                await processTask(tasks[i], i === tasks.length - 1);
            }
            
            isProcessing.current = false;
        };

        const intervalId = setInterval(processUpsellQueue, 60000); // Check every minute
        processUpsellQueue();
        return () => clearInterval(intervalId);

    }, [activeClients, settings, firestore, user, toast, userProfile]);

    return null;
}
