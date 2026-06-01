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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Send, 
  Smartphone, 
  MessageSquare, 
  AlertTriangle, 
  Loader2, 
  CheckCircle,
  HelpCircle,
  ArrowLeft,
  KeyRound,
  Code2,
  Copy,
  Zap
} from 'lucide-react';
import Link from 'next/link';
import type { Settings } from '@/lib/types';

export default function SendMessagePage() {
  const { firestore, effectiveUserId } = useFirebase();
  const { toast } = useToast();

  // General States
  const [phone, setPhone] = useState('');
  const [message, setMessage] = useState('');
  const [twoFactorCode, setTwoFactorCode] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [phoneWarning, setPhoneWarning] = useState(false);

  // Fetch settings to get webhookToken
  const settingsDocRef = useMemoFirebase(() => {
    if (!effectiveUserId) return null;
    return doc(firestore, 'users', effectiveUserId, 'settings', 'config');
  }, [firestore, effectiveUserId]);

  const { data: settings, isLoading: isLoadingSettings } = useDoc<Settings>(settingsDocRef);

  // Clean phone helper
  const cleanPhone = (rawPhone: string) => {
    let cleaned = rawPhone.replace(/\D/g, '');
    if (cleaned.startsWith('55') && cleaned.length >= 12) {
      cleaned = cleaned.substring(2);
    }
    return cleaned;
  };

  // Handle phone changes to detect if user typed +55 or 55
  const handlePhoneChange = (value: string) => {
    const digitsOnly = value.replace(/\D/g, '');
    if (digitsOnly.startsWith('55') && digitsOnly.length >= 12) {
      setPhoneWarning(true);
    } else {
      setPhoneWarning(false);
    }
    setPhone(value);
  };

  const handleCopyWebhookUrl = () => {
    if (typeof window !== 'undefined') {
      const baseUrl = window.location.origin;
      const fullUrl = `${baseUrl}/api/webhook-receiver/${effectiveUserId}`;
      navigator.clipboard.writeText(fullUrl);
      toast({
        title: 'Copiado!',
        description: 'URL do Webhook copiada para a área de transferência.',
      });
    }
  };

  // Send Message logic
  const handleSend = async (type: 'manual_2fa' | 'free_text') => {
    if (!phone.trim()) {
      toast({
        variant: 'destructive',
        title: 'Número obrigatório',
        description: 'Por favor, insira o número de telefone do destinatário.',
      });
      return;
    }

    let finalMessage = '';
    if (type === 'manual_2fa') {
      if (!twoFactorCode.trim()) {
        toast({
          variant: 'destructive',
          title: 'Código obrigatório',
          description: 'Por favor, insira o código de 2 fatores.',
        });
        return;
      }
      finalMessage = `🔒 *Código de Acesso*\n\nSeu código de verificação é: *${twoFactorCode}*\n\nInsira este código na tela de login para prosseguir.`;
    } else {
      if (!message.trim()) {
        toast({
          variant: 'destructive',
          title: 'Mensagem obrigatória',
          description: 'Por favor, digite a mensagem a ser enviada.',
        });
        return;
      }
      finalMessage = message;
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
    const cleanedPhone = cleanPhone(phone);

    try {
      const response = await fetch('/api/send-message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: finalMessage,
          phoneNumber: cleanedPhone,
          token: settings.webhookToken,
        }),
      });

      const responseData = await response.json();

      if (!response.ok) {
        throw new Error(responseData.error || 'Falha ao enviar mensagem.');
      }

      toast({
        title: 'Mensagem Enviada!',
        description: type === 'manual_2fa' ? 'Código 2FA enviado com sucesso.' : 'Sua mensagem foi entregue com sucesso.',
      });

      // Clear the message fields, keeping phone
      setMessage('');
      setTwoFactorCode('');
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

  const isTokenConfigured = !!settings?.webhookToken;

  return (
    <div className="flex flex-col h-full w-full bg-background">
      <PageHeader title="Enviar Mensagem / 2 Fatores">
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
              <CheckCircle className="h-3 w-3 mr-1 inline animate-pulse" /> Canal de Envio Pronto
            </Badge>
          ) : (
            <Badge variant="destructive" className="animate-bounce">
              <AlertTriangle className="h-3 w-3 mr-1 inline" /> Token Não Configurado
            </Badge>
          )}
        </div>
      </PageHeader>

      <main className="flex-1 overflow-auto p-4 md:p-8 pt-6 max-w-4xl mx-auto w-full">
        {!isLoadingSettings && !isTokenConfigured && (
          <Card className="border-destructive/50 bg-destructive/5 mb-6 animate-in fade-in slide-in-from-top-4 duration-300">
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

        <Tabs defaultValue="auto_2fa" className="w-full">
          <TabsList className="grid w-full grid-cols-3 mb-6 bg-muted p-1 rounded-lg">
            <TabsTrigger value="auto_2fa" className="flex items-center gap-1.5 py-2.5 font-semibold text-sm">
              <Zap className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
              Automação 2FA (Site)
            </TabsTrigger>
            <TabsTrigger value="manual_2fa" className="flex items-center gap-1.5 py-2.5 font-semibold text-sm">
              <KeyRound className="h-4 w-4 text-violet-600 dark:text-violet-400" />
              Manual 2FA
            </TabsTrigger>
            <TabsTrigger value="free_text" className="flex items-center gap-1.5 py-2.5 font-semibold text-sm">
              <MessageSquare className="h-4 w-4 text-blue-600 dark:text-blue-400" />
              Mensagem Livre
            </TabsTrigger>
          </TabsList>

          {/* Automação 2FA Instruction Tab */}
          <TabsContent value="auto_2fa" className="space-y-6">
            <Card className="shadow-xl border border-muted-foreground/10">
              <CardHeader className="bg-gradient-to-r from-emerald-500/5 via-transparent to-transparent pb-6">
                <CardTitle className="flex items-center gap-2 text-xl font-bold text-emerald-700 dark:text-emerald-400">
                  <Zap className="h-5 w-5" />
                  Integração 2FA Automática
                </CardTitle>
                <CardDescription>
                  Configure seu site de vendas para enviar os códigos de 2 fatores automaticamente para o WhatsApp do cliente.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6 pt-4">
                <div className="space-y-2">
                  <Label className="text-sm font-semibold text-foreground">Sua URL do Webhook do CRM</Label>
                  <div className="flex gap-2">
                    <Input
                      readOnly
                      value={typeof window !== 'undefined' ? `${window.location.origin}/api/webhook-receiver/${effectiveUserId}` : `Carregando URL...`}
                      className="flex-1 font-mono text-xs bg-muted"
                    />
                    <Button onClick={handleCopyWebhookUrl} variant="outline" className="gap-1.5">
                      <Copy className="h-4 w-4" />
                      Copiar URL
                    </Button>
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    Esta é a URL que o seu site de vendas deve chamar via requisição HTTP POST quando gerar um código 2FA.
                  </p>
                </div>

                <div className="space-y-3">
                  <Label className="text-sm font-semibold text-foreground">Formato de Payload Exigido (JSON)</Label>
                  <pre className="p-4 bg-muted rounded-lg font-mono text-xs overflow-x-auto text-emerald-800 dark:text-emerald-400 border border-muted-foreground/10">
{`{
  "Conteudo": "2fatores",
  "NumeroCliente": "11999998888",
  "codigofa": "123456"
}`}
                  </pre>
                </div>

                <div className="p-4 bg-primary/5 rounded-lg border border-primary/10 text-xs space-y-2 leading-relaxed">
                  <p className="font-bold text-foreground flex items-center gap-1.5">
                    <CheckCircle className="h-4 w-4 text-emerald-600" />
                    Como funciona em segundo plano:
                  </p>
                  <ol className="list-decimal pl-5 space-y-1 text-muted-foreground">
                    <li>O usuário tenta fazer login no seu site de vendas.</li>
                    <li>O seu site gera o código e envia um POST para a URL acima com os dados informados.</li>
                    <li>O CRM recebe os dados, valida o payload e instantaneamente dispara a mensagem de WhatsApp formatada com o código para o cliente!</li>
                  </ol>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Manual 2FA Send Tab */}
          <TabsContent value="manual_2fa">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <Card className="md:col-span-2 shadow-xl border border-muted-foreground/10 hover:border-muted-foreground/20 transition-all duration-300">
                <CardHeader className="bg-gradient-to-r from-violet-500/5 via-transparent to-transparent pb-6">
                  <CardTitle className="flex items-center gap-2 text-xl font-bold text-violet-700 dark:text-violet-400">
                    <KeyRound className="h-5 w-5" />
                    Envio Manual de 2FA
                  </CardTitle>
                  <CardDescription>
                    Digite o telefone e o código para gerar a mensagem padrão de 2 fatores.
                  </CardDescription>
                </CardHeader>
                
                <CardContent className="space-y-6 pt-4">
                  <div className="space-y-2">
                    <Label htmlFor="phone-number-2fa" className="text-sm font-semibold flex items-center gap-1">
                      <Smartphone className="h-4 w-4 text-muted-foreground" />
                      Telefone do Cliente *
                    </Label>
                    <Input
                      id="phone-number-2fa"
                      type="text"
                      placeholder="Ex: 11999998888 (Apenas DDD e número)"
                      value={phone}
                      onChange={(e) => handlePhoneChange(e.target.value)}
                      disabled={isLoading || !isTokenConfigured}
                      className="h-11 text-base tracking-wide"
                    />
                    {phoneWarning && (
                      <p className="text-xs text-amber-600 flex items-center gap-1 mt-1 font-medium animate-pulse">
                        <AlertTriangle className="h-3 w-3" />
                        Prefixo "55" detectado. Será removido automaticamente no envio.
                      </p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="2fa-code" className="text-sm font-semibold flex items-center gap-1">
                      <Code2 className="h-4 w-4 text-muted-foreground" />
                      Código de 2 Fatores *
                    </Label>
                    <Input
                      id="2fa-code"
                      type="text"
                      maxLength={12}
                      placeholder="Ex: 123456"
                      value={twoFactorCode}
                      onChange={(e) => setTwoFactorCode(e.target.value)}
                      disabled={isLoading || !isTokenConfigured}
                      className="h-11 text-base font-mono tracking-widest text-center"
                    />
                  </div>

                  {twoFactorCode.trim() && (
                    <div className="p-3 bg-muted rounded-lg border border-dashed border-muted-foreground/30 text-xs">
                      <p className="font-semibold text-muted-foreground mb-1">Visualização do Disparo:</p>
                      <p className="text-foreground whitespace-pre-line font-serif leading-relaxed">
{`🔒 *Código de Acesso*

Seu código de verificação é: *${twoFactorCode}*

Insira este código na tela de login para prosseguir.`}
                      </p>
                    </div>
                  )}
                </CardContent>

                <CardFooter className="border-t border-muted/50 bg-muted/20 p-6 flex justify-end gap-3 rounded-b-lg">
                  <Button 
                    type="button" 
                    variant="ghost" 
                    onClick={() => { setPhone(''); setTwoFactorCode(''); setPhoneWarning(false); }}
                    disabled={isLoading || (!phone && !twoFactorCode)}
                  >
                    Limpar Campos
                  </Button>
                  <Button 
                    onClick={() => handleSend('manual_2fa')} 
                    disabled={isLoading || !isTokenConfigured || !phone.trim() || !twoFactorCode.trim()}
                    className="px-6 h-11 font-semibold gap-2 transition-transform active:scale-95 bg-violet-600 hover:bg-violet-700 text-white border-none"
                  >
                    {isLoading ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Enviando...
                      </>
                    ) : (
                      <>
                        <Send className="h-4 w-4" />
                        Enviar Código
                      </>
                    )}
                  </Button>
                </CardFooter>
              </Card>

              {/* Quick tips for 2FA */}
              <div className="space-y-6">
                <Card className="shadow-lg border border-violet-500/10">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-bold uppercase tracking-wider text-violet-700 dark:text-violet-400">
                      Informações
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="text-xs space-y-4 text-muted-foreground leading-relaxed">
                    <div className="p-3 bg-violet-500/5 rounded-lg border border-violet-500/10">
                      <p className="font-semibold text-foreground mb-1">Segurança</p>
                      <p>Esse código deve ser compartilhado apenas com o proprietário do número. Nunca divulgue dados confidenciais.</p>
                    </div>
                    <div className="p-3 bg-violet-500/5 rounded-lg border border-violet-500/10">
                      <p className="font-semibold text-foreground mb-1">Padrão de Mensagem</p>
                      <p>O layout gerado utiliza emojis e negritos adequados ao WhatsApp, garantindo legibilidade e rapidez de leitura para o usuário final.</p>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>
          </TabsContent>

          {/* Free Text Message Tab */}
          <TabsContent value="free_text">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <Card className="md:col-span-2 shadow-xl border border-muted-foreground/10 hover:border-muted-foreground/20 transition-all duration-300">
                <CardHeader className="bg-gradient-to-r from-blue-500/5 via-transparent to-transparent pb-6">
                  <CardTitle className="flex items-center gap-2 text-xl font-bold text-blue-700 dark:text-blue-400">
                    <MessageSquare className="h-5 w-5" />
                    Nova Mensagem Direta
                  </CardTitle>
                  <CardDescription>
                    Envie uma mensagem de WhatsApp para qualquer número de forma rápida e avulsa.
                  </CardDescription>
                </CardHeader>
                
                <CardContent className="space-y-6 pt-4">
                  <div className="space-y-2">
                    <Label htmlFor="phone-number-free" className="text-sm font-semibold flex items-center gap-1">
                      <Smartphone className="h-4 w-4 text-muted-foreground" />
                      Telefone do Destinatário *
                    </Label>
                    <Input
                      id="phone-number-free"
                      type="text"
                      placeholder="Ex: 11999998888 (Apenas DDD e número)"
                      value={phone}
                      onChange={(e) => handlePhoneChange(e.target.value)}
                      disabled={isLoading || !isTokenConfigured}
                      className="h-11 text-base tracking-wide"
                    />
                    {phoneWarning && (
                      <p className="text-xs text-amber-600 flex items-center gap-1 mt-1 font-medium animate-pulse">
                        <AlertTriangle className="h-3 w-3" />
                        Prefixo "55" detectado. Será removido automaticamente no disparo.
                      </p>
                    )}
                  </div>

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
                        Nota: Quebras de linha são suportadas. Tags automáticas não funcionam.
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
                    onClick={() => handleSend('free_text')} 
                    disabled={isLoading || !isTokenConfigured || !phone.trim() || !message.trim()}
                    className="px-6 h-11 font-semibold gap-2 transition-transform active:scale-95 bg-blue-600 hover:bg-blue-700 text-white border-none"
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
              </Card>

              {/* Quick tips for free text */}
              <div className="space-y-6">
                <Card className="shadow-lg border border-blue-500/10">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-bold uppercase tracking-wider text-blue-700 dark:text-blue-400">
                      Boas Práticas
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="text-xs space-y-4 text-muted-foreground leading-relaxed">
                    <div className="p-3 bg-blue-500/5 rounded-lg border border-blue-500/10">
                      <p className="font-semibold text-foreground mb-1">Status de Conexão</p>
                      <p>Assegure-se de que o **Hub Principal** está verde. Se estiver desconectado, a API falhará.</p>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
