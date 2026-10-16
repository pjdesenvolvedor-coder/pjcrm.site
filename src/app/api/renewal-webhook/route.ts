import { NextRequest, NextResponse } from 'next/server';
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore, doc, getDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { firebaseConfig } from '@/firebase/config';
import { executeRenewalPayment } from '@/lib/renewal-service';
import { checkPjPayTransaction, DEFAULT_PJPAY_TOKEN } from '@/lib/pjpay';
import { checkLinkinPayTransaction, DEFAULT_LINKINPAY_TOKEN } from '@/lib/linkinpay';
import type { RenewalSession, Settings } from '@/lib/types';

export const dynamic = 'force-dynamic';

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
const db = getFirestore(app);

export async function POST(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const querySessionId = searchParams.get('sessionId');

    const body = await req.json().catch(() => ({}));
    console.log('[renewal-webhook] Payload recebido:', JSON.stringify(body));

    const txId =
      body.id ||
      body.data?.id ||
      body.payment?.id ||
      body.transaction?.id ||
      body.transaction_id ||
      body.transactionId ||
      body.data?.transaction_id;

    const statusCandidates = [
      body.status,
      body.data?.status,
      body.payment?.status,
      body.transaction?.status,
      body.event,
      body.type,
      body.transaction_status,
      body.data?.transaction_status,
    ]
      .filter(Boolean)
      .map((s) => String(s).toLowerCase().trim());

    const paidKeywords = [
      'paid',
      'completed',
      'completo',
      'pago',
      'aprovado',
      'pixcashin',
      'approved',
      'payment.paid',
      'liquidado',
    ];

    let isPaid =
      statusCandidates.some((raw) => paidKeywords.some((kw) => raw.includes(kw))) ||
      Boolean(body.paid_at || body.data?.paid_at || body.payment?.paid_at);

    let targetSessionId = querySessionId;

    // Se não veio sessionId na query, busca pela transação no Firestore (em pixTransactionId ou pixTransactionIds)
    if (!targetSessionId && txId) {
      const txStr = String(txId).trim();
      const q1 = query(collection(db, 'renewal_sessions'), where('pixTransactionId', '==', txStr));
      const snap1 = await getDocs(q1);
      if (!snap1.empty) {
        targetSessionId = snap1.docs[0].id;
      } else {
        const q2 = query(collection(db, 'renewal_sessions'), where('pixTransactionIds', 'array-contains', txStr));
        const snap2 = await getDocs(q2);
        if (!snap2.empty) {
          targetSessionId = snap2.docs[0].id;
        }
      }
    }

    // Se ainda não confirmou isPaid pelo texto do webhook, mas temos txId, consulta direto na API do Gateway
    if (!isPaid && txId) {
      try {
        let pjToken = DEFAULT_PJPAY_TOKEN;
        let lkToken = DEFAULT_LINKINPAY_TOKEN;
        if (targetSessionId) {
          const sSnap = await getDoc(doc(db, 'renewal_sessions', targetSessionId));
          if (sSnap.exists()) {
            const sData = sSnap.data() as RenewalSession;
            const cSnap = await getDoc(doc(db, 'users', sData.userId, 'settings', 'config'));
            if (cSnap.exists()) {
              const cfg = cSnap.data() as Settings;
              pjToken = cfg.pjpayToken?.trim() || pjToken;
              lkToken = cfg.linkinpayToken?.trim() || lkToken;
            }
          }
        }
        const isPj = String(txId).startsWith('pay_');
        const check = isPj
          ? await checkPjPayTransaction(String(txId), pjToken)
          : await checkLinkinPayTransaction(String(txId), lkToken);
        if (check.paid) {
          isPaid = true;
        }
      } catch {}
    }

    if (!isPaid) {
      console.log(
        `[renewal-webhook] Status não é de pagamento aprovado (${statusCandidates.join(', ')}). Ignorando.`
      );
      return NextResponse.json({ received: true, ignored: true, status: statusCandidates[0] || '' }, { status: 200 });
    }

    if (!targetSessionId) {
      console.warn('[renewal-webhook] Nenhuma sessão encontrada para a transação:', txId);
      return NextResponse.json({ received: true, error: 'Sessão não identificada' }, { status: 200 });
    }

    console.log(`[renewal-webhook] Pagamento confirmado para sessão ${targetSessionId}! Executando renovação automática...`);

    const result = await executeRenewalPayment({
      sessionId: targetSessionId,
      pixTransactionId: String(txId || ''),
      amountInCents:
        body.value ||
        body.amount ||
        body.data?.amount ||
        body.data?.value ||
        body.payment?.amount,
    });

    return NextResponse.json(
      {
        received: true,
        renewed: result.success,
        renewedCount: result.renewedCount,
        messageSent: result.messageSent,
      },
      { status: 200 }
    );
  } catch (error: any) {
    console.error('[renewal-webhook] Erro:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({ status: 'ok', endpoint: 'Renewal Webhook (LinkinPay & PJ Pay Gateway)' });
}

