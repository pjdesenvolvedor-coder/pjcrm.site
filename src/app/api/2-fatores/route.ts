// src/app/api/2-fatores/route.ts

import { NextResponse } from 'next/server';
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { firebaseConfig } from '@/firebase/config';

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
const firestore = getFirestore(app);
import { doc, getDoc, getDocs, collection, query, limit } from 'firebase/firestore';

export const runtime = 'nodejs';

/**
 * Expected payload:
 * {
 *   "Conteudo": "2fatores",
 *   "NumeroCliente": "11999998888",
 *   "codigofa": "123456"
 * }
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    console.log('Received payload:', body);
    const { Conteudo, NumeroCliente, codigofa } = body as {
      Conteudo?: string;
      NumeroCliente?: string;
      codigofa?: string;
    };

    if (Conteudo !== '2fatores' || !NumeroCliente || !codigofa) {
      return NextResponse.json(
        { error: 'Payload must contain Conteudo="2fatores", NumeroCliente and codigofa' },
        { status: 400 }
      );
    }

    // Buscar o primeiro usuário para pegar as configurações
    const usersSnap = await getDocs(query(collection(firestore, 'users'), limit(1)));
    const firstUserDoc = usersSnap.docs[0];
    
    let token = '';
    let template = '🔒 *Código de Acesso*\n\n> Seu codigo: {codigo}';

    if (firstUserDoc) {
      const userId = firstUserDoc.id;
      const settings2faDoc = await getDoc(doc(firestore, 'users', userId, 'settings', '2fatores'));
      const configDoc = await getDoc(doc(firestore, 'users', userId, 'settings', 'config'));

      const settings2fa = settings2faDoc.exists() ? settings2faDoc.data() : {};
      const config = configDoc.exists() ? configDoc.data() : {};

      token = settings2fa.useSeparateZap && settings2fa.billingWebhookToken
        ? settings2fa.billingWebhookToken
        : (config.webhookToken || '');

      template = settings2fa.messageTemplate || '🔒 *Código de Acesso*\n\n> Seu codigo: {codigo}';
    }

    const formattedMessage = template.replace(/{codigo}/g, codigofa);
    const escapedMessage = formattedMessage.replace(/\n/g, '\\n');

    // Payload exactly as the PowerShell command expects
    const payload = {
      text: escapedMessage,
      number: NumeroCliente,
      token: token,
    };
    console.log('Payload to webhook:', payload);

    // Dispatch message using the same webhook used by other menus
    const webhookUrl = 'https://pedropedro.n8nready.com.br/webhook/d8cc260e-3f3c-4643-88a6-bed8cefafba1';
    const webhookResponse = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!webhookResponse.ok) {
      const err = await webhookResponse.text();
      console.error('Webhook failed', webhookResponse.status, err);
      return NextResponse.json({ error: 'Failed to send 2‑FA message', details: err }, { status: webhookResponse.status });
    }

    console.log('Webhook response status:', webhookResponse.status);
    const respData = await webhookResponse.json();
    console.log('Webhook response body:', respData);
    return NextResponse.json({ success: true, data: respData });
  } catch (err: any) {
    console.error('2‑FA route error', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
