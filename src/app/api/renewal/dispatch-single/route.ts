import { NextRequest, NextResponse } from 'next/server';
import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getFirestore,
  doc,
  getDoc,
  collection,
  addDoc,
  serverTimestamp,
} from 'firebase/firestore';
import { firebaseConfig } from '@/firebase/config';
import { format } from 'date-fns';
import type { Client, Settings } from '@/lib/types';
import {
  getOrCreateRenewalSession,
  resolveRenewalWhatsAppTokens,
  sendWhatsAppButtonWithFallback,
} from '@/lib/renewal-service';

export const dynamic = 'force-dynamic';

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
const db = getFirestore(app);

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { userId, clientIds, isSimulation, originUrl } = body;

    if (!userId) {
      return NextResponse.json({ error: 'userId é obrigatório.' }, { status: 400 });
    }

    if (isSimulation) {
      // Simulação rápida para demonstração da barra de progresso
      return NextResponse.json({
        success: true,
        simulated: true,
        message: 'Disparo simulado com sucesso (nenhuma mensagem enviada ao WhatsApp).',
      });
    }

    if (!clientIds || !Array.isArray(clientIds) || clientIds.length === 0) {
      return NextResponse.json(
        { error: 'clientIds é obrigatório e deve ser uma lista não vazia.' },
        { status: 400 }
      );
    }

    // 1. Carrega configurações do usuário
    const configSnap = await getDoc(doc(db, 'users', userId, 'settings', 'config'));
    if (!configSnap.exists()) {
      return NextResponse.json(
        { error: 'Configurações de automação não encontradas.' },
        { status: 404 }
      );
    }
    const settings = configSnap.data() as Settings;

    // 2. Resolve instâncias de WhatsApp
    const { primaryToken, fallbackToken } = resolveRenewalWhatsAppTokens(settings);
    if (!primaryToken && !fallbackToken) {
      return NextResponse.json(
        { error: 'Nenhum WhatsApp conectado (Hub Principal ou Zap Cobrança).' },
        { status: 400 }
      );
    }

    // 3. Carrega os clientes do grupo
    const clientDocs = await Promise.all(
      clientIds.map((cid: string) => getDoc(doc(db, 'users', userId, 'clients', cid)))
    );
    const clientGroup = clientDocs
      .filter((snap) => snap.exists())
      .map((snap) => ({ id: snap.id, ...snap.data() } as Client));

    if (clientGroup.length === 0) {
      return NextResponse.json(
        { error: 'Nenhum cliente válido encontrado com os IDs fornecidos.' },
        { status: 404 }
      );
    }

    const primaryClient = clientGroup[0];
    const origin = originUrl || req.nextUrl.origin || 'https://pjcrm.site';

    // 4. Cria ou recupera a sessão de renovação
    let renewalLink = '';
    try {
      const sessionResult = await getOrCreateRenewalSession(userId, clientGroup, origin);
      renewalLink = sessionResult.link;
    } catch (sessionErr: any) {
      console.error('[dispatch-single] Erro ao criar sessão de renovação:', sessionErr);
      return NextResponse.json(
        { error: `Falha ao gerar link de renovação: ${sessionErr.message}` },
        { status: 500 }
      );
    }

    // 5. Monta a mensagem personalizada
    const hasMultiple = clientGroup.length > 1;
    const subNames = clientGroup.map((c) => c.subscription || 'Assinatura').join(' + ');
    const subListBullet = clientGroup.map((c) => `👉 *${c.subscription || 'Assinatura'}*`).join('\n');

    let formattedMessage = '';
    if (hasMultiple) {
      formattedMessage =
        `Olá *${primaryClient.name}*!\n\n` +
        `Notamos que você tem *${clientGroup.length} assinaturas* com vencimento hoje:\n\n` +
        `${subListBullet}\n\n` +
        `👉 *Para renovar com facilidade via PIX e manter seus acessos ativos, clique no botão oficial abaixo:*\n\n_Ao pagar, seu acesso é renovado de imediato!_`;
    } else {
      const defaultTemplate =
        'Olá *{cliente}*! Sua assinatura está próxima do vencimento.\n\n' +
        '📦 *Assinatura(s):* {assinaturas}\n' +
        '📅 *Vencimento:* {vencimento}\n\n' +
        '👉 Para renovar com segurança via PIX e manter seu acesso ativo sem interrupções, clique no botão oficial abaixo:';

      let template = settings.renewalBillingMessage?.trim() || defaultTemplate;

      // Remove links crus do corpo do texto pois irão no botão interativo nativo
      template = template
        .replace(/🔗?\s*{link_renovacao}/gi, '')
        .replace(/🔗?\s*{link}/gi, '')
        .trim();

      const todayFormatted = format(new Date(), 'dd/MM');
      const dueFormatted = `${todayFormatted} *Hoje*`;

      formattedMessage = template
        .replace(/{cliente}/g, primaryClient.name || 'Cliente')
        .replace(/{telefone}/g, primaryClient.phone || '')
        .replace(
          /{email}/g,
          Array.isArray(primaryClient.email)
            ? primaryClient.email.join(', ')
            : primaryClient.email || ''
        )
        .replace(/{assinatura}/g, primaryClient.subscription || '')
        .replace(/{assinaturas}/g, primaryClient.subscription || '')
        .replace(/{vencimento}\s*\*?Hoje\*?/gi, dueFormatted)
        .replace(/{vencimento}/g, dueFormatted)
        .replace(/{valor}/g, primaryClient.amountPaid || '0,00')
        .replace(/{senha}/g, primaryClient.password || 'N/A')
        .replace(/{tela}/g, primaryClient.screen || 'N/A')
        .replace(/{pin_tela}/g, primaryClient.pinScreen || 'N/A')
        .replace(/{status}/g, 'Vencido');
    }

    // 6. Envia via WhatsApp com Botão Interativo
    const buttonLabel = settings.renewalButtonText || 'SIM, RENOVAR AGORA';
    const footerText = settings.renewalFooterText || 'Entrega Automática • ⬇️Clique No Botão⬇️';

    const sendRes = await sendWhatsAppButtonWithFallback({
      number: primaryClient.phone,
      text: formattedMessage,
      footerText,
      buttonLabel,
      buttonUrl: renewalLink,
      primaryToken,
      fallbackToken,
    });

    // 7. Registra Log
    try {
      await addDoc(collection(db, 'users', userId, 'logs'), {
        userId,
        type: 'Cobrança Manual',
        clientName: primaryClient.name,
        target: primaryClient.phone,
        status: sendRes.success ? 'Enviado' : 'Erro',
        details: `${clientGroup.length} assinatura(s): ${subNames} ${sendRes.error ? `(Erro: ${sendRes.error})` : ''}`,
        timestamp: serverTimestamp(),
      });
    } catch (logErr) {
      console.warn('[dispatch-single] Falha ao registrar log:', logErr);
    }

    if (!sendRes.success) {
      return NextResponse.json(
        {
          error: sendRes.error || 'Falha ao enviar mensagem no WhatsApp.',
          tokenUsed: sendRes.tokenUsed,
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      clientName: primaryClient.name,
      phone: primaryClient.phone,
      renewalLink,
      tokenUsed: sendRes.tokenUsed,
      withButton: sendRes.withButton,
    });
  } catch (err: any) {
    console.error('[dispatch-single] Erro inesperado:', err);
    return NextResponse.json(
      { error: err.message || 'Erro interno ao processar disparo.' },
      { status: 500 }
    );
  }
}
