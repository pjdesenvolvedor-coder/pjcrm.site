import { NextRequest, NextResponse } from 'next/server';
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore, collection, addDoc, getDoc, doc, serverTimestamp, Timestamp } from 'firebase/firestore';
import { firebaseConfig } from '@/firebase/config';
import { format } from 'date-fns';

export const dynamic = 'force-dynamic';

// Initialize Firebase App for the server route
const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
const db = getFirestore(app);

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

function extractWebhookData(body: unknown) {
  if (!body || typeof body !== 'object') return null;
  const b = body as Record<string, any>;

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
  const phone = getVal(['telefone', 'phone', 'whatsapp', 'celular', 'buyer_phone', 'mobile', 'phone_number']);

  if (!phone) return null;

  return {
    name: name ? String(name).trim() : 'Cliente via Webhook',
    phone: String(phone).replace(/\D/g, ''),
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

  // Se o payload for de 2-fatores, encaminha para o webhook de mensagem individual
  const is2FA = body && typeof body === 'object' &&
    ((('Conteudo' in (body as any)) && (body as any).Conteudo === '2fatores') ||
     (('conteudo' in (body as any)) && (body as any).conteudo === '2fatores'));

  if (is2FA) {
    try {
      const b = body as any;
      const codigofa = b.codigofa || b.codigoFa || b.codigo_fa;
      const NumeroCliente = b.NumeroCliente || b.numeroCliente || b.numero_cliente;

      if (codigofa && NumeroCliente) {
        // Buscar configurações de 2FA e gerais do usuário no Firestore
        const settings2faDoc = await getDoc(doc(db, 'users', userId, 'settings', '2fatores'));
        const configDoc = await getDoc(doc(db, 'users', userId, 'settings', 'config'));

        const settings2fa = settings2faDoc.exists() ? settings2faDoc.data() : {};
        const config = configDoc.exists() ? configDoc.data() : {};

        // Resolver o token
        const token = settings2fa.useSeparateZap && settings2fa.billingWebhookToken
          ? settings2fa.billingWebhookToken
          : (config.webhookToken || '');

        // Formatar mensagem usando o novo padrão como fallback
        const template = settings2fa.messageTemplate || '🔒 *Código de Acesso*\n\n> Seu codigo: {codigo}';
        const formattedMessage = template.replace(/{codigo}/g, codigofa);
        const escapedMessage = formattedMessage.replace(/\n/g, '\\n');

        const payload = {
          text: escapedMessage,
          number: NumeroCliente,
          token: token,
        };
        console.log('Forwarding 2FA from webhook-receiver to n8n:', payload);

        const webhookUrl = 'https://pjempreendimentos.n8nready.com.br/webhook/d8cc260e-3f3c-4643-88a6-bed8cefafba1';
        const webhookResponse = await fetch(webhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });

        if (!webhookResponse.ok) {
          const err = await webhookResponse.text();
          console.error('Webhook 2FA forwarding failed:', webhookResponse.status, err);
        } else {
          console.log('Webhook 2FA forwarding succeeded:', webhookResponse.status);
        }
      }
    } catch (e) {
      console.error('Erro ao enviar 2FA via webhook-receiver:', e);
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
        
        const isDeliveryActive = settings.isDeliveryAutomationActive;
        const deliveryMessageTemplate = settings.deliveryMessage;

        if (isDeliveryActive && deliveryMessageTemplate && settings.webhookToken) {
            let formattedMessage = deliveryMessageTemplate
                .replace(/{cliente}/g, clientData.name)
                .replace(/{telefone}/g, clientData.phone)
                .replace(/{email}/g, clientData.email.join(', '))
                .replace(/{senha}/g, clientData.password || 'N/A')
                .replace(/{tela}/g, clientData.screen || 'N/A')
                .replace(/{pin_tela}/g, clientData.pinScreen || 'N/A')
                .replace(/{link}/g, clientData.accessLink || 'N/A')
                .replace(/{assinatura}/g, clientData.subscription)
                .replace(/{vencimento}/g, format(dueDate, 'dd/MM/yyyy'))
                .replace(/{valor}/g, clientData.amountPaid || '0,00')
                .replace(/{status}/g, clientData.status);

            try {
                // Envia os dados para a automação principal (n8n webhook)
                await fetch('https://pjempreendimentos.n8nready.com.br/webhook/e1d3eaf3-c73c-4d9b-b3fb-39f6abe181f3', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        nome: clientData.name,
                        numero: clientData.phone,
                        token: settings.webhookToken
                    })
                });
            } catch (error) {
                console.error("Falha ao enviar webhook n8n no backend:", error);
            }

            try {
                // Envia a mensagem de entrega de credenciais diretamente para o webhook do n8n de disparo
                const formattedPhoneNumber = clientData.phone.replace(/\D/g, '');
                const escapedMessage = formattedMessage.replace(/\n/g, '\\n');

                await fetch('https://pjempreendimentos.n8nready.com.br/webhook/c77db165-367d-430a-a055-8f86879b107e', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ 
                        text: escapedMessage, 
                        number: formattedPhoneNumber, 
                        token: settings.webhookToken 
                    }),
                });
                console.log('Mensagem de credenciais do produto enviada com sucesso via Webhook');
            } catch (error) {
                console.error("Falha ao enviar mensagem de credenciais do produto:", error);
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
