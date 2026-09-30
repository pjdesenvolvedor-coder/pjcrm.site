'use client';

import { useState, useEffect } from 'react';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { ShieldCheck, Copy, Send, RefreshCw, Check, Code, PhoneCall, KeyRound, AlertCircle, Save, MessageSquareText, Plus, Trash2, Users, Lock } from 'lucide-react';
import { collection, query, orderBy, limit, onSnapshot, doc, setDoc } from 'firebase/firestore';
import { useFirebase, useDoc, useMemoFirebase } from '@/firebase';

interface TwoFactorRecipient {
  id: string;
  name: string;
  phone: string;
}

interface TwoFactorLog {
  id: string;
  rawPhone?: string;
  formattedPhone?: string;
  code?: string;
  message?: string;
  recipientName?: string;
  status?: 'Enviado' | 'Recebido' | 'Erro';
  errorDetail?: string;
  bodyRaw?: string;
  timestampMs?: number;
}

const DEFAULT_TEMPLATE = `🔐 Olá {nome}!\n\nSeu código de acesso para o Painel ADM:\n\n📲 Código: *{codigo}*\n\n⚠️ Este código é pessoal e expira em 5 minutos.`;

export default function TwoFactorAppPage() {
  const { firestore, effectiveUserId, user } = useFirebase();
  const { toast } = useToast();

  const uid = effectiveUserId || user?.uid;

  const [origin, setOrigin] = useState('https://pjcrm.site');
  const [copied, setCopied] = useState(false);
  const [logs, setLogs] = useState<TwoFactorLog[]>([]);
  const [isLoadingLogs, setIsLoadingLogs] = useState(true);

  // 2FA Settings State
  const [enabled, setEnabled] = useState(true);
  const [template, setTemplate] = useState(DEFAULT_TEMPLATE);
  const [recipients, setRecipients] = useState<TwoFactorRecipient[]>([
    { id: '1', name: 'Jivago', phone: '77998413534' },
    { id: '2', name: 'May', phone: '87991791807' },
  ]);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoadingConfig, setIsLoadingConfig] = useState(true);

  // Manual test fields
  const [testPhone, setTestPhone] = useState('');
  const [testCode, setTestCode] = useState('');
  const [isSending, setIsSending] = useState(false);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setOrigin(window.location.origin);
    }
  }, []);

  // Fetch 2FA config from API
  const fetchConfig = async () => {
    setIsLoadingConfig(true);
    try {
      const res = await fetch('/api/2-fatores/login-config');
      const data = await res.json();
      if (data.success) {
        setEnabled(data.enabled !== undefined ? data.enabled : true);
        if (data.messageTemplate) setTemplate(data.messageTemplate);
        if (Array.isArray(data.recipients) && data.recipients.length > 0) {
          setRecipients(data.recipients);
        }
      }
    } catch (err) {
      console.error('Erro ao buscar config 2FA:', err);
    } finally {
      setIsLoadingConfig(false);
    }
  };

  useEffect(() => {
    fetchConfig();
  }, []);

  const handleAddRecipient = () => {
    const newId = String(Date.now());
    setRecipients([...recipients, { id: newId, name: '', phone: '' }]);
  };

  const handleRemoveRecipient = (id: string) => {
    if (recipients.length <= 1) {
      toast({
        title: 'Aviso',
        description: 'É necessário manter pelo menos um destinatário configurado.',
        variant: 'destructive',
      });
      return;
    }
    setRecipients(recipients.filter((r) => r.id !== id));
  };

  const handleUpdateRecipient = (id: string, field: 'name' | 'phone', value: string) => {
    setRecipients(
      recipients.map((r) => (r.id === id ? { ...r, [field]: value } : r))
    );
  };

  const handleSaveAllSettings = async () => {
    // Validar destinatários
    const validRecipients = recipients.filter((r) => r.name.trim() && r.phone.trim());
    if (validRecipients.length === 0) {
      toast({
        title: 'Campos incompletos',
        description: 'Configure pelo menos um destinatário com Nome e Número de WhatsApp válidos.',
        variant: 'destructive',
      });
      return;
    }

    setIsSaving(true);
    try {
      const res = await fetch('/api/2-fatores/login-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          enabled,
          messageTemplate: template,
          recipients: validRecipients,
        }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        toast({
          title: 'Configurações Salvas! 💾',
          description: 'Os botões de acesso e o modelo de mensagem foram atualizados com sucesso.',
        });
      } else {
        throw new Error(data.error || 'Falha ao salvar');
      }
    } catch (err: any) {
      toast({
        title: 'Erro ao salvar',
        description: err.message || 'Falha ao gravar configurações no servidor.',
        variant: 'destructive',
      });
    } finally {
      setIsSaving(false);
    }
  };

  const insertVariable = (variable: string) => {
    setTemplate((prev) => `${prev} ${variable}`);
    navigator.clipboard.writeText(variable);
    toast({
      title: 'Variável Inserida! 📋',
      description: `${variable} foi adicionada ao modelo e copiada.`,
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

  // Listen to Firestore 2FA logs in real-time
  useEffect(() => {
    if (!firestore) {
      fetchLogsFromApi();
      const interval = setInterval(fetchLogsFromApi, 4000);
      return () => clearInterval(interval);
    }

    setIsLoadingLogs(true);
    const q = query(collection(firestore, 'two_factor_logs'), orderBy('timestampMs', 'desc'), limit(50));
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const fetchedLogs: TwoFactorLog[] = snapshot.docs.map((docSnap) => ({
          id: docSnap.id,
          ...docSnap.data(),
        }));
        setLogs(fetchedLogs);
        setIsLoadingLogs(false);
      },
      (err) => {
        console.error('Erro ao ouvir logs 2FA:', err);
        fetchLogsFromApi();
      }
    );

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
          NumeroCliente: testPhone.trim(),
          codigofa: testCode.trim(),
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
          description: json.errorDetail || json.error || 'Falha ao processar o envio.',
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
        title="2FA & Segurança do Login 🛡️"
        description="Gerencie os botões de envio no Login do Painel ADM e personalize as mensagens automáticas."
      />

      {/* SEÇÃO 1: BOTÕES DE DESTINATÁRIOS DO PAINEL ADM */}
      <Card className="border-primary/30 shadow-sm bg-card">
        <CardHeader className="pb-3">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Users className="h-5 w-5 text-primary" />
                Opções de Acesso no Login (Botões de Envio de Código)
              </CardTitle>
              <CardDescription>
                Ao fazer login com senha correta, esses botões aparecem na tela para escolher quem receberá o código 2FA no WhatsApp.
              </CardDescription>
            </div>
            <div className="flex items-center gap-3 bg-muted/60 px-3 py-2 rounded-lg border">
              <Label htmlFor="2fa-toggle" className="text-sm font-semibold cursor-pointer">
                Exigir 2FA no Login:
              </Label>
              <Switch
                id="2fa-toggle"
                checked={enabled}
                onCheckedChange={setEnabled}
              />
              <span className={`text-xs font-bold ${enabled ? 'text-emerald-500' : 'text-muted-foreground'}`}>
                {enabled ? 'ATIVADO' : 'DESATIVADO'}
              </span>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-12 gap-2 text-xs font-semibold text-muted-foreground px-1 hidden md:grid">
              <div className="md:col-span-4">Nome no Botão (Quem vai acessar)</div>
              <div className="md:col-span-6">Número de WhatsApp (com DDD)</div>
              <div className="md:col-span-2 text-right">Ação</div>
            </div>

            {recipients.map((rec, index) => (
              <div key={rec.id || index} className="grid grid-cols-1 md:grid-cols-12 gap-2 items-center bg-muted/40 p-3 rounded-lg border">
                <div className="md:col-span-4 space-y-1">
                  <label className="text-xs font-medium md:hidden">Nome no Botão:</label>
                  <Input
                    placeholder="Ex: Jivago"
                    value={rec.name}
                    onChange={(e) => handleUpdateRecipient(rec.id, 'name', e.target.value)}
                    className="font-semibold"
                  />
                </div>
                <div className="md:col-span-6 space-y-1">
                  <label className="text-xs font-medium md:hidden">Número WhatsApp:</label>
                  <Input
                    placeholder="Ex: 77998413534"
                    value={rec.phone}
                    onChange={(e) => handleUpdateRecipient(rec.id, 'phone', e.target.value)}
                    className="font-mono"
                  />
                </div>
                <div className="md:col-span-2 flex justify-end">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => handleRemoveRecipient(rec.id)}
                    className="text-red-500 hover:text-red-700 hover:bg-red-500/10"
                    title="Remover destinatário"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}

            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleAddRecipient}
              className="gap-2 text-xs font-semibold"
            >
              <Plus className="h-4 w-4" /> Adicionar Outro Destinatário
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* SEÇÃO 2: CONFIGURAÇÃO DO MODELO DE MENSAGEM */}
      <Card className="border-emerald-500/30 bg-emerald-500/5 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg text-emerald-600 dark:text-emerald-400">
            <MessageSquareText className="h-5 w-5" />
            Personalizar Mensagem de 2FA
          </CardTitle>
          <CardDescription>
            Personalize o texto enviado no WhatsApp. Clique nas variáveis disponíveis para inseri-las na mensagem.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
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
                onClick={() => insertVariable('{nome}')}
              >
                {`{nome}`}
              </Badge>
              <Badge
                variant="outline"
                className="cursor-pointer font-mono hover:bg-emerald-500/10 hover:border-emerald-500 text-xs py-1"
                onClick={() => insertVariable('{telefone}')}
              >
                {`{telefone}`}
              </Badge>
            </div>

            <Textarea
              value={template}
              onChange={(e) => setTemplate(e.target.value)}
              placeholder="Digite sua mensagem de 2FA..."
              className="min-h-32 font-mono text-sm bg-background"
              rows={5}
            />
          </div>

          <div className="flex justify-end">
            <Button
              onClick={handleSaveAllSettings}
              disabled={isSaving}
              className="bg-emerald-600 hover:bg-emerald-700 text-white gap-2 font-bold px-6"
            >
              {isSaving ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {isSaving ? 'Salvando...' : 'Salvar Todas as Configurações'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* SEÇÃO 3: WEBHOOK EXTERNO & TESTE MANUAL */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2 border-primary/20 shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <ShieldCheck className="h-5 w-5 text-primary" />
              Link do Webhook para Sistemas Externos (POST)
            </CardTitle>
            <CardDescription>
              Se você possui sistemas ou apps externos que precisam enviar 2FA via WhatsApp, utilize este webhook.
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
                <Code className="h-4 w-4" /> Exemplo de Payload Aceito
              </div>
              <pre className="text-xs font-mono bg-background p-3 rounded border overflow-x-auto text-emerald-600 dark:text-emerald-400">
{`{
  "NumeroCliente": "77998413534",
  "codigofa": "GKEAEY"
}`}
              </pre>
            </div>
          </CardContent>
        </Card>

        {/* TESTE MANUAL */}
        <Card className="border-border shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Send className="h-4 w-4 text-primary" />
              Testar Envio Manual
            </CardTitle>
            <CardDescription>
              Dispare um código teste para qualquer número.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleTestWebhook} className="space-y-3">
              <div className="space-y-1">
                <label className="text-xs font-medium flex items-center gap-1">
                  <PhoneCall className="h-3.5 w-3.5 text-muted-foreground" /> Telefone (com DDD)
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
                  <KeyRound className="h-3.5 w-3.5 text-muted-foreground" /> Código 2FA
                </label>
                <Input
                  placeholder="Ex: GKEAEY ou 849204"
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

      {/* SEÇÃO 4: LOGS EM TEMPO REAL */}
      <Card className="border-border shadow-sm flex-1">
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <div>
            <CardTitle className="text-lg flex items-center gap-2">
              <KeyRound className="h-5 w-5 text-primary" />
              Histórico de Envios de Códigos 2FA
            </CardTitle>
            <CardDescription>
              Registros em tempo real dos códigos gerados para login e recebidos via Webhook.
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
              <p className="font-medium text-sm">Nenhum envio registrado ainda</p>
            </div>
          ) : (
            <div className="rounded-md border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Data / Hora</TableHead>
                    <TableHead>Destinatário / Telefone</TableHead>
                    <TableHead>Código</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="min-w-[250px]">Mensagem Enviada</TableHead>
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
                          <div>
                            {log.recipientName && <span className="font-bold text-primary mr-1">[{log.recipientName}]</span>}
                            <span>{log.formattedPhone && log.formattedPhone !== 'N/A' ? log.formattedPhone : (log.rawPhone || 'N/A')}</span>
                          </div>
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
