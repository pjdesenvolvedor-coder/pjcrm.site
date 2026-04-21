
'use client';

import { useState } from 'react';
import { collection, getDocs, doc, serverTimestamp } from 'firebase/firestore';
import { useFirebase, useUser, useDoc, useMemoFirebase } from '@/firebase';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import type { Settings, Client } from '@/lib/types';
import { format } from 'date-fns';
import { Loader2, PlayCircle, LogOut, CheckCircle2, AlertCircle, RefreshCcw } from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { addDocumentNonBlocking } from '@/firebase/non-blocking-updates';
import { cn } from '@/lib/utils';

export default function RebillPage() {
  const { firestore } = useFirebase();
  const { user } = useUser();
  const { toast } = useToast();

  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [total, setTotal] = useState(0);
  const [logs, setLogs] = useState<{ name: string; status: 'success' | 'error' | 'sending'; time: string }[]>([]);

  const settingsDocRef = useMemoFirebase(() => {
    if (!user) return null;
    return doc(firestore, 'users', user.uid, 'settings', 'config');
  }, [firestore, user]);

  const { data: settings, isLoading: settingsLoading } = useDoc<Settings>(settingsDocRef);

  const startRebilling = async () => {
    if (!user || !settings) return;

    if (!settings.isDueDateMessageActive || !settings.dueDateMessage) {
      toast({
        variant: 'destructive',
        title: 'Configuração Incompleta',
        description: 'Ative e configure a mensagem de vencimento nas automações primeiro.',
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

      const now = new Date();
      const today = format(now, 'yyyy-MM-dd');
      
      const toRebill = allClients.filter(c => {
        if (!c.dueDate) return false;
        // Check if status is Ativo or Vencido and due date is today
        const due = c.dueDate.toDate();
        const isToday = format(due, 'yyyy-MM-dd') === today;
        return isToday && (c.status === 'Ativo' || c.status === 'Vencido');
      });

      if (toRebill.length === 0) {
        toast({
          title: 'Nenhum cliente encontrado',
          description: 'Não há clientes com vencimento marcado para hoje.',
        });
        setIsProcessing(false);
        return;
      }

      setTotal(toRebill.length);
      const logCollectionRef = collection(firestore, 'users', user.uid, 'logs');
      const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
      const DELAY_MS = 15000; // 15 seconds delay between messages

      for (let i = 0; i < toRebill.length; i++) {
        const client = toRebill[i];
        const logEntry = { name: client.name, status: 'sending' as const, time: format(new Date(), 'HH:mm:ss') };
        setLogs(prev => [logEntry, ...prev].slice(0, 50));

        let formattedMessage = settings.dueDateMessage!
          .replace(/{cliente}/g, client.name)
          .replace(/{telefone}/g, client.phone)
          .replace(/{email}/g, Array.isArray(client.email) ? client.email.join(', ') : (client.email || ''))
          .replace(/{assinatura}/g, client.subscription || '')
          .replace(/{vencimento}/g, format(client.dueDate!.toDate(), 'dd/MM/yyyy'))
          .replace(/{valor}/g, client.amountPaid || '0,00')
          .replace(/{senha}/g, client.password || 'N/A')
          .replace(/{tela}/g, client.screen || 'N/A')
          .replace(/{pin_tela}/g, client.pinScreen || 'N/A')
          .replace(/{status}/g, 'Vencido');

        addDocumentNonBlocking(logCollectionRef, {
          userId: user.uid,
          type: 'Cobrança Manual',
          clientName: client.name,
          target: client.phone,
          status: 'Enviando',
          delayApplied: (i > 0 ? DELAY_MS : 0) / 1000,
          timestamp: serverTimestamp(),
        });

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
            setLogs(prev => prev.map((l, idx) => idx === 0 ? { ...l, status: 'success' as const } : l));
            addDocumentNonBlocking(logCollectionRef, {
                userId: user.uid, type: 'Cobrança Manual', clientName: client.name, target: client.phone, status: 'Enviado', timestamp: serverTimestamp()
            });
          } else {
            setLogs(prev => prev.map((l, idx) => idx === 0 ? { ...l, status: 'error' as const } : l));
            addDocumentNonBlocking(logCollectionRef, {
                userId: user.uid, type: 'Cobrança Manual', clientName: client.name, target: client.phone, status: 'Erro', timestamp: serverTimestamp()
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
        description: `Enviado para ${toRebill.length} clientes com sucesso.`,
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

  return (
    <div className="flex flex-col h-full bg-slate-50/50">
      <PageHeader
        title="RECOBRAR - Clientes de Hoje"
        description="Dispare manualmente as mensagens de cobrança para todos os clientes que vencem hoje."
      />
      
      <main className="flex-1 overflow-auto p-4 md:p-8 max-w-5xl mx-auto w-full">
        <div className="grid gap-6">
          <Card className="border-none shadow-lg overflow-hidden transition-all hover:shadow-xl">
            <CardHeader className="bg-gradient-to-r from-red-600 to-red-500 text-white pb-8">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-2xl font-bold flex items-center gap-2">
                    <PlayCircle className="h-6 w-6" />
                    Central de Recobrança
                  </CardTitle>
                  <CardDescription className="text-red-100 mt-1">
                    Execute o disparo manual com segurança e delay anti-ban.
                  </CardDescription>
                </div>
                <div className="hidden md:block">
                  <div className="bg-white/10 p-3 rounded-full backdrop-blur-sm">
                    <RefreshCcw className="h-8 w-8 text-white animate-pulse-slow" />
                  </div>
                </div>
              </div>
            </CardHeader>
            <CardContent className="pt-8 space-y-6">
              <div className="flex flex-col items-center justify-center text-center space-y-4">
                <div className="bg-red-50 p-6 rounded-2xl border border-red-100 max-w-lg">
                  <h4 className="font-semibold text-red-900 mb-2 flex items-center justify-center gap-2">
                    <AlertCircle className="h-4 w-4" />
                    Como funciona?
                  </h4>
                  <p className="text-sm text-red-700 leading-relaxed">
                    Ao clicar no botão abaixo, o sistema buscará todos os clientes com vencimento na data de <strong>{format(new Date(), 'dd/MM/yyyy')}</strong>. 
                    As mensagens serão enviadas uma a uma com um intervalo de <strong>15 segundos</strong>.
                  </p>
                </div>

                <Button 
                  size="lg" 
                  className={cn(
                    "w-full max-w-md h-16 text-lg font-bold shadow-2xl transition-all active:scale-95",
                    isProcessing ? "bg-slate-200" : "bg-red-600 hover:bg-red-700"
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
                      DISPARAR COBRANÇA DE HOJE
                    </>
                  )}
                </Button>

                {isProcessing && total > 0 && (
                  <div className="w-full max-w-md space-y-2">
                    <div className="flex justify-between text-sm font-medium">
                      <span>Progresso do Disparo</span>
                      <span>{Math.round((progress / total) * 100)}%</span>
                    </div>
                    <Progress value={(progress / total) * 100} className="h-3 bg-red-100" />
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


