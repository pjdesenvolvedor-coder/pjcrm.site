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

    // Se já está pago na sessão, retorna aprovado imediatamente
    if (session.status === 'paid') {
      return NextResponse.json({
        paid: true,
        status: 'paid',
        message: 'Pagamento aprovado e renovação concluída!',
      });
    }

    const txId = transactionId || session.pixTransactionId;
    if (!txId) {
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

    const isPjPay = session.gateway === 'pjpay';
    let checkRes: { paid: boolean; status: string; rawStatus: string };

    if (isPjPay) {
      const pjpayToken = configData?.pjpayToken?.trim() || DEFAULT_PJPAY_TOKEN;
      checkRes = await checkPjPayTransaction(txId, pjpayToken);
    } else {
      const linkinpayToken = configData?.linkinpayToken?.trim() || DEFAULT_LINKINPAY_TOKEN;
      checkRes = await checkLinkinPayTransaction(txId, linkinpayToken);
    }

    if (checkRes.paid) {
      console.log(`[check-status] Transação ${txId} (${isPjPay ? 'PJPay' : 'LinkinPay'}) APROVADA! Executando renovação automática...`);
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

    return NextResponse.json({
      paid: false,
      status: checkRes.status || 'pending',
    });
  } catch (error: any) {
    console.error('[api/renewal/check-status] Erro:', error);
    return NextResponse.json({ error: error.message || 'Erro ao verificar status' }, { status: 500 });
  }
}
