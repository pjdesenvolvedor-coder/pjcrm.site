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
} from 'firebase/firestore';
import { firebaseConfig } from '@/firebase/config';
import { add, format } from 'date-fns';
import type { Client, RenewalSession, Settings } from './types';

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
const db = getFirestore(app);

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

/**
 * Cria ou recupera uma sessão de renovação para um grupo de assinaturas de um mesmo cliente.
 */
export async function getOrCreateRenewalSession(
  userId: string,
  clients: Client[],
  originUrl = 'https://pjcrm.site',
  forceNew = false
): Promise<{ session: RenewalSession; link: string }> {
  if (!clients || clients.length === 0) {
    throw new Error('Nenhum cliente informado para criar a sessão de renovação');
  }

  const primaryClient = clients[0];
  const canonical = getCanonicalPhone(primaryClient.phone);

  const now = Date.now();
  const sessionsRef = collection(db, 'renewal_sessions');

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
        const createdMs = data.createdAt?.toMillis ? data.createdAt.toMillis() : (data.createdAt?.seconds ? data.createdAt.seconds * 1000 : 0);
        if (now - createdMs < 24 * 60 * 60 * 1000) {
          return {
            session: { id: d.id, ...data },
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

  const subscriptions = clients.map((c) => ({
    clientId: c.id,
    name: c.subscription || 'Assinatura',
    value: c.amountPaid ? String(c.amountPaid).replace(',', '.') : '25.00',
    email: c.email || [],
    screen: c.screen || null,
    pinScreen: c.pinScreen || null,
    currentDueDate: c.dueDate || null,
  }));

  const sessionData: RenewalSession = {
    id: sessionId,
    userId,
    phone: primaryClient.phone,
    canonicalPhone: canonical,
    clientName: primaryClient.name,
    clientIds: clients.map((c) => c.id),
    subscriptions,
    status: 'pending',
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
  try {
    const sessionDocRef = doc(db, 'renewal_sessions', sessionId);
    const sessionSnap = await getDoc(sessionDocRef);

    if (!sessionSnap.exists()) {
      return { success: false, renewedCount: 0, messageSent: false, error: 'Sessão não encontrada' };
    }

    const session = sessionSnap.data() as RenewalSession;
    const userId = session.userId;

    // Se já foi processada anteriormente, evita duplicidade
    if (session.status === 'paid' && session.paidAt) {
      console.log(`[RenewalService] Sessão ${sessionId} já processada anteriormente.`);
      return { success: true, renewedCount: session.renewedClientIds?.length || 0, messageSent: true };
    }

    const targetClientIds = (renewedClientIds && renewedClientIds.length > 0)
      ? renewedClientIds
      : (session.renewedClientIds && session.renewedClientIds.length > 0 ? session.renewedClientIds : session.clientIds);

    const renewedNames: string[] = [];
    let newestDueDateFormatted = '';

    // Renova cada cliente no Firestore
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
        const baseDate = (existingDue && existingDue.getTime() > now.getTime()) ? existingDue : now;
        const newDueDate = add(baseDate, { months: 1 });
        newestDueDateFormatted = format(newDueDate, 'dd/MM/yyyy');

        const hasReportedIssue = reportedIssues?.some((r) => r.clientId === clientId);

        const updateData: any = {
          status: 'Ativo',
          dueDate: Timestamp.fromDate(newDueDate),
          renewalCount: (clientData.renewalCount || 0) + 1,
          lastRenewedAt: serverTimestamp(),
          sentUpsellIds: [],
          sentUpsell2Ids: [],
          sentUpsellMenuIds: [],
          sentRemarketingIds: [],
        };

        if (hasReportedIssue) {
          updateData.needsSupport = true;
          const oldNotes = clientData.notes || '';
          updateData.notes = `${oldNotes}\n[🚨 Cliente informou problema na assinatura em ${format(now, 'dd/MM/yyyy HH:mm')}]`.trim();
        }

        await updateDoc(clientRef, updateData);
        console.log(`[RenewalService] Cliente ${clientId} (${clientData.name}) renovado com sucesso até ${newestDueDateFormatted}`);
      } catch (clientErr) {
        console.error(`[RenewalService] Erro ao renovar cliente ${clientId}:`, clientErr);
      }
    }

    // Atualiza status da sessão
    await updateDoc(sessionDocRef, {
      status: 'paid',
      paidAt: serverTimestamp(),
      pixTransactionId: pixTransactionId || session.pixTransactionId || null,
      totalAmountPaid: amountInCents || session.totalAmountPaid || 0,
      renewedClientIds: targetClientIds,
      reportedIssues: reportedIssues || session.reportedIssues || [],
    });

    // Registra log geral
    await addDoc(collection(db, 'users', userId, 'logs'), {
      userId,
      type: 'Renovação Automática',
      clientName: session.clientName,
      target: session.phone,
      status: 'Enviado',
      details: `Renovadas: ${renewedNames.join(', ')} | Novo vencimento: ${newestDueDateFormatted}`,
      timestamp: serverTimestamp(),
    }).catch(() => {});

    // Dispara WhatsApp de confirmação para o cliente
    let messageSent = false;
    try {
      const configSnap = await getDoc(doc(db, 'users', userId, 'settings', 'config'));
      const settings = configSnap.exists() ? (configSnap.data() as Settings) : {};

      const billingToken = settings.useSeparateBillingZap && settings.billingWebhookToken
        ? settings.billingWebhookToken
        : (settings.webhookToken || settings.billingWebhookToken);

      if (billingToken && session.phone) {
        const cleanPhone = formatPhoneWith55(session.phone);

        const defaultTemplate =
          '🎉 *PAGAMENTO CONFIRMADO!*\n\n' +
          'Olá *{cliente}*, identificamos seu pagamento PIX e sua renovação foi realizada com sucesso!\n\n' +
          '📦 *Assinatura(s):* {assinaturas}\n' +
          '📅 *Novo Vencimento:* {novo_vencimento}\n' +
          '💰 *Valor Pago:* R$ {valor}\n' +
          '⚡ *Status:* Ativo\n\n' +
          'Obrigado pela preferência e bom entretenimento! 🚀';

        const template = settings.renewalSuccessMessage?.trim() || defaultTemplate;
        const totalReais = amountInCents ? (amountInCents / 100).toFixed(2).replace('.', ',') : '0,00';

        const finalMsg = template
          .replace(/{cliente}/gi, session.clientName)
          .replace(/{nome}/gi, session.clientName)
          .replace(/{telefone}/gi, session.phone)
          .replace(/{numero}/gi, session.phone)
          .replace(/{assinaturas}/gi, renewedNames.join(' + '))
          .replace(/{assinatura}/gi, renewedNames.join(' + '))
          .replace(/{novo_vencimento}/gi, newestDueDateFormatted)
          .replace(/{vencimento}/gi, newestDueDateFormatted)
          .replace(/{valor}/gi, totalReais)
          .replace(/{status}/gi, 'Ativo');

        const uazapiRes = await fetch('https://travelflow.uazapi.com/send/text', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            token: billingToken,
            apikey: billingToken,
          },
          body: JSON.stringify({
            number: cleanPhone,
            text: finalMsg,
          }),
        });

        if (uazapiRes.ok) {
          messageSent = true;
          console.log(`[RenewalService] Mensagem de confirmação enviada com sucesso para ${cleanPhone}`);
        } else {
          const errBody = await uazapiRes.text().catch(() => '');
          console.warn(`[RenewalService] Falha ao enviar WhatsApp de confirmação: ${errBody}`);
        }
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
  }
}
