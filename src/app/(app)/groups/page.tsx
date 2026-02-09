'use client';

import { useState, useMemo } from 'react';
import { doc } from 'firebase/firestore';
import { useFirebase, useUser, useDoc, useMemoFirebase } from '@/firebase';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Send, RefreshCw, Copy, AlertTriangle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import type { Settings } from '@/lib/types';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';


export default function GroupsPage() {
  const { toast } = useToast();
  const { firestore, user } = useFirebase();
  const [groupCode, setGroupCode] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [jid, setJid] = useState('');

  const settingsDocRef = useMemoFirebase(() => {
    if (!user) return null;
    return doc(firestore, 'users', user.uid, 'settings', 'config');
  }, [firestore, user]);

  const { data: settings } = useDoc<Settings>(settingsDocRef);

  const handleCopyJid = () => {
    if (!jid) return;
    navigator.clipboard.writeText(jid).then(() => {
        toast({
            title: 'Copiado!',
            description: 'O JID foi copiado para a área de transferência.',
        });
    }).catch(err => {
        console.error('Failed to copy JID: ', err);
        toast({
            variant: 'destructive',
            title: 'Falha ao copiar',
            description: 'Não foi possível copiar o JID.',
        });
    });
  };

  const handleGetGroupCode = async () => {
    if (!groupCode.trim()) {
      toast({
        variant: 'destructive',
        title: 'Código Inválido',
        description: 'Por favor, insira o código do convite do grupo.',
      });
      return;
    }
    
    if (!settings?.webhookToken) {
      toast({
        variant: 'destructive',
        title: 'Token não configurado',
        description: 'Por favor, configure seu token de webhook na página de Configurações.',
      });
      return;
    }

    setIsSending(true);
    setJid('');

    try {
      const response = await fetch('https://n8nbeta.typeflow.app.br/webhook/9c5d6ca0-8469-48f3-9a40-115f4d712362', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          groupCode: groupCode,
          token: settings.webhookToken,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Falha no webhook: ${errorText}`);
      }

      const data = await response.json();

      if (data && data.JID) {
        setJid(data.JID);
        toast({
          title: 'JID Recebido!',
          description: `O JID do grupo foi obtido com sucesso.`,
        });
      } else {
        throw new Error('A resposta do webhook não continha um JID válido.');
      }

      setGroupCode('');

    } catch (error: any) {
      console.error('Webhook error:', error);
      toast({
        variant: 'destructive',
        title: 'Erro no Envio',
        description: error.message || 'Não foi possível se comunicar com o webhook.',
      });
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title="Gerenciamento de Grupos"
        description="Obtenha códigos de grupo e envie mensagens."
      />
      <main className="flex-1 overflow-auto p-4 md:p-6">
        <Tabs defaultValue="get-code" className="w-full max-w-2xl mx-auto">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="get-code">Obter Código do Grupo</TabsTrigger>
            <TabsTrigger value="schedule-messages">Agendar Mensagens</TabsTrigger>
          </TabsList>
          <TabsContent value="get-code">
            <Card>
              <CardHeader>
                <CardTitle>Obter código do grupo</CardTitle>
                <CardDescription>
                  Cole apenas o código do link de convite. Ex: do link
                  https://chat.whatsapp.com/JIgDbPX9Q4g7Kij2xzlx6R, cole apenas
                  JIgDbPX9Q4g7Kij2xzlx6R.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <Alert className="border-yellow-400 bg-yellow-50 text-yellow-800 dark:border-yellow-600 dark:bg-yellow-950/50 dark:text-yellow-300 [&>svg]:text-yellow-600 dark:[&>svg]:text-yellow-400">
                    <AlertTriangle className="h-4 w-4" />
                    <AlertTitle className="font-bold">Atenção</AlertTitle>
                    <AlertDescription>
                    ⚠️ OBS: Você precisa ser administrador do grupo para solicitar o JID do grupo. 🔐👥📲
                    </AlertDescription>
                </Alert>
                <div className="space-y-2">
                  <Label htmlFor="group-code">Link do grupo do zap</Label>
                  <Input
                    id="group-code"
                    placeholder="Insira o código do convite aqui..."
                    value={groupCode}
                    onChange={(e) => setGroupCode(e.target.value)}
                    disabled={isSending}
                  />
                </div>
                <Button onClick={handleGetGroupCode} className="w-full" disabled={isSending}>
                   {isSending ? (
                    <>
                      <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                      Enviando...
                    </>
                  ) : (
                    <>
                      <Send className="mr-2 h-4 w-4" />
                      Enviar
                    </>
                  )}
                </Button>
                {jid && (
                  <div className="pt-4 space-y-2">
                    <Label htmlFor="jid-result">JID Retornado</Label>
                    <div className="flex items-center gap-2">
                        <Input id="jid-result" value={jid} readOnly className="bg-muted" />
                        <Button variant="outline" size="icon" onClick={handleCopyJid}>
                            <Copy className="h-4 w-4" />
                            <span className="sr-only">Copiar JID</span>
                        </Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
          <TabsContent value="schedule-messages">
            <Card>
              <CardHeader>
                <CardTitle>Agendar Mensagens</CardTitle>
                <CardDescription>
                  Agende o envio de mensagens para os grupos cadastrados.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex flex-col items-center justify-center text-center text-muted-foreground p-8">
                  <p>Funcionalidade de agendamento de mensagens em desenvolvimento.</p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
