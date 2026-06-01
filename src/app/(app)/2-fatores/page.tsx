// src/app/(app)/2-fatores/page.tsx

'use client';

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

  const [useSeparate, setUseSeparate] = useState<boolean>(false);
  const [token, setToken] = useState('');
  const [template, setTemplate] = useState('Seu código de verificação é {codigo}');

  // Load existing settings
  useEffect(() => {
    if (settings) {
      setUseSeparate(!!settings.useSeparateZap);
      setToken(settings.billingWebhookToken ?? '');
      setTemplate(settings.messageTemplate ?? 'Seu código de verificação é {codigo}');
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
    </div>
  );
}
