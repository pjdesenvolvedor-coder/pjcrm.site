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
    const { userId, clientIds, isSimulation, originUrl, force } = body;

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

    // Data de hoje em Brasília (UTC-3)
    const offset = -3 * 60 * 60 * 1000;
    const nowBr = new Date(Date.now() + offset);
    const todayDateBrasilia = format(nowBr, 'yyyy-MM-dd');

    // Bloqueio anti-duplicidade: impede cobrar novamente quem já recebeu cobrança hoje (se não for force manual)
    if (!force) {
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

    // 5. Monta a mensagem personalizada (sempre o modelo oficial de Cobrança com Botão)
    // Se tiver mais de 1 assinatura, os nomes vão separados por vírgula na tag {assinaturas}
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

    const defaultTemplate =
      'Olá *{cliente}*! Sua assinatura está próxima do vencimento.\n\n' +
      '📦 *Assinatura(s):* {assinaturas}\n' +
      '📅 *Vencimento:* {vencimento}\n\n' +
      '👉 Para renovar com segurança via PIX e manter seu acesso ativo sem interrupções, clique no botão oficial abaixo:';

    let template = settings.renewalBillingMessage?.trim() || defaultTemplate;

    // Remove tags de links crus do corpo do texto pois irão no botão interativo nativo
    template = template
      .replace(/🔗?\s*{link_renovacao}/gi, '')
      .replace(/🔗?\s*{link}/gi, '')
      .trim();

    const todayFormatted = format(new Date(), 'dd/MM');
    const dueFormatted = `${todayFormatted} *Hoje*`;

    const formattedMessage = template
      .replace(/{cliente}/g, primaryClient.name || 'Cliente')
      .replace(/{telefone}/g, primaryClient.phone || '')
      .replace(
        /{email}/g,
        Array.isArray(primaryClient.email)
          ? primaryClient.email.join(', ')
          : primaryClient.email || ''
      )
      .replace(/{assinatura}/g, subNamesComma)
      .replace(/{assinaturas}/g, subNamesComma)
      .replace(/{vencimento}\s*\*?Hoje\*?/gi, dueFormatted)
      .replace(/{vencimento}/g, dueFormatted)
      .replace(/{valor}/g, formattedValor)
      .replace(/{senha}/g, primaryClient.password || 'N/A')
      .replace(/{tela}/g, primaryClient.screen || 'N/A')
      .replace(/{pin_tela}/g, primaryClient.pinScreen || 'N/A')
      .replace(/{status}/g, 'Vencido');

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

    // 8. Atualiza status para 'Vencido' e grava lastBilledDate de todos os clientes do grupo
    for (const c of clientGroup) {
      try {
        const clientRef = doc(db, 'users', userId, 'clients', c.id);
        await updateDoc(clientRef, {
          lastBilledDate: todayDateBrasilia,
          lastBilledAt: serverTimestamp(),
          status: 'Vencido',
        });
      } catch (clientUpdateErr) {
        console.warn(`[dispatch-single] Falha ao atualizar lastBilledDate do cliente ${c.id}:`, clientUpdateErr);
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
