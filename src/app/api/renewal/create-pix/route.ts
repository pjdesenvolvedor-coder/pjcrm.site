import { NextRequest, NextResponse } from 'next/server';
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore, doc, getDoc, updateDoc } from 'firebase/firestore';
import { firebaseConfig } from '@/firebase/config';
import { createLinkinPayPix, DEFAULT_LINKINPAY_TOKEN } from '@/lib/linkinpay';
import { createPjPayPix, DEFAULT_PJPAY_TOKEN } from '@/lib/pjpay';
import type { RenewalSession, Settings } from '@/lib/types';

export const dynamic = 'force-dynamic';

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
const db = getFirestore(app);

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      sessionId,
      selectedClientIds,
      reportedIssueClientIds = [],
      payerName,
      payerDocument,
    } = body;

    if (!sessionId) {
      return NextResponse.json({ error: 'sessionId é obrigatório' }, { status: 400 });
    }

    if (!selectedClientIds || !Array.isArray(selectedClientIds) || selectedClientIds.length === 0) {
      return NextResponse.json({ error: 'Selecione ao menos 1 assinatura para renovar' }, { status: 400 });
    }

    const sessionDocRef = doc(db, 'renewal_sessions', sessionId);
    const sessionSnap = await getDoc(sessionDocRef);

    if (!sessionSnap.exists()) {
      return NextResponse.json({ error: 'Sessão não encontrada' }, { status: 404 });
    }

    const session = sessionSnap.data() as RenewalSession;
    const userId = session.userId;

    // Buscar configurações do usuário para gateway e tokens
    let configData: Settings | null = null;
    try {
      const configSnap = await getDoc(doc(db, 'users', userId, 'settings', 'config'));
      if (configSnap.exists()) {
        configData = configSnap.data() as Settings;
      }
    } catch (err) {
      console.warn('[create-pix] Erro ao carregar configurações do usuário:', err);
    }

    // Define qual gateway utilizar (pjpay ou linkinpay)
    const chosenGateway: 'pjpay' | 'linkinpay' = configData?.renewalPixGateway || 'pjpay';

    // Filtra apenas as assinaturas que o cliente escolheu renovar
    const chosenSubs = (session.subscriptions || []).filter((s) => selectedClientIds.includes(s.clientId));

    if (chosenSubs.length === 0) {
      return NextResponse.json({ error: 'Nenhuma assinatura válida selecionada' }, { status: 400 });
    }

    // Calcula valor total em centavos
    let totalCents = 0;
    for (const sub of chosenSubs) {
      const parsed = parseFloat(String(sub.value || '0').replace(',', '.'));
      totalCents += Math.round((isNaN(parsed) || parsed <= 0 ? 25 : parsed) * 100);
    }

    if (totalCents <= 0) {
      totalCents = 2500; // Fallback mínimo R$ 25,00
    }

    // Monta webhook_url do nosso próprio servidor
    const host = req.headers.get('host') || 'pjcrm.site';
    const proto = host.includes('localhost') ? 'http' : 'https';
    const webhookUrl = `${proto}://${host}/api/renewal-webhook?sessionId=${sessionId}&gateway=${chosenGateway}`;

    const subNames = chosenSubs.map((s) => s.name).join(' + ');
    const description = `Renovacao: ${subNames.slice(0, 50)}`;

    // Nome completo do cliente cadastrado no CRM
    const finalPayerName = (payerName || session.clientName || '').trim() || 'Cliente';

    let pixRes: { id: string; qr_code: string; qr_code_base64: string };

    if (chosenGateway === 'pjpay') {
      const pjpayToken = configData?.pjpayToken?.trim() || DEFAULT_PJPAY_TOKEN;
      console.log(`[create-pix] Gerando PIX via PJ Pay Gateway para ${finalPayerName} (R$ ${(totalCents / 100).toFixed(2)})`);

      pixRes = await createPjPayPix({
        amountInCents: totalCents,
        payerName: finalPayerName,
        description,
        webhookUrl,
        apiToken: pjpayToken,
      });
    } else {
      const linkinpayToken = configData?.linkinpayToken?.trim() || DEFAULT_LINKINPAY_TOKEN;
      console.log(`[create-pix] Gerando PIX via LinkinPay para ${finalPayerName} (R$ ${(totalCents / 100).toFixed(2)})`);

      pixRes = await createLinkinPayPix({
        amountInCents: totalCents,
        payerName: finalPayerName,
        payerDocument: payerDocument,
        description,
        webhookUrl,
        apiToken: linkinpayToken,
      });
    }

    const reportedIssues = (reportedIssueClientIds || []).map((cid: string) => {
      const sub = (session.subscriptions || []).find((s) => s.clientId === cid);
      return {
        clientId: cid,
        subscriptionName: sub?.name || 'Assinatura',
      };
    });

    // Atualiza a sessão com os dados do PIX e gateway utilizado
    await updateDoc(sessionDocRef, {
      gateway: chosenGateway,
      pixTransactionId: pixRes.id,
      pixCode: pixRes.qr_code,
      pixQrCodeBase64: pixRes.qr_code_base64,
      totalAmountPaid: totalCents,
      renewedClientIds: selectedClientIds,
      reportedIssues,
      status: 'pending',
    });

    return NextResponse.json({
      success: true,
      gateway: chosenGateway,
      transactionId: pixRes.id,
      copyPaste: pixRes.qr_code,
      qrCodeBase64: pixRes.qr_code_base64,
      amountInCents: totalCents,
      amountInReais: (totalCents / 100).toFixed(2),
      subNames,
    });
  } catch (error: any) {
    console.error('[api/renewal/create-pix] Erro:', error);
    return NextResponse.json({ error: error.message || 'Erro ao gerar PIX' }, { status: 500 });
  }
}
