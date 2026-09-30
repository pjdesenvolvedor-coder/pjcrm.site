import { NextResponse } from 'next/server';
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore, doc, getDoc, updateDoc, deleteDoc } from 'firebase/firestore';
import { firebaseConfig } from '@/firebase/config';

export const dynamic = 'force-dynamic';

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
const db = getFirestore(app);

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const { sessionId, code } = body;

    if (!sessionId || !code) {
      return NextResponse.json({ error: 'Sessão e código são obrigatórios.' }, { status: 400 });
    }

    const cleanInputCode = String(code).trim().toUpperCase();

    const sessionRef = doc(db, 'two_factor_login_sessions', sessionId);
    const sessionSnap = await getDoc(sessionRef);

    if (!sessionSnap.exists()) {
      return NextResponse.json({ error: 'Sessão de verificação inválida ou expirada. Solicite um novo código.' }, { status: 404 });
    }

    const sessionData = sessionSnap.data();

    // Verifica expiração
    if (Date.now() > sessionData.expiresAt) {
      await deleteDoc(sessionRef).catch(() => {});
      return NextResponse.json({ error: 'O código expirou. Clique em reenviar para gerar um novo.' }, { status: 410 });
    }

    const correctCode = String(sessionData.code).trim().toUpperCase();

    if (cleanInputCode !== correctCode) {
      return NextResponse.json({ error: 'Código incorreto. Verifique a mensagem no WhatsApp e tente novamente.' }, { status: 400 });
    }

    // Código correto: marca sessão como verificada e remove o código para evitar reuso
    await deleteDoc(sessionRef).catch(() => {});

    return NextResponse.json({
      success: true,
      message: 'Código verificado com sucesso.',
      recipientName: sessionData.recipientName,
    });

  } catch (error: any) {
    console.error('[verify-code] Erro:', error);
    return NextResponse.json({
      error: error?.message || 'Erro ao verificar código 2FA.',
    }, { status: 500 });
  }
}
