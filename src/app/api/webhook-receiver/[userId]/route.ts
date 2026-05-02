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

// POST — receives the webhook for a specific user
export async function POST(req: NextRequest, { params }: { params: { userId: string } }) {
  const userId = params.userId;
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

  // Se o payload contém "nome" e "telefone", processamos para adicionar um cliente
  if (body && typeof body === 'object' && ('nome' in body) && ('telefone' in body)) {
    try {
      const b = body as any;
      const dueDate = new Date();
      dueDate.setMonth(dueDate.getMonth() + 1);

      const clientData: any = {
        userId: userId,
        name: b.nome || 'Cliente via Webhook',
        phone: b.telefone || '',
        subscription: b.produto || 'Produto Webhook',
        amountPaid: b.valor ? b.valor.toString() : '0,00',
        email: (b.email || b.emailConta) ? [b.email || b.emailConta] : [],
        password: b.senha || b.senhaConta || null,
        screen: b.perfil || null,
        pinScreen: b.senhaPerfil || null,
        accessLink: null,
        deliveryMethod: 'credentials',
        paymentMethod: 'PIX',
        status: 'Ativo',
        needsSupport: false,
        createdAt: new Date(), // Using Date object simplifies Upsell logic on client
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
                await fetch('https://n8nbeta.typeflow.app.br/webhook/9719b2d6-7167-4615-8515-3cd67da869e7', {
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

            // Calls the local API endpoint that forwards to the actual Zap connection webhook
            const baseUrl = req.headers.get('origin') || `http://${req.headers.get('host')}`;
            fetch(`${baseUrl}/api/send-message`, {
                method: 'POST', 
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ message: formattedMessage, phoneNumber: clientData.phone, token: settings.webhookToken }),
            }).catch(console.error);
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
export async function GET(req: NextRequest, { params }: { params: { userId: string } }) {
  const userId = params.userId;
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
export async function DELETE(req: NextRequest, { params }: { params: { userId: string } }) {
  const userId = params.userId;
  if (!userId) return NextResponse.json({ error: 'Missing userId' }, { status: 400 });

  if (webhookLogsByUser[userId]) {
    webhookLogsByUser[userId] = [];
  }
  
  broadcast(userId, JSON.stringify({ type: 'clear' }));
  return NextResponse.json({ cleared: true });
}
