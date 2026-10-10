'use client';

import React, { useState } from 'react';
import { doc } from 'firebase/firestore';
import { useFirebase, useDoc, useMemoFirebase } from '@/firebase';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { PageHeader } from '@/components/page-header';
import { Badge } from '@/components/ui/badge';
import { 
  Send, 
  Smartphone, 
  MessageSquare, 
  AlertTriangle, 
  Loader2, 
  CheckCircle, 
  HelpCircle, 
  ArrowLeft,
  Bug,
  Copy,
  Check,
  Trash2,
  Clock,
  Activity,
  Info,
  Key,
} from 'lucide-react';
import Link from 'next/link';
import type { Settings } from '@/lib/types';

interface DebugResult {
  timestamp: string;
  sentPayload: {
    number: string;
    originalPhone: string;
    messageLength: number;
    messagePreview: string;
    tokenMask: string;
  };
  httpStatus: number;
  success: boolean;
  error?: string;
  responseData: any;
}

export default function SendMessagePage() {
  const { firestore, effectiveUserId } = useFirebase();
  const { toast } = useToast();

  const [phone, setPhone] = useState('');
  const [message, setMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [phoneWarning, setPhoneWarning] = useState(false);
  const [copiedDebug, setCopiedDebug] = useState(false);
  const [lastDebugResult, setLastDebugResult] = useState<DebugResult | null>(null);

  // Fetch settings to get webhookToken
  const settingsDocRef = useMemoFirebase(() => {
    if (!effectiveUserId) return null;
    return doc(firestore, 'users', effectiveUserId, 'settings', 'config');
  }, [firestore, effectiveUserId]);

  const { data: settings, isLoading: isLoadingSettings } = useDoc<Settings>(settingsDocRef);

  // Handle phone changes to detect if user typed +55 or 55
  const handlePhoneChange = (value: string) => {
    const digitsOnly = value.replace(/\D/g, '');
    
    // Warning if it starts with 55 and is long (e.g. 55 + DDD + 9 digits = 12/13 digits)
    if (digitsOnly.startsWith('55') && digitsOnly.length >= 12) {
      setPhoneWarning(true);
    } else {
      setPhoneWarning(false);
    }
    
    setPhone(value);
  };

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!phone.trim()) {
      toast({
        variant: 'destructive',
        title: 'Número obrigatório',
        description: 'Por favor, insira o número de telefone do destinatário.',
      });
      return;
    }

    if (!message.trim()) {
      toast({
        variant: 'destructive',
        title: 'Mensagem obrigatória',
        description: 'Por favor, digite a mensagem a ser enviada.',
      });
      return;
    }

    if (!settings?.webhookToken) {
      toast({
        variant: 'destructive',
        title: 'Token não configurado',
        description: 'Por favor, configure seu token de webhook na página de Configurações.',
      });
      return;
    }

    setIsLoading(true);

    // Clean up phone number if it has prefix to match the API expectation
    let cleanedPhone = phone.replace(/\D/g, '');
    
    // If it starts with 55, remove it because the API route will prepend +55
    if (cleanedPhone.startsWith('55') && cleanedPhone.length >= 12) {
      cleanedPhone = cleanedPhone.substring(2);
    }

    const currentToken = settings.webhookToken || '';
    const tokenMask = currentToken.length > 12 
      ? `${currentToken.slice(0, 8)}••••••••${currentToken.slice(-4)}`
      : 'Token curto';

    const sentPayload = {
      number: cleanedPhone,
      originalPhone: phone,
      messageLength: message.length,
      messagePreview: message,
      tokenMask,
    };

    try {
      const response = await fetch('/api/send-message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: message,
          phoneNumber: cleanedPhone,
          token: settings.webhookToken,
        }),
      });

      const responseData = await response.json().catch(() => ({ error: 'Resposta não é JSON' }));

      const debugInfo: DebugResult = {
        timestamp: new Date().toLocaleTimeString('pt-BR'),
        sentPayload,
        httpStatus: response.status,
        success: response.ok && responseData?.success !== false,
        error: !response.ok ? (responseData?.error || 'Erro na resposta da API') : undefined,
        responseData,
      };

      setLastDebugResult(debugInfo);

      if (!response.ok) {
        throw new Error(responseData.error || 'Falha ao enviar mensagem.');
      }

      toast({
        title: 'Mensagem Processada!',
        description: 'A requisição foi aceita pela UAZAPI. Veja os detalhes no painel de DEBUG abaixo.',
      });

      setPhoneWarning(false);

    } catch (error: any) {
      console.error('Failed to send message:', error);
      toast({
        variant: 'destructive',
        title: 'Erro ao Enviar',
        description: error.message || 'Não foi possível enviar a mensagem.',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleCopyDebug = () => {
    if (!lastDebugResult) return;
    navigator.clipboard.writeText(JSON.stringify(lastDebugResult, null, 2));
    setCopiedDebug(true);
    toast({ title: 'JSON de Debug copiado!' });
    setTimeout(() => setCopiedDebug(false), 2000);
  };

  const isTokenConfigured = !!settings?.webhookToken;

  return (
    <div className="flex flex-col h-full w-full bg-background">
      <PageHeader title="Enviar Mensagem Avulsa">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" asChild className="gap-1">
            <Link href="/customers">
              <ArrowLeft className="h-4 w-4" /> Voltar para Clientes
            </Link>
          </Button>
          {isLoadingSettings ? (
            <Badge variant="outline" className="animate-pulse">
              Verificando Status...
            </Badge>
          ) : isTokenConfigured ? (
            <Badge className="bg-emerald-500/20 text-emerald-700 dark:text-emerald-400 border-none font-semibold">
              <CheckCircle className="h-3 w-3 mr-1 inline" /> Canal de Envio Pronto
            </Badge>
          ) : (
            <Badge variant="destructive" className="animate-bounce">
              <AlertTriangle className="h-3 w-3 mr-1 inline" /> Token Não Configurado
            </Badge>
          )}
        </div>
      </PageHeader>

      <main className="flex-1 overflow-auto p-4 md:p-8 pt-6 max-w-5xl mx-auto w-full space-y-6">
        {!isLoadingSettings && !isTokenConfigured && (
          <Card className="border-destructive/50 bg-destructive/5 animate-in fade-in slide-in-from-top-4 duration-300">
            <CardHeader className="pb-3">
              <CardTitle className="text-destructive flex items-center gap-2 text-lg">
                <AlertTriangle className="h-5 w-5" />
                Configuração Pendente
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Para enviar mensagens, você precisa configurar o seu <strong>Token do n8n</strong> nas configurações do sistema. Sem ele, a API de disparo não consegue autenticar com o seu WhatsApp.
              </p>
            </CardContent>
            <CardFooter>
              <Button variant="destructive" size="sm" asChild>
                <Link href="/settings">Configurar Token Agora</Link>
              </Button>
            </CardFooter>
          </Card>
        )}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Main Form Panel & DEBUG Panel */}
          <div className="md:col-span-2 space-y-6">
            <Card className="shadow-xl border border-muted-foreground/10 hover:border-muted-foreground/20 transition-all duration-300">
              <CardHeader className="bg-gradient-to-r from-primary/5 via-transparent to-transparent pb-6">
                <CardTitle className="flex items-center gap-2 text-xl font-bold">
                  <MessageSquare className="h-5 w-5 text-primary" />
                  Nova Mensagem Direta
                </CardTitle>
                <CardDescription>
                  Envie uma mensagem de WhatsApp para qualquer número de forma rápida e avulsa.
                </CardDescription>
              </CardHeader>
              
              <form onSubmit={handleSend}>
                <CardContent className="space-y-6 pt-4">
                  {/* Phone input group */}
                  <div className="space-y-2">
                    <Label htmlFor="phone-number" className="text-sm font-semibold flex items-center gap-1">
                      <Smartphone className="h-4 w-4 text-muted-foreground" />
                      Telefone do Destinatário *
                    </Label>
                    <Input
                      id="phone-number"
                      type="text"
                      placeholder="Ex: 11999998888 (Apenas DDD e número)"
                      value={phone}
                      onChange={(e) => handlePhoneChange(e.target.value)}
                      disabled={isLoading || !isTokenConfigured}
                      className="h-11 text-base tracking-wide font-mono"
                    />
                    
                    {phoneWarning ? (
                      <p className="text-xs text-amber-600 flex items-center gap-1 mt-1 font-medium animate-pulse">
                        <AlertTriangle className="h-3 w-3" />
                        Identificamos o prefixo "55". Ele será removido automaticamente no disparo.
                      </p>
                    ) : (
                      <p className="text-[11px] text-muted-foreground flex items-center gap-1 mt-1">
                        <HelpCircle className="h-3 w-3" />
                        Não é necessário colocar o código do país (+55). Insira apenas o DDD + número.
                      </p>
                    )}
                  </div>

                  {/* Message input group */}
                  <div className="space-y-2">
                    <Label htmlFor="message-body" className="text-sm font-semibold flex items-center gap-1">
                      <MessageSquare className="h-4 w-4 text-muted-foreground" />
                      Sua Mensagem *
                    </Label>
                    <Textarea
                      id="message-body"
                      placeholder="Digite aqui o texto que deseja enviar..."
                      value={message}
                      onChange={(e) => setMessage(e.target.value)}
                      disabled={isLoading || !isTokenConfigured}
                      className="min-h-[160px] text-base leading-relaxed p-4"
                    />
                    <div className="flex justify-between items-center mt-1">
                      <span className="text-[10px] text-muted-foreground">
                        Nota: Quebras de linha são suportadas. Tags automáticas como {"{cliente}"} não funcionam no envio avulso.
                      </span>
                      <span className="text-[11px] font-mono text-muted-foreground">
                        {message.length} caracteres
                      </span>
                    </div>
                  </div>
                </CardContent>

                <CardFooter className="border-t border-muted/50 bg-muted/20 p-6 flex justify-end gap-3 rounded-b-lg">
                  <Button 
                    type="button" 
                    variant="ghost" 
                    onClick={() => { setPhone(''); setMessage(''); setPhoneWarning(false); }}
                    disabled={isLoading || (!phone && !message)}
                  >
                    Limpar Campos
                  </Button>
                  <Button 
                    type="submit" 
                    disabled={isLoading || !isTokenConfigured || !phone.trim() || !message.trim()}
                    className="px-6 h-11 font-semibold gap-2 transition-transform active:scale-95"
                  >
                    {isLoading ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Enviando...
                      </>
                    ) : (
                      <>
                        <Send className="h-4 w-4" />
                        Enviar Agora
                      </>
                    )}
                  </Button>
                </CardFooter>
              </form>
            </Card>

            {/* PAINEL DE DEBUG EM TEMPO REAL */}
            <Card className="border-2 border-primary/20 shadow-xl overflow-hidden">
              <CardHeader className="bg-muted/40 pb-3 border-b">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <div className="p-1.5 rounded-md bg-primary/10 text-primary">
                      <Bug className="h-5 w-5" />
                    </div>
                    <div>
                      <CardTitle className="text-base font-bold flex items-center gap-2">
                        Retorno da API & DEBUG
                        {lastDebugResult && (
                          <Badge 
                            variant={lastDebugResult.success ? "default" : "destructive"} 
                            className={lastDebugResult.success ? "bg-emerald-600 hover:bg-emerald-700 text-white font-mono text-xs" : "font-mono text-xs"}
                          >
                            HTTP {lastDebugResult.httpStatus} {lastDebugResult.success ? 'OK' : 'ERRO'}
                          </Badge>
                        )}
                      </CardTitle>
                      <CardDescription className="text-xs">
                        Veja em tempo real exatamente o que o servidor do WhatsApp (UAZAPI) respondeu.
                      </CardDescription>
                    </div>
                  </div>

                  {lastDebugResult && (
                    <div className="flex items-center gap-2">
                      <Button 
                        variant="outline" 
                        size="sm" 
                        onClick={handleCopyDebug}
                        className="h-8 text-xs gap-1.5"
                      >
                        {copiedDebug ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
                        Copiar JSON
                      </Button>
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        onClick={() => setLastDebugResult(null)}
                        className="h-8 text-xs gap-1.5 text-muted-foreground hover:text-destructive"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        Limpar
                      </Button>
                    </div>
                  )}
                </div>
              </CardHeader>

              <CardContent className="p-4 sm:p-5 space-y-4">
                {!lastDebugResult ? (
                  <div className="flex flex-col items-center justify-center text-center p-8 border border-dashed rounded-xl bg-muted/10 text-muted-foreground">
                    <Activity className="h-8 w-8 text-muted-foreground/40 mb-2 animate-pulse" />
                    <p className="text-sm font-medium text-foreground">Nenhum envio registrado nesta sessão</p>
                    <p className="text-xs max-w-md mt-1">
                      Preencha o número e mensagem acima e clique em <strong>"Enviar Agora"</strong>. O payload e a resposta detalhada da UAZAPI aparecerão aqui instantaneamente.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-4 animate-in fade-in duration-300">
                    {/* Sumário de métricas */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div className="p-3 rounded-xl border bg-muted/30">
                        <span className="text-[11px] font-semibold text-muted-foreground flex items-center gap-1.5">
                          <Clock className="h-3.5 w-3.5 text-primary" /> Horário
                        </span>
                        <span className="text-xs font-mono font-bold mt-1 block">
                          {lastDebugResult.timestamp}
                        </span>
                      </div>

                      <div className="p-3 rounded-xl border bg-muted/30">
                        <span className="text-[11px] font-semibold text-muted-foreground flex items-center gap-1.5">
                          <Smartphone className="h-3.5 w-3.5 text-primary" /> Destino Formatado
                        </span>
                        <span className="text-xs font-mono font-bold mt-1 block truncate">
                          {lastDebugResult.responseData?.formattedPhoneNumber || lastDebugResult.sentPayload?.number || 'N/A'}
                        </span>
                      </div>

                      <div className="p-3 rounded-xl border bg-muted/30">
                        <span className="text-[11px] font-semibold text-muted-foreground flex items-center gap-1.5">
                          <Key className="h-3.5 w-3.5 text-primary" /> Token Utilizado
                        </span>
                        <span className="text-[11px] font-mono font-semibold mt-1 block truncate">
                          {lastDebugResult.sentPayload?.tokenMask || 'Configurado'}
                        </span>
                      </div>
                    </div>

                    {/* Alerta de Diagnóstico se status for Pending ou Erro */}
                    {lastDebugResult.success && (
                      <div className="p-3.5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 text-emerald-950 dark:text-emerald-200 text-xs flex items-start gap-2.5">
                        <Info className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                        <div>
                          <p className="font-bold">Requisição aceita com sucesso pela API (HTTP {lastDebugResult.httpStatus})!</p>
                          <p className="mt-0.5 text-[11px] opacity-90 leading-relaxed">
                            {lastDebugResult.responseData?.data?.status === 'Pending' || lastDebugResult.responseData?.rawResponse?.status === 'Pending' ? (
                              <>A mensagem entrou na <strong>Fila de Saída (Pending)</strong> da UAZAPI. Se o WhatsApp de destino demorar a receber, verifique se o celular que conectou o QR Code está com o WhatsApp aberto/desbloqueado e conectado à internet.</>
                            ) : (
                              <>ID da Mensagem: <code className="font-mono bg-black/10 px-1 py-0.5 rounded">{lastDebugResult.responseData?.data?.messageid || lastDebugResult.responseData?.data?.id || 'Gerado'}</code></>
                            )}
                          </p>
                        </div>
                      </div>
                    )}

                    {!lastDebugResult.success && (
                      <div className="p-3.5 rounded-xl border border-destructive/30 bg-destructive/10 text-destructive text-xs flex items-start gap-2.5">
                        <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                        <div>
                          <p className="font-bold">A API da UAZAPI recusou o disparo (HTTP {lastDebugResult.httpStatus}):</p>
                          <p className="mt-0.5 text-[11px] font-mono leading-relaxed">
                            {lastDebugResult.error || JSON.stringify(lastDebugResult.responseData)}
                          </p>
                        </div>
                      </div>
                    )}

                    {/* Resposta JSON Bruta */}
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between text-xs font-semibold text-muted-foreground">
                        <span>JSON de Resposta da UAZAPI:</span>
                        <span className="text-[10px] font-mono">{lastDebugResult.timestamp}</span>
                      </div>
                      <pre className="p-3.5 bg-zinc-950 text-emerald-400 font-mono text-xs rounded-xl overflow-x-auto max-h-72 border border-zinc-800 shadow-inner">
                        {JSON.stringify(lastDebugResult.responseData, null, 2)}
                      </pre>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Quick tips panel */}
          <div className="space-y-6">
            <Card className="shadow-lg border border-primary/10">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-bold uppercase tracking-wider text-primary">
                  Dicas e Boas Práticas
                </CardTitle>
              </CardHeader>
              <CardContent className="text-xs space-y-4 text-muted-foreground leading-relaxed">
                <div className="p-3 bg-primary/5 rounded-lg border border-primary/10">
                  <p className="font-semibold text-foreground mb-1">Formato do Número</p>
                  <p>Certifique-se de digitar sempre o DDD e o número completo. Exemplo: <strong>11999998888</strong>. Evite usar parênteses ou traços.</p>
                </div>
                <div className="p-3 bg-primary/5 rounded-lg border border-primary/10">
                  <p className="font-semibold text-foreground mb-1">Status de Conexão</p>
                  <p>Assegure-se de que o **Hub Principal** no menu lateral está com a bolinha verde acesa (Conectado). Se estiver vermelho, reconecte seu aparelho.</p>
                </div>
                <div className="p-3 bg-primary/5 rounded-lg border border-primary/10">
                  <p className="font-semibold text-foreground mb-1">Evite Bloqueios</p>
                  <p>Não envie mensagens em massa excessivas para números que não têm o seu contato salvo para evitar spam e suspensão da linha.</p>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </main>
    </div>
  );
}
