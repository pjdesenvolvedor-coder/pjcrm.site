
'use client';

import { useState, useMemo } from 'react';
import { collection, query, doc, orderBy } from 'firebase/firestore';
import { useFirebase, useUser, useDoc, useMemoFirebase, useCollection } from '@/firebase';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Send, RefreshCw, AlertTriangle, Timer, Users, Package, Activity } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import type { Settings, Client, Subscription } from '@/lib/types';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Slider } from '@/components/ui/slider';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';

export default function ShotStatusProductPage() {
  const { toast } = useToast();
  const { firestore, effectiveUserId } = useFirebase();
  const { user } = useUser();
  
  const [message, setMessage] = useState('');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [selectedSubscription, setSelectedSubscription] = useState<string>('all');
  const [delay, setDelay] = useState([10]); // default 10 seconds for safety
  const [isSending, setIsSending] = useState(false);

  // Load Settings
  const settingsDocRef = useMemoFirebase(() => {
    if (!effectiveUserId) return null;
    return doc(firestore, 'users', effectiveUserId, 'settings', 'config');
  }, [firestore, effectiveUserId]);
  const { data: settings, isLoading: isLoadingSettings } = useDoc<Settings>(settingsDocRef);

  // Load Subscriptions
  const subscriptionsQuery = useMemoFirebase(() => {
    if (!effectiveUserId) return null;
    return query(collection(firestore, 'users', effectiveUserId, 'subscriptions'), orderBy('name'));
  }, [firestore, effectiveUserId]);
  const { data: subscriptions } = useCollection<Subscription>(subscriptionsQuery);

  // Load Clients
  const clientsQuery = useMemoFirebase(() => {
    if (!effectiveUserId) return null;
    return collection(firestore, 'users', effectiveUserId, 'clients');
  }, [firestore, effectiveUserId]);
  const { data: clients, isLoading: isLoadingClients } = useCollection<Client>(clientsQuery);

  // Filtering Logic
  const filteredClients = useMemo(() => {
    if (!clients) return [];
    return clients.filter(client => {
        const matchesStatus = selectedStatus === 'all' || client.status === selectedStatus;
        const matchesSub = selectedSubscription === 'all' || client.subscription === selectedSubscription;
        return matchesStatus && matchesSub;
    });
  }, [clients, selectedStatus, selectedSubscription]);

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

    const formattedNumbers = filteredClients
        .map(c => c.phone.trim().replace(/\D/g, ''))
        .filter(n => n)
        .map(n => `"${n}@s.whatsapp.net"`)
        .join(', ');

    const delayValue = delay[0] * 10;

    try {
      const response = await fetch('/api/send-shot', {
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
        const errorData = await response.json();
        throw new Error(errorData.error || 'Falha ao enviar disparo.');
      }
      
      toast({ 
          title: 'Disparo Iniciado!', 
          description: `Mensagem enviada para a fila de ${filteredClients.length} clientes.` 
      });
      setMessage('');

    } catch (error: any) {
      console.error('Status Shot error:', error);
      toast({ variant: 'destructive', title: 'Erro no Envio', description: error.message });
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title="Disparo por Status - Produto"
        description="Filtre seus clientes e envie mensagens segmentadas."
      />
      <main className="flex-1 overflow-auto p-4 md:p-6">
        <div className="w-full max-w-4xl mx-auto space-y-6">
            <div className="grid md:grid-cols-2 gap-6">
                {/* Filters Card */}
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
                            <Select value={selectedStatus} onValueChange={setSelectedStatus}>
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
                            <Select value={selectedSubscription} onValueChange={setSelectedSubscription}>
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

                {/* Delay Card */}
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
                            <span className="font-bold text-lg text-primary">{delay[0]}s</span>
                        </div>
                        <Slider
                            min={1}
                            max={60}
                            step={1}
                            value={delay}
                            onValueChange={setDelay}
                            disabled={isSending}
                        />
                        <p className="text-xs text-muted-foreground">
                            Para disparos em massa, recomendamos no mínimo 10 segundos entre cada mensagem.
                        </p>
                    </CardContent>
                </Card>
            </div>

            {/* Message Card */}
            <Card className="shadow-lg border-primary/20">
              <CardHeader>
                <CardTitle className="text-2xl">Escrever Mensagem</CardTitle>
                <CardDescription>
                  A mensagem abaixo será enviada para todos os {filteredClients.length} clientes selecionados nos filtros acima.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                 <Alert variant="destructive">
                    <AlertTriangle className="h-4 w-4" />
                    <AlertTitle>Importante</AlertTitle>
                    <AlertDescription>
                        Esta ação enviará mensagens individuais para cada cliente. O delay ajuda a simular comportamento humano.
                    </AlertDescription>
                </Alert>
                <div className="space-y-2">
                  <Label htmlFor="shot-message" className="text-base font-semibold">Conteúdo da Mensagem</Label>
                  <Textarea
                    id="shot-message"
                    placeholder="Olá, temos novidades para você..."
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    disabled={isSending}
                    className="min-h-[150px] text-base"
                  />
                </div>
              </CardContent>
              <CardFooter>
                <Button 
                    onClick={handleSendShot} 
                    size="lg" 
                    className="w-full text-lg h-14" 
                    disabled={isSending || isLoadingSettings || filteredClients.length === 0}
                >
                   {isSending ? (
                    <>
                      <RefreshCw className="mr-2 h-5 w-5 animate-spin" />
                      Processando Disparo...
                    </>
                  ) : (
                    <>
                      <Send className="mr-2 h-5 w-5" />
                      Enviar para {filteredClients.length} Clientes
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
