
'use client';

import { useEffect, useRef } from 'react';
import { collection, query, where, doc, runTransaction, serverTimestamp } from 'firebase/firestore';
import { useFirebase, useUser, useCollection, useMemoFirebase, useDoc } from '@/firebase';
import type { Client, Settings, UserProfile } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';
import { addDocumentNonBlocking } from '@/firebase/non-blocking-updates';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const STANDARD_DELAY = 3000;
const BULK_DELAY = 30000; // 30 seconds for bulk

export function DueDateMessageHandler() {
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
        if (!user) return null;
        const clientsRef = collection(firestore, 'users', user.uid, 'clients');
        return query(clientsRef, where("status", "==", "Ativo"));
    }, [user, firestore]);
    const { data: activeClients } = useCollection<Client>(activeClientsQuery);

    useEffect(() => {
        const checkAndProcessOverdueClients = async () => {
            if (isProcessing.current) return;

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
            
            const useBulkDelay = overdueClients.length >= 50;
            const currentDelay = useBulkDelay ? BULK_DELAY : STANDARD_DELAY;

            const processClient = async (client: Client) => {
                const clientDocRef = doc(firestore, 'users', user.uid, 'clients', client.id);
                const logRef = collection(firestore, 'users', user.uid, 'logs');

                try {
                    await runTransaction(firestore, async (transaction) => {
                        const clientDoc = await transaction.get(clientDocRef);
                        if (!clientDoc.exists() || clientDoc.data().status !== 'Ativo') {
                            throw new Error("already processed");
                        }
                        transaction.update(clientDocRef, { status: 'Vencido' });
                    });

                    // Add log entry: Starting
                    addDocumentNonBlocking(logRef, {
                        userId: user.uid,
                        type: 'Vencimento',
                        clientName: client.name,
                        target: client.phone,
                        status: 'Enviando',
                        delayApplied: currentDelay / 1000,
                        timestamp: serverTimestamp(),
                    });

                    let formattedMessage = settings.dueDateMessage!
                        .replace(/{cliente}/g, client.name)
                        .replace(/{telefone}/g, client.phone)
                        .replace(/{email}/g, Array.isArray(client.email) ? client.email.join(', ') : client.email)
                        .replace(/{assinatura}/g, client.subscription || '')
                        .replace(/{vencimento}/g, client.dueDate ? format(client.dueDate.toDate(), 'dd/MM/yyyy') : '')
                        .replace(/{valor}/g, client.amountPaid || '0,00')
                        .replace(/{senha}/g, client.password || 'N/A')
                        .replace(/{tela}/g, client.screen || 'N/A')
                        .replace(/{status}/g, 'Vencido');

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
                            type: 'Vencimento',
                            clientName: client.name,
                            target: client.phone,
                            status: 'Enviado',
                            delayApplied: currentDelay / 1000,
                            timestamp: serverTimestamp(),
                        });
                        
                        toast({
                            title: "Mensagem de Vencimento Enviada!",
                            description: `A mensagem foi enviada para ${client.name}.`,
                        });
                    } else {
                         addDocumentNonBlocking(logRef, {
                            userId: user.uid,
                            type: 'Vencimento',
                            clientName: client.name,
                            target: client.phone,
                            status: 'Erro',
                            delayApplied: currentDelay / 1000,
                            timestamp: serverTimestamp(),
                        });
                    }

                } catch (error: any) {
                    // Logs removidos para manter o foco
                }
            };
            
            for (const client of overdueClients) {
                await processClient(client);
                await sleep(currentDelay);
            }
            
            isProcessing.current = false;
        };

        const intervalId = setInterval(checkAndProcessOverdueClients, 1 * 60 * 1000);
        checkAndProcessOverdueClients();
        return () => clearInterval(intervalId);

    }, [activeClients, settings, firestore, user, toast, userProfile]);

    return null;
}
