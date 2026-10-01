import { NextRequest, NextResponse } from 'next/server';
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore, doc, getDoc } from 'firebase/firestore';
import { firebaseConfig } from '@/firebase/config';
import type { RenewalSession } from '@/lib/types';

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
