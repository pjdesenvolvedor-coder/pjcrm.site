import { NextRequest, NextResponse } from 'next/server';
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore, doc, setDoc, getDoc, Timestamp } from 'firebase/firestore';
import { firebaseConfig } from '@/firebase/config';
import { getOrCreateRenewalSession, executeRenewalPayment, formatPhoneWith55 } from '@/lib/renewal-service';
import type { Client, Settings } from '@/lib/types';

export const dynamic = 'force-dynamic';

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
const db = getFirestore(app);

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action, userId, phone, clientName, products, sessionId } = body;

    if (!userId) {
      return NextResponse.json({ error: 'userId é obrigatório' }, { status: 400 });
    }

    // 1. CRIAÇÃO DE SESSÃO DE TESTE COM CLIENTES
    if (action === 'create') {
      if (!phone || !products || !Array.isArray(products) || products.length === 0) {
        return NextResponse.json({ error: 'Telefone e pelo menos 1 produto são obrigatórios' }, { status: 400 });
      }

      const cleanPhone = formatPhoneWith55(phone);
      const name = clientName?.trim() || 'Cliente Teste';
      const createdClients: Client[] = [];
      const timestampNow = Timestamp.now();

      // Cria ou atualiza os clientes no Firestore para permitir atualização real do CRM no teste
      for (let i = 0; i < products.length; i++) {
        const prod = products[i];
        const prodName = prod.name?.trim() || `Produto ${i + 1}`;
        const prodValue = prod.value ? String(prod.value).replace(',', '.') : '25.00';
        const clientId = `test_${cleanPhone.slice(-6)}_${Date.now()}_${i}`;

        const clientData: any = {
          id: clientId,
          name,
          phone: cleanPhone,
          subscription: prodName,
          amountPaid: prodValue,
          status: 'Vencido',
          dueDate: timestampNow,
          createdAt: timestampNow,
          renewalCount: 0,
          email: [`teste_${Date.now()}@exemplo.com`],
          notes: '🧪 Assinatura de teste gerada para validação de renovação PIX',
        };

        const clientRef = doc(db, 'users', userId, 'clients', clientId);
        await setDoc(clientRef, clientData);
        createdClients.push(clientData);
      }

      const origin = req.headers.get('origin') || 'https://pjcrm.site';
      const { session, link } = await getOrCreateRenewalSession(userId, createdClients, origin, true /* forceNew */, true /* isTest */);

      return NextResponse.json({
        success: true,
        sessionId: session.id,
        link,
        clientIds: createdClients.map((c) => c.id),
        subscriptions: session.subscriptions,
      });
    }

    // 2. SIMULAÇÃO DE PAGAMENTO APROVADO
    if (action === 'simulate-paid') {
      if (!sessionId) {
        return NextResponse.json({ error: 'sessionId é obrigatório' }, { status: 400 });
      }

      const sessionDocRef = doc(db, 'renewal_sessions', sessionId);
      const snap = await getDoc(sessionDocRef);
      if (!snap.exists()) {
        return NextResponse.json({ error: 'Sessão não encontrada' }, { status: 404 });
      }

      const sessionData = snap.data();
      const subs = sessionData.subscriptions || [];
      const totalCents = subs.reduce((acc: number, s: any) => acc + Math.round(parseFloat(s.value || '0') * 100), 0);

      const targetIds = (sessionData.renewedClientIds && sessionData.renewedClientIds.length > 0)
        ? sessionData.renewedClientIds
        : (sessionData.clientIds || subs.map((s: any) => s.clientId));

      const result = await executeRenewalPayment({
        sessionId,
        pixTransactionId: `simulated_test_${Date.now()}`,
        amountInCents: totalCents,
        renewedClientIds: targetIds,
        reportedIssues: sessionData.reportedIssues || [],
      });

      return NextResponse.json({
        success: true,
        result,
      });
    }

    // 3. ENVIO REAL DE MENSAGEM VIA WHATSAPP (UAZAPI)
    if (action === 'send-whatsapp') {
      const { targetPhone, message, renewalLink, buttonLabel, footerText, chosenZap } = body;
      if (!targetPhone || !message) {
        return NextResponse.json({ error: 'Telefone e mensagem são obrigatórios' }, { status: 400 });
      }

      const configSnap = await getDoc(doc(db, 'users', userId, 'settings', 'config'));
      const settings = configSnap.exists() ? (configSnap.data() as Settings) : {};
      
      const { resolveRenewalWhatsAppTokens, sendWhatsAppWithFallback, sendWhatsAppButtonWithFallback } = await import('@/lib/renewal-service');
      
      // Se o usuário selecionou uma instância específica na tela de teste, aplica
      const customSettings = {
        ...settings,
        renewalZapInstance: (chosenZap || settings.renewalZapInstance || 'auto') as any,
      };

      const { primaryToken, fallbackToken } = resolveRenewalWhatsAppTokens(customSettings);

      if (!primaryToken && !fallbackToken) {
        return NextResponse.json(
          { error: 'Nenhum token de WhatsApp conectado. Conecte sua instância nas configurações.' },
          { status: 400 }
        );
      }

      let result: any;
      if (renewalLink) {
        result = await sendWhatsAppButtonWithFallback({
          number: targetPhone,
          text: message,
          footerText: footerText || settings.renewalFooterText || 'Entrega Automática • ⬇️Clique No Botão⬇️',
          buttonLabel: buttonLabel || settings.renewalButtonText || 'SIM, RENOVAR AGORA',
          buttonUrl: renewalLink,
          primaryToken,
          fallbackToken,
        });
      } else {
        result = await sendWhatsAppWithFallback(targetPhone, message, primaryToken, fallbackToken);
      }

      if (!result.success) {
        return NextResponse.json(
          { error: `Falha ao enviar via WhatsApp: ${result.error || 'Token inválido ou desconectado'}` },
          { status: 500 }
        );
      }

      return NextResponse.json({ 
        success: true, 
        message: result.withButton 
          ? 'Mensagem com botão [SIM, RENOVAR AGORA] enviada com sucesso no WhatsApp!' 
          : 'Mensagem de teste enviada com sucesso no WhatsApp!',
        tokenUsed: result.tokenUsed?.slice(0, 10) + '...',
        withButton: result.withButton ?? false,
      });
    }

    return NextResponse.json({ error: 'Ação não reconhecida' }, { status: 400 });
  } catch (err: any) {
    console.error('[test-session] Erro geral:', err);
    return NextResponse.json({ error: err.message || 'Erro interno' }, { status: 500 });
  }
}
