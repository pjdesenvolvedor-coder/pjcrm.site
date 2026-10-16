import { NextRequest, NextResponse } from 'next/server';
import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getFirestore,
  doc,
  getDoc,
  collection,
  addDoc,
  updateDoc,
  serverTimestamp,
  arrayUnion,
} from 'firebase/firestore';
import { firebaseConfig } from '@/firebase/config';
import { format } from 'date-fns';
import type { Client, Settings } from '@/lib/types';
import {
  getOrCreateRenewalSession,
  resolveRenewalWhatsAppTokens,
  sendWhatsAppButtonWithFallback,
  sendWhatsAppWithFallback,
  verifyPendingRenewalSessions,
} from '@/lib/renewal-service';

export const dynamic = 'force-dynamic';

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
const db = getFirestore(app);

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { userId, clientIds, isSimulation, originUrl, force, followUpStepId } = body;

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

    // 2.5. Antes de disparar cobrança ou remarketing, verifica se o cliente já pagou algum PIX pendente!
    await verifyPendingRenewalSessions(userId, settings).catch(() => {});

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

    // Se for disparo de etapa de remarketing e o cliente já estiver Ativo (já renovou), cancela envio imediatamente
    if (followUpStepId && clientGroup.every((c) => c.status === 'Ativo')) {
      return NextResponse.json({
        ok: true,
        success: true,
        skipped: true,
        message: `Cliente ${primaryClient.name} já renovou sua assinatura. Remarketing cancelado.`,
      });
    }

    // Data de hoje em Brasília (UTC-3)
    const offset = -3 * 60 * 60 * 1000;
    const nowBr = new Date(Date.now() + offset);
    const todayDateBrasilia = format(nowBr, 'yyyy-MM-dd');

    // Bloqueio anti-duplicidade: impede cobrar novamente quem já recebeu cobrança hoje (se não for force manual e não for remarketing)
    if (!force && !followUpStepId) {
      const alreadyBilled = clientGroup.some((c) => c.lastBilledDate === todayDateBrasilia);
      if (alreadyBilled) {
        return NextResponse.json({
          success: true,
          skipped: true,
          tokenUsed: 'Bloqueio Anti-Duplicata (Já cobrado hoje)',
          clientName: primaryClient.name,
          phone: primaryClient.phone,
          message: `Cliente ${primaryClient.name} já foi cobrado hoje (${todayDateBrasilia}). Disparo ignorado para evitar duplicatas.`,
        });
      }
    }

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
    const subNamesComma = clientGroup
      .map((c) => c.subscription?.trim() || 'Assinatura')
      .filter(Boolean)
      .join(', ');

    const totalVal = clientGroup.reduce((acc, c) => {
      const parsed = parseFloat(String(c.amountPaid || '0').replace(/\./g, '').replace(',', '.'));
      return acc + (isNaN(parsed) ? 0 : parsed);
    }, 0);
    const formattedValor = totalVal > 0
      ? totalVal.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
      : (primaryClient.amountPaid || '0,00');

    const followUpStep = followUpStepId
      ? (settings.renewalFollowUpSteps || []).find((s) => s.id === followUpStepId)
      : null;

    const defaultTemplate =
      'Olá *{cliente}*! Sua assinatura está próxima do vencimento.\n\n' +
      '📦 *Assinatura(s):* {assinaturas}\n' +
      '📅 *Vencimento:* {vencimento}\n\n' +
      '👉 Para renovar com segurança via PIX e manter seu acesso ativo sem interrupções, clique no botão oficial abaixo:';

    let template = followUpStep
      ? (followUpStep.message?.trim() || defaultTemplate)
      : (settings.renewalBillingMessage?.trim() || defaultTemplate);

    const shouldSendButton = followUpStep ? followUpStep.includeRenewalButton !== false : true;

    // Se usar botão interativo, remove tags de links crus do corpo do texto
    if (shouldSendButton) {
      template = template
        .replace(/🔗?\s*{link_renovacao}/gi, '')
        .replace(/🔗?\s*{link}/gi, '')
        .trim();
    }

    const todayFormatted = format(new Date(), 'dd/MM');
    const dueFormatted = `${todayFormatted} *Hoje*`;

    const formattedMessage = template
      .replace(/{cliente}/gi, primaryClient.name || 'Cliente')
      .replace(/{nome}/gi, primaryClient.name || 'Cliente')
      .replace(/{telefone}/gi, primaryClient.phone || '')
      .replace(
        /{email}/gi,
        Array.isArray(primaryClient.email)
          ? primaryClient.email.join(', ')
          : primaryClient.email || ''
      )
      .replace(/{assinatura}/gi, subNamesComma)
      .replace(/{assinaturas}/gi, subNamesComma)
      .replace(/{vencimento}\s*\*?Hoje\*?/gi, dueFormatted)
      .replace(/{vencimento}/gi, dueFormatted)
      .replace(/{valor}/gi, formattedValor)
      .replace(/{link_renovacao}/gi, renewalLink)
      .replace(/{link}/gi, renewalLink)
      .replace(/{senha}/gi, primaryClient.password || 'N/A')
      .replace(/{tela}/gi, primaryClient.screen || 'N/A')
      .replace(/{pin_tela}/gi, primaryClient.pinScreen || 'N/A')
      .replace(/{status}/gi, 'Vencido');

    // 6. Envia via WhatsApp (com Botão Interativo ou Texto)
    const buttonLabel = (followUpStep?.customButtonText?.trim()) || settings.renewalButtonText || 'SIM, RENOVAR AGORA';
    const footerText = (followUpStep?.customFooterText?.trim()) || settings.renewalFooterText || 'Entrega Automática • ⬇️Clique No Botão⬇️';
    const shouldIncludeCancel = followUpStep
      ? (followUpStep.includeCancelButton !== undefined ? followUpStep.includeCancelButton : followUpStep.id === 'step_3')
      : false;
    const cancelButtonLabel = followUpStep?.cancelButtonText?.trim() || 'Não quero renovar';
    const cancelButtonUrl = shouldIncludeCancel ? `${renewalLink}?action=cancel` : undefined;

    let sendRes: { success: boolean; tokenUsed: string; withButton?: boolean; error?: string };
    if (shouldSendButton) {
      sendRes = await sendWhatsAppButtonWithFallback({
        number: primaryClient.phone,
        text: formattedMessage,
        footerText,
        buttonLabel,
        buttonUrl: renewalLink,
        cancelButtonLabel,
        cancelButtonUrl,
        primaryToken,
        fallbackToken,
      });
    } else {
      const textRes = await sendWhatsAppWithFallback(
        primaryClient.phone,
        formattedMessage,
        primaryToken,
        fallbackToken
      );
      sendRes = { ...textRes, withButton: false };
    }

    // 7. Registra Log
    try {
      await addDoc(collection(db, 'users', userId, 'logs'), {
        userId,
        type: followUpStep ? `Remarketing Renovação (${followUpStep.name})` : 'Cobrança Manual',
        clientName: primaryClient.name,
        target: primaryClient.phone,
        status: sendRes.success ? 'Enviado' : 'Erro',
        details: `${clientGroup.length} assinatura(s): ${subNamesComma} ${sendRes.error ? `(Erro: ${sendRes.error})` : ''}`,
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

    // 8. Atualiza clientes do grupo
    for (const c of clientGroup) {
      try {
        const clientRef = doc(db, 'users', userId, 'clients', c.id);
        if (followUpStep) {
          await updateDoc(clientRef, {
            sentRenewalFollowUpIds: arrayUnion(followUpStep.id),
          });
        } else {
          await updateDoc(clientRef, {
            lastBilledDate: todayDateBrasilia,
            lastBilledAt: serverTimestamp(),
            sentRenewalFollowUpIds: [],
            status: 'Vencido',
          });
        }
      } catch (clientUpdateErr) {
        console.warn(`[dispatch-single] Falha ao atualizar cliente ${c.id}:`, clientUpdateErr);
      }
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
