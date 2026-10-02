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

            // Bloqueio anti-duplicidade: filtra apenas clientes com vencimento até agora e que NÃO foram cobrados hoje (nem manual nem automático)
            const dueNowClients = activeClients.filter(c => {
                if (!c.dueDate) return false;
                const due = (c.dueDate as any).toDate ? (c.dueDate as any).toDate() : new Date(c.dueDate);
                return due <= now && c.lastBilledDate !== todayDateBrasilia;
            });
            if (dueNowClients.length > 0) {
                // 1.1 Configuração de Renovação Automática e Verificação de Horário
                const isAutoRenewalActive = Boolean(settings.isAutoRenewalActive);

                let shouldRunAutoRenewalToday = false;

                if (isAutoRenewalActive) {
                    const [targetH, targetM] = (settings.renewalSendTime || '14:30').split(':').map(Number);
                    const targetMinutes = (targetH || 0) * 60 + (targetM || 0);

                    if (settings.lastAutoRenewalRunDate === todayDateBrasilia) {
                        // Já disparou hoje ou foi configurado após o horário hoje -> aguarda amanhã
                        shouldRunAutoRenewalToday = false;
                    } else if (nowMinutes < targetMinutes) {
                        // Ainda não chegou o horário configurado de hoje
                        shouldRunAutoRenewalToday = false;
                    } else if (nowMinutes > targetMinutes + 2) {
                        // O horário agendado já passou hoje (ex: configurou 14:00 e já são 14:01+)
                        // Conforme exigência estrita: NÃO dispara hoje para clientes de hoje, só amanhã pontualmente!
                        shouldRunAutoRenewalToday = false;
                        try {
                            const configDocRef = doc(db, 'users', userId, 'settings', 'config');
                            await runTransaction(db, async (txn) => {
                                txn.update(configDocRef, { lastAutoRenewalRunDate: todayDateBrasilia });
                            });
                        } catch (e) {}
                    } else {
                        // Janela exata do horário de disparo! (targetMinutes a targetMinutes + 2)
                        shouldRunAutoRenewalToday = true;
                        try {
                            const configDocRef = doc(db, 'users', userId, 'settings', 'config');
                            await runTransaction(db, async (txn) => {
                                txn.update(configDocRef, { lastAutoRenewalRunDate: todayDateBrasilia });
                            });
                        } catch (e) {}
                    }
                }

                const canSendDueDateMsg = isAutoRenewalActive
                    ? shouldRunAutoRenewalToday
                    : Boolean(settings.isDueDateMessageActive && settings.dueDateMessage && billingToken);

                // Agrupa clientes com vencimento pelo telefone canônico (para enviar apenas 1 mensagem mesmo com >1 assinaturas)
                const dueGroupsByPhone = new Map<string, Client[]>();
                for (const client of dueNowClients) {
                    const canon = getCanonicalPhone(client.phone);
                    if (!canon) continue;
                    if (!dueGroupsByPhone.has(canon)) dueGroupsByPhone.set(canon, []);
                    dueGroupsByPhone.get(canon)!.push(client);
                }

                const dueGroupEntries = Array.from(dueGroupsByPhone.entries());

                for (let groupIdx = 0; groupIdx < dueGroupEntries.length; groupIdx++) {
                    const [phoneKey, clientGroup] = dueGroupEntries[groupIdx];
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

                    // Se marcou como vencido e tem envio de mensagem configurado para agora
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

                        let template = (isAutoRenewalActive && settings.renewalBillingMessage?.trim())
                            ? settings.renewalBillingMessage.trim()
                            : (settings.dueDateMessage || defaultBillingTemplate);

                        // Se houver renewalLink e a renovação automática estiver ativa, removemos o link do corpo pois irá no botão interativo
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

                            // Grava lastBilledDate para bloqueio anti-duplicidade em todos os clientes do grupo
                            for (const client of clientGroup) {
                                try {
                                    const ref = doc(db, 'users', userId, 'clients', client.id);
                                    await runTransaction(db, async (txn) => {
                                        txn.update(ref, {
                                            lastBilledDate: todayDateBrasilia,
                                            lastBilledAt: Timestamp.now(),
                                            status: 'Vencido',
                                        });
                                    });
                                } catch (e) {}
                            }
                        } catch (sendErr) {
                            console.error('[cron:vencimento] Falha ao enviar mensagem de vencimento:', sendErr);
                        }

                        // Delay de segurança anti-banimento entre disparos
                        if (groupIdx < dueGroupEntries.length - 1) {
                            const delayMs = (settings.renewalDelaySeconds || 15) * 1000;
                            await new Promise((r) => setTimeout(r, delayMs));
                        }
                    }
                }
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

            /* --- 2b. PROCESSAR UPSELL COM MENU ---
             * Mesma logica do upsell normal, mas chama /send/menu com botoes interativos.
             * Dedup via sentUpsellMenuIds por documento.
             */
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

                        // Regra criada depois do cliente -> nao elegivel
                        const ruleCreatedMs = Number(upsellMenu.createdAt) || 0;
                        if (ruleCreatedMs > 0 && clientCreatedMs < ruleCreatedMs) continue;

                        // Tempo de espera nao passou ainda
                        const delayMs = (Number(upsellMenu.upsellDelayMinutes) || 0) * 60 * 1000;
                        if ((now.getTime() - clientCreatedMs) < delayMs) continue;

                        // Este documento ja recebeu este menu?
                        if (docMenuSentIds.has(ruleId)) continue;

                        // Ja enviou para este telefone neste run?
                        const alreadySentMenuInBatch = sentMenuInThisBatch.get(cleanPhone)?.has(ruleId) ?? false;

                        // Transacao atomica: marca apenas este documento
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

                                // Montar choices (botoes) para /send/menu
                                const choices = upsellMenu.buttons.map((btn) => {
                                    // Formato: "label|action" ou so "label" para resposta simples
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
