'use client';

import { useState } from 'react';
import { doc } from 'firebase/firestore';
import { useFirebase, useUser, useDoc, useMemoFirebase } from '@/firebase';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Users, RefreshCw, Copy } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import type { Settings } from '@/lib/types';
import { ScrollArea } from '@/components/ui/scroll-area';

export default function ExtractMembersPage() {
  const { toast } = useToast();
  const { firestore, user } = useFirebase();
  const [jid, setJid] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [participantCount, setParticipantCount] = useState<number | null>(null);
  const [participants, setParticipants] = useState<string[] | null>(null);

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
      const response = await fetch('https://n8nbeta.typeflow.app.br/webhook/2cf1d5c0-d83a-4374-9205-d3259cf6cc10', {
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
      
      const data = await response.json();

      const count = data.quantidadedeparticipantes || data.ParticipantCount;
      const phonesAsString = data.telefones;
      const phonesAsArray = data.dadosparticipantes || data.Participants;
      
      let participantNumbers: string[] = [];

      if (phonesAsString && typeof phonesAsString === 'string') {
        participantNumbers = phonesAsString.split(',').map(p => p.trim());
      } else if (phonesAsArray && Array.isArray(phonesAsArray)) {
        participantNumbers = phonesAsArray.map(p => (typeof p === 'object' && p.jid ? p.jid : p));
      }

      if (count && participantNumbers.length > 0) {
        setParticipantCount(Number(count));
        setParticipants(participantNumbers);
        
        toast({
            title: 'Extração Concluída!',
            description: `Encontrados ${count} participantes.`,
        });
        setJid('');
      } else {
        throw new Error('A resposta do webhook não continha os dados esperados.');
      }

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

  const handleCopyAll = () => {
    if (!participants) return;
    const textToCopy = participants.map(p => p.replace('@s.whatsapp.net', '')).join('\n');
    navigator.clipboard.writeText(textToCopy);
    toast({ title: 'Copiado!', description: 'Todos os números foram copiados para a área de transferência.' });
  };

  const handleReset = () => {
    setParticipants(null);
    setParticipantCount(null);
    setJid('');
  };

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title="Extrair Membros do Grupo"
        description="Receba uma lista com todos os membros de um grupo do WhatsApp."
      />
      <main className="flex-1 overflow-auto p-4 md:p-6">
        <div className="w-full max-w-2xl mx-auto">
            {participants === null ? (
                <Card>
                  <CardHeader>
                    <CardTitle>Extrair Membros</CardTitle>
                    <CardDescription>
                      Insira o JID do grupo para iniciar a extração. O resultado será exibido abaixo.
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
            ) : (
                <Card>
                    <CardHeader>
                        <CardTitle>Resultados da Extração</CardTitle>
                        <CardDescription>
                        Total de {participantCount} participantes encontrados no grupo.
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <ScrollArea className="h-72 w-full rounded-md border">
                            <div className="p-4 text-sm font-mono">
                                {participants.map((p, index) => (
                                    <p key={index} className="p-1">{p.replace('@s.whatsapp.net', '')}</p>
                                ))}
                            </div>
                        </ScrollArea>
                    </CardContent>
                    <CardFooter className="justify-between">
                        <Button variant="outline" onClick={handleReset}>
                            <RefreshCw className="mr-2 h-4 w-4" />
                            Nova Extração
                        </Button>
                        <Button onClick={handleCopyAll}>
                            <Copy className="mr-2 h-4 w-4" />
                            Copiar Todos os Números
                        </Button>
                    </CardFooter>
                </Card>
            )}
        </div>
      </main>
    </div>
  );
}
