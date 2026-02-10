'use client';

import { useEffect, useRef } from 'react';
import { collection, query, where, doc, runTransaction } from 'firebase/firestore';
import { useFirebase, useUser, useCollection, useMemoFirebase, useDoc } from '@/firebase';
import type { Client, Settings, UserProfile } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const DELAY_MS = 6000; // 6 seconds

export function DueDateMessageHandler() {
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

    // 3. Get all clients with 'Ativo' status
    const activeClientsQuery = useMemoFirebase(() => {
        if (!user) return null;
        const clientsRef = collection(firestore, 'users', user.uid, 'clients');
        return query(clientsRef, where("status", "==", "Ativo"));
    }, [user, firestore]);
    const { data: activeClients } = useCollection<Client>(activeClientsQuery);

    useEffect(() => {
        const checkAndProcessOverdueClients = async () => {
             if (isProcessing.current) {
                return;
            }

            // Check subscription status first
            if (userProfile && userProfile.role !== 'Admin' && userProfile.subscriptionEndDate && userProfile.subscriptionEndDate.toDate() < new Date()) {
                return; // Subscription expired, do nothing.
            }

            // Check if all other required data is available
            if (!activeClients || activeClients.length === 0 || !settings?.isDueDateMessageActive || !settings.dueDateMessage || !settings.webhookToken || !user || !firestore) {
                return;
            }

            const now = new Date();
            const overdueClients = activeClients.filter(client => client.dueDate && client.dueDate.toDate() <= now);
            
            if (overdueClients.length === 0) {
                return;
            }

            isProcessing.current = true;

            const token = settings.webhookToken;
            const messageTemplate = settings.dueDateMessage;
            
            const processClient = async (client: Client) => {
                const clientDocRef = doc(firestore, 'users', user.uid, 'clients', client.id);

                try {
                    // Atomically update the client's status to 'Vencido' to prevent duplicate sends
                    await runTransaction(firestore, async (transaction) => {
                        const clientDoc = await transaction.get(clientDocRef);
                        if (!clientDoc.exists() || clientDoc.data().status !== 'Ativo') {
                            // If the client document doesn't exist or its status is no longer 'Ativo',
                            // it means it has been processed by another instance or deleted.
                            throw new Error("Client already processed or deleted.");
                        }
                        // Claim the client by updating its status within the transaction.
                        transaction.update(clientDocRef, { status: 'Vencido' });
                    });

                    // If the transaction is successful, this client instance now owns the task.
                    // Proceed to format and send the message.
                    let formattedMessage = messageTemplate
                        .replace(/{cliente}/g, client.name)
                        .replace(/{telefone}/g, client.phone)
                        .replace(/{email}/g, Array.isArray(client.email) ? client.email.join(', ') : client.email)
                        .replace(/{assinatura}/g, client.subscription || '')
                        .replace(/{vencimento}/g, client.dueDate ? format(client.dueDate.toDate(), 'dd/MM/yyyy') : '')
                        .replace(/{valor}/g, client.amountPaid || '0,00')
                        .replace(/{status}/g, 'Vencido'); // The new status is 'Vencido'

                    // Send the formatted message via the webhook API
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
                        // The status is already updated to 'Vencido'. This is to prevent re-sends.
                        // An error in sending will be logged for the user to see.
                        throw new Error(`Falha ao enviar mensagem de vencimento para ${client.name}`);
                    }

                    toast({
                        title: "Mensagem de Vencimento Enviada!",
                        description: `A mensagem foi enviada para ${client.name}.`,
                    });

                } catch (error: any) {
                    if (error.message.includes("already processed")) {
                        // This is not a "real" error for the user; it's a successful race condition outcome. Ignore silently.
                    } else {
                        console.error("Failed to process overdue client:", error);
                        toast({
                            variant: "destructive",
                            title: "Erro no Envio de Vencimento",
                            description: error.message || `Não foi possível processar o cliente ${client.name}.`,
                        });
                    }
                }
            };
            
            for (const client of overdueClients) {
                await processClient(client);
                await sleep(DELAY_MS);
            }
            
            isProcessing.current = false;
        };

        // This function will run every minute to check for overdue clients.
        const intervalId = setInterval(checkAndProcessOverdueClients, 60 * 1000);

        // Also run an initial check when the component mounts.
        checkAndProcessOverdueClients();

        // Cleanup interval on component unmount.
        return () => clearInterval(intervalId);

    }, [activeClients, settings, firestore, user, toast, userProfile]);

    return null; // This component is invisible and runs in the background.
}
