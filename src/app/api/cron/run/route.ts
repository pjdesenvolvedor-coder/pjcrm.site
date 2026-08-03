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
const userLocks = new Map<string, number>();

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

function getCanonicalPhone(phone: string): string {
    if (!phone) return '';
    const digits = phone.replace(/\D/g, '');
    if (!digits) return '';
    let local = (digits.startsWith('55') && digits.length >= 12) ? digits.slice(2) : digits;
    if (local.length === 11 && local[2] === '9') {
        local = local.slice(0, 2) + local.slice(3);
    }
    if (local.length === 10) {
        return '55' + local;
    }
    return digits;
}

function formatPhoneWith55(phone: string): string {
    return getCanonicalPhone(phone);
}

function getMessageSignature(msg: string): string {
    if (!msg) return '';
    const clean = msg.trim().toLowerCase().replace(/\s+/g, '_').slice(0, 40);
    return `sig_${clean}`;
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

            // TRAVA ANTI-DUPLICAÇÃO ENTRE PCS/ABAS: Evita execuções simultâneas em milissegundos (2 segundos)
            const nowMs = Date.now();
            const lastUserRun = userLocks.get(userId) || 0;
            if (nowMs - lastUserRun < 2000) {
                continue;
            }
            userLocks.set(userId, nowMs);

            // TRAVA GLOBAL DISTRIBUÍDA VIA FIRESTORE: Bloqueia chamadas concorrentes entre todos os servidores/navegadores
            const cronLockRef = doc(db, 'users', userId, 'locks', 'cron_lock');
            let isUserLockAcquired = false;
            try {
                await runTransaction(db, async (txn) => {
                    const lockSnap = await txn.get(cronLockRef);
                    const lastRunMs = lockSnap.exists() ? (lockSnap.data()?.lastRunMs || 0) : 0;
                    if (nowMs - lastRunMs < 2000) {
                        throw new Error('LockActive');
                    }
                    txn.set(cronLockRef, { lastRunMs: nowMs, updatedVia: 'cron' }, { merge: true });
                    isUserLockAcquired = true;
                });
            } catch (e) {
                isUserLockAcquired = false;
            }

            if (!isUserLockAcquired) {
                continue;
            }

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

            /* --- 2. PROCESSAR UPSELL ---
             * Lógica:
             * - Para cada cliente ativo cadastrado APÓS a regra ser criada
             * - Para cada regra de upsell ativa configurada
             * - Se o tempo decorrido desde o cadastro do cliente >= delay configurado
             * - E a regra ainda não foi enviada para este número de telefone
             * → Marcar como enviado (transação atômica) e enviar mensagem
             * Zero duplicatas. Cada ruleId é enviado 1x por número canônico.
             */
            const activeUpsells: UpsellConfig[] = (settings?.upsells || []).filter(
                (u) => Boolean(u.isActive) && Boolean(u.upsellMessage?.trim())
            );

            const upsellToken = settings.webhookToken || settings.billingWebhookToken;

            if (activeUpsells.length > 0 && upsellToken) {
                let upsellsDone = 0;

                // Mapa em memória: telefone canônico → conjunto de ruleIds já enviados
                const phoneSentRulesMap = new Map<string, Set<string>>();
                for (const c of clients) {
                    const cp = getCanonicalPhone(c.phone);
                    if (!cp) continue;
                    if (!phoneSentRulesMap.has(cp)) phoneSentRulesMap.set(cp, new Set<string>());
                    const s = phoneSentRulesMap.get(cp)!;
                    const ids1 = Array.isArray(c.sentUpsellIds) ? c.sentUpsellIds as string[] : [];
                    const ids2 = Array.isArray(c.sentUpsell2Ids) ? c.sentUpsell2Ids as string[] : [];
                    [...ids1, ...ids2].forEach((id) => { if (id) s.add(id); });
                }

                for (const client of activeClients) {
                    if (upsellsDone >= QUEUE_LIMIT) break;

                    const clientCreatedMs = getTimestampMs(client.createdAt) || 0;
                    if (!clientCreatedMs) continue; // Ignora clientes sem data de cadastro

                    const cleanPhone = getCanonicalPhone(client.phone);
                    if (!cleanPhone) continue;

                    // Todos os documentos do mesmo telefone (para marcar sentUpsellIds em todos)
                    const samePhoneDocs = clients.filter((c) => getCanonicalPhone(c.phone) === cleanPhone);

                    for (const upsell of activeUpsells) {
                        if (upsellsDone >= QUEUE_LIMIT) break;

                        // ID permanente da regra (gerado na UI e nunca alterado)
                        const ruleId: string = (upsell.id && typeof upsell.id === 'string' && upsell.id.trim())
                            ? upsell.id.trim()
                            : `rule_${(upsell.upsellMessage || '').slice(0, 20).replace(/\s+/g, '_')}`;

                        // Se a regra foi criada DEPOIS do cliente → cliente não elegível
                        const ruleCreatedMs = Number(upsell.createdAt) || 0;
                        if (ruleCreatedMs > 0 && clientCreatedMs < ruleCreatedMs) continue;

                        // Verifica se ainda não está na hora de enviar
                        const delayMs = (Number(upsell.upsellDelayMinutes) || 0) * 60 * 1000;
                        if ((now.getTime() - clientCreatedMs) < delayMs) continue;

                        // Já foi enviado para este telefone?
                        const sentForPhone = phoneSentRulesMap.get(cleanPhone) || new Set<string>();
                        if (sentForPhone.has(ruleId)) continue;

                        // ── Transação atômica: todas as leituras antes de todas as escritas ──
                        let sent = false;
                        try {
                            await runTransaction(db, async (txn) => {
                                const snapshots: Array<{ ref: any; existingIds: string[] }> = [];

                                // FASE 1: apenas leituras
                                for (const pd of samePhoneDocs) {
                                    const ref = doc(db, 'users', userId, 'clients', pd.id);
                                    const snap = await txn.get(ref);
                                    if (!snap.exists()) continue;
                                    const d = snap.data();
                                    const sent1 = Array.isArray(d?.sentUpsellIds) ? d.sentUpsellIds as string[] : [];
                                    const sent2 = Array.isArray(d?.sentUpsell2Ids) ? d.sentUpsell2Ids as string[] : [];
                                    if ([...sent1, ...sent2].includes(ruleId)) {
                                        throw new Error('AlreadySent');
                                    }
                                    snapshots.push({ ref, existingIds: sent1 });
                                }

                                // FASE 2: apenas escritas (somente após todas as leituras)
                                for (const item of snapshots) {
                                    const updated = Array.from(new Set([...item.existingIds, ruleId]));
                                    txn.update(item.ref, { sentUpsellIds: updated });
                                }

                                sent = true;
                            });
                        } catch (e: any) {
                            if (e?.message !== 'AlreadySent') {
                                console.error(`[cron/upsell] Falha na transação: userId=${userId} phone=${cleanPhone} ruleId=${ruleId}:`, e?.message);
                            }
                        }
                        // ──────────────────────────────────────────────────────────────────

                        if (sent) {
                            // Atualiza mapa em memória para evitar re-envio neste mesmo batch
                            sentForPhone.add(ruleId);
                            phoneSentRulesMap.set(cleanPhone, sentForPhone);
                            upsellsDone++;

                            const msg = formatMessageWithClient(upsell.upsellMessage, client);
                            console.log(`[cron/upsell] Enviando ruleId=${ruleId} → ${cleanPhone}: ${msg.slice(0, 60)}`);

                            try {
                                const res = await fetch('https://pjcontas.uazapi.com/send/text', {
                                    method: 'POST',
                                    headers: {
                                        'Content-Type': 'application/json',
                                        'token': upsellToken,
                                        'apikey': upsellToken,
                                    },
                                    body: JSON.stringify({ number: cleanPhone, text: msg }),
                                });
                                console.log(`[cron/upsell] UAZAPI status: ${res.status}`);
                            } catch (fetchErr: any) {
                                console.error(`[cron/upsell] Erro ao enviar mensagem:`, fetchErr?.message);
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
                if (!client.createdAt) continue;

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
                if (!client.createdAt) continue;

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
            const dueMessages = scheduled.filter(msg => {
                if (msg.status !== 'Scheduled') return false;
                const sendAtMs = msg.sendAt ? getTimestampMs(msg.sendAt) || 0 : 0;
                return sendAtMs > 0 && sendAtMs <= now.getTime();
            }).slice(0, QUEUE_LIMIT);

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
