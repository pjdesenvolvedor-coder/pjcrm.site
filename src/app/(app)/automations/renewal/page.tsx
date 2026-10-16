'use client';

import { useState, useEffect, useMemo } from 'react';
import { doc, collection, getDocs } from 'firebase/firestore';
import { useFirebase, useUser, useDoc, useCollection, setDocumentNonBlocking, useMemoFirebase } from '@/firebase';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import type { Settings, Client, RenewalFollowUpStep } from '@/lib/types';
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
  Plus,
  Trash2,
  Timer,
  Flame,
  BellRing,
  ArrowRight,
  Users,
  CheckCheck,
  MousePointerClick,
  XCircle,
} from 'lucide-react';
import { DEFAULT_LINKINPAY_TOKEN } from '@/lib/linkinpay';
import { DEFAULT_PJPAY_TOKEN } from '@/lib/pjpay';
import { cn } from '@/lib/utils';

const DEFAULT_FOLLOWUP_STEPS: RenewalFollowUpStep[] = [
  {
    id: 'step_1',
    name: '1º Lembrete • Esqueceu de Renovar?',
    isActive: true,
    delayValue: 2,
    delayUnit: 'hours',
    message:
      '⏳ *LEMBRETE DE RENOVAÇÃO*\n\n' +
      'Olá *{cliente}*, vimos que você recebeu nossa mensagem mais cedo, mas ainda não identificamos a renovação da sua assinatura.\n\n' +
      '📦 *Assinatura(s):* {assinaturas}\n' +
      '💰 *Valor:* R$ {valor}\n\n' +
      '👉 Para não correr o risco de ficar sem acesso hoje, clique no botão abaixo e renove em segundos via PIX automático:',
    includeRenewalButton: true,
    customButtonText: 'SIM, RENOVAR AGORA',
    customFooterText: 'Liberação Instantânea • ⬇️Clique No Botão⬇️',
  },
  {
    id: 'step_2',
    name: '2º Aviso • Evite a Suspensão do Acesso',
    isActive: true,
    delayValue: 6,
    delayUnit: 'hours',
    message:
      '⚠️ *AVISO IMPORTANTE: ACESSO PRESTES A PAUSAR*\n\n' +
      'Oi *{cliente}*! Passando para avisar que o sistema ainda não registrou o pagamento da sua assinatura *{assinaturas}*.\n\n' +
      '🔒 Para evitar que sua tela seja bloqueada automaticamente pelo sistema, finalize sua renovação clicando no botão oficial abaixo:',
    includeRenewalButton: true,
    customButtonText: 'MANTER MEU ACESSO ATIVO',
    customFooterText: 'Evite o Bloqueio Automático • ⬇️Clique Abaixo⬇️',
  },
  {
    id: 'step_3',
    name: '3º Aviso • Última Chamada (24h após cobrança)',
    isActive: true,
    delayValue: 24,
    delayUnit: 'hours',
    message:
      '🚨 *ÚLTIMA CHAMADA PARA RENOVAÇÃO*\n\n' +
      'Olá *{cliente}*, sua assinatura *{assinaturas}* está vencida e a vaga no grupo/conta será liberada para outro cliente em breve.\n\n' +
      '⚡ Se você deseja continuar com seu acesso, clique no botão abaixo agora mesmo para renovar via PIX ou clique em "Não quero renovar" para encerrar:',
    includeRenewalButton: true,
    customButtonText: 'GARANTIR MINHA VAGA AGORA',
    customFooterText: 'Última Chamada • ⬇️Escolha uma opção abaixo⬇️',
    includeCancelButton: true,
    cancelButtonText: 'Não quero renovar',
  },
];

const FOLLOWUP_TEMPLATES = [
  {
    label: '😊 Lembrete Amigável',
    title: 'Lembrete Amigável',
    message:
      '⏳ *LEMBRETE DE RENOVAÇÃO*\n\n' +
      'Olá *{cliente}*, tudo bem? Vimos que na correria do dia a dia você ainda não conseguiu finalizar a renovação da sua assinatura *{assinaturas}*.\n\n' +
      '💰 *Valor:* R$ {valor}\n\n' +
      '👉 Clique no botão abaixo para gerar seu PIX e renovar instantaneamente:',
    buttonText: 'SIM, RENOVAR AGORA',
  },
  {
    label: '⚠️ Aviso de Suspensão',
    title: 'Aviso de Bloqueio de Sinal',
    message:
      '⚠️ *ATENÇÃO: ASSINATURA PENDENTE*\n\n' +
      'Oi *{cliente}*! O sistema identificou que sua assinatura *{assinaturas}* permanece pendente de renovação.\n\n' +
      '🔒 Para evitar a pausa automática do seu acesso, clique no botão abaixo e regularize em menos de 1 minuto:',
    buttonText: 'REGULARIZAR MEU ACESSO',
  },
  {
    label: '🚨 Última Chamada / Vaga',
    title: 'Última Chamada',
    message:
      '🚨 *ÚLTIMO AVISO DE RENOVAÇÃO*\n\n' +
      'Olá *{cliente}*, como ainda não identificamos o pagamento de *{assinaturas}*, o sistema fará a remoção automática do acesso em breve.\n\n' +
      '⚡ Quer manter sua assinatura ativa? Clique no botão abaixo agora mesmo:',
    buttonText: 'RENOVAR MINHA ASSINATURA',
  },
];

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

  const clientsCollectionRef = useMemoFirebase(() => {
    if (!user) return null;
    return collection(firestore, 'users', user.uid, 'clients');
  }, [firestore, user]);

  const { data: allClientsData } = useCollection<Client>(clientsCollectionRef);

  const [isActive, setIsActive] = useState(false);
  const [renewalSendTime, setRenewalSendTime] = useState('14:30');
  const [renewalDelaySeconds, setRenewalDelaySeconds] = useState(15);
  const [isLoadingManual, setIsLoadingManual] = useState(false);
  const [successMessage, setSuccessMessage] = useState(DEFAULT_SUCCESS_MESSAGE);
  const [billingMessage, setBillingMessage] = useState(DEFAULT_BILLING_MESSAGE);
  const [supportMessage, setSupportMessage] = useState(DEFAULT_SUPPORT_MESSAGE);
  const [buttonText, setButtonText] = useState('SIM, RENOVAR AGORA');
  const [footerText, setFooterText] = useState('Entrega Automática • ⬇️Clique No Botão⬇️');
  const [renewalPixGateway, setRenewalPixGateway] = useState<'pjpay' | 'linkinpay'>('pjpay');
  const [pjpayToken, setPjpayToken] = useState(DEFAULT_PJPAY_TOKEN);
  const [linkinpayToken, setLinkinpayToken] = useState(DEFAULT_LINKINPAY_TOKEN);
  const [copiedWebhook, setCopiedWebhook] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Estados do Remarketing Pós-Cobrança (Clientes que não renovaram)
  const [isRenewalFollowUpActive, setIsRenewalFollowUpActive] = useState(true);
  const [followUpSteps, setFollowUpSteps] = useState<RenewalFollowUpStep[]>(DEFAULT_FOLLOWUP_STEPS);
  const [activeStepTab, setActiveStepTab] = useState<string>('step_1');
  const [dispatchingFollowUpKey, setDispatchingFollowUpKey] = useState<string | null>(null);
  const [nowTick, setNowTick] = useState<number>(Date.now());

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
    const interval = setInterval(() => setNowTick(Date.now()), 15000);
    return () => clearInterval(interval);
  }, []);

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
      setRenewalPixGateway(settings.renewalPixGateway || 'pjpay');
      setPjpayToken(settings.pjpayToken || DEFAULT_PJPAY_TOKEN);
      setLinkinpayToken(settings.linkinpayToken || DEFAULT_LINKINPAY_TOKEN);
      setRenewalZapInstance(settings.renewalZapInstance || 'auto');
      setIsRenewalFollowUpActive(settings.isRenewalFollowUpActive ?? true);
      if (Array.isArray(settings.renewalFollowUpSteps) && settings.renewalFollowUpSteps.length > 0) {
        const normalizedSteps = settings.renewalFollowUpSteps.map((s, idx) => {
          if (s.id === 'step_3' || idx === 2) {
            return {
              ...s,
              includeCancelButton: s.includeCancelButton ?? true,
              cancelButtonText: s.cancelButtonText || 'Não quero renovar',
            };
          }
          return s;
        });
        setFollowUpSteps(normalizedSteps);
        if (!normalizedSteps.some(s => s.id === activeStepTab)) {
          setActiveStepTab(normalizedSteps[0].id);
        }
      }
      checkZapStatuses();
    }
  }, [
    settings?.webhookToken,
    settings?.billingWebhookToken,
    settings?.renewalZapInstance,
    settings?.renewalSendTime,
    settings?.renewalDelaySeconds,
    settings?.renewalPixGateway,
    settings?.pjpayToken,
    settings?.linkinpayToken,
    settings?.isRenewalFollowUpActive,
    settings?.renewalFollowUpSteps,
  ]);

  const handleAddFollowUpStep = () => {
    const nextNum = followUpSteps.length + 1;
    const newId = `step_${Date.now()}`;
    const newStep: RenewalFollowUpStep = {
      id: newId,
      name: `${nextNum}º Lembrete de Renovação`,
      isActive: true,
      delayValue: nextNum === 1 ? 2 : nextNum === 2 ? 6 : 24,
      delayUnit: 'hours',
      message:
        '⏳ *LEMBRETE DE RENOVAÇÃO*\n\n' +
        'Olá *{cliente}*, vimos que sua assinatura *{assinaturas}* ainda aguarda renovação.\n\n' +
        '💰 *Valor:* R$ {valor}\n\n' +
        '👉 Para renovar agora via PIX e manter seu acesso sem pausas, clique no botão abaixo:',
      includeRenewalButton: true,
      customButtonText: buttonText || 'SIM, RENOVAR AGORA',
      customFooterText: footerText || 'Entrega Automática • ⬇️Clique No Botão⬇️',
      includeCancelButton: nextNum >= 3,
      cancelButtonText: 'Não quero renovar',
      createdAt: Date.now(),
    };
    const updated = [...followUpSteps, newStep];
    setFollowUpSteps(updated);
    setActiveStepTab(newId);
  };

  const handleUpdateFollowUpStep = (id: string, patch: Partial<RenewalFollowUpStep>) => {
    setFollowUpSteps(prev => prev.map(s => (s.id === id ? { ...s, ...patch } : s)));
  };

  const handleRemoveFollowUpStep = (id: string) => {
    if (followUpSteps.length <= 1) {
      toast({
        variant: 'destructive',
        title: 'Mínimo de 1 etapa',
        description: 'Mantenha ao menos uma etapa ou desative o funil no botão superior.',
      });
      return;
    }
    const updated = followUpSteps.filter(s => s.id !== id);
    setFollowUpSteps(updated);
    if (activeStepTab === id && updated.length > 0) {
      setActiveStepTab(updated[0].id);
    }
  };

  const formatDelayLabel = (val: number, unit: 'minutes' | 'hours' | 'days') => {
    const v = Number(val) || 1;
    if (unit === 'minutes') return `${v} ${v === 1 ? 'minuto' : 'minutos'}`;
    if (unit === 'hours') return `${v} ${v === 1 ? 'hora' : 'horas'}`;
    return `${v} ${v === 1 ? 'dia' : 'dias'}`;
  };

  const getStepDelayMs = (step: RenewalFollowUpStep) => {
    const val = Math.max(1, Number(step.delayValue) || 1);
    if (step.delayUnit === 'minutes') return val * 60 * 1000;
    if (step.delayUnit === 'hours') return val * 60 * 60 * 1000;
    return val * 24 * 60 * 60 * 1000;
  };

  // Agrupamento dos clientes cobrados recentemente para monitoramento em tempo real do Remarketing
  const billedGroupsMonitor = useMemo(() => {
    if (!allClientsData || allClientsData.length === 0) return [];
    const groupsMap = new Map<string, Client[]>();

    for (const c of allClientsData) {
      if (!c.lastBilledAt && !c.lastBilledDate) continue;
      const canon = getCanonicalPhone(c.phone);
      if (!canon) continue;
      if (!groupsMap.has(canon)) groupsMap.set(canon, []);
      groupsMap.get(canon)!.push(c);
    }

    const result = Array.from(groupsMap.entries()).map(([canon, group]) => {
      const primary = group[0];
      let latestBilledMs = 0;
      let latestRenewedMs = 0;

      for (const item of group) {
        const bMs = item.lastBilledAt?.toDate
          ? item.lastBilledAt.toDate().getTime()
          : item.lastBilledAt?.seconds
          ? item.lastBilledAt.seconds * 1000
          : typeof item.lastBilledAt === 'number'
          ? item.lastBilledAt
          : 0;
        if (bMs > latestBilledMs) latestBilledMs = bMs;

        const rMs = item.lastRenewedAt?.toDate
          ? item.lastRenewedAt.toDate().getTime()
          : item.lastRenewedAt?.seconds
          ? item.lastRenewedAt.seconds * 1000
          : typeof item.lastRenewedAt === 'number'
          ? item.lastRenewedAt
          : 0;
        if (rMs > latestRenewedMs) latestRenewedMs = rMs;
      }

      const isPaidAfterBilling =
        group.every(c => c.status === 'Ativo') &&
        (latestRenewedMs >= latestBilledMs || latestBilledMs === 0);

      const sentStepIds = Array.from(
        new Set(group.flatMap(c => (Array.isArray(c.sentRenewalFollowUpIds) ? c.sentRenewalFollowUpIds : [])))
      );

      const elapsedMs = latestBilledMs > 0 ? Math.max(0, nowTick - latestBilledMs) : 0;

      return {
        canon,
        clientIds: group.map(c => c.id),
        name: primary.name,
        phone: primary.phone,
        subscriptions: group.map(c => c.subscription || 'Assinatura').join(' + '),
        totalAmount: group.reduce((acc, c) => {
          const num = parseFloat(String(c.amountPaid || '0').replace(',', '.'));
          return acc + (isNaN(num) ? 0 : num);
        }, 0),
        latestBilledMs,
        elapsedMs,
        isPaid: isPaidAfterBilling,
        sentStepIds,
      };
    });

    const minBilledCutoffMs = Math.max(
      1792137294000,
      Number(settings?.renewalFollowUpActivatedAt) || 0
    );

    return result
      .filter(item => item.latestBilledMs >= minBilledCutoffMs)
      .sort((a, b) => b.latestBilledMs - a.latestBilledMs)
      .slice(0, 20);
  }, [allClientsData, nowTick, settings?.renewalFollowUpActivatedAt]);

  const formatElapsedTime = (ms: number) => {
    if (!ms || ms <= 0) return 'agora mesmo';
    const totalMinutes = Math.floor(ms / 60000);
    if (totalMinutes < 1) return 'há poucos segundos';
    if (totalMinutes < 60) return `há ${totalMinutes} min`;
    const hours = Math.floor(totalMinutes / 60);
    const remMin = totalMinutes % 60;
    if (hours < 24) return remMin > 0 ? `há ${hours}h ${remMin}min` : `há ${hours}h`;
    const days = Math.floor(hours / 24);
    return `há ${days} dia(s)`;
  };

  const handleDispatchFollowUpNow = async (clientIds: string[], step: RenewalFollowUpStep, clientName: string) => {
    if (!user || !settingsDocRef) return;
    const key = `${clientIds[0]}_${step.id}`;
    try {
      setDispatchingFollowUpKey(key);
      // Salva silenciosamente as etapas atuais antes de disparar para que o endpoint leia a versão mais recente
      setDocumentNonBlocking(
        settingsDocRef,
        {
          isRenewalFollowUpActive,
          renewalFollowUpSteps: followUpSteps,
        },
        { merge: true }
      );

      const res = await fetch('/api/renewal/dispatch-single', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user.uid,
          clientIds,
          followUpStepId: step.id,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error || 'Falha ao disparar remarketing.');
      }

      toast({
        title: 'Remarketing Enviado com Sucesso!',
        description: `A etapa "${step.name}" foi enviada para ${clientName} no WhatsApp${step.includeRenewalButton ? ' com o botão de renovação PIX' : ''}.`,
      });
    } catch (err: any) {
      toast({
        variant: 'destructive',
        title: 'Erro ao Enviar Remarketing',
        description: err.message || 'Não foi possível enviar a etapa agora.',
      });
    } finally {
      setDispatchingFollowUpKey(null);
    }
  };

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
        renewalPixGateway,
        pjpayToken: pjpayToken.trim(),
        linkinpayToken: linkinpayToken.trim(),
        renewalZapInstance,
        isRenewalFollowUpActive,
        renewalFollowUpSteps: followUpSteps,
        renewalFollowUpActivatedAt: settings?.renewalFollowUpActivatedAt || Math.max(Date.now(), 1792137294000),
      },
      { merge: true }
    );

    setTimeout(() => {
      setIsSaving(false);
      toast({
        title: 'Configurações Salvas!',
        description: 'Automação de renovação PIX e Funil de Remarketing Pós-Cobrança salvos com sucesso.',
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

      // Calcula data de hoje no fuso de Brasília (UTC-3)
      const offset = -3 * 60 * 60 * 1000;
      const nowBr = new Date(Date.now() + offset);
      const todayStr = format(nowBr, 'yyyy-MM-dd');

      // Clientes com vencimento hoje
      const todayClients = allClients.filter(c => {
        if (!c.dueDate) return false;
        const due = (c.dueDate as any).toDate ? (c.dueDate as any).toDate() : new Date(c.dueDate);
        const dueBr = new Date(due.getTime() + offset);
        const dueLocalStr = format(due, 'yyyy-MM-dd');
        const dueBrStr = format(dueBr, 'yyyy-MM-dd');
        return (dueLocalStr === todayStr || dueBrStr === todayStr) && (c.status === 'Ativo' || c.status === 'Vencido');
      });

      if (todayClients.length === 0) {
        toast({
          title: 'Nenhum cliente para hoje',
          description: 'Não há clientes com vencimento hoje marcados como Ativo ou Vencido.',
        });
        setIsLoadingManual(false);
        return;
      }

      // Bloqueio anti-duplicidade: filtra apenas clientes que ainda NÃO foram cobrados hoje (nem manual nem automático)
      const toRebill = todayClients.filter(c => c.lastBilledDate !== todayStr);

      if (toRebill.length === 0) {
        toast({
          title: 'Clientes de hoje já cobrados!',
          description: `Todos os ${todayClients.length} cliente(s) com vencimento hoje já foram cobrados (manual ou automaticamente). O bloqueio anti-duplicidade impede cobrar os mesmos clientes mais de uma vez no mesmo dia.`,
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

      const skippedCount = todayClients.length - toRebill.length;
      toast({
        title: 'Disparo Manual Iniciado!',
        description: `${items.length} cliente(s) na fila.${skippedCount > 0 ? ` (${skippedCount} já cobrado(s) hoje foram ignorados pelo bloqueio anti-duplicidade).` : ''} Acompanhe a barra de progresso no painel flutuante.`,
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
        description="Gere links de pagamento oficiais via PJ Pay Gateway ou LinkinPay e renove as assinaturas do cliente imediatamente após o pagamento."
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
                      <li>
                        <strong>Bloqueio Anti-Duplicidade:</strong> Clientes já cobrados hoje (manual ou automaticamente) ficam protegidos contra novas cobranças no mesmo dia. O sistema só cobra novamente os clientes do próximo dia.
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
                  Não quer esperar o horário automático? Você pode disparar manualmente agora para os clientes que vencem hoje e ainda não foram cobrados. Clientes já cobrados hoje são ignorados automaticamente para evitar duplicatas.
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

        {/* SEÇÃO: FUNIL DE REMARKETING PÓS-COBRANÇA (CASO O CLIENTE NÃO RENOVE) */}
        <Card className="border-2 border-purple-300/80 dark:border-purple-900/60 shadow-md overflow-hidden">
          <CardHeader className="bg-gradient-to-r from-purple-500/10 via-fuchsia-500/10 to-amber-500/10 border-b border-purple-200/60 dark:border-purple-900/40">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-gradient-to-br from-purple-600 to-fuchsia-600 text-white shadow-sm">
                  <Flame className="h-5 w-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <CardTitle className="text-lg">
                      Funil de Remarketing Pós-Cobrança (Se o Cliente Não Renovar)
                    </CardTitle>
                    <Badge className="bg-purple-600 text-white text-[10px] font-bold">
                      INTELIGENTE • AUTO-STOP NO PIX
                    </Badge>
                  </div>
                  <CardDescription>
                    Disparou a cobrança (manual ou automática) e passou <strong>X tempo</strong> sem o cliente pagar? O sistema identifica quem ainda não renovou e envia mensagens de recuperação com o botão oficial de renovar!
                  </CardDescription>
                </div>
              </div>

              <div className="flex items-center gap-3 self-end sm:self-center shrink-0 bg-white/80 dark:bg-zinc-900/80 px-3.5 py-2 rounded-xl border border-purple-200 dark:border-purple-800">
                <Label htmlFor="followup-funnel-switch" className="text-xs font-bold cursor-pointer">
                  {isRenewalFollowUpActive ? 'Remarketing Ativo' : 'Desativado'}
                </Label>
                <Switch
                  id="followup-funnel-switch"
                  checked={isRenewalFollowUpActive}
                  onCheckedChange={setIsRenewalFollowUpActive}
                />
              </div>
            </div>
          </CardHeader>

          <CardContent className="pt-6 space-y-6">
            {/* LINHA DO TEMPO VISUAL DO FUNIL */}
            <div className="p-4 rounded-2xl bg-gradient-to-r from-slate-50 via-purple-50/40 to-emerald-50/40 dark:from-slate-900/60 dark:via-purple-950/20 dark:to-emerald-950/20 border border-purple-200/60 dark:border-purple-900/40 space-y-3">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <span className="text-xs font-bold uppercase tracking-wider text-purple-800 dark:text-purple-300 flex items-center gap-1.5">
                  <Timer className="h-4 w-4 text-purple-600" /> Como funciona a jornada automática após o disparo da cobrança:
                </span>
                <span className="text-[11px] text-emerald-700 dark:text-emerald-400 font-semibold flex items-center gap-1">
                  <CheckCircle2 className="h-3.5 w-3.5" /> Se o cliente pagar em qualquer momento, o funil para na hora!
                </span>
              </div>

              <div className="flex items-center gap-2 overflow-x-auto pb-2 pt-1">
                {/* PASSO 0: COBRANÇA ENVIADA */}
                <div className="shrink-0 p-3 rounded-xl bg-white dark:bg-zinc-900 border-2 border-emerald-500/60 shadow-sm min-w-[175px]">
                  <div className="flex items-center justify-between text-[10px] font-bold text-emerald-700 dark:text-emerald-400 uppercase">
                    <span>Marco Zero (0 min)</span>
                    <Send className="h-3 w-3" />
                  </div>
                  <p className="font-bold text-xs mt-1 text-slate-800 dark:text-slate-100">
                    1. Cobrança Disparada
                  </p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    Manual ou Automática
                  </p>
                </div>

                {followUpSteps.map((step, idx) => (
                  <div key={step.id} className="flex items-center gap-2 shrink-0">
                    <div className="flex flex-col items-center px-1 text-purple-600 dark:text-purple-400">
                      <span className="text-[10px] font-mono font-bold whitespace-nowrap bg-purple-100 dark:bg-purple-950/80 px-2 py-0.5 rounded-full border border-purple-300 dark:border-purple-800">
                        +{formatDelayLabel(step.delayValue, step.delayUnit)}
                      </span>
                      <ArrowRight className="h-4 w-4 mt-0.5" />
                      <span className="text-[9px] text-muted-foreground whitespace-nowrap">não pagou?</span>
                    </div>

                    <div
                      onClick={() => setActiveStepTab(step.id)}
                      className={cn(
                        'shrink-0 p-3 rounded-xl border-2 cursor-pointer transition-all min-w-[190px] max-w-[220px]',
                        activeStepTab === step.id
                          ? 'border-purple-600 bg-purple-50/70 dark:bg-purple-950/40 shadow-sm ring-2 ring-purple-500/20'
                          : step.isActive
                          ? 'border-purple-200 dark:border-purple-800/70 bg-white dark:bg-zinc-900 hover:border-purple-400'
                          : 'border-slate-200 dark:border-slate-800 bg-slate-100/60 dark:bg-zinc-900/40 opacity-60'
                      )}
                    >
                      <div className="flex items-center justify-between gap-1">
                        <Badge
                          variant={step.isActive ? 'default' : 'secondary'}
                          className={cn(
                            'text-[9px] px-1.5 py-0 font-bold',
                            step.isActive ? 'bg-purple-600 text-white' : ''
                          )}
                        >
                          Etapa {idx + 1} {step.isActive ? '• Ativa' : '• Pausada'}
                        </Badge>
                        {step.includeRenewalButton && (
                          <span className="text-[9px] font-bold text-emerald-600 dark:text-emerald-400 flex items-center gap-0.5">
                            <MousePointerClick className="h-3 w-3" /> +Botão
                          </span>
                        )}
                      </div>
                      <p className="font-bold text-xs mt-1.5 truncate text-slate-800 dark:text-slate-100">
                        {step.name || `Etapa ${idx + 1}`}
                      </p>
                      <p className="text-[10px] text-muted-foreground truncate mt-0.5">
                        Após {formatDelayLabel(step.delayValue, step.delayUnit)} sem renovar
                      </p>
                    </div>
                  </div>
                ))}

                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleAddFollowUpStep}
                  className="shrink-0 h-16 border-dashed border-2 border-purple-300 dark:border-purple-800 text-purple-700 dark:text-purple-300 hover:bg-purple-50 dark:hover:bg-purple-950/30 rounded-xl px-4 font-bold text-xs gap-1.5 cursor-pointer"
                >
                  <Plus className="h-4 w-4" />
                  Nova Etapa
                </Button>
              </div>
            </div>

            {/* SELETOR DE ABAS DAS ETAPAS + BOTÃO ADICIONAR */}
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 dark:border-slate-800 pb-3">
                <div className="flex flex-wrap items-center gap-2">
                  {followUpSteps.map((step, index) => (
                    <button
                      key={step.id}
                      type="button"
                      onClick={() => setActiveStepTab(step.id)}
                      className={cn(
                        'px-3.5 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 border cursor-pointer',
                        activeStepTab === step.id
                          ? 'bg-purple-600 text-white border-purple-600 shadow-sm'
                          : 'bg-slate-100 dark:bg-zinc-900 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-800 hover:bg-purple-50 dark:hover:bg-purple-950/20'
                      )}
                    >
                      <span
                        className={cn(
                          'w-2 h-2 rounded-full',
                          step.isActive ? 'bg-emerald-400' : 'bg-slate-400'
                        )}
                      />
                      <span>
                        Etapa {index + 1}: +{formatDelayLabel(step.delayValue, step.delayUnit)}
                      </span>
                    </button>
                  ))}
                </div>

                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleAddFollowUpStep}
                  className="border-purple-300 dark:border-purple-800 text-purple-700 dark:text-purple-300 font-bold text-xs gap-1.5 h-9 rounded-xl cursor-pointer"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Adicionar Etapa ao Funil
                </Button>
              </div>

              {/* EDITOR DA ETAPA SELECIONADA */}
              {followUpSteps.map((step, index) => {
                if (step.id !== activeStepTab) return null;
                const previewBtnText = (step.customButtonText || buttonText || 'SIM, RENOVAR AGORA').trim();
                const previewFooter = (step.customFooterText || footerText || 'Entrega Automática • ⬇️Clique No Botão⬇️').trim();

                return (
                  <div
                    key={step.id}
                    className="p-5 rounded-2xl border-2 border-purple-200/80 dark:border-purple-900/50 bg-slate-50/40 dark:bg-slate-900/30 space-y-5"
                  >
                    {/* CABEÇALHO DA ETAPA */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200/80 dark:border-slate-800">
                      <div className="flex-1 space-y-1.5">
                        <Label className="text-[11px] font-bold uppercase tracking-wider text-purple-700 dark:text-purple-400">
                          Nome de Identificação da Etapa {index + 1}
                        </Label>
                        <Input
                          value={step.name}
                          onChange={e => handleUpdateFollowUpStep(step.id, { name: e.target.value })}
                          placeholder="Ex: 1º Lembrete - Esqueceu de Renovar?"
                          className="font-bold text-sm bg-white dark:bg-zinc-900"
                        />
                      </div>

                      <div className="flex items-center gap-3 self-end sm:self-center">
                        <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white dark:bg-zinc-900 border">
                          <Label htmlFor={`step-active-${step.id}`} className="text-xs font-bold cursor-pointer">
                            {step.isActive ? 'Etapa Ativa' : 'Etapa Pausada'}
                          </Label>
                          <Switch
                            id={`step-active-${step.id}`}
                            checked={step.isActive}
                            onCheckedChange={checked => handleUpdateFollowUpStep(step.id, { isActive: checked })}
                          />
                        </div>

                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => handleRemoveFollowUpStep(step.id)}
                          className="text-red-600 border-red-200 hover:bg-red-50 dark:border-red-900/50 dark:hover:bg-red-950/30 h-9 px-3 rounded-xl gap-1.5 text-xs font-bold cursor-pointer"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          Excluir
                        </Button>
                      </div>
                    </div>

                    {/* CONFIGURAÇÃO DE TEMPO (PASSOU X TEMPO SEM RENOVAR) */}
                    <div className="p-4 rounded-xl bg-white dark:bg-zinc-900 border border-slate-200 dark:border-slate-800 space-y-3">
                      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                        <div className="space-y-0.5">
                          <Label className="text-xs font-bold uppercase tracking-wider text-purple-700 dark:text-purple-400 flex items-center gap-1.5">
                            <Clock className="h-4 w-4 text-purple-600" /> Quando enviar esta mensagem? (Tempo após o disparo da cobrança)
                          </Label>
                          <p className="text-xs text-muted-foreground">
                            Se passar esse tempo desde o envio da cobrança e o cliente <strong>continuar sem renovar</strong>, o sistema dispara esta etapa automaticamente.
                          </p>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <span className="text-xs font-bold text-muted-foreground">Após:</span>
                          <Input
                            type="number"
                            min={1}
                            max={999}
                            value={step.delayValue}
                            onChange={e =>
                              handleUpdateFollowUpStep(step.id, {
                                delayValue: Math.max(1, Number(e.target.value) || 1),
                              })
                            }
                            className="w-24 font-mono font-bold text-base text-center"
                          />
                          <select
                            value={step.delayUnit}
                            onChange={e =>
                              handleUpdateFollowUpStep(step.id, {
                                delayUnit: e.target.value as 'minutes' | 'hours' | 'days',
                              })
                            }
                            className="h-10 rounded-md border border-input bg-background px-3 py-2 text-sm font-bold ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring"
                          >
                            <option value="minutes">Minutos</option>
                            <option value="hours">Horas</option>
                            <option value="days">Dias</option>
                          </select>
                        </div>
                      </div>

                      {/* ATALHOS DE TEMPO COM 1 CLIQUE */}
                      <div className="flex flex-wrap items-center gap-1.5 pt-2 border-t border-slate-100 dark:border-slate-800">
                        <span className="text-[11px] font-bold text-muted-foreground mr-1">
                          Atalhos de tempo:
                        </span>
                        {[
                          { label: '5 min (Teste Rápido)', val: 5, unit: 'minutes' as const },
                          { label: '15 min', val: 15, unit: 'minutes' as const },
                          { label: '30 min', val: 30, unit: 'minutes' as const },
                          { label: '1 hora', val: 1, unit: 'hours' as const },
                          { label: '2 horas', val: 2, unit: 'hours' as const },
                          { label: '6 horas', val: 6, unit: 'hours' as const },
                          { label: '12 horas', val: 12, unit: 'hours' as const },
                          { label: '24 horas (1 dia)', val: 24, unit: 'hours' as const },
                          { label: '2 dias', val: 2, unit: 'days' as const },
                        ].map(preset => {
                          const isSelected = step.delayValue === preset.val && step.delayUnit === preset.unit;
                          return (
                            <button
                              key={preset.label}
                              type="button"
                              onClick={() =>
                                handleUpdateFollowUpStep(step.id, {
                                  delayValue: preset.val,
                                  delayUnit: preset.unit,
                                })
                              }
                              className={cn(
                                'px-2.5 py-1 rounded-lg text-[11px] font-bold border transition-all cursor-pointer',
                                isSelected
                                  ? 'bg-purple-600 text-white border-purple-600 shadow-sm'
                                  : 'bg-slate-100 dark:bg-zinc-800 hover:bg-purple-50 dark:hover:bg-purple-950/30 text-slate-700 dark:text-slate-300'
                              )}
                            >
                              {preset.label}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* OPÇÃO DO BOTÃO INTERATIVO DE RENOVAÇÃO */}
                    <div className="p-4 rounded-xl bg-emerald-50/50 dark:bg-emerald-950/20 border-2 border-emerald-500/30 space-y-4">
                      <div className="flex items-center justify-between gap-4">
                        <div className="space-y-0.5">
                          <div className="flex items-center gap-2">
                            <MousePointerClick className="h-4 w-4 text-emerald-600" />
                            <Label
                              htmlFor={`step-btn-${step.id}`}
                              className="text-sm font-bold text-slate-900 dark:text-white cursor-pointer"
                            >
                              Enviar Junto o Mesmo Botão Interativo para Renovar (Link PIX Oficial)
                            </Label>
                          </div>
                          <p className="text-xs text-muted-foreground">
                            Quando ativado, a mensagem de remarketing vai com o botão clicável do WhatsApp que abre o checkout PIX automático do cliente.
                          </p>
                        </div>
                        <Switch
                          id={`step-btn-${step.id}`}
                          checked={step.includeRenewalButton}
                          onCheckedChange={checked =>
                            handleUpdateFollowUpStep(step.id, { includeRenewalButton: checked })
                          }
                        />
                      </div>

                      {step.includeRenewalButton && (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-3 border-t border-emerald-200/60 dark:border-emerald-900/40">
                          <div className="space-y-1">
                            <div className="flex items-center justify-between">
                              <Label className="text-[11px] font-bold uppercase tracking-wider text-emerald-800 dark:text-emerald-300">
                                Texto do Botão nesta Etapa
                              </Label>
                              <button
                                type="button"
                                onClick={() =>
                                  handleUpdateFollowUpStep(step.id, {
                                    customButtonText: buttonText || 'SIM, RENOVAR AGORA',
                                  })
                                }
                                className="text-[10px] text-emerald-700 dark:text-emerald-400 underline font-semibold cursor-pointer"
                              >
                                Usar igual ao padrão
                              </button>
                            </div>
                            <Input
                              value={step.customButtonText ?? buttonText}
                              onChange={e =>
                                handleUpdateFollowUpStep(step.id, { customButtonText: e.target.value })
                              }
                              placeholder={buttonText || 'SIM, RENOVAR AGORA'}
                              className="bg-white dark:bg-zinc-900 font-bold text-xs text-emerald-700 dark:text-emerald-400"
                            />
                          </div>

                          <div className="space-y-1">
                            <div className="flex items-center justify-between">
                              <Label className="text-[11px] font-bold uppercase tracking-wider text-emerald-800 dark:text-emerald-300">
                                Rodapé Acima do Botão
                              </Label>
                              <button
                                type="button"
                                onClick={() =>
                                  handleUpdateFollowUpStep(step.id, {
                                    customFooterText: footerText || 'Entrega Automática • ⬇️Clique No Botão⬇️',
                                  })
                                }
                                className="text-[10px] text-emerald-700 dark:text-emerald-400 underline font-semibold cursor-pointer"
                              >
                                Usar igual ao padrão
                              </button>
                            </div>
                            <Input
                              value={step.customFooterText ?? footerText}
                              onChange={e =>
                                handleUpdateFollowUpStep(step.id, { customFooterText: e.target.value })
                              }
                              placeholder={footerText || 'Entrega Automática • ⬇️Clique No Botão⬇️'}
                              className="bg-white dark:bg-zinc-900 text-xs"
                            />
                          </div>
                        </div>
                      )}

                      {/* OPÇÃO DO BOTÃO "NÃO QUERO RENOVAR" (REMOVE ASSINATURA DO CRM) */}
                      {step.includeRenewalButton && (
                        <div className="p-3.5 rounded-xl bg-red-50/70 dark:bg-red-950/20 border border-red-200 dark:border-red-900/50 space-y-3 mt-2">
                          <div className="flex items-center justify-between gap-4">
                            <div className="space-y-0.5">
                              <Label
                                htmlFor={`step-cancel-btn-${step.id}`}
                                className="text-xs font-bold text-red-700 dark:text-red-400 cursor-pointer flex items-center gap-1.5"
                              >
                                <XCircle className="h-4 w-4 text-red-600" />
                                Incluir 2º Botão: "Não quero renovar" (Remove a assinatura do CRM se o cliente clicar)
                              </Label>
                              <p className="text-[11px] text-muted-foreground">
                                Recomendado na <strong>Etapa 3 (Última Etapa)</strong>: caso o cliente clique em "Não quero renovar", a assinatura dele é excluída automaticamente do CRM.
                              </p>
                            </div>
                            <Switch
                              id={`step-cancel-btn-${step.id}`}
                              checked={step.includeCancelButton ?? (step.id === 'step_3' || index === 2)}
                              onCheckedChange={checked =>
                                handleUpdateFollowUpStep(step.id, {
                                  includeCancelButton: checked,
                                  cancelButtonText: step.cancelButtonText || 'Não quero renovar',
                                })
                              }
                            />
                          </div>

                          {(step.includeCancelButton ?? (step.id === 'step_3' || index === 2)) && (
                            <div className="pt-2 border-t border-red-200/60 dark:border-red-900/40">
                              <Label className="text-[11px] font-bold uppercase tracking-wider text-red-700 dark:text-red-400">
                                Texto do Botão de Cancelamento
                              </Label>
                              <Input
                                value={step.cancelButtonText || 'Não quero renovar'}
                                onChange={e =>
                                  handleUpdateFollowUpStep(step.id, { cancelButtonText: e.target.value })
                                }
                                placeholder="Não quero renovar"
                                className="mt-1 bg-white dark:bg-zinc-900 font-bold text-xs text-red-600 dark:text-red-400 max-w-sm"
                              />
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    {/* EDITOR DE MENSAGEM + PREVIEW LADO A LADO */}
                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
                      <div className="lg:col-span-7 space-y-3">
                        {/* MODELOS PRONTOS COM 1 CLIQUE */}
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="text-[11px] font-bold text-purple-700 dark:text-purple-300 mr-1">
                            Modelos prontos:
                          </span>
                          {FOLLOWUP_TEMPLATES.map(tpl => (
                            <button
                              key={tpl.label}
                              type="button"
                              onClick={() =>
                                handleUpdateFollowUpStep(step.id, {
                                  message: tpl.message,
                                  customButtonText: tpl.buttonText,
                                })
                              }
                              className="px-2.5 py-1 rounded-lg text-[11px] font-bold bg-purple-100/80 dark:bg-purple-950/50 text-purple-800 dark:text-purple-200 hover:bg-purple-200 dark:hover:bg-purple-900/60 border border-purple-300/60 dark:border-purple-800 transition-colors cursor-pointer"
                            >
                              {tpl.label}
                            </button>
                          ))}
                        </div>

                        {/* TAGS DINÂMICAS */}
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="text-xs font-bold text-muted-foreground mr-1">Tags:</span>
                          {[
                            { label: '{cliente}', tag: '{cliente}' },
                            { label: '{assinaturas}', tag: '{assinaturas}' },
                            { label: '{valor}', tag: '{valor}' },
                            { label: '{vencimento}', tag: '{vencimento}' },
                            { label: '{link_renovacao}', tag: '{link_renovacao}' },
                          ].map(item => (
                            <button
                              key={item.tag}
                              type="button"
                              onClick={() =>
                                handleUpdateFollowUpStep(step.id, {
                                  message: `${step.message} ${item.tag}`,
                                })
                              }
                              className="px-2.5 py-1 text-xs font-mono font-semibold rounded-lg bg-white dark:bg-zinc-900 hover:bg-purple-50 dark:hover:bg-purple-950/40 border transition-colors cursor-pointer"
                            >
                              {item.label}
                            </button>
                          ))}
                        </div>

                        <Textarea
                          rows={7}
                          value={step.message}
                          onChange={e => handleUpdateFollowUpStep(step.id, { message: e.target.value })}
                          placeholder="Digite a mensagem de remarketing caso o cliente não renove..."
                          className="font-mono text-sm leading-relaxed bg-white dark:bg-zinc-900"
                        />
                      </div>

                      {/* PRÉVIA EM TEMPO REAL DO WHATSAPP DA ETAPA */}
                      <div className="lg:col-span-5 p-4 rounded-2xl bg-slate-100 dark:bg-slate-900/90 border space-y-2.5">
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                            Prévia no WhatsApp ({formatDelayLabel(step.delayValue, step.delayUnit)} depois):
                          </span>
                          <Badge variant="outline" className="text-[10px] border-emerald-400 text-emerald-700 dark:text-emerald-400">
                            {step.includeRenewalButton ? 'Com Botão PIX' : 'Somente Texto'}
                          </Badge>
                        </div>

                        <div className="bg-[#d9fdd3] dark:bg-[#005c4b] text-zinc-900 dark:text-zinc-100 rounded-2xl rounded-tr-none p-3.5 shadow-sm space-y-2 text-xs leading-relaxed">
                          <div className="whitespace-pre-wrap font-sans">
                            {step.message
                              .replace(/{cliente}/g, 'João Silva')
                              .replace(/{assinaturas}/g, 'Netflix 4K Ultra HD')
                              .replace(/{assinatura}/g, 'Netflix 4K Ultra HD')
                              .replace(/{vencimento}/g, `${format(new Date(), 'dd/MM')} *Hoje*`)
                              .replace(/{valor}/g, '35,00')
                              .replace(
                                /{link_renovacao}/g,
                                step.includeRenewalButton ? '' : 'https://pjcrm.site/renovar/abc123'
                              )
                              .trim()}
                          </div>

                          {step.includeRenewalButton && (
                            <>
                              <div className="text-[10px] text-zinc-600 dark:text-zinc-300 pt-1.5 border-t border-black/10 dark:border-white/10 font-medium">
                                {previewFooter}
                              </div>
                              <div className="pt-1 space-y-1.5">
                                <div className="w-full py-2.5 px-3 rounded-xl bg-white dark:bg-zinc-800 text-emerald-700 dark:text-emerald-400 font-bold text-center border border-emerald-200 dark:border-emerald-800/60 shadow-sm flex items-center justify-center gap-1.5 text-xs">
                                  <ExternalLink className="h-3.5 w-3.5 text-emerald-600" />
                                  <span>{previewBtnText}</span>
                                </div>
                                {(step.includeCancelButton ?? (step.id === 'step_3' || index === 2)) && (
                                  <div className="w-full py-2.5 px-3 rounded-xl bg-white dark:bg-zinc-800 text-red-600 dark:text-red-400 font-bold text-center border border-red-200 dark:border-red-900/60 shadow-sm flex items-center justify-center gap-1.5 text-xs">
                                    <XCircle className="h-3.5 w-3.5 text-red-500" />
                                    <span>{step.cancelButtonText || 'Não quero renovar'}</span>
                                  </div>
                                )}
                              </div>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* PAINEL AO VIVO: CLIENTES COBRADOS & STATUS DO REMARKETING */}
            <div className="p-4 rounded-2xl border-2 border-slate-200 dark:border-slate-800 bg-white dark:bg-zinc-900/70 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-100 dark:border-slate-800">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 rounded-lg bg-purple-500/10 text-purple-600">
                    <BellRing className="h-5 w-5" />
                  </div>
                  <div>
                    <h4 className="font-bold text-sm text-slate-900 dark:text-white flex items-center gap-2">
                      Rastreamento em Tempo Real • Clientes Cobrados Recentemente
                      <Badge variant="outline" className="text-[10px] font-mono">
                        Auto-Refresh
                      </Badge>
                    </h4>
                    <p className="text-xs text-muted-foreground">
                      Veja quem recebeu cobrança, quem já renovou (funil encerrado) e quem está aguardando pagamento para receber o remarketing. Você também pode disparar uma etapa manualmente agora se desejar.
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <Badge className="bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-400/40 font-bold text-xs">
                    ⏳ Pendentes: {billedGroupsMonitor.filter(g => !g.isPaid).length}
                  </Badge>
                  <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-400/40 font-bold text-xs">
                    ✅ Renovados: {billedGroupsMonitor.filter(g => g.isPaid).length}
                  </Badge>
                </div>
              </div>

              {billedGroupsMonitor.length === 0 ? (
                <div className="py-8 text-center space-y-2 text-muted-foreground">
                  <Users className="h-8 w-8 mx-auto opacity-40" />
                  <p className="text-xs font-semibold">
                    Nenhum cliente com cobrança registrada recentemente.
                  </p>
                  <p className="text-[11px]">
                    Assim que você clicar em &quot;Disparar Cobrança Manual Agora&quot; ou o disparo automático rodar, os clientes aparecerão aqui em tempo real!
                  </p>
                </div>
              ) : (
                <div className="space-y-2.5 max-h-[380px] overflow-y-auto pr-1">
                  {billedGroupsMonitor.map(group => {
                    const activeSteps = followUpSteps.filter(s => s.isActive);
                    const nextPendingStep = activeSteps.find(s => !group.sentStepIds.includes(s.id));
                    const remainingMs = nextPendingStep
                      ? Math.max(0, getStepDelayMs(nextPendingStep) - group.elapsedMs)
                      : 0;

                    return (
                      <div
                        key={group.canon}
                        className={cn(
                          'p-3.5 rounded-xl border flex flex-col md:flex-row md:items-center justify-between gap-3 transition-all',
                          group.isPaid
                            ? 'bg-emerald-50/40 dark:bg-emerald-950/15 border-emerald-200 dark:border-emerald-900/40'
                            : 'bg-amber-50/30 dark:bg-amber-950/10 border-amber-200/80 dark:border-amber-900/40'
                        )}
                      >
                        <div className="space-y-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-bold text-sm text-slate-900 dark:text-slate-100">
                              {group.name}
                            </span>
                            <span className="text-xs font-mono text-muted-foreground">
                              ({group.phone})
                            </span>
                            {group.isPaid ? (
                              <Badge className="bg-emerald-600 text-white text-[10px] font-bold gap-1">
                                <CheckCheck className="h-3 w-3" /> Renovado • Remarketing Cancelado
                              </Badge>
                            ) : (
                              <Badge className="bg-amber-500 text-white text-[10px] font-bold gap-1">
                                <Clock className="h-3 w-3" /> Não Renovou Ainda (Cobrado {formatElapsedTime(group.elapsedMs)})
                              </Badge>
                            )}
                          </div>

                          <div className="text-xs text-muted-foreground flex flex-wrap items-center gap-x-3 gap-y-1">
                            <span>
                              📦 <strong>{group.subscriptions}</strong>
                            </span>
                            <span>
                              💰 <strong>R$ {group.totalAmount.toFixed(2).replace('.', ',')}</strong>
                            </span>
                            {!group.isPaid && nextPendingStep && (
                              <span className="text-purple-700 dark:text-purple-300 font-semibold">
                                🔔 Próxima etapa: <strong>{nextPendingStep.name}</strong>{' '}
                                {remainingMs > 0
                                  ? `(em ${Math.ceil(remainingMs / 60000)} min)`
                                  : '(pronta para envio)'}
                              </span>
                            )}
                          </div>
                        </div>

                        {/* BOTÕES DE ETAPA / DISPARO IMEDIATO */}
                        <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                          {followUpSteps.map((step, idx) => {
                            const alreadySent = group.sentStepIds.includes(step.id);
                            const isDispatchingThis =
                              dispatchingFollowUpKey === `${group.clientIds[0]}_${step.id}`;

                            return (
                              <Button
                                key={step.id}
                                type="button"
                                variant={alreadySent ? 'secondary' : 'outline'}
                                size="sm"
                                disabled={isDispatchingThis || group.isPaid}
                                onClick={() =>
                                  handleDispatchFollowUpNow(group.clientIds, step, group.name)
                                }
                                title={
                                  group.isPaid
                                    ? 'Cliente já renovou!'
                                    : alreadySent
                                    ? 'Já enviada automaticamente (clique se quiser reenviar agora)'
                                    : `Enviar Etapa ${idx + 1} agora no WhatsApp`
                                }
                                className={cn(
                                  'h-8 px-2.5 text-[11px] font-bold rounded-lg gap-1 cursor-pointer',
                                  alreadySent
                                    ? 'bg-purple-100 text-purple-800 dark:bg-purple-950/60 dark:text-purple-200 border border-purple-300'
                                    : 'border-purple-300 text-purple-700 dark:text-purple-300 hover:bg-purple-50'
                                )}
                              >
                                {isDispatchingThis ? (
                                  <Loader2 className="h-3 w-3 animate-spin" />
                                ) : alreadySent ? (
                                  <Check className="h-3 w-3 text-emerald-600" />
                                ) : (
                                  <Send className="h-3 w-3" />
                                )}
                                <span>
                                  {alreadySent ? `Etapa ${idx + 1} Enviada` : `Enviar Etapa ${idx + 1} Agora`}
                                </span>
                              </Button>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
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

        {/* GATEWAY DE PAGAMENTO PIX */}
        <Card className="border-2 border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
          <CardHeader className="bg-slate-50/70 dark:bg-slate-900/60 border-b border-slate-100 dark:border-slate-800">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <CreditCard className="h-5 w-5 text-emerald-600" />
                <div>
                  <CardTitle className="text-lg">Gateway de Pagamento PIX</CardTitle>
                  <CardDescription>
                    Selecione qual gateway emitirá os códigos PIX de renovação e gerenciará as baixas automáticas.
                  </CardDescription>
                </div>
              </div>
              <Badge className="bg-emerald-600 text-white font-bold text-xs px-2.5 py-1">
                {renewalPixGateway === 'pjpay' ? 'PJ Pay Gateway Ativo' : 'LinkinPay Ativo'}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="pt-6 space-y-6">
            {/* SELEÇÃO DE GATEWAY */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* CARD PJ PAY GATEWAY */}
              <div
                onClick={() => setRenewalPixGateway('pjpay')}
                className={cn(
                  "p-4 rounded-xl border-2 cursor-pointer transition-all relative flex flex-col justify-between space-y-3",
                  renewalPixGateway === 'pjpay'
                    ? "border-emerald-500 bg-emerald-50/40 dark:bg-emerald-950/20 shadow-sm ring-1 ring-emerald-500/20"
                    : "border-slate-200 dark:border-slate-800 hover:border-slate-300 bg-white dark:bg-slate-900"
                )}
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-600">
                      <ShieldCheck className="h-5 w-5" />
                    </div>
                    <div>
                      <h4 className="font-bold text-sm text-slate-800 dark:text-slate-100 flex items-center gap-1.5">
                        PJ Pay Gateway
                        <Badge variant="outline" className="text-[10px] bg-emerald-100/50 text-emerald-800 dark:text-emerald-300 border-emerald-300 font-semibold py-0">
                          Recomendado
                        </Badge>
                      </h4>
                      <p className="text-[11px] text-muted-foreground">
                        PIX com nome do cliente no QR Code e baixa em tempo real
                      </p>
                    </div>
                  </div>
                  {renewalPixGateway === 'pjpay' && (
                    <Badge className="bg-emerald-600 text-white font-bold text-[10px] px-2 py-0.5">
                      SELECIONADO
                    </Badge>
                  )}
                </div>

                <div className="pt-2 border-t border-slate-100 dark:border-slate-800/80 text-[11px] text-muted-foreground">
                  Endpoint: <span className="font-mono text-[10px]">https://www.pjgateway.com/api/v1/payments</span>
                </div>
              </div>

              {/* CARD LINKINPAY */}
              <div
                onClick={() => setRenewalPixGateway('linkinpay')}
                className={cn(
                  "p-4 rounded-xl border-2 cursor-pointer transition-all relative flex flex-col justify-between space-y-3",
                  renewalPixGateway === 'linkinpay'
                    ? "border-emerald-500 bg-emerald-50/40 dark:bg-emerald-950/20 shadow-sm ring-1 ring-emerald-500/20"
                    : "border-slate-200 dark:border-slate-800 hover:border-slate-300 bg-white dark:bg-slate-900"
                )}
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="p-2 rounded-lg bg-red-500/10 text-red-600">
                      <CreditCard className="h-5 w-5" />
                    </div>
                    <div>
                      <h4 className="font-bold text-sm text-slate-800 dark:text-slate-100">
                        LinkinPay
                      </h4>
                      <p className="text-[11px] text-muted-foreground">
                        Gateway LinkinPay padrão
                      </p>
                    </div>
                  </div>
                  {renewalPixGateway === 'linkinpay' && (
                    <Badge className="bg-emerald-600 text-white font-bold text-[10px] px-2 py-0.5">
                      SELECIONADO
                    </Badge>
                  )}
                </div>

                <div className="pt-2 border-t border-slate-100 dark:border-slate-800/80 text-[11px] text-muted-foreground">
                  Endpoint: <span className="font-mono text-[10px]">https://api.linkinpay.com.br/api/v1/pix</span>
                </div>
              </div>
            </div>

            {/* CAMPOS ESPECÍFICOS DO GATEWAY SELECIONADO */}
            {renewalPixGateway === 'pjpay' ? (
              <div className="p-4 rounded-xl border bg-slate-50/50 dark:bg-slate-900/50 space-y-4">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                      Token Bearer (PJ Pay Gateway)
                    </Label>
                    <span className="text-[11px] text-emerald-600 dark:text-emerald-400 font-medium">
                      Authorization: Bearer pj_live_...
                    </span>
                  </div>
                  <Input
                    type="text"
                    placeholder="pj_live_W9IMRIG1GFW48ND7YIUEX5sELQB4tDLD"
                    value={pjpayToken}
                    onChange={(e) => setPjpayToken(e.target.value)}
                    className="font-mono text-sm"
                  />
                  <p className="text-[11px] text-muted-foreground">
                    Chave de API da sua conta PJ Pay Gateway com permissão para criar e consultar pagamentos PIX.
                  </p>
                </div>

                <div className="space-y-2 pt-3 border-t">
                  <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                    URL do Webhook (Recebimento Automático)
                  </Label>
                  <div className="flex items-center gap-2">
                    <Input readOnly value={webhookUrl} className="font-mono text-xs bg-muted/50" />
                    <Button variant="outline" size="sm" onClick={handleCopyWebhook} className="gap-1.5 shrink-0">
                      {copiedWebhook ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
                      <span>{copiedWebhook ? 'Copiado!' : 'Copiar'}</span>
                    </Button>
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    Cadastre essa URL no painel da PJ Pay Gateway como webhook_url para notificações do evento <code className="text-xs bg-muted px-1 py-0.5 rounded font-mono">payment.paid</code>.
                  </p>
                </div>
              </div>
            ) : (
              <div className="p-4 rounded-xl border bg-slate-50/50 dark:bg-slate-900/50 space-y-4">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                      API Token (LinkinPay)
                    </Label>
                    <span className="text-[11px] text-muted-foreground font-mono">
                      Bearer Token
                    </span>
                  </div>
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

                <div className="space-y-2 pt-3 border-t">
                  <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                    URL do Webhook (Recebimento LinkinPay)
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
              </div>
            )}
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
