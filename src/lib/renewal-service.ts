import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getFirestore,
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  addDoc,
  query,
  where,
  Timestamp,
  serverTimestamp,
  runTransaction,
} from 'firebase/firestore';
import { firebaseConfig } from '@/firebase/config';
import { add, format } from 'date-fns';
import type { Client, RenewalSession, Settings } from './types';

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
const db = getFirestore(app);
const processingSessions = new Set<string>();

export function getCanonicalPhone(phone: string): string {
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

export function formatPhoneWith55(phone: string): string {
  if (!phone) return '';
  let digits = phone.replace(/\D/g, '');
  if (!digits) return '';
  if (!digits.startsWith('55') && (digits.length === 10 || digits.length === 11)) {
    digits = '55' + digits;
  }
  return digits;
}

export function resolveRenewalWhatsAppTokens(settings: Settings): {
  primaryToken: string;
  fallbackToken: string;
  source: 'main' | 'billing' | 'auto';
} {
  const hubToken = settings.webhookToken?.trim() || '';
  const billingToken = settings.billingWebhookToken?.trim() || '';
  const choice = settings.renewalZapInstance || (settings.useSeparateBillingZap ? 'billing' : 'main');

  if (choice === 'billing') {
    return {
      primaryToken: billingToken || hubToken,
      fallbackToken: billingToken ? hubToken : '',
      source: 'billing',
    };
  }

  if (choice === 'main') {
    return {
      primaryToken: hubToken || billingToken,
      fallbackToken: hubToken ? billingToken : '',
      source: 'main',
    };
  }

  // 'auto'
  const primary = (settings.useSeparateBillingZap && billingToken) ? billingToken : (hubToken || billingToken);
  const fallback = primary === billingToken ? hubToken : billingToken;
  return {
    primaryToken: primary,
    fallbackToken: fallback,
    source: 'auto',
  };
}

export async function sendWhatsAppWithFallback(
  number: string,
  text: string,
  primaryToken: string,
  fallbackToken?: string
): Promise<{ success: boolean; tokenUsed: string; error?: string }> {
  if (!primaryToken && !fallbackToken) {
    return { success: false, tokenUsed: '', error: 'Nenhum token de WhatsApp configurado.' };
  }

  const cleanNum = formatPhoneWith55(number);
  let currentToken = primaryToken || fallbackToken!;
  let res = await fetch('https://travelflow.uazapi.com/send/text', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', token: currentToken, apikey: currentToken },
    body: JSON.stringify({ number: cleanNum, text }),
  });

  if (res.ok) {
    return { success: true, tokenUsed: currentToken };
  }

  const firstErr = await res.text().catch(() => '');
  console.warn(`[sendWhatsApp] Falha com token (${res.status}): ${firstErr}`);

  // Se retornou 401, 403 ou qualquer erro e houver outro token, tenta o fallback
  if (fallbackToken && fallbackToken !== currentToken) {
    console.log(`[sendWhatsApp] Tentando envio com token de fallback...`);
    currentToken = fallbackToken;
    const fallbackRes = await fetch('https://travelflow.uazapi.com/send/text', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', token: currentToken, apikey: currentToken },
      body: JSON.stringify({ number: cleanNum, text }),
    });

    if (fallbackRes.ok) {
      return { success: true, tokenUsed: currentToken };
    }

    const secondErr = await fallbackRes.text().catch(() => '');
    return { success: false, tokenUsed: currentToken, error: secondErr || firstErr };
  }

  return { success: false, tokenUsed: currentToken, error: firstErr || `Status ${res.status}` };
}

// Timestamp de corte: todas as novas automações de remarketing pós-cobrança e verificação em background
// funcionam ESTRITAMENTE para cobranças feitas a partir de agora (2026-10-16T06:45:42Z), ignorando clientes passados.
export const RENEWAL_FEATURES_START_MS = 1792137294000;

/**
 * Envia mensagem no WhatsApp com botão interativo de URL (CTA) no formato nativo da Uazapi (/send/menu).
 * Ex: Botão "SIM, RENOVAR AGORA" e opcionalmente 2º botão "Não quero renovar".
 */
export async function sendWhatsAppButtonWithFallback({
  number,
  text,
  footerText = 'Entrega Automática • ⬇️Clique No Botão⬇️',
  buttonLabel = 'SIM, RENOVAR AGORA',
  buttonUrl,
  cancelButtonLabel,
  cancelButtonUrl,
  primaryToken,
  fallbackToken,
}: {
  number: string;
  text: string;
  footerText?: string;
  buttonLabel?: string;
  buttonUrl: string;
  cancelButtonLabel?: string;
  cancelButtonUrl?: string;
  primaryToken: string;
  fallbackToken?: string;
}): Promise<{ success: boolean; tokenUsed: string; withButton: boolean; error?: string }> {
  if (!primaryToken && !fallbackToken) {
    return { success: false, tokenUsed: '', withButton: false, error: 'Nenhum token de WhatsApp configurado.' };
  }

  const cleanNum = formatPhoneWith55(number);
  const cleanButtonUrl = (buttonUrl || '').trim();
  const cleanLabel = (buttonLabel || '').trim() || 'SIM, RENOVAR AGORA';
  const choices: string[] = [`${cleanLabel}|${cleanButtonUrl}`];

  if (cancelButtonUrl && cancelButtonUrl.trim()) {
    const cleanCancelLabel = (cancelButtonLabel || '').trim() || 'Não quero renovar';
    choices.push(`${cleanCancelLabel}|${cancelButtonUrl.trim()}`);
  }

  const payload: any = {
    number: cleanNum,
    type: 'button',
    text: text.trim(),
    choices,
  };

  if (footerText && footerText.trim()) {
    payload.footerText = footerText.trim();
  }

  let currentToken = primaryToken || fallbackToken!;

  // 1. Tenta envio com botão interativo via endpoint /send/menu
  try {
    const res = await fetch('https://travelflow.uazapi.com/send/menu', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', token: currentToken, apikey: currentToken },
      body: JSON.stringify(payload),
    });

    if (res.ok) {
      console.log(`[sendWhatsAppButton] Botão(ões) "${choices.join(' / ')}" enviado com sucesso via /send/menu`);
      return { success: true, tokenUsed: currentToken, withButton: true };
    }

    const firstErr = await res.text().catch(() => '');
    console.warn(`[sendWhatsAppButton] Falha com token primário (${res.status}):`, firstErr);

    // Tenta fallback com /send/menu se houver token secundário
    if (fallbackToken && fallbackToken !== currentToken) {
      currentToken = fallbackToken;
      const fallbackRes = await fetch('https://travelflow.uazapi.com/send/menu', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', token: currentToken, apikey: currentToken },
        body: JSON.stringify(payload),
      });

      if (fallbackRes.ok) {
        console.log(`[sendWhatsAppButton] Botão(ões) enviado com sucesso via fallback`);
        return { success: true, tokenUsed: currentToken, withButton: true };
      }
    }
  } catch (err: any) {
    console.error(`[sendWhatsAppButton] Erro de conexão com /send/menu:`, err);
  }

  // Fallback de segurança: se /send/menu falhar, envia mensagem convencional anexando o link
  console.log(`[sendWhatsAppButton] Fazendo fallback para texto simples com link...`);
  let textWithLink = `${text.trim()}\n\n🔗 ${cleanButtonUrl}`;
  if (cancelButtonUrl && cancelButtonUrl.trim()) {
    const cleanCancelLabel = (cancelButtonLabel || '').trim() || 'Não quero renovar';
    textWithLink += `\n\n❌ ${cleanCancelLabel}: ${cancelButtonUrl.trim()}`;
  }
  const textResult = await sendWhatsAppWithFallback(number, textWithLink, primaryToken, fallbackToken);
  return {
    success: textResult.success,
    tokenUsed: textResult.tokenUsed,
    withButton: false,
    error: textResult.error,
  };
}

/**
 * Cria ou recupera uma sessão de renovação para um grupo de assinaturas de um mesmo cliente.
 */
export async function getOrCreateRenewalSession(
  userId: string,
  clients: Client[],
  originUrl = 'https://pjcrm.site',
  forceNew = false,
  isTest = false
): Promise<{ session: RenewalSession; link: string }> {
  if (!clients || clients.length === 0) {
    throw new Error('Nenhum cliente informado para criar a sessão de renovação');
  }

  const primaryClient = clients[0];
  const canonical = getCanonicalPhone(primaryClient.phone);

  const now = Date.now();
  const sessionsRef = collection(db, 'renewal_sessions');

  const subscriptions = clients.map((c) => ({
    clientId: c.id,
    name: c.subscription || 'Assinatura',
    value: c.amountPaid ? String(c.amountPaid).replace(',', '.') : '25.00',
    email: c.email || [],
    screen: c.screen || null,
    pinScreen: c.pinScreen || null,
    currentDueDate: c.dueDate || null,
  }));

  if (!forceNew) {
    // Procura sessão ativa recente para este telefone (últimas 24h e status 'pending')
    const q = query(
      sessionsRef,
      where('userId', '==', userId),
      where('canonicalPhone', '==', canonical),
      where('status', '==', 'pending')
    );

    try {
      const existingSnap = await getDocs(q);
      for (const d of existingSnap.docs) {
        const data = d.data() as RenewalSession;
        const createdMs = data.createdAt?.toMillis
          ? data.createdAt.toMillis()
          : data.createdAt?.seconds
          ? data.createdAt.seconds * 1000
          : 0;
        if (now - createdMs < 24 * 60 * 60 * 1000) {
          // Garante que todas as assinaturas enviadas agora estejam sincronizadas na sessão reutilizada
          const newClientIds = clients.map((c) => c.id);
          const existingIds = Array.isArray(data.clientIds) ? data.clientIds : [];
          const hasDiff =
            newClientIds.length !== existingIds.length ||
            newClientIds.some((id) => !existingIds.includes(id));

          if (hasDiff) {
            await updateDoc(doc(db, 'renewal_sessions', d.id), {
              clientIds: newClientIds,
              subscriptions,
              clientName: primaryClient.name,
            }).catch(() => {});
          }

          return {
            session: { ...data, id: d.id, clientIds: newClientIds, subscriptions },
            link: `${originUrl}/renovar/${d.id}`,
          };
        }
      }
    } catch (e) {
      console.warn('[RenewalService] Erro ao buscar sessões existentes:', e);
    }
  }

  // Cria nova sessão com ID curto e amigável
  const sessionId = `ren_${Math.random().toString(36).substring(2, 9)}${Date.now().toString(36).slice(-4)}`;

  const sessionData: RenewalSession = {
    id: sessionId,
    userId,
    phone: primaryClient.phone,
    canonicalPhone: canonical,
    clientName: primaryClient.name,
    clientIds: clients.map((c) => c.id),
    subscriptions,
    status: 'pending',
    isTest: Boolean(isTest),
    createdAt: Timestamp.now(),
    expiresAt: Timestamp.fromMillis(now + 7 * 24 * 60 * 60 * 1000), // 7 dias
  };

  await setDoc(doc(db, 'renewal_sessions', sessionId), sessionData);

  return {
    session: sessionData,
    link: `${originUrl}/renovar/${sessionId}`,
  };
}

/**
 * Executa a renovação automática das assinaturas selecionadas no CRM e envia WhatsApp de confirmação.
 */
export async function executeRenewalPayment({
  sessionId,
  pixTransactionId,
  amountInCents,
  renewedClientIds,
  reportedIssues,
}: {
  sessionId: string;
  pixTransactionId?: string;
  amountInCents?: number;
  renewedClientIds?: string[];
  reportedIssues?: { clientId: string; subscriptionName: string }[];
}): Promise<{ success: boolean; renewedCount: number; messageSent: boolean; error?: string }> {
  // 1. Trava em memória para chamadas simultâneas na mesma instância
  if (processingSessions.has(sessionId)) {
    console.log(`[RenewalService] Sessão ${sessionId} já está em processamento simultâneo nesta instância. Ignorando chamada duplicada.`);
    return { success: true, renewedCount: 0, messageSent: true };
  }

  processingSessions.add(sessionId);

  try {
    const sessionDocRef = doc(db, 'renewal_sessions', sessionId);

    // 2. Transação atômica no Firestore: garante que se o Webhook e o Polling do navegador
    // dispararem no mesmo milissegundo, APENAS UM deles reivindica a sessão e envia a mensagem!
    let claimedSession: RenewalSession | null = null;
    let alreadyProcessed = false;

    try {
      await runTransaction(db, async (txn) => {
        const snap = await txn.get(sessionDocRef);
        if (!snap.exists()) {
          throw new Error('SESSION_NOT_FOUND');
        }
        const data = snap.data() as RenewalSession & { processingPayment?: boolean; messageSent?: boolean };

        if (
          data.status === 'paid' ||
          Boolean(data.paidAt) ||
          data.processingPayment === true ||
          data.messageSent === true
        ) {
          alreadyProcessed = true;
          claimedSession = data;
          return;
        }

        const effectiveIssues =
          reportedIssues && reportedIssues.length > 0 ? reportedIssues : data.reportedIssues || [];
        const effectiveTargets =
          renewedClientIds && renewedClientIds.length > 0
            ? renewedClientIds
            : data.renewedClientIds && data.renewedClientIds.length > 0
            ? data.renewedClientIds
            : data.clientIds;

        // Marca IMEDIATAMENTE dentro da transação como 'paid' e 'processingPayment: true'
        txn.update(sessionDocRef, {
          status: 'paid',
          processingPayment: true,
          messageSent: true,
          paidAt: serverTimestamp(),
          pixTransactionId: pixTransactionId || data.pixTransactionId || null,
          totalAmountPaid: amountInCents || data.totalAmountPaid || 0,
          renewedClientIds: effectiveTargets,
          reportedIssues: effectiveIssues,
          hasSupportRequest: effectiveIssues.length > 0,
        });

        claimedSession = data;
      });
    } catch (txnErr: any) {
      if (txnErr?.message === 'SESSION_NOT_FOUND') {
        return { success: false, renewedCount: 0, messageSent: false, error: 'Sessão não encontrada' };
      }
      console.warn(`[RenewalService] Conflito de transação na sessão ${sessionId} (provável chamada concorrente):`, txnErr?.message);
      return { success: true, renewedCount: 0, messageSent: true };
    }

    if (alreadyProcessed || !claimedSession) {
      console.log(`[RenewalService] Sessão ${sessionId} já processada/confirmada anteriormente. Evitando mensagem duplicada.`);
      return {
        success: true,
        renewedCount: (claimedSession as RenewalSession | null)?.renewedClientIds?.length || 0,
        messageSent: true,
      };
    }

    const session = claimedSession as RenewalSession;
    const userId = session.userId;

    const effectiveReportedIssues =
      reportedIssues && reportedIssues.length > 0 ? reportedIssues : session.reportedIssues || [];

    const targetClientIds =
      renewedClientIds && renewedClientIds.length > 0
        ? renewedClientIds
        : session.renewedClientIds && session.renewedClientIds.length > 0
        ? session.renewedClientIds
        : session.clientIds;

    const renewedNames: string[] = [];
    let newestDueDateFormatted = '';

    // 3. Renova cada cliente no Firestore (executado apenas pela única chamada vencedora da transação)
    for (const clientId of targetClientIds) {
      try {
        const clientRef = doc(db, 'users', userId, 'clients', clientId);
        const clientSnap = await getDoc(clientRef);
        if (!clientSnap.exists()) continue;

        const clientData = clientSnap.data() as Client;
        const subName = clientData.subscription || 'Assinatura';
        renewedNames.push(subName);

        // Se a data de vencimento atual ainda for no futuro, soma 1 mês a partir dela.
        // Se já tiver vencido ou for hoje, soma 1 mês a partir de hoje!
        const now = new Date();
        const existingDue = clientData.dueDate?.toDate ? clientData.dueDate.toDate() : null;
        const baseDate = existingDue && existingDue.getTime() > now.getTime() ? existingDue : now;
        const newDueDate = add(baseDate, { months: 1 });
        newestDueDateFormatted = format(newDueDate, 'dd/MM/yyyy');

        const hasReportedIssue = effectiveReportedIssues.some((r) => r.clientId === clientId);

        const updateData: any = {
          status: 'Ativo',
          dueDate: Timestamp.fromDate(newDueDate),
          renewalCount: (clientData.renewalCount || 0) + 1,
          lastRenewedAt: serverTimestamp(),
          sentUpsellIds: [],
          sentUpsell2Ids: [],
          sentUpsellMenuIds: [],
          sentRemarketingIds: [],
          sentRenewalFollowUpIds: [],
        };

        if (hasReportedIssue) {
          updateData.needsSupport = true;
          const oldNotes = clientData.notes || '';
          updateData.notes = `${oldNotes}\n[🚨 Cliente informou problema na assinatura na renovação em ${format(now, 'dd/MM/yyyy HH:mm')}]`.trim();
        }

        await updateDoc(clientRef, updateData);
        console.log(
          `[RenewalService] Cliente ${clientId} (${clientData.name}) renovado com sucesso até ${newestDueDateFormatted}${hasReportedIssue ? ' com suporte marcado' : ''}`
        );
      } catch (clientErr) {
        console.error(`[RenewalService] Erro ao renovar cliente ${clientId}:`, clientErr);
      }
    }

    // Se houver alguma assinatura reportada com problema que NÃO foi selecionada para renovação, ainda assim marca suporte
    for (const reported of effectiveReportedIssues) {
      if (!targetClientIds.includes(reported.clientId)) {
        try {
          const now = new Date();
          const otherRef = doc(db, 'users', userId, 'clients', reported.clientId);
          const otherSnap = await getDoc(otherRef);
          if (otherSnap.exists()) {
            const otherData = otherSnap.data() as Client;
            const oldNotes = otherData.notes || '';
            await updateDoc(otherRef, {
              needsSupport: true,
              notes: `${oldNotes}\n[🚨 Cliente informou problema na assinatura na renovação em ${format(now, 'dd/MM/yyyy HH:mm')}]`.trim(),
            });
            console.log(
              `[RenewalService] Cliente ${reported.clientId} (${otherData.name}) marcado como needsSupport: true (não renovado)`
            );
          }
        } catch (e) {
          console.error(`[RenewalService] Erro ao marcar suporte para cliente não renovado ${reported.clientId}:`, e);
        }
      }
    }

    // Registra log geral
    await addDoc(collection(db, 'users', userId, 'logs'), {
      userId,
      type: 'Renovação Automática',
      clientName: session.clientName,
      target: session.phone,
      status: 'Enviado',
      details: `Renovadas: ${renewedNames.join(', ')} | Novo vencimento: ${newestDueDateFormatted}${effectiveReportedIssues.length > 0 ? ' | Suporte Aberto Automático 🚨' : ''}`,
      timestamp: serverTimestamp(),
    }).catch(() => {});

    // Dispara WhatsApp de confirmação para o cliente (SEMPRE que um pagamento for aprovado)
    let messageSent = false;
    try {
      const configSnap = await getDoc(doc(db, 'users', userId, 'settings', 'config'));
      const settings = configSnap.exists() ? (configSnap.data() as Settings) : {};

      let { primaryToken, fallbackToken } = resolveRenewalWhatsAppTokens(settings);

      // Fallbacks adicionais de token se não estiverem configurados em config
      if (!primaryToken && !fallbackToken) {
        try {
          const flowSnap = await getDoc(doc(db, 'users', userId, 'settings', 'uazapi_flow'));
          if (flowSnap.exists()) {
            const flowData = flowSnap.data() as any;
            if (flowData.instanceToken?.trim()) {
              primaryToken = flowData.instanceToken.trim();
            }
          }
        } catch {}
      }

      if (!primaryToken && !fallbackToken) {
        try {
          const snap2fa = await getDoc(doc(db, 'users', userId, 'settings', '2fatores'));
          if (snap2fa.exists()) {
            const data2fa = snap2fa.data() as any;
            if (data2fa.webhookToken?.trim()) {
              primaryToken = data2fa.webhookToken.trim();
            } else if (data2fa.billingWebhookToken?.trim()) {
              primaryToken = data2fa.billingWebhookToken.trim();
            }
          }
        } catch {}
      }

      if ((primaryToken || fallbackToken) && session.phone) {
          const defaultTemplate =
            '🎉 *PAGAMENTO CONFIRMADO!*\n\n' +
            'Olá *{cliente}*, identificamos seu pagamento PIX e sua renovação foi realizada com sucesso!\n\n' +
            '📦 *Assinatura(s):* {assinaturas}\n' +
            '📅 *Novo Vencimento:* {novo_vencimento}\n' +
            '💰 *Valor Pago:* R$ {valor}\n' +
            '⚡ *Status:* Ativo\n\n' +
            'Obrigado pela preferência e bom entretenimento! 🚀';

          const template = settings.renewalSuccessMessage?.trim() || defaultTemplate;
          const effectiveAmountCents = amountInCents || session.totalAmountPaid || 0;
          const totalReais = effectiveAmountCents ? (effectiveAmountCents / 100).toFixed(2).replace('.', ',') : '0,00';
          const clientNameSafe = (session.clientName || 'Cliente').trim();
          const phoneSafe = (session.phone || '').trim();

          const finalMsg = template
            .replace(/{cliente}/gi, clientNameSafe)
            .replace(/{nome}/gi, clientNameSafe)
            .replace(/{telefone}/gi, phoneSafe)
            .replace(/{numero}/gi, phoneSafe)
            .replace(/{assinaturas}/gi, renewedNames.join(' + '))
            .replace(/{assinatura}/gi, renewedNames.join(' + '))
            .replace(/{novo_vencimento}/gi, newestDueDateFormatted)
            .replace(/{vencimento}/gi, newestDueDateFormatted)
            .replace(/{valor}/gi, totalReais)
            .replace(/{status}/gi, 'Ativo');

          const sendResult = await sendWhatsAppWithFallback(phoneSafe, finalMsg, primaryToken, fallbackToken);
          messageSent = sendResult.success;
          if (messageSent) {
            console.log(`[RenewalService] Confirmação enviada via token: ${sendResult.tokenUsed.slice(0, 10)}... para ${phoneSafe}`);
          } else {
            console.warn(`[RenewalService] Falha ao enviar confirmação para ${phoneSafe}: ${sendResult.error}`);
          }

          // Registra log específico do envio da mensagem de confirmação
          await addDoc(collection(db, 'users', userId, 'logs'), {
            userId,
            type: 'Confirmação de Pagamento WhatsApp',
            clientName: clientNameSafe,
            target: phoneSafe,
            status: messageSent ? 'Enviado' : 'Falha',
            details: messageSent
              ? `Comprovante de renovação enviado com sucesso para ${phoneSafe} (Token: ${sendResult.tokenUsed?.slice(0, 10)}...)`
              : `Falha ao enviar comprovante no WhatsApp: ${sendResult.error || 'Erro desconhecido'}`,
            timestamp: serverTimestamp(),
          }).catch(() => {});

          // Salva messageSent na sessão para auditoria e controle de duplicidade
          await updateDoc(sessionDocRef, {
            messageSent,
          }).catch(() => {});

          // Se houve relato de problemas na assinatura, dispara a mensagem de abertura de suporte
          if (effectiveReportedIssues.length > 0) {
            try {
              const defaultSupportTemplate =
                '🛠️ *SUPORTE PJ CONTAS - CHAMADO ABERTO*\n\n' +
                'Olá *{cliente}*! Identificamos o seu relato de problema na assinatura *{assinatura}* ao renovar.\n\n' +
                '✅ Seu pagamento PIX foi aprovado e sua assinatura foi renovada com sucesso!\n' +
                '🚨 O seu chamado de suporte já foi aberto automaticamente em nosso sistema. 🧑‍💻\n\n' +
                'Nossa equipe técnica já foi notificada e em breve entrará em contato para verificar e resolver seu acesso com prioridade. Fique tranquilo(a)! 🤝✨';

              const supportTemplate =
                settings.renewalSupportMessage?.trim() ||
                settings.supportStartedMessage?.trim() ||
                defaultSupportTemplate;

              const issueNames = effectiveReportedIssues.map((r) => r.subscriptionName || 'Assinatura');
              const issueDisplay = issueNames.join(' + ') || renewedNames.join(' + ');

              const supportMsg = supportTemplate
                .replace(/{cliente}/gi, clientNameSafe)
                .replace(/{nome}/gi, clientNameSafe)
                .replace(/{telefone}/gi, phoneSafe)
                .replace(/{numero}/gi, phoneSafe)
                .replace(/{assinaturas}/gi, issueDisplay)
                .replace(/{assinatura}/gi, issueDisplay)
                .replace(/{novo_vencimento}/gi, newestDueDateFormatted)
                .replace(/{vencimento}/gi, newestDueDateFormatted)
                .replace(/{valor}/gi, totalReais)
                .replace(/{status}/gi, 'Em Suporte');

              // Pausa de 1.5s para garantir que as mensagens cheguem em ordem sem conflito de envio no WhatsApp
              await new Promise((resolve) => setTimeout(resolve, 1500));

              const supportResult = await sendWhatsAppWithFallback(
                phoneSafe,
                supportMsg,
                primaryToken,
                fallbackToken
              );

              if (supportResult.success) {
                console.log(`[RenewalService] Mensagem de suporte automático enviada para ${phoneSafe}`);
              } else {
                console.warn(`[RenewalService] Falha ao enviar mensagem de suporte: ${supportResult.error}`);
              }

              await addDoc(collection(db, 'users', userId, 'logs'), {
                userId,
                type: 'Suporte Aberto (Renovação)',
                clientName: clientNameSafe,
                target: phoneSafe,
                status: supportResult.success ? 'Enviado' : 'Falha',
                details: `Chamado de suporte aberto para assinatura(s): ${issueDisplay}`,
                timestamp: serverTimestamp(),
              }).catch(() => {});
            } catch (supErr) {
              console.error('[RenewalService] Erro ao disparar mensagem de suporte na renovação:', supErr);
            }
          }
      } else {
        console.warn(`[RenewalService] Não foi possível enviar WhatsApp: Token ausente ou telefone não informado (${session.phone})`);
      }
    } catch (msgErr) {
      console.error('[RenewalService] Erro ao disparar mensagem WhatsApp:', msgErr);
    }

    return {
      success: true,
      renewedCount: renewedNames.length,
      messageSent,
    };
  } catch (error: any) {
    console.error('[RenewalService] Erro geral ao executar renovação:', error);
    return { success: false, renewedCount: 0, messageSent: false, error: error.message };
  } finally {
    processingSessions.delete(sessionId);
  }
}

/**
 * Verifica automaticamente em background todas as sessões de renovação pendentes do usuário
 * que já geraram cobrança PIX nas últimas 72h.
 * Garante que mesmo se o cliente fechar o navegador após copiar o PIX (ou o webhook atrasar/falhar),
 * o sistema identifique o pagamento, renove o cliente no CRM, cancele o remarketing e envie a confirmação!
 */
export async function verifyPendingRenewalSessions(
  userId: string,
  settings?: Settings
): Promise<number> {
  try {
    const { checkPjPayTransaction, DEFAULT_PJPAY_TOKEN } = await import('./pjpay');
    const { checkLinkinPayTransaction, DEFAULT_LINKINPAY_TOKEN } = await import('./linkinpay');

    const pjpayToken = settings?.pjpayToken?.trim() || DEFAULT_PJPAY_TOKEN;
    const linkinpayToken = settings?.linkinpayToken?.trim() || DEFAULT_LINKINPAY_TOKEN;

    const q = query(
      collection(db, 'renewal_sessions'),
      where('userId', '==', userId),
      where('status', '==', 'pending')
    );

    const snap = await getDocs(q);
    if (snap.empty) return 0;

    const nowMs = Date.now();
    const maxAgeMs = 72 * 60 * 60 * 1000; // 72 horas
    let confirmedCount = 0;

    for (const d of snap.docs) {
      const session = { id: d.id, ...d.data() } as RenewalSession;

      const createdMs = session.createdAt?.toMillis
        ? session.createdAt.toMillis()
        : session.createdAt?.seconds
        ? session.createdAt.seconds * 1000
        : 0;

      // Só verifica cobranças feitas a partir de agora (ignora sessões passadas)
      if (!createdMs || createdMs < RENEWAL_FEATURES_START_MS) continue;
      if (nowMs - createdMs > maxAgeMs) continue;

      const txCandidates = Array.from(
        new Set(
          [
            session.pixTransactionId,
            ...(Array.isArray(session.pixTransactionIds) ? session.pixTransactionIds : []),
          ].filter((id): id is string => Boolean(id && String(id).trim()))
        )
      );

      if (txCandidates.length === 0) continue;

      for (const txId of txCandidates) {
        const isPjPay =
          String(txId).startsWith('pay_') ||
          (session.gateway === 'pjpay' && !String(txId).includes('-'));

        try {
          const checkRes = isPjPay
            ? await checkPjPayTransaction(txId, pjpayToken)
            : await checkLinkinPayTransaction(txId, linkinpayToken);

          if (checkRes.paid) {
            console.log(
              `[RenewalService:AutoVerify] PIX ${txId} da sessão ${session.id} (${session.clientName}) identificado como PAGO em background! Executando renovação...`
            );
            await executeRenewalPayment({
              sessionId: session.id,
              pixTransactionId: txId,
              amountInCents: session.totalAmountPaid,
            });
            confirmedCount++;
            break;
          }
        } catch (err: any) {
          // Ignora erros temporários de rede em transações individuais
        }
      }
    }

    return confirmedCount;
  } catch (e: any) {
    console.warn('[RenewalService:AutoVerify] Erro ao verificar sessões pendentes:', e?.message);
    return 0;
  }
}

