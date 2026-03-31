'use client';

import React, { useEffect, useState } from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Trash2, Webhook, Copy, CheckCircle2, Clock, Globe } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useFirebase } from '@/firebase';

interface WebhookLog {
  id: string;
  timestamp: string;
  method: string;
  headers: Record<string, string>;
  body: any;
  ip: string;
}

export default function WebhookReceiverPage() {
  const [logs, setLogs] = useState<WebhookLog[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [copied, setCopied] = useState(false);
  const { toast } = useToast();
  const { effectiveUserId } = useFirebase();

  const [webhookUrl, setWebhookUrl] = useState('');

  useEffect(() => {
    if (!effectiveUserId) return;

    if (typeof window !== 'undefined') {
      setWebhookUrl(`${window.location.origin}/api/webhook-receiver/${effectiveUserId}`);
    }

    const eventSource = new EventSource(`/api/webhook-receiver/${effectiveUserId}`);

    eventSource.onopen = () => {
      setIsConnected(true);
    };

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'init') {
          setLogs(data.logs);
        } else if (data.type === 'clear') {
          setLogs([]);
        } else if (data.id) {
          setLogs((prev) => [data, ...prev].slice(0, 100)); // Keep last 100
        }
      } catch (err) {
        console.error('Failed to parse SSE data', err);
      }
    };

    eventSource.onerror = (err) => {
      console.error('SSE Error:', err);
      setIsConnected(false);
      eventSource.close();
      // Reconnection logic could be added here
      setTimeout(() => {
         if (typeof window !== 'undefined') {
           // Basic reconnection attempt by re-mounting or just relying on browser
           // In React, better to handle via a ref or recursive function, but EventSource auto-reconnects natively
         }
      }, 5000);
    };

    return () => {
      eventSource.close();
    };
  }, [effectiveUserId]);

  const handleCopy = () => {
    if (!webhookUrl) return;
    navigator.clipboard.writeText(webhookUrl);
    setCopied(true);
    toast({ title: 'URL copiada para a área de transferência!' });
    setTimeout(() => setCopied(false), 2000);
  };

  const clearLogs = async () => {
    if (!effectiveUserId) return;
    try {
      await fetch(`/api/webhook-receiver/${effectiveUserId}`, { method: 'DELETE' });
      setLogs([]);
      toast({ title: 'Logs limpos com sucesso.' });
    } catch (e) {
      toast({ variant: 'destructive', title: 'Erro ao limpar logs' });
    }
  };

  return (
    <div className="flex-1 space-y-4 p-4 md:p-8 pt-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between space-y-2 sm:space-y-0">
        <h2 className="text-3xl font-bold tracking-tight">Receber Webhook</h2>
        <div className="flex items-center space-x-2">
          <Badge variant={isConnected ? 'default' : 'destructive'} className={isConnected ? 'bg-green-600' : ''}>
            {isConnected ? 'Escutando...' : 'Desconectado'}
            {isConnected && <Loader2 className="ml-2 h-3 w-3 animate-spin inline" />}
          </Badge>
          <Button variant="outline" onClick={clearLogs} disabled={logs.length === 0}>
            <Trash2 className="mr-2 h-4 w-4" />
            Limpar
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-1">
        <Card>
          <CardHeader>
            <CardTitle className="text-xl flex items-center gap-2">
              <Webhook className="h-5 w-5 text-primary" />
              Sua URL de Webhook
            </CardTitle>
            <CardDescription>
              Envie requisições POST para este endereço. Os dados aparecerão abaixo em tempo real.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center space-x-2">
              <code className="relative rounded bg-muted px-[0.3rem] py-[0.2rem] font-mono text-sm font-semibold text-primary flex-1 truncate">
                {webhookUrl || 'Carregando URL...'}
              </code>
              <Button size="sm" onClick={handleCopy}>
                {copied ? <CheckCircle2 className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className="col-span-1">
          <CardHeader>
            <CardTitle>Requisições Recebidas ({logs.length})</CardTitle>
            <CardDescription>Visualização em tempo real das cargas úteis recebidas.</CardDescription>
          </CardHeader>
          <CardContent>
            {logs.length === 0 ? (
              <div className="flex flex-col items-center justify-center p-8 text-center text-muted-foreground bg-muted/20 border border-dashed rounded-lg">
                <Webhook className="h-10 w-10 mb-4 opacity-50" />
                <p>Nenhuma requisição recebida ainda.</p>
                <p className="text-sm">Envie um POST para a URL acima para começar.</p>
              </div>
            ) : (
              <ScrollArea className="h-[600px] rounded-md border p-4">
                <div className="space-y-4">
                  {logs.map((log) => (
                    <Card key={log.id} className="overflow-hidden">
                      <div className="flex items-center justify-between p-3 bg-muted/50 border-b">
                        <div className="flex items-center space-x-2">
                          <Badge variant="outline" className="font-mono">{log.method}</Badge>
                          <span className="text-xs text-muted-foreground flex items-center">
                            <Clock className="mr-1 h-3 w-3" />
                            {new Date(log.timestamp).toLocaleString()}
                          </span>
                        </div>
                        <span className="text-xs text-muted-foreground flex items-center">
                           <Globe className="mr-1 h-3 w-3" />
                           {log.ip}
                        </span>
                      </div>
                      <div className="p-4 grid gap-4 grid-cols-1 lg:grid-cols-2">
                        <div>
                          <h4 className="text-sm font-semibold mb-2">Body (Payload)</h4>
                          <pre className="bg-slate-950 text-slate-50 rounded-md p-3 text-xs overflow-auto max-h-[300px]">
                            {log.body ? JSON.stringify(log.body, null, 2) : 'No body content'}
                          </pre>
                        </div>
                        <div>
                          <h4 className="text-sm font-semibold mb-2">Headers</h4>
                          <pre className="bg-slate-100 dark:bg-slate-900 border rounded-md p-3 text-xs overflow-auto max-h-[300px]">
                            {JSON.stringify(log.headers, null, 2)}
                          </pre>
                        </div>
                      </div>
                    </Card>
                  ))}
                </div>
              </ScrollArea>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
