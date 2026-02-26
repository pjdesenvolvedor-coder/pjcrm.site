
'use client';

import { useEffect, useRef } from 'react';
import { collection, query, where, doc, runTransaction, arrayUnion } from 'firebase/firestore';
import { useFirebase, useUser, useCollection, useMemoFirebase, useDoc } from '@/firebase';
import type { Client, Settings, UserProfile, UpsellConfig } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const DELAY_BETWEEN_MESSAGES = 6000;

export function UpsellMessageHandler() {
    const { firestore, user } = useFirebase();
    const { toast } = useToast();
    const isProcessing = useRef(false);
    const quotaExceededUntilRef = useRef<number>(0);

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
             if (isProcessing.current || Date.now() < quotaExceededUntilRef.current) return;

            if (userProfile && userProfile.role !== 'Admin' && userProfile.subscriptionEndDate && userProfile.subscriptionEndDate.toDate() < new Date()) {
                return;
            }

            const activeUpsells = settings?.upsells?.filter(u => u.isActive && u.upsellMessage) || [];

            if (!activeClients || activeClients.length === 0 || activeUpsells.length === 0 || !settings?.webhookToken || !user || !firestore) {
                return;
            }

            isProcessing.current = true;
            const now = new Date();
            
            const processUpsellForClient = async (client: Client, upsell: UpsellConfig) => {
                if (!client.createdAt) return;
                
                // New logic: Only send to clients created AFTER the upsell rule was created
                if (upsell.createdAt && client.createdAt.toMillis() < upsell.createdAt) {
                    return;
                }
                
                const delayMs = (upsell.upsellDelayMinutes || 0) * 60 * 1000;
                const creationTime = client.createdAt.toDate().getTime();
                
                if ((now.getTime() - creationTime) < delayMs) return;
                if (client.sentUpsellIds?.includes(upsell.id)) return;

                const clientDocRef = doc(firestore, 'users', user.uid, 'clients', client.id);

                try {
                    await runTransaction(firestore, async (transaction) => {
                        const clientDoc = await transaction.get(clientDocRef);
                        if (!clientDoc.exists()) throw new Error("deleted");
                        const sentIds = clientDoc.data().sentUpsellIds || [];
                        if (sentIds.includes(upsell.id)) throw new Error("already sent");
                        transaction.update(clientDocRef, { sentUpsellIds: arrayUnion(upsell.id) });
                    });

                    let formattedMessage = upsell.upsellMessage
                        .replace(/{cliente}/g, client.name)
                        .replace(/{telefone}/g, client.phone)
                        .replace(/{email}/g, Array.isArray(client.email) ? client.email.join(', ') : client.email)
                        .replace(/{assinatura}/g, client.subscription || '')
                        .replace(/{vencimento}/g, client.dueDate ? format(client.dueDate.toDate(), 'dd/MM/yyyy') : '')
                        .replace(/{valor}/g, client.amountPaid || '0,00')
                        .replace(/{status}/g, client.status);

                    await fetch('/api/send-message', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            message: formattedMessage,
                            phoneNumber: client.phone,
                            token: settings.webhookToken,
                        }),
                    });

                    toast({
                        title: "UPSELL Enviado!",
                        description: `A oferta foi enviada para ${client.name}.`,
                    });

                    await sleep(DELAY_BETWEEN_MESSAGES);

                } catch (error: any) {
                    if (error.message.includes("quota exceeded") || error.code === 'resource-exhausted') {
                        quotaExceededUntilRef.current = Date.now() + 600000;
                    }
                }
            };
            
            for (const client of activeClients) {
                if (Date.now() < quotaExceededUntilRef.current) break;
                for (const upsell of activeUpsells) {
                    await processUpsellForClient(client, upsell);
                }
            }
            
            isProcessing.current = false;
        };

        // Verificação a cada 5 minutos
        const intervalId = setInterval(processUpsellQueue, 5 * 60 * 1000);
        processUpsellQueue();
        return () => clearInterval(intervalId);

    }, [activeClients, settings, firestore, user, toast, userProfile]);

    return null;
}
