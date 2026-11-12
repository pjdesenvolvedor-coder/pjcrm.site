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
import { createPjPayPix, checkPjPayTransaction, fetchRecentPjPayPayments, DEFAULT_PJPAY_TOKEN } from './pjpay';
import { createLinkinPayPix, checkLinkinPayTransaction, DEFAULT_LINKINPAY_TOKEN } from './linkinpay';
import { claimOnce } from './firestore-claim';
import type {
  FlowOrder,
  FlowProductDeliveryConfig,
  FlowProductStockItem,
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

export const DEFAULT_FLOW_PIX_BILLING_MESSAGE = `💠 *PAGAMENTO VIA PIX GERADO!*

Olá *{primeiro_nome}*, para receber seu acesso imediato ao *{produto}* no valor de *{valor}*, realize o pagamento utilizando o código *PIX Copia e Cola* que vou enviar logo abaixo 👇

⚡ _Assim que o pagamento for confirmado, seu login e senha serão enviados automaticamente aqui mesmo no WhatsApp!_`;

export function parsePriceToCents(raw?: number | string): number {
  if (raw === undefined || raw === null || raw === '') return 1990;
  if (typeof raw === 'number') {
    if (raw <= 0) return 1990;
    // Se já parece estar em reais (ex: 19.90 ou 20), converte para centavos
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
    const formattedMedia = mediaUrlOrBase64.startsWith('data:') || mediaUrlOrBase64.startsWith('http')
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

/**
 * Gera uma cobrança PIX dentro do Fluxo e envia os dados de pagamento para o cliente no WhatsApp
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
  sendQrImage?: boolean;
}): Promise<{ success: boolean; orderId?: string; error?: string }> {
  try {
    const productName = (params.productName || 'Produto Digital').trim();
    let amountInCents = parsePriceToCents(params.amountRaw);

    // Carregar configurações de Entrega de Produtos e Configurações Gerais
    let deliveryCfg: FlowProductDeliveryConfig = {};
    let generalSettings: Settings | null = null;

    const [delivSnap, cfgSnap] = await Promise.all([
      getDoc(doc(db, 'users', params.userId, 'settings', 'flow_product_delivery')).catch(() => null),
      getDoc(doc(db, 'users', params.userId, 'settings', 'config')).catch(() => null),
    ]);

    if (delivSnap && delivSnap.exists()) {
      deliveryCfg = delivSnap.data() as FlowProductDeliveryConfig;
    }
    if (cfgSnap && cfgSnap.exists()) {
      generalSettings = cfgSnap.data() as Settings;
    }

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
          .find((s) => (s.productName || '').trim().toLowerCase() === productName.toLowerCase() && s.defaultPrice);
        if (matchStock?.defaultPrice) {
          amountInCents = parsePriceToCents(matchStock.defaultPrice);
        }
      } catch {}
    }

    const orderId = `ford_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const webhookUrl = `https://www.pjcrm.site/api/flows/payment-webhook?orderId=${encodeURIComponent(orderId)}`;

    const gateway = deliveryCfg.pixGateway || 'pjpay';
    const pjToken =
      deliveryCfg.pixApiToken?.trim() ||
      generalSettings?.pjpayToken?.trim() ||
      DEFAULT_PJPAY_TOKEN;
    const lkToken =
      deliveryCfg.pixApiToken?.trim() ||
      generalSettings?.linkinpayToken?.trim() ||
      DEFAULT_LINKINPAY_TOKEN;

    const payerName = (params.contactName || 'Cliente').trim() || 'Cliente';
    const pixDesc = (params.description || ` Compra ${productName}`).trim();

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
      status: 'pending',
      createdAt: nowIso,
    };

    await setDoc(doc(db, 'flow_orders', orderId), orderData);

    const recipient =
      params.recipientJid && params.recipientJid.includes('@lid') && (!params.phoneNumber || params.phoneNumber.includes('lid'))
        ? params.recipientJid
        : params.phoneNumber;

    const formattedValue = formatCentsToBrl(amountInCents);
    const firstName = payerName.split(' ')[0] || payerName;

    const rawTemplate =
      (params.messageText && params.messageText.trim()) ||
      (deliveryCfg.defaultPixBillingMessage && deliveryCfg.defaultPixBillingMessage.trim()) ||
      DEFAULT_FLOW_PIX_BILLING_MESSAGE;

    const formattedBillingText = rawTemplate
      .replace(/\{cliente\}/gi, payerName)
      .replace(/\{nome\}/gi, payerName)
      .replace(/\{primeiro_nome\}/gi, firstName)
      .replace(/\{produto\}/gi, productName)
      .replace(/\{assinatura\}/gi, productName)
      .replace(/\{plano\}/gi, productName)
      .replace(/\{valor\}/gi, formattedValue)
      .replace(/\{telefone\}/gi, params.phoneNumber)
      .replace(/\{pix_copia_e_cola\}/gi, pixCopyPaste)
      .replace(/\{pix\}/gi, pixCopyPaste);

    // 1. Envia a mensagem explicativa do PIX
    await sendWhatsAppTextDirect(params.serverUrl, params.instanceToken, recipient, formattedBillingText);

    // 2. Se configurado para enviar imagem do QR Code
    if (params.sendQrImage && pixQrBase64) {
      await sendWhatsAppMediaDirect(
        params.serverUrl,
        params.instanceToken,
        recipient,
        pixQrBase64,
        `QR Code PIX - ${productName} (${formattedValue})`
      );
    }

    // 3. Envia o código PIX Copia e Cola separado (padrão ativado) para o cliente copiar com 1 toque
    const shouldSendSeparate = params.sendCopyPasteSeparate !== false;
    if (shouldSendSeparate && pixCopyPaste && !rawTemplate.includes('{pix_copia_e_cola}') && !rawTemplate.includes('{pix}')) {
      await sendWhatsAppTextDirect(params.serverUrl, params.instanceToken, recipient, pixCopyPaste);
    }

    return { success: true, orderId };
  } catch (err: any) {
    console.error('[createAndSendFlowPixOrder] Erro:', err);
    return { success: false, error: err?.message || 'Erro ao gerar PIX no fluxo' };
  }
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
    const claimed = await claimOnce(`flow_order_delivery_${orderId}`, true);

    if (!claimed) {
      console.log(`[FlowProductDelivery] Pedido ${orderId} já reivindicado por outra execução.`);
      return { success: true, alreadyDelivered: true };
    }

    const nowIso = new Date().toISOString();

    // 1. Buscar configurações de Entrega de Produtos e Configurações Gerais
    const [delivSnap, cfgSnap] = await Promise.all([
      getDoc(doc(db, 'users', order.userId, 'settings', 'flow_product_delivery')).catch(() => null),
      getDoc(doc(db, 'users', order.userId, 'settings', 'config')).catch(() => null),
    ]);

    const deliveryCfg: FlowProductDeliveryConfig =
      delivSnap && delivSnap.exists() ? (delivSnap.data() as FlowProductDeliveryConfig) : {};
    const generalSettings: Settings | null =
      cfgSnap && cfgSnap.exists() ? (cfgSnap.data() as Settings) : null;

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
      order.recipientJid && order.recipientJid.includes('@lid') && (!order.phoneNumber || order.phoneNumber.includes('lid'))
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

    // 8. Marcar pedido como entregue
    await updateDoc(orderRef, {
      status: 'delivered',
      deliveredStockId: chosenStock.id,
      deliveredEmail: chosenStock.email,
      deliveredPassword: chosenStock.password,
      paidAt: nowIso,
      deliveredAt: nowIso,
    });

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

    // Agrupar por usuário para buscar o token correto
    const byUser = new Map<string, FlowOrder[]>();
    for (const ord of recentOrders) {
      const list = byUser.get(ord.userId) || [];
      list.push(ord);
      byUser.set(ord.userId, list);
    }

    for (const [uid, orders] of byUser.entries()) {
      let pjToken = DEFAULT_PJPAY_TOKEN;
      let lkToken = DEFAULT_LINKINPAY_TOKEN;
      try {
        const [delivSnap, cfgSnap] = await Promise.all([
          getDoc(doc(db, 'users', uid, 'settings', 'flow_product_delivery')),
          getDoc(doc(db, 'users', uid, 'settings', 'config')),
        ]);
        const dCfg = delivSnap.exists() ? (delivSnap.data() as FlowProductDeliveryConfig) : {};
        const gCfg = cfgSnap.exists() ? (cfgSnap.data() as Settings) : ({} as Settings);
        pjToken = dCfg.pixApiToken?.trim() || gCfg.pjpayToken?.trim() || DEFAULT_PJPAY_TOKEN;
        lkToken = dCfg.pixApiToken?.trim() || gCfg.linkinpayToken?.trim() || DEFAULT_LINKINPAY_TOKEN;
      } catch {}

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
              // Endpoint oficial: GET https://www.pjgateway.com/api/v1/payments/{id}
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
