import { NextResponse } from 'next/server';
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore, collection, getDocs, doc, runTransaction, serverTimestamp, Timestamp, arrayUnion } from 'firebase/firestore';
import { firebaseConfig } from '@/firebase/config';
import { format, differenceInDays, addDays } from 'date-fns';
import type { Client, Settings, UserProfile, ScheduledMessage, UpsellConfig, RemarketingConfig } from '@/lib/types';

export const dynamic = 'force-dynamic';
export const maxDuration = 300; // 5 min timeout max limit (depending on vercel plan)

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
const db = getFirestore(app);

// Helper for delayed logging
function addServerLog(userId: string, type: string, clientName: string, target: string, status: string, delayApplied: number) {
    // Fire and forget log insertions (não seguram o runtime pesado do cron)
    const logData = {
        userId, type, clientName, target, status, delayApplied, timestamp: serverTimestamp()
    };
    const logRef = doc(collection(db, 'users', userId, 'logs'));
    getDocs(collection(db, 'nothing')).then(() => {
         // Placeholder promise to bypass any immediate async if desired
    }); 
    // Wait, let's use a simpler approach. Just runTransaction or set it without awaiting if possible, 
    // but in Vercel if you don't await, it might get cancelled when the response is returned. 
    // We will await logs sequentially to be safe.
}

export async function GET(request: Request) {
    try {
        const usersSnapshot = await getDocs(collection(db, 'users'));
        const now = new Date();
        const originUrl = new URL(request.url).origin;

        // Limite por execucao para não dar timeout em servidor basico (Hobby)
        // Por usuário, processaremos no maximo 2 de cada tipo por minuto.
        const QUEUE_LIMIT = 2;

        for (const userDoc of usersSnapshot.docs) {
            const userId = userDoc.id;
            const userProfile = userDoc.data() as UserProfile;

            // Se expiirou assinatura do admin, pula
            if (userProfile.role !== 'Admin' && userProfile.subscriptionEndDate && userProfile.subscriptionEndDate.toDate() < now) {
                continue;
            }

            // Puxar Settings do Usuário
            const settingsDocRef = doc(db, 'users', userId, 'settings', 'config');
            const settingsSnap = await getDocs(collection(db, 'users', userId, 'settings')); 
            // the doc is config, let's just get the doc
            const configRef = doc(db, 'users', userId, 'settings', 'config');
            const configSnap = await getDocs(collection(db, 'users', userId, 'settings'));
            const specificConfig = configSnap.docs.find(d => d.id === 'config');
            
            if (!specificConfig || !specificConfig.exists()) continue;
            const settings = specificConfig.data() as Settings;

            // Determine which token to use for billing (collection) messages
            const billingToken = settings.useSeparateBillingZap && settings.billingWebhookToken 
                ? settings.billingWebhookToken 
                : settings.webhookToken;

            if (!billingToken) continue; // Sem token algum nao da pra enviar cobrança

            // Vamos puxar todos os clientes Ativos (para Vencimentos, Upsell) e Vencidos (para Remarketing)
            const clientsSnapshot = await getDocs(collection(db, 'users', userId, 'clients'));
            const clients = clientsSnapshot.docs.map(d => ({ id: d.id, ...d.data() } as Client));

            const activeClients = clients.filter(c => c.status === 'Ativo');
            const overdueStatusClients = clients.filter(c => c.status === 'Vencido');

            // Determine which token to use for billing (collection) messages
            const billingToken = settings.useSeparateBillingZap && settings.billingWebhookToken 
                ? settings.billingWebhookToken 
                : settings.webhookToken;

            /* --- 1. PROCESSAR VENCIMENTOS --- */
            if (settings.isDueDateMessageActive && settings.dueDateMessage) {
                const overdueClients = activeClients.filter(c => c.dueDate && c.dueDate.toDate() <= now).slice(0, QUEUE_LIMIT);
                
                for (const client of overdueClients) {
                    const clientDocRef = doc(db, 'users', userId, 'clients', client.id);
                    let processed = false;
                    try {
                        await runTransaction(db, async (txn) => {
                            const cSnap = await txn.get(clientDocRef);
                            if (cSnap.data()?.status !== 'Ativo') throw new Error('Not ative');
                            txn.update(clientDocRef, { status: 'Vencido' });
                            processed = true;
                        });
                    } catch (e) {}

                    if (processed) {
                        let formattedMessage = settings.dueDateMessage
                            .replace(/{cliente}/g, client.name)
                            .replace(/{telefone}/g, client.phone)
                            .replace(/{email}/g, Array.isArray(client.email) ? client.email.join(', ') : client.email)
                            .replace(/{assinatura}/g, client.subscription || '')
                            .replace(/{vencimento}/g, client.dueDate ? format(client.dueDate.toDate(), 'dd/MM/yyyy') : '')
                            .replace(/{valor}/g, client.amountPaid || '0,00')
                            .replace(/{senha}/g, client.password || 'N/A')
                            .replace(/{tela}/g, client.screen || 'N/A')
                            .replace(/{pin_tela}/g, client.pinScreen || 'N/A')
                            .replace(/{status}/g, 'Vencido');
                        
                        // Send webhook
                        await fetch(`${originUrl}/api/send-message`, {
                            method: 'POST', headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ message: formattedMessage, phoneNumber: client.phone, token: billingToken }),
                        }).catch(console.error);
                    }
                }
            }

            /* --- 2. PROCESSAR UPSELL --- */
            const activeUpsells = settings.upsells?.filter(u => u.isActive && u.upsellMessage) || [];
            if (activeUpsells.length > 0) {
                let upsellsDone = 0;
                for (const client of activeClients) {
                    if (upsellsDone >= QUEUE_LIMIT) break;
                    if (!client.createdAt) continue;
                    
                    for (const upsell of activeUpsells) {
                        if (upsellsDone >= QUEUE_LIMIT) break;
                        if (upsell.createdAt && client.createdAt.toMillis() < upsell.createdAt) continue;
                        
                        const delayMs = (upsell.upsellDelayMinutes || 0) * 60 * 1000;
                        const creationTime = client.createdAt.toDate().getTime();

                        if ((now.getTime() - creationTime) >= delayMs && !client.sentUpsellIds?.includes(upsell.id)) {
                            let processed = false;
                            const clientDocRef = doc(db, 'users', userId, 'clients', client.id);
                            
                            try {
                                await runTransaction(db, async (txn) => {
                                    const cSnap = await txn.get(clientDocRef);
                                    if (cSnap.data()?.sentUpsellIds?.includes(upsell.id)) throw new Error('Sent');
                                    txn.update(clientDocRef, { sentUpsellIds: arrayUnion(upsell.id) });
                                    processed = true;
                                });
                            } catch (e) {}

                            if (processed) {
                                upsellsDone++;
                                let formattedMessage = upsell.upsellMessage
                                    .replace(/{cliente}/g, client.name)
                                    .replace(/{telefone}/g, client.phone)
                                    .replace(/{status}/g, client.status);

                                await fetch(`${originUrl}/api/send-message`, {
                                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ message: formattedMessage, phoneNumber: client.phone, token: billingToken }),
                                }).catch(console.error);
                            }
                        }
                    }
                }
            }

            /* --- 3. PROCESSAR REMARKETING --- */
            const activeSignupRemarketings = settings.postSignupRemarketings?.filter(r => r.isActive && r.message) || [];
            const activeDueDateRemarketings = settings.postDueDateRemarketings?.filter(r => r.isActive && r.message) || [];
            let rmkDone = 0;
            
            // Remarketing de Cadastro
            for (const client of clients) {
                if (rmkDone >= QUEUE_LIMIT) break;
                for (const config of activeSignupRemarketings) {
                    if (rmkDone >= QUEUE_LIMIT) break;
                    const startDate = client.createdAt?.toDate();
                    if (startDate && (!config.createdAt || client.createdAt!.toMillis() >= config.createdAt)) {
                        const daysDiff = differenceInDays(now, startDate);
                        if (daysDiff >= config.days && !client.sentRemarketingIds?.includes(config.id)) {
                            const clientDocRef = doc(db, 'users', userId, 'clients', client.id);
                            let processed = false;
                            try {
                                await runTransaction(db, async (txn) => {
                                    const cSnap = await txn.get(clientDocRef);
                                    if (cSnap.data()?.sentRemarketingIds?.includes(config.id)) throw new Error('Sent');
                                    txn.update(clientDocRef, { sentRemarketingIds: arrayUnion(config.id) });
                                    processed = true;
                                });
                            } catch (e) {}
                            if (processed) {
                                rmkDone++;
                                await fetch(`${originUrl}/api/send-message`, {
                                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ message: config.message.replace(/{cliente}/g, client.name).replace(/{telefone}/g, client.phone), phoneNumber: client.phone, token: billingToken }),
                                }).catch(console.error);
                            }
                        }
                    }
                }
            }

            // Remarketing de Vencimento
            for (const client of overdueStatusClients) {
                if (rmkDone >= QUEUE_LIMIT) break;
                for (const config of activeDueDateRemarketings) {
                    if (rmkDone >= QUEUE_LIMIT) break;
                    const startDate = client.dueDate?.toDate();
                    if (startDate && (!config.createdAt || client.createdAt!.toMillis() >= config.createdAt)) {
                        const daysDiff = differenceInDays(now, startDate);
                        if (daysDiff >= config.days && !client.sentRemarketingIds?.includes(config.id)) {
                            const clientDocRef = doc(db, 'users', userId, 'clients', client.id);
                            let processed = false;
                            try {
                                await runTransaction(db, async (txn) => {
                                    const cSnap = await txn.get(clientDocRef);
                                    if (cSnap.data()?.status !== 'Vencido' || cSnap.data()?.sentRemarketingIds?.includes(config.id)) throw new Error('Wait');
                                    txn.update(clientDocRef, { sentRemarketingIds: arrayUnion(config.id) });
                                    processed = true;
                                });
                            } catch (e) {}
                            if (processed) {
                                rmkDone++;
                                await fetch(`${originUrl}/api/send-message`, {
                                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ message: config.message.replace(/{cliente}/g, client.name).replace(/{telefone}/g, client.phone), phoneNumber: client.phone, token: billingToken }),
                                }).catch(console.error);
                            }
                        }
                    }
                }
            }

            /* --- 4. PROCESSAR GRUPOS AGENDADOS --- */
            const scheduledSnap = await getDocs(collection(db, 'users', userId, 'scheduled_messages'));
            const scheduled = scheduledSnap.docs.map(d => ({ id: d.id, ...d.data() } as ScheduledMessage));
            const dueMessages = scheduled.filter(msg => msg.status === 'Scheduled' && msg.sendAt.toDate() <= now).slice(0, QUEUE_LIMIT);

            for (const msg of dueMessages) {
                const messageDocRef = doc(db, 'users', userId, 'scheduled_messages', msg.id);
                let processed = false;
                try {
                    await runTransaction(db, async (txn) => {
                        const mSnap = await txn.get(messageDocRef);
                        if (mSnap.data()?.status !== 'Scheduled') throw new Error('Sent');
                        txn.update(messageDocRef, { status: 'Sending' }); // Lock for processing
                        processed = true;
                    });
                } catch (e) {}

                if (processed) {
                    const msgToken = msg.useBillingZap && settings.useSeparateBillingZap && settings.billingWebhookToken 
                        ? settings.billingWebhookToken 
                        : settings.webhookToken;

                    const response = await fetch(`${originUrl}/api/send-group-message`, {
                        method: 'POST', headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ jid: msg.jid, message: msg.message, imageUrl: msg.imageUrl, token: msgToken }),
                    });

                    if (response.ok) {
                        if (msg.repeatDaily) {
                            runTransaction(db, async (txn) => txn.update(messageDocRef, { sendAt: Timestamp.fromDate(addDays(msg.sendAt.toDate(), 1)), status: 'Scheduled' }));
                        } else {
                            runTransaction(db, async (txn) => txn.update(messageDocRef, { status: 'Sent' }));
                        }
                    } else {
                        runTransaction(db, async (txn) => txn.update(messageDocRef, { status: 'Error' }));
                    }
                }
            }
        } // User loop ends

        return NextResponse.json({ success: true, message: 'Cron processed everything dynamically.' });

    } catch (e: any) {
        console.error('CRON Fatal Error:', e);
        return NextResponse.json({ success: false, error: e.message }, { status: 500 });
    }
}
