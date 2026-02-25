
'use client';

import { useEffect, useRef } from 'react';
import { collection, query, where, doc, runTransaction, arrayUnion } from 'firebase/firestore';
import { useFirebase, useUser, useCollection, useMemoFirebase, useDoc } from '@/firebase';
import type { Client, Settings, UserProfile, UpsellConfig } from '@/lib/types';
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

    // 3. Get clients with 'Ativo' status
    const activeClientsQuery = useMemoFirebase(() => {
        if (!user || !firestore) return null;
        const clientsRef = collection(firestore, 'users', user.uid, 'clients');
        return query(clientsRef, where("status", "==", "Ativo"));
    }, [user, firestore]);
    const { data: activeClients } = useCollection<Client>(activeClientsQuery);

    useEffect(() => {
        const processUpsellQueue = async () => {
             if (isProcessing.current) return;

            // Check subscription status
            if (userProfile && userProfile.role !== 'Admin' && userProfile.subscriptionEndDate && userProfile.subscriptionEndDate.toDate() < new Date()) {
                return;
            }

            const activeUpsells = settings?.upsells?.filter(u => u.isActive && u.upsellMessage) || [];

            // Check if automation is active
            if (!activeClients || activeClients.length === 0 || activeUpsells.length === 0 || !settings?.webhookToken || !user || !firestore) {
                return;
            }

            isProcessing.current = true;

            const now = new Date();
            const token = settings.webhookToken;
            
            const processUpsellForClient = async (client: Client, upsell: UpsellConfig) => {
                if (!client.createdAt) return;
                
                const delayMs = (upsell.upsellDelayMinutes || 0) * 60 * 1000;
                const creationTime = client.createdAt.toDate().getTime();
                
                // If not yet due
                if ((now.getTime() - creationTime) < delayMs) return;

                // If already sent
                if (client.sentUpsellIds?.includes(upsell.id)) return;

                const clientDocRef = doc(firestore, 'users', user.uid, 'clients', client.id);

                try {
                    // Atomically mark this specific upsell as sent
                    await runTransaction(firestore, async (transaction) => {
                        const clientDoc = await transaction.get(clientDocRef);
                        if (!clientDoc.exists()) throw new Error("deleted");
                        
                        const sentIds = clientDoc.data().sentUpsellIds || [];
                        if (sentIds.includes(upsell.id)) {
                            throw new Error("already sent");
                        }
                        
                        transaction.update(clientDocRef, { 
                            sentUpsellIds: arrayUnion(upsell.id)
                        });
                    });

                    // Format and send
                    let formattedMessage = upsell.upsellMessage
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

                    await sleep(DELAY_BETWEEN_MESSAGES);

                } catch (error: any) {
                    if (error.message !== "already sent" && error.message !== "deleted") {
                        console.error("Failed to process upsell for client:", error);
                    }
                }
            };
            
            for (const client of activeClients) {
                for (const upsell of activeUpsells) {
                    await processUpsellForClient(client, upsell);
                }
            }
            
            isProcessing.current = false;
        };

        // Check every minute
        const intervalId = setInterval(processUpsellQueue, 60 * 1000);
        processUpsellQueue();

        return () => clearInterval(intervalId);

    }, [activeClients, settings, firestore, user, toast, userProfile]);

    return null;
}
