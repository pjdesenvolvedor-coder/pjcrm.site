'use client';

import { useState, useEffect } from 'react';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import { ShieldCheck, Copy, Send, RefreshCw, Check, Code, PhoneCall, KeyRound, AlertCircle, Save, MessageSquareText } from 'lucide-react';
import { collection, query, orderBy, limit, onSnapshot, doc, setDoc } from 'firebase/firestore';
import { useFirebase, useDoc, useMemoFirebase } from '@/firebase';

interface TwoFactorLog {
  id: string;
  rawPhone?: string;
  formattedPhone?: string;
  code?: string;
  message?: string;
  status?: 'Enviado' | 'Recebido' | 'Erro';
  errorDetail?: string;
  bodyRaw?: string;
  timestampMs?: number;
}

const DEFAULT_TEMPLATE = `Ola,\nSeu codigo de acesso para o Aplicativo PJ Assinaturas;\n\nCodigo: {codigo}`;

export default function TwoFactorAppPage() {
  const { firestore, effectiveUserId, user } = useFirebase();
  const { toast } = useToast();

  const uid = effectiveUserId || user?.uid;

  const settingsDocRef = useMemoFirebase(
    () => (uid && firestore ? doc(firestore, 'users', uid, 'settings', '2fatores') : null),
    [firestore, uid]
  );
  const { data: settingsData } = useDoc(settingsDocRef);

  const [origin, setOrigin] = useState('https://pjcrm.site');
  const [copied, setCopied] = useState(false);
  const [logs, setLogs] = useState<TwoFactorLog[]>([]);
  const [isLoadingLogs, setIsLoadingLogs] = useState(true);

  // Template state
  const [template, setTemplate] = useState(DEFAULT_TEMPLATE);
  const [isSavingTemplate, setIsSavingTemplate] = useState(false);

  // Manual test fields
  const [testPhone, setTestPhone] = useState('');
  const [testCode, setTestCode] = useState('');
  const [isSending, setIsSending] = useState(false);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setOrigin(window.location.origin);
    }
  }, []);

  // Load saved template from Firestore
  useEffect(() => {
    if (settingsData && settingsData.messageTemplate) {
      setTemplate(settingsData.messageTemplate);
    }
  }, [settingsData]);

  const handleSaveTemplate = async () => {
    if (!settingsDocRef) {
      toast({
        title: 'Usuário não autenticado',
        description: 'Faça login para salvar as configurações.',
        variant: 'destructive',
      });
      return;
    }

    setIsSavingTemplate(true);
    try {
      await setDoc(settingsDocRef, { messageTemplate: template }, { merge: true });
      toast({
        title: 'Modelo Salvo! 💾',
        description: 'A mensagem de 2FA foi personalizada e gravada com sucesso.',
      });
    } catch (err: any) {
      toast({
        title: 'Erro ao salvar',
        description: err.message || 'Falha ao salvar modelo de mensagem.',
        variant: 'destructive',
      });
    } finally {
      setIsSavingTemplate(false);
    }
  };

  const insertVariable = (variable: string) => {
    setTemplate((prev) => `${prev} ${variable}`);
    navigator.clipboard.writeText(variable);
    toast({
      title: 'Variável Copiada! 📋',
      description: `${variable} foi adicionada e copiada.`,
    });
  };

  const fetchLogsFromApi = async () => {
    try {
      const res = await fetch('/api/2-fatores');
      const data = await res.json();
      if (data.success && Array.isArray(data.logs)) {
        setLogs(data.logs);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoadingLogs(false);
    }
  };

  // Listen to Firestore 2FA logs in real-time + 4s polling fallback
  useEffect(() => {
    if (!firestore) {
      fetchLogsFromApi();
      const interval = setInterval(fetchLogsFromApi, 4000);
      return () => clearInterval(interval);
    }

    setIsLoadingLogs(true);
    const q = query(collection(firestore, 'two_factor_logs'), orderBy('timestampMs', 'desc'), limit(50));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const fetchedLogs: TwoFactorLog[] = snapshot.docs.map((docSnap) => ({
        id: docSnap.id,
        ...docSnap.data(),
      }));
      setLogs(fetchedLogs);
      setIsLoadingLogs(false);
    }, (err) => {
      console.error('Erro ao ouvir logs 2FA via Firestore snapshot:', err);
      fetchLogsFromApi();
    });

    const interval = setInterval(fetchLogsFromApi, 4000);

    return () => {
      unsubscribe();
      clearInterval(interval);
    };
  }, [firestore]);

  const webhookUrl = `${origin}/api/2-fatores`;

  const copyWebhookUrl = () => {
    navigator.clipboard.writeText(webhookUrl);
    setCopied(true);
    toast({
      title: 'URL Copiada! 🚀',
      description: 'O link do Webhook foi copiado para a área de transferência.',
    });
    setTimeout(() => setCopied(false), 2000);
  };

  const handleTestWebhook = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!testPhone.trim() || !testCode.trim()) {
      toast({
        title: 'Campos incompletos',
        description: 'Preencha o número de telefone e o código para testar.',
        variant: 'destructive',
      });
      return;
    }

    setIsSending(true);
    try {
      const res = await fetch('/api/2-fatores', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          Numero: testPhone.trim(),
          Codigo: testCode.trim(),
        }),
      });

      const json = await res.json();
      if (res.ok && json.success) {
        toast({
          title: 'Código 2FA Enviado! 🔒',
          description: `Mensagem enviada com sucesso para ${json.extractedPhone || testPhone}`,
        });
        setTestCode('');
        fetchLogsFromApi();
      } else {
        toast({
          title: 'Erro ao enviar 2FA',
          description: json.error || json.details || 'Falha ao processar o webhook.',
          variant: 'destructive',
        });
      }
    } catch (err: any) {
      toast({
        title: 'Erro de comunicação',
        description: err.message || 'Não foi possível conectar ao servidor.',
        variant: 'destructive',
      });
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="flex flex-col h-full space-y-6 p-4 md:p-6 overflow-y-auto">
      <PageHeader
        title="2FA APP 🛡️"
        description="Webhook automatizado com modelo de mensagem personalizável via Zap de Cobranças."
      />

      {/* SEÇÃO DE CONFIGURAÇÃO DO MODELO DE MENSAGEM */}
      <Card className="border-emerald-500/30 bg-emerald-500/5 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg text-emerald-600 dark:text-emerald-400">
            <MessageSquareText className="h-5 w-5" />
            Personalizar Mensagem de 2FA
          </CardTitle>
          <CardDescription>
            Personalize o texto enviado ao cliente. Use as variáveis <code>{`{codigo}`}</code> e <code>{`{numero}`}</code> para inserir os dados recebidos.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-muted-foreground">Variáveis disponíveis (clique para inserir):</span>
              <Badge
                variant="outline"
                className="cursor-pointer font-mono hover:bg-emerald-500/10 hover:border-emerald-500 text-xs py-1"
                onClick={() => insertVariable('{codigo}')}
              >
                {`{codigo}`}
              </Badge>
              <Badge
                variant="outline"
                className="cursor-pointer font-mono hover:bg-emerald-500/10 hover:border-emerald-500 text-xs py-1"
                onClick={() => insertVariable('{numero}')}
              >
                {`{numero}`}
              </Badge>
            </div>

            <Textarea
              value={template}
              onChange={(e) => setTemplate(e.target.value)}
              placeholder="Digite sua mensagem de 2FA..."
              className="min-h-28 font-mono text-sm"
              rows={4}
            />
          </div>

          <div className="flex justify-end">
            <Button
              onClick={handleSaveTemplate}
              disabled={isSavingTemplate}
              className="bg-emerald-600 hover:bg-emerald-700 text-white gap-2 font-bold"
            >
              {isSavingTemplate ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {isSavingTemplate ? 'Salvando...' : 'Salvar Modelo de Mensagem'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* CARD 1 & CARD 2: WEBHOOK URL & TESTE MANUAL */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2 border-primary/20 shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <ShieldCheck className="h-5 w-5 text-primary" />
              Link do Webhook (POST)
            </CardTitle>
            <CardDescription>
              Envie requisições HTTP POST para esta URL com qualquer formato. O sistema extrai o número e código automaticamente e dispara via Zap de Cobranças.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-2">
              <Input
                readOnly
                value={webhookUrl}
                className="font-mono text-sm bg-muted text-foreground font-semibold"
              />
              <Button onClick={copyWebhookUrl} variant="secondary" className="gap-2 shrink-0">
                {copied ? <Check className="h-4 w-4 text-emerald-500" /> : <Copy className="h-4 w-4" />}
                {copied ? 'Copiado' : 'Copiar URL'}
              </Button>
            </div>

            <div className="bg-muted/60 p-4 rounded-lg border space-y-2">
              <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground uppercase">
                <Code className="h-4 w-4" /> Exemplo de Payload Aceito (JSON / POST)
              </div>
              <pre className="text-xs font-mono bg-background p-3 rounded border overflow-x-auto text-emerald-600 dark:text-emerald-400">
{`{
  "Numero": "5577998413534",
  "Codigo": "123456"
}`}
              </pre>
              <p className="text-xs text-muted-foreground">
                📌 <b>Aceita qualquer variação de chaves:</b> <code>Numero</code>, <code>numero</code>, <code>phone</code>, <code>number</code>, <code>Codigo</code>, <code>codigo</code>, <code>code</code>, etc.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* CARD 2: TESTE MANUAL */}
        <Card className="border-border shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Send className="h-4 w-4 text-primary" />
              Testar Webhook Manualmente
            </CardTitle>
            <CardDescription>
              Simule o envio de um payload para testar a integração.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleTestWebhook} className="space-y-3">
              <div className="space-y-1">
                <label className="text-xs font-medium flex items-center gap-1">
                  <PhoneCall className="h-3.5 w-3.5 text-muted-foreground" /> Número do Cliente
                </label>
                <Input
                  placeholder="Ex: 77998413534"
                  value={testPhone}
                  onChange={(e) => setTestPhone(e.target.value)}
                  className="text-sm"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium flex items-center gap-1">
                  <KeyRound className="h-3.5 w-3.5 text-muted-foreground" /> Código (2FA)
                </label>
                <Input
                  placeholder="Ex: 849204"
                  value={testCode}
                  onChange={(e) => setTestCode(e.target.value)}
                  className="text-sm font-mono font-bold tracking-wider"
                />
              </div>

              <Button type="submit" disabled={isSending} className="w-full gap-2 font-semibold mt-2">
                {isSending ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                {isSending ? 'Enviando...' : 'Enviar Código Teste'}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>

      {/* CARD 3: LOGS EM TEMPO REAL */}
      <Card className="border-border shadow-sm flex-1">
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <div>
            <CardTitle className="text-lg flex items-center gap-2">
              <KeyRound className="h-5 w-5 text-primary" />
              Últimas Requisições Recebidas (Logs em Tempo Real)
            </CardTitle>
            <CardDescription>
              Todas as requisições recebidas pelo Webhook são registradas aqui.
            </CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={fetchLogsFromApi} className="gap-2 text-xs">
            <RefreshCw className="h-3.5 w-3.5" /> Atualizar
          </Button>
        </CardHeader>
        <CardContent>
          {isLoadingLogs ? (
            <div className="flex justify-center py-12 text-muted-foreground text-sm gap-2">
              <RefreshCw className="h-4 w-4 animate-spin" /> Carregando registros...
            </div>
          ) : logs.length === 0 ? (
            <div className="text-center py-12 border-2 border-dashed rounded-lg text-muted-foreground">
              <AlertCircle className="h-8 w-8 mx-auto mb-2 opacity-40" />
              <p className="font-medium text-sm">Nenhuma requisição recebida ainda</p>
              <p className="text-xs text-muted-foreground mt-1">
                Faça uma chamada POST para <code>{webhookUrl}</code> para ver os registros aqui.
              </p>
            </div>
          ) : (
            <div className="rounded-md border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Data / Hora</TableHead>
                    <TableHead>Telefone</TableHead>
                    <TableHead>Código</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="min-w-[200px]">Payload Recebido</TableHead>
                    <TableHead className="min-w-[200px]">Mensagem Enviada</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {logs.map((log) => {
                    const dateStr = log.timestampMs
                      ? new Date(log.timestampMs).toLocaleString('pt-BR')
                      : 'N/A';
                    return (
                      <TableRow key={log.id}>
                        <TableCell className="text-xs font-mono text-muted-foreground whitespace-nowrap">
                          {dateStr}
                        </TableCell>
                        <TableCell className="font-medium text-sm">
                          {log.formattedPhone && log.formattedPhone !== 'N/A'
                            ? log.formattedPhone
                            : (log.rawPhone || 'N/A')}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="font-mono text-xs font-bold bg-muted">
                            {log.code || 'N/A'}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {log.status === 'Enviado' ? (
                            <Badge className="bg-emerald-600 hover:bg-emerald-700 text-white">
                              Enviado
                            </Badge>
                          ) : log.status === 'Recebido' ? (
                            <Badge variant="secondary" className="bg-blue-600 text-white">
                              Recebido
                            </Badge>
                          ) : (
                            <Badge variant="destructive">
                              Erro {log.errorDetail ? `(${log.errorDetail})` : ''}
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-xs font-mono text-muted-foreground max-w-xs truncate">
                          <span title={log.bodyRaw || ''}>
                            {log.bodyRaw || 'N/A'}
                          </span>
                        </TableCell>
                        <TableCell className="text-xs font-mono text-muted-foreground whitespace-pre-wrap">
                          {log.message || 'N/A'}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
