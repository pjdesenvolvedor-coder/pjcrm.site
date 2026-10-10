import { NextRequest, NextResponse } from 'next/server';
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore, collection, addDoc, getDoc, doc, serverTimestamp, Timestamp } from 'firebase/firestore';
import { firebaseConfig } from '@/firebase/config';
import { format } from 'date-fns';

export const dynamic = 'force-dynamic';

// Initialize Firebase App for the server route
const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
const db = getFirestore(app);

// Helper to resolve custom delivery message templates with partial case-insensitive matching
function getCustomDeliveryMessage(
  customMessages: Record<string, string> | undefined,
  subscriptionName: string | undefined,
  defaultMessage: string | undefined
): string | undefined {
  if (!customMessages || !subscriptionName) return defaultMessage;
  const subNameLower = subscriptionName.trim().toLowerCase();
  
  // 1. Exact match (case-insensitive)
  for (const [key, msg] of Object.entries(customMessages)) {
    if (key.trim().toLowerCase() === subNameLower) {
      return msg;
    }
  }
  
  // 2. Partial match (longest key matching wins)
  let bestMatchKey = '';
  let bestMatchMsg: string | undefined = undefined;
  
  for (const [key, msg] of Object.entries(customMessages)) {
    const keyLower = key.trim().toLowerCase();
    if (keyLower && (subNameLower.includes(keyLower) || keyLower.includes(subNameLower))) {
      if (keyLower.length > bestMatchKey.length) {
        bestMatchKey = keyLower;
        bestMatchMsg = msg;
      }
    }
  }
  
  return bestMatchMsg !== undefined ? bestMatchMsg : defaultMessage;
}

interface WebhookLog {
  id: string;
  timestamp: string;
  method: string;
  headers: Record<string, string>;
  body: unknown;
  ip: string;
}

// In-memory store separated by userId
const webhookLogsByUser: Record<string, Array<WebhookLog>> = {};
const clientsByUser: Record<string, Set<ReadableStreamDefaultController>> = {};

function broadcast(userId: string, data: string) {
  const clients = clientsByUser[userId];
  if (!clients) return;

  for (const controller of clients) {
    try {
      controller.enqueue(`data: ${data}\n\n`);
    } catch {
      clients.delete(controller);
    }
  }
}

function extractPhoneString(val: any): string {
  if (!val) return '';
  if (typeof val === 'string' || typeof val === 'number') {
    return String(val).replace(/\D/g, '');
  }
  if (typeof val === 'object') {
    const ddd = val.ddd || val.area_code || val.code || val.ddi || '';
    const num = val.number || val.phone || val.numero || val.mobile || val.phone_number || '';
    const combined = `${ddd}${num}`;
    const cleaned = combined.replace(/\D/g, '');
    if (cleaned) return cleaned;
    for (const subVal of Object.values(val)) {
      if (typeof subVal === 'string' || typeof subVal === 'number') {
        const c = String(subVal).replace(/\D/g, '');
        if (c.length >= 8) return c;
      }
    }
  }
  return '';
}

function extractWebhookData(body: unknown) {
  if (!body || typeof body !== 'object') return null;
  const b = body as Record<string, any>;

  // Se for qualquer payload de 2-fatores / código de verificação / ADM, NUNCA extrair como cliente / produto
  const bodyString = JSON.stringify(b).toLowerCase();
  if (
    bodyString.includes('2fatores') ||
    bodyString.includes('codigofa') ||
    bodyString.includes('codigo_fa') ||
    bodyString.includes('código de verificação') ||
    bodyString.includes('codigo de verificacao') ||
    bodyString.includes('painel adm') ||
    bodyString.includes('código de segurança') ||
    bodyString.includes('codigo de seguranca')
  ) {
    return null;
  }

  // Case-insensitive key lookup helper (checks root level and common sub-objects)
  const getVal = (keys: string[]): any => {
    for (const k of keys) {
      for (const bk of Object.keys(b)) {
        if (bk.toLowerCase() === k.toLowerCase()) {
          const val = b[bk];
          if (val !== null && val !== undefined) return val;
        }
      }
    }

    const subObjects = ['customer', 'buyer', 'data', 'client', 'usuario', 'user'];
    for (const sub of subObjects) {
      for (const bk of Object.keys(b)) {
        if (bk.toLowerCase() === sub) {
          const subObj = b[bk];
          if (subObj && typeof subObj === 'object') {
            for (const k of keys) {
              for (const sk of Object.keys(subObj)) {
                if (sk.toLowerCase() === k.toLowerCase()) {
                  const val = subObj[sk];
                  if (val !== null && val !== undefined) return val;
                }
              }
            }
          }
        }
      }
    }
    return null;
  };

  const name = getVal(['nome', 'name', 'cliente', 'customer_name', 'buyer_name', 'first_name']);
  const rawPhone = getVal(['telefone', 'phone', 'whatsapp', 'celular', 'buyer_phone', 'mobile', 'phone_number', 'full_phone', 'contact_phone', 'customer_phone', 'number', 'numero']);
  const phone = extractPhoneString(rawPhone);

  if (!phone) return null;

  return {
    name: name ? String(name).trim() : 'Cliente via Webhook',
    phone: phone,
    product: getVal(['produto', 'product', 'item', 'product_name', 'nome_produto']) || 'Produto Webhook',
    value: getVal(['valor', 'value', 'price', 'amount', 'valor_pago']) || '0,00',
    email: getVal(['email', 'emailConta', 'email_conta', 'buyer_email', 'customer_email']),
    password: getVal(['senha', 'senhaConta', 'senha_conta', 'password', 'senha_acesso']),
    screen: getVal(['tela', 'perfil', 'screen', 'profile', 'perfil_tela']),
    pinScreen: getVal(['senhaPerfil', 'senha_perfil', 'screen_password', 'pin', 'pin_tela']),
  };
}

// POST — receives the webhook for a specific user
export async function POST(req: NextRequest, { params }: { params: Promise<{ userId: string }> }) {
  const { userId } = await params;
  if (!userId) return NextResponse.json({ error: 'Missing userId' }, { status: 400 });

  let body: unknown;
  const contentType = req.headers.get('content-type') || '';

  try {
    if (contentType.includes('application/json')) {
      body = await req.json();
    } else if (contentType.includes('application/x-www-form-urlencoded')) {
      const text = await req.text();
      body = Object.fromEntries(new URLSearchParams(text));
    } else {
      body = await req.text();
    }
  } catch {
    body = null;
  }

  const headers: Record<string, string> = {};
  req.headers.forEach((value, key) => {
    if (!['cookie', 'authorization'].includes(key.toLowerCase())) {
      headers[key] = value;
    }
  });

  const entry = {
    id: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    method: req.method,
    headers,
    body,
    ip: req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || 'unknown',
  };

  if (!webhookLogsByUser[userId]) {
    webhookLogsByUser[userId] = [];
  }

  // Identificação inteligente se o payload é de 2FA / Código de Verificação
  const bodyString = body && typeof body === 'object' ? JSON.stringify(body).toLowerCase() : String(body || '').toLowerCase();
  const is2FA = bodyString.includes('2fatores') ||
                bodyString.includes('codigofa') ||
                bodyString.includes('codigo_fa') ||
                bodyString.includes('código de verificação') ||
                bodyString.includes('codigo de verificacao') ||
                bodyString.includes('painel adm') ||
                bodyString.includes('código de segurança') ||
                bodyString.includes('codigo de seguranca');

  if (is2FA) {
    try {
      const b = (body && typeof body === 'object' ? body : {}) as any;
      const rawCode = b.codigofa || b.codigoFa || b.codigo_fa || b.codigo || b.Codigo || b.code || b.Code || b.pin || b.otp;
      const rawPhone = b.NumeroCliente || b.numeroCliente || b.numero_cliente || b.telefone || b.Telefone || b.phone || b.Phone || b.number || b.Number || b.numero || b.Numero;
      const rawName = b.nome || b.Nome || b.name || b.Name || 'Jivago';
      const rawMessage = b.mensagem || b.Mensagem || b.texto || b.Texto || b.text || b.Text;

      let formattedPhone = extractPhoneString(rawPhone);
      if (!formattedPhone && typeof body === 'string') {
        const match = (body as string).match(/(?:55)?\d{10,11}/);
        if (match) formattedPhone = extractPhoneString(match[0]);
      }
      const cleanPhone = formattedPhone ? (formattedPhone.startsWith('55') ? formattedPhone : `55${formattedPhone}`) : '';

      // Buscar configurações de 2FA e gerais do usuário no Firestore
      const settings2faDoc = await getDoc(doc(db, 'users', userId, 'settings', '2fatores'));
      const configDoc = await getDoc(doc(db, 'users', userId, 'settings', 'config'));

      const settings2fa = settings2faDoc.exists() ? settings2faDoc.data() : {};
      const config = configDoc.exists() ? configDoc.data() : {};

      // Resolver o token ativo da UAZAPI
      const candidateTokens: string[] = [];
      if (config.billingWebhookToken) candidateTokens.push(config.billingWebhookToken);
      if (config.webhookToken && !candidateTokens.includes(config.webhookToken)) candidateTokens.push(config.webhookToken);
      if (settings2fa.billingWebhookToken && !candidateTokens.includes(settings2fa.billingWebhookToken)) candidateTokens.push(settings2fa.billingWebhookToken);
      if (settings2fa.webhookToken && !candidateTokens.includes(settings2fa.webhookToken)) candidateTokens.push(settings2fa.webhookToken);

      // Garante que apenas os tokens configurados pelo próprio usuário sejam utilizados

      // Mensagem: Prioridade total para o modelo personalizado salvo no CRM
      const customTemplate = settings2fa?.messageTemplate?.trim();
      const defaultTemplate = `Ola,\nSeu codigo de acesso para o Aplicativo PJ Assinaturas;\n\nCodigo: {codigo}`;
      const templateToUse = customTemplate || (rawMessage && !rawMessage.includes('PJ CONTAS - CÓDIGO DE VERIFICAÇÃO') ? String(rawMessage).trim() : defaultTemplate);

      const messageToSend = templateToUse
        .replace(/{codigo}/gi, String(rawCode || 'N/A'))
        .replace(/{code}/gi, String(rawCode || 'N/A'))
        .replace(/{pin}/gi, String(rawCode || 'N/A'))
        .replace(/{otp}/gi, String(rawCode || 'N/A'))
        .replace(/{nome}/gi, String(rawName || 'Cliente'))
        .replace(/{cliente}/gi, String(rawName || 'Cliente'))
        .replace(/{name}/gi, String(rawName || 'Cliente'))
        .replace(/{numero}/gi, cleanPhone || String(rawPhone || 'N/A'))
        .replace(/{telefone}/gi, cleanPhone || String(rawPhone || 'N/A'))
        .replace(/{phone}/gi, cleanPhone || String(rawPhone || 'N/A'));

      let isSuccess = false;
      let uazapiStatus = 0;
      let errorDetail = '';
      let usedToken = '';

      if (cleanPhone && candidateTokens.length > 0) {
        for (const token of candidateTokens) {
          try {
            const uazapiRes = await fetch('https://travelflow.uazapi.com/send/text', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'token': token,
                'apikey': token,
              },
              body: JSON.stringify({
                number: cleanPhone,
                text: messageToSend,
              }),
            });

            uazapiStatus = uazapiRes.status;
            if (uazapiRes.ok) {
              isSuccess = true;
              usedToken = token;
              errorDetail = '';
              console.log(`[webhook-receiver] 2FA enviado com sucesso para ${cleanPhone} via UAZAPI`);
              break;
            } else {
              const errText = await uazapiRes.text().catch(() => '');
              errorDetail = `Token ${token.slice(0, 8)}... (${uazapiRes.status}): ${errText}`;
              console.warn(`[webhook-receiver] 2FA falhou no token ${token.slice(0, 8)}:`, errText);
            }
          } catch (fetchErr: any) {
            errorDetail = fetchErr?.message || 'Erro ao conectar com UAZAPI';
          }
        }
      } else {
        if (!cleanPhone) errorDetail = 'Telefone não identificado no payload 2FA';
        else if (candidateTokens.length === 0) errorDetail = 'Nenhum token WhatsApp UAZAPI encontrado';
      }

      // Registrar log de 2FA no Firestore
      const logData = {
        rawPhone: String(rawPhone || 'N/A'),
        formattedPhone: cleanPhone || 'N/A',
        code: String(rawCode || 'N/A'),
        message: messageToSend,
        status: isSuccess ? 'Enviado' : (cleanPhone ? 'Erro' : 'Recebido'),
        uazapiStatus,
        errorDetail,
        usedToken: usedToken || null,
        source: 'webhook-receiver',
        timestampMs: Date.now(),
      };

      await addDoc(collection(db, 'two_factor_logs'), logData).catch(() => {});
      await addDoc(collection(db, 'users', userId, 'two_factor_logs'), logData).catch(() => {});

      webhookLogsByUser[userId].unshift(entry);
      if (webhookLogsByUser[userId].length > 100) webhookLogsByUser[userId].pop();
      broadcast(userId, JSON.stringify(entry));

      return NextResponse.json({
        received: true,
        type: '2fatores',
        sent: isSuccess,
        phone: cleanPhone,
        status: isSuccess ? 'Enviado' : (cleanPhone ? 'Erro' : 'Recebido'),
        error: errorDetail || null,
      }, { status: 200 });

    } catch (e: any) {
      console.error('Erro ao processar 2FA no webhook-receiver:', e);
      return NextResponse.json({ error: e.message }, { status: 500 });
    }
  }

  // Processamento inteligente do payload para adicionar cliente
  const webhookData = extractWebhookData(body);
  if (webhookData) {
    try {
      const dueDate = new Date();
      dueDate.setMonth(dueDate.getMonth() + 1);

      const clientData: any = {
        userId: userId,
        name: webhookData.name,
        phone: webhookData.phone,
        subscription: webhookData.product,
        amountPaid: String(webhookData.value),
        email: webhookData.email ? [String(webhookData.email).trim()] : [],
        password: webhookData.password ? String(webhookData.password).trim() : null,
        screen: (() => {
          const raw = webhookData.screen;
          if (!raw) return null;
          const str = String(raw).trim();
          const match = str.match(/\d+/);
          return match ? match[0] : str;
        })(),
        pinScreen: webhookData.pinScreen ? String(webhookData.pinScreen).trim() : null,
        accessLink: null,
        deliveryMethod: 'credentials',
        paymentMethod: 'PIX',
        status: 'Ativo',
        needsSupport: false,
        createdAt: new Date(),
        dueDate: Timestamp.fromDate(dueDate),
        upsellSent: false,
        sentUpsellIds: [],
        sentRemarketingIds: [],
        quantity: 1,
        clientType: null,
        agentName: 'Sistema (Webhook)',
      };

      await addDoc(collection(db, 'users', userId, 'clients'), clientData);
      console.log('Cliente adicionado com sucesso via Webhook');

      // Fetch user settings to trigger automations (Delivery message & n8n webhook)
      const settingsDocRef = doc(db, 'users', userId, 'settings', 'config');
      const settingsSnap = await getDoc(settingsDocRef);
      
      if (settingsSnap.exists()) {
        const settings = settingsSnap.data();
        const deliveryMethod = clientData.deliveryMethod || 'credentials';
        
        const isDeliveryActive = deliveryMethod === 'link'
            ? (settings.isDeliveryLinkAutomationActive !== false)
            : (settings.isDeliveryAutomationActive !== false);
            
        const subName = clientData.subscription || '';
        const customTemplate = deliveryMethod === 'link'
            ? getCustomDeliveryMessage(settings.customDeliveryLinkMessages, subName, settings.deliveryLinkMessage)
            : getCustomDeliveryMessage(settings.customDeliveryMessages, subName, settings.deliveryMessage);

        const defaultTemplate = deliveryMethod === 'link'
            ? "Olá {cliente}! Segue o link de acesso da sua assinatura:\n\n📦 Assinatura: {assinatura}\n🔗 Link: {link}\n📅 Vencimento: {vencimento}"
            : "Olá {cliente}! Seguem os dados de acesso da sua assinatura:\n\n📦 Assinatura: {assinatura}\n📧 Email: {email}\n🔑 Senha: {senha}\n📺 Tela: {tela}\n🔢 Pin: {pin_tela}\n📅 Vencimento: {vencimento}";

        const deliveryMessageTemplate = customTemplate || defaultTemplate;

        if (isDeliveryActive && deliveryMessageTemplate && settings.webhookToken) {
            let formattedMessage = deliveryMessageTemplate
                .replace(/{cliente}/g, clientData.name)
                .replace(/{telefone}/g, clientData.phone)
                .replace(/{email}/g, (clientData.email || []).join(', '))
                .replace(/{senha}/g, clientData.password || 'N/A')
                .replace(/{tela}/g, clientData.screen || 'N/A')
                .replace(/{pin_tela}/g, clientData.pinScreen || 'N/A')
                .replace(/{link}/g, clientData.accessLink || 'N/A')
                .replace(/{assinatura}/g, clientData.subscription)
                .replace(/{vencimento}/g, format(dueDate, 'dd/MM/yyyy'))
                .replace(/{valor}/g, clientData.amountPaid || '0,00')
                .replace(/{status}/g, clientData.status);

            try {
                const formattedPhoneNumber = clientData.phone.replace(/\D/g, '');

                await fetch('https://travelflow.uazapi.com/send/text', {
                    method: 'POST',
                    headers: { 
                        'Content-Type': 'application/json',
                        'token': settings.webhookToken,
                        'apikey': settings.webhookToken,
                    },
                    body: JSON.stringify({ 
                        text: formattedMessage, 
                        number: formattedPhoneNumber,
                    }),
                });
                console.log('Mensagem de credenciais do produto enviada com sucesso via UAZAPI');
            } catch (error) {
                console.error("Falha ao enviar mensagem de credenciais do produto via UAZAPI:", error);
            }
        }

        // Salva o contato automaticamente na agenda do WhatsApp via API direta
        if (settings.webhookToken && clientData.phone && clientData.name) {
            try {
                const formattedPhoneNumber = clientData.phone.replace(/\D/g, '');
                await fetch('https://travelflow.uazapi.com/contact/add', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'token': settings.webhookToken,
                        'apikey': settings.webhookToken,
                    },
                    body: JSON.stringify({
                        number: formattedPhoneNumber,
                        name: clientData.name,
                    }),
                });
                console.log('Contato salvo na agenda do WhatsApp via UAZAPI');
            } catch (err) {
                console.error('Falha ao salvar contato na agenda:', err);
            }
        }
      }

    } catch (e) {
      console.error('Erro ao adicionar cliente via webhook:', e);
    }
  }

  webhookLogsByUser[userId].unshift(entry);
  if (webhookLogsByUser[userId].length > 100) webhookLogsByUser[userId].pop();

  broadcast(userId, JSON.stringify(entry));

  return NextResponse.json({ received: true, id: entry.id }, { status: 200 });
}

// GET — returns logs or opens SSE stream for an user
export async function GET(req: NextRequest, { params }: { params: Promise<{ userId: string }> }) {
  const { userId } = await params;
  if (!userId) return NextResponse.json({ error: 'Missing userId' }, { status: 400 });

  const accept = req.headers.get('accept') || '';

  // SSE stream
  if (accept.includes('text/event-stream')) {
    const stream = new ReadableStream({
      start(controller) {
        if (!clientsByUser[userId]) {
          clientsByUser[userId] = new Set();
        }
        clientsByUser[userId].add(controller);
        
        const logs = webhookLogsByUser[userId] || [];
        controller.enqueue(`data: ${JSON.stringify({ type: 'init', logs })}\n\n`);
        
        req.signal.addEventListener('abort', () => {
          if (clientsByUser[userId]) {
            clientsByUser[userId].delete(controller);
          }
          controller.close();
        });
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
      },
    });
  }

  return NextResponse.json(webhookLogsByUser[userId] || []);
}

// DELETE — clear all logs for an user
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ userId: string }> }) {
  const { userId } = await params;
  if (!userId) return NextResponse.json({ error: 'Missing userId' }, { status: 400 });

  if (webhookLogsByUser[userId]) {
    webhookLogsByUser[userId] = [];
  }
  
  broadcast(userId, JSON.stringify({ type: 'clear' }));
  return NextResponse.json({ cleared: true });
}
