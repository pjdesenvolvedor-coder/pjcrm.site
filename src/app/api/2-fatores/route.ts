// src/app/api/2-fatores/route.ts

import { NextResponse } from 'next/server';
import { getZapToken } from '@/lib/zapToken';
import { firestore } from '@/firebase';
import { doc, getDoc, getDocs, collection, query, limit } from 'firebase/firestore';

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

    // Find any user (we assume there is at least one) to get their 2‑Fatores config
    const usersSnap = await getDocs(query(collection(firestore, 'users'), limit(1)));
    const firstUserDoc = usersSnap.docs[0];
    const settingsDoc = firstUserDoc
      ? await getDoc(doc(firestore, 'users', firstUserDoc.id, 'settings', '2fatores'))
      : null;
    const settings = settingsDoc && settingsDoc.exists() ? settingsDoc.data() : {};

    // Token fixo fornecido pelo usuário
    // Mensagem será apenas o código de 2‑FA recebido

    // Payload exactly as the PowerShell command expects
    const payload = {
      text: codigofa,
      number: NumeroCliente,
      token: 'cb43cc8e-78bf-4382-b362-2f50edfa38bd',
    };
    console.log('Payload to webhook:', payload);

    // Dispatch message using the same webhook used by other menus
    const webhookUrl = 'https://n8nbeta.typeflow.app.br/webhook/235c79d0-71ed-4a43-aa3c-5c0cf1de2580';
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
