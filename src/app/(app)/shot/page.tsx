'use client';

import { useState } from 'react';
import { doc } from 'firebase/firestore';
import { useFirebase, useUser, useDoc, useMemoFirebase } from '@/firebase';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Send, RefreshCw, AlertTriangle, Timer } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import type { Settings } from '@/lib/types';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Slider } from '@/components/ui/slider';

export default function ShotPage() {
  const { toast } = useToast();
  const { firestore, user } = useFirebase();
  const [message, setMessage] = useState('');
  const [numbers, setNumbers] = useState('');
  const [delay, setDelay] = useState([6]); // default 6 seconds
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
        .map(n => `"${n}@s.whatsapp.net"`)
        .join(', ');

    const delayValue = delay[0] * 10;

    try {
      const webhookUrl = 'https://n8nbeta.typeflow.app.br/webhook/eaad39ed-3dd9-4b20-a061-c45530b71e87';
      
      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
            numbers: formattedNumbers,
            message: message,
            token: settings.webhookToken,
            delay: delayValue,
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
        <div className="w-full max-w-3xl mx-auto">
            <Card className="shadow-lg">
              <CardHeader>
                <CardTitle className="text-2xl">Criar Disparo</CardTitle>
                <CardDescription>
                  Escreva a mensagem, adicione a lista de números e defina o atraso entre os envios.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                 <Alert variant="destructive">
                    <AlertTriangle className="h-4 w-4" />
                    <AlertTitle>Atenção!</AlertTitle>
                    <AlertDescription>
                        O envio de mensagens em massa pode resultar no bloqueio da sua conta do WhatsApp. Use com moderação e por sua conta e risco.
                    </AlertDescription>
                </Alert>
                <div className="space-y-2">
                  <Label htmlFor="shot-message" className="text-base font-semibold">Mensagem</Label>
                  <Textarea
                    id="shot-message"
                    placeholder="Digite sua mensagem aqui..."
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    disabled={isSending}
                    className="min-h-[120px] text-base"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="shot-numbers" className="text-base font-semibold">Números</Label>
                   <p className="text-sm text-muted-foreground">Cole os números abaixo, um por linha.</p>
                  <Textarea
                    id="shot-numbers"
                    placeholder="5511999998888&#10;5521988887777&#10;..."
                    value={numbers}
                    onChange={(e) => setNumbers(e.target.value)}
                    disabled={isSending}
                    className="min-h-[200px] font-mono"
                  />
                </div>
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="shot-delay" className="text-base font-semibold flex items-center gap-2">
                      <Timer className="h-5 w-5" />
                      Atraso entre envios
                    </Label>
                    <span className="font-bold text-lg text-primary">{delay[0]}s</span>
                  </div>
                  <Slider
                    id="shot-delay"
                    min={1}
                    max={60}
                    step={1}
                    value={delay}
                    onValueChange={setDelay}
                    disabled={isSending}
                  />
                   <p className="text-sm text-muted-foreground">Define o tempo em segundos a esperar antes de enviar a próxima mensagem.</p>
                </div>
              </CardContent>
              <CardFooter>
                <Button onClick={handleSendShot} size="lg" className="w-full text-lg" disabled={isSending || isLoadingSettings}>
                   {isSending ? (
                    <>
                      <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                      Enviando Disparo...
                    </>
                  ) : (
                    <>
                      <Send className="mr-2 h-5 w-5" />
                      Enviar Disparo
                    </>
                  )}
                </Button>
              </CardFooter>
            </Card>
        </div>
      </main>
    </div>
  );
}
