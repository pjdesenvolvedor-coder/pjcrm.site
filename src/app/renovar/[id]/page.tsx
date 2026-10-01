'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  Check,
  Copy,
  Clock,
  ArrowLeft,
  Loader2,
  AlertTriangle,
  CheckCircle2,
  ThumbsUp,
  AlertOctagon,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import ProductIcon from '@/components/ProductIcon';

interface SubscriptionItem {
  clientId: string;
  name: string;
  value: string;
  email?: string[];
  screen?: string | null;
  currentDueDate?: any;
}

interface SessionData {
  id: string;
  clientName: string;
  phone: string;
  status: 'pending' | 'paid' | 'expired';
  subscriptions: SubscriptionItem[];
  pixCode?: string;
  pixQrCodeBase64?: string;
  pixTransactionId?: string;
  totalAmountPaid?: number;
}

export default function RenewalPage() {
  const params = useParams();
  const rawId = params?.id;
  const sessionId = Array.isArray(rawId) ? rawId[0] : rawId;

  const [loadingSession, setLoadingSession] = useState(true);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [session, setSession] = useState<SessionData | null>(null);

  // Estados do fluxo interativo
  // Etapas:
  // 'question' -> Pergunta: "Está tudo certo com sua assinatura?"
  // 'select_yes' -> Se clicou SIM e tem >1: escolhe quais quer renovar
  // 'report_issue' -> Se clicou NÃO: marca as que NÃO estão funcionando
  // 'select_after_issue' -> Escolhe quais vai renovar após reportar problema
  // 'pix' -> Exibe QR Code e Copia e Cola da LinkinPay
  // 'success' -> Pagamento confirmado com sucesso!
  const [step, setStep] = useState<
    'question' | 'select_yes' | 'report_issue' | 'select_after_issue' | 'pix' | 'success'
  >('question');

  // Seleções do cliente
  const [selectedToRenew, setSelectedToRenew] = useState<string[]>([]);
  const [brokenSubscriptions, setBrokenSubscriptions] = useState<string[]>([]);

  // Estados de geração de PIX e pagamento
  const [generatingPix, setGeneratingPix] = useState(false);
  const [pixData, setPixData] = useState<{
    qrCodeBase64: string;
    copyPaste: string;
    transactionId: string;
    amountInReais: string;
    subNames: string;
  } | null>(null);

  const [copied, setCopied] = useState(false);
  const [timeLeft, setTimeLeft] = useState(15 * 60); // 15 minutos
  const [pixError, setPixError] = useState<string | null>(null);

  // 1. Carrega dados da sessão de renovação
  useEffect(() => {
    if (!sessionId) return;

    async function loadSession() {
      try {
        setLoadingSession(true);
        const res = await fetch(`/api/renewal/details?sessionId=${sessionId}`);
        if (!res.ok) {
          throw new Error('Não foi possível carregar a sessão de renovação.');
        }
        const data = await res.json();
        if (data.session) {
          setSession(data.session);

          // Se a sessão já estava paga, vai direto para tela de sucesso
          if (data.session.status === 'paid') {
            setStep('success');
            return;
          }

          // Preenche por padrão todas as assinaturas selecionadas
          const allIds = (data.session.subscriptions || []).map((s: SubscriptionItem) => s.clientId);
          setSelectedToRenew(allIds);
        }
      } catch (e: any) {
        setSessionError(e.message || 'Erro ao carregar dados.');
      } finally {
        setLoadingSession(false);
      }
    }

    loadSession();
  }, [sessionId]);

  // 2. Timer regressivo de 15 minutos para o PIX
  useEffect(() => {
    if (step !== 'pix' || timeLeft <= 0) return;
    const timer = setInterval(() => {
      setTimeLeft((prev) => prev - 1);
    }, 1000);
    return () => clearInterval(timer);
  }, [step, timeLeft]);

  // 3. Polling em tempo real a cada 3s para detectar pagamento instantaneamente
  useEffect(() => {
    if (step !== 'pix' || !sessionId) return;

    let isSubscribed = true;
    const interval = setInterval(async () => {
      try {
        const res = await fetch('/api/renewal/check-status', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sessionId,
            transactionId: pixData?.transactionId,
          }),
        });

        const data = await res.json();
        if (data.paid && isSubscribed) {
          clearInterval(interval);
          setStep('success');
        }
      } catch (err) {
        console.error('Erro no polling do PIX:', err);
      }
    }, 3000);

    return () => {
      isSubscribed = false;
      clearInterval(interval);
    };
  }, [step, sessionId, pixData?.transactionId]);

  const subscriptions = session?.subscriptions || [];
  const hasMultiple = subscriptions.length > 1;

  // Assinaturas atualmente selecionadas para renovar
  const chosenSubs = useMemo(() => {
    return subscriptions.filter((s) => selectedToRenew.includes(s.clientId));
  }, [subscriptions, selectedToRenew]);

  // Valor total das assinaturas selecionadas
  const totalAmount = useMemo(() => {
    let sum = 0;
    for (const sub of chosenSubs) {
      const val = parseFloat(String(sub.value || '0').replace(',', '.'));
      sum += isNaN(val) ? 25 : val;
    }
    return sum;
  }, [chosenSubs]);

  const formattedTotalAmount = totalAmount.toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  const selectedNamesDisplay = useMemo(() => {
    if (chosenSubs.length === 0) return 'Nenhuma assinatura';
    return chosenSubs.map((s) => s.name).join(' + ');
  }, [chosenSubs]);

  // Copiar código PIX com feedback e vibração
  const handleCopy = () => {
    if (!pixData?.copyPaste) return;
    navigator.clipboard.writeText(pixData.copyPaste);
    if (typeof window !== 'undefined' && 'vibrate' in navigator) {
      try {
        navigator.vibrate(50);
      } catch {}
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 3000);
  };

  // Gerar PIX via API LinkinPay
  const handleGeneratePix = async () => {
    if (selectedToRenew.length === 0) {
      alert('Selecione pelo menos 1 assinatura para renovar.');
      return;
    }

    try {
      setGeneratingPix(true);
      setPixError(null);

      const res = await fetch('/api/renewal/create-pix', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          selectedClientIds: selectedToRenew,
          reportedIssueClientIds: brokenSubscriptions,
          payerName: session?.clientName,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Erro ao gerar cobrança PIX');
      }

      setPixData({
        qrCodeBase64: data.qrCodeBase64,
        copyPaste: data.copyPaste,
        transactionId: data.transactionId,
        amountInReais: data.amountInReais,
        subNames: data.subNames,
      });

      setTimeLeft(15 * 60);
      setStep('pix');
    } catch (err: any) {
      setPixError(err.message || 'Erro ao conectar ao gateway de pagamento.');
    } finally {
      setGeneratingPix(false);
    }
  };

  // Tempo formatado MM:SS
  const minutes = Math.floor(timeLeft / 60);
  const seconds = timeLeft % 60;
  const formattedTimer = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;

  // Se estiver carregando a sessão
  if (loadingSession) {
    return (
      <div className="min-h-screen bg-[#f3f4f6] dark:bg-zinc-950 flex items-center justify-center p-4">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-10 h-10 animate-spin text-red-600" />
          <p className="text-sm font-semibold text-zinc-600 dark:text-zinc-400">Carregando renovação...</p>
        </div>
      </div>
    );
  }

  // Se houver erro ou sessão inexistente
  if (sessionError || !session) {
    return (
      <div className="min-h-screen bg-[#f3f4f6] dark:bg-zinc-950 flex items-center justify-center p-4">
        <div className="w-full max-w-md bg-white dark:bg-zinc-900 rounded-3xl p-8 text-center shadow-xl border border-zinc-200 dark:border-zinc-800">
          <AlertTriangle className="w-14 h-14 text-red-600 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-zinc-900 dark:text-white mb-2">Link Expirado ou Inválido</h2>
          <p className="text-sm text-zinc-600 dark:text-zinc-400 mb-6">
            {sessionError || 'Esta sessão de renovação não foi encontrada.'}
          </p>
          <p className="text-xs text-zinc-400">Entre em contato pelo WhatsApp para solicitar um novo link de renovação.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f3f4f6] dark:bg-zinc-950 py-8 px-4 flex flex-col items-center justify-center font-sans antialiased text-zinc-900 dark:text-zinc-100">
      {/* TICKET CONTAINER (Layout do SITE RECEBER PAGAMENTO) */}
      <main className="w-full max-w-[420px] bg-white dark:bg-zinc-900 rounded-[32px] overflow-hidden shadow-2xl relative border border-zinc-200/80 dark:border-zinc-800">
        {/* TOPO VERMELHO COM CURVATURA */}
        <div className="w-full h-16 relative bg-gradient-to-r from-[#ff202a] via-[#f2111c] to-[#e50914] overflow-hidden">
          <div className="absolute -left-[8%] -bottom-6 w-[116%] h-10 bg-white dark:bg-zinc-900 rounded-[50%_50%_0_0/35%_35%_0_0]" />
        </div>

        {/* ========================================================================= */}
        {/* ETAPA 1: PERGUNTA INICIAL ("Está tudo certo com sua assinatura?") */}
        {/* ========================================================================= */}
        {step === 'question' && (
          <div className="px-6 pt-2 pb-8 text-center space-y-6">
            {/* Ícones de Produto / Streaming */}
            <div className="flex items-center justify-center gap-2.5 flex-wrap pt-2">
              {subscriptions.slice(0, 3).map((sub, idx) => (
                <ProductIcon
                  key={sub.clientId || idx}
                  name={sub.name}
                  style={{ width: '56px', height: '56px', borderRadius: '16px' }}
                />
              ))}
            </div>

            <div className="space-y-1">
              <span className="inline-block px-3 py-1 rounded-full text-[11px] font-black tracking-widest uppercase bg-red-100 dark:bg-red-950/60 text-red-600 dark:text-red-400">
                Renovação de Acesso
              </span>
              <h1 className="text-2xl font-black text-zinc-900 dark:text-white pt-2 leading-tight">
                Olá, {session.clientName}!
              </h1>
              <p className="text-sm font-semibold text-zinc-600 dark:text-zinc-400 pt-1">
                {hasMultiple
                  ? 'Está tudo certo com suas assinaturas?'
                  : 'Está tudo certo com sua assinatura?'}
              </p>
            </div>

            {/* DOIS BOTÕES DE ALTO CONTATO (VERDE E VERMELHO) */}
            <div className="space-y-3 pt-2">
              {/* Botão VERDE: Sim, tudo funcionando! */}
              <button
                type="button"
                onClick={() => {
                  if (hasMultiple) {
                    setStep('select_yes');
                  } else {
                    setSelectedToRenew([subscriptions[0].clientId]);
                    handleGeneratePix();
                  }
                }}
                className="w-full py-4 px-5 rounded-2xl bg-emerald-600 hover:bg-emerald-700 active:scale-[0.98] text-white font-extrabold text-base tracking-wide flex items-center justify-center gap-3 shadow-lg shadow-emerald-600/25 transition-all cursor-pointer"
              >
                <ThumbsUp className="w-5 h-5 shrink-0" />
                <span>Sim, tudo funcionando!</span>
              </button>

              {/* Botão VERMELHO: Não está funcionando */}
              <button
                type="button"
                onClick={() => {
                  setBrokenSubscriptions([]);
                  setStep('report_issue');
                }}
                className="w-full py-4 px-5 rounded-2xl bg-red-600 hover:bg-red-700 active:scale-[0.98] text-white font-extrabold text-base tracking-wide flex items-center justify-center gap-3 shadow-lg shadow-red-600/25 transition-all cursor-pointer"
              >
                <AlertOctagon className="w-5 h-5 shrink-0" />
                <span>Não está funcionando</span>
              </button>
            </div>

            {generatingPix && (
              <div className="flex items-center justify-center gap-2 text-xs font-bold text-red-600 pt-2 animate-pulse">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Gerando seu PIX de renovação...</span>
              </div>
            )}
          </div>
        )}

        {/* ========================================================================= */}
        {/* ETAPA 2A: SE CLICOU "SIM" E TEM > 1 ASSINATURA -> SELETOR DE QUAIS RENOVAR */}
        {/* ========================================================================= */}
        {step === 'select_yes' && (
          <div className="px-6 pt-2 pb-8 space-y-6">
            <div className="text-center space-y-1">
              <span className="text-[11px] font-black tracking-widest uppercase text-emerald-600 dark:text-emerald-400">
                Tudo Certo ✓
              </span>
              <h2 className="text-xl font-black text-zinc-900 dark:text-white">
                Quais assinaturas deseja renovar?
              </h2>
              <p className="text-xs text-zinc-500">
                Selecione as assinaturas que você quer manter ativas:
              </p>
            </div>

            {/* SELETORES DE ASSINATURA */}
            <div className="space-y-2.5">
              {subscriptions.map((sub) => {
                const isSelected = selectedToRenew.includes(sub.clientId);
                return (
                  <button
                    key={sub.clientId}
                    type="button"
                    onClick={() => {
                      if (isSelected) {
                        setSelectedToRenew(selectedToRenew.filter((id) => id !== sub.clientId));
                      } else {
                        setSelectedToRenew([...selectedToRenew, sub.clientId]);
                      }
                    }}
                    className={`w-full p-3.5 rounded-2xl border-2 flex items-center justify-between text-left transition-all cursor-pointer ${
                      isSelected
                        ? 'border-emerald-600 bg-emerald-50/70 dark:bg-emerald-950/30'
                        : 'border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-800/40 opacity-70'
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <ProductIcon name={sub.name} style={{ width: '44px', height: '44px', borderRadius: '12px' }} />
                      <div className="min-w-0">
                        <div className="font-bold text-sm text-zinc-900 dark:text-white truncate">
                          {sub.name}
                        </div>
                        <div className="text-xs text-zinc-500 font-medium">
                          R$ {parseFloat(String(sub.value).replace(',', '.') || '25').toFixed(2).replace('.', ',')}/mês
                        </div>
                      </div>
                    </div>

                    <div
                      className={`w-6 h-6 rounded-lg flex items-center justify-center border-2 transition-colors ${
                        isSelected
                          ? 'bg-emerald-600 border-emerald-600 text-white'
                          : 'border-zinc-300 dark:border-zinc-600 bg-transparent'
                      }`}
                    >
                      {isSelected && <Check className="w-4 h-4 stroke-[3]" />}
                    </div>
                  </button>
                );
              })}
            </div>

            {/* RESUMO NO TOPO / ABAIXO */}
            <div className="bg-zinc-100 dark:bg-zinc-800/60 rounded-2xl p-4 text-center space-y-1 border border-zinc-200/80 dark:border-zinc-700/50">
              <div className="text-xs font-bold text-zinc-500 uppercase tracking-wider">
                Assinaturas Selecionadas:
              </div>
              <div className="text-base font-black text-zinc-900 dark:text-white">
                {selectedNamesDisplay}
              </div>
              <div className="pt-2 text-2xl font-black text-emerald-600 dark:text-emerald-400">
                <span className="text-sm font-bold text-zinc-500">R$ </span>
                {formattedTotalAmount}
              </div>
            </div>

            {pixError && (
              <div className="p-3 bg-red-100 dark:bg-red-950/50 text-red-700 dark:text-red-300 rounded-xl text-xs font-semibold text-center">
                {pixError}
              </div>
            )}

            {/* BOTÕES DE AÇÃO */}
            <div className="space-y-2.5">
              <button
                type="button"
                onClick={handleGeneratePix}
                disabled={generatingPix || selectedToRenew.length === 0}
                className="w-full py-4 rounded-2xl bg-red-600 hover:bg-red-700 active:scale-[0.98] disabled:opacity-50 text-white font-black text-base uppercase tracking-wider flex items-center justify-center gap-2 shadow-lg shadow-red-600/30 transition-all cursor-pointer"
              >
                {generatingPix ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    <span>Gerando PIX...</span>
                  </>
                ) : (
                  <span>Avançar para Pagamento PIX →</span>
                )}
              </button>

              <button
                type="button"
                onClick={() => setStep('question')}
                className="w-full py-2.5 text-xs font-bold text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200 transition-colors flex items-center justify-center gap-1.5"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Voltar e alterar resposta</span>
              </button>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* ETAPA 2B: CLICOU "NÃO" -> MARCAR QUAIS NÃO ESTÃO FUNCIONANDO (OBRIGATÓRIO) */}
        {/* ========================================================================= */}
        {step === 'report_issue' && (
          <div className="px-6 pt-2 pb-8 space-y-6">
            <div className="text-center space-y-1">
              <span className="text-[11px] font-black tracking-widest uppercase text-red-600 dark:text-red-400">
                Suporte / Ajuste
              </span>
              <h2 className="text-xl font-black text-zinc-900 dark:text-white">
                {hasMultiple
                  ? 'Marque as assinaturas que NÃO estão funcionando:'
                  : 'Marque a assinatura que NÃO está funcionando:'}
              </h2>
              <p className="text-xs text-zinc-500">
                (Obrigatório marcar pelo menos 1 para podermos corrigir)
              </p>
            </div>

            <div className="space-y-2.5">
              {subscriptions.map((sub) => {
                const isMarkedBroken = brokenSubscriptions.includes(sub.clientId);
                return (
                  <button
                    key={sub.clientId}
                    type="button"
                    onClick={() => {
                      if (isMarkedBroken) {
                        setBrokenSubscriptions(brokenSubscriptions.filter((id) => id !== sub.clientId));
                      } else {
                        setBrokenSubscriptions([...brokenSubscriptions, sub.clientId]);
                      }
                    }}
                    className={`w-full p-3.5 rounded-2xl border-2 flex items-center justify-between text-left transition-all cursor-pointer ${
                      isMarkedBroken
                        ? 'border-red-600 bg-red-50/80 dark:bg-red-950/40'
                        : 'border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-800/40'
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <ProductIcon name={sub.name} style={{ width: '44px', height: '44px', borderRadius: '12px' }} />
                      <div className="min-w-0">
                        <div className="font-bold text-sm text-zinc-900 dark:text-white truncate">
                          {sub.name}
                        </div>
                        <div className="text-xs text-red-500 font-semibold">
                          {isMarkedBroken ? '⚠️ Problema relatado' : 'Clique para marcar com defeito'}
                        </div>
                      </div>
                    </div>

                    <div
                      className={`w-6 h-6 rounded-lg flex items-center justify-center border-2 transition-colors ${
                        isMarkedBroken
                          ? 'bg-red-600 border-red-600 text-white'
                          : 'border-zinc-300 dark:border-zinc-600 bg-transparent'
                      }`}
                    >
                      {isMarkedBroken && <Check className="w-4 h-4 stroke-[3]" />}
                    </div>
                  </button>
                );
              })}
            </div>

            <div className="space-y-2.5 pt-2">
              <button
                type="button"
                disabled={brokenSubscriptions.length === 0}
                onClick={() => {
                  // Passa para a pergunta de quais deseja renovar
                  setSelectedToRenew(subscriptions.map((s) => s.clientId));
                  setStep('select_after_issue');
                }}
                className="w-full py-4 rounded-2xl bg-red-600 hover:bg-red-700 active:scale-[0.98] disabled:opacity-40 text-white font-black text-base uppercase tracking-wider flex items-center justify-center gap-2 shadow-lg shadow-red-600/30 transition-all cursor-pointer"
              >
                <span>Avançar para Renovação →</span>
              </button>

              <button
                type="button"
                onClick={() => setStep('question')}
                className="w-full py-2 text-xs font-bold text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200 transition-colors flex items-center justify-center gap-1.5"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Voltar</span>
              </button>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* ETAPA 2C: APÓS RELATAR PROBLEMA -> QUAIS ASSINATURAS VOCÊ VAI RENOVAR? */}
        {/* ========================================================================= */}
        {step === 'select_after_issue' && (
          <div className="px-6 pt-2 pb-8 space-y-6">
            <div className="text-center space-y-1">
              <span className="text-[11px] font-black tracking-widest uppercase text-red-600 dark:text-red-400">
                Etapa Final
              </span>
              <h2 className="text-xl font-black text-zinc-900 dark:text-white">
                Quais assinaturas você vai renovar?
              </h2>
              <p className="text-xs text-zinc-500">
                (Obrigatório marcar pelo menos 1 para gerar o PIX)
              </p>
            </div>

            <div className="space-y-2.5">
              {subscriptions.map((sub) => {
                const isSelected = selectedToRenew.includes(sub.clientId);
                const hadProblem = brokenSubscriptions.includes(sub.clientId);

                return (
                  <button
                    key={sub.clientId}
                    type="button"
                    onClick={() => {
                      if (isSelected) {
                        setSelectedToRenew(selectedToRenew.filter((id) => id !== sub.clientId));
                      } else {
                        setSelectedToRenew([...selectedToRenew, sub.clientId]);
                      }
                    }}
                    className={`w-full p-3.5 rounded-2xl border-2 flex items-center justify-between text-left transition-all cursor-pointer ${
                      isSelected
                        ? 'border-emerald-600 bg-emerald-50/70 dark:bg-emerald-950/30'
                        : 'border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-800/40 opacity-70'
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <ProductIcon name={sub.name} style={{ width: '44px', height: '44px', borderRadius: '12px' }} />
                      <div className="min-w-0">
                        <div className="font-bold text-sm text-zinc-900 dark:text-white truncate">
                          {sub.name}
                        </div>
                        <div className="text-xs text-zinc-500 font-medium">
                          R$ {parseFloat(String(sub.value).replace(',', '.') || '25').toFixed(2).replace('.', ',')}/mês
                          {hadProblem && <span className="text-red-500 font-bold ml-1.5">(com suporte)</span>}
                        </div>
                      </div>
                    </div>

                    <div
                      className={`w-6 h-6 rounded-lg flex items-center justify-center border-2 transition-colors ${
                        isSelected
                          ? 'bg-emerald-600 border-emerald-600 text-white'
                          : 'border-zinc-300 dark:border-zinc-600 bg-transparent'
                      }`}
                    >
                      {isSelected && <Check className="w-4 h-4 stroke-[3]" />}
                    </div>
                  </button>
                );
              })}
            </div>

            {/* RESUMO */}
            <div className="bg-zinc-100 dark:bg-zinc-800/60 rounded-2xl p-4 text-center space-y-1 border border-zinc-200/80 dark:border-zinc-700/50">
              <div className="text-xs font-bold text-zinc-500 uppercase tracking-wider">
                Assinatura(s) a renovar:
              </div>
              <div className="text-base font-black text-zinc-900 dark:text-white">
                {selectedNamesDisplay}
              </div>
              <div className="pt-2 text-2xl font-black text-emerald-600 dark:text-emerald-400">
                <span className="text-sm font-bold text-zinc-500">R$ </span>
                {formattedTotalAmount}
              </div>
            </div>

            {pixError && (
              <div className="p-3 bg-red-100 dark:bg-red-950/50 text-red-700 dark:text-red-300 rounded-xl text-xs font-semibold text-center">
                {pixError}
              </div>
            )}

            <div className="space-y-2.5">
              <button
                type="button"
                onClick={handleGeneratePix}
                disabled={generatingPix || selectedToRenew.length === 0}
                className="w-full py-4 rounded-2xl bg-red-600 hover:bg-red-700 active:scale-[0.98] disabled:opacity-40 text-white font-black text-base uppercase tracking-wider flex items-center justify-center gap-2 shadow-lg shadow-red-600/30 transition-all cursor-pointer"
              >
                {generatingPix ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    <span>Gerando PIX...</span>
                  </>
                ) : (
                  <span>Prosseguir e Gerar PIX →</span>
                )}
              </button>

              <button
                type="button"
                onClick={() => setStep('report_issue')}
                className="w-full py-2 text-xs font-bold text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200 transition-colors flex items-center justify-center gap-1.5"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Voltar</span>
              </button>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* ETAPA 3: PAGAMENTO PIX (TICKET COM QR CODE, COPIA E COLA E COUNTDOWN) */}
        {/* ========================================================================= */}
        {step === 'pix' && pixData && (
          <div className="pb-8">
            {/* SEÇÃO DO PRODUTO / QR CODE */}
            <section className="px-6 pt-1 pb-4 text-center">
              <h2 className="text-2xl font-black tracking-tight text-zinc-900 dark:text-white uppercase">
                PAGAMENTO PIX
              </h2>

              <div className="inline-block my-2 px-3 py-1 rounded-full text-xs font-bold bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300">
                <span>{pixData.subNames}</span>
              </div>

              {/* CONTAINER QR CODE COM BORDA TRACEJADA */}
              <div className="flex flex-col items-center justify-center mt-2">
                <div className="p-3.5 bg-white rounded-3xl border-2 border-dashed border-red-200 dark:border-red-950 shadow-md">
                  {pixData.qrCodeBase64 ? (
                    <img
                      src={
                        pixData.qrCodeBase64.startsWith('data:')
                          ? pixData.qrCodeBase64
                          : `data:image/png;base64,${pixData.qrCodeBase64}`
                      }
                      alt="QR Code Pix"
                      className="w-48 h-48 sm:w-52 sm:h-52 object-contain rounded-2xl block"
                    />
                  ) : (
                    <div className="w-48 h-48 flex items-center justify-center bg-zinc-50 rounded-2xl text-zinc-400">
                      QR Code indisponível
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-2 text-xs font-extrabold text-zinc-600 dark:text-zinc-400 mt-3.5">
                  <Clock className="w-4 h-4 text-red-600 animate-pulse" />
                  <span>Expira em: {formattedTimer}</span>
                </div>
              </div>
            </section>

            {/* RECORTE DO TICKET (DESIGN COM LINHA TRACEJADA E MEIO-CÍRCULOS) */}
            <div className="relative w-full h-8 my-1 flex items-center justify-center">
              <div className="absolute -left-4 w-8 h-8 rounded-full bg-[#f3f4f6] dark:bg-zinc-950" />
              <div className="w-[84%] border-b-2 border-dashed border-zinc-200 dark:border-zinc-800" />
              <div className="absolute -right-4 w-8 h-8 rounded-full bg-[#f3f4f6] dark:bg-zinc-950" />
            </div>

            {/* SEÇÃO DE VALOR E BOTÃO DE COPIAR */}
            <section className="px-6 pt-2 text-center space-y-4">
              <div>
                <div className="text-[11px] font-black tracking-widest uppercase text-zinc-400">
                  VALOR DA RENOVAÇÃO
                </div>
                <div className="text-4xl font-black text-zinc-900 dark:text-white pt-0.5">
                  <span className="text-xl text-red-600 mr-1">R$</span>
                  <span>{pixData.amountInReais.replace('.', ',')}</span>
                  <span className="text-xs font-bold text-zinc-400 ml-1">/mês</span>
                </div>
              </div>

              {/* BOTÃO COPIAR CÓDIGO PIX */}
              <div>
                <button
                  type="button"
                  onClick={handleCopy}
                  className={`w-full py-4 px-6 rounded-2xl text-white font-black text-sm uppercase tracking-wider flex items-center justify-center gap-2.5 shadow-xl transition-all cursor-pointer ${
                    copied
                      ? 'bg-emerald-600 shadow-emerald-600/30'
                      : 'bg-red-600 hover:bg-red-700 active:scale-[0.98] shadow-red-600/30'
                  }`}
                >
                  {copied ? (
                    <>
                      <Check className="w-5 h-5 stroke-[3]" />
                      <span>CÓDIGO PIX COPIADO!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-5 h-5" />
                      <span>COPIAR CÓDIGO PIX</span>
                    </>
                  )}
                </button>
              </div>

              {/* Status Polling Live */}
              <div className="flex items-center justify-center gap-2 text-xs font-semibold text-zinc-500 pt-1">
                <Loader2 className="w-3.5 h-3.5 animate-spin text-red-600" />
                <span>Aguardando pagamento... A renovação é imediata!</span>
              </div>

              <div className="pt-2">
                <button
                  type="button"
                  onClick={() => setStep('question')}
                  className="text-xs font-bold text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors"
                >
                  ← Alterar assinaturas selecionadas
                </button>
              </div>
            </section>
          </div>
        )}

        {/* ========================================================================= */}
        {/* ETAPA 4: SUCESSO / PAGAMENTO APROVADO */}
        {/* ========================================================================= */}
        {step === 'success' && (
          <div className="px-6 pt-4 pb-10 text-center space-y-6">
            <div className="w-20 h-20 rounded-full bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 mx-auto flex items-center justify-center shadow-xl shadow-emerald-600/20">
              <CheckCircle2 className="w-12 h-12 stroke-[2.5]" />
            </div>

            <div className="space-y-2">
              <span className="inline-block px-3 py-1 rounded-full text-[11px] font-black tracking-widest uppercase bg-emerald-100 dark:bg-emerald-950 text-emerald-600 dark:text-emerald-400">
                Pagamento Aprovado
              </span>
              <h1 className="text-2xl font-black text-zinc-900 dark:text-white">
                Renovação Concluída com Sucesso!
              </h1>
              <p className="text-sm text-zinc-600 dark:text-zinc-400 leading-relaxed">
                Sua assinatura foi renovada por mais 30 dias. Os detalhes de confirmação foram enviados para o seu WhatsApp!
              </p>
            </div>

            <div className="p-4 bg-zinc-50 dark:bg-zinc-800/50 rounded-2xl border border-zinc-200 dark:border-zinc-800 text-left space-y-2">
              <div className="flex items-center gap-2 text-xs font-bold text-zinc-500 uppercase tracking-wider">
                <ShieldCheck className="w-4 h-4 text-emerald-600" />
                <span>Garantia de Acesso</span>
              </div>
              <p className="text-xs text-zinc-600 dark:text-zinc-300">
                Seus acessos continuam ativos normalmente. Caso tenha qualquer dúvida, nosso suporte está à disposição no WhatsApp.
              </p>
            </div>

            <div className="pt-2 text-xs text-zinc-400 font-medium">
              Obrigado pela preferência e bom entretenimento! 🚀
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
