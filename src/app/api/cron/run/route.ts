import { NextResponse } from 'next/server';
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore, collection, getDocs, doc, runTransaction, Timestamp, arrayUnion } from 'firebase/firestore';
import { firebaseConfig } from '@/firebase/config';
import { format, addDays } from 'date-fns';
import type { Client, Settings, UserProfile, ScheduledMessage, UpsellConfig } from '@/lib/types';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
const db = getFirestore(app);
const userLocks = new Map<string, number>();

function getCanonicalPhone(phone: string): string {
    if (!phone) return '';
    const digits = phone.replace(/\D/g, '');
    if (!digits) return '';
    let local = (digits.startsWith('55') && digits.length >= 12) ? digits.slice(2) : digits;
    if (local.length === 11 && local[2] === '9') {
        local = local.slice(0, 2) + local.slice(3);
    }
    if (local.length === 10) return '55' + local;
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

// Calcula dias calendário em fuso Brasília (UTC-3)
// 02/08 23:59 -> 03/08 00:01 = 1 dia (ignora hora, compara só a data)
function calendarDaysBrasilia(now: Date, startDate: Date): number {
    const offset = -3 * 60 * 60 * 1000; // UTC-3
    const nowBr = new Date(now.getTime() + offset);
    const startBr = new Date(startDate.getTime() + offset);
    const nowDay = Date.UTC(nowBr.getUTCFullYear(), nowBr.getUTCMonth(), nowBr.getUTCDate());
    const startDay = Date.UTC(startBr.getUTCFullYear(), startBr.getUTCMonth(), startBr.getUTCDate());
    return Math.round((nowDay - startDay) / (1000 * 60 * 60 * 24));
}

// Verifica se o horário atual (Brasília) já passou do horário configurado
// sendTime ex: "12:30" — se não configurado, envia sempre
function isAfterSendTime(nowUtc: Date, sendTime: string | undefined): boolean {
    if (!sendTime) return true;
    const offset = -3 * 60 * 60 * 1000;
    const nowBr = new Date(nowUtc.getTime() + offset);
    const [h, m] = sendTime.split(':').map(Number);
    return (nowBr.getUTCHours() * 60 + nowBr.getUTCMinutes()) >= (h * 60 + m);
}

function formatDateSafe(val: any): string {
    const ms = getTimestampMs(val);
    if (!ms) return 'N/A';
    try { return format(new Date(ms), 'dd/MM/yyyy'); } catch { return 'N/A'; }
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
        const QUEUE_LIMIT = 20;

        for (const userDoc of usersSnapshot.docs) {
            const userId = userDoc.id;

            // Trava em memoria: evita chamadas duplicadas em menos de 2s
            const nowMs = Date.now();
            const lastUserRun = userLocks.get(userId) || 0;
            if (nowMs - lastUserRun < 2000) continue;
            userLocks.set(userId, nowMs);

            // Trava distribuida via Firestore: bloqueia chamadas concorrentes entre servidores
            const cronLockRef = doc(db, 'users', userId, 'locks', 'cron_lock');
            let isUserLockAcquired = false;
            try {
                await runTransaction(db, async (txn) => {
                    const lockSnap = await txn.get(cronLockRef);
                    const lastRunMs = lockSnap.exists() ? (lockSnap.data()?.lastRunMs || 0) : 0;
                    if (nowMs - lastRunMs < 2000) throw new Error('LockActive');
                    txn.set(cronLockRef, { lastRunMs: nowMs, updatedVia: 'cron' }, { merge: true });
                    isUserLockAcquired = true;
                });
            } catch (e) { isUserLockAcquired = false; }

            if (!isUserLockAcquired) continue;

            const userProfile = userDoc.data() as UserProfile;
            if (userProfile.role !== 'Admin' && userProfile.subscriptionEndDate && userProfile.subscriptionEndDate.toDate() < now) continue;

            const configSnap = await getDocs(collection(db, 'users', userId, 'settings'));
            const specificConfig = configSnap.docs.find(d => d.id === 'config');
            if (!specificConfig || !specificConfig.exists()) continue;
            const settings = specificConfig.data() as Settings;

            const billingToken = settings.useSeparateBillingZap && settings.billingWebhookToken
                ? settings.billingWebhookToken : settings.webhookToken;
            if (!billingToken) continue;

            const clientsSnapshot = await getDocs(collection(db, 'users', userId, 'clients'));
            const clients = clientsSnapshot.docs.map(d => ({ id: d.id, ...d.data() } as Client));
            const activeClients = clients.filter(c => c.status === 'Ativo');
            const overdueStatusClients = clients.filter(c => c.status === 'Vencido');

            /* --- 1. PROCESSAR VENCIMENTOS --- */
            for (const client of activeClients.filter(c => c.dueDate && c.dueDate.toDate() <= now)) {
                const ref = doc(db, 'users', userId, 'clients', client.id);
                try {
                    await runTransaction(db, async (txn) => {
                        const snap = await txn.get(ref);
                        if (snap.data()?.status === 'Ativo') txn.update(ref, { status: 'Vencido' });
                    });
                } catch (e) {}
            }

            /* --- 2. PROCESSAR UPSELL ---
             *
             * REGRAS:
             * - Dedup por DOCUMENTO (sentUpsellIds): se este doc ja recebeu a regra -> pula
             * - Nova compra = novo documento = sem sentUpsellIds = elegivel para receber upsells
             * - Dedup por TELEFONE no mesmo run (sentInThisBatch): se outro doc do mesmo
             *   telefone ja disparou nesta execucao, MARCA este doc no banco mas NAO envia
             * - Timing: baseado no createdAt deste documento
             * - Elegibilidade: cliente cadastrado ANTES da criacao da regra nao e elegivel
             *
             * Exemplo:
             *   Doc antigo (marcado) + Doc novo (vazio) -> doc novo envia, 1 mensagem
             *   Doc1 (vazio) + Doc2 (vazio) no mesmo run -> Doc1 envia, Doc2 so marca
             */
            const activeUpsells: UpsellConfig[] = (settings?.upsells || []).filter(
                (u) => Boolean(u.isActive) && Boolean(u.upsellMessage?.trim())
            );
            const upsellToken = settings.webhookToken || settings.billingWebhookToken;

            if (activeUpsells.length > 0 && upsellToken) {
                let upsellsDone = 0;

                // phone -> Set<ruleId> ja enviados NESTE run (impede duplicata no mesmo cron)
                const sentInThisBatch = new Map<string, Set<string>>();

                for (const client of activeClients) {
                    if (upsellsDone >= QUEUE_LIMIT) break;

                    const clientCreatedMs = getTimestampMs(client.createdAt) || 0;
                    if (!clientCreatedMs) continue;

                    const cleanPhone = getCanonicalPhone(client.phone);
                    if (!cleanPhone) continue;

                    // ruleIds ja enviados para ESTE documento especifico
                    const docSentIds = new Set<string>([
                        ...(Array.isArray(client.sentUpsellIds) ? client.sentUpsellIds as string[] : []),
                        ...(Array.isArray(client.sentUpsell2Ids) ? client.sentUpsell2Ids as string[] : []),
                    ]);

                    const clientDocRef = doc(db, 'users', userId, 'clients', client.id);

                    for (const upsell of activeUpsells) {
                        if (upsellsDone >= QUEUE_LIMIT) break;

                        const ruleId: string = (upsell.id && typeof upsell.id === 'string' && upsell.id.trim())
                            ? upsell.id.trim()
                            : `rule_${(upsell.upsellMessage || '').slice(0, 20).replace(/\s+/g, '_')}`;

                        // Regra criada depois do cliente -> nao elegivel
                        const ruleCreatedMs = Number(upsell.createdAt) || 0;
                        if (ruleCreatedMs > 0 && clientCreatedMs < ruleCreatedMs) continue;

                        // Tempo de espera nao passou ainda
                        const delayMs = (Number(upsell.upsellDelayMinutes) || 0) * 60 * 1000;
                        if ((now.getTime() - clientCreatedMs) < delayMs) continue;

                        // Este DOCUMENTO ja recebeu esta regra? (nao e nova compra)
                        if (docSentIds.has(ruleId)) continue;

                        // Este telefone ja recebeu neste run?
                        const alreadySentInBatch = sentInThisBatch.get(cleanPhone)?.has(ruleId) ?? false;

                        // Transacao atomica: marca APENAS este documento
                        let markedInDb = false;
                        try {
                            await runTransaction(db, async (txn) => {
                                const snap = await txn.get(clientDocRef);
                                if (!snap.exists()) throw new Error('DocNotFound');
                                const d = snap.data();
                                const e1 = Array.isArray(d?.sentUpsellIds) ? d.sentUpsellIds as string[] : [];
                                const e2 = Array.isArray(d?.sentUpsell2Ids) ? d.sentUpsell2Ids as string[] : [];
                                if ([...e1, ...e2].includes(ruleId)) throw new Error('AlreadySent');
                                txn.update(clientDocRef, { sentUpsellIds: Array.from(new Set([...e1, ruleId])) });
                                markedInDb = true;
                            });
                        } catch (e: any) {
                            if (e?.message !== 'AlreadySent' && e?.message !== 'DocNotFound') {
                                console.error(`[upsell] Transacao falhou: clientId=${client.id} ruleId=${ruleId}:`, e?.message);
                            }
                        }

                        if (markedInDb) {
                            docSentIds.add(ruleId);

                            if (!alreadySentInBatch) {
                                // Primeira vez neste run para este telefone+regra: ENVIA
                                if (!sentInThisBatch.has(cleanPhone)) sentInThisBatch.set(cleanPhone, new Set());
                                sentInThisBatch.get(cleanPhone)!.add(ruleId);
                                upsellsDone++;

                                const msg = formatMessageWithClient(upsell.upsellMessage, client);
                                console.log(`[upsell] ENVIANDO ruleId=${ruleId} -> ${cleanPhone}: "${msg.slice(0, 50)}"`);
                                try {
                                    const res = await fetch('https://pjcontas.uazapi.com/send/text', {
                                        method: 'POST',
                                        headers: { 'Content-Type': 'application/json', 'token': upsellToken, 'apikey': upsellToken },
                                        body: JSON.stringify({ number: cleanPhone, text: msg }),
                                    });
                                    console.log(`[upsell] UAZAPI status: ${res.status}`);
                                } catch (fetchErr: any) {
                                    console.error(`[upsell] Erro ao enviar:`, fetchErr?.message);
                                }
                            } else {
                                console.log(`[upsell] Batch dedup: clientId=${client.id} phone=${cleanPhone} ruleId=${ruleId} - marcado, sem reenvio`);
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
                ? (settings.postSignupRemarketings?.filter(r => r.isActive && r.message) || []) : [];
            const activeDueDateRemarketings = (isOverallRemarketingActive && isDueDateGlobalActive)
                ? (settings.postDueDateRemarketings?.filter(r => r.isActive && r.message) || []) : [];
            let rmkDone = 0;

            // Horários configurados para envio (Brasília)
            const signupSendTime = settings.postSignupSendTime;    // ex: "12:30"
            const dueDateSendTimeStr = settings.postDueDateSendTime; // ex: "09:00"

            for (const client of clients) {
                if (rmkDone >= QUEUE_LIMIT) break;
                if (!client.createdAt) continue;
                for (const config of activeSignupRemarketings) {
                    if (rmkDone >= QUEUE_LIMIT) break;
                    const startDate = client.createdAt?.toDate();
                    if (startDate && (!config.createdAt || client.createdAt!.toMillis() >= config.createdAt)) {
                        const daysDiff = calendarDaysBrasilia(now, startDate);
                        // Dias calendário atingidos E horário de envio configurado já passou
                        if (daysDiff >= config.days && isAfterSendTime(now, signupSendTime) && !client.sentRemarketingIds?.includes(config.id)) {
                            const ref = doc(db, 'users', userId, 'clients', client.id);
                            let processed = false;
                            try {
                                await runTransaction(db, async (txn) => {
                                    const snap = await txn.get(ref);
                                    if (snap.data()?.sentRemarketingIds?.includes(config.id)) throw new Error('Sent');
                                    txn.update(ref, { sentRemarketingIds: arrayUnion(config.id) });
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

            for (const client of overdueStatusClients) {
                if (rmkDone >= QUEUE_LIMIT) break;
                if (!client.createdAt) continue;
                for (const config of activeDueDateRemarketings) {
                    if (rmkDone >= QUEUE_LIMIT) break;
                    const startDate = client.dueDate?.toDate();
                    if (startDate && (!config.createdAt || client.createdAt!.toMillis() >= config.createdAt)) {
                        const daysDiff = calendarDaysBrasilia(now, startDate);
                        // Dias calendário atingidos E horário de envio configurado já passou
                        if (daysDiff >= config.days && isAfterSendTime(now, dueDateSendTimeStr) && !client.sentRemarketingIds?.includes(config.id)) {
                            const ref = doc(db, 'users', userId, 'clients', client.id);
                            let processed = false;
                            try {
                                await runTransaction(db, async (txn) => {
                                    const snap = await txn.get(ref);
                                    if (snap.data()?.status !== 'Vencido' || snap.data()?.sentRemarketingIds?.includes(config.id)) throw new Error('Wait');
                                    txn.update(ref, { sentRemarketingIds: arrayUnion(config.id) });
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
                        txn.update(messageDocRef, { status: 'Sending' });
                        processed = true;
                    });
                } catch (e) {}

                if (processed) {
                    try {
                        const msgToken = msg.useBillingZap && settings.useSeparateBillingZap && settings.billingWebhookToken
                            ? settings.billingWebhookToken : settings.webhookToken;
                        const response = await fetch(`${originUrl}/api/send-group-message`, {
                            method: 'POST', headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ jid: msg.jid, message: msg.message, imageUrl: msg.imageUrl, token: msgToken, supportNumber: msg.supportNumber, siteLink: msg.siteLink }),
                        });
                        if (response.ok) {
                            if (msg.repeatDaily) {
                                await runTransaction(db, async (txn) => txn.update(messageDocRef, { sendAt: Timestamp.fromDate(addDays(msg.sendAt.toDate(), 1)), status: 'Scheduled', retryCount: 0, errorReason: null }));
                            } else {
                                await runTransaction(db, async (txn) => txn.update(messageDocRef, { status: 'Sent', errorReason: null }));
                            }
                        } else {
                            let errorMsg = 'Erro desconhecido';
                            try { const e = await response.json(); errorMsg = e.error || e.details || response.statusText || `Status ${response.status}`; } catch { try { errorMsg = await response.text() || `Status ${response.status}`; } catch {} }
                            const retries = msg.retryCount || 0;
                            if (retries < 1) {
                                await runTransaction(db, async (txn) => txn.update(messageDocRef, { status: 'Scheduled', sendAt: Timestamp.fromDate(addDays(msg.sendAt.toDate(), 1)), retryCount: retries + 1, errorReason: errorMsg }));
                            } else {
                                await runTransaction(db, async (txn) => txn.update(messageDocRef, { status: 'Error', errorReason: errorMsg }));
                            }
                        }
                    } catch (fetchErr: any) {
                        console.error('Scheduled message dispatch failed:', fetchErr);
                        const retries = msg.retryCount || 0;
                        if (retries < 1) {
                            await runTransaction(db, async (txn) => txn.update(messageDocRef, { status: 'Scheduled', sendAt: Timestamp.fromDate(addDays(msg.sendAt.toDate(), 1)), retryCount: retries + 1, errorReason: fetchErr.message }));
                        } else {
                            await runTransaction(db, async (txn) => txn.update(messageDocRef, { status: 'Error', errorReason: fetchErr.message }));
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
