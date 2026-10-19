'use client';

import { useEffect, useRef } from 'react';
import { collection, query, where, Timestamp, doc, runTransaction, serverTimestamp, updateDoc } from 'firebase/firestore';
import { useFirebase, useCollection, useMemoFirebase, useDoc } from '@/firebase';
import type { ScheduledMessage, Settings, UserProfile } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';
import { addDays, format } from 'date-fns';
import { addDocumentNonBlocking } from '@/firebase/non-blocking-updates';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const MANDATORY_DELAY = 30000; // 30 seconds between different groups
const STALE_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes

function getNextFutureDailyDate(baseDate: Date, now: Date): Date {
    let next = addDays(baseDate, 1);
    while (next.getTime() <= now.getTime()) {
        next = addDays(next, 1);
    }
    return next;
}

function getGroupMessageSignature(jid: string, message: string): string {
    return `${(jid || '').trim().toLowerCase()}::${(message || '').trim().toLowerCase().replace(/\s+/g, ' ').slice(0, 300)}`;
}

export function ScheduledMessageHandler() {
    const { firestore, user, effectiveUserId } = useFirebase();
    const targetUserId = effectiveUserId || user?.uid || '';
    const { toast } = useToast();
    const processingRef = useRef(new Set<string>());
    const isLoopRunningRef = useRef(false);
    const recentGroupSentMapRef = useRef(new Map<string, number>());

    const settingsDocRef = useMemoFirebase(() => {
        if (!targetUserId) return null;
        return doc(firestore, 'users', targetUserId, 'settings', 'config');
    }, [firestore, targetUserId]);
    const { data: settings } = useDoc<Settings>(settingsDocRef);

    const userDocRef = useMemoFirebase(() => {
        if (!targetUserId) return null;
        return doc(firestore, 'users', targetUserId, 'users_profile_unused'); // Mantido leve
    }, [firestore, targetUserId]);

    const actualUserDocRef = useMemoFirebase(() => {
        if (!targetUserId) return null;
        return doc(firestore, 'users', targetUserId);
    }, [firestore, targetUserId]);
    const { data: userProfile } = useDoc<UserProfile>(actualUserDocRef);

    const scheduledMessagesQuery = useMemoFirebase(() => {
        if (!targetUserId) return null;
        const messagesRef = collection(firestore, 'users', targetUserId, 'scheduled_messages');
        return query(messagesRef, where("status", "in", ["Scheduled", "Sending"]));
    }, [targetUserId, firestore]);

    const { data: messagesToCheck } = useCollection<ScheduledMessage>(scheduledMessagesQuery);

    // Mantém referências atualizadas para evitar que o useEffect reinicie o loop paralelo a cada mudança de status
    const messagesRefLatest = useRef<ScheduledMessage[] | null>(null);
    const settingsRefLatest = useRef<Settings | null>(null);
    const profileRefLatest = useRef<UserProfile | null>(null);

    messagesRefLatest.current = messagesToCheck || null;
    settingsRefLatest.current = settings || null;
    profileRefLatest.current = userProfile || null;

    useEffect(() => {
        if (!targetUserId || !firestore) return;

        const checkScheduledMessages = async () => {
            // Trava global: impede que 2 loops rodem ao mesmo tempo quando o Firestore atualiza um documento
            if (isLoopRunningRef.current) return;

            const currentProfile = profileRefLatest.current;
            if (currentProfile && currentProfile.role !== 'Admin' && currentProfile.subscriptionEndDate && currentProfile.subscriptionEndDate.toDate() < new Date()) {
                return;
            }

            const currentSettings = settingsRefLatest.current;
            const availableToken = currentSettings?.webhookToken || currentSettings?.billingWebhookToken;
            const currentMessages = messagesRefLatest.current;

            if (!currentMessages || currentMessages.length === 0 || !availableToken) {
                return;
            }

            const now = new Date();
            const todayKey = format(now, 'yyyy-MM-dd');

            const dueMessages = currentMessages.filter((msg) => {
                if (processingRef.current.has(msg.id)) return false;

                if (msg.status === 'Sending') {
                    const claimedAt = msg.claimedAt?.toDate ? msg.claimedAt.toDate() : null;
                    if (claimedAt) {
                        return (now.getTime() - claimedAt.getTime()) > STALE_TIMEOUT_MS;
                    }
                    const sendAtDate = msg.sendAt?.toDate ? msg.sendAt.toDate() : null;
                    return Boolean(sendAtDate && (now.getTime() - sendAtDate.getTime()) > STALE_TIMEOUT_MS);
                }

                if (msg.status !== 'Scheduled') return false;
                const sendAtDate = msg.sendAt?.toDate ? msg.sendAt.toDate() : null;
                return Boolean(sendAtDate && sendAtDate <= now);
            });

            if (dueMessages.length === 0) return;

            isLoopRunningRef.current = true;

            try {
                const sentSignaturesInBatch = new Set<string>();
                const currentDelay = dueMessages.length > 1 ? MANDATORY_DELAY : 0;

                for (let i = 0; i < dueMessages.length; i++) {
                    const msg = dueMessages[i];
                    const isLast = i === dueMessages.length - 1;

                    if (processingRef.current.has(msg.id)) continue;

                    const messageDocRef = doc(firestore, 'users', targetUserId, 'scheduled_messages', msg.id);
                    const logRef = collection(firestore, 'users', targetUserId, 'logs');
                    const sig = getGroupMessageSignature(msg.jid, msg.message);

                    // Trava por grupo no mesmo lote ou nos últimos 90s:
                    // Se já enviamos a mesma mensagem para este mesmo grupo, marca a duplicata como 'Sent' sem reenviar!
                    const lastGroupSendMs = recentGroupSentMapRef.current.get(sig) || 0;
                    if (sentSignaturesInBatch.has(sig) || (Date.now() - lastGroupSendMs) < 90000) {
                        console.warn(`[ScheduledMessageHandler] Agendamento duplicado detectado para o mesmo grupo (${msg.jid}). Marcando como concluído sem reenviar.`);
                        try {
                            if (msg.repeatDaily) {
                                const nextSendAt = getNextFutureDailyDate(msg.sendAt.toDate(), new Date());
                                await updateDoc(messageDocRef, {
                                    sendAt: Timestamp.fromDate(nextSendAt),
                                    status: 'Scheduled',
                                    claimedAt: null,
                                    lastSentAt: Timestamp.now(),
                                    lastSentDateKey: todayKey,
                                });
                            } else {
                                await updateDoc(messageDocRef, {
                                    status: 'Sent',
                                    claimedAt: null,
                                    lastSentAt: Timestamp.now(),
                                    lastSentDateKey: todayKey,
                                });
                            }
                        } catch {}
                        continue;
                    }

                    try {
                        processingRef.current.add(msg.id);

                        let alreadySentToday = false;

                        await runTransaction(firestore, async (transaction) => {
                            const messageDoc = await transaction.get(messageDocRef);
                            if (!messageDoc.exists()) throw new Error("deleted");
                            const data = messageDoc.data() as ScheduledMessage;
                            const txNow = new Date();

                            // Se for repetição diária e já enviou hoje, apenas avança para amanhã sem reenviar
                            if (data.repeatDaily && data.lastSentDateKey === todayKey) {
                                const nextSendAt = getNextFutureDailyDate(data.sendAt.toDate(), txNow);
                                transaction.update(messageDocRef, {
                                    sendAt: Timestamp.fromDate(nextSendAt),
                                    status: 'Scheduled',
                                    claimedAt: null,
                                });
                                alreadySentToday = true;
                                return;
                            }

                            // Se já foi enviado nos últimos 90 segundos, aborta
                            const lastSentMs = data.lastSentAt?.toMillis ? data.lastSentAt.toMillis() : 0;
                            if (lastSentMs && (txNow.getTime() - lastSentMs) < 90000) {
                                throw new Error("recently_sent");
                            }

                            if (data.status === 'Sending') {
                                const claimedAt = data.claimedAt?.toDate ? data.claimedAt.toDate() : null;
                                if (!claimedAt || (txNow.getTime() - claimedAt.getTime()) <= STALE_TIMEOUT_MS) {
                                    throw new Error("already being processed");
                                }
                            } else if (data.status === 'Scheduled') {
                                if (data.sendAt.toDate() > txNow) {
                                    throw new Error("not due yet");
                                }
                            } else {
                                throw new Error("already processed");
                            }

                            transaction.update(messageDocRef, {
                                status: 'Sending',
                                claimedAt: Timestamp.now(),
                            });
                        });

                        if (alreadySentToday) {
                            continue;
                        }

                        // Reserva a assinatura do grupo imediatamente antes do envio
                        sentSignaturesInBatch.add(sig);
                        recentGroupSentMapRef.current.set(sig, Date.now());

                        addDocumentNonBlocking(logRef, {
                            userId: targetUserId,
                            type: 'Grupo',
                            clientName: msg.groupName || 'Grupo WhatsApp',
                            target: msg.jid,
                            status: 'Enviando',
                            delayApplied: currentDelay / 1000,
                            timestamp: serverTimestamp(),
                        });

                        const latestSettings = settingsRefLatest.current;
                        const msgToken = (msg.useBillingZap && latestSettings?.useSeparateBillingZap && latestSettings?.billingWebhookToken)
                            ? latestSettings.billingWebhookToken
                            : (latestSettings?.webhookToken || latestSettings?.billingWebhookToken || '');

                        const response = await fetch('/api/send-group-message', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                jid: msg.jid,
                                message: msg.message,
                                imageUrl: msg.imageUrl,
                                token: msgToken,
                                buttons: msg.buttons,
                                supportNumber: msg.supportNumber,
                                siteLink: msg.siteLink,
                            }),
                        });

                        if (!response.ok) {
                            sentSignaturesInBatch.delete(sig);
                            recentGroupSentMapRef.current.delete(sig);
                            await updateDoc(messageDocRef, { status: 'Error', claimedAt: null }).catch(() => {});
                            addDocumentNonBlocking(logRef, {
                                userId: targetUserId,
                                type: 'Grupo',
                                clientName: msg.groupName || 'Grupo WhatsApp',
                                target: msg.jid,
                                status: 'Erro',
                                delayApplied: currentDelay / 1000,
                                timestamp: serverTimestamp(),
                            });
                            throw new Error(`Falha no envio para o grupo ${msg.jid}`);
                        }

                        addDocumentNonBlocking(logRef, {
                            userId: targetUserId,
                            type: 'Grupo',
                            clientName: msg.groupName || 'Grupo WhatsApp',
                            target: msg.jid,
                            status: 'Enviado',
                            delayApplied: currentDelay / 1000,
                            timestamp: serverTimestamp(),
                        });

                        if (msg.repeatDaily) {
                            const nextSendAt = getNextFutureDailyDate(msg.sendAt.toDate(), new Date());
                            await updateDoc(messageDocRef, {
                                sendAt: Timestamp.fromDate(nextSendAt),
                                status: 'Scheduled',
                                claimedAt: null,
                                lastSentAt: Timestamp.now(),
                                lastSentDateKey: todayKey,
                                retryCount: 0,
                                errorReason: null,
                            });
                        } else {
                            await updateDoc(messageDocRef, {
                                status: 'Sent',
                                claimedAt: null,
                                lastSentAt: Timestamp.now(),
                                lastSentDateKey: todayKey,
                                errorReason: null,
                            });
                            toast({
                                title: "Grupo Processado",
                                description: `Mensagem enviada com sucesso para ${msg.groupName || msg.jid}.`,
                            });
                        }

                        if (!isLast && currentDelay > 0) {
                            await sleep(currentDelay);
                        }
                    } catch (error: any) {
                        const ignoreReasons = ["already being processed", "already processed", "not due yet", "deleted", "recently_sent"];
                        if (!ignoreReasons.includes(error?.message)) {
                            console.error("Error processing scheduled message:", msg.id, error);
                        }
                    } finally {
                        processingRef.current.delete(msg.id);
                    }
                }
            } finally {
                isLoopRunningRef.current = false;
            }
        };

        const intervalId = setInterval(checkScheduledMessages, 30000);
        checkScheduledMessages();
        return () => clearInterval(intervalId);
    }, [targetUserId, firestore, toast, Boolean(messagesToCheck?.length), Boolean(settings?.webhookToken || settings?.billingWebhookToken)]);

    return null;
}
