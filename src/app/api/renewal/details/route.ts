import { NextRequest, NextResponse } from 'next/server';
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore, doc, getDoc } from 'firebase/firestore';
import { firebaseConfig } from '@/firebase/config';
import { checkPjPayTransaction, DEFAULT_PJPAY_TOKEN } from '@/lib/pjpay';
import { checkLinkinPayTransaction, DEFAULT_LINKINPAY_TOKEN } from '@/lib/linkinpay';
import { executeRenewalPayment } from '@/lib/renewal-service';
import type { RenewalSession, Settings } from '@/lib/types';

export const dynamic = 'force-dynamic';

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
const db = getFirestore(app);

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const sessionId = searchParams.get('sessionId') || searchParams.get('id');

  if (!sessionId) {
    return NextResponse.json({ error: 'ID da sessão não informado' }, { status: 400 });
  }

  try {
    const sessionDocRef = doc(db, 'renewal_sessions', sessionId);
    const snap = await getDoc(sessionDocRef);

    if (!snap.exists()) {
      return NextResponse.json({ error: 'Sessão de renovação não encontrada ou expirada' }, { status: 404 });
    }

    const session = { id: snap.id, ...snap.data() } as RenewalSession;

    // Se a sessão ainda consta como 'pending' mas já possui PIX gerado, verifica no gateway na hora!
    if (session.status !== 'paid') {
      const txCandidates = Array.from(
        new Set(
          [
            session.pixTransactionId,
            ...(Array.isArray(session.pixTransactionIds) ? session.pixTransactionIds : []),
          ].filter((id): id is string => Boolean(id && String(id).trim()))
        )
      );

      if (txCandidates.length > 0) {
        let configData: Settings | null = null;
        try {
          const configSnap = await getDoc(doc(db, 'users', session.userId, 'settings', 'config'));
          if (configSnap.exists()) {
            configData = configSnap.data() as Settings;
          }
        } catch {}

        const pjpayToken = configData?.pjpayToken?.trim() || DEFAULT_PJPAY_TOKEN;
        const linkinpayToken = configData?.linkinpayToken?.trim() || DEFAULT_LINKINPAY_TOKEN;

        for (const txId of txCandidates) {
          const isPjPay = String(txId).startsWith('pay_') || (session.gateway === 'pjpay' && !String(txId).includes('-'));
          try {
            const checkRes = isPjPay
              ? await checkPjPayTransaction(txId, pjpayToken)
              : await checkLinkinPayTransaction(txId, linkinpayToken);

            if (checkRes.paid) {
              console.log(`[renewal/details] PIX ${txId} já pago ao reabrir sessão ${sessionId}! Renovando...`);
              await executeRenewalPayment({
                sessionId,
                pixTransactionId: txId,
                amountInCents: session.totalAmountPaid,
              });
              session.status = 'paid';
              break;
            }
          } catch {}
        }
      }
    }

    return NextResponse.json({
      success: true,
      session: {
        id: session.id,
        clientName: session.clientName,
        phone: session.phone,
        status: session.status,
        subscriptions: session.subscriptions || [],
        totalAmountPaid: session.totalAmountPaid,
        pixCode: session.pixCode,
        pixQrCodeBase64: session.pixQrCodeBase64,
        pixTransactionId: session.pixTransactionId,
      },
    });
  } catch (error: any) {
    console.error('[api/renewal/details] Erro:', error);
    return NextResponse.json({ error: error.message || 'Erro interno' }, { status: 500 });
  }
}

