'use client';

import React, { useState, useEffect } from 'react';
import { PageHeader } from '@/components/page-header';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { useFirebase, useUser, useDoc, useMemoFirebase, useCollection } from '@/firebase';
import { collection, query, orderBy, doc } from 'firebase/firestore';
import type { Subscription, Settings } from '@/lib/types';
import {
  Sparkles,
  Link as LinkIcon,
  Copy,
  ExternalLink,
  Send,
  CheckCircle2,
  AlertTriangle,
  Plus,
  Trash2,
  Loader2,
  Zap,
  Check,
  Smartphone,
  CreditCard,
  QrCode,
  ShieldCheck,
  RefreshCw,
  DollarSign,
} from 'lucide-react';
import ProductIcon from '@/components/ProductIcon';
import { cn } from '@/lib/utils';

interface TestProduct {
  name: string;
  value: string;
}

const DEFAULT_PRESET_PRODUCTS = [
  { name: 'Netflix 4K Ultra HD', value: '35.00' },
  { name: 'Disney+ Premium', value: '25.00' },
  { name: 'Max (HBO) Multitelas', value: '27.90' },
  { name: 'Prime Video', value: '19.90' },
  { name: 'Globoplay + Canais', value: '29.90' },
  { name: 'Spotify Família', value: '15.00' },
  { name: 'IPTV Canais + Filmes', value: '30.00' },
];

export default function TestRenewalPage() {
  const { firestore } = useFirebase();
  const { user } = useUser();
  const { toast } = useToast();

  // Configurações do CRM
  const settingsDocRef = useMemoFirebase(() => {
    if (!user) return null;
    return doc(firestore, 'users', user.uid, 'settings', 'config');
  }, [firestore, user]);
  const { data: settings } = useDoc<Settings>(settingsDocRef);

  // Assinaturas cadastradas no sistema do usuário
  const subscriptionsQuery = useMemoFirebase(() => {
    if (!user) return null;
    return query(collection(firestore, 'users', user.uid, 'subscriptions'), orderBy('name'));
  }, [firestore, user]);
  const { data: userSubscriptions } = useCollection<Subscription>(subscriptionsQuery);

  // Estados do formulário de teste
  const [phone, setPhone] = useState('77998413534');
  const [clientName, setClientName] = useState('Cliente Teste');
  const [products, setProducts] = useState<TestProduct[]>([
    { name: 'Netflix 4K Ultra HD', value: '35.00' },
  ]);

  // Estados de execução do teste
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedSessionId, setGeneratedSessionId] = useState<string | null>(null);
  const [generatedLink, setGeneratedLink] = useState<string | null>(null);
  const [sessionStatus, setSessionStatus] = useState<'pending' | 'paid' | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);

  // Estados de envio de WhatsApp e simulação
  const [isSendingWhatsApp, setIsSendingWhatsApp] = useState(false);
  const [isSimulatingPaid, setIsSimulatingPaid] = useState(false);
  const [whatsAppSuccess, setWhatsAppSuccess] = useState(false);
  const [simulationSuccess, setSimulationSuccess] = useState(false);

  // Instância de WhatsApp escolhida para envio do teste e status
  const [testZapChoice, setTestZapChoice] = useState<'main' | 'billing' | 'auto'>('auto');
  const [hubStatus, setHubStatus] = useState<{ status: 'idle' | 'checking' | 'connected' | 'disconnected'; name?: string }>({ status: 'checking' });
  const [billingStatus, setBillingStatus] = useState<{ status: 'idle' | 'checking' | 'connected' | 'disconnected'; name?: string }>({ status: 'checking' });
  const [isCheckingZaps, setIsCheckingZaps] = useState(false);

  const checkZapStatuses = async () => {
    setIsCheckingZaps(true);
    setHubStatus(prev => ({ ...prev, status: 'checking' }));
    setBillingStatus(prev => ({ ...prev, status: 'checking' }));

    const checkOne = async (token?: string) => {
      if (!token) return { status: 'disconnected' as const };
      try {
        const res = await fetch('/api/status', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token }),
        });
        const data = await res.json();
        return {
          status: data.status === 'connected' ? ('connected' as const) : ('disconnected' as const),
          name: data.nomeperfil || '',
        };
      } catch {
        return { status: 'disconnected' as const };
      }
    };

    const hubResult = await checkOne(settings?.webhookToken);
    setHubStatus(hubResult);

    const billingResult = await checkOne(settings?.billingWebhookToken);
    setBillingStatus(billingResult);

    setIsCheckingZaps(false);
  };

  useEffect(() => {
    if (settings) {
      if (settings.renewalZapInstance) {
        setTestZapChoice(settings.renewalZapInstance);
      }
      checkZapStatuses();
    }
  }, [settings?.webhookToken, settings?.billingWebhookToken]);

  // Polling dinâmico do status da sessão criada
  useEffect(() => {
    if (!generatedSessionId || sessionStatus === 'paid') return;

    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/renewal/details?sessionId=${generatedSessionId}`);
        if (res.ok) {
          const data = await res.json();
          if (data.session?.status === 'paid') {
            setSessionStatus('paid');
            setSimulationSuccess(true);
            toast({
              title: '🎉 Pagamento Aprovado Detectado!',
              description: 'A sessão de teste foi marcada como PAGA e o cliente renovado no CRM.',
            });
          }
        }
      } catch (e) {}
    }, 3000);

    return () => clearInterval(interval);
  }, [generatedSessionId, sessionStatus, toast]);

  // Manipulação de produtos na lista de teste
  const addProduct = () => {
    setProducts((prev) => [...prev, { name: 'Disney+ Premium', value: '25.00' }]);
  };

  const removeProduct = (index: number) => {
    if (products.length <= 1) {
      toast({
        variant: 'destructive',
        title: 'Mínimo 1 Produto',
        description: 'É necessário manter pelo menos um produto para o teste.',
      });
      return;
    }
    setProducts((prev) => prev.filter((_, i) => i !== index));
  };

  const updateProduct = (index: number, field: 'name' | 'value', val: string) => {
    setProducts((prev) => {
      const copy = [...prev];
      copy[index] = { ...copy[index], [field]: val };
      return copy;
    });
  };

  // Gerar Sessão de Renovação Real
  const handleGenerateTestSession = async () => {
    if (!user) return;
    if (!phone.trim()) {
      toast({ variant: 'destructive', title: 'Telefone Obrigatório', description: 'Informe o número de WhatsApp.' });
      return;
    }

    try {
      setIsGenerating(true);
      setSimulationSuccess(false);
      setWhatsAppSuccess(false);

      const res = await fetch('/api/renewal/test-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'create',
          userId: user.uid,
          phone,
          clientName,
          products,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Falha ao criar sessão de teste.');
      }

      setGeneratedSessionId(data.sessionId);
      setGeneratedLink(data.link);
      setSessionStatus('pending');

      toast({
        title: 'Link de Teste Criado!',
        description: 'Sessão gerada com sucesso. Você já pode testar a tela do cliente ou enviar no WhatsApp.',
      });
    } catch (err: any) {
      toast({
        variant: 'destructive',
        title: 'Erro ao Gerar',
        description: err.message || 'Erro inesperado.',
      });
    } finally {
      setIsGenerating(false);
    }
  };

  // Enviar Mensagem Real de Teste no WhatsApp
  const handleSendWhatsApp = async () => {
    if (!user || !generatedLink) return;

    try {
      setIsSendingWhatsApp(true);

      const hasMultiple = products.length > 1;
      const subNames = products.map((p) => p.name).join(' + ');
      const subListBullet = products.map((p) => `👉 *${p.name}*`).join('\n');

      let messageText = '';
      if (hasMultiple) {
        messageText =
          `Olá *${clientName || 'Cliente'}*!\n\n` +
          `Notamos que você tem *${products.length} assinaturas* com vencimento hoje:\n\n` +
          `${subListBullet}\n\n` +
          `👉 *Para renovar com facilidade via PIX e manter seus acessos ativos, use o link oficial abaixo:*\n🔗 ${generatedLink}\n\n_Ao pagar, seu acesso é renovado de imediato!_`;
      } else {
        const defaultTemplate =
          'Olá *{cliente}*! Sua assinatura está próxima do vencimento.\n\n' +
          '📦 *Assinatura(s):* {assinaturas}\n' +
          '📅 *Vencimento:* Hoje\n\n' +
          '👉 Para renovar com segurança via PIX e manter seu acesso ativo sem interrupções, acesse o link oficial abaixo:\n' +
          '🔗 {link_renovacao}';

        const template = settings?.renewalBillingMessage?.trim() || defaultTemplate;
        messageText = template
          .replace(/{cliente}/g, clientName || 'Cliente')
          .replace(/{telefone}/g, phone)
          .replace(/{assinatura}/g, products[0]?.name || '')
          .replace(/{assinaturas}/g, products[0]?.name || '')
          .replace(/{vencimento}/g, 'Hoje')
          .replace(/{valor}/g, products[0]?.value || '0,00')
          .replace(/{link_renovacao}/g, generatedLink)
          .replace(/{link}/g, generatedLink);
      }

      const res = await fetch('/api/renewal/test-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'send-whatsapp',
          userId: user.uid,
          targetPhone: phone,
          message: messageText,
          chosenZap: testZapChoice,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Falha ao disparar WhatsApp.');
      }

      setWhatsAppSuccess(true);
      toast({
        title: 'Mensagem Enviada!',
        description: `Cobrança de teste com link enviada para ${phone} ${data.tokenUsed ? `(Token: ${data.tokenUsed})` : ''}`,
      });
    } catch (err: any) {
      toast({
        variant: 'destructive',
        title: 'Erro no Envio do WhatsApp',
        description: err.message,
      });
    } finally {
      setIsSendingWhatsApp(false);
    }
  };

  // Simular Pagamento Aprovado Instantâneo
  const handleSimulatePayment = async () => {
    if (!user || !generatedSessionId) return;

    try {
      setIsSimulatingPaid(true);

      const res = await fetch('/api/renewal/test-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'simulate-paid',
          userId: user.uid,
          sessionId: generatedSessionId,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Falha ao simular pagamento.');
      }

      setSessionStatus('paid');
      setSimulationSuccess(true);

      toast({
        title: '⚡ Pagamento Simulado com Sucesso!',
        description: 'Assinatura renovada no CRM (+1 mês) e mensagem de confirmação disparada no WhatsApp!',
      });
    } catch (err: any) {
      toast({
        variant: 'destructive',
        title: 'Erro na Simulação',
        description: err.message,
      });
    } finally {
      setIsSimulatingPaid(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2500);
    toast({ title: 'Copiado!', description: 'Link copiado para a área de transferência.' });
  };

  const totalCalculated = products.reduce((acc, p) => acc + (parseFloat(p.value.replace(',', '.')) || 0), 0);

  return (
    <div className="flex flex-col h-full bg-slate-50/60 dark:bg-slate-950">
      <PageHeader
        title="TESTE DE RENOVAÇÃO PIX"
        description="Ambiente para testar a geração de links, perguntas interativas, QR Code LinkinPay e renovação automática instantânea."
      />

      <main className="flex-1 overflow-auto p-4 md:p-8 max-w-5xl mx-auto w-full space-y-6">
        {/* CARD PRINCIPAL DO FORMULÁRIO */}
        <Card className="border-none shadow-lg overflow-hidden">
          <CardHeader className="bg-gradient-to-r from-amber-500 via-orange-500 to-red-600 text-white pb-6">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-xl font-bold flex items-center gap-2">
                  <Sparkles className="h-6 w-6 text-amber-200" />
                  Simulador de Renovação de Assinaturas
                </CardTitle>
                <CardDescription className="text-orange-100 text-sm mt-1">
                  Defina o número e os produtos para validar o fluxo do cliente e a aprovação instantânea.
                </CardDescription>
              </div>
              <Badge className="bg-white/20 text-white border-none font-semibold px-3 py-1">
                🧪 Modo de Teste
              </Badge>
            </div>
          </CardHeader>

          <CardContent className="pt-6 space-y-6">
            {/* DADOS DO CLIENTE */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-sm font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-2">
                  <Smartphone className="h-4 w-4 text-orange-500" />
                  Número de Telefone (WhatsApp) *
                </Label>
                <Input
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="Ex: 77998413534"
                  className="bg-white dark:bg-slate-900 font-mono text-base font-medium"
                />
                <p className="text-[11px] text-muted-foreground">
                  Número que receberá a mensagem e será identificado no checkout.
                </p>
              </div>

              <div className="space-y-2">
                <Label className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                  Nome do Cliente (Opcional)
                </Label>
                <Input
                  value={clientName}
                  onChange={(e) => setClientName(e.target.value)}
                  placeholder="Ex: Pedro / Jivago"
                  className="bg-white dark:bg-slate-900"
                />
                <p className="text-[11px] text-muted-foreground">
                  Substituirá a tag &#123;cliente&#125; nas mensagens e no topo da tela do PIX.
                </p>
              </div>
            </div>

            {/* SELEÇÃO DE PRODUTOS / ASSINATURAS */}
            <div className="space-y-3 pt-2 border-t">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-sm font-bold text-slate-800 dark:text-slate-200 flex items-center gap-2">
                    <CreditCard className="h-4 w-4 text-emerald-600" />
                    Produtos / Assinaturas do Teste
                  </h4>
                  <p className="text-xs text-muted-foreground">
                    Adicione mais de um produto para testar o fluxo de seleção múltipla (pergunta & checkboxes).
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={addProduct}
                  className="text-orange-600 hover:text-orange-700 hover:bg-orange-50 border-orange-200 text-xs font-semibold"
                >
                  <Plus className="h-3.5 w-3.5 mr-1" />
                  Adicionar Assinatura (&gt;1)
                </Button>
              </div>

              <div className="space-y-3">
                {products.map((prod, index) => (
                  <div
                    key={index}
                    className="flex flex-col md:flex-row items-stretch md:items-center gap-3 p-3 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800"
                  >
                    <div className="flex items-center gap-2 min-w-[40px]">
                      <ProductIcon name={prod.name} className="h-9 w-9 rounded-lg shadow-sm" />
                      <span className="text-xs font-bold text-slate-400">#{index + 1}</span>
                    </div>

                    <div className="flex-1 space-y-1">
                      <Label className="text-[11px] font-medium text-slate-500">Nome do Produto</Label>
                      <Input
                        value={prod.name}
                        onChange={(e) => updateProduct(index, 'name', e.target.value)}
                        placeholder="Ex: Netflix, Disney+, IPTV..."
                        className="bg-white dark:bg-slate-900 h-9 text-sm font-medium"
                      />
                    </div>

                    <div className="w-full md:w-36 space-y-1">
                      <Label className="text-[11px] font-medium text-slate-500">Valor (R$)</Label>
                      <Input
                        value={prod.value}
                        onChange={(e) => updateProduct(index, 'value', e.target.value)}
                        placeholder="25.00"
                        className="bg-white dark:bg-slate-900 h-9 text-sm font-mono font-semibold"
                      />
                    </div>

                    {/* Botão de Preenchimento Rápido com Presets */}
                    <div className="space-y-1">
                      <Label className="text-[11px] font-medium text-slate-500">Presets</Label>
                      <select
                        className="h-9 text-xs rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1 text-slate-700 dark:text-slate-300 font-medium"
                        onChange={(e) => {
                          const selected =
                            userSubscriptions?.find((s) => s.name === e.target.value) ||
                            DEFAULT_PRESET_PRODUCTS.find((p) => p.name === e.target.value);
                          if (selected) {
                            updateProduct(index, 'name', selected.name);
                            if (selected.value) updateProduct(index, 'value', selected.value);
                          }
                        }}
                        defaultValue=""
                      >
                        <option value="" disabled>
                          Escolher produto...
                        </option>
                        {userSubscriptions && userSubscriptions.length > 0 && (
                          <optgroup label="Seus Produtos Cadastrados">
                            {userSubscriptions.map((s) => (
                              <option key={s.id} value={s.name}>
                                {s.name} (R$ {s.value})
                              </option>
                            ))}
                          </optgroup>
                        )}
                        <optgroup label="Exemplos Populares">
                          {DEFAULT_PRESET_PRODUCTS.map((p) => (
                            <option key={p.name} value={p.name}>
                              {p.name} (R$ {p.value})
                            </option>
                          ))}
                        </optgroup>
                      </select>
                    </div>

                    {products.length > 1 && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => removeProduct(index)}
                        className="text-red-500 hover:text-red-700 hover:bg-red-50 self-end md:self-center h-9 w-9 mt-1"
                        title="Remover produto"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                ))}
              </div>

              {/* RESUMO DE VALOR */}
              <div className="flex items-center justify-between p-3 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800">
                <span className="text-xs font-semibold text-emerald-800 dark:text-emerald-300 flex items-center gap-1.5">
                  <ShieldCheck className="h-4 w-4 text-emerald-600" />
                  Total das Assinaturas Selecionadas:
                </span>
                <span className="text-base font-extrabold text-emerald-700 dark:text-emerald-400 font-mono">
                  R$ {totalCalculated.toFixed(2).replace('.', ',')}
                </span>
              </div>
            </div>

            {/* SELEÇÃO DA INSTÂNCIA DO WHATSAPP */}
            <div className="space-y-3 pt-3 border-t">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-sm font-bold text-slate-800 dark:text-slate-200 flex items-center gap-2">
                    <Smartphone className="h-4 w-4 text-emerald-600" />
                    Instância WhatsApp para Disparo do Teste
                  </h4>
                  <p className="text-xs text-muted-foreground">
                    Escolha qual ZAP enviará a mensagem de cobrança no teste. O sistema detecta o status em tempo real.
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={checkZapStatuses}
                  disabled={isCheckingZaps}
                  className="text-xs font-semibold gap-1.5 h-7 shrink-0"
                >
                  <RefreshCw className={cn("h-3 w-3", isCheckingZaps && "animate-spin")} />
                  Verificar ZAPs
                </Button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {/* HUB PRINCIPAL */}
                <div
                  onClick={() => setTestZapChoice('main')}
                  className={cn(
                    "p-3 rounded-xl border-2 cursor-pointer transition-all flex flex-col justify-between space-y-2",
                    testZapChoice === 'main'
                      ? "border-emerald-500 bg-emerald-50/50 dark:bg-emerald-950/20 shadow-sm"
                      : "border-slate-200 dark:border-slate-800 hover:border-slate-300 bg-white dark:bg-slate-900"
                  )}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Smartphone className="h-4 w-4 text-blue-600" />
                      <span className="font-bold text-xs text-slate-800 dark:text-slate-200">Hub Principal</span>
                    </div>
                    {testZapChoice === 'main' && (
                      <Badge className="bg-emerald-600 text-white text-[9px] px-1.5 py-0.5">ATIVO</Badge>
                    )}
                  </div>
                  <div className="flex items-center justify-between text-[11px] pt-1 border-t border-slate-100 dark:border-slate-800">
                    <span className="text-muted-foreground">Status:</span>
                    {hubStatus.status === 'checking' ? (
                      <span className="text-blue-500 font-medium flex items-center gap-1"><Loader2 className="h-3 w-3 animate-spin" /> Verificando</span>
                    ) : hubStatus.status === 'connected' ? (
                      <span className="text-green-600 font-bold flex items-center gap-1"><CheckCircle2 className="h-3 w-3 text-green-500" /> Conectado</span>
                    ) : (
                      <span className="text-red-500 font-bold flex items-center gap-1"><AlertCircle className="h-3 w-3 text-red-500" /> Desconectado</span>
                    )}
                  </div>
                  {hubStatus.name && (
                    <p className="text-[10px] text-slate-500 truncate">Perfil: {hubStatus.name}</p>
                  )}
                </div>

                {/* ZAP COBRANÇA */}
                <div
                  onClick={() => setTestZapChoice('billing')}
                  className={cn(
                    "p-3 rounded-xl border-2 cursor-pointer transition-all flex flex-col justify-between space-y-2",
                    testZapChoice === 'billing'
                      ? "border-emerald-500 bg-emerald-50/50 dark:bg-emerald-950/20 shadow-sm"
                      : "border-slate-200 dark:border-slate-800 hover:border-slate-300 bg-white dark:bg-slate-900"
                  )}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <DollarSign className="h-4 w-4 text-orange-600" />
                      <span className="font-bold text-xs text-slate-800 dark:text-slate-200">ZAP Cobrança</span>
                    </div>
                    {testZapChoice === 'billing' && (
                      <Badge className="bg-emerald-600 text-white text-[9px] px-1.5 py-0.5">ATIVO</Badge>
                    )}
                  </div>
                  <div className="flex items-center justify-between text-[11px] pt-1 border-t border-slate-100 dark:border-slate-800">
                    <span className="text-muted-foreground">Status:</span>
                    {billingStatus.status === 'checking' ? (
                      <span className="text-blue-500 font-medium flex items-center gap-1"><Loader2 className="h-3 w-3 animate-spin" /> Verificando</span>
                    ) : billingStatus.status === 'connected' ? (
                      <span className="text-green-600 font-bold flex items-center gap-1"><CheckCircle2 className="h-3 w-3 text-green-500" /> Conectado</span>
                    ) : (
                      <span className="text-red-500 font-bold flex items-center gap-1"><AlertCircle className="h-3 w-3 text-red-500" /> Desconectado</span>
                    )}
                  </div>
                  {billingStatus.name && (
                    <p className="text-[10px] text-slate-500 truncate">Perfil: {billingStatus.name}</p>
                  )}
                </div>

                {/* AUTOMÁTICO */}
                <div
                  onClick={() => setTestZapChoice('auto')}
                  className={cn(
                    "p-3 rounded-xl border-2 cursor-pointer transition-all flex flex-col justify-between space-y-2",
                    testZapChoice === 'auto'
                      ? "border-emerald-500 bg-emerald-50/50 dark:bg-emerald-950/20 shadow-sm"
                      : "border-slate-200 dark:border-slate-800 hover:border-slate-300 bg-white dark:bg-slate-900"
                  )}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Zap className="h-4 w-4 text-amber-500" />
                      <span className="font-bold text-xs text-slate-800 dark:text-slate-200">Automático</span>
                    </div>
                    {testZapChoice === 'auto' && (
                      <Badge className="bg-emerald-600 text-white text-[9px] px-1.5 py-0.5">RECOMENDADO</Badge>
                    )}
                  </div>
                  <p className="text-[10px] text-muted-foreground leading-tight pt-1 border-t border-slate-100 dark:border-slate-800">
                    Alterna inteligentemente entre os ZAPs caso algum retorne erro ou desconexão.
                  </p>
                </div>
              </div>
            </div>

            {/* BOTÃO GERAR LINK */}
            <div className="pt-2">
              <Button
                onClick={handleGenerateTestSession}
                disabled={isGenerating}
                className="w-full h-12 text-base font-bold bg-gradient-to-r from-orange-500 to-amber-600 hover:from-orange-600 hover:to-amber-700 text-white shadow-lg active:scale-[0.99] transition-all"
              >
                {isGenerating ? (
                  <>
                    <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                    Gerando Link de Renovação...
                  </>
                ) : (
                  <>
                    <Zap className="h-5 w-5 mr-2" />
                    GERAR LINK DE TESTE DA RENOVAÇÃO
                  </>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* RESULTADO DO TESTE (APARECE QUANDO O LINK É GERADO) */}
        {generatedLink && (
          <Card className="border-2 border-emerald-500/50 shadow-xl overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-300">
            <CardHeader className="bg-gradient-to-r from-emerald-600 to-teal-700 text-white py-4 px-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-6 w-6 text-emerald-200" />
                  <div>
                    <CardTitle className="text-lg font-bold">Link de Renovação Gerado com Sucesso!</CardTitle>
                    <CardDescription className="text-emerald-100 text-xs">
                      Sessão ativa #{generatedSessionId} · Status:{' '}
                      <span className="font-bold underline uppercase">
                        {sessionStatus === 'paid' ? 'PAGO / RENOVADO 🟢' : 'AGUARDANDO PAGAMENTO 🟡'}
                      </span>
                    </CardDescription>
                  </div>
                </div>

                <Badge
                  variant={sessionStatus === 'paid' ? 'default' : 'secondary'}
                  className={
                    sessionStatus === 'paid'
                      ? 'bg-white text-emerald-800 font-bold'
                      : 'bg-amber-400 text-amber-950 font-bold'
                  }
                >
                  {sessionStatus === 'paid' ? '✓ PAGO' : 'PENDENTE'}
                </Badge>
              </div>
            </CardHeader>

            <CardContent className="p-6 space-y-6">
              {/* CAMPO DE LINK DIRETO */}
              <div className="space-y-2">
                <Label className="text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400">
                  Link Oficial do Cliente:
                </Label>
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                  <Input
                    readOnly
                    value={generatedLink}
                    className="font-mono text-sm bg-slate-100 dark:bg-slate-900 select-all font-semibold text-emerald-700 dark:text-emerald-400"
                  />
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => copyToClipboard(generatedLink)}
                      className="font-bold shrink-0"
                    >
                      {copiedLink ? <Check className="h-4 w-4 mr-1 text-green-600" /> : <Copy className="h-4 w-4 mr-1" />}
                      Copiar
                    </Button>

                    <Button
                      type="button"
                      onClick={() => window.open(generatedLink, '_blank')}
                      className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold shrink-0"
                    >
                      <ExternalLink className="h-4 w-4 mr-1" />
                      Abrir Tela do Cliente
                    </Button>
                  </div>
                </div>
              </div>

              {/* AÇÕES DE TESTE EM DESTAQUE */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                {/* 1. DISPARAR WHATSAPP */}
                <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-3">
                  <div className="flex items-center gap-2">
                    <div className="p-2 rounded-lg bg-green-100 dark:bg-green-950/60 text-green-600">
                      <Send className="h-5 w-5" />
                    </div>
                    <div>
                      <h4 className="font-bold text-sm text-slate-800 dark:text-slate-200">
                        1. Enviar Cobrança no WhatsApp
                      </h4>
                      <p className="text-xs text-muted-foreground">
                        Dispara a mensagem real com o link para <strong>{phone}</strong>.
                      </p>
                    </div>
                  </div>

                  <Button
                    type="button"
                    onClick={handleSendWhatsApp}
                    disabled={isSendingWhatsApp}
                    className="w-full font-bold bg-green-600 hover:bg-green-700 text-white"
                  >
                    {isSendingWhatsApp ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Enviando...
                      </>
                    ) : whatsAppSuccess ? (
                      <>
                        <Check className="h-4 w-4 mr-2" />
                        Reenviar Mensagem WhatsApp
                      </>
                    ) : (
                      <>
                        <Send className="h-4 w-4 mr-2" />
                        Disparar Mensagem para {phone}
                      </>
                    )}
                  </Button>
                </div>

                {/* 2. SIMULAR PAGAMENTO APROVADO */}
                <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-3">
                  <div className="flex items-center gap-2">
                    <div className="p-2 rounded-lg bg-amber-100 dark:bg-amber-950/60 text-amber-600">
                      <Zap className="h-5 w-5" />
                    </div>
                    <div>
                      <h4 className="font-bold text-sm text-slate-800 dark:text-slate-200">
                        2. Simular Pagamento Aprovado
                      </h4>
                      <p className="text-xs text-muted-foreground">
                        Testa a renovação imediata no CRM e envio de WhatsApp sem pagar PIX real.
                      </p>
                    </div>
                  </div>

                  <Button
                    type="button"
                    onClick={handleSimulatePayment}
                    disabled={isSimulatingPaid || sessionStatus === 'paid'}
                    className="w-full font-bold bg-amber-500 hover:bg-amber-600 text-white"
                  >
                    {isSimulatingPaid ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Processando Renovação...
                      </>
                    ) : sessionStatus === 'paid' ? (
                      <>
                        <CheckCircle2 className="h-4 w-4 mr-2 text-white" />
                        Renovação Concluída com Sucesso!
                      </>
                    ) : (
                      <>
                        <Zap className="h-4 w-4 mr-2" />
                        Simular Pagamento PIX Aprovado
                      </>
                    )}
                  </Button>
                </div>
              </div>

              {/* CARD DE INSTRUÇÕES DO FLUXO DO CLIENTE */}
              <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 text-xs text-slate-600 dark:text-slate-400 space-y-2">
                <p className="font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                  <QrCode className="h-4 w-4 text-orange-500" />
                  O que acontece ao clicar em &quot;Abrir Tela do Cliente&quot;?
                </p>
                <ol className="list-decimal list-inside space-y-1 leading-relaxed">
                  <li>
                    Abre a tela no formato ticket/cupom com a pergunta: <em>&quot;Está tudo certo com sua assinatura?&quot;</em>.
                  </li>
                  <li>
                    Se clicar em <strong>Sim</strong> (com &gt;1 produto), o cliente escolhe quais assinturas renovar e o sistema soma o total.
                  </li>
                  <li>
                    Se clicar em <strong>Não</strong>, o cliente marca as que estão com defeito e depois escolhe quais renovar.
                  </li>
                  <li>
                    Gera o QR Code oficial da LinkinPay e código Copia e Cola instantâneo.
                  </li>
                  <li>
                    Ao pagar (ou simular), a tela detecta em 3 segundos e exibe a confirmação, renovando a data no CRM e mandando mensagem de confirmação no WhatsApp!
                  </li>
                </ol>
              </div>
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
}
