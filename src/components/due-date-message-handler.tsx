'use client';

import { useEffect, useRef } from 'react';
import { collection, query, where, doc, runTransaction, serverTimestamp } from 'firebase/firestore';
import { useFirebase, useUser, useCollection, useMemoFirebase, useDoc } from '@/firebase';
import type { Client, Settings, UserProfile } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';
import { addDocumentNonBlocking } from '@/firebase/non-blocking-updates';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const MANDATORY_DELAY = 30000; // 30 seconds

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

            const hubToken = settings?.webhookToken || '';
            const billingToken = settings?.billingWebhookToken || '';
            const choice = settings?.renewalZapInstance || (settings?.useSeparateBillingZap ? 'billing' : 'main');
            const primaryToken = choice === 'billing' ? (billingToken || hubToken) : (choice === 'main' ? (hubToken || billingToken) : ((settings?.useSeparateBillingZap && billingToken) ? billingToken : (hubToken || billingToken)));
            const fallbackToken = primaryToken === billingToken ? hubToken : billingToken;

            if (!activeClients || activeClients.length === 0 || !settings?.isDueDateMessageActive || !settings.dueDateMessage || (!primaryToken && !fallbackToken) || !user || !firestore) {
                return;
            }

            const now = new Date();
            const overdueClients = activeClients.filter(client => client.dueDate && client.dueDate.toDate() <= now);
            
            if (overdueClients.length === 0) return;

            isProcessing.current = true;

            // Agrupa clientes com vencimento pelo telefone canônico (para não enviar múltiplas mensagens)
            const getCanonicalPhone = (phone: string) => {
                if (!phone) return '';
                const digits = phone.replace(/\D/g, '');
                let local = (digits.startsWith('55') && digits.length >= 12) ? digits.slice(2) : digits;
                if (local.length === 11 && local[2] === '9') local = local.slice(0, 2) + local.slice(3);
                if (local.length === 10) return '55' + local;
                return digits;
            };

            const groupsByPhone = new Map<string, Client[]>();
            for (const client of overdueClients) {
                const canon = getCanonicalPhone(client.phone);
                if (!canon) continue;
                if (!groupsByPhone.has(canon)) groupsByPhone.set(canon, []);
                groupsByPhone.get(canon)!.push(client);
            }

            const phoneGroups = Array.from(groupsByPhone.values());
            const currentDelay = phoneGroups.length > 1 ? MANDATORY_DELAY : 0;

            const processGroup = async (clientGroup: Client[], isLast: boolean) => {
                const primaryClient = clientGroup[0];
                const logRef = collection(firestore, 'users', user.uid, 'logs');

                // 1. Marca todos os documentos do grupo como 'Vencido'
                for (const client of clientGroup) {
                    const clientDocRef = doc(firestore, 'users', user.uid, 'clients', client.id);
                    try {
                        await runTransaction(firestore, async (transaction) => {
                            const snap = await transaction.get(clientDocRef);
                            if (snap.exists() && snap.data().status === 'Ativo') {
                                transaction.update(clientDocRef, { status: 'Vencido' });
                            }
                        });
                    } catch (e) {}
                }

                // 2. Cria sessão de renovação com link oficial caso ativa
                let renewalLink = '';
                try {
                    const origin = typeof window !== 'undefined' ? window.location.origin : 'https://pjcrm.site';
                    const { getOrCreateRenewalSession } = await import('@/lib/renewal-service');
                    const { link } = await getOrCreateRenewalSession(user.uid, clientGroup, origin);
                    renewalLink = link;
                } catch (linkErr) {
                    console.error('Erro ao gerar link de renovação:', linkErr);
                }

                // 3. Monta a mensagem única
                const subNamesComma = clientGroup
                    .map((c) => c.subscription?.trim() || 'Assinatura')
                    .filter(Boolean)
                    .join(', ');

                const totalVal = clientGroup.reduce((acc, c) => {
                    const parsed = parseFloat(String(c.amountPaid || '0').replace(/\./g, '').replace(',', '.'));
                    return acc + (isNaN(parsed) ? 0 : parsed);
                }, 0);
                const formattedValor = totalVal > 0
                    ? totalVal.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                    : (primaryClient.amountPaid || '0,00');

                const defaultTemplate =
                    'Olá *{cliente}*! Sua assinatura está próxima do vencimento.\n\n' +
                    '📦 *Assinatura(s):* {assinaturas}\n' +
                    '📅 *Vencimento:* {vencimento}\n\n' +
                    '👉 Para renovar com segurança via PIX e manter seu acesso ativo sem interrupções, use o link oficial abaixo:\n🔗 {link_renovacao}';

                const template = settings.renewalBillingMessage?.trim() || settings.dueDateMessage || defaultTemplate;
                const formattedMessage = template
                    .replace(/{cliente}/g, primaryClient.name || 'Cliente')
                    .replace(/{telefone}/g, primaryClient.phone || '')
                    .replace(/{email}/g, Array.isArray(primaryClient.email) ? primaryClient.email.join(', ') : (primaryClient.email || ''))
                    .replace(/{assinatura}/g, subNamesComma)
                    .replace(/{assinaturas}/g, subNamesComma)
                    .replace(/{vencimento}/g, primaryClient.dueDate ? format(primaryClient.dueDate.toDate(), 'dd/MM/yyyy') : '')
                    .replace(/{valor}/g, formattedValor)
                    .replace(/{link_renovacao}/g, renewalLink)
                    .replace(/{link}/g, renewalLink)
                    .replace(/{senha}/g, primaryClient.password || 'N/A')
                    .replace(/{tela}/g, primaryClient.screen || 'N/A')
                    .replace(/{pin_tela}/g, primaryClient.pinScreen || 'N/A')
                    .replace(/{status}/g, 'Vencido');

                addDocumentNonBlocking(logRef, {
                    userId: user.uid,
                    type: 'Vencimento',
                    clientName: primaryClient.name,
                    target: primaryClient.phone,
                    status: 'Enviando',
                    delayApplied: currentDelay / 1000,
                    details: `${clientGroup.length} assinatura(s): ${subNames}`,
                    timestamp: serverTimestamp(),
                });

                try {
                    const response = await fetch('/api/send-message', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            message: formattedMessage,
                            phoneNumber: primaryClient.phone,
                            token: primaryToken,
                            fallbackToken: fallbackToken,
                        }),
                    });

                    if (response.ok) {
                        addDocumentNonBlocking(logRef, {
                            userId: user.uid,
                            type: 'Vencimento',
                            clientName: primaryClient.name,
                            target: primaryClient.phone,
                            status: 'Enviado',
                            delayApplied: currentDelay / 1000,
                            timestamp: serverTimestamp(),
                        });
                        
                        toast({
                            title: "Vencimento Enviado",
                            description: `${primaryClient.name} (${clientGroup.length} assinatura(s)) processado.`,
                        });
                    } else {
                        addDocumentNonBlocking(logRef, {
                            userId: user.uid,
                            type: 'Vencimento',
                            clientName: primaryClient.name,
                            target: primaryClient.phone,
                            status: 'Erro',
                            delayApplied: currentDelay / 1000,
                            timestamp: serverTimestamp(),
                        });
                    }

                    if (!isLast && currentDelay > 0) {
                        await sleep(currentDelay);
                    }
                } catch (sendErr) {
                    console.error('Erro ao enviar mensagem de vencimento:', sendErr);
                }
            };

            for (let i = 0; i < phoneGroups.length; i++) {
                await processGroup(phoneGroups[i], i === phoneGroups.length - 1);
            }
            
            isProcessing.current = false;
        };

        const intervalId = setInterval(checkAndProcessOverdueClients, 60000); // Check every minute
        checkAndProcessOverdueClients();
        return () => clearInterval(intervalId);

    }, [activeClients, settings, firestore, user, toast, userProfile]);

    return null;
}
