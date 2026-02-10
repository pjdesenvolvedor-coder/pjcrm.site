'use client';

import { useState } from 'react';
import { doc } from 'firebase/firestore';
import { useFirebase, useUser, useDoc, useMemoFirebase } from '@/firebase';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Users, RefreshCw } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import type { Settings } from '@/lib/types';

export default function ExtractMembersPage() {
  const { toast } = useToast();
  const { firestore, user } = useFirebase();
  const [jid, setJid] = useState('');
  const [isSending, setIsSending] = useState(false);

  const settingsDocRef = useMemoFirebase(() => {
    if (!user) return null;
    return doc(firestore, 'users', user.uid, 'settings', 'config');
  }, [firestore, user]);

  const { data: settings } = useDoc<Settings>(settingsDocRef);

  const handleExtractMembers = async () => {
    if (!jid.trim()) {
      toast({
        variant: 'destructive',
        title: 'JID Inválido',
        description: 'Por favor, insira o JID do grupo.',
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

    try {
      const response = await fetch('https://n8nbeta.typeflow.app.br/webhook-test/2cf1d5c0-d83a-4374-9205-d3259cf6cc10', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          jid: jid,
          token: settings.webhookToken,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Falha no webhook: ${errorText}`);
      }

      toast({
        title: 'Requisição Enviada!',
        description: 'A extração de membros foi iniciada. Você receberá o arquivo em seu WhatsApp.',
      });
      setJid('');

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
        title="Extrair Membros do Grupo"
        description="Receba uma lista com todos os membros de um grupo do WhatsApp."
      />
      <main className="flex-1 overflow-auto p-4 md:p-6">
        <div className="w-full max-w-2xl mx-auto">
            <Card>
              <CardHeader>
                <CardTitle>Extrair Membros</CardTitle>
                <CardDescription>
                  Insira o JID do grupo para iniciar a extração. O resultado será enviado para o seu número de WhatsApp conectado.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="group-jid">JID do Grupo</Label>
                  <Input
                    id="group-jid"
                    placeholder="Cole o JID do grupo aqui..."
                    value={jid}
                    onChange={(e) => setJid(e.target.value)}
                    disabled={isSending}
                  />
                </div>
                <Button onClick={handleExtractMembers} className="w-full" disabled={isSending}>
                   {isSending ? (
                    <>
                      <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                      Extraindo...
                    </>
                  ) : (
                    <>
                      <Users className="mr-2 h-4 w-4" />
                      Extrair Membros
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
