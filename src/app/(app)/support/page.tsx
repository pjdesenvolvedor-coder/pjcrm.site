
'use client';

import { useState, useMemo } from 'react';
import { collection, query, orderBy, doc, where } from 'firebase/firestore';
import { useFirebase, useUser, setDocumentNonBlocking, useDoc, useCollection, useMemoFirebase } from '@/firebase';
import type { Client, Settings } from '@/lib/types';
import { PageHeader } from '@/components/page-header';
import { Card, CardContent, CardFooter } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { User, CheckCircle2, MessageSquare, RefreshCw } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { format } from 'date-fns';


function SendMessageDialog({ client, onSend, onCancel, isSending }: { client: Client; onSend: (message: string) => void; onCancel: () => void; isSending: boolean; }) {
  const [message, setMessage] = useState('');
  return (
    <>
      <DialogHeader>
          <DialogTitle>Enviar Mensagem para {client.name}</DialogTitle>
          <DialogDescription>
              Digite a mensagem que você deseja enviar para o número {client.phone}.
          </DialogDescription>
      </DialogHeader>
      <div className="py-4 space-y-2">
        <Label htmlFor="message">Mensagem</Label>
        <Textarea id="message" placeholder="Digite sua mensagem aqui..." value={message} onChange={(e) => setMessage(e.target.value)} className="min-h-[100px]" />
      </div>
      <DialogFooter>
        <Button variant="ghost" onClick={onCancel} disabled={isSending}>Cancelar</Button>
        <Button onClick={() => onSend(message)} disabled={!message.trim() || isSending}>
            {isSending ? (
                <>
                    <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                    Enviando...
                </>
            ) : (
                'Enviar Mensagem'
            )}
        </Button>
      </DialogFooter>
    </>
  );
}

export default function SupportPage() {
  const { firestore, effectiveUserId } = useFirebase();
  const { toast } = useToast();

  const [dialogClient, setDialogClient] = useState<Client | null>(null);
  const [isSending, setIsSending] = useState(false);
  
  const settingsDocRef = useMemoFirebase(() => {
    if (!effectiveUserId) return null;
    return doc(firestore, 'users', effectiveUserId, 'settings', 'config');
  }, [firestore, effectiveUserId]);

  const { data: settings } = useDoc<Settings>(settingsDocRef);
  
  const supportClientsQuery = useMemoFirebase(() => {
    if (!effectiveUserId) return null;
    const clientsRef = collection(firestore, 'users', effectiveUserId, 'clients');
    return query(clientsRef, where("needsSupport", "==", true));
  }, [effectiveUserId, firestore]);

  const { data: supportClients, isLoading } = useCollection<Client>(supportClientsQuery);

  const handleMarkAsCompleted = async (client: Client) => {
    if (!effectiveUserId || !settings) return;
    const docRef = doc(firestore, 'users', effectiveUserId, 'clients', client.id);
    setDocumentNonBlocking(docRef, { needsSupport: false }, { merge: true });
    
    toast({
        title: "Suporte Concluído",
        description: `O cliente ${client.name} foi removido da lista de suporte.`,
    });

    if (settings.isSupportAutomationActive && settings.webhookToken && settings.supportFinishedMessage) {
        let formattedMessage = settings.supportFinishedMessage
            .replace(/{cliente}/g, client.name)
            .replace(/{telefone}/g, client.phone)
            .replace(/{email}/g, Array.isArray(client.email) ? client.email.join(', ') : client.email)
            .replace(/{assinatura}/g, client.subscription || '')
            .replace(/{vencimento}/g, client.dueDate ? format(client.dueDate.toDate(), 'dd/MM/yyyy') : 'N/A')
            .replace(/{valor}/g, client.amountPaid || '0,00')
            .replace(/{senha}/g, client.password || 'N/A')
            .replace(/{tela}/g, client.screen || 'N/A')
            .replace(/{pin_tela}/g, client.pinScreen || 'N/A')
            .replace(/{link}/g, client.accessLink || 'N/A')
            .replace(/{status}/g, client.status);

        try {
            await fetch('/api/send-message', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    message: formattedMessage,
                    phoneNumber: client.phone,
                    token: settings.webhookToken,
                }),
            });
            toast({ title: 'Automação: Mensagem Enviada', description: `Mensagem de conclusão enviada para ${client.name}.` });
        } catch (e) {
            console.error("Failed to send support finished automation message:", e);
        }
    }
  };

  const handleSendMessage = async (message: string) => {
    if (!dialogClient || !effectiveUserId) return;

    if (!settings?.webhookToken) {
        toast({
            variant: "destructive",
            title: "Token não configurado",
            description: "Por favor, configure seu token de webhook na página de Configurações.",
        });
        return;
    }

    setIsSending(true);

    try {
        const response = await fetch('/api/send-message', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                message,
                phoneNumber: dialogClient.phone,
                token: settings.webhookToken,
            }),
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Falha ao enviar mensagem.');
        }

        toast({
            title: "Mensagem Enviada!",
            description: `Sua mensagem foi enviada para ${dialogClient.name}.`,
        });
        setDialogClient(null);

    } catch (error: any) {
        console.error("Failed to send message:", error);
        toast({
            variant: "destructive",
            title: "Erro ao Enviar",
            description: error.message || "Não foi possível enviar a mensagem.",
        });
    } finally {
        setIsSending(false);
    }
  };

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title="Clientes de Suporte"
        description="Clientes e contatos marcados para suporte."
      />
      <main className="flex-1 overflow-auto p-4 md:p-6">
        {isLoading ? (
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {[...Array(3)].map((_, i) => (
              <Card key={i}>
                <CardContent className="p-6 space-y-4">
                    <div className="flex items-start justify-between">
                        <div className="space-y-1">
                            <Skeleton className="h-6 w-32" />
                            <Skeleton className="h-4 w-24" />
                        </div>
                        <Skeleton className="h-6 w-20" />
                    </div>
                    <div className="space-y-2">
                        <Skeleton className="h-4 w-40" />
                        <Skeleton className="h-4 w-48" />
                    </div>
                </CardContent>
                <CardFooter className="flex justify-end gap-2">
                    <Skeleton className="h-9 w-44" />
                    <Skeleton className="h-9 w-36" />
                </CardFooter>
              </Card>
            ))}
          </div>
        ) : supportClients && supportClients.length > 0 ? (
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {supportClients.map((client) => (
              <Card key={client.id}>
                <CardContent className="p-6">
                    <div className="flex items-start justify-between">
                        <div>
                            <div className="flex items-center gap-2">
                                <User className="h-5 w-5 text-muted-foreground" />
                                <h3 className="text-xl font-semibold">{client.name}</h3>
                            </div>
                            <p className="text-muted-foreground mt-1">{client.phone}</p>
                        </div>
                        {client.subscription && <Badge variant="outline">{client.subscription}</Badge>}
                    </div>
                    <div className="mt-6">
                        <h4 className="font-semibold text-sm">Contatos de Suporte:</h4>
                        <ul className="mt-2 list-disc list-inside text-muted-foreground text-sm">
                            {client.email && (Array.isArray(client.email) ? client.email : [client.email]).map((email, i) => (
                              <li key={i}>{email}</li>
                            ))}
                        </ul>
                    </div>
                </CardContent>
                <CardFooter className="flex justify-end gap-2">
                    <Button variant="outline" onClick={() => handleMarkAsCompleted(client)}>
                        <CheckCircle2 className="mr-2 h-4 w-4" />
                        Marcar como Concluído
                    </Button>
                    <Button onClick={() => setDialogClient(client)}>
                        <MessageSquare className="mr-2 h-4 w-4" />
                        Enviar Mensagem
                    </Button>
                </CardFooter>
              </Card>
            ))}
          </div>
        ) : (
          <div className="flex flex-1 items-center justify-center rounded-lg border border-dashed shadow-sm h-full">
            <div className="flex flex-col items-center gap-1 text-center">
              <h3 className="text-2xl font-bold tracking-tight">
                Nenhum cliente em suporte
              </h3>
              <p className="text-sm text-muted-foreground">
                Marque um cliente para suporte na página "Todos os Clientes".
              </p>
            </div>
          </div>
        )}
      </main>
      <Dialog open={!!dialogClient} onOpenChange={(isOpen) => !isOpen && setDialogClient(null)}>
        <DialogContent>
            {dialogClient && (
                <SendMessageDialog client={dialogClient} onSend={handleSendMessage} onCancel={() => setDialogClient(null)} isSending={isSending} />
            )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
