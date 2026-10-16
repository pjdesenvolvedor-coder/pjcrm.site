import { NextRequest, NextResponse } from 'next/server';
import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getFirestore,
  doc,
  getDoc,
  deleteDoc,
  updateDoc,
  collection,
  addDoc,
  serverTimestamp,
} from 'firebase/firestore';
import { firebaseConfig } from '@/firebase/config';
import type { Client, RenewalSession } from '@/lib/types';

export const dynamic = 'force-dynamic';

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
const db = getFirestore(app);

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { sessionId, clientIds } = body;

    if (!sessionId) {
      return NextResponse.json({ error: 'sessionId é obrigatório' }, { status: 400 });
    }

    const sessionDocRef = doc(db, 'renewal_sessions', sessionId);
    const sessionSnap = await getDoc(sessionDocRef);

    if (!sessionSnap.exists()) {
      return NextResponse.json({ error: 'Sessão de renovação não encontrada' }, { status: 404 });
    }

    const session = sessionSnap.data() as RenewalSession;
    const userId = session.userId;

    const targetClientIds: string[] =
      Array.isArray(clientIds) && clientIds.length > 0
        ? clientIds
        : Array.isArray(session.clientIds)
        ? session.clientIds
        : [];

    if (targetClientIds.length === 0) {
      return NextResponse.json({ error: 'Nenhuma assinatura encontrada para remover' }, { status: 400 });
    }

    const removedNames: string[] = [];

    for (const cid of targetClientIds) {
      try {
        const clientRef = doc(db, 'users', userId, 'clients', cid);
        const clientSnap = await getDoc(clientRef);

        if (clientSnap.exists()) {
          const cData = clientSnap.data() as Client;
          removedNames.push(cData.subscription || 'Assinatura');
          await deleteDoc(clientRef);
          console.log(
            `[cancel-subscription] Assinatura ${cid} (${cData.subscription}) do cliente ${cData.name} REMOVIDA do CRM a pedido do cliente.`
          );
        } else {
          const subFromSession = (session.subscriptions || []).find((s) => s.clientId === cid);
          if (subFromSession?.name) removedNames.push(subFromSession.name);
        }
      } catch (err) {
        console.error(`[cancel-subscription] Erro ao remover cliente ${cid}:`, err);
      }
    }

    const remainingClientIds = (session.clientIds || []).filter((id) => !targetClientIds.includes(id));
    const remainingSubs = (session.subscriptions || []).filter(
      (s) => !targetClientIds.includes(s.clientId)
    );

    await updateDoc(sessionDocRef, {
      status: remainingClientIds.length === 0 ? 'expired' : session.status,
      clientIds: remainingClientIds,
      subscriptions: remainingSubs,
      canceledByClient: true,
      canceledAt: serverTimestamp(),
      removedClientIds: targetClientIds,
    }).catch(() => {});

    // Registra log no CRM
    await addDoc(collection(db, 'users', userId, 'logs'), {
      userId,
      type: 'Não Quero Renovar (Removido)',
      clientName: session.clientName || 'Cliente',
      target: session.phone || '',
      status: 'Removido',
      details: `Cliente clicou em "Não quero renovar". Assinatura(s) removida(s) do CRM: ${
        removedNames.join(', ') || 'Assinatura'
      }`,
      timestamp: serverTimestamp(),
    }).catch(() => {});

    return NextResponse.json({
      success: true,
      removedCount: targetClientIds.length,
      removedNames,
    });
  } catch (error: any) {
    console.error('[api/renewal/cancel-subscription] Erro:', error);
    return NextResponse.json(
      { error: error.message || 'Erro ao cancelar assinatura' },
      { status: 500 }
    );
  }
}
