
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
import { User, CheckCircle2, MessageSquare, RefreshCw, Phone, Mail, Clock } from 'lucide-react';
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
          <DialogTitle className="text-lg font-semibold">Enviar Mensagem para {client.name}</DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
              Digite a mensagem que você deseja enviar para o número <span className="font-mono font-medium text-foreground">{client.phone}</span>.
          </DialogDescription>
      </DialogHeader>
      <div className="py-4 space-y-2">
        <Label htmlFor="message" className="text-xs font-semibold">Mensagem WhatsApp</Label>
        <Textarea 
          id="message" 
          placeholder="Digite sua mensagem aqui..." 
          value={message} 
          onChange={(e) => setMessage(e.target.value)} 
          className="min-h-[120px] text-sm resize-none" 
        />
      </div>
      <DialogFooter className="gap-2 sm:gap-0">
        <Button variant="outline" onClick={onCancel} disabled={isSending}>Cancelar</Button>
        <Button onClick={() => onSend(message)} disabled={!message.trim() || isSending} className="bg-primary hover:bg-primary/90 text-white gap-1.5">
            {isSending ? (
                <>
                    <RefreshCw className="h-4 w-4 animate-spin" />
                    Enviando...
                </>
            ) : (
                <>
                    <MessageSquare className="h-4 w-4" />
                    Enviar Mensagem
                </>
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
    <div className="flex flex-col h-full space-y-4">
      <PageHeader
        title="Clientes de Suporte"
        description="Clientes e contatos marcados para atendimento de suporte."
      />
      <main className="flex-1 overflow-auto p-4 md:p-6 pt-0">
        {isLoading ? (
          <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
            {[...Array(3)].map((_, i) => (
              <Card key={i} className="rounded-xl overflow-hidden border shadow-sm flex flex-col justify-between">
                <CardContent className="p-5 space-y-4">
                    <div className="flex items-start justify-between">
                        <div className="space-y-1.5">
                            <Skeleton className="h-5 w-36" />
                            <Skeleton className="h-4 w-28" />
                        </div>
                        <Skeleton className="h-6 w-20 rounded-full" />
                    </div>
                    <div className="space-y-2 pt-2">
                        <Skeleton className="h-16 w-full rounded-lg" />
                    </div>
                </CardContent>
                <CardFooter className="p-3.5 px-5 bg-muted/20 border-t flex items-center gap-2">
                    <Skeleton className="h-9 flex-1 rounded-md" />
                    <Skeleton className="h-9 flex-1 rounded-md" />
                </CardFooter>
              </Card>
            ))}
          </div>
        ) : supportClients && supportClients.length > 0 ? (
          <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
            {supportClients.map((client) => {
              const emails = client.email
                ? (Array.isArray(client.email) ? client.email : [client.email]).filter(Boolean)
                : [];

              return (
                <Card
                  key={client.id}
                  className="group relative overflow-hidden rounded-xl border border-slate-200/90 dark:border-slate-800 bg-card shadow-sm hover:shadow-md transition-all duration-200 flex flex-col justify-between"
                >
                  <CardContent className="p-5 space-y-4">
                    {/* Header do Card com Nome, Telefone e Badge */}
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-start gap-3 min-w-0">
                        <div className="h-10 w-10 rounded-full bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 border border-indigo-100 dark:border-indigo-900/50 flex items-center justify-center font-bold text-sm shrink-0 shadow-xs">
                          {client.name ? client.name.slice(0, 2).toUpperCase() : <User className="h-5 w-5" />}
                        </div>
                        <div className="min-w-0 space-y-0.5">
                          <h3 className="font-semibold text-base text-foreground truncate" title={client.name}>
                            {client.name}
                          </h3>
                          <div className="flex items-center gap-1.5 text-xs text-muted-foreground font-mono">
                            <Phone className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                            <span>{client.phone || 'Sem telefone'}</span>
                          </div>
                        </div>
                      </div>

                      {client.subscription && (
                        <Badge
                          variant="outline"
                          className="font-medium text-xs px-2.5 py-0.5 rounded-full shrink-0 max-w-[130px] truncate bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-800"
                          title={client.subscription}
                        >
                          {client.subscription}
                        </Badge>
                      )}
                    </div>

                    {/* Bloco de Contatos / Emails de Suporte */}
                    <div className="rounded-lg bg-slate-50/80 dark:bg-slate-900/60 p-3 border border-slate-100 dark:border-slate-800/80 space-y-1.5">
                      <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300">
                        <Mail className="h-3.5 w-3.5 text-indigo-600 dark:text-indigo-400 shrink-0" />
                        <span>Contatos de Suporte:</span>
                      </div>
                      {emails.length > 0 ? (
                        <ul className="space-y-1 text-xs text-muted-foreground pl-5 list-disc">
                          {emails.map((email, i) => (
                            <li key={i} className="break-all font-mono text-[11.5px]">
                              {email}
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="text-xs text-muted-foreground italic pl-5">Nenhum email registrado</p>
                      )}
                    </div>
                  </CardContent>

                  {/* Rodapé com Botões Perfeitamente Dimensionados e Alinhados */}
                  <CardFooter className="p-3 px-4 bg-slate-50/60 dark:bg-slate-900/40 border-t border-slate-100 dark:border-slate-800/80 grid grid-cols-2 gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleMarkAsCompleted(client)}
                      className="w-full h-9 text-xs font-medium border-slate-200 dark:border-slate-700 hover:bg-emerald-50 hover:text-emerald-700 hover:border-emerald-300 dark:hover:bg-emerald-950/40 dark:hover:text-emerald-400 transition-colors shadow-2xs"
                      title="Marcar suporte como concluído"
                    >
                      <CheckCircle2 className="mr-1.5 h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                      <span className="truncate">Concluir</span>
                    </Button>

                    <Button
                      size="sm"
                      onClick={() => setDialogClient(client)}
                      className="w-full h-9 text-xs font-medium bg-indigo-600 hover:bg-indigo-700 text-white shadow-xs transition-colors"
                      title="Enviar mensagem para o cliente"
                    >
                      <MessageSquare className="mr-1.5 h-4 w-4 shrink-0" />
                      <span className="truncate">Enviar Mensagem</span>
                    </Button>
                  </CardFooter>
                </Card>
              );
            })}
          </div>
        ) : (
          <div className="flex flex-1 items-center justify-center rounded-xl border border-dashed shadow-xs h-80 bg-slate-50/40 dark:bg-slate-950/20">
            <div className="flex flex-col items-center gap-2 text-center p-6 max-w-md">
              <div className="h-12 w-12 rounded-full bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mb-1">
                <CheckCircle2 className="h-6 w-6" />
              </div>
              <h3 className="text-lg font-bold tracking-tight text-foreground">
                Nenhum cliente em suporte
              </h3>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Todos os atendimentos foram concluídos! Quando um cliente for marcado para suporte no fluxo ou na lista de clientes, ele aparecerá aqui.
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
