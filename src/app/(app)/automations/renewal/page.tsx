'use client';

import { useState, useEffect } from 'react';
import { doc } from 'firebase/firestore';
import { useFirebase, useUser, useDoc, setDocumentNonBlocking, useMemoFirebase } from '@/firebase';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import type { Settings } from '@/lib/types';
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
  '👉 Para renovar com segurança via PIX e manter seu acesso ativo sem interrupções, acesse o link oficial abaixo:\n' +
  '🔗 {link_renovacao}';

export default function RenewalAutomationPage() {
  const { firestore } = useFirebase();
  const { user } = useUser();
  const { toast } = useToast();

  const settingsDocRef = useMemoFirebase(() => {
    if (!user) return null;
    return doc(firestore, 'users', user.uid, 'settings', 'config');
  }, [firestore, user]);

  const { data: settings, isLoading } = useDoc<Settings>(settingsDocRef);

  const [isActive, setIsActive] = useState(true);
  const [successMessage, setSuccessMessage] = useState(DEFAULT_SUCCESS_MESSAGE);
  const [billingMessage, setBillingMessage] = useState(DEFAULT_BILLING_MESSAGE);
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
      setIsActive(settings.isAutoRenewalActive !== false);
      setSuccessMessage(settings.renewalSuccessMessage || DEFAULT_SUCCESS_MESSAGE);
      setBillingMessage(settings.renewalBillingMessage || DEFAULT_BILLING_MESSAGE);
      setLinkinpayToken(settings.linkinpayToken || DEFAULT_LINKINPAY_TOKEN);
      setRenewalZapInstance(settings.renewalZapInstance || 'auto');
      checkZapStatuses();
    }
  }, [settings?.webhookToken, settings?.billingWebhookToken, settings?.renewalZapInstance]);

  const handleSave = () => {
    if (!settingsDocRef) return;
    setIsSaving(true);

    setDocumentNonBlocking(
      settingsDocRef,
      {
        isAutoRenewalActive: isActive,
        renewalSuccessMessage: successMessage.trim(),
        renewalBillingMessage: billingMessage.trim(),
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

  const insertSuccessTag = (tag: string) => {
    setSuccessMessage((prev) => `${prev} ${tag}`);
  };

  const insertBillingTag = (tag: string) => {
    setBillingMessage((prev) => `${prev} ${tag}`);
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

        {/* ATIVAR AUTOMAÇÃO */}
        <Card className="border-2 border-emerald-500/20 bg-emerald-500/5">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between gap-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <Zap className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                  <Label className="text-base font-bold text-zinc-900 dark:text-white">
                    Ativar Renovação Automática via PIX
                  </Label>
                </div>
                <p className="text-xs text-muted-foreground">
                  Quando ativo, os avisos de vencimento geram um link PIX exclusivo. Ao pagar, o sistema adiciona 1 mês à assinatura e confirma no WhatsApp.
                </p>
              </div>
              <Switch checked={isActive} onCheckedChange={setIsActive} />
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

        {/* MENSAGEM DE COBRANÇA / AVISO COM LINK */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <Sparkles className="h-5 w-5 text-blue-600" />
                  <CardTitle className="text-lg">Mensagem de Cobrança com Link PIX</CardTitle>
                </div>
                <CardDescription>
                  Modelo utilizado nas cobranças automáticas de vencimento para enviar o link direto.
                </CardDescription>
              </div>
              <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-300">
                Aviso Vencimento
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-1.5">
              <span className="text-xs font-bold text-muted-foreground self-center mr-1">Tags:</span>
              {[
                { label: '{cliente}', tag: '{cliente}' },
                { label: '{assinaturas}', tag: '{assinaturas}' },
                { label: '{vencimento}', tag: '{vencimento}' },
                { label: '{link_renovacao}', tag: '{link_renovacao}' },
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
            </div>

            <Textarea
              rows={8}
              value={billingMessage}
              onChange={(e) => setBillingMessage(e.target.value)}
              placeholder="Digite o modelo de cobrança com o link..."
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
