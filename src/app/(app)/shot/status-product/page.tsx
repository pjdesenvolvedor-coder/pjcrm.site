
'use client';

import { useState, useMemo } from 'react';
import { collection, query, doc, orderBy, serverTimestamp } from 'firebase/firestore';
import { useFirebase, useUser, useDoc, useMemoFirebase, useCollection } from '@/firebase';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Send, RefreshCw, AlertTriangle, Timer, Users, Package, Activity, Loader2, Info, CheckCircle2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import type { Settings, Client, Subscription } from '@/lib/types';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Slider } from '@/components/ui/slider';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { format } from 'date-fns';
import { addDocumentNonBlocking } from '@/firebase/non-blocking-updates';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const MANDATORY_DELAY = 30000; // 30 seconds

const availableVariables = [
    "{cliente}", 
    "{telefone}", 
    "{email}", 
    "{senha}", 
    "{tela}",
    "{pin_tela}",
    "{assinatura}", 
    "{vencimento}", 
    "{valor}", 
    "{status}"
];

export function ShotStatusProductPage() {
  const { toast } = useToast();
  const { firestore, effectiveUserId } = useFirebase();
  const { user } = useUser();
  
  const [message, setMessage] = useState('');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [selectedSubscription, setSelectedSubscription] = useState<string>('all');
  const [delay, setDelay] = useState([30]); // default 30 seconds for safety
  const [isSending, setIsSending] = useState(false);
  const [progress, setProgress] = useState(0);
  const [sendingStatus, setSendingStatus] = useState<string>('');

  const settingsDocRef = useMemoFirebase(() => {
    if (!effectiveUserId) return null;
    return doc(firestore, 'users', effectiveUserId, 'settings', 'config');
  }, [firestore, effectiveUserId]);
  const { data: settings, isLoading: isLoadingSettings } = useDoc<Settings>(settingsDocRef);

  const subscriptionsQuery = useMemoFirebase(() => {
    if (!effectiveUserId) return null;
    return query(collection(firestore, 'users', effectiveUserId, 'subscriptions'), orderBy('name'));
  }, [firestore, effectiveUserId]);
  const { data: subscriptions } = useCollection<Subscription>(subscriptionsQuery);

  const clientsQuery = useMemoFirebase(() => {
    if (!effectiveUserId) return null;
    return collection(firestore, 'users', effectiveUserId, 'clients');
  }, [firestore, effectiveUserId]);
  const { data: clients, isLoading: isLoadingClients } = useCollection<Client>(clientsQuery);

  const filteredClients = useMemo(() => {
    if (!clients) return [];
    return clients.filter(client => {
        const matchesStatus = selectedStatus === 'all' || client.status === selectedStatus;
        const matchesSub = selectedSubscription === 'all' || client.subscription === selectedSubscription;
        return matchesStatus && matchesSub;
    });
  }, [clients, selectedStatus, selectedSubscription]);

  const copyVariableToClipboard = (variable: string) => {
    navigator.clipboard.writeText(variable);
    toast({
        title: 'Variável Copiada!',
        description: `A variável ${variable} foi copiada para a área de transferência.`,
    })
  }

  const handleSendShot = async () => {
    if (!message.trim()) {
        toast({ variant: 'destructive', title: 'Mensagem vazia', description: 'Por favor, escreva uma mensagem.' });
        return;
    }
    if (filteredClients.length === 0) {
        toast({ variant: 'destructive', title: 'Nenhum cliente', description: 'Não existem clientes que correspondam aos filtros selecionados.' });
        return;
    }

    if (!settings?.webhookToken) {
      toast({ variant: 'destructive', title: 'Token não configurado', description: 'Seu token de webhook não foi configurado.' });
      return;
    }

    setIsSending(true);
    setProgress(0);
    const total = filteredClients.length;
    
    const actualDelay = total > 1 ? MANDATORY_DELAY : 0;

    const logRef = collection(firestore, 'users', effectiveUserId!, 'logs');

    try {
      for (let i = 0; i < total; i++) {
        const client = filteredClients[i];
        setSendingStatus(`Enviando para ${client.name} (${i + 1}/${total})...`);

        let formattedMessage = message
            .replace(/{cliente}/g, client.name)
            .replace(/{telefone}/g, client.phone)
            .replace(/{email}/g, Array.isArray(client.email) ? client.email.join(', ') : client.email)
            .replace(/{assinatura}/g, client.subscription || '')
            .replace(/{vencimento}/g, client.dueDate ? format(client.dueDate.toDate(), 'dd/MM/yyyy') : 'N/A')
            .replace(/{valor}/g, client.amountPaid || '0,00')
            .replace(/{senha}/g, client.password || 'N/A')
            .replace(/{tela}/g, client.screen || 'N/A')
            .replace(/{pin_tela}/g, client.pinScreen || 'N/A')
            .replace(/{status}/g, client.status);

        addDocumentNonBlocking(logRef, {
            userId: effectiveUserId,
            type: 'Disparo',
            clientName: client.name,
            target: client.phone,
            status: 'Enviando',
            delayApplied: actualDelay / 1000,
            timestamp: serverTimestamp(),
        });

        const response = await fetch('/api/send-message', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                message: formattedMessage,
                phoneNumber: client.phone,
                token: settings.webhookToken,
            }),
        });

        if (response.ok) {
            addDocumentNonBlocking(logRef, {
                userId: effectiveUserId,
                type: 'Disparo',
                clientName: client.name,
                target: client.phone,
                status: 'Enviado',
                delayApplied: actualDelay / 1000,
                timestamp: serverTimestamp(),
            });
        } else {
            addDocumentNonBlocking(logRef, {
                userId: effectiveUserId,
                type: 'Disparo',
                clientName: client.name,
                target: client.phone,
                status: 'Erro',
                delayApplied: actualDelay / 1000,
                timestamp: serverTimestamp(),
            });
        }

        setProgress(Math.round(((i + 1) / total) * 100));

        if (i < total - 1 && actualDelay > 0) {
            await sleep(actualDelay);
        }
      }

      toast({ 
          title: 'Disparo Concluído!', 
          description: `Mensagens enviadas para ${total} clientes.` 
      });
      setMessage('');
      setSendingStatus('Finalizado!');

    } catch (error: any) {
      console.error('Shot execution error:', error);
      toast({ variant: 'destructive', title: 'Erro no Processamento', description: 'Ocorreu um erro durante o disparo em massa.' });
    } finally {
      setIsSending(false);
      setTimeout(() => {
          setProgress(0);
          setSendingStatus('');
      }, 5000);
    }
  };

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title="Disparo por Status - Produto"
        description="Filtre seus clientes e envie mensagens personalizadas com tags."
      />
      <main className="flex-1 overflow-auto p-4 md:p-6">
        <div className="w-full max-w-4xl mx-auto space-y-6">
            {isSending && (
                <Card className="border-primary bg-primary/5">
                    <CardContent className="pt-6 space-y-4">
                        <div className="flex items-center justify-between text-sm font-medium">
                            <span className="flex items-center gap-2">
                                <Loader2 className="h-4 w-4 animate-spin" />
                                {sendingStatus}
                            </span>
                            <span>{progress}%</span>
                        </div>
                        <Progress value={progress} className="h-2" />
                        <p className="text-[10px] text-center text-muted-foreground uppercase tracking-widest font-bold">
                            Mantenha esta aba aberta até a conclusão
                        </p>
                    </CardContent>
                </Card>
            )}

            <div className="grid md:grid-cols-2 gap-6">
                <Card>
                    <CardHeader>
                        <CardTitle className="text-lg flex items-center gap-2">
                            <Users className="h-5 w-5 text-primary" />
                            Filtros de Segmentação
                        </CardTitle>
                        <CardDescription>Selecione quem deve receber a mensagem.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="space-y-2">
                            <Label className="flex items-center gap-2 text-xs">
                                <Activity className="h-3 w-3" /> Status do Cliente
                            </Label>
                            <Select value={selectedStatus} onValueChange={setSelectedStatus} disabled={isSending}>
                                <SelectTrigger>
                                    <SelectValue placeholder="Todos os Status" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">Todos os Status</SelectItem>
                                    <SelectItem value="Ativo">Apenas Ativos</SelectItem>
                                    <SelectItem value="Vencido">Apenas Vencidos</SelectItem>
                                    <SelectItem value="Inativo">Apenas Inativos</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="space-y-2">
                            <Label className="flex items-center gap-2 text-xs">
                                <Package className="h-3 w-3" /> Produto (Assinatura)
                            </Label>
                            <Select value={selectedSubscription} onValueChange={setSelectedSubscription} disabled={isSending}>
                                <SelectTrigger>
                                    <SelectValue placeholder="Todos os Produtos" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">Todos os Produtos</SelectItem>
                                    {subscriptions?.map(sub => (
                                        <SelectItem key={sub.id} value={sub.name}>{sub.name}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="pt-4 flex items-center justify-between p-4 bg-muted/30 rounded-lg border">
                            <span className="text-sm font-medium">Clientes Selecionados:</span>
                            <Badge variant="secondary" className="text-lg font-bold px-3">
                                {isLoadingClients ? <Loader2 className="h-4 w-4 animate-spin" /> : filteredClients.length}
                            </Badge>
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle className="text-lg flex items-center gap-2">
                            <Timer className="h-5 w-5 text-primary" />
                            Atraso entre Envios
                        </CardTitle>
                        <CardDescription>Evite bloqueios no WhatsApp com atrasos.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-6">
                        <div className="flex items-center justify-between">
                            <Label className="text-base font-semibold">Segundos por envio</Label>
                            <span className="font-bold text-lg text-primary">
                                {filteredClients.length > 1 ? "30s (Obrigatório)" : `${delay[0]}s`}
                            </span>
                        </div>
                        <Slider
                            min={1}
                            max={60}
                            step={1}
                            value={delay}
                            onValueChange={setDelay}
                            disabled={isSending || filteredClients.length > 1}
                        />
                        {filteredClients.length > 1 ? (
                            <Alert className="bg-blue-50 border-blue-200">
                                <Info className="h-4 w-4 text-blue-600" />
                                <AlertDescription className="text-blue-700 text-[10px]">
                                    Sempre que houver 2 ou mais clientes, o delay de 30s é ativado automaticamente para sua segurança.
                                </AlertDescription>
                            </Alert>
                        ) : (
                            <p className="text-xs text-muted-foreground">
                                Recomendamos no mínimo 10 segundos entre cada mensagem.
                            </p>
                        )}
                    </CardContent>
                </Card>
            </div>

            <Card className="shadow-lg border-primary/20">
              <CardHeader>
                <CardTitle className="text-2xl">Escrever Mensagem</CardTitle>
                <CardDescription>
                  Use as tags abaixo para personalizar a mensagem com os dados de cada cliente.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-2">
                    <Label className="text-xs font-semibold">Tags de Personalização (Clique para copiar):</Label>
                    <div className="flex flex-wrap gap-2">
                        {availableVariables.map(variable => (
                            <Badge 
                                key={variable} 
                                variant="outline" 
                                className="cursor-pointer hover:bg-accent bg-background"
                                onClick={() => copyVariableToClipboard(variable)}
                            >
                                {variable}
                            </Badge>
                        ))}
                    </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="shot-message" className="text-base font-semibold">Conteúdo da Mensagem</Label>
                  <Textarea
                    id="shot-message"
                    placeholder="Olá {cliente}, vi que sua assinatura {assinatura} está ativa!..."
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    disabled={isSending}
                    className="min-h-[180px] text-base"
                  />
                </div>
              </CardContent>
              <CardFooter className="flex-col gap-4">
                <Alert variant="destructive" className="bg-destructive/5">
                    <AlertTriangle className="h-4 w-4" />
                    <AlertTitle>Atenção</AlertTitle>
                    <AlertDescription className="text-[11px]">
                        Ao clicar em enviar, o sistema processará um por um. O log de cada envio aparecerá em "Configurações {'>'} Logs".
                    </AlertDescription>
                </Alert>
                
                <Button 
                    onClick={handleSendShot} 
                    size="lg" 
                    className="w-full text-lg h-14" 
                    disabled={isSending || isLoadingSettings || filteredClients.length === 0}
                >
                   {isSending ? (
                    <>
                      <RefreshCw className="mr-2 h-5 w-5 animate-spin" />
                      Processando Fila...
                    </>
                  ) : (
                    <>
                      <Send className="mr-2 h-5 w-5" />
                      Disparar para {filteredClients.length} Clientes
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

export default ShotStatusProductPage;
