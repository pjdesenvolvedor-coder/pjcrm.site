'use client';

import { useState } from 'react';
import { collection, getDocs, doc, serverTimestamp, deleteDoc } from 'firebase/firestore';
import { useFirebase, useUser, useDoc, useMemoFirebase } from '@/firebase';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import type { Settings, Client } from '@/lib/types';
import { format } from 'date-fns';
import { Loader2, PlayCircle, LogOut, CheckCircle2, AlertCircle, RefreshCcw, Tag, Trash2 } from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { addDocumentNonBlocking } from '@/firebase/non-blocking-updates';
import { cn } from '@/lib/utils';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';

export default function ChargeOverduePage() {
  const { firestore } = useFirebase();
  const { user } = useUser();
  const { toast } = useToast();

  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [total, setTotal] = useState(0);
  const [logs, setLogs] = useState<{ name: string; status: 'success' | 'error' | 'sending'; time: string }[]>([]);

  // Configurações do disparo
  const [messageDelay, setMessageDelay] = useState(15);
  const [customMessage, setCustomMessage] = useState('Olá {cliente}, notamos que sua assinatura venceu em {vencimento}. Deseja renovar?');
  const [deleteAfterSend, setDeleteAfterSend] = useState(false);

  const settingsDocRef = useMemoFirebase(() => {
    if (!user) return null;
    return doc(firestore, 'users', user.uid, 'settings', 'config');
  }, [firestore, user]);

  const { data: settings, isLoading: settingsLoading } = useDoc<Settings>(settingsDocRef);

  const startRebilling = async () => {
    if (!user || !settings) return;

    if (!customMessage.trim()) {
      toast({
        variant: 'destructive',
        title: 'Mensagem Vazia',
        description: 'Por favor, digite a mensagem que deseja enviar.',
      });
      return;
    }

    const billingToken = settings.useSeparateBillingZap && settings.billingWebhookToken 
      ? settings.billingWebhookToken 
      : settings.webhookToken;

    if (!billingToken) {
      toast({
        variant: 'destructive',
        title: 'WhatsApp não conectado',
        description: 'Configure seu Hub Principal ou ZAP Cobrança primeiro.',
      });
      return;
    }

    try {
      setIsProcessing(true);
      setProgress(0);
      setLogs([]);

      const clientsRef = collection(firestore, 'users', user.uid, 'clients');
      const snap = await getDocs(clientsRef);
      const allClients = snap.docs.map(d => ({ id: d.id, ...d.data() } as Client));
      
      const toRebill = allClients.filter(c => c.status === 'Vencido');

      if (toRebill.length === 0) {
        toast({
          title: 'Nenhum cliente vencido encontrado',
          description: 'Não há clientes com status "Vencido" na base de dados.',
        });
        setIsProcessing(false);
        return;
      }

      setTotal(toRebill.length);
      const logCollectionRef = collection(firestore, 'users', user.uid, 'logs');
      const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
      const DELAY_MS = messageDelay * 1000;

      for (let i = 0; i < toRebill.length; i++) {
        const client = toRebill[i];
        const logEntry = { name: client.name, status: 'sending' as const, time: format(new Date(), 'HH:mm:ss') };
        setLogs(prev => [logEntry, ...prev].slice(0, 50));

        let formattedMessage = customMessage
          .replace(/{cliente}/g, client.name)
          .replace(/{telefone}/g, client.phone)
          .replace(/{email}/g, Array.isArray(client.email) ? client.email.join(', ') : (client.email || ''))
          .replace(/{assinatura}/g, client.subscription || '')
          .replace(/{vencimento}/g, client.dueDate ? format(client.dueDate.toDate(), 'dd/MM/yyyy') : 'N/A')
          .replace(/{valor}/g, client.amountPaid || '0,00')
          .replace(/{senha}/g, client.password || 'N/A')
          .replace(/{tela}/g, client.screen || 'N/A')
          .replace(/{pin_tela}/g, client.pinScreen || 'N/A')
          .replace(/{status}/g, 'Vencido');

        addDocumentNonBlocking(logCollectionRef, {
          userId: user.uid,
          type: 'Cobrança Vencidos',
          clientName: client.name,
          target: client.phone,
          status: 'Enviando',
          delayApplied: (i > 0 ? DELAY_MS : 0) / 1000,
          timestamp: serverTimestamp(),
        });

        let success = false;
        try {
          const response = await fetch('/api/send-message', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              message: formattedMessage,
              phoneNumber: client.phone,
              token: billingToken,
            }),
          });

          if (response.ok) {
            success = true;
            setLogs(prev => prev.map((l, idx) => idx === 0 ? { ...l, status: 'success' as const } : l));
            addDocumentNonBlocking(logCollectionRef, {
                userId: user.uid, type: 'Cobrança Vencidos', clientName: client.name, target: client.phone, status: 'Enviado', timestamp: serverTimestamp()
            });
            
            // Delete client if option is checked and message was sent successfully
            if (deleteAfterSend) {
               try {
                   await deleteDoc(doc(firestore, 'users', user.uid, 'clients', client.id));
               } catch (deleteErr) {
                   console.error('Erro ao deletar cliente após enviar mensagem:', deleteErr);
               }
            }
          } else {
            setLogs(prev => prev.map((l, idx) => idx === 0 ? { ...l, status: 'error' as const } : l));
            addDocumentNonBlocking(logCollectionRef, {
                userId: user.uid, type: 'Cobrança Vencidos', clientName: client.name, target: client.phone, status: 'Erro', timestamp: serverTimestamp()
            });
          }
        } catch (err) {
          setLogs(prev => prev.map((l, idx) => idx === 0 ? { ...l, status: 'error' as const } : l));
        }

        setProgress(i + 1);

        if (i < toRebill.length - 1) {
          await sleep(DELAY_MS);
        }
      }

      toast({
        title: 'Cobrança Finalizada',
        description: `Enviado para ${toRebill.length} clientes vencidos com sucesso.`,
      });

    } catch (error) {
      console.error(error);
      toast({
        variant: 'destructive',
        title: 'Erro no Processamento',
        description: 'Ocorreu um erro ao tentar enviar as cobranças.',
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const insertTag = (tag: string) => {
    setCustomMessage(prev => prev + tag);
  };

  return (
    <div className="flex flex-col h-full bg-slate-50/50">
      <PageHeader
        title="COBRAR VENCIDOS"
        description="Dispare mensagens customizadas para todos os clientes com status Vencido e remova-os opcionalmente."
      />
      
      <main className="flex-1 overflow-auto p-4 md:p-8 max-w-5xl mx-auto w-full">
        <div className="grid gap-6">
          <Card className="border-none shadow-lg overflow-hidden transition-all">
            <CardHeader className="bg-gradient-to-r from-orange-600 to-amber-500 text-white pb-8">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-2xl font-bold flex items-center gap-2">
                    <AlertTriangle className="h-6 w-6" />
                    Central de Cobrança (Vencidos)
                  </CardTitle>
                  <CardDescription className="text-orange-100 mt-1">
                    Configure a mensagem e o tempo para todos os clientes vencidos.
                  </CardDescription>
                </div>
                <div className="hidden md:block">
                  <div className="bg-white/10 p-3 rounded-full backdrop-blur-sm">
                    <RefreshCcw className="h-8 w-8 text-white animate-pulse-slow" />
                  </div>
                </div>
              </div>
            </CardHeader>
            <CardContent className="pt-8 space-y-8">
              <div className="space-y-6">
                <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                        <label className="text-sm font-semibold text-slate-700">Tempo de disparo (segundos)</label>
                        <Input 
                            type="number" 
                            min="5" 
                            value={messageDelay} 
                            onChange={(e) => setMessageDelay(Number(e.target.value))} 
                            disabled={isProcessing}
                            className="bg-white"
                        />
                        <p className="text-xs text-muted-foreground">Tempo de espera entre uma mensagem e outra.</p>
                    </div>
                </div>

                <div className="space-y-2">
                    <label className="text-sm font-semibold text-slate-700">Mensagem Personalizada</label>
                    <div className="flex flex-wrap gap-2 mb-2">
                        {['{cliente}', '{vencimento}', '{valor}', '{assinatura}', '{telefone}', '{email}', '{senha}', '{tela}', '{pin_tela}'].map((tag) => (
                            <Badge 
                                key={tag} 
                                variant="outline" 
                                className="cursor-pointer hover:bg-orange-50 hover:text-orange-600 transition-colors"
                                onClick={() => insertTag(tag)}
                            >
                                <Tag className="h-3 w-3 mr-1" />
                                {tag}
                            </Badge>
                        ))}
                    </div>
                    <Textarea 
                        rows={6}
                        value={customMessage}
                        onChange={(e) => setCustomMessage(e.target.value)}
                        placeholder="Digite a mensagem..."
                        disabled={isProcessing}
                        className="bg-white resize-none"
                    />
                </div>

                <div className="flex items-center space-x-2 bg-red-50 p-4 rounded-lg border border-red-100">
                    <Checkbox 
                        id="delete-clients" 
                        checked={deleteAfterSend} 
                        onCheckedChange={(checked) => setDeleteAfterSend(checked as boolean)}
                        disabled={isProcessing}
                    />
                    <label 
                        htmlFor="delete-clients" 
                        className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 text-red-900 flex items-center gap-2 cursor-pointer"
                    >
                        Remover cliente do sistema após enviar a mensagem
                        <Trash2 className="h-4 w-4 text-red-600" />
                    </label>
                </div>
              </div>

              <div className="flex flex-col items-center justify-center text-center space-y-4 pt-4 border-t">
                <Button 
                  size="lg" 
                  className={cn(
                    "w-full max-w-md h-16 text-lg font-bold shadow-xl transition-all active:scale-95",
                    isProcessing ? "bg-slate-200" : "bg-orange-600 hover:bg-orange-700"
                  )}
                  disabled={isProcessing || settingsLoading}
                  onClick={startRebilling}
                >
                  {isProcessing ? (
                    <>
                      <Loader2 className="mr-3 h-6 w-6 animate-spin" />
                      Processando {progress}/{total}...
                    </>
                  ) : (
                    <>
                      <PlayCircle className="mr-3 h-6 w-6" />
                      INICIAR DISPARO AOS VENCIDOS
                    </>
                  )}
                </Button>

                {isProcessing && total > 0 && (
                  <div className="w-full max-w-md space-y-2">
                    <div className="flex justify-between text-sm font-medium">
                      <span>Progresso do Disparo</span>
                      <span>{Math.round((progress / total) * 100)}%</span>
                    </div>
                    <Progress value={(progress / total) * 100} className="h-3 bg-orange-200" />
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          <Card className="border-none shadow-md">
            <CardHeader className="border-b bg-slate-50/50 py-4">
              <CardTitle className="text-sm font-bold flex items-center gap-2 text-slate-600 uppercase tracking-wider">
                <LogOut className="h-4 w-4 rotate-180" />
                Logs da Operação Atual
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="max-h-[300px] overflow-auto divide-y divide-slate-100">
                {logs.length === 0 ? (
                  <div className="p-8 text-center text-muted-foreground flex flex-col items-center gap-2">
                    <div className="h-12 w-12 rounded-full bg-slate-100 flex items-center justify-center">
                        <Loader2 className="h-6 w-6 opacity-20" />
                    </div>
                    <p className="text-sm">Aguardando início do processo...</p>
                  </div>
                ) : (
                  logs.map((log, i) => (
                    <div key={i} className="p-4 flex items-center justify-between bg-white hover:bg-slate-50 transition-colors">
                      <div className="flex items-center gap-3">
                        {log.status === 'success' ? (
                          <CheckCircle2 className="h-5 w-5 text-green-500" />
                        ) : log.status === 'error' ? (
                          <AlertCircle className="h-5 w-5 text-red-500" />
                        ) : (
                          <Loader2 className="h-5 w-5 text-blue-500 animate-spin" />
                        )}
                        <span className="font-semibold text-slate-700">{log.name}</span>
                      </div>
                      <div className="flex items-center gap-4">
                        <Badge variant={log.status === 'success' ? 'default' : log.status === 'error' ? 'destructive' : 'secondary'} className="capitalize min-w-[80px] justify-center">
                          {log.status === 'success' ? 'Enviado' : log.status === 'error' ? 'Erro' : 'Enviando...'}
                        </Badge>
                        <span className="text-xs text-slate-400 font-mono">{log.time}</span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </main>
      
      <style jsx global>{`
        @keyframes pulse-slow {
          0%, 100% { transform: scale(1); opacity: 0.8; }
          50% { transform: scale(1.1); opacity: 1; }
        }
        .animate-pulse-slow {
          animation: pulse-slow 3s ease-in-out infinite;
        }
      `}</style>
    </div>
  );
}
