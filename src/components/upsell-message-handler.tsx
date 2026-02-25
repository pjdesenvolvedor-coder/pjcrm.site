
'use client';

import { useEffect, useRef } from 'react';
import { collection, query, where, doc, runTransaction, serverTimestamp, Timestamp } from 'firebase/firestore';
import { useFirebase, useUser, useCollection, useMemoFirebase, useDoc } from '@/firebase';
import type { Client, Settings, UserProfile } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const DELAY_BETWEEN_MESSAGES = 6000; // 6 seconds

export function UpsellMessageHandler() {
    const { firestore, user } = useFirebase();
    const { toast } = useToast();
    const isProcessing = useRef(false);

    // 1. Get settings for the current user
    const settingsDocRef = useMemoFirebase(() => {
        if (!user) return null;
        return doc(firestore, 'users', user.uid, 'settings', 'config');
    }, [firestore, user]);
    const { data: settings } = useDoc<Settings>(settingsDocRef);
    
    // 2. Get user profile
    const userDocRef = useMemoFirebase(() => {
        if (!user) return null;
        return doc(firestore, 'users', user.uid);
    }, [firestore, user]);
    const { data: userProfile } = useDoc<UserProfile>(userDocRef);

    // 3. Get clients that haven't received upsell yet
    const pendingUpsellQuery = useMemoFirebase(() => {
        if (!user || !firestore) return null;
        const clientsRef = collection(firestore, 'users', user.uid, 'clients');
        // We only care about clients where upsellSent is false or undefined
        return query(clientsRef, where("upsellSent", "==", false));
    }, [user, firestore]);
    const { data: pendingClients } = useCollection<Client>(pendingUpsellQuery);

    useEffect(() => {
        const processUpsellQueue = async () => {
             if (isProcessing.current) return;

            // Check subscription status
            if (userProfile && userProfile.role !== 'Admin' && userProfile.subscriptionEndDate && userProfile.subscriptionEndDate.toDate() < new Date()) {
                return;
            }

            // Check if automation is active
            if (!pendingClients || pendingClients.length === 0 || !settings?.isUpsellActive || !settings.upsellMessage || !settings.webhookToken || !user || !firestore) {
                return;
            }

            const now = new Date();
            const delayMs = (settings.upsellDelayMinutes || 5) * 60 * 1000;

            const clientsToProcess = pendingClients.filter(client => {
                if (!client.createdAt) return false;
                const creationTime = client.createdAt.toDate().getTime();
                return (now.getTime() - creationTime) >= delayMs;
            });
            
            if (clientsToProcess.length === 0) return;

            isProcessing.current = true;

            const token = settings.webhookToken;
            const messageTemplate = settings.upsellMessage;
            
            const processClient = async (client: Client) => {
                const clientDocRef = doc(firestore, 'users', user.uid, 'clients', client.id);

                try {
                    // Atomically mark as sent to prevent duplicate sends
                    await runTransaction(firestore, async (transaction) => {
                        const clientDoc = await transaction.get(clientDocRef);
                        if (!clientDoc.exists() || clientDoc.data().upsellSent === true) {
                            throw new Error("Client already processed or deleted.");
                        }
                        transaction.update(clientDocRef, { upsellSent: true });
                    });

                    // Format and send
                    let formattedMessage = messageTemplate
                        .replace(/{cliente}/g, client.name)
                        .replace(/{telefone}/g, client.phone)
                        .replace(/{email}/g, Array.isArray(client.email) ? client.email.join(', ') : client.email)
                        .replace(/{assinatura}/g, client.subscription || '')
                        .replace(/{vencimento}/g, client.dueDate ? format(client.dueDate.toDate(), 'dd/MM/yyyy') : '')
                        .replace(/{valor}/g, client.amountPaid || '0,00')
                        .replace(/{status}/g, client.status);

                    const response = await fetch('/api/send-message', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            message: formattedMessage,
                            phoneNumber: client.phone,
                            token: token,
                        }),
                    });

                    if (!response.ok) {
                        throw new Error(`Falha ao enviar mensagem de UPSELL para ${client.name}`);
                    }

                    toast({
                        title: "UPSELL Enviado!",
                        description: `A oferta de upsell foi enviada para ${client.name}.`,
                    });

                } catch (error: any) {
                    if (!error.message.includes("already processed")) {
                        console.error("Failed to process upsell for client:", error);
                    }
                }
            };
            
            for (const client of clientsToProcess) {
                await processClient(client);
                await sleep(DELAY_BETWEEN_MESSAGES);
            }
            
            isProcessing.current = false;
        };

        // Check every 30 seconds
        const intervalId = setInterval(processUpsellQueue, 30 * 1000);
        processUpsellQueue();

        return () => clearInterval(intervalId);

    }, [pendingClients, settings, firestore, user, toast, userProfile]);

    return null;
}
