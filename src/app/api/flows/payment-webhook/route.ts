import { NextRequest, NextResponse } from 'next/server';
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore, doc, getDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { firebaseConfig } from '@/firebase/config';
import { executeFlowOrderDelivery, verifyPendingFlowOrders } from '@/lib/flow-product-delivery';
import { checkPjPayTransaction, DEFAULT_PJPAY_TOKEN } from '@/lib/pjpay';
import { checkLinkinPayTransaction, DEFAULT_LINKINPAY_TOKEN } from '@/lib/linkinpay';
import type { FlowOrder, FlowProductDeliveryConfig, Settings } from '@/lib/types';

export const dynamic = 'force-dynamic';

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
const db = getFirestore(app);

export async function POST(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const queryOrderId = searchParams.get('orderId');

    const body = await req.json().catch(() => ({}));
    console.log('[flow-payment-webhook] Payload recebido:', JSON.stringify(body));

    // Suporte a ação manual de verificação ou reentrega a partir do painel
    if (body.action === 'verify_all') {
      const res = await verifyPendingFlowOrders(body.userId);
      return NextResponse.json({ success: true, ...res }, { status: 200 });
    }

    if (body.action === 'force_deliver' && body.orderId) {
      const res = await executeFlowOrderDelivery({ orderId: String(body.orderId) });
      return NextResponse.json(res, { status: 200 });
    }

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

    let targetOrderId = queryOrderId;

    if (!targetOrderId && txId) {
      const txStr = String(txId).trim();
      const q1 = query(collection(db, 'flow_orders'), where('pixTransactionId', '==', txStr));
      const snap1 = await getDocs(q1);
      if (!snap1.empty) {
        targetOrderId = snap1.docs[0].id;
      }
    }

    if (!isPaid && (txId || targetOrderId)) {
      try {
        let pjToken = DEFAULT_PJPAY_TOKEN;
        let lkToken = DEFAULT_LINKINPAY_TOKEN;
        let checkTxId = txId ? String(txId) : '';
        let gateway = 'pjpay';

        if (targetOrderId) {
          const oSnap = await getDoc(doc(db, 'flow_orders', targetOrderId));
          if (oSnap.exists()) {
            const oData = oSnap.data() as FlowOrder;
            checkTxId = checkTxId || oData.pixTransactionId;
            gateway = oData.gateway || 'pjpay';
            const [dSnap, cSnap] = await Promise.all([
              getDoc(doc(db, 'users', oData.userId, 'settings', 'flow_product_delivery')),
              getDoc(doc(db, 'users', oData.userId, 'settings', 'config')),
            ]);
            const dCfg = dSnap.exists() ? (dSnap.data() as FlowProductDeliveryConfig) : {};
            const cCfg = cSnap.exists() ? (cSnap.data() as Settings) : ({} as Settings);
            pjToken = dCfg.pixApiToken?.trim() || cCfg.pjpayToken?.trim() || pjToken;
            lkToken = dCfg.pixApiToken?.trim() || cCfg.linkinpayToken?.trim() || lkToken;
          }
        }

        if (checkTxId) {
          const check =
            gateway === 'linkinpay'
              ? await checkLinkinPayTransaction(checkTxId, lkToken)
              : await checkPjPayTransaction(checkTxId, pjToken);
          if (check.paid) {
            isPaid = true;
          }
        }
      } catch {}
    }

    if (!isPaid) {
      return NextResponse.json(
        { received: true, ignored: true, status: statusCandidates[0] || 'pending' },
        { status: 200 }
      );
    }

    if (!targetOrderId) {
      return NextResponse.json({ received: true, error: 'Pedido não identificado' }, { status: 200 });
    }

    const result = await executeFlowOrderDelivery({
      orderId: targetOrderId,
      pixTransactionId: txId ? String(txId) : undefined,
    });

    return NextResponse.json({ received: true, ...result }, { status: 200 });
  } catch (error: any) {
    console.error('[flow-payment-webhook] Erro:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const orderId = searchParams.get('orderId');
  if (orderId) {
    const snap = await getDoc(doc(db, 'flow_orders', orderId));
    if (snap.exists()) {
      return NextResponse.json({ status: 'ok', order: snap.data() });
    }
  }
  return NextResponse.json({ status: 'ok', endpoint: 'Flow Automatic Product Delivery Webhook' });
}
