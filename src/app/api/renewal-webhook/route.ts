import { NextRequest, NextResponse } from 'next/server';
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore, doc, getDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { firebaseConfig } from '@/firebase/config';
import { executeRenewalPayment } from '@/lib/renewal-service';
import type { RenewalSession } from '@/lib/types';

export const dynamic = 'force-dynamic';

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
const db = getFirestore(app);

export async function POST(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const querySessionId = searchParams.get('sessionId');

    const body = await req.json().catch(() => ({}));
    console.log('[renewal-webhook] Payload recebido da LinkinPay:', JSON.stringify(body));

    const txId = body.id || body.transaction_id || body.transactionId || body.data?.id;
    const rawStatus = String(body.status || body.event || body.transaction_status || '').toLowerCase();

    const isPaid = [
      'paid',
      'completed',
      'completo',
      'pago',
      'aprovado',
      'pixcashin',
      'approved',
    ].some((s) => rawStatus.includes(s));

    if (!isPaid) {
      console.log(`[renewal-webhook] Status não é de pagamento aprovado (${rawStatus}). Ignorando.`);
      return NextResponse.json({ received: true, ignored: true, status: rawStatus }, { status: 200 });
    }

    let targetSessionId = querySessionId;

    // Se não veio sessionId na query, busca pela transação no Firestore
    if (!targetSessionId && txId) {
      const q = query(collection(db, 'renewal_sessions'), where('pixTransactionId', '==', String(txId)));
      const snap = await getDocs(q);
      if (!snap.empty) {
        targetSessionId = snap.docs[0].id;
      }
    }

    if (!targetSessionId) {
      console.warn('[renewal-webhook] Nenhuma sessão encontrada para a transação:', txId);
      return NextResponse.json({ received: true, error: 'Sessão não identificada' }, { status: 200 });
    }

    console.log(`[renewal-webhook] Pagamento confirmado para sessão ${targetSessionId}! Executando renovação automática...`);

    const result = await executeRenewalPayment({
      sessionId: targetSessionId,
      pixTransactionId: String(txId || ''),
      amountInCents: body.value || body.amount,
    });

    return NextResponse.json({
      received: true,
      renewed: result.success,
      renewedCount: result.renewedCount,
      messageSent: result.messageSent,
    }, { status: 200 });
  } catch (error: any) {
    console.error('[renewal-webhook] Erro:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({ status: 'ok', endpoint: 'LinkinPay Renewal Webhook' });
}
