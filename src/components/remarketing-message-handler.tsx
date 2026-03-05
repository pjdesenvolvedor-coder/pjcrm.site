
'use client';

import { useEffect, useRef } from 'react';
import { collection, query, doc, runTransaction, arrayUnion } from 'firebase/firestore';
import { useFirebase, useUser, useCollection, useMemoFirebase, useDoc } from '@/firebase';
import type { Client, Settings, UserProfile, RemarketingConfig } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';
import { format, differenceInDays } from 'date-fns';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const DELAY_BETWEEN_MESSAGES = 3000;

export function RemarketingMessageHandler() {
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

    const allClientsQuery = useMemoFirebase(() => {
        if (!user || !firestore) return null;
        return collection(firestore, 'users', user.uid, 'clients');
    }, [user, firestore]);
    const { data: clients } = useCollection<Client>(allClientsQuery);

    useEffect(() => {
        const processRemarketingQueue = async () => {
            if (isProcessing.current) return;

            if (userProfile && userProfile.role !== 'Admin' && userProfile.subscriptionEndDate && userProfile.subscriptionEndDate.toDate() < new Date()) {
                return;
            }

            const activeSignupRemarketings = settings?.postSignupRemarketings?.filter(r => r.isActive && r.message) || [];
            const activeDueDateRemarketings = settings?.postDueDateRemarketings?.filter(r => r.isActive && r.message) || [];

            if (!clients || clients.length === 0 || (activeSignupRemarketings.length === 0 && activeDueDateRemarketings.length === 0) || !settings?.webhookToken || !user || !firestore) {
                return;
            }

            isProcessing.current = true;
            const now = new Date();
            
            const processRemarketingForClient = async (client: Client, config: RemarketingConfig, type: 'signup' | 'duedate') => {
                const startDate = type === 'signup' 
                    ? client.createdAt?.toDate() 
                    : client.dueDate?.toDate();
                
                if (!startDate || !client.createdAt) return;
                
                if (config.createdAt && client.createdAt.toMillis() < config.createdAt) {
                    return;
                }

                const daysDiff = differenceInDays(now, startDate);
                
                if (daysDiff < config.days) return;
                if (client.sentRemarketingIds?.includes(config.id)) return;

                const clientDocRef = doc(firestore, 'users', user.uid, 'clients', client.id);

                try {
                    await runTransaction(firestore, async (transaction) => {
                        const clientDoc = await transaction.get(clientDocRef);
                        if (!clientDoc.exists()) throw new Error("deleted");
                        
                        if (type === 'duedate' && clientDoc.data().status !== 'Vencido') {
                            throw new Error("client no longer overdue");
                        }

                        const sentIds = clientDoc.data().sentRemarketingIds || [];
                        if (sentIds.includes(config.id)) throw new Error("already sent");
                        
                        transaction.update(clientDocRef, { sentRemarketingIds: arrayUnion(config.id) });
                    });

                    let formattedMessage = config.message
                        .replace(/{cliente}/g, client.name)
                        .replace(/{telefone}/g, client.phone)
                        .replace(/{email}/g, Array.isArray(client.email) ? client.email.join(', ') : client.email)
                        .replace(/{assinatura}/g, client.subscription || '')
                        .replace(/{vencimento}/g, client.dueDate ? format(client.dueDate.toDate(), 'dd/MM/yyyy') : '')
                        .replace(/{valor}/g, client.amountPaid || '0,00')
                        .replace(/{senha}/g, client.password || 'N/A')
                        .replace(/{tela}/g, client.screen || 'N/A')
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
                        title: `Remarketing ${type === 'signup' ? 'Cadastro' : 'Vencimento'} Enviado!`,
                        description: `Enviado para ${client.name}.`,
                    });

                    await sleep(DELAY_BETWEEN_MESSAGES);

                } catch (error: any) {
                    // Error ignored
                }
            };
            
            for (const client of clients) {
                for (const config of activeSignupRemarketings) {
                    await processRemarketingForClient(client, config, 'signup');
                }

                if (client.status === 'Vencido') {
                    for (const config of activeDueDateRemarketings) {
                        await processRemarketingForClient(client, config, 'duedate');
                    }
                }
            }
            
            isProcessing.current = false;
        };

        // Verificação a cada 2 minutos
        const intervalId = setInterval(processRemarketingQueue, 2 * 60 * 1000);
        processRemarketingQueue();
        return () => clearInterval(intervalId);

    }, [clients, settings, firestore, user, toast, userProfile]);

    return null;
}
