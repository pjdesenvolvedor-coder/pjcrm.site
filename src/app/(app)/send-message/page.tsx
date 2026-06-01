'use client';

import React, { useState, useEffect } from 'react';
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
  ArrowLeft
} from 'lucide-react';
import Link from 'next/link';
import type { Settings } from '@/lib/types';

export default function SendMessagePage() {
  const { firestore, effectiveUserId } = useFirebase();
  const { toast } = useToast();

  const [phone, setPhone] = useState('');
  const [message, setMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [phoneWarning, setPhoneWarning] = useState(false);

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

      const responseData = await response.json();

      if (!response.ok) {
        throw new Error(responseData.error || 'Falha ao enviar mensagem.');
      }

      toast({
        title: 'Mensagem Enviada!',
        description: 'Sua mensagem foi entregue com sucesso.',
      });

      // Clear the message field, keeping the phone in case they want to send another one
      setMessage('');
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

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Main Form Panel */}
          <Card className="md:col-span-2 shadow-xl border border-muted-foreground/10 hover:border-muted-foreground/20 transition-all duration-300">
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
                    className="h-11 text-base tracking-wide"
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
