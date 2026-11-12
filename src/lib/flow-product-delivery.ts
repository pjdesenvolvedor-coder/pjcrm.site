import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  addDoc,
  collection,
  query,
  where,
  getDocs,
} from 'firebase/firestore';
import { firebaseConfig } from '@/firebase/config';
import {
  createPjPayPix,
  checkPjPayTransaction,
  fetchRecentPjPayPayments,
  DEFAULT_PJPAY_TOKEN,
} from './pjpay';
import {
  createLinkinPayPix,
  checkLinkinPayTransaction,
  DEFAULT_LINKINPAY_TOKEN,
} from './linkinpay';
import { claimOnce } from './firestore-claim';
import type {
  FlowOrder,
  FlowProductDeliveryConfig,
  FlowProductStockItem,
  FlowContactSession,
  Settings,
} from './types';

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
const db = getFirestore(app);

export const DEFAULT_GENERAL_PRODUCT_DELIVERY_MESSAGE = `🎉 *PAGAMENTO APROVADO!*

Olá *{cliente}*, seu pagamento foi confirmado com sucesso! Aqui estão os dados de acesso do seu produto *{produto}*:

📧 *E-mail (Login):* {email}
🔑 *Senha:* {senha}
📅 *Vencimento:* {vencimento}

Qualquer dúvida estamos à disposição! Bom proveito! 🚀`;

export const DEFAULT_FLOW_PIX_BILLING_MESSAGE = `💳 *QUAL FORMA DE PAGAMENTO VOCÊ GOSTARIA?*

Olá *{primeiro_nome}*! Seu pedido do *{produto}* no valor de *{valor}* já está pronto para liberação imediata.

Como você gostaria de pagar? Escolha uma opção abaixo 👇`;

export function parsePriceToCents(raw?: number | string): number {
  if (raw === undefined || raw === null || raw === '') return 1990;
  if (typeof raw === 'number') {
    if (raw <= 0) return 1990;
    return raw < 500 ? Math.round(raw * 100) : Math.round(raw);
  }
  const cleaned = String(raw)
    .replace(/R\$/gi, '')
    .replace(/\s+/g, '')
    .replace(/\./g, '')
    .replace(',', '.');
  const num = parseFloat(cleaned);
  if (isNaN(num) || num <= 0) return 1990;
  return Math.round(num * 100);
}

export function formatCentsToBrl(cents: number): string {
  return (cents / 100).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  });
}

function cleanServerUrl(url?: string): string {
  let cleaned = (url || '').trim();
  if (!cleaned) cleaned = 'https://travelflow.uazapi.com';
  if (!cleaned.startsWith('http://') && !cleaned.startsWith('https://')) {
    cleaned = `https://${cleaned}`;
  }
  if (cleaned.endsWith('/')) {
    cleaned = cleaned.slice(0, -1);
  }
  return cleaned;
}

function formatPhoneWith55(raw: string): string {
  if (!raw) return '';
  if (raw.includes('@lid')) return raw;
  let digits = raw.split('@')[0].split(':')[0].replace(/\D/g, '');
  if (!digits) return '';
  if (!digits.startsWith('55') && (digits.length === 10 || digits.length === 11)) {
    digits = '55' + digits;
  }
  return digits;
}

async function sendWhatsAppTextDirect(
  serverUrl: string,
  instanceToken: string,
  recipient: string,
  text: string
): Promise<boolean> {
  if (!instanceToken || !recipient || !text.trim()) return false;
  try {
    const base = cleanServerUrl(serverUrl);
    const res = await fetch(`${base}/send/text`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        token: instanceToken,
        apikey: instanceToken,
      },
      body: JSON.stringify({
        number: formatPhoneWith55(recipient),
        text: text.trim(),
      }),
    });
    return res.ok;
  } catch (err) {
    console.error('[FlowProductDelivery] Erro ao enviar texto no WhatsApp:', err);
    return false;
  }
}

async function sendWhatsAppMediaDirect(
  serverUrl: string,
  instanceToken: string,
  recipient: string,
  mediaUrlOrBase64: string,
  caption?: string
): Promise<boolean> {
  if (!instanceToken || !recipient || !mediaUrlOrBase64) return false;
  try {
    const base = cleanServerUrl(serverUrl);
    const formattedMedia =
      mediaUrlOrBase64.startsWith('data:') || mediaUrlOrBase64.startsWith('http')
        ? mediaUrlOrBase64
        : `data:image/png;base64,${mediaUrlOrBase64}`;
    const res = await fetch(`${base}/send/media`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        token: instanceToken,
        apikey: instanceToken,
      },
      body: JSON.stringify({
        number: formatPhoneWith55(recipient),
        type: 'image',
        url: formattedMedia,
        file: formattedMedia,
        caption: caption || '',
      }),
    });
    return res.ok;
  } catch (err) {
    console.error('[FlowProductDelivery] Erro ao enviar imagem QR no WhatsApp:', err);
    return false;
  }
}

async function sendWhatsAppButtonsDirect(
  serverUrl: string,
  instanceToken: string,
  recipient: string,
  text: string,
  choices: Array<{ label: string; id: string }>,
  footerText = 'Liberação Automática Imediata ⚡'
): Promise<boolean> {
  if (!instanceToken || !recipient || !text.trim()) return false;
  try {
    const base = cleanServerUrl(serverUrl);
    const formattedChoices = choices.slice(0, 3).map((c) => `${c.label}|${c.id}`);
    const payload: any = {
      number: formatPhoneWith55(recipient),
      type: 'button',
      text: text.trim(),
      choices: formattedChoices,
      footerText,
    };

    const res = await fetch(`${base}/send/menu`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        token: instanceToken,
        apikey: instanceToken,
      },
      body: JSON.stringify(payload),
    });

    if (res.ok) return true;

    // Fallback texto se a instância não aceitar botões nativos
    let fallbackMsg = `${text.trim()}\n\n`;
    choices.forEach((c, idx) => {
      fallbackMsg += `*${idx + 1}* - ${c.label}\n`;
    });
    if (footerText) {
      fallbackMsg += `\n_${footerText}_`;
    }
    return await sendWhatsAppTextDirect(serverUrl, instanceToken, recipient, fallbackMsg);
  } catch (err) {
    console.error('[FlowProductDelivery] Erro ao enviar menu de botões:', err);
    return false;
  }
}

export async function sendWhatsAppPixCopyButtonDirect({
  serverUrl,
  instanceToken,
  recipient,
  text,
  pixCode,
  buttonLabel = 'Copiar Código Pix',
  footerText,
}: {
  serverUrl: string;
  instanceToken: string;
  recipient: string;
  text: string;
  pixCode: string;
  buttonLabel?: string;
  footerText?: string;
}): Promise<boolean> {
  if (!instanceToken || !recipient || !pixCode) return false;
  try {
    const base = cleanServerUrl(serverUrl);
    const phone = formatPhoneWith55(recipient);
    const cleanLabel = (buttonLabel || 'Copiar Código Pix').trim();
    const cleanPix = pixCode.trim();

    // Na Uazapi, botões de cópia (estilo grupo/CTA) são enviados via /send/menu.
    // Enviamos tanto o formato de choices com 'copy:' quanto a lista 'buttons' [{ type: 'COPY' }]
    // para garantir 100% de compatibilidade em qualquer versão da API.
    const menuPayload: any = {
      number: phone,
      type: 'button',
      text: text.trim(),
      choices: [`${cleanLabel}|copy:${cleanPix}`],
      buttons: [
        {
          type: 'COPY',
          text: cleanLabel,
          id: cleanPix,
        },
      ],
    };

    if (footerText && footerText.trim()) {
      menuPayload.footerText = footerText.trim();
    }

    const res = await fetch(`${base}/send/menu`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        token: instanceToken,
        apikey: instanceToken,
      },
      body: JSON.stringify(menuPayload),
    });

    if (res.ok) {
      return true;
    }

    const errTxt = await res.text().catch(() => '');
    console.warn(
      `[sendWhatsAppPixCopyButton] /send/menu retornou ${res.status}: ${errTxt}. Enviando fallback de texto simples.`
    );
    return await sendWhatsAppTextDirect(serverUrl, instanceToken, recipient, cleanPix);
  } catch (err) {
    console.error('[sendWhatsAppPixCopyButton] Erro ao enviar botão de cópia Pix:', err);
    return await sendWhatsAppTextDirect(serverUrl, instanceToken, recipient, pixCode);
  }
}

async function resolveTokensForUser(userId: string): Promise<{
  pjToken: string;
  lkToken: string;
  deliveryCfg: FlowProductDeliveryConfig;
  generalSettings: Settings | null;
}> {
  let deliveryCfg: FlowProductDeliveryConfig = {};
  let generalSettings: Settings | null = null;
  const [delivSnap, cfgSnap] = await Promise.all([
    getDoc(doc(db, 'users', userId, 'settings', 'flow_product_delivery')).catch(() => null),
    getDoc(doc(db, 'users', userId, 'settings', 'config')).catch(() => null),
  ]);
  if (delivSnap && delivSnap.exists()) {
    deliveryCfg = delivSnap.data() as FlowProductDeliveryConfig;
  }
  if (cfgSnap && cfgSnap.exists()) {
    generalSettings = cfgSnap.data() as Settings;
  }
  const pjToken =
    deliveryCfg.pixApiToken?.trim() ||
    generalSettings?.pjpayToken?.trim() ||
    DEFAULT_PJPAY_TOKEN;
  const lkToken =
    deliveryCfg.pixApiToken?.trim() ||
    generalSettings?.linkinpayToken?.trim() ||
    DEFAULT_LINKINPAY_TOKEN;
  return { pjToken, lkToken, deliveryCfg, generalSettings };
}

/**
 * Gera a cobrança PIX na PJ Pay Gateway nos bastidores e envia o Menu Padrão perguntando:
 * "Qual forma de pagamento você gostaria? Como você gostaria de pagar?"
 * Com 2 botões: [📋 Pix Copia e Cola] e [📷 QR Code]
 */
export async function createAndSendFlowPixOrder(params: {
  userId: string;
  flowId: string;
  flowName?: string;
  nodeId: string;
  phoneNumber: string;
  recipientJid?: string;
  contactName?: string;
  serverUrl: string;
  instanceToken: string;
  productName: string;
  amountRaw?: number | string;
  description?: string;
  messageText?: string;
  sendCopyPasteSeparate?: boolean;
  sendCopyButton?: boolean;
  sendQrImage?: boolean;
  followUpSeconds?: number;
}): Promise<{ success: boolean; orderId?: string; error?: string }> {
  try {
    const productName = (params.productName || 'Produto Digital').trim();
    let amountInCents = parsePriceToCents(params.amountRaw);

    const { pjToken, lkToken, deliveryCfg } = await resolveTokensForUser(params.userId);

    // Se o preço não foi definido no bloco, tenta buscar do estoque daquele produto
    if (!params.amountRaw || String(params.amountRaw).trim() === '') {
      try {
        const stockSnap = await getDocs(
          query(
            collection(db, 'users', params.userId, 'flow_product_stock'),
            where('status', '==', 'available')
          )
        );
        const matchStock = stockSnap.docs
          .map((d) => d.data() as FlowProductStockItem)
          .find(
            (s) =>
              (s.productName || '').trim().toLowerCase() === productName.toLowerCase() &&
              s.defaultPrice
          );
        if (matchStock?.defaultPrice) {
          amountInCents = parsePriceToCents(matchStock.defaultPrice);
        }
      } catch {}
    }

    const orderId = `ford_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const webhookUrl = `https://www.pjcrm.site/api/flows/payment-webhook?orderId=${encodeURIComponent(orderId)}`;

    const gateway = deliveryCfg.pixGateway || 'pjpay';
    const payerName = (params.contactName || 'Cliente').trim() || 'Cliente';
    const pixDesc = (params.description || `Pedido ${productName}`).trim();

    let pixTxId = '';
    let pixCopyPaste = '';
    let pixQrBase64 = '';

    if (gateway === 'linkinpay') {
      const pixRes = await createLinkinPayPix({
        amountInCents,
        payerName,
        webhookUrl,
        apiToken: lkToken,
      });
      pixTxId = pixRes.id;
      pixCopyPaste = pixRes.qr_code;
      pixQrBase64 = pixRes.qr_code_base64;
    } else {
      const pixRes = await createPjPayPix({
        amountInCents,
        payerName,
        description: pixDesc,
        webhookUrl,
        apiToken: pjToken,
      });
      pixTxId = pixRes.id;
      pixCopyPaste = pixRes.qr_code;
      pixQrBase64 = pixRes.qr_code_base64;
    }

    const nowIso = new Date().toISOString();
    const followUpSecs = Math.min(Math.max(Number(params.followUpSeconds) || 8, 5), 30);

    const orderData: FlowOrder = {
      id: orderId,
      userId: params.userId,
      flowId: params.flowId,
      flowName: params.flowName || '',
      nodeId: params.nodeId,
      phoneNumber: params.phoneNumber,
      recipientJid: params.recipientJid || '',
      contactName: payerName,
      productName,
      amountInCents,
      pixTransactionId: pixTxId,
      pixCopyPaste,
      pixQrCodeBase64: pixQrBase64 || '',
      gateway,
      serverUrl: params.serverUrl,
      instanceToken: params.instanceToken,
      sendCopyButton: params.sendCopyButton !== false,
      status: 'pending',
      followUpSeconds: followUpSecs,
      lastActionAtMs: Date.now(),
      createdAt: nowIso,
    };

    await setDoc(doc(db, 'flow_orders', orderId), orderData);

    const recipient =
      params.recipientJid &&
      params.recipientJid.includes('@lid') &&
      (!params.phoneNumber || params.phoneNumber.includes('lid'))
        ? params.recipientJid
        : params.phoneNumber;

    const formattedValue = formatCentsToBrl(amountInCents);
    const firstName = payerName.split(' ')[0] || payerName;

    // Verificar se o texto customizado era o antigo texto padrão de envio direto; se for, usa o novo menu padrão!
    const isLegacyDirectText =
      params.messageText &&
      params.messageText.includes('realize o pagamento utilizando o código *PIX Copia e Cola* que vou enviar logo abaixo');

    const rawTemplate =
      params.messageText && params.messageText.trim() && !isLegacyDirectText
        ? params.messageText.trim()
        : DEFAULT_FLOW_PIX_BILLING_MESSAGE;

    const menuQuestionText = rawTemplate
      .replace(/\{cliente\}/gi, payerName)
      .replace(/\{nome\}/gi, payerName)
      .replace(/\{primeiro_nome\}/gi, firstName)
      .replace(/\{produto\}/gi, productName)
      .replace(/\{assinatura\}/gi, productName)
      .replace(/\{plano\}/gi, productName)
      .replace(/\{valor\}/gi, formattedValue)
      .replace(/\{telefone\}/gi, params.phoneNumber);

    // Envia sempre por padrão o Menu Interativo perguntando como a pessoa gostaria de pagar:
    // Botão 1: Pix Copia e Cola | Botão 2: QR Code
    await sendWhatsAppButtonsDirect(
      params.serverUrl,
      params.instanceToken,
      recipient,
      menuQuestionText,
      [
        { label: '📋 Pix Copia e Cola', id: `pix_choose_copypaste:${orderId}` },
        { label: '📷 QR Code', id: `pix_choose_qrcode:${orderId}` },
      ],
      `${productName} • ${formattedValue} ⚡`
    );

    return { success: true, orderId };
  } catch (err: any) {
    console.error('[createAndSendFlowPixOrder] Erro:', err);
    return { success: false, error: err?.message || 'Erro ao gerar PIX no fluxo' };
  }
}

/**
 * Trata os cliques nos botões interativos do Checkout PIX:
 * - "📋 Pix Copia e Cola" -> Envia SOMENTE o Copia e Cola, aguarda 7-8s, se não pagou manda botão perguntando se quer o QR Code ou "Já Paguei"
 * - "📷 QR Code" -> Envia SOMENTE o QR Code, aguarda 7-8s, se não pagou manda botão perguntando se quer o Copia e Cola ou "Já Paguei"
 * - "✅ Já Paguei" -> Consulta imediatamente GET /api/v1/payments/{id} na PJ Pay Gateway e entrega o produto se pago
 */
export async function handlePixInteractiveAction(params: {
  userId: string;
  phoneNumber: string;
  recipientJid?: string;
  serverUrl: string;
  instanceToken: string;
  session?: FlowContactSession | null;
  userText?: string;
  selectedButtonId?: string;
  selectedIndex?: number;
}): Promise<boolean> {
  const rawBtn = (params.selectedButtonId || '').trim();
  const rawText = (params.userText || '').trim();
  const cleanLower = rawText
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();

  // 1. Extrair actionType e orderId se veio de um botão com prefixo pix_
  let actionType: 'copypaste' | 'qrcode' | 'check_paid' | null = null;
  let targetOrderId = params.session?.pendingPixOrderId || '';

  if (rawBtn.startsWith('pix_')) {
    const [prefix, extractedOrderId] = rawBtn.split(':');
    if (extractedOrderId) targetOrderId = extractedOrderId;
    if (prefix === 'pix_choose_copypaste' || prefix === 'pix_send_copypaste') {
      actionType = 'copypaste';
    } else if (prefix === 'pix_choose_qrcode' || prefix === 'pix_send_qrcode') {
      actionType = 'qrcode';
    } else if (prefix === 'pix_check_paid') {
      actionType = 'check_paid';
    }
  }

  // 2. Se não veio pelo ID do botão, mas o cliente respondeu por texto ou clique com texto do botão
  if (!actionType) {
    if (
      cleanLower.includes('copia e cola') ||
      cleanLower === 'pix copia e cola' ||
      cleanLower === 'enviar copia e cola' ||
      cleanLower === 'chave pix' ||
      (cleanLower === '1' && Boolean(targetOrderId))
    ) {
      actionType = 'copypaste';
    } else if (
      cleanLower.includes('qr code') ||
      cleanLower.includes('qrcode') ||
      cleanLower === 'enviar qr code' ||
      (cleanLower === '2' && Boolean(targetOrderId))
    ) {
      actionType = 'qrcode';
    } else if (
      cleanLower.includes('ja paguei') ||
      cleanLower === 'paguei' ||
      cleanLower.includes('verificar pagamento') ||
      cleanLower.includes('confirmar pagamento')
    ) {
      actionType = 'check_paid';
    }
  }

  if (!actionType) {
    return false;
  }

  // 3. Localizar o pedido PIX pendente para este contato se targetOrderId não estava explícito
  let order: FlowOrder | null = null;
  if (targetOrderId) {
    const snap = await getDoc(doc(db, 'flow_orders', targetOrderId)).catch(() => null);
    if (snap && snap.exists()) {
      order = { ...(snap.data() as FlowOrder), id: snap.id };
    }
  }

  if (!order) {
    // Busca o pedido mais recente deste telefone para este userId
    try {
      const qSnap = await getDocs(
        query(
          collection(db, 'flow_orders'),
          where('userId', '==', params.userId),
          where('phoneNumber', '==', params.phoneNumber)
        )
      );
      if (!qSnap.empty) {
        const list = qSnap.docs.map((d) => ({ ...(d.data() as FlowOrder), id: d.id }));
        list.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
        order = list[0];
      }
    } catch {}
  }

  if (!order) {
    return false;
  }

  const orderRef = doc(db, 'flow_orders', order.id);
  const serverUrl = params.serverUrl || order.serverUrl || 'https://travelflow.uazapi.com';
  const instanceToken = params.instanceToken || order.instanceToken;
  const recipient =
    params.recipientJid &&
    params.recipientJid.includes('@lid') &&
    (!params.phoneNumber || params.phoneNumber.includes('lid'))
      ? params.recipientJid
      : order.recipientJid &&
        order.recipientJid.includes('@lid') &&
        (!order.phoneNumber || order.phoneNumber.includes('lid'))
      ? order.recipientJid
      : params.phoneNumber || order.phoneNumber;

  const formattedValue = formatCentsToBrl(order.amountInCents || 0);

  // Se o pedido já foi entregue anteriormente
  if (order.status === 'delivered') {
    await sendWhatsAppTextDirect(
      serverUrl,
      instanceToken,
      recipient,
      `✅ *Seu pagamento do produto ${order.productName} já foi confirmado e entregue!* Verifique as mensagens acima com seu login e senha.`
    );
    return true;
  }

  // Helper interno para checar se o pagamento já consta como "paid" na PJ Pay Gateway
  const checkIfOrderPaidNow = async (): Promise<boolean> => {
    try {
      const freshSnap = await getDoc(orderRef);
      if (freshSnap.exists() && (freshSnap.data() as FlowOrder).status === 'delivered') {
        return true;
      }
      const { pjToken, lkToken } = await resolveTokensForUser(order!.userId);
      if (order!.gateway === 'linkinpay') {
        const chk = await checkLinkinPayTransaction(order!.pixTransactionId, lkToken);
        return chk.paid;
      } else {
        const chk = await checkPjPayTransaction(order!.pixTransactionId, pjToken);
        return chk.paid;
      }
    } catch {
      return false;
    }
  };

  const sessionDocRef = doc(db, 'users', params.userId, 'flow_sessions', params.phoneNumber);

  // ================= OPÇÃO 1: CLIENTE ESCOLHEU QR CODE =================
  if (actionType === 'qrcode') {
    const actionTs = Date.now();
    await updateDoc(orderRef, { lastActionAtMs: actionTs }).catch(() => {});
    await setDoc(
      sessionDocRef,
      {
        status: 'waiting_user_input',
        pendingPixOrderId: order.id,
        executingUntilMs: 0,
        menuSentAtMs: actionTs,
        lastInteractionAt: new Date().toISOString(),
      },
      { merge: true }
    ).catch(() => {});

    // 1. Envia SOMENTE o QR Code (NÃO envia o Copia e Cola agora!)
    if (order.pixQrCodeBase64) {
      await sendWhatsAppMediaDirect(
        serverUrl,
        instanceToken,
        recipient,
        order.pixQrCodeBase64,
        `📷 *QR CODE PIX — ${order.productName} (${formattedValue})*\n\nAponte a câmera do aplicativo do seu banco para o QR Code acima para pagar.\n\n⚡ _Assim que o pagamento for aprovado, seu acesso (e-mail e senha) será enviado automaticamente aqui!_`
      );
    } else {
      await sendWhatsAppTextDirect(
        serverUrl,
        instanceToken,
        recipient,
        `📷 *QR Code gerado para ${order.productName} (${formattedValue})!*`
      );
    }

    // 2. Aguarda de 5 a 10 segundos (padrão 8 segundos) para ver se a pessoa já pagou
    const waitSeconds = Math.min(Math.max(Number(order.followUpSeconds) || 8, 5), 15);
    await new Promise((resolve) => setTimeout(resolve, waitSeconds * 1000));

    // 3. Verifica se a pessoa já pagou ou se já clicou em outro botão durante esses segundos
    const freshSnap = await getDoc(orderRef).catch(() => null);
    const freshOrder = freshSnap && freshSnap.exists() ? (freshSnap.data() as FlowOrder) : order;
    if (freshOrder.status === 'delivered') {
      return true;
    }

    const paidNow = await checkIfOrderPaidNow();
    if (paidNow) {
      await executeFlowOrderDelivery({
        orderId: order.id,
        pixTransactionId: order.pixTransactionId,
      });
      return true;
    }

    // Se o cliente não clicou em outro botão nesse intervalo e ainda não pagou,
    // envia o menu perguntando se ele quer receber o PIX Copia e Cola ou se já pagou!
    if (!freshOrder.lastActionAtMs || freshOrder.lastActionAtMs === actionTs) {
      await sendWhatsAppButtonsDirect(
        serverUrl,
        instanceToken,
        recipient,
        `💡 *Prefere pagar com Pix Copia e Cola ou já pagou?*\n\nSe estiver usando o mesmo celular e quiser que eu envie a chave *Pix Copia e Cola* para você copiar, ou se já concluiu o pagamento do QR Code, clique abaixo 👇`,
        [
          { label: '✅ Já Paguei', id: `pix_check_paid:${order.id}` },
          { label: '📋 Enviar Copia e Cola', id: `pix_send_copypaste:${order.id}` },
        ],
        `${order.productName} • Entrega Automática ⚡`
      );
    }

    return true;
  }

  // ================= OPÇÃO 2: CLIENTE ESCOLHEU PIX COPIA E COLA =================
  if (actionType === 'copypaste') {
    const actionTs = Date.now();
    await updateDoc(orderRef, { lastActionAtMs: actionTs }).catch(() => {});
    await setDoc(
      sessionDocRef,
      {
        status: 'waiting_user_input',
        pendingPixOrderId: order.id,
        executingUntilMs: 0,
        menuSentAtMs: actionTs,
        lastInteractionAt: new Date().toISOString(),
      },
      { merge: true }
    ).catch(() => {});

    // 1. Envia a mensagem do Copia e Cola com o BOTÃO NATIVO DE CÓPIA (estilo mensagem do grupo)
    const { deliveryCfg } = await resolveTokensForUser(order.userId);
    const orderWithCfg = order as any;
    const shouldSendCopyButton =
      orderWithCfg.sendCopyButton !== false && deliveryCfg.pixSendCopyButton !== false;

    if (shouldSendCopyButton && order.pixCopyPaste) {
      await sendWhatsAppTextDirect(
        serverUrl,
        instanceToken,
        recipient,
        `📋 *PIX COPIA E COLA — ${order.productName} (${formattedValue})*\n\nClique no botão abaixo para copiar a chave Pix ou cole no aplicativo do seu banco 👇`
      );

      await sendWhatsAppPixCopyButtonDirect({
        serverUrl,
        instanceToken,
        recipient,
        text: order.pixCopyPaste,
        pixCode: order.pixCopyPaste,
        buttonLabel: 'Copiar Código Pix',
      });
    } else {
      await sendWhatsAppTextDirect(
        serverUrl,
        instanceToken,
        recipient,
        `📋 *PIX COPIA E COLA — ${order.productName} (${formattedValue})*\n\nCopie a chave PIX abaixo e cole na opção *"Pix Copia e Cola"* do aplicativo do seu banco 👇`
      );

      if (order.pixCopyPaste) {
        await sendWhatsAppTextDirect(serverUrl, instanceToken, recipient, order.pixCopyPaste);
      }
    }

    // 2. Aguarda de 5 a 10 segundos (padrão 8 segundos) para ver se a pessoa já pagou
    const waitSeconds = Math.min(Math.max(Number(order.followUpSeconds) || 8, 5), 15);
    await new Promise((resolve) => setTimeout(resolve, waitSeconds * 1000));

    // 3. Verifica se a pessoa já pagou ou se já clicou em outro botão durante esses segundos
    const freshSnap = await getDoc(orderRef).catch(() => null);
    const freshOrder = freshSnap && freshSnap.exists() ? (freshSnap.data() as FlowOrder) : order;
    if (freshOrder.status === 'delivered') {
      return true;
    }

    const paidNow = await checkIfOrderPaidNow();
    if (paidNow) {
      await executeFlowOrderDelivery({
        orderId: order.id,
        pixTransactionId: order.pixTransactionId,
      });
      return true;
    }

    // Se o cliente não respondeu nada e ainda não pagou,
    // envia o menu perguntando se ele quer receber o QR Code para escanear ou confirmar que já pagou!
    if (!freshOrder.lastActionAtMs || freshOrder.lastActionAtMs === actionTs) {
      await sendWhatsAppButtonsDirect(
        serverUrl,
        instanceToken,
        recipient,
        `💡 *Prefere escanear o QR Code ou já realizou o pagamento?*\n\nSe quiser que eu envie a imagem do *QR Code* na tela, ou se você já concluiu o pagamento via Pix Copia e Cola, clique em uma opção abaixo 👇`,
        [
          { label: '✅ Já Paguei', id: `pix_check_paid:${order.id}` },
          { label: '📷 Enviar QR Code', id: `pix_send_qrcode:${order.id}` },
        ],
        `${order.productName} • Entrega Automática ⚡`
      );
    }

    return true;
  }

  // ================= OPÇÃO 3: CLIENTE CLICOU EM "JÁ PAGUEI" =================
  if (actionType === 'check_paid') {
    const paidNow = await checkIfOrderPaidNow();
    if (paidNow) {
      await executeFlowOrderDelivery({
        orderId: order.id,
        pixTransactionId: order.pixTransactionId,
      });
      return true;
    }

    // Ainda consta como pending na PJ Pay Gateway
    await sendWhatsAppButtonsDirect(
      serverUrl,
      instanceToken,
      recipient,
      `⏳ *Ainda estamos aguardando a confirmação do banco...*\n\nAssim que o seu PIX compensar, seu login e senha do *${order.productName}* serão enviados automaticamente aqui!\n\nSe você acabou de pagar, aguarde 5 segundinhos e clique em *"Já Paguei"* novamente, ou peça o código abaixo 👇`,
      [
        { label: '✅ Já Paguei', id: `pix_check_paid:${order.id}` },
        { label: '📋 Enviar Copia e Cola', id: `pix_send_copypaste:${order.id}` },
        { label: '📷 Enviar QR Code', id: `pix_send_qrcode:${order.id}` },
      ],
      `Verificação Automática PJ Pay ⚡`
    );
    return true;
  }

  return false;
}

/**
 * Executa a entrega automática do produto (login: e-mail e senha) assim que o pagamento PIX é confirmado
 */
export async function executeFlowOrderDelivery(params: {
  orderId: string;
  pixTransactionId?: string;
}): Promise<{
  success: boolean;
  alreadyDelivered?: boolean;
  outOfStock?: boolean;
  messageSent?: boolean;
  error?: string;
}> {
  const { orderId, pixTransactionId } = params;
  if (!orderId) return { success: false, error: 'orderId ausente' };

  try {
    const orderRef = doc(db, 'flow_orders', orderId);
    const orderSnap = await getDoc(orderRef);
    if (!orderSnap.exists()) {
      return { success: false, error: 'Pedido não encontrado' };
    }

    const order = orderSnap.data() as FlowOrder;
    if (order.status === 'delivered') {
      return { success: true, alreadyDelivered: true };
    }

    // Trava atômica anti-duplicidade
    const claimed = await claimOnce(`flow_order_delivery_${orderId}`);

    if (!claimed) {
      console.log(`[FlowProductDelivery] Pedido ${orderId} já reivindicado por outra execução.`);
      return { success: true, alreadyDelivered: true };
    }

    const nowIso = new Date().toISOString();
    const { deliveryCfg, generalSettings } = await resolveTokensForUser(order.userId);

    // 2. Buscar um login disponível no estoque para este produto
    const stockCol = collection(db, 'users', order.userId, 'flow_product_stock');
    const stockSnap = await getDocs(query(stockCol, where('status', '==', 'available')));

    const targetProductNorm = (order.productName || '').trim().toLowerCase();
    const availableItems = stockSnap.docs
      .map((d) => ({ ...(d.data() as FlowProductStockItem), id: d.id }))
      .filter((item) => (item.productName || '').trim().toLowerCase() === targetProductNorm);

    // Ordenar pelo mais antigo primeiro (FIFO)
    availableItems.sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || ''));

    const chosenStock = availableItems[0];

    const instanceToken =
      order.instanceToken?.trim() ||
      generalSettings?.webhookToken?.trim() ||
      generalSettings?.billingWebhookToken?.trim() ||
      '';
    const serverUrl = order.serverUrl || 'https://travelflow.uazapi.com';
    const recipient =
      order.recipientJid &&
      order.recipientJid.includes('@lid') &&
      (!order.phoneNumber || order.phoneNumber.includes('lid'))
        ? order.recipientJid
        : order.phoneNumber;

    // Caso não haja estoque disponível para o produto
    if (!chosenStock) {
      await updateDoc(orderRef, {
        status: 'out_of_stock',
        paidAt: nowIso,
      });

      const outMsg =
        (deliveryCfg.outOfStockMessage && deliveryCfg.outOfStockMessage.trim()) ||
        `✅ *PAGAMENTO CONFIRMADO!*\n\nOlá *${order.contactName || 'Cliente'}*, seu pagamento para *${order.productName}* foi aprovado com sucesso!\n\nNosso sistema já registrou seu pedido e em instantes enviaremos seus dados de acesso aqui no WhatsApp.`;

      await sendWhatsAppTextDirect(serverUrl, instanceToken, recipient, outMsg);
      return { success: false, outOfStock: true, error: 'Sem estoque disponível para o produto' };
    }

    // 3. Atualizar item do estoque (suporta uso único ou múltiplos acessos/telas)
    const maxSlots = Math.max(1, Number(chosenStock.maxSlots) || 1);
    const nextUsedSlots = (Number(chosenStock.usedSlots) || 0) + 1;
    const isNowExhausted = nextUsedSlots >= maxSlots;

    await updateDoc(doc(db, 'users', order.userId, 'flow_product_stock', chosenStock.id), {
      usedSlots: nextUsedSlots,
      status: isNowExhausted ? 'delivered' : 'available',
      deliveredToPhone: order.phoneNumber,
      deliveredToName: order.contactName || 'Cliente',
      deliveredAt: nowIso,
      updatedAt: nowIso,
    });

    // 4. Calcular data de vencimento (+30 dias)
    const dueDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    const dueDateFormatted = `${String(dueDate.getDate()).padStart(2, '0')}/${String(dueDate.getMonth() + 1).padStart(2, '0')}/${dueDate.getFullYear()}`;
    const formattedValue = formatCentsToBrl(order.amountInCents);

    // 5. Selecionar a Mensagem de Entrega (Individual do Produto -> Geral -> Padrão)
    let template = '';
    const productMessagesMap = deliveryCfg.productMessages || {};
    for (const [prodKey, msgVal] of Object.entries(productMessagesMap)) {
      if (prodKey.trim().toLowerCase() === targetProductNorm && msgVal && msgVal.trim()) {
        template = msgVal.trim();
        break;
      }
    }

    // Fallback para customDeliveryMessages do CRM se existir
    if (!template && generalSettings?.customDeliveryMessages) {
      for (const [prodKey, msgVal] of Object.entries(generalSettings.customDeliveryMessages)) {
        if (prodKey.trim().toLowerCase() === targetProductNorm && msgVal && msgVal.trim()) {
          template = msgVal.trim();
          break;
        }
      }
    }

    if (!template) {
      template =
        (deliveryCfg.generalDeliveryMessage && deliveryCfg.generalDeliveryMessage.trim()) ||
        (generalSettings?.deliveryMessage && generalSettings.deliveryMessage.trim()) ||
        DEFAULT_GENERAL_PRODUCT_DELIVERY_MESSAGE;
    }

    const customerName = (order.contactName || 'Cliente').trim() || 'Cliente';
    const firstName = customerName.split(' ')[0] || customerName;

    const finalMessage = template
      .replace(/\{cliente\}/gi, customerName)
      .replace(/\{nome\}/gi, customerName)
      .replace(/\{primeiro_nome\}/gi, firstName)
      .replace(/\{produto\}/gi, chosenStock.productName || order.productName)
      .replace(/\{assinatura\}/gi, chosenStock.productName || order.productName)
      .replace(/\{nome_assinatura\}/gi, chosenStock.productName || order.productName)
      .replace(/\{plano\}/gi, chosenStock.productName || order.productName)
      .replace(/\{email\}/gi, chosenStock.email || '')
      .replace(/\{e-mail\}/gi, chosenStock.email || '')
      .replace(/\{login\}/gi, chosenStock.email || '')
      .replace(/\{senha\}/gi, chosenStock.password || '')
      .replace(/\{password\}/gi, chosenStock.password || '')
      .replace(/\{tela\}/gi, chosenStock.screen || '')
      .replace(/\{pin_tela\}/gi, chosenStock.pinScreen || '')
      .replace(/\{pin\}/gi, chosenStock.pinScreen || '')
      .replace(/\{link_de_acesso\}/gi, chosenStock.accessLink || '')
      .replace(/\{link\}/gi, chosenStock.accessLink || '')
      .replace(/\{valor\}/gi, formattedValue)
      .replace(/\{vencimento\}/gi, dueDateFormatted)
      .replace(/\{data_vencimento\}/gi, dueDateFormatted)
      .replace(/\{telefone\}/gi, order.phoneNumber || '')
      .replace(/\{status\}/gi, 'Ativo');

    // 6. Enviar a mensagem de entrega no WhatsApp
    const messageSent = await sendWhatsAppTextDirect(
      serverUrl,
      instanceToken,
      recipient,
      finalMessage
    );

    // 7. Cadastrar / Atualizar o cliente automaticamente no CRM (se habilitado, padrão true)
    if (deliveryCfg.registerClientInCrm !== false) {
      try {
        await addDoc(collection(db, 'users', order.userId, 'clients'), {
          name: customerName,
          phone: order.phoneNumber,
          email: [chosenStock.email],
          password: chosenStock.password,
          screen: chosenStock.screen || '',
          pinScreen: chosenStock.pinScreen || '',
          accessLink: chosenStock.accessLink || '',
          subscription: chosenStock.productName || order.productName,
          status: 'Ativo',
          paymentMethod: 'PIX',
          amountPaid: (order.amountInCents / 100).toFixed(2).replace('.', ','),
          dueDate,
          createdAt: new Date(),
          firstCreatedAt: new Date(),
          notes: `Compra automática via Fluxo (${order.flowName || 'Bot'})`,
          userId: order.userId,
        });
      } catch (crmErr) {
        console.error('[FlowProductDelivery] Erro ao registrar cliente no CRM:', crmErr);
      }
    }

    // 8. Marcar pedido como entregue e concluir a sessão do fluxo
    await updateDoc(orderRef, {
      status: 'delivered',
      deliveredStockId: chosenStock.id,
      deliveredEmail: chosenStock.email,
      deliveredPassword: chosenStock.password,
      paidAt: nowIso,
      deliveredAt: nowIso,
    });

    if (order.phoneNumber) {
      await setDoc(
        doc(db, 'users', order.userId, 'flow_sessions', order.phoneNumber),
        {
          status: 'completed',
          pendingPixOrderId: '',
          executingUntilMs: 0,
          lastInteractionAt: nowIso,
        },
        { merge: true }
      ).catch(() => {});
    }

    return {
      success: true,
      messageSent,
    };
  } catch (err: any) {
    console.error('[executeFlowOrderDelivery] Erro:', err);
    return { success: false, error: err?.message || 'Erro ao entregar produto' };
  }
}

/**
 * Verifica pedidos pendentes do Fluxo em lote na PJ Pay Gateway / LinkinPay (chamado pelo Cron e pelo painel)
 */
export async function verifyPendingFlowOrders(targetUserId?: string): Promise<{
  checked: number;
  delivered: number;
}> {
  let checked = 0;
  let delivered = 0;
  try {
    const ordersCol = collection(db, 'flow_orders');
    const q = targetUserId
      ? query(ordersCol, where('userId', '==', targetUserId), where('status', '==', 'pending'))
      : query(ordersCol, where('status', '==', 'pending'));

    const snap = await getDocs(q);
    if (snap.empty) return { checked: 0, delivered: 0 };

    const cutoffMs = Date.now() - 48 * 60 * 60 * 1000;
    const recentOrders = snap.docs
      .map((d) => ({ ...(d.data() as FlowOrder), id: d.id }))
      .filter((o) => {
        const createdMs = o.createdAt ? Date.parse(o.createdAt) : Date.now();
        return !isNaN(createdMs) && createdMs >= cutoffMs && Boolean(o.pixTransactionId);
      });

    if (recentOrders.length === 0) return { checked: 0, delivered: 0 };

    const byUser = new Map<string, FlowOrder[]>();
    for (const ord of recentOrders) {
      const list = byUser.get(ord.userId) || [];
      list.push(ord);
      byUser.set(ord.userId, list);
    }

    for (const [uid, orders] of byUser.entries()) {
      const { pjToken, lkToken } = await resolveTokensForUser(uid);
      const batchMap = await fetchRecentPjPayPayments(pjToken);

      for (const ord of orders) {
        checked++;
        const txId = ord.pixTransactionId;
        let isPaid = false;

        if (batchMap.has(txId) && batchMap.get(txId)!.paid) {
          isPaid = true;
        } else {
          try {
            if (ord.gateway === 'linkinpay') {
              const res = await checkLinkinPayTransaction(txId, lkToken);
              isPaid = res.paid;
            } else {
              const res = await checkPjPayTransaction(txId, pjToken);
              isPaid = res.paid;
            }
          } catch {}
        }

        if (isPaid) {
          const res = await executeFlowOrderDelivery({
            orderId: ord.id,
            pixTransactionId: txId,
          });
          if (res.success && !res.alreadyDelivered) {
            delivered++;
          }
        }
      }
    }
  } catch (err) {
    console.error('[verifyPendingFlowOrders] Erro:', err);
  }
  return { checked, delivered };
}
