import { NextRequest, NextResponse } from 'next/server';
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore, doc, getDoc } from 'firebase/firestore';
import { firebaseConfig } from '@/firebase/config';
import { checkLinkinPayTransaction, DEFAULT_LINKINPAY_TOKEN } from '@/lib/linkinpay';
import { checkPjPayTransaction, DEFAULT_PJPAY_TOKEN } from '@/lib/pjpay';
import { executeRenewalPayment } from '@/lib/renewal-service';
import type { RenewalSession, Settings } from '@/lib/types';

export const dynamic = 'force-dynamic';

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
const db = getFirestore(app);

export async function POST(req: NextRequest) {
  try {
    const { sessionId, transactionId } = await req.json();

    if (!sessionId) {
      return NextResponse.json({ error: 'sessionId obrigatório' }, { status: 400 });
    }

    const sessionDocRef = doc(db, 'renewal_sessions', sessionId);
    const sessionSnap = await getDoc(sessionDocRef);

    if (!sessionSnap.exists()) {
      return NextResponse.json({ error: 'Sessão não encontrada' }, { status: 404 });
    }

    const session = sessionSnap.data() as RenewalSession;

    // Se já está pago na sessão, retorna aprovado imediatamente (evita reexecutar e reenviar mensagem no WhatsApp)
    if (session.status === 'paid') {
      return NextResponse.json({
        paid: true,
        status: 'paid',
        message: 'Pagamento aprovado e renovação concluída!',
      });
    }

    // Reúne todos os IDs de transação PIX gerados nesta sessão (evita perder pagamento se o cliente gerou 2 PIX e pagou o 1º)
    const txCandidates = Array.from(
      new Set(
        [
          transactionId,
          session.pixTransactionId,
          ...(Array.isArray(session.pixTransactionIds) ? session.pixTransactionIds : []),
        ].filter((id): id is string => Boolean(id && String(id).trim()))
      )
    );

    if (txCandidates.length === 0) {
      return NextResponse.json({
        paid: false,
        status: 'pending',
      });
    }

    // Obter configurações do usuário
    let configData: Settings | null = null;
    try {
      const configSnap = await getDoc(doc(db, 'users', session.userId, 'settings', 'config'));
      if (configSnap.exists()) {
        configData = configSnap.data() as Settings;
      }
    } catch {}

    const pjpayToken = configData?.pjpayToken?.trim() || DEFAULT_PJPAY_TOKEN;
    const linkinpayToken = configData?.linkinpayToken?.trim() || DEFAULT_LINKINPAY_TOKEN;

    let lastStatus = 'pending';

    for (const txId of txCandidates) {
      const isPjPay = String(txId).startsWith('pay_') || (session.gateway === 'pjpay' && !String(txId).includes('-'));
      try {
        const checkRes = isPjPay
          ? await checkPjPayTransaction(txId, pjpayToken)
          : await checkLinkinPayTransaction(txId, linkinpayToken);

        lastStatus = checkRes.status || lastStatus;

        if (checkRes.paid) {
          console.log(
            `[check-status] Transação ${txId} (${isPjPay ? 'PJPay' : 'LinkinPay'}) APROVADA! Executando renovação automática...`
          );
          const execResult = await executeRenewalPayment({
            sessionId,
            pixTransactionId: txId,
            amountInCents: session.totalAmountPaid,
          });

          return NextResponse.json({
            paid: true,
            status: 'paid',
            renewedCount: execResult.renewedCount,
            messageSent: execResult.messageSent,
          });
        }
      } catch (txErr: any) {
        console.warn(`[check-status] Falha ao consultar txId ${txId}:`, txErr?.message);
      }
    }

    return NextResponse.json({
      paid: false,
      status: lastStatus,
    });
  } catch (error: any) {
    console.error('[api/renewal/check-status] Erro:', error);
    return NextResponse.json({ error: error.message || 'Erro ao verificar status' }, { status: 500 });
  }
}

