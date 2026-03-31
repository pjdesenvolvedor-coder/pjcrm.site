import { NextRequest, NextResponse } from 'next/server';
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore, collection, addDoc, serverTimestamp, Timestamp } from 'firebase/firestore';
import { firebaseConfig } from '@/firebase/config';

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

      const clientData = {
        userId: userId,
        name: b.nome || 'Cliente via Webhook',
        phone: b.telefone || '',
        subscription: b.produto || 'Produto Webhook',
        amountPaid: b.valor ? b.valor.toString() : '0,00',
        email: b.emailConta ? [b.emailConta] : [],
        password: b.senhaConta || null,
        screen: b.perfil || null,
        pinScreen: b.senhaPerfil || null,
        deliveryMethod: 'credentials',
        paymentMethod: 'PIX',
        status: 'Ativo',
        needsSupport: false,
        createdAt: serverTimestamp(),
        dueDate: Timestamp.fromDate(dueDate),
        upsellSent: false,
        quantity: 1,
        clientType: null,
        agentName: 'Sistema (Webhook)',
      };

      await addDoc(collection(db, 'users', userId, 'clients'), clientData);
      console.log('Cliente adicionado com sucesso via Webhook');
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
