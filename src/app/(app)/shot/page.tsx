'use client';

import { useState } from 'react';
import { doc } from 'firebase/firestore';
import { useFirebase, useUser, useDoc, useMemoFirebase } from '@/firebase';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Send, RefreshCw, AlertTriangle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import type { Settings } from '@/lib/types';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

export default function ShotPage() {
  const { toast } = useToast();
  const { firestore, user } = useFirebase();
  const [message, setMessage] = useState('');
  const [numbers, setNumbers] = useState('');
  const [isSending, setIsSending] = useState(false);

  const settingsDocRef = useMemoFirebase(() => {
    if (!user) return null;
    return doc(firestore, 'users', user.uid, 'settings', 'config');
  }, [firestore, user]);

  const { data: settings, isLoading: isLoadingSettings } = useDoc<Settings>(settingsDocRef);

  const handleSendShot = async () => {
    if (!message.trim()) {
        toast({ variant: 'destructive', title: 'Mensagem vazia', description: 'Por favor, escreva uma mensagem.' });
        return;
    }
    if (!numbers.trim()) {
        toast({ variant: 'destructive', title: 'Nenhum número', description: 'Por favor, insira pelo menos um número.' });
        return;
    }

    if (!settings?.webhookToken) {
      toast({ variant: 'destructive', title: 'Token não configurado', description: 'Por favor, configure seu token de webhook na página de Configurações.' });
      return;
    }

    setIsSending(true);

    const formattedNumbers = numbers
        .split('\n')
        .map(n => n.trim().replace(/\D/g, ''))
        .filter(n => n)
        .map(n => `${n}@s.whatsapp.net`)
        .join(',');

    try {
      // NOTE: The user did not provide a webhook URL. Using a placeholder.
      const webhookUrl = 'https://n8nbeta.typeflow.app.br/webhook/mass-message-placeholder';
      
      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
            numbers: formattedNumbers,
            message: message,
            token: settings.webhookToken 
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Falha no webhook: ${errorText}`);
      }
      
      toast({ title: 'Disparo Enviado!', description: `Sua mensagem está sendo enviada para os números fornecidos.` });
      setMessage('');
      setNumbers('');

    } catch (error: any) {
      console.error('Webhook error:', error);
      toast({ variant: 'destructive', title: 'Erro no Envio', description: error.message || 'Não foi possível se comunicar com o webhook.' });
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title="Disparo em Massa"
        description="Envie a mesma mensagem para uma lista de números do WhatsApp."
      />
      <main className="flex-1 overflow-auto p-4 md:p-6">
        <div className="w-full max-w-2xl mx-auto">
            <Card>
              <CardHeader>
                <CardTitle>Criar Disparo</CardTitle>
                <CardDescription>
                  Escreva a mensagem e cole a lista de números, um por linha.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                 <Alert variant="destructive">
                    <AlertTriangle className="h-4 w-4" />
                    <AlertTitle>Atenção!</AlertTitle>
                    <AlertDescription>
                        O envio de mensagens em massa pode resultar no bloqueio da sua conta do WhatsApp. Use com moderação e por sua conta e risco.
                    </AlertDescription>
                </Alert>
                <div className="space-y-2">
                  <Label htmlFor="shot-message">Mensagem</Label>
                  <Textarea
                    id="shot-message"
                    placeholder="Digite sua mensagem aqui..."
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    disabled={isSending}
                    className="min-h-[120px]"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="shot-numbers">Números</Label>
                  <Textarea
                    id="shot-numbers"
                    placeholder="5511999998888\n5521988887777\n..."
                    value={numbers}
                    onChange={(e) => setNumbers(e.target.value)}
                    disabled={isSending}
                    className="min-h-[200px] font-mono"
                  />
                </div>
                <Button onClick={handleSendShot} className="w-full" disabled={isSending || isLoadingSettings}>
                   {isSending ? (
                    <>
                      <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                      Enviando Disparo...
                    </>
                  ) : (
                    <>
                      <Send className="mr-2 h-4 w-4" />
                      Enviar Disparo
                    </>
                  )}
                </Button>
              </CardContent>
            </Card>
        </div>
      </main>
    </div>
  );
}
