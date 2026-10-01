'use client';

import { useState, useEffect } from 'react';
import { doc, collection, getDocs } from 'firebase/firestore';
import { useFirebase, useUser, useDoc, setDocumentNonBlocking, useMemoFirebase } from '@/firebase';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import type { Settings, Client } from '@/lib/types';
import { getCanonicalPhone } from '@/lib/renewal-service';
import { format } from 'date-fns';
import { Skeleton } from '@/components/ui/skeleton';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Sparkles,
  Copy,
  Check,
  CreditCard,
  ShieldCheck,
  MessageSquare,
  Zap,
  ExternalLink,
  Smartphone,
  DollarSign,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  Loader2,
  LifeBuoy,
  Clock,
  Play,
  Eye,
  ShieldAlert,
  Send,
} from 'lucide-react';
import { DEFAULT_LINKINPAY_TOKEN } from '@/lib/linkinpay';
import { cn } from '@/lib/utils';

const DEFAULT_SUCCESS_MESSAGE =
  '🎉 *PAGAMENTO CONFIRMADO!*\n\n' +
  'Olá *{cliente}*, identificamos seu pagamento PIX e sua renovação foi realizada com sucesso!\n\n' +
  '📦 *Assinatura(s):* {assinaturas}\n' +
  '📅 *Novo Vencimento:* {novo_vencimento}\n' +
  '💰 *Valor Pago:* R$ {valor}\n' +
  '⚡ *Status:* Ativo\n\n' +
  'Obrigado pela preferência e bom entretenimento! 🚀';

const DEFAULT_BILLING_MESSAGE =
  'Olá *{cliente}*! Sua assinatura está próxima do vencimento.\n\n' +
  '📦 *Assinatura(s):* {assinaturas}\n' +
  '📅 *Vencimento:* {vencimento}\n\n' +
  '👉 Para renovar com segurança via PIX e manter seu acesso ativo sem interrupções, clique no botão oficial abaixo:';

const DEFAULT_SUPPORT_MESSAGE =
  '🛠️ *SUPORTE PJ CONTAS - CHAMADO ABERTO*\n\n' +
  'Olá *{cliente}*! Identificamos o seu relato de problema na assinatura *{assinatura}* ao renovar.\n\n' +
  '✅ Seu pagamento PIX foi aprovado e sua assinatura já foi renovada com sucesso!\n' +
  '🚨 O seu chamado de suporte já foi aberto automaticamente em nosso sistema. 🧑‍💻\n\n' +
  'Nossa equipe técnica já foi notificada e em breve entrará em contato para verificar e resolver seu acesso com prioridade. Fique tranquilo(a)! 🤝✨';

export default function RenewalAutomationPage() {
  const { firestore } = useFirebase();
  const { user } = useUser();
  const { toast } = useToast();

  const settingsDocRef = useMemoFirebase(() => {
    if (!user) return null;
    return doc(firestore, 'users', user.uid, 'settings', 'config');
  }, [firestore, user]);

  const { data: settings, isLoading } = useDoc<Settings>(settingsDocRef);

  const [isActive, setIsActive] = useState(false);
  const [renewalSendTime, setRenewalSendTime] = useState('14:30');
  const [renewalDelaySeconds, setRenewalDelaySeconds] = useState(15);
  const [isLoadingManual, setIsLoadingManual] = useState(false);
  const [successMessage, setSuccessMessage] = useState(DEFAULT_SUCCESS_MESSAGE);
  const [billingMessage, setBillingMessage] = useState(DEFAULT_BILLING_MESSAGE);
  const [supportMessage, setSupportMessage] = useState(DEFAULT_SUPPORT_MESSAGE);
  const [buttonText, setButtonText] = useState('SIM, RENOVAR AGORA');
  const [footerText, setFooterText] = useState('Entrega Automática • ⬇️Clique No Botão⬇️');
  const [linkinpayToken, setLinkinpayToken] = useState(DEFAULT_LINKINPAY_TOKEN);
  const [copiedWebhook, setCopiedWebhook] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Instância de WhatsApp escolhida para renovação e status de conexão
  const [renewalZapInstance, setRenewalZapInstance] = useState<'main' | 'billing' | 'auto'>('auto');
  const [hubStatus, setHubStatus] = useState<{ status: 'idle' | 'checking' | 'connected' | 'disconnected'; name?: string; pic?: string }>({ status: 'checking' });
  const [billingStatus, setBillingStatus] = useState<{ status: 'idle' | 'checking' | 'connected' | 'disconnected'; name?: string; pic?: string }>({ status: 'checking' });
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
          pic: data.fotoperfil || '',
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
      setIsActive(Boolean(settings.isAutoRenewalActive));
      setRenewalSendTime(settings.renewalSendTime || '14:30');
      setRenewalDelaySeconds(settings.renewalDelaySeconds ?? 15);
      setSuccessMessage(settings.renewalSuccessMessage || DEFAULT_SUCCESS_MESSAGE);
      setBillingMessage(settings.renewalBillingMessage || DEFAULT_BILLING_MESSAGE);
      setSupportMessage(settings.renewalSupportMessage || settings.supportStartedMessage || DEFAULT_SUPPORT_MESSAGE);
      setButtonText(settings.renewalButtonText || 'SIM, RENOVAR AGORA');
      setFooterText(settings.renewalFooterText || 'Entrega Automática • ⬇️Clique No Botão⬇️');
      setLinkinpayToken(settings.linkinpayToken || DEFAULT_LINKINPAY_TOKEN);
      setRenewalZapInstance(settings.renewalZapInstance || 'auto');
      checkZapStatuses();
    }
  }, [settings?.webhookToken, settings?.billingWebhookToken, settings?.renewalZapInstance, settings?.renewalSendTime, settings?.renewalDelaySeconds]);

  const handleSave = () => {
    if (!settingsDocRef) return;
    setIsSaving(true);

    const offset = -3 * 60 * 60 * 1000;
    const nowBr = new Date(Date.now() + offset);
    const todayBrasiliaStr = format(nowBr, 'yyyy-MM-dd');
    const nowMinutes = nowBr.getUTCHours() * 60 + nowBr.getUTCMinutes();

    let lastAutoRun = settings?.lastAutoRenewalRunDate;
    if (isActive && renewalSendTime) {
      const [h, m] = renewalSendTime.split(':').map(Number);
      const targetMinutes = (h || 0) * 60 + (m || 0);
      // Se o horário definido já passou hoje (ex: definiu 14:00 e já são 14:01+):
      // Marca lastAutoRenewalRunDate como hoje para que NUNCA dispare hoje, aguardando amanhã pontualmente!
      if (nowMinutes >= targetMinutes) {
        lastAutoRun = todayBrasiliaStr;
      }
    }

    setDocumentNonBlocking(
      settingsDocRef,
      {
        isAutoRenewalActive: isActive,
        renewalSendTime: renewalSendTime.trim(),
        renewalDelaySeconds: Number(renewalDelaySeconds) || 15,
        lastAutoRenewalRunDate: lastAutoRun || null,
        renewalSuccessMessage: successMessage.trim(),
        renewalBillingMessage: billingMessage.trim(),
        renewalSupportMessage: supportMessage.trim(),
        renewalButtonText: buttonText.trim(),
        renewalFooterText: footerText.trim(),
        linkinpayToken: linkinpayToken.trim(),
        renewalZapInstance,
      },
      { merge: true }
    );

    setTimeout(() => {
      setIsSaving(false);
      toast({
        title: 'Configurações Salvas!',
        description: 'Automação de renovação PIX atualizada com sucesso.',
      });
    }, 400);
  };

  // Disparo Manual Real
  const handleStartManualDispatch = async () => {
    if (!user) return;

    try {
      setIsLoadingManual(true);
      const clientsRef = collection(firestore, 'users', user.uid, 'clients');
      const snap = await getDocs(clientsRef);
      const allClients = snap.docs.map(d => ({ id: d.id, ...d.data() } as Client));

      const now = new Date();
      const todayStr = format(now, 'yyyy-MM-dd');

      const toRebill = allClients.filter(c => {
        if (!c.dueDate) return false;
        const due = (c.dueDate as any).toDate ? (c.dueDate as any).toDate() : new Date(c.dueDate);
        return format(due, 'yyyy-MM-dd') === todayStr && (c.status === 'Ativo' || c.status === 'Vencido');
      });

      if (toRebill.length === 0) {
        toast({
          title: 'Nenhum cliente para hoje',
          description: 'Não há clientes com vencimento hoje marcados como Ativo ou Vencido.',
        });
        setIsLoadingManual(false);
        return;
      }

      // Agrupa por telefone canônico
      const groupsByPhone = new Map<string, Client[]>();
      for (const client of toRebill) {
        const canon = getCanonicalPhone(client.phone);
        if (!canon) continue;
        if (!groupsByPhone.has(canon)) groupsByPhone.set(canon, []);
        groupsByPhone.get(canon)!.push(client);
      }

      const items = Array.from(groupsByPhone.values()).map(group => {
        const primary = group[0];
        const subNames = group.map(c => c.subscription || 'Assinatura').join(' + ');
        return {
          clientIds: group.map(c => c.id),
          name: `${primary.name}${group.length > 1 ? ` (${group.length} assinaturas)` : ''}`,
          phone: primary.phone,
          subNames,
          status: 'pending' as const,
        };
      });

      const newJob = {
        id: 'manual_' + Date.now(),
        userId: user.uid,
        isSimulation: false,
        status: 'running' as const,
        currentIndex: 0,
        total: items.length,
        delaySeconds: renewalDelaySeconds || 15,
        items,
        startedAt: Date.now(),
        updatedAt: Date.now(),
      };

      window.dispatchEvent(new CustomEvent('START_RENEWAL_DISPATCH', { detail: { job: newJob } }));

      toast({
        title: 'Disparo Manual Iniciado!',
        description: `${items.length} clientes na fila. Acompanhe a barra de progresso no painel flutuante no canto inferior esquerdo.`,
      });
    } catch (err: any) {
      toast({
        variant: 'destructive',
        title: 'Erro ao Iniciar Disparo',
        description: err.message || 'Erro inesperado.',
      });
    } finally {
      setIsLoadingManual(false);
    }
  };

  // Simulação / Demonstração da Barra
  const handleStartDemoSimulation = () => {
    const mockItems = [
      {
        clientIds: ['mock-1', 'mock-1b'],
        name: 'João Silva (2 assinaturas)',
        phone: '5577998413534',
        subNames: 'Netflix 4K + Prime Video',
        status: 'pending' as const,
      },
      {
        clientIds: ['mock-2'],
        name: 'Mariana Souza',
        phone: '5511999999999',
        subNames: 'Disney+ Premium',
        status: 'pending' as const,
      },
      {
        clientIds: ['mock-3'],
        name: 'Carlos Eduardo',
        phone: '5521988888888',
        subNames: 'Max Standard',
        status: 'pending' as const,
      },
      {
        clientIds: ['mock-4', 'mock-4b'],
        name: 'Fernanda Lima (2 assinaturas)',
        phone: '5531977777777',
        subNames: 'YouTube Premium + Spotify',
        status: 'pending' as const,
      },
      {
        clientIds: ['mock-5'],
        name: 'Roberto Alves',
        phone: '5541966666666',
        subNames: 'Globoplay + Telecine',
        status: 'pending' as const,
      },
    ];

    const demoJob = {
      id: 'demo_' + Date.now(),
      userId: user?.uid || 'demo',
      isSimulation: true,
      status: 'running' as const,
      currentIndex: 0,
      total: mockItems.length,
      delaySeconds: 3,
      items: mockItems,
      startedAt: Date.now(),
      updatedAt: Date.now(),
    };

    window.dispatchEvent(new CustomEvent('START_RENEWAL_DISPATCH', { detail: { job: demoJob } }));

    toast({
      title: 'Demonstração Iniciada!',
      description: 'Veja o painel arrastável no canto inferior esquerdo. Nenhuma mensagem real está sendo enviada.',
    });
  };

  const insertSuccessTag = (tag: string) => {
    setSuccessMessage((prev) => `${prev} ${tag}`);
  };

  const insertBillingTag = (tag: string) => {
    setBillingMessage((prev) => `${prev} ${tag}`);
  };

  const insertSupportTag = (tag: string) => {
    setSupportMessage((prev) => `${prev} ${tag}`);
  };

  const webhookUrl = typeof window !== 'undefined'
    ? `${window.location.origin}/api/renewal-webhook`
    : 'https://pjcrm.site/api/renewal-webhook';

  const handleCopyWebhook = () => {
    navigator.clipboard.writeText(webhookUrl);
    setCopiedWebhook(true);
    setTimeout(() => setCopiedWebhook(false), 3000);
    toast({ title: 'URL Copiada!', description: 'URL do Webhook copiada para a área de transferência.' });
  };

  if (isLoading) {
    return (
      <div className="flex flex-col h-full p-6 space-y-6">
        <Skeleton className="h-10 w-72" />
        <Skeleton className="h-48 w-full rounded-2xl" />
        <Skeleton className="h-64 w-full rounded-2xl" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title="Renovação Automática PIX"
        description="Gere links de pagamento oficiais da LinkinPay e renove as assinaturas do cliente imediatamente após o pagamento."
      />

      <main className="flex-1 overflow-auto p-4 md:p-6 space-y-6 max-w-5xl">
        {/* BANNER PARA TESTE RÁPIDO */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between p-4 rounded-xl bg-gradient-to-r from-amber-500/10 via-orange-500/10 to-red-500/10 border border-amber-500/30 gap-3">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-lg bg-amber-500 text-white shadow-sm">
              <Sparkles className="h-5 w-5" />
            </div>
            <div>
              <h4 className="font-bold text-sm text-slate-800 dark:text-slate-200">
                Quer testar a Renovação PIX agora?
              </h4>
              <p className="text-xs text-muted-foreground">
                Digite um número de WhatsApp e selecione um produto para testar o link, as perguntas e a renovação instantânea.
              </p>
            </div>
          </div>
          <Button
            asChild
            variant="default"
            size="sm"
            className="bg-amber-600 hover:bg-amber-700 text-white font-bold shrink-0 shadow-sm"
          >
            <a href="/automations/test-renewal">
              🧪 Ir para Teste de Renovação
            </a>
          </Button>
        </div>

        {/* SEÇÃO: ENVIO DE COBRANÇAS (AUTOMÁTICA & MANUAL) */}
        <Card className="border-2 border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
          <CardHeader className="bg-slate-50/70 dark:bg-slate-900/60 border-b border-slate-100 dark:border-slate-800">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <Send className="h-5 w-5 text-emerald-600" />
                <div>
                  <CardTitle className="text-lg">Envio de Cobranças</CardTitle>
                  <CardDescription>
                    Configure o disparo automático diário com horário agendado ou realize disparos manuais acompanhando o progresso em tempo real.
                  </CardDescription>
                </div>
              </div>
              <Badge
                variant={isActive ? "default" : "secondary"}
                className={isActive ? "bg-emerald-600 text-white font-bold" : "bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400 font-bold"}
              >
                {isActive ? `Automático Ativo às ${renewalSendTime || '14:30'}` : "Automático Desativado"}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="pt-6 space-y-6">
            {/* OPÇÃO 1: DISPARO AUTOMÁTICO */}
            <div className="p-4 rounded-2xl border bg-slate-50/40 dark:bg-slate-900/30 space-y-4">
              <div className="flex items-center justify-between gap-4">
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2">
                    <Clock className={cn("h-4 w-4", isActive ? "text-emerald-600" : "text-slate-400")} />
                    <Label className="text-sm font-bold text-zinc-900 dark:text-white cursor-pointer" htmlFor="auto-renewal-toggle">
                      Disparo Automático Diário
                    </Label>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Envia as mensagens de renovação automaticamente no horário configurado para todos os clientes que vencem no dia.
                  </p>
                </div>
                <Switch
                  id="auto-renewal-toggle"
                  checked={isActive}
                  onCheckedChange={setIsActive}
                />
              </div>

              {isActive && (
                <div className="pt-3 border-t border-slate-200/70 dark:border-slate-800 space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5 text-emerald-600" /> Horário de Disparo (Brasília)
                      </Label>
                      <Input
                        type="time"
                        value={renewalSendTime}
                        onChange={(e) => setRenewalSendTime(e.target.value)}
                        className="font-mono font-bold text-base bg-white dark:bg-zinc-900"
                      />
                      <p className="text-[11px] text-muted-foreground">
                        Exemplo: <strong>14:30</strong>. Todo dia nesse horário o sistema enviará a renovação.
                      </p>
                    </div>

                    <div className="space-y-1.5">
                      <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                        <ShieldAlert className="w-3.5 h-3.5 text-emerald-600" /> Intervalo Anti-Banimento (Segundos)
                      </Label>
                      <Input
                        type="number"
                        min={5}
                        max={120}
                        value={renewalDelaySeconds}
                        onChange={(e) => setRenewalDelaySeconds(Number(e.target.value))}
                        className="font-mono font-bold text-base bg-white dark:bg-zinc-900"
                      />
                      <p className="text-[11px] text-muted-foreground">
                        Padrão recomendado: <strong>15 segundos</strong> entre cada mensagem para proteger o WhatsApp.
                      </p>
                    </div>
                  </div>

                  {/* REGRAS E PROTEÇÕES EXPLICADAS */}
                  <div className="p-3.5 rounded-xl bg-amber-50 dark:bg-amber-950/20 border border-amber-200/80 dark:border-amber-800/40 space-y-2 text-xs text-amber-800 dark:text-amber-200">
                    <div className="font-bold flex items-center gap-1.5 text-amber-900 dark:text-amber-100">
                      <ShieldAlert className="w-4 h-4 text-amber-600 shrink-0" /> Regras de Segurança do Disparo Automático:
                    </div>
                    <ul className="list-disc list-inside space-y-1 text-[11px] text-amber-900/90 dark:text-amber-200/90">
                      <li>
                        <strong>Proteção Anti-Disparo Retroativo:</strong> Se você definir o horário para as <strong>{renewalSendTime || '14:00'}</strong> e já tiver passado desse horário hoje, o sistema <strong>NÃO dispara para os clientes de hoje</strong>, disparando amanhã pontualmente no horário agendado.
                      </li>
                      <li>
                        <strong>Agrupamento Inteligente:</strong> Se um cliente possuir 2, 3 ou mais assinaturas vencendo no dia, ele receberá <strong>somente 1 mensagem</strong> listando todas as assinaturas e um único botão para renovação total.
                      </li>
                      <li>
                        <strong>Intervalo Anti-Banimento:</strong> O delay de {renewalDelaySeconds}s entre os envios é respeitado rigorosamente para manter a segurança do número.
                      </li>
                    </ul>
                  </div>
                </div>
              )}
            </div>

            {/* OPÇÃO 2: DISPARO MANUAL & DEMONSTRAÇÃO */}
            <div className="p-4 rounded-2xl border bg-slate-50/40 dark:bg-slate-900/30 space-y-3">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <Play className="h-4 w-4 text-blue-600" />
                  <Label className="text-sm font-bold text-zinc-900 dark:text-white">
                    Disparo Manual & Demonstração da Barra
                  </Label>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Não quer esperar o horário automático? Você pode disparar manualmente agora para todos os clientes que vencem hoje, ou testar a barra de progresso em modo demonstração.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-3 pt-2">
                {/* BOTÃO DISPARO MANUAL REAL */}
                <Button
                  type="button"
                  onClick={handleStartManualDispatch}
                  disabled={isLoadingManual}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs gap-2 shadow-sm rounded-xl h-10 px-4 cursor-pointer"
                >
                  {isLoadingManual ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Buscando Clientes de Hoje...</span>
                    </>
                  ) : (
                    <>
                      <Play className="w-4 h-4 fill-white" />
                      <span>Disparar Cobrança Manual Agora</span>
                    </>
                  )}
                </Button>

                {/* BOTÃO DEMONSTRAÇÃO (SEM ENVIAR NADA) */}
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleStartDemoSimulation}
                  className="border-purple-300 dark:border-purple-800 text-purple-700 dark:text-purple-300 hover:bg-purple-50 dark:hover:bg-purple-950/30 font-bold text-xs gap-2 rounded-xl h-10 px-4 cursor-pointer"
                  title="Testa a experiência da barra de progresso sem disparar mensagem para ninguém"
                >
                  <Sparkles className="w-4 h-4 text-purple-600" />
                  <span>Ver Demonstração do Painel (Sem Enviar)</span>
                </Button>
              </div>

              <p className="text-[11px] text-muted-foreground pt-1 flex items-center gap-1.5">
                <span className="text-emerald-600 font-bold">●</span> O painel de progresso é flutuante no canto inferior esquerdo, pode ser arrastado pela tela, persiste se você recarregar a página e não duplica disparos se você tiver várias abas abertas.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* ESCOLHA DA INSTÂNCIA DO WHATSAPP (ZAP DE DISPARO) */}
        <Card className="border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
          <CardHeader className="bg-slate-50/50 dark:bg-slate-900/50 border-b border-slate-100 dark:border-slate-800">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Smartphone className="h-5 w-5 text-emerald-600" />
                <div>
                  <CardTitle className="text-lg">Instância do WhatsApp para Renovação</CardTitle>
                  <CardDescription>
                    Selecione qual número do WhatsApp enviará as mensagens de cobrança e confirmação PIX.
                  </CardDescription>
                </div>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={checkZapStatuses}
                disabled={isCheckingZaps}
                className="text-xs font-semibold gap-1.5 h-8 shrink-0"
              >
                <RefreshCw className={cn("h-3.5 w-3.5", isCheckingZaps && "animate-spin")} />
                Verificar Status dos ZAPs
              </Button>
            </div>
          </CardHeader>
          <CardContent className="pt-6 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* HUB PRINCIPAL */}
              <div
                onClick={() => setRenewalZapInstance('main')}
                className={cn(
                  "p-4 rounded-xl border-2 cursor-pointer transition-all relative flex flex-col justify-between space-y-3",
                  renewalZapInstance === 'main'
                    ? "border-emerald-500 bg-emerald-50/40 dark:bg-emerald-950/20 shadow-sm"
                    : "border-slate-200 dark:border-slate-800 hover:border-slate-300 bg-white dark:bg-slate-900"
                )}
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2">
                    <Smartphone className="h-5 w-5 text-blue-600" />
                    <div>
                      <h4 className="font-bold text-sm text-slate-800 dark:text-slate-100">Hub Principal</h4>
                      <p className="text-[11px] text-muted-foreground font-mono">
                        {typeof settings?.webhookToken === 'string' && settings.webhookToken.length > 0 ? `Token: ${settings.webhookToken.slice(0, 8)}...` : 'Instância Principal'}
                      </p>
                    </div>
                  </div>
                  {renewalZapInstance === 'main' && (
                    <Badge className="bg-emerald-600 text-white font-bold text-[10px] px-2 py-0.5">
                      SELECIONADO
                    </Badge>
                  )}
                </div>

                <div className="pt-2 border-t border-slate-100 dark:border-slate-800/80">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">Status:</span>
                    {hubStatus.status === 'checking' ? (
                      <Badge variant="outline" className="text-blue-500 text-[10px] gap-1">
                        <Loader2 className="h-3 w-3 animate-spin" /> Verificando
                      </Badge>
                    ) : hubStatus.status === 'connected' ? (
                      <Badge className="bg-green-500 text-white text-[10px] font-bold gap-1">
                        <CheckCircle2 className="h-3 w-3" /> Conectado
                      </Badge>
                    ) : (
                      <Badge variant="destructive" className="text-[10px] font-bold gap-1">
                        <AlertCircle className="h-3 w-3" /> Desconectado
                      </Badge>
                    )}
                  </div>
                  {hubStatus.name && (
                    <p className="text-[11px] font-medium text-slate-600 dark:text-slate-300 mt-1 truncate">
                      Perfil: {hubStatus.name}
                    </p>
                  )}
                </div>
              </div>

              {/* ZAP COBRANÇA */}
              <div
                onClick={() => setRenewalZapInstance('billing')}
                className={cn(
                  "p-4 rounded-xl border-2 cursor-pointer transition-all relative flex flex-col justify-between space-y-3",
                  renewalZapInstance === 'billing'
                    ? "border-emerald-500 bg-emerald-50/40 dark:bg-emerald-950/20 shadow-sm"
                    : "border-slate-200 dark:border-slate-800 hover:border-slate-300 bg-white dark:bg-slate-900"
                )}
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2">
                    <DollarSign className="h-5 w-5 text-orange-600" />
                    <div>
                      <h4 className="font-bold text-sm text-slate-800 dark:text-slate-100">ZAP Cobrança</h4>
                      <p className="text-[11px] text-muted-foreground font-mono">
                        {typeof settings?.billingWebhookToken === 'string' && settings.billingWebhookToken.length > 0 ? `Token: ${settings.billingWebhookToken.slice(0, 8)}...` : 'Instância de Cobrança'}
                      </p>
                    </div>
                  </div>
                  {renewalZapInstance === 'billing' && (
                    <Badge className="bg-emerald-600 text-white font-bold text-[10px] px-2 py-0.5">
                      SELECIONADO
                    </Badge>
                  )}
                </div>

                <div className="pt-2 border-t border-slate-100 dark:border-slate-800/80">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">Status:</span>
                    {billingStatus.status === 'checking' ? (
                      <Badge variant="outline" className="text-blue-500 text-[10px] gap-1">
                        <Loader2 className="h-3 w-3 animate-spin" /> Verificando
                      </Badge>
                    ) : billingStatus.status === 'connected' ? (
                      <Badge className="bg-green-500 text-white text-[10px] font-bold gap-1">
                        <CheckCircle2 className="h-3 w-3" /> Conectado
                      </Badge>
                    ) : (
                      <Badge variant="destructive" className="text-[10px] font-bold gap-1">
                        <AlertCircle className="h-3 w-3" /> Desconectado
                      </Badge>
                    )}
                  </div>
                  {billingStatus.name && (
                    <p className="text-[11px] font-medium text-slate-600 dark:text-slate-300 mt-1 truncate">
                      Perfil: {billingStatus.name}
                    </p>
                  )}
                </div>
              </div>

              {/* AUTOMÁTICO COM FALLBACK */}
              <div
                onClick={() => setRenewalZapInstance('auto')}
                className={cn(
                  "p-4 rounded-xl border-2 cursor-pointer transition-all relative flex flex-col justify-between space-y-3",
                  renewalZapInstance === 'auto'
                    ? "border-emerald-500 bg-emerald-50/40 dark:bg-emerald-950/20 shadow-sm"
                    : "border-slate-200 dark:border-slate-800 hover:border-slate-300 bg-white dark:bg-slate-900"
                )}
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2">
                    <Zap className="h-5 w-5 text-amber-500" />
                    <div>
                      <h4 className="font-bold text-sm text-slate-800 dark:text-slate-100">Automático Inteligente</h4>
                      <p className="text-[11px] text-muted-foreground">Com Fallback Anti-Falhas</p>
                    </div>
                  </div>
                  {renewalZapInstance === 'auto' && (
                    <Badge className="bg-emerald-600 text-white font-bold text-[10px] px-2 py-0.5">
                      RECOMENDADO
                    </Badge>
                  )}
                </div>

                <div className="pt-2 border-t border-slate-100 dark:border-slate-800/80">
                  <p className="text-[11px] text-muted-foreground leading-tight">
                    Dispara pelo ZAP Cobrança e, se este estiver desconectado ou der erro, usa o Hub Principal automaticamente.
                  </p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* GATEWAY LINKINPAY */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <CreditCard className="h-5 w-5 text-red-600" />
              <CardTitle className="text-lg">Configuração da LinkinPay</CardTitle>
            </div>
            <CardDescription>
              Insira o token da API para emissão instantânea de QR Code e Copia e Cola PIX.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                API Token (Bearer)
              </Label>
              <Input
                type="text"
                placeholder="45|Wm3x05BU8..."
                value={linkinpayToken}
                onChange={(e) => setLinkinpayToken(e.target.value)}
                className="font-mono text-sm"
              />
              <p className="text-[11px] text-muted-foreground">
                Token fornecido no painel da LinkinPay em <b>Tokens · API Key</b>.
              </p>
            </div>

            <div className="space-y-2 pt-2 border-t">
              <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                URL do Webhook (Recebimento de Pagamentos)
              </Label>
              <div className="flex items-center gap-2">
                <Input readOnly value={webhookUrl} className="font-mono text-xs bg-muted/50" />
                <Button variant="outline" size="sm" onClick={handleCopyWebhook} className="gap-1.5 shrink-0">
                  {copiedWebhook ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
                  <span>{copiedWebhook ? 'Copiado!' : 'Copiar'}</span>
                </Button>
              </div>
              <p className="text-[11px] text-muted-foreground">
                Cadastre essa URL no painel da LinkinPay para notificações instantâneas em tempo real.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* MENSAGEM DE SUCESSO / CONFIRMAÇÃO DO WHATSAPP */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <MessageSquare className="h-5 w-5 text-emerald-600" />
                  <CardTitle className="text-lg">Mensagem de Confirmação (WhatsApp)</CardTitle>
                </div>
                <CardDescription>
                  Enviada automaticamente no WhatsApp do cliente assim que o PIX for aprovado.
                </CardDescription>
              </div>
              <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-300">
                Pós-Pagamento
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-1.5">
              <span className="text-xs font-bold text-muted-foreground self-center mr-1">Tags:</span>
              {[
                { label: '{cliente}', tag: '{cliente}' },
                { label: '{assinaturas}', tag: '{assinaturas}' },
                { label: '{novo_vencimento}', tag: '{novo_vencimento}' },
                { label: '{valor}', tag: '{valor}' },
                { label: '{telefone}', tag: '{telefone}' },
                { label: '{status}', tag: '{status}' },
              ].map((item) => (
                <button
                  key={item.tag}
                  type="button"
                  onClick={() => insertSuccessTag(item.tag)}
                  className="px-2.5 py-1 text-xs font-mono font-semibold rounded-lg bg-secondary hover:bg-primary/10 border transition-colors"
                >
                  {item.label}
                </button>
              ))}
            </div>

            <Textarea
              rows={8}
              value={successMessage}
              onChange={(e) => setSuccessMessage(e.target.value)}
              placeholder="Digite o modelo de mensagem..."
              className="font-mono text-sm leading-relaxed"
            />
          </CardContent>
        </Card>

        {/* MENSAGEM DE COBRANÇA COM BOTÃO INTERATIVO */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <Sparkles className="h-5 w-5 text-blue-600" />
                  <CardTitle className="text-lg">Mensagem de Cobrança com Botão Interativo</CardTitle>
                </div>
                <CardDescription>
                  Enviada com o botão oficial nativo do WhatsApp [SIM, RENOVAR AGORA]. O link não fica visível no texto, abrindo direto no clique do botão.
                </CardDescription>
              </div>
              <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-300 font-bold">
                Botão WhatsApp Nativo
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pb-2">
              <div className="space-y-1.5">
                <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  Texto do Botão (Abre o link de renovação)
                </Label>
                <Input
                  value={buttonText}
                  onChange={(e) => setButtonText(e.target.value)}
                  placeholder="SIM, RENOVAR AGORA"
                  className="font-bold text-sm text-emerald-700 dark:text-emerald-400"
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  Texto de Rodapé (Aparece acima do botão)
                </Label>
                <Input
                  value={footerText}
                  onChange={(e) => setFooterText(e.target.value)}
                  placeholder="Entrega Automática • ⬇️Clique No Botão⬇️"
                  className="text-sm"
                />
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-xs font-bold text-muted-foreground mr-1">Tags do Texto:</span>
              {[
                { label: '{cliente}', tag: '{cliente}' },
                { label: '{assinaturas}', tag: '{assinaturas}' },
                { label: '{vencimento}', tag: '{vencimento}' },
                { label: '{valor}', tag: '{valor}' },
              ].map((item) => (
                <button
                  key={item.tag}
                  type="button"
                  onClick={() => insertBillingTag(item.tag)}
                  className="px-2.5 py-1 text-xs font-mono font-semibold rounded-lg bg-secondary hover:bg-primary/10 border transition-colors"
                >
                  {item.label}
                </button>
              ))}
              <span className="text-[11px] text-muted-foreground ml-2">
                (A tag <code className="text-emerald-600 font-mono">&#123;vencimento&#125;</code> gera <strong>{format(new Date(), 'dd/MM')} *Hoje*</strong>)
              </span>
            </div>

            <Textarea
              rows={6}
              value={billingMessage}
              onChange={(e) => setBillingMessage(e.target.value)}
              placeholder="Digite o modelo de cobrança..."
              className="font-mono text-sm leading-relaxed"
            />

            {/* PREVIEW DO WHATSAPP COM BOTÃO */}
            <div className="p-4 rounded-xl bg-slate-100 dark:bg-slate-900/80 border space-y-2">
              <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                Prévia da mensagem no WhatsApp do cliente:
              </span>
              <div className="max-w-[360px] bg-[#d9fdd3] dark:bg-[#005c4b] text-zinc-900 dark:text-zinc-100 rounded-2xl rounded-tr-none p-3.5 shadow-sm space-y-2 text-xs leading-relaxed">
                <div className="whitespace-pre-wrap font-sans">
                  {billingMessage
                    .replace(/{cliente}/g, 'João Silva')
                    .replace(/{assinaturas}/g, 'Netflix 4K Ultra HD')
                    .replace(/{vencimento}\s*\*?Hoje\*?/gi, `${format(new Date(), 'dd/MM')} *Hoje*`)
                    .replace(/{vencimento}/g, `${format(new Date(), 'dd/MM')} *Hoje*`)
                    .replace(/{valor}/g, '35,00')
                    .replace(/🔗?\s*{link_renovacao}/gi, '')
                    .replace(/🔗?\s*{link}/gi, '')
                    .trim()}
                </div>
                <div className="text-[10px] text-zinc-600 dark:text-zinc-300 pt-1 border-t border-black/5 dark:border-white/10 font-medium">
                  {footerText}
                </div>
                <div className="pt-1">
                  <div className="w-full py-2.5 px-3 rounded-xl bg-white dark:bg-zinc-800 text-emerald-700 dark:text-emerald-400 font-bold text-center border border-emerald-200 dark:border-emerald-800/60 shadow-sm flex items-center justify-center gap-1.5 text-xs">
                    <ExternalLink className="h-3.5 w-3.5 text-emerald-600" />
                    <span>{buttonText || 'SIM, RENOVAR AGORA'}</span>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* MENSAGEM DE SUPORTE AUTOMÁTICO NA RENOVAÇÃO */}
        <Card className="border-red-200 dark:border-red-950/50">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <LifeBuoy className="h-5 w-5 text-red-600" />
                  <CardTitle className="text-lg">Mensagem de Suporte Aberto (Quando o Cliente Relata Problema)</CardTitle>
                </div>
                <CardDescription>
                  Disparada no WhatsApp quando o cliente marca &quot;Não está funcionando&quot; ao renovar. O CRM marca suporte automaticamente e envia esta mensagem.
                </CardDescription>
              </div>
              <Badge variant="outline" className="bg-red-50 text-red-700 border-red-300">
                Suporte Automático
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-1.5">
              <span className="text-xs font-bold text-muted-foreground self-center mr-1">Tags:</span>
              {[
                { label: '{cliente}', tag: '{cliente}' },
                { label: '{assinatura}', tag: '{assinatura}' },
                { label: '{novo_vencimento}', tag: '{novo_vencimento}' },
                { label: '{valor}', tag: '{valor}' },
                { label: '{telefone}', tag: '{telefone}' },
                { label: '{status}', tag: '{status}' },
              ].map((item) => (
                <button
                  key={item.tag}
                  type="button"
                  onClick={() => insertSupportTag(item.tag)}
                  className="px-2.5 py-1 text-xs font-mono font-semibold rounded-lg bg-secondary hover:bg-primary/10 border transition-colors"
                >
                  {item.label}
                </button>
              ))}
            </div>

            <Textarea
              rows={8}
              value={supportMessage}
              onChange={(e) => setSupportMessage(e.target.value)}
              placeholder="Digite o modelo de mensagem de suporte..."
              className="font-mono text-sm leading-relaxed"
            />
          </CardContent>
        </Card>

        {/* SALVAR */}
        <div className="flex justify-end pt-2 pb-8">
          <Button onClick={handleSave} disabled={isSaving} size="lg" className="px-8 font-bold gap-2">
            {isSaving ? 'Salvando...' : 'Salvar Configurações'}
          </Button>
        </div>
      </main>
    </div>
  );
}
