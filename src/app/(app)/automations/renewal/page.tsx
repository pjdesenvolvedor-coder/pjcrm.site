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
import { Sparkles, Copy, Check, CreditCard, ShieldCheck, MessageSquare, Zap, ExternalLink } from 'lucide-react';
import { DEFAULT_LINKINPAY_TOKEN } from '@/lib/linkinpay';

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

  useEffect(() => {
    if (settings) {
      setIsActive(settings.isAutoRenewalActive !== false);
      setSuccessMessage(settings.renewalSuccessMessage || DEFAULT_SUCCESS_MESSAGE);
      setBillingMessage(settings.renewalBillingMessage || DEFAULT_BILLING_MESSAGE);
      setLinkinpayToken(settings.linkinpayToken || DEFAULT_LINKINPAY_TOKEN);
    }
  }, [settings]);

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
