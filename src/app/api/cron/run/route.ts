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

        // Limite por execucao para nao dar timeout em servidor basico (Hobby)
        const QUEUE_LIMIT = 20;

        for (const userDoc of usersSnapshot.docs) {
            const userId = userDoc.id;

            // TRAVA ANTI-DUPLICACAO ENTRE PCS/ABAS: Evita execucoes simultaneas em milissegundos (2 segundos)
            const nowMs = Date.now();
            const lastUserRun = userLocks.get(userId) || 0;
            if (nowMs - lastUserRun < 2000) {
                continue;
            }
            userLocks.set(userId, nowMs);

            // TRAVA GLOBAL DISTRIBUIDA VIA FIRESTORE: Bloqueia chamadas concorrentes entre todos os servidores/navegadores
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

            // Se expirou assinatura do admin, pula
            if (userProfile.role !== 'Admin' && userProfile.subscriptionEndDate && userProfile.subscriptionEndDate.toDate() < now) {
                continue;
            }

            // Puxar Settings do Usuario
            const configSnap = await getDocs(collection(db, 'users', userId, 'settings'));
            const specificConfig = configSnap.docs.find(d => d.id === 'config');
            
            if (!specificConfig || !specificConfig.exists()) continue;
            const settings = specificConfig.data() as Settings;

            // Determine which token to use for billing (collection) messages
            const billingToken = settings.useSeparateBillingZap && settings.billingWebhookToken 
                ? settings.billingWebhookToken 
                : settings.webhookToken;

            if (!billingToken) continue; // Sem token algum nao da pra enviar cobranca

            // Puxar todos os clientes
            const clientsSnapshot = await getDocs(collection(db, 'users', userId, 'clients'));
            const clients = clientsSnapshot.docs.map(d => ({ id: d.id, ...d.data() } as Client));

            const activeClients = clients.filter(c => c.status === 'Ativo');
            const overdueStatusClients = clients.filter(c => c.status === 'Vencido');

            /* --- 1. PROCESSAR VENCIMENTOS --- */
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

            /* --- 2. PROCESSAR UPSELL ---
             * Regras:
             * 1. Cada upsell e enviado NO MAXIMO 1x por numero de telefone (canonico)
             * 2. Se o mesmo telefone ja existe no CRM e ja recebeu o upsell, NAO reenviar
             * 3. O tempo de espera e calculado a partir do createdAt do documento cliente
             * 4. Clientes cadastrados ANTES da criacao da regra nao sao elegíveis
             */
            const activeUpsells: UpsellConfig[] = (settings?.upsells || []).filter(
                (u) => Boolean(u.isActive) && Boolean(u.upsellMessage?.trim())
            );

            const upsellToken = settings.webhookToken || settings.billingWebhookToken;

            if (activeUpsells.length > 0 && upsellToken) {
                let upsellsDone = 0;

                // PASSO 1: Construir mapa de ruleIds ja enviados POR TELEFONE (lendo todos os docs)
                const phoneSentMap = new Map<string, Set<string>>();
                for (const c of clients) {
                    const cp = getCanonicalPhone(c.phone);
                    if (!cp) continue;
                    if (!phoneSentMap.has(cp)) phoneSentMap.set(cp, new Set());
                    const s = phoneSentMap.get(cp)!;
                    const ids1 = Array.isArray(c.sentUpsellIds) ? c.sentUpsellIds as string[] : [];
                    const ids2 = Array.isArray(c.sentUpsell2Ids) ? c.sentUpsell2Ids as string[] : [];
                    [...ids1, ...ids2].forEach((id) => { if (id) s.add(id); });
                }

                // PASSO 2: Evita reprocessar o mesmo telefone+regra dentro do mesmo cron run
                const processedInBatch = new Set<string>(); // `${phone}_${ruleId}`

                // PASSO 3: Para cada cliente ativo, verificar cada regra de upsell
                for (const client of activeClients) {
                    if (upsellsDone >= QUEUE_LIMIT) break;

                    const clientCreatedMs = getTimestampMs(client.createdAt) || 0;
                    if (!clientCreatedMs) continue;

                    const cleanPhone = getCanonicalPhone(client.phone);
                    if (!cleanPhone) continue;

                    for (const upsell of activeUpsells) {
                        if (upsellsDone >= QUEUE_LIMIT) break;

                        const ruleId: string = (upsell.id && typeof upsell.id === 'string' && upsell.id.trim())
                            ? upsell.id.trim()
                            : `rule_${(upsell.upsellMessage || '').slice(0, 20).replace(/\s+/g, '_')}`;

                        const batchKey = `${cleanPhone}_${ruleId}`;

                        // Ja processou este telefone+regra neste cron run? Pula
                        if (processedInBatch.has(batchKey)) continue;

                        // Este cliente foi cadastrado ANTES da regra ser criada? Nao elegivel
                        const ruleCreatedMs = Number(upsell.createdAt) || 0;
                        if (ruleCreatedMs > 0 && clientCreatedMs < ruleCreatedMs) continue;

                        // Tempo de espera ainda nao passou? Pula
                        const delayMs = (Number(upsell.upsellDelayMinutes) || 0) * 60 * 1000;
                        if ((now.getTime() - clientCreatedMs) < delayMs) continue;

                        // VERIFICACAO DE TELEFONE: Algum documento deste numero ja recebeu esta regra?
                        const phoneSent = phoneSentMap.get(cleanPhone) || new Set<string>();
                        if (phoneSent.has(ruleId)) {
                            processedInBatch.add(batchKey); // Marca para nao checar de novo
                            continue;
                        }

                        // Marca ja neste batch para nao duplicar com outros docs do mesmo telefone
                        processedInBatch.add(batchKey);

                        // Todos os documentos com este telefone (para marcar todos no banco)
                        const samePhoneDocs = clients.filter((c) => getCanonicalPhone(c.phone) === cleanPhone);

                        // TRANSACAO ATOMICA: leitura de todos os docs -> verificacao -> escrita em todos
                        let sent = false;
                        try {
                            await runTransaction(db, async (txn) => {
                                const snapshots: Array<{ ref: any; existingIds: string[] }> = [];

                                // FASE 1 - apenas leituras
                                for (const pd of samePhoneDocs) {
                                    const ref = doc(db, 'users', userId, 'clients', pd.id);
                                    const snap = await txn.get(ref);
                                    if (!snap.exists()) continue;
                                    const d = snap.data();
                                    const e1 = Array.isArray(d?.sentUpsellIds) ? d.sentUpsellIds as string[] : [];
                                    const e2 = Array.isArray(d?.sentUpsell2Ids) ? d.sentUpsell2Ids as string[] : [];
                                    // Se qualquer doc ja tem o ruleId, aborta (concorrencia)
                                    if ([...e1, ...e2].includes(ruleId)) throw new Error('AlreadySent');
                                    snapshots.push({ ref, existingIds: e1 });
                                }

                                // FASE 2 - apenas escritas (marca TODOS os docs do telefone)
                                for (const item of snapshots) {
                                    const updated = Array.from(new Set([...item.existingIds, ruleId]));
                                    txn.update(item.ref, { sentUpsellIds: updated });
                                }

                                sent = true;
                            });
                        } catch (e: any) {
                            if (e?.message !== 'AlreadySent') {
                                console.error(`[cron/upsell] Transacao falhou: phone=${cleanPhone} ruleId=${ruleId}:`, e?.message);
                            }
                        }

                        if (sent) {
                            // Atualiza mapa em memoria para proximas iteracoes neste run
                            phoneSent.add(ruleId);
                            phoneSentMap.set(cleanPhone, phoneSent);
                            upsellsDone++;

                            const msg = formatMessageWithClient(upsell.upsellMessage, client);
                            console.log(`[cron/upsell] ENVIANDO ruleId=${ruleId} -> ${cleanPhone}: "${msg.slice(0, 50)}"`);

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
                                console.error(`[cron/upsell] Erro ao enviar:`, fetchErr?.message);
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
                        const errorMsg = fetchErr.message || 'Erro de conexao/servidor';
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
