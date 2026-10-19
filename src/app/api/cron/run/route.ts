import { NextResponse } from 'next/server';
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore, collection, getDocs, doc, runTransaction, Timestamp, arrayUnion } from 'firebase/firestore';
import { firebaseConfig } from '@/firebase/config';
import { format, addDays } from 'date-fns';
import type { Client, Settings, UserProfile, ScheduledMessage, UpsellConfig, UpsellMenuConfig } from '@/lib/types';

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
function calendarDaysBrasilia(now: Date, startDate: Date): number {
    const offset = -3 * 60 * 60 * 1000; // UTC-3
    const nowBr = new Date(now.getTime() + offset);
    const startBr = new Date(startDate.getTime() + offset);
    const nowDay = Date.UTC(nowBr.getUTCFullYear(), nowBr.getUTCMonth(), nowBr.getUTCDate());
    const startDay = Date.UTC(startBr.getUTCFullYear(), startBr.getUTCMonth(), startBr.getUTCDate());
    return Math.round((nowDay - startDay) / (1000 * 60 * 60 * 24));
}

// Verifica se o horário atual (Brasília) já passou do horário configurado
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

function formatMessageWithClient(template: string, client: Client, renewalLink = ''): string {
    if (!template) return '';
    return template
        .replace(/{cliente}/g, client.name || '')
        .replace(/{telefone}/g, client.phone || '')
        .replace(/{email}/g, Array.isArray(client.email) ? client.email.join(', ') : (client.email || ''))
        .replace(/{senha}/g, client.password || 'N/A')
        .replace(/{tela}/g, client.screen || 'N/A')
        .replace(/{pin_tela}/g, client.pinScreen || 'N/A')
        .replace(/{link_renovacao}/g, renewalLink)
        .replace(/{link}/g, renewalLink || client.accessLink || 'N/A')
        .replace(/{assinatura}/g, client.subscription || 'N/A')
        .replace(/{assinaturas}/g, client.subscription || 'N/A')
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

            /* --- 0. VERIFICAR AUTOMATICAMENTE SESSÕES PIX DE RENOVAÇÃO PENDENTES --- */
            try {
                const { verifyPendingRenewalSessions } = await import('@/lib/renewal-service');
                await verifyPendingRenewalSessions(userId, settings);
            } catch (verifyErr) {
                console.warn('[cron:verify-renewals] Erro ao verificar sessões PIX:', verifyErr);
            }

            const hubToken = settings.webhookToken || '';
            const bToken = settings.billingWebhookToken || '';
            const choice = settings.renewalZapInstance || (settings.useSeparateBillingZap ? 'billing' : 'main');
            const primaryToken = choice === 'billing' ? (bToken || hubToken) : (choice === 'main' ? (hubToken || bToken) : ((settings.useSeparateBillingZap && bToken) ? bToken : (hubToken || bToken)));
            const fallbackToken = primaryToken === bToken ? hubToken : bToken;
            const billingToken = primaryToken || fallbackToken;
            if (!billingToken) continue;

            const clientsSnapshot = await getDocs(collection(db, 'users', userId, 'clients'));
            const clients = clientsSnapshot.docs.map(d => ({ id: d.id, ...d.data() } as Client));
            const activeClients = clients.filter(c => c.status === 'Ativo');
            const overdueStatusClients = clients.filter(c => c.status === 'Vencido');

            /* --- 1. PROCESSAR VENCIMENTOS --- */
            const offset = -3 * 60 * 60 * 1000; // Fuso Brasília (UTC-3)
            const nowBr = new Date(now.getTime() + offset);
            const todayDateBrasilia = format(nowBr, 'yyyy-MM-dd');
            const nowMinutes = nowBr.getUTCHours() * 60 + nowBr.getUTCMinutes();

            const dueNowClients = activeClients.filter(c => {
                if (!c.dueDate) return false;
                const due = (c.dueDate as any).toDate ? (c.dueDate as any).toDate() : new Date(c.dueDate);
                return due <= now && c.lastBilledDate !== todayDateBrasilia;
            });
            if (dueNowClients.length > 0) {
                const isAutoRenewalActive = Boolean(settings.isAutoRenewalActive);

                let shouldRunAutoRenewalToday = false;

                if (isAutoRenewalActive) {
                    const [targetH, targetM] = (settings.renewalSendTime || '14:30').split(':').map(Number);
                    const targetMinutes = (targetH || 0) * 60 + (targetM || 0);

                    if (settings.lastAutoRenewalRunDate === todayDateBrasilia) {
                        shouldRunAutoRenewalToday = false;
                    } else if (nowMinutes < targetMinutes) {
                        shouldRunAutoRenewalToday = false;
                    } else if (nowMinutes > targetMinutes + 2) {
                        shouldRunAutoRenewalToday = false;
                        try {
                            const configDocRef = doc(db, 'users', userId, 'settings', 'config');
                            await runTransaction(db, async (txn) => {
                                txn.update(configDocRef, { lastAutoRenewalRunDate: todayDateBrasilia });
                            });
                        } catch (e) {}
                    } else {
                        shouldRunAutoRenewalToday = true;
                        try {
                            const configDocRef = doc(db, 'users', userId, 'settings', 'config');
                            await runTransaction(db, async (txn) => {
                                txn.update(configDocRef, { lastAutoRenewalRunDate: todayDateBrasilia });
                            });
                        } catch (e) {}
                    }
                }

                const canSendDueDateMsg = isAutoRenewalActive && shouldRunAutoRenewalToday;

                const dueGroupsByPhone = new Map<string, Client[]>();
                for (const client of dueNowClients) {
                    const canon = getCanonicalPhone(client.phone);
                    if (!canon) continue;
                    if (!dueGroupsByPhone.has(canon)) dueGroupsByPhone.set(canon, []);
                    dueGroupsByPhone.get(canon)!.push(client);
                }

                const dueGroupEntries = Array.from(dueGroupsByPhone.entries());

                for (let groupIdx = 0; groupIdx < dueGroupEntries.length; groupIdx++) {
                    const [, clientGroup] = dueGroupEntries[groupIdx];
                    const primaryClient = clientGroup[0];
                    const newlyMarkedClientIds: string[] = [];

                    for (const client of clientGroup) {
                        const ref = doc(db, 'users', userId, 'clients', client.id);
                        try {
                            await runTransaction(db, async (txn) => {
                                const snap = await txn.get(ref);
                                if (snap.exists() && snap.data()?.status === 'Ativo') {
                                    txn.update(ref, { status: 'Vencido' });
                                    newlyMarkedClientIds.push(client.id);
                                }
                            });
                        } catch (e) {}
                    }

                    if (newlyMarkedClientIds.length > 0 && canSendDueDateMsg) {
                        let renewalLink = '';
                        if (isAutoRenewalActive) {
                            try {
                                const { getOrCreateRenewalSession } = await import('@/lib/renewal-service');
                                const { link } = await getOrCreateRenewalSession(userId, clientGroup, originUrl);
                                renewalLink = link;
                            } catch (linkErr) {
                                console.error('[cron:renewal-link] Erro ao gerar link de renovação:', linkErr);
                            }
                        }

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

                        const defaultBillingTemplate =
                            'Olá *{cliente}*! Sua assinatura está próxima do vencimento.\n\n' +
                            '📦 *Assinatura(s):* {assinaturas}\n' +
                            '📅 *Vencimento:* {vencimento}\n\n' +
                            '👉 Para renovar com segurança via PIX e manter seu acesso ativo sem interrupções, clique no botão oficial abaixo:';

                        let template = settings.renewalBillingMessage?.trim() || defaultBillingTemplate;

                        if (isAutoRenewalActive && renewalLink) {
                            template = template
                                .replace(/🔗?\s*{link_renovacao}/gi, '')
                                .replace(/🔗?\s*{link}/gi, '')
                                .trim();
                        }

                        const clientDueDateMs = primaryClient.dueDate ? getTimestampMs(primaryClient.dueDate) : null;
                        const clientDueDate = clientDueDateMs ? new Date(clientDueDateMs) : new Date();
                        const dueFormatted = `${format(clientDueDate, 'dd/MM')} *Hoje*`;

                        const formattedMessage = template
                            .replace(/{cliente}/g, primaryClient.name || 'Cliente')
                            .replace(/{telefone}/g, primaryClient.phone || '')
                            .replace(/{email}/g, Array.isArray(primaryClient.email) ? primaryClient.email.join(', ') : (primaryClient.email || ''))
                            .replace(/{assinatura}/g, subNamesComma)
                            .replace(/{assinaturas}/g, subNamesComma)
                            .replace(/{vencimento}\s*\*?Hoje\*?/gi, dueFormatted)
                            .replace(/{vencimento}/g, dueFormatted)
                            .replace(/{valor}/g, formattedValor)
                            .replace(/{link_renovacao}/g, renewalLink)
                            .replace(/{link}/g, renewalLink)
                            .replace(/{senha}/g, primaryClient.password || 'N/A')
                            .replace(/{tela}/g, primaryClient.screen || 'N/A')
                            .replace(/{pin_tela}/g, primaryClient.pinScreen || 'N/A')
                            .replace(/{status}/g, 'Vencido');

                        try {
                            if (isAutoRenewalActive && renewalLink) {
                                const { sendWhatsAppButtonWithFallback } = await import('@/lib/renewal-service');
                                await sendWhatsAppButtonWithFallback({
                                    number: primaryClient.phone,
                                    text: formattedMessage,
                                    footerText: settings.renewalFooterText || 'Entrega Automática • ⬇️Clique No Botão⬇️',
                                    buttonLabel: settings.renewalButtonText || 'SIM, RENOVAR AGORA',
                                    buttonUrl: renewalLink,
                                    primaryToken: primaryToken,
                                    fallbackToken: fallbackToken,
                                });
                            } else {
                                await fetch(`${originUrl}/api/send-message`, {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({
                                        message: formattedMessage,
                                        phoneNumber: primaryClient.phone,
                                        token: primaryToken,
                                        fallbackToken: fallbackToken,
                                    }),
                                });
                            }

                            for (const client of clientGroup) {
                                try {
                                    const ref = doc(db, 'users', userId, 'clients', client.id);
                                    await runTransaction(db, async (txn) => {
                                        txn.update(ref, {
                                            lastBilledDate: todayDateBrasilia,
                                            lastBilledAt: Timestamp.now(),
                                            sentRenewalFollowUpIds: [],
                                            status: 'Vencido',
                                        });
                                    });
                                } catch (e) {}
                            }
                        } catch (sendErr) {
                            console.error('[cron:vencimento] Falha ao enviar mensagem de vencimento:', sendErr);
                        }

                        if (groupIdx < dueGroupEntries.length - 1) {
                            const delayMs = (settings.renewalDelaySeconds || 15) * 1000;
                            await new Promise((r) => setTimeout(r, delayMs));
                        }
                    }
                }
            }

            /* --- 2. PROCESSAR UPSELL --- */
            const activeUpsells: UpsellConfig[] = (settings?.upsells || []).filter(
                (u) => Boolean(u.isActive) && Boolean(u.upsellMessage?.trim())
            );
            const upsellToken = settings.webhookToken || settings.billingWebhookToken;

            if (activeUpsells.length > 0 && upsellToken) {
                let upsellsDone = 0;
                const sentInThisBatch = new Map<string, Set<string>>();

                for (const client of activeClients) {
                    if (upsellsDone >= QUEUE_LIMIT) break;

                    const clientCreatedMs = getTimestampMs(client.createdAt) || 0;
                    if (!clientCreatedMs) continue;

                    const cleanPhone = getCanonicalPhone(client.phone);
                    if (!cleanPhone) continue;

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

                        const ruleCreatedMs = Number(upsell.createdAt) || 0;
                        if (ruleCreatedMs > 0 && clientCreatedMs < ruleCreatedMs) continue;

                        const delayMs = (Number(upsell.upsellDelayMinutes) || 0) * 60 * 1000;
                        if ((now.getTime() - clientCreatedMs) < delayMs) continue;

                        if (docSentIds.has(ruleId)) continue;

                        const alreadySentInBatch = sentInThisBatch.get(cleanPhone)?.has(ruleId) ?? false;

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
                                if (!sentInThisBatch.has(cleanPhone)) sentInThisBatch.set(cleanPhone, new Set());
                                sentInThisBatch.get(cleanPhone)!.add(ruleId);
                                upsellsDone++;

                                const msg = formatMessageWithClient(upsell.upsellMessage, client);
                                console.log(`[upsell] ENVIANDO ruleId=${ruleId} -> ${cleanPhone}: "${msg.slice(0, 50)}"`);
                                try {
                                    const res = await fetch('https://travelflow.uazapi.com/send/text', {
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

            /* --- 2b. PROCESSAR UPSELL COM MENU --- */
            const activeUpsellMenus: UpsellMenuConfig[] = (settings?.upsellMenus || []).filter(
                (u) => Boolean(u.isActive) && Boolean(u.text?.trim()) && Array.isArray(u.buttons) && u.buttons.length > 0
            );

            if (activeUpsellMenus.length > 0 && upsellToken) {
                let menuDone = 0;
                const sentMenuInThisBatch = new Map<string, Set<string>>();

                for (const client of activeClients) {
                    if (menuDone >= QUEUE_LIMIT) break;

                    const clientCreatedMs = getTimestampMs(client.createdAt) || 0;
                    if (!clientCreatedMs) continue;

                    const cleanPhone = getCanonicalPhone(client.phone);
                    if (!cleanPhone) continue;

                    const docMenuSentIds = new Set<string>(
                        Array.isArray(client.sentUpsellMenuIds) ? client.sentUpsellMenuIds as string[] : []
                    );

                    const clientDocRef = doc(db, 'users', userId, 'clients', client.id);

                    for (const upsellMenu of activeUpsellMenus) {
                        if (menuDone >= QUEUE_LIMIT) break;

                        const ruleId: string = (upsellMenu.id && typeof upsellMenu.id === 'string' && upsellMenu.id.trim())
                            ? upsellMenu.id.trim()
                            : `menu_${(upsellMenu.text || '').slice(0, 20).replace(/\s+/g, '_')}`;

                        const ruleCreatedMs = Number(upsellMenu.createdAt) || 0;
                        if (ruleCreatedMs > 0 && clientCreatedMs < ruleCreatedMs) continue;

                        const delayMs = (Number(upsellMenu.upsellDelayMinutes) || 0) * 60 * 1000;
                        if ((now.getTime() - clientCreatedMs) < delayMs) continue;

                        if (docMenuSentIds.has(ruleId)) continue;

                        const alreadySentMenuInBatch = sentMenuInThisBatch.get(cleanPhone)?.has(ruleId) ?? false;

                        let markedMenu = false;
                        try {
                            await runTransaction(db, async (txn) => {
                                const snap = await txn.get(clientDocRef);
                                if (!snap.exists()) throw new Error('DocNotFound');
                                const d = snap.data();
                                const existing = Array.isArray(d?.sentUpsellMenuIds) ? d.sentUpsellMenuIds as string[] : [];
                                if (existing.includes(ruleId)) throw new Error('AlreadySent');
                                txn.update(clientDocRef, { sentUpsellMenuIds: Array.from(new Set([...existing, ruleId])) });
                                markedMenu = true;
                            });
                        } catch (e: any) {
                            if (e?.message !== 'AlreadySent' && e?.message !== 'DocNotFound') {
                                console.error(`[upsell-menu] Transacao falhou: clientId=${client.id} ruleId=${ruleId}:`, e?.message);
                            }
                        }

                        if (markedMenu) {
                            docMenuSentIds.add(ruleId);

                            if (!alreadySentMenuInBatch) {
                                if (!sentMenuInThisBatch.has(cleanPhone)) sentMenuInThisBatch.set(cleanPhone, new Set());
                                sentMenuInThisBatch.get(cleanPhone)!.add(ruleId);
                                menuDone++;

                                const choices = upsellMenu.buttons.map((btn) => {
                                    const action = (btn.action || '').trim();
                                    const label = (btn.label || '').trim();
                                    if (!action) return label;
                                    return `${label}|${action}`;
                                });

                                const menuText = formatMessageWithClient(upsellMenu.text, client);
                                const menuFooter = upsellMenu.footerText ? formatMessageWithClient(upsellMenu.footerText, client) : undefined;

                                const menuPayload: any = {
                                    number: cleanPhone,
                                    type: 'button',
                                    text: menuText,
                                    choices,
                                };
                                if (menuFooter) menuPayload.footerText = menuFooter;
                                if (upsellMenu.imageUrl?.trim()) menuPayload.imageButton = upsellMenu.imageUrl.trim();

                                console.log(`[upsell-menu] ENVIANDO ruleId=${ruleId} -> ${cleanPhone}`);
                                try {
                                    const res = await fetch('https://travelflow.uazapi.com/send/menu', {
                                        method: 'POST',
                                        headers: { 'Content-Type': 'application/json', 'token': upsellToken, 'apikey': upsellToken },
                                        body: JSON.stringify(menuPayload),
                                    });
                                    console.log(`[upsell-menu] UAZAPI status: ${res.status}`);
                                } catch (fetchErr: any) {
                                    console.error(`[upsell-menu] Erro ao enviar:`, fetchErr?.message);
                                }
                            } else {
                                console.log(`[upsell-menu] Batch dedup: clientId=${client.id} phone=${cleanPhone} ruleId=${ruleId}`);
                            }
                        }
                    }
                }
            }

            /* --- 3. PROCESSAR REMARKETING --- */
            const isOverallRemarketingActive = (settings as any).isRemarketingActive ?? true;
            const isSignupGlobalActive = settings.isPostSignupRemarketingActive ?? true;
            const isDueDateGlobalActive = settings.isPostDueDateRemarketingActive ?? true;

            const activeSignupRemarketings = (isOverallRemarketingActive && isSignupGlobalActive)
                ? (settings.postSignupRemarketings?.filter(r => r.isActive && r.message) || []) : [];
            const activeDueDateRemarketings = (isOverallRemarketingActive && isDueDateGlobalActive)
                ? (settings.postDueDateRemarketings?.filter(r => r.isActive && r.message) || []) : [];
            let rmkDone = 0;

            const signupSendTime = settings.postSignupSendTime;
            const dueDateSendTimeStr = settings.postDueDateSendTime;

            for (const client of clients) {
                if (rmkDone >= QUEUE_LIMIT) break;
                if (!client.createdAt) continue;
                for (const config of activeSignupRemarketings) {
                    if (rmkDone >= QUEUE_LIMIT) break;
                    const startDate = client.createdAt?.toDate();
                    if (startDate && (!config.createdAt || client.createdAt!.toMillis() >= config.createdAt)) {
                        const daysDiff = calendarDaysBrasilia(now, startDate);
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

            /* --- 3b. PROCESSAR REMARKETING PÓS-COBRANÇA DE RENOVAÇÃO (NÃO RENOVARAM APÓS X TEMPO) --- */
            const isFollowUpGlobalActive = Boolean(settings.isRenewalFollowUpActive);
            const activeFollowUpSteps = isFollowUpGlobalActive
                ? (settings.renewalFollowUpSteps || []).filter((s) => s.isActive && s.message?.trim())
                : [];

            const RENEWAL_FEATURES_START_MS = 1792137294000;
            const minBilledCutoffMs = Math.max(
                RENEWAL_FEATURES_START_MS,
                Number(settings.renewalFollowUpActivatedAt) || 0
            );

            if (activeFollowUpSteps.length > 0 && billingToken) {
                const billedUnpaidClients = overdueStatusClients.filter((c) => {
                    const billedMs = getTimestampMs(c.lastBilledAt);
                    if (!billedMs || billedMs < minBilledCutoffMs) return false;
                    const renewedMs = getTimestampMs((c as any).lastRenewedAt);
                    if (renewedMs && renewedMs > billedMs) return false;
                    return true;
                });

                if (billedUnpaidClients.length > 0) {
                    const unpaidByPhone = new Map<string, Client[]>();
                    for (const c of billedUnpaidClients) {
                        const canon = getCanonicalPhone(c.phone);
                        if (!canon) continue;
                        if (!unpaidByPhone.has(canon)) unpaidByPhone.set(canon, []);
                        unpaidByPhone.get(canon)!.push(c);
                    }

                    const getStepDelayMs = (step: { delayValue: number; delayUnit: 'minutes' | 'hours' | 'days' }) => {
                        const val = Math.max(1, Number(step.delayValue) || 1);
                        if (step.delayUnit === 'days') return val * 24 * 60 * 60 * 1000;
                        if (step.delayUnit === 'hours') return val * 60 * 60 * 1000;
                        return val * 60 * 1000;
                    };

                    const sortedSteps = [...activeFollowUpSteps].sort((a, b) => getStepDelayMs(a) - getStepDelayMs(b));
                    let followUpDone = 0;

                    for (const [, clientGroup] of unpaidByPhone.entries()) {
                        if (followUpDone >= QUEUE_LIMIT) break;

                        const billedAtMs = Math.max(...clientGroup.map((c) => getTimestampMs(c.lastBilledAt) || 0));
                        if (!billedAtMs || billedAtMs < minBilledCutoffMs) continue;

                        const elapsedMs = now.getTime() - billedAtMs;

                        for (const step of sortedSteps) {
                            if (followUpDone >= QUEUE_LIMIT) break;

                            const stepCreatedMs = Number(step.createdAt) || 0;
                            if (stepCreatedMs > 0 && billedAtMs < stepCreatedMs) continue;

                            const requiredDelayMs = getStepDelayMs(step);
                            if (elapsedMs < requiredDelayMs) continue;

                            const alreadyReceivedStep = clientGroup.some(
                                (c) => Array.isArray(c.sentRenewalFollowUpIds) && c.sentRenewalFollowUpIds.includes(step.id)
                            );
                            if (alreadyReceivedStep) continue;

                            const primaryClient = clientGroup[0];
                            const primaryRef = doc(db, 'users', userId, 'clients', primaryClient.id);
                            let claimedStep = false;

                            try {
                                await runTransaction(db, async (txn) => {
                                    const snap = await txn.get(primaryRef);
                                    if (!snap.exists()) throw new Error('NotFound');
                                    const data = snap.data() as Client;
                                    if (data.status !== 'Vencido') throw new Error('AlreadyRenewed');
                                    const sentIds = Array.isArray(data.sentRenewalFollowUpIds) ? data.sentRenewalFollowUpIds : [];
                                    if (sentIds.includes(step.id)) throw new Error('AlreadySent');
                                    txn.update(primaryRef, {
                                        sentRenewalFollowUpIds: Array.from(new Set([...sentIds, step.id])),
                                    });
                                    claimedStep = true;
                                });
                            } catch {}

                            if (claimedStep) {
                                for (let i = 1; i < clientGroup.length; i++) {
                                    const otherRef = doc(db, 'users', userId, 'clients', clientGroup[i].id);
                                    await runTransaction(db, async (txn) => {
                                        const snap = await txn.get(otherRef);
                                        if (!snap.exists()) return;
                                        const data = snap.data() as Client;
                                        const sentIds = Array.isArray(data.sentRenewalFollowUpIds) ? data.sentRenewalFollowUpIds : [];
                                        txn.update(otherRef, {
                                            sentRenewalFollowUpIds: Array.from(new Set([...sentIds, step.id])),
                                        });
                                    }).catch(() => {});
                                }

                                followUpDone++;

                                try {
                                    await fetch(`${originUrl}/api/renewal/dispatch-single`, {
                                        method: 'POST',
                                        headers: { 'Content-Type': 'application/json' },
                                        body: JSON.stringify({
                                            userId,
                                            clientIds: clientGroup.map((c) => c.id),
                                            originUrl,
                                            force: true,
                                            followUpStepId: step.id,
                                        }),
                                    });
                                } catch (followUpErr) {
                                    console.error(`[cron:renewal-followup] Erro ao disparar etapa ${step.name}:`, followUpErr);
                                }

                                break;
                            }
                        }
                    }
                }
            }

            /* --- 4. PROCESSAR GRUPOS AGENDADOS --- */
            const scheduledSnap = await getDocs(collection(db, 'users', userId, 'scheduled_messages'));
            const scheduled = scheduledSnap.docs.map(d => ({ id: d.id, ...d.data() } as ScheduledMessage));
            const STALE_SENDING_MS = 10 * 60 * 1000; // 10 minutos

            const getNextFutureDailyDate = (baseDate: Date, refNow: Date): Date => {
                let next = addDays(baseDate, 1);
                while (next.getTime() <= refNow.getTime()) {
                    next = addDays(next, 1);
                }
                return next;
            };

            const getGroupSig = (jid: string, message: string): string =>
                `${(jid || '').trim().toLowerCase()}::${(message || '').trim().toLowerCase().replace(/\s+/g, ' ').slice(0, 300)}`;

            // Auto-recuperar agendamentos que ficaram travados em 'Sending' por mais de 10 minutos desde o claimedAt
            for (const msg of scheduled) {
                if (msg.status === 'Sending') {
                    const claimedMs = msg.claimedAt ? getTimestampMs(msg.claimedAt) || 0 : 0;
                    const sendAtMs = msg.sendAt ? getTimestampMs(msg.sendAt) || 0 : 0;
                    const refMs = claimedMs || sendAtMs;
                    if (refMs > 0 && (now.getTime() - refMs > STALE_SENDING_MS)) {
                        const messageDocRef = doc(db, 'users', userId, 'scheduled_messages', msg.id);
                        await runTransaction(db, async (txn) => {
                            txn.update(messageDocRef, {
                                status: 'Scheduled',
                                claimedAt: null,
                                errorReason: 'Destravado automaticamente por tempo excedido em envio.'
                            });
                        }).catch(console.error);
                        msg.status = 'Scheduled';
                    }
                }
            }

            // Assinaturas (JID + mensagem) que já foram enviadas recentemente (nos últimos 90s)
            const recentlySentGroupSigs = new Set<string>();
            for (const msg of scheduled) {
                const lastSentMs = msg.lastSentAt ? getTimestampMs(msg.lastSentAt) || 0 : 0;
                if (lastSentMs > 0 && (now.getTime() - lastSentMs) < 90000) {
                    recentlySentGroupSigs.add(getGroupSig(msg.jid, msg.message));
                }
            }

            const dueMessages = scheduled.filter(msg => {
                if (msg.status !== 'Scheduled') return false;
                const sendAtMs = msg.sendAt ? getTimestampMs(msg.sendAt) || 0 : 0;
                return sendAtMs > 0 && sendAtMs <= now.getTime();
            }).slice(0, QUEUE_LIMIT);

            const sentGroupSigsInThisRun = new Set<string>();

            for (const msg of dueMessages) {
                const messageDocRef = doc(db, 'users', userId, 'scheduled_messages', msg.id);
                const sig = getGroupSig(msg.jid, msg.message);

                // Trava anti-duplicidade por grupo: se este mesmo grupo já recebeu a mesma mensagem neste lote ou nos últimos 90s,
                // marca o documento duplicado como concluído sem enviar novamente no grupo!
                if (sentGroupSigsInThisRun.has(sig) || recentlySentGroupSigs.has(sig)) {
                    try {
                        await runTransaction(db, async (txn) => {
                            const mSnap = await txn.get(messageDocRef);
                            if (!mSnap.exists()) return;
                            const mData = mSnap.data() as ScheduledMessage;
                            if (mData.status !== 'Scheduled') return;
                            if (mData.repeatDaily) {
                                const baseDate = mData.sendAt?.toDate ? mData.sendAt.toDate() : now;
                                txn.update(messageDocRef, {
                                    sendAt: Timestamp.fromDate(getNextFutureDailyDate(baseDate, now)),
                                    status: 'Scheduled',
                                    claimedAt: null,
                                    lastSentAt: Timestamp.now(),
                                    lastSentDateKey: todayDateBrasilia,
                                    retryCount: 0,
                                    errorReason: null,
                                });
                            } else {
                                txn.update(messageDocRef, {
                                    status: 'Sent',
                                    claimedAt: null,
                                    lastSentAt: Timestamp.now(),
                                    lastSentDateKey: todayDateBrasilia,
                                    errorReason: null,
                                });
                            }
                        });
                    } catch {}
                    continue;
                }

                let processed = false;
                try {
                    await runTransaction(db, async (txn) => {
                        const mSnap = await txn.get(messageDocRef);
                        if (!mSnap.exists()) throw new Error('NotFound');
                        const mData = mSnap.data() as ScheduledMessage;
                        if (mData.status !== 'Scheduled') throw new Error('AlreadyClaimed');

                        // Se for repetição diária e já enviou hoje, apenas avança para o próximo dia sem reenviar
                        if (mData.repeatDaily && mData.lastSentDateKey === todayDateBrasilia) {
                            const baseDate = mData.sendAt?.toDate ? mData.sendAt.toDate() : now;
                            txn.update(messageDocRef, {
                                sendAt: Timestamp.fromDate(getNextFutureDailyDate(baseDate, now)),
                                status: 'Scheduled',
                                claimedAt: null,
                            });
                            throw new Error('AlreadySentToday');
                        }

                        const lastSentMs = mData.lastSentAt ? getTimestampMs(mData.lastSentAt) || 0 : 0;
                        if (lastSentMs > 0 && (now.getTime() - lastSentMs) < 90000) {
                            throw new Error('RecentlySent');
                        }

                        txn.update(messageDocRef, {
                            status: 'Sending',
                            claimedAt: Timestamp.now(),
                        });
                        processed = true;
                    });
                } catch (e) {}

                if (processed) {
                    sentGroupSigsInThisRun.add(sig);
                    try {
                        const msgToken = msg.useBillingZap && settings.useSeparateBillingZap && settings.billingWebhookToken
                            ? settings.billingWebhookToken : settings.webhookToken;
                        const response = await fetch(`${originUrl}/api/send-group-message`, {
                            method: 'POST', headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ jid: msg.jid, message: msg.message, imageUrl: msg.imageUrl, token: msgToken, buttons: msg.buttons, supportNumber: msg.supportNumber, siteLink: msg.siteLink }),
                        });
                        if (response.ok) {
                            const baseDate = msg.sendAt?.toDate ? msg.sendAt.toDate() : now;
                            if (msg.repeatDaily) {
                                await runTransaction(db, async (txn) => txn.update(messageDocRef, {
                                    sendAt: Timestamp.fromDate(getNextFutureDailyDate(baseDate, now)),
                                    status: 'Scheduled',
                                    claimedAt: null,
                                    lastSentAt: Timestamp.now(),
                                    lastSentDateKey: todayDateBrasilia,
                                    retryCount: 0,
                                    errorReason: null,
                                }));
                            } else {
                                await runTransaction(db, async (txn) => txn.update(messageDocRef, {
                                    status: 'Sent',
                                    claimedAt: null,
                                    lastSentAt: Timestamp.now(),
                                    lastSentDateKey: todayDateBrasilia,
                                    errorReason: null,
                                }));
                            }
                        } else {
                            sentGroupSigsInThisRun.delete(sig);
                            let errorMsg = 'Erro desconhecido';
                            try { const e = await response.json(); errorMsg = e.error || e.details || response.statusText || `Status ${response.status}`; } catch { try { errorMsg = await response.text() || `Status ${response.status}`; } catch {} }
                            const retries = msg.retryCount || 0;
                            const baseDate = msg.sendAt?.toDate ? msg.sendAt.toDate() : now;
                            if (retries < 1) {
                                await runTransaction(db, async (txn) => txn.update(messageDocRef, { status: 'Scheduled', claimedAt: null, sendAt: Timestamp.fromDate(getNextFutureDailyDate(baseDate, now)), retryCount: retries + 1, errorReason: errorMsg }));
                            } else {
                                await runTransaction(db, async (txn) => txn.update(messageDocRef, { status: 'Error', claimedAt: null, errorReason: errorMsg }));
                            }
                        }
                    } catch (fetchErr: any) {
                        sentGroupSigsInThisRun.delete(sig);
                        console.error('Scheduled message dispatch failed:', fetchErr);
                        const retries = msg.retryCount || 0;
                        const baseDate = msg.sendAt?.toDate ? msg.sendAt.toDate() : now;
                        if (retries < 1) {
                            await runTransaction(db, async (txn) => txn.update(messageDocRef, { status: 'Scheduled', claimedAt: null, sendAt: Timestamp.fromDate(getNextFutureDailyDate(baseDate, now)), retryCount: retries + 1, errorReason: fetchErr.message }));
                        } else {
                            await runTransaction(db, async (txn) => txn.update(messageDocRef, { status: 'Error', claimedAt: null, errorReason: fetchErr.message }));
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
