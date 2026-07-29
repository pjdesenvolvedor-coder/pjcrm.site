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

function formatPhoneWith55(phone: string): string {
    if (!phone) return '';
    let digits = phone.replace(/\D/g, '');
    if (!digits) return '';
    if (!digits.startsWith('55') && (digits.length === 10 || digits.length === 11)) {
        digits = '55' + digits;
    }
    return digits;
}

function getTimestampMs(val: any): number | null {
    if (!val) return null;
    if (typeof val === 'number') return val;
    if (typeof val.toMillis === 'function') return val.toMillis();
    if (typeof val.toDate === 'function') return val.toDate().getTime();
    if (val.seconds !== undefined) return val.seconds * 1000;
    if (val instanceof Date) return val.getTime();
    if (typeof val === 'string') {
        const ms = new Date(val).getTime();
        return isNaN(ms) ? null : ms;
    }
    return null;
}

function formatDateSafe(val: any): string {
    const ms = getTimestampMs(val);
    if (!ms) return 'N/A';
    try {
        return format(new Date(ms), 'dd/MM/yyyy');
    } catch {
        return 'N/A';
    }
}

function formatMessageWithClient(template: string, client: Client): string {
    if (!template) return '';
    return template
        .replace(/{cliente}/g, client.name || '')
        .replace(/{telefone}/g, client.phone || '')
        .replace(/{email}/g, Array.isArray(client.email) ? client.email.join(', ') : (client.email || ''))
        .replace(/{senha}/g, client.password || 'N/A')
        .replace(/{tela}/g, client.screen || 'N/A')
        .replace(/{pin_tela}/g, client.pinScreen || 'N/A')
        .replace(/{link}/g, client.accessLink || 'N/A')
        .replace(/{assinatura}/g, client.subscription || 'N/A')
        .replace(/{vencimento}/g, formatDateSafe(client.dueDate))
        .replace(/{valor}/g, client.amountPaid || '0,00')
        .replace(/{status}/g, client.status || 'Ativo');
}

export async function GET(request: Request) {
    try {
        const usersSnapshot = await getDocs(collection(db, 'users'));
        const now = new Date();
        const originUrl = new URL(request.url).origin;

        // Limite por execucao para não dar timeout em servidor basico (Hobby)
        // Por usuário, processaremos no maximo 2 de cada tipo por minuto.
        const QUEUE_LIMIT = 20;

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

            /* --- 1. PROCESSAR VENCIMENTOS --- */
            // O update de status (Ativo -> Vencido) deve ocorrer para todos, independentemente da mensagem
            const allOverdueClients = activeClients.filter(c => c.dueDate && c.dueDate.toDate() <= now);
            for (const client of allOverdueClients) {
                const clientDocRef = doc(db, 'users', userId, 'clients', client.id);
                try {
                    await runTransaction(db, async (txn) => {
                        const cSnap = await txn.get(clientDocRef);
                        if (cSnap.data()?.status === 'Ativo') {
                            txn.update(clientDocRef, { status: 'Vencido' });
                        }
                    });
                } catch (e) {}
            }

            // Disparo automático desativado temporariamente a pedido do usuário
            /*
            if (settings.isDueDateMessageActive && settings.dueDateMessage) {
                const overdueClients = allOverdueClients.slice(0, QUEUE_LIMIT);
                
                for (const client of overdueClients) {
                    // ... logica de envio removida temporariamente
                }
            }
            */

            /* --- 2. PROCESSAR UPSELL --- */
            let activeUpsells: UpsellConfig[] = [];
            if (settings?.upsells2 && settings.upsells2.length > 0) {
                activeUpsells = settings.upsells2.filter(u => Boolean(u.isActive) && Boolean(u.upsellMessage && u.upsellMessage.trim()));
            }

            const upsellToken = settings.webhookToken || settings.billingWebhookToken;

            if (activeUpsells.length > 0 && upsellToken) {
                let upsellsDone = 0;
                for (const client of activeClients) {
                    if (upsellsDone >= QUEUE_LIMIT) break;
                    const clientCreatedMs = getTimestampMs(client.createdAt) || getTimestampMs((client as any).created_at) || 0;
                    const STRICT_CUTOFF_MS = 1770008540000; // 28/07/2026 00:42:20

                    for (let uIdx = 0; uIdx < activeUpsells.length; uIdx++) {
                        const upsell = activeUpsells[uIdx];
                        if (upsellsDone >= QUEUE_LIMIT) break;
                        
                        const ruleId = (upsell.id && typeof upsell.id === 'string' && upsell.id.trim())
                            ? upsell.id.trim()
                            : `rule_${upsell.createdAt || uIdx}_${(upsell.upsellMessage || '').slice(0, 15).replace(/\s+/g, '_')}`;

                        const delayMinutes = Number(upsell.upsellDelayMinutes) || 0;
                        const delayMs = delayMinutes * 60 * 1000;

                        const clientSentList = Array.isArray(client.sentUpsell2Ids) 
                            ? client.sentUpsell2Ids 
                            : (typeof client.sentUpsell2Ids === 'string' ? [client.sentUpsell2Ids] : []);

                        const alreadySent = Boolean(
                            (upsell.id && clientSentList.includes(upsell.id)) ||
                            clientSentList.includes(ruleId)
                        );

                        if ((now.getTime() - clientCreatedMs) >= delayMs && !alreadySent) {
                            let processed = false;
                            const clientDocRef = doc(db, 'users', userId, 'clients', client.id);
                            
                            try {
                                await runTransaction(db, async (txn) => {
                                    const cSnap = await txn.get(clientDocRef);
                                    if (!cSnap.exists()) throw new Error('Deleted');
                                    const cData = cSnap.data();
                                    if (cData?.status === 'Inativo' || cData?.status === 'Vencido') throw new Error('Inactive');
                                    
                                    const rawSent = cData?.sentUpsell2Ids;
                                    const sentList = Array.isArray(rawSent) 
                                        ? rawSent 
                                        : (typeof rawSent === 'string' ? [rawSent] : []);

                                    if (sentList.includes(ruleId) || (upsell.id && sentList.includes(upsell.id))) throw new Error('Sent');
                                    
                                    const updatedList = Array.from(new Set([...sentList, ruleId, upsell.id].filter(Boolean))) as string[];
                                    txn.update(clientDocRef, { sentUpsell2Ids: updatedList });
                                    processed = true;
                                });
                            } catch (e) {}

                            if (processed) {
                                upsellsDone++;
                                let formattedMessage = formatMessageWithClient(upsell.upsellMessage, client);

                                const hasInteractiveContent = Boolean(
                                    upsell.messageType === 'button' ||
                                    (upsell.buttons && upsell.buttons.length > 0) ||
                                    (upsell.imageButton && upsell.imageButton.trim()) ||
                                    (upsell.footerText && upsell.footerText.trim())
                                );

                                if (hasInteractiveContent) {
                                    let choices = (upsell.buttons || []).map(b => {
                                        const label = formatMessageWithClient(b.label, client).trim() || 'Acessar';
                                        let cleanUrl = (b.url || '').trim();
                                        if (cleanUrl && !cleanUrl.startsWith('http://') && !cleanUrl.startsWith('https://')) {
                                            cleanUrl = `https://${cleanUrl}`;
                                        }
                                        return cleanUrl ? `${label}|${cleanUrl}` : `${label}`;
                                    }).filter(Boolean);

                                    if (choices.length === 0) {
                                        choices = ['Comprar Agora|https://www.contaspj.shop/'];
                                    }

                                    const payloadMenu: any = {
                                        number: formatPhoneWith55(client.phone),
                                        type: 'button',
                                        text: formattedMessage,
                                        choices: choices,
                                    };

                                    if (upsell.imageButton && typeof upsell.imageButton === 'string' && upsell.imageButton.trim()) {
                                        const cleanImg = upsell.imageButton.trim();
                                        payloadMenu.imageButton = cleanImg;
                                        payloadMenu.image = cleanImg;
                                        payloadMenu.imageUrl = cleanImg;
                                        payloadMenu.mediaUrl = cleanImg;
                                        payloadMenu.media = cleanImg;
                                    }

                                    if (upsell.footerText && typeof upsell.footerText === 'string' && upsell.footerText.trim()) {
                                        payloadMenu.footerText = formatMessageWithClient(upsell.footerText, client).trim();
                                    }

                                    await fetch('https://pjcontas.uazapi.com/send/menu', {
                                        method: 'POST',
                                        headers: {
                                            'Content-Type': 'application/json',
                                            'token': upsellToken,
                                            'apikey': upsellToken,
                                        },
                                        body: JSON.stringify(payloadMenu),
                                    }).catch(console.error);
                                } else {
                                    await fetch('https://pjcontas.uazapi.com/send/text', {
                                        method: 'POST',
                                        headers: {
                                            'Content-Type': 'application/json',
                                            'token': upsellToken,
                                            'apikey': upsellToken,
                                        },
                                        body: JSON.stringify({
                                            number: formatPhoneWith55(client.phone),
                                            text: formattedMessage,
                                        }),
                                    }).catch(console.error);
                                }
                            }
                        }
                    }
                }
            }

            /* --- 3. PROCESSAR REMARKETING --- */
            const isOverallRemarketingActive = settings.isRemarketingActive ?? true;
            const isSignupGlobalActive = settings.isPostSignupRemarketingActive ?? true;
            const isDueDateGlobalActive = settings.isPostDueDateRemarketingActive ?? true;

            const activeSignupRemarketings = (isOverallRemarketingActive && isSignupGlobalActive)
                ? (settings.postSignupRemarketings?.filter(r => r.isActive && r.message) || [])
                : [];
            const activeDueDateRemarketings = (isOverallRemarketingActive && isDueDateGlobalActive)
                ? (settings.postDueDateRemarketings?.filter(r => r.isActive && r.message) || [])
                : [];
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
                                    body: JSON.stringify({ message: formatMessageWithClient(config.message, client), phoneNumber: client.phone, token: settings.webhookToken }),
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
                                    body: JSON.stringify({ message: formatMessageWithClient(config.message, client), phoneNumber: client.phone, token: settings.webhookToken }),
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
                    try {
                        const msgToken = msg.useBillingZap && settings.useSeparateBillingZap && settings.billingWebhookToken 
                            ? settings.billingWebhookToken 
                            : settings.webhookToken;

                        const response = await fetch(`${originUrl}/api/send-group-message`, {
                            method: 'POST', headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ 
                                jid: msg.jid, 
                                message: msg.message, 
                                imageUrl: msg.imageUrl, 
                                token: msgToken,
                                supportNumber: msg.supportNumber,
                                siteLink: msg.siteLink
                            }),
                        });

                        if (response.ok) {
                            if (msg.repeatDaily) {
                                await runTransaction(db, async (txn) => txn.update(messageDocRef, { 
                                    sendAt: Timestamp.fromDate(addDays(msg.sendAt.toDate(), 1)), 
                                    status: 'Scheduled',
                                    retryCount: 0,
                                    errorReason: null
                                }));
                            } else {
                                await runTransaction(db, async (txn) => txn.update(messageDocRef, { 
                                    status: 'Sent',
                                    errorReason: null
                                }));
                            }
                        } else {
                            let errorMsg = 'Erro desconhecido';
                            try {
                                const errData = await response.json();
                                errorMsg = errData.error || errData.details || response.statusText || `Status ${response.status}`;
                            } catch {
                                try {
                                    const errText = await response.text();
                                    errorMsg = errText || `Status ${response.status}`;
                                } catch {}
                            }

                            const currentRetryCount = msg.retryCount || 0;
                            if (currentRetryCount < 1) {
                                const tomorrow = addDays(msg.sendAt.toDate(), 1);
                                await runTransaction(db, async (txn) => txn.update(messageDocRef, { 
                                    status: 'Scheduled', 
                                    sendAt: Timestamp.fromDate(tomorrow), 
                                    retryCount: currentRetryCount + 1,
                                    errorReason: errorMsg
                                }));
                            } else {
                                await runTransaction(db, async (txn) => txn.update(messageDocRef, { 
                                    status: 'Error',
                                    errorReason: errorMsg
                                }));
                            }
                        }
                    } catch (fetchErr: any) {
                        console.error('Failed to dispatch scheduled message fetch:', fetchErr);
                        const errorMsg = fetchErr.message || 'Erro de conexão/servidor';
                        const currentRetryCount = msg.retryCount || 0;
                        if (currentRetryCount < 1) {
                            const tomorrow = addDays(msg.sendAt.toDate(), 1);
                            await runTransaction(db, async (txn) => txn.update(messageDocRef, { 
                                status: 'Scheduled', 
                                sendAt: Timestamp.fromDate(tomorrow), 
                                retryCount: currentRetryCount + 1,
                                errorReason: errorMsg
                            }));
                        } else {
                            await runTransaction(db, async (txn) => txn.update(messageDocRef, { 
                                status: 'Error',
                                errorReason: errorMsg
                            }));
                        }
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
