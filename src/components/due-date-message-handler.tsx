'use client';

import { useEffect, useRef } from 'react';
import { collection, query, where, doc, runTransaction } from 'firebase/firestore';
import { useFirebase, useUser, useCollection, useMemoFirebase, useDoc } from '@/firebase';
import type { Client, Settings, UserProfile } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const DELAY_MS = 6000;

export function DueDateMessageHandler() {
    const { firestore, user } = useFirebase();
    const { toast } = useToast();
    const isProcessing = useRef(false);
    const quotaExceededUntilRef = useRef<number>(0);
    const lastErrorTimeRef = useRef<number>(0);
    const ERROR_THROTTLE_MS = 60000;

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
        if (!user) return null;
        const clientsRef = collection(firestore, 'users', user.uid, 'clients');
        return query(clientsRef, where("status", "==", "Ativo"));
    }, [user, firestore]);
    const { data: activeClients } = useCollection<Client>(activeClientsQuery);

    useEffect(() => {
        const checkAndProcessOverdueClients = async () => {
            const nowTime = Date.now();
            if (isProcessing.current || nowTime < quotaExceededUntilRef.current) return;

            if (userProfile && userProfile.role !== 'Admin' && userProfile.subscriptionEndDate && userProfile.subscriptionEndDate.toDate() < new Date()) {
                return;
            }

            if (!activeClients || activeClients.length === 0 || !settings?.isDueDateMessageActive || !settings.dueDateMessage || !settings.webhookToken || !user || !firestore) {
                return;
            }

            const now = new Date();
            const overdueClients = activeClients.filter(client => client.dueDate && client.dueDate.toDate() <= now);
            
            if (overdueClients.length === 0) return;

            isProcessing.current = true;

            const processClient = async (client: Client) => {
                const clientDocRef = doc(firestore, 'users', user.uid, 'clients', client.id);

                try {
                    await runTransaction(firestore, async (transaction) => {
                        const clientDoc = await transaction.get(clientDocRef);
                        if (!clientDoc.exists() || clientDoc.data().status !== 'Ativo') {
                            throw new Error("already processed");
                        }
                        transaction.update(clientDocRef, { status: 'Vencido' });
                    });

                    let formattedMessage = settings.dueDateMessage!
                        .replace(/{cliente}/g, client.name)
                        .replace(/{telefone}/g, client.phone)
                        .replace(/{email}/g, Array.isArray(client.email) ? client.email.join(', ') : client.email)
                        .replace(/{assinatura}/g, client.subscription || '')
                        .replace(/{vencimento}/g, client.dueDate ? format(client.dueDate.toDate(), 'dd/MM/yyyy') : '')
                        .replace(/{valor}/g, client.amountPaid || '0,00')
                        .replace(/{status}/g, 'Vencido');

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
                        title: "Mensagem de Vencimento Enviada!",
                        description: `A mensagem foi enviada para ${client.name}.`,
                    });

                } catch (error: any) {
                    if (error.message.includes("quota exceeded") || error.code === 'resource-exhausted') {
                        // Silencia por 10 minutos se for erro de cota
                        quotaExceededUntilRef.current = Date.now() + 600000;
                    } else if (!error.message.includes("already processed")) {
                        console.error("Failed to process overdue client:", error);
                    }
                }
            };
            
            for (const client of overdueClients) {
                if (Date.now() < quotaExceededUntilRef.current) break;
                await processClient(client);
                await sleep(DELAY_MS);
            }
            
            isProcessing.current = false;
        };

        const intervalId = setInterval(checkAndProcessOverdueClients, 60 * 1000);
        checkAndProcessOverdueClients();
        return () => clearInterval(intervalId);

    }, [activeClients, settings, firestore, user, toast, userProfile]);

    return null;
}
