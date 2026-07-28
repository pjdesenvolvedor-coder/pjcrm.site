'use client';

import { useState, useMemo } from 'react';
import { doc, collection, query, orderBy, limit, deleteDoc, getDocs } from 'firebase/firestore';
import { useFirebase, useUser, useDoc, useCollection, useMemoFirebase } from '@/firebase';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import type { Settings, Client, ScheduledMessage } from '@/lib/types';
import { 
  Bug, 
  Rocket, 
  Users, 
  Zap, 
  RefreshCw, 
  Send, 
  Trash2, 
  CheckCircle2, 
  XCircle, 
  Clock, 
  Terminal, 
  Search,
  ShieldCheck
} from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

type LogItem = {
  id: string;
  type?: string;
  clientName?: string;
  target?: string;
  status?: string;
  delayApplied?: number;
  timestamp?: any;
  details?: string;
};

export default function DebugPage() {
  const { firestore } = useFirebase();
  const { user } = useUser();
  const { toast } = useToast();

  const [activeTab, setActiveTab] = useState('logs');
  const [logFilter, setLogFilter] = useState<string>('ALL');
  const [searchTerm, setSearchTerm] = useState('');
  
  // Test states
  const [testJid, setTestJid] = useState('');
  const [testGroupMsg, setTestGroupMsg] = useState('Mensagem de teste para grupo via DEBUG CRM');
  const [isSendingGroupTest, setIsSendingGroupTest] = useState(false);
  const [groupTestResult, setGroupTestResult] = useState<any>(null);

  const [selectedClientId, setSelectedClientId] = useState('');
  const [isSendingUpsellTest, setIsSendingUpsellTest] = useState(false);
  const [upsellTestResult, setUpsellTestResult] = useState<any>(null);

  const [isClearingLogs, setIsClearingLogs] = useState(false);

  // Firestore Queries
  const settingsDocRef = useMemoFirebase(() => {
    if (!user) return null;
    return doc(firestore, 'users', user.uid, 'settings', 'config');
  }, [firestore, user]);
  const { data: settings } = useDoc<Settings>(settingsDocRef);

  const clientsQuery = useMemoFirebase(() => {
    if (!user) return null;
    return query(collection(firestore, 'users', user.uid, 'clients'), limit(50));
  }, [user, firestore]);
  const { data: clients } = useCollection<Client>(clientsQuery);

  const scheduledMessagesQuery = useMemoFirebase(() => {
    if (!user) return null;
    return query(collection(firestore, 'users', user.uid, 'scheduled_messages'), limit(50));
  }, [user, firestore]);
  const { data: scheduledMessages } = useCollection<ScheduledMessage>(scheduledMessagesQuery);

  const logsQuery = useMemoFirebase(() => {
    if (!user) return null;
    return query(collection(firestore, 'users', user.uid, 'logs'), orderBy('timestamp', 'desc'), limit(100));
  }, [user, firestore]);
  const { data: logs, isLoading: isLogsLoading } = useCollection<LogItem>(logsQuery);

  // Active upsells
  const activeUpsells = settings?.upsells?.filter(u => u.isActive) || [];

  // Filtered Logs
  const filteredLogs = useMemo(() => {
    if (!logs) return [];
    return logs.filter(log => {
      const typeMatch = logFilter === 'ALL' || (log.type && log.type.toUpperCase() === logFilter.toUpperCase());
      const searchLower = searchTerm.toLowerCase();
      const textMatch = !searchTerm || 
        (log.clientName && log.clientName.toLowerCase().includes(searchLower)) ||
        (log.target && log.target.toLowerCase().includes(searchLower)) ||
        (log.type && log.type.toLowerCase().includes(searchLower)) ||
        (log.status && log.status.toLowerCase().includes(searchLower));
      return typeMatch && textMatch;
    });
  }, [logs, logFilter, searchTerm]);

  // Test send to Group
  const handleTestGroupMessage = async () => {
    if (!testJid.trim() || !testGroupMsg.trim()) {
      toast({ title: 'Atenção', description: 'Preencha o JID do grupo e a mensagem.', variant: 'destructive' });
      return;
    }

    const token = settings?.webhookToken || settings?.billingWebhookToken;
    if (!token) {
      toast({ title: 'Sem Token', description: 'Nenhum token do WhatsApp cadastrado nas configurações.', variant: 'destructive' });
      return;
    }

    setIsSendingGroupTest(true);
    setGroupTestResult(null);

    try {
      const res = await fetch('/api/send-group-message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jid: testJid.trim(),
          message: testGroupMsg.trim(),
          token: token,
        }),
      });

      const data = await res.json();
      setGroupTestResult({ status: res.status, ok: res.ok, data });

      if (res.ok) {
        toast({ title: 'Sucesso!', description: 'Mensagem de teste enviada para o grupo.' });
      } else {
        toast({ title: 'Erro de Envio', description: data.error || 'Falha ao enviar mensagem de grupo.', variant: 'destructive' });
      }
    } catch (err: any) {
      setGroupTestResult({ error: err.message || 'Erro de rede' });
      toast({ title: 'Erro de Requisição', description: err.message, variant: 'destructive' });
    } finally {
      setIsSendingGroupTest(false);
    }
  };

  // Test send Upsell
  const handleTestUpsell = async () => {
    const targetClient = clients?.find(c => c.id === selectedClientId) || clients?.[0];
    if (!targetClient) {
      toast({ title: 'Sem Cliente', description: 'Selecione ou crie um cliente para testar.', variant: 'destructive' });
      return;
    }

    if (activeUpsells.length === 0) {
      toast({ title: 'Sem Upsell Ativo', description: 'Ative pelo menos uma mensagem de Upsell na tela de Automações > Upsell.', variant: 'destructive' });
      return;
    }

    const token = settings?.webhookToken;
    if (!token) {
      toast({ title: 'Sem Token Principal', description: 'Cadastre o token do Hub Principal.', variant: 'destructive' });
      return;
    }

    setIsSendingUpsellTest(true);
    setUpsellTestResult(null);

    try {
      const upsellRule = activeUpsells[0];
      const formattedMessage = (upsellRule.upsellMessage || '')
        .replace(/{cliente}/g, targetClient.name || '')
        .replace(/{telefone}/g, targetClient.phone || '')
        .replace(/{email}/g, Array.isArray(targetClient.email) ? targetClient.email.join(', ') : (targetClient.email || ''))
        .replace(/{assinatura}/g, targetClient.subscription || '')
        .replace(/{valor}/g, targetClient.amountPaid || '0,00')
        .replace(/{status}/g, targetClient.status || 'Ativo');

      const res = await fetch('/api/send-message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: formattedMessage,
          phoneNumber: targetClient.phone,
          token: token,
        }),
      });

      const data = await res.json();
      setUpsellTestResult({ status: res.status, ok: res.ok, target: targetClient.name, phone: targetClient.phone, data });

      if (res.ok) {
        toast({ title: 'Upsell Disparado!', description: `Mensagem enviada com sucesso para ${targetClient.name}.` });
      } else {
        toast({ title: 'Erro de Envio', description: data.error || 'Falha no disparo do Upsell.', variant: 'destructive' });
      }
    } catch (err: any) {
      setUpsellTestResult({ error: err.message });
      toast({ title: 'Erro', description: err.message, variant: 'destructive' });
    } finally {
      setIsSendingUpsellTest(false);
    }
  };

  // Clear Logs
  const handleClearLogs = async () => {
    if (!user || !logs || logs.length === 0) return;
    if (!confirm('Tem certeza que deseja apagar todos os logs de histórico?')) return;

    setIsClearingLogs(true);
    try {
      const logsSnap = await getDocs(collection(firestore, 'users', user.uid, 'logs'));
      const deletePromises = logsSnap.docs.map(docSnap => deleteDoc(docSnap.ref));
      await Promise.all(deletePromises);
      toast({ title: 'Logs limpos', description: 'Todo o histórico de logs foi removido.' });
    } catch (err: any) {
      toast({ title: 'Erro ao limpar', description: err.message, variant: 'destructive' });
    } finally {
      setIsClearingLogs(false);
    }
  };

  const formatTimestamp = (ts: any) => {
    if (!ts) return 'Agora';
    try {
      let date: Date | null = null;
      if (typeof ts.toDate === 'function') date = ts.toDate();
      else if (ts.seconds) date = new Date(ts.seconds * 1000);
      else date = new Date(ts);
      return format(date, 'dd/MM/yyyy HH:mm:ss', { locale: ptBR });
    } catch {
      return 'N/A';
    }
  };

  return (
    <div className="flex flex-col h-full">
      <PageHeader title="DEBUG & Diagnóstico" description="Painel em tempo real para auditoria de automações, logs de disparo e testes imediatos.">
        <Badge variant="outline" className="gap-1 border-rose-500/30 bg-rose-500/10 text-rose-600 font-mono">
          <Bug className="h-3.5 w-3.5" /> PAINEL DEBUG LIVE
        </Badge>
      </PageHeader>

      <main className="flex-1 overflow-auto p-4 md:p-6 space-y-6">

        {/* STATUS DAS CONEXÕES E AUTOMACÕES */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-medium text-muted-foreground flex items-center justify-between">
                <span>HUB PRINCIPAL</span>
                <Zap className="h-4 w-4 text-emerald-500" />
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <span className="text-sm font-bold truncate max-w-[120px]">
                  {settings?.webhookToken ? 'Token Cadastrado' : 'Sem Token'}
                </span>
                {settings?.webhookToken ? (
                  <Badge variant="default" className="bg-emerald-600">ATIVO</Badge>
                ) : (
                  <Badge variant="destructive">PENDENTE</Badge>
                )}
              </div>
              <p className="text-[10px] text-muted-foreground mt-1 truncate">
                {settings?.webhookToken ? `Token: ${settings.webhookToken.slice(0, 10)}...` : 'Configure em Configurações > Tokens'}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-medium text-muted-foreground flex items-center justify-between">
                <span>ZAP COBRANÇA</span>
                <ShieldCheck className="h-4 w-4 text-violet-500" />
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <span className="text-sm font-bold">
                  {settings?.useSeparateBillingZap ? 'ZAP Separado' : 'Usando Principal'}
                </span>
                {settings?.useSeparateBillingZap ? (
                  <Badge variant="secondary" className="bg-violet-500/10 text-violet-600 font-bold">SEPARADO</Badge>
                ) : (
                  <Badge variant="outline">PADRÃO</Badge>
                )}
              </div>
              <p className="text-[10px] text-muted-foreground mt-1 truncate">
                {settings?.billingWebhookToken ? `Token: ${settings.billingWebhookToken.slice(0, 10)}...` : 'Sem Zap Separado'}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-medium text-muted-foreground flex items-center justify-between">
                <span>AUTOMAÇÃO UPSELL</span>
                <Rocket className="h-4 w-4 text-primary" />
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <span className="text-sm font-bold">{activeUpsells.length} Regras Ativas</span>
                {activeUpsells.length > 0 ? (
                  <Badge variant="default" className="bg-blue-600">LIGADO</Badge>
                ) : (
                  <Badge variant="outline">DESLIGADO</Badge>
                )}
              </div>
              <p className="text-[10px] text-muted-foreground mt-1">
                Disparos apenas para novos cadastros
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-medium text-muted-foreground flex items-center justify-between">
                <span>GRUPOS AGENDADOS</span>
                <Users className="h-4 w-4 text-blue-500" />
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <span className="text-sm font-bold">
                  {scheduledMessages?.filter(m => m.status === 'Scheduled' || m.status === 'Sending').length || 0} Pendentes
                </span>
                <Badge variant="secondary">AGENDADOR</Badge>
              </div>
              <p className="text-[10px] text-muted-foreground mt-1">
                Verificação a cada 30 segundos
              </p>
            </CardContent>
          </Card>
        </div>

        {/* TABS DE LOGS E TESTES */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
          <TabsList>
            <TabsTrigger value="logs" className="gap-2">
              <Terminal className="h-4 w-4" /> Log de Disparos ({logs?.length || 0})
            </TabsTrigger>
            <TabsTrigger value="test-upsell" className="gap-2">
              <Rocket className="h-4 w-4 text-primary" /> Testar Upsell Agora
            </TabsTrigger>
            <TabsTrigger value="test-group" className="gap-2">
              <Users className="h-4 w-4 text-blue-500" /> Testar Grupo Agora
            </TabsTrigger>
          </TabsList>

          {/* TAB 1: LOGS DE DISPAROS */}
          <TabsContent value="logs" className="space-y-4">
            <Card>
              <CardHeader className="pb-3">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div>
                    <CardTitle className="text-base flex items-center gap-2">
                      <Terminal className="h-5 w-5 text-primary" /> Histórico de Disparos do Sistema
                    </CardTitle>
                    <CardDescription>
                      Acompanhe em tempo real todas as tentativas, envios e erros de mensagens automáticas.
                    </CardDescription>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <Button variant="outline" size="sm" onClick={handleClearLogs} disabled={isClearingLogs || !logs || logs.length === 0} className="text-destructive hover:bg-destructive/10">
                      <Trash2 className="h-3.5 w-3.5 mr-1" /> Limpar Logs
                    </Button>
                  </div>
                </div>

                <div className="flex flex-col md:flex-row gap-3 pt-4">
                  <div className="relative flex-1">
                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Buscar por cliente, telefone ou tipo..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="pl-9"
                    />
                  </div>
                  <div className="flex gap-1 flex-wrap">
                    {['ALL', 'Upsell', 'Grupo', 'Cobrança', 'Remarketing'].map(type => (
                      <Button
                        key={type}
                        size="sm"
                        variant={logFilter === type ? 'default' : 'outline'}
                        onClick={() => setLogFilter(type)}
                        className="text-xs"
                      >
                        {type === 'ALL' ? 'Todos' : type}
                      </Button>
                    ))}
                  </div>
                </div>
              </CardHeader>

              <CardContent>
                {isLogsLoading ? (
                  <div className="p-8 text-center text-muted-foreground flex items-center justify-center gap-2">
                    <RefreshCw className="h-4 w-4 animate-spin" /> Carregando logs...
                  </div>
                ) : filteredLogs.length === 0 ? (
                  <div className="p-12 text-center text-muted-foreground border border-dashed rounded-lg">
                    <Bug className="h-8 w-8 mx-auto mb-2 opacity-30" />
                    <p className="font-semibold">Nenhum log registrado ainda</p>
                    <p className="text-xs text-muted-foreground">Quando as automações rodarem, os eventos aparecerão aqui automaticamente.</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {filteredLogs.map(log => (
                      <div key={log.id} className="flex flex-col md:flex-row md:items-center justify-between p-3 rounded-lg border bg-card hover:bg-accent/40 transition-colors text-sm gap-2">
                        <div className="flex items-center gap-3">
                          {log.status === 'Enviado' ? (
                            <CheckCircle2 className="h-5 w-5 text-emerald-500 shrink-0" />
                          ) : log.status === 'Erro' ? (
                            <XCircle className="h-5 w-5 text-destructive shrink-0" />
                          ) : (
                            <Clock className="h-5 w-5 text-amber-500 shrink-0 animate-pulse" />
                          )}
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-foreground">{log.clientName || 'Cliente'}</span>
                              <Badge variant="outline" className="text-[10px] uppercase font-mono">
                                {log.type || 'Sistema'}
                              </Badge>
                              {log.status === 'Enviado' && <Badge className="bg-emerald-600 text-[10px]">ENVIADO</Badge>}
                              {log.status === 'Erro' && <Badge variant="destructive" className="text-[10px]">ERRO</Badge>}
                              {log.status === 'Enviando' && <Badge variant="secondary" className="bg-amber-500/10 text-amber-600 text-[10px]">PROCESSANDO</Badge>}
                            </div>
                            <p className="text-xs text-muted-foreground font-mono mt-0.5">
                              Destino: {log.target || 'N/A'} {log.delayApplied ? `| Delay: ${log.delayApplied}s` : ''}
                            </p>
                          </div>
                        </div>

                        <div className="text-right text-xs text-muted-foreground font-mono">
                          {formatTimestamp(log.timestamp)}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* TAB 2: TESTAR UPSELL */}
          <TabsContent value="test-upsell" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Rocket className="h-5 w-5 text-primary" /> Testar Disparo de Upsell Imediato
                </CardTitle>
                <CardDescription>
                  Simule o disparo de uma mensagem de Upsell ativa para um cliente de teste sem aguardar o tempo de delay.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Selecione um Cliente para Testar:</Label>
                  <select 
                    className="w-full p-2 border rounded-md bg-background text-sm"
                    value={selectedClientId}
                    onChange={(e) => setSelectedClientId(e.target.value)}
                  >
                    {clients && clients.length > 0 ? (
                      clients.map(c => (
                        <option key={c.id} value={c.id}>
                          {c.name} ({c.phone}) - {c.subscription || 'Sem Assinatura'}
                        </option>
                      ))
                    ) : (
                      <option value="">Nenhum cliente cadastrado no CRM</option>
                    )}
                  </select>
                </div>

                <div className="p-3 bg-muted/40 rounded-lg text-xs space-y-1">
                  <p className="font-semibold text-foreground">Regra de Upsell a ser usada:</p>
                  {activeUpsells.length > 0 ? (
                    <p className="text-muted-foreground font-mono truncate">{activeUpsells[0].upsellMessage}</p>
                  ) : (
                    <p className="text-destructive font-bold">Nenhuma regra de Upsell está ativa no momento. Ative na aba Automações &gt; Upsell.</p>
                  )}
                </div>

                <Button 
                  onClick={handleTestUpsell} 
                  disabled={isSendingUpsellTest || activeUpsells.length === 0 || !clients || clients.length === 0} 
                  className="gap-2"
                >
                  {isSendingUpsellTest ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  Disparar Upsell de Teste Agora
                </Button>

                {upsellTestResult && (
                  <div className="mt-4 p-4 rounded-lg border bg-slate-950 text-slate-100 font-mono text-xs overflow-auto max-h-60 space-y-1">
                    <p className="text-emerald-400 font-bold">// Resposta da Execução do Teste:</p>
                    <pre>{JSON.stringify(upsellTestResult, null, 2)}</pre>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* TAB 3: TESTAR MENSAGEM EM GRUPO */}
          <TabsContent value="test-group" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Users className="h-5 w-5 text-blue-500" /> Testar Envio de Mensagem em Grupo
                </CardTitle>
                <CardDescription>
                  Envie uma mensagem direta de teste para qualquer grupo do WhatsApp informando o JID.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>JID do Grupo (ex: 12036312345678901@g.us):</Label>
                  <Input 
                    placeholder="12036312345678901@g.us"
                    value={testJid}
                    onChange={(e) => setTestJid(e.target.value)}
                  />
                  <p className="text-[11px] text-muted-foreground">Você pode obter os JIDs dos seus grupos no menu Comunidades &gt; Obter JID.</p>
                </div>

                <div className="space-y-2">
                  <Label>Mensagem de Teste:</Label>
                  <Textarea 
                    rows={3}
                    value={testGroupMsg}
                    onChange={(e) => setTestGroupMsg(e.target.value)}
                  />
                </div>

                <Button 
                  onClick={handleTestGroupMessage} 
                  disabled={isSendingGroupTest} 
                  className="gap-2 bg-blue-600 hover:bg-blue-700 text-white"
                >
                  {isSendingGroupTest ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  Enviar Teste para o Grupo
                </Button>

                {groupTestResult && (
                  <div className="mt-4 p-4 rounded-lg border bg-slate-950 text-slate-100 font-mono text-xs overflow-auto max-h-60 space-y-1">
                    <p className="text-blue-400 font-bold">// Resposta da API de Grupos:</p>
                    <pre>{JSON.stringify(groupTestResult, null, 2)}</pre>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

      </main>
    </div>
  );
}
