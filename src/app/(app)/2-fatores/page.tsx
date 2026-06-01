// src/app/(app)/2-fatores/page.tsx

'use client';
export const ssr = false;

import { useState, useEffect } from 'react';
import { useFirebase, useDoc, useMemoFirebase } from '@/firebase';
import { doc, setDoc } from 'firebase/firestore';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { ShieldCheck } from 'lucide-react';

export default function TwoFactorSettings() {
  const { firestore, effectiveUserId } = useFirebase();
  const { toast } = useToast();

  const settingsDocRef = useMemoFirebase(
    () => (effectiveUserId ? doc(firestore, 'users', effectiveUserId, 'settings', '2fatores') : null),
    [firestore, effectiveUserId]
  );
  const { data: settings } = useDoc(settingsDocRef);

  const configDocRef = useMemoFirebase(
    () => (effectiveUserId ? doc(firestore, 'users', effectiveUserId, 'settings', 'config') : null),
    [firestore, effectiveUserId]
  );
  const { data: config } = useDoc(configDocRef);

  const [useSeparate, setUseSeparate] = useState<boolean>(false);
  const [token, setToken] = useState('');
  const [template, setTemplate] = useState('🔒 *Código de Acesso*\n\n> Seu codigo: {codigo}');
  const [manualNumber, setManualNumber] = useState('');
  const [manualMessage, setManualMessage] = useState('');
  const sendManualMessage = async () => {
    if (!manualNumber || !manualMessage) {
      toast({ title: 'Preencha número e mensagem', variant: 'destructive' });
      return;
    }
    const resolvedToken = useSeparate && token.trim()
      ? token.trim()
      : (config?.webhookToken ?? '');

    if (!resolvedToken) {
      toast({ title: 'Nenhum Token configurado para envio', variant: 'destructive' });
      return;
    }

    const payload = {
      text: manualMessage.replace(/\n/g, '\\n'),
      number: manualNumber.replace(/\D/g, ''),
      token: resolvedToken,
    };
    try {
      const resp = await fetch('https://n8nbeta.typeflow.app.br/webhook/235c79d0-71ed-4a43-aa3c-5c0cf1de2580', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!resp.ok) {
        const err = await resp.text();
        console.error('Webhook error', err);
        toast({ title: 'Falha ao enviar', variant: 'destructive' });
        return;
      }
      toast({ title: 'Mensagem enviada' });
    } catch (e: any) {
      console.error('Send error', e);
      toast({ title: 'Erro ao enviar', variant: 'destructive' });
    }
  };

  // Load existing settings
  useEffect(() => {
    if (settings) {
      setUseSeparate(!!settings.useSeparateZap);
      setToken(settings.billingWebhookToken ?? '');
      setTemplate(settings.messageTemplate ?? '🔒 *Código de Acesso*\n\n> Seu codigo: {codigo}');
    }
  }, [settings]);

  const saveSettings = async () => {
    if (!effectiveUserId) return;
    const cfgRef = doc(firestore, 'users', effectiveUserId, 'settings', '2fatores');
    await setDoc(cfgRef, {
      useSeparateZap: useSeparate,
      billingWebhookToken: token.trim(),
      messageTemplate: template,
    }, { merge: true });
    toast({ title: 'Configurações salvas' });
  };

  return (
    <div className="max-w-2xl mx-auto p-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5" />
            Configurações 2‑Fatores (SiteVendas)
          </CardTitle>
          <CardDescription>Defina como o código será enviado via WhatsApp.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-4">
            <Button
              variant={!useSeparate ? 'default' : 'outline'}
              onClick={() => setUseSeparate(false)}
            >
              Usar Hub Principal
            </Button>
            <Button
              variant={useSeparate ? 'default' : 'outline'}
              onClick={() => setUseSeparate(true)}
            >
              Usar Zap Separado
            </Button>
          </div>

          {useSeparate && (
            <div className="space-y-2">
              <Input
                placeholder="Token do Zap"
                value={token}
                onChange={e => setToken(e.target.value)}
              />
            </div>
          )}

          <Textarea
            placeholder="Modelo de mensagem. Use {codigo} para inserir o código."
            rows={4}
            value={template}
            onChange={e => setTemplate(e.target.value)}
          />
          <Button onClick={saveSettings}>Salvar Configurações</Button>
        </CardContent>
      </Card>

      {/* Manual Send Section */}
      <Card className="mt-8">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5" />
            Envio Manual 2‑FA
          </CardTitle>
          <CardDescription>Informe um número e a mensagem que deseja enviar imediatamente.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Input
            placeholder="Número do cliente (somente dígitos)"
            value={manualNumber}
            onChange={e => setManualNumber(e.target.value)}
          />
          <Textarea
            placeholder="Mensagem a ser enviada"
            rows={4}
            value={manualMessage}
            onChange={e => setManualMessage(e.target.value)}
          />
          <Button onClick={sendManualMessage}>Enviar Mensagem</Button>
        </CardContent>
      </Card>
    </div>
  );
}
