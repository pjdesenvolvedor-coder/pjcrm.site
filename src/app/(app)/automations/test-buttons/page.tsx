'use client';

import React, { useState } from 'react';
import { useFirebase, useDoc, useMemoFirebase } from '@/firebase';
import { doc } from 'firebase/firestore';
import type { Settings } from '@/lib/types';
import { PageHeader } from '@/components/page-header';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { Send, Plus, Trash2, ImageIcon, Terminal, CheckCircle2, AlertTriangle, RefreshCw } from 'lucide-react';

interface TestButton {
  id: string;
  label: string;
  url: string;
}

export default function TestButtonsPage() {
  const { firestore, user } = useFirebase();
  const { toast } = useToast();

  const settingsDocRef = useMemoFirebase(() => {
    if (!user || !firestore) return null;
    return doc(firestore, 'users', user.uid, 'settings', 'config');
  }, [firestore, user]);

  const { data: settings } = useDoc<Settings>(settingsDocRef);

  const [phone, setPhone] = useState('');
  const [imageUrl, setImageUrl] = useState('https://i.imgur.com/l8StCRM.jpeg');
  const [messageText, setMessageText] = useState(
    '🚀 ASSINATURAS PREMIUM COM ENTREGA AUTOMÁTICA!\n\n✅ Entrega imediata após a compra\n🛡️ Suporte por 30 dias\n🔒 Contas seguras e testadas\n🎬 Netflix, Disney+, HBO Max, Prime Video, Globoplay, Telecine e muito mais!'
  );
  const [footerText, setFooterText] = useState('⚡ Entrega Automática • 🛡️ Suporte 30 Dias • 🔒 Compra 100% Segura');
  const [buttons, setButtons] = useState<TestButton[]>([
    { id: '1', label: 'Comprar Agora - ENTREGA AUTOMÁTICA', url: 'https://www.contaspj.shop/' },
  ]);

  const [isSending, setIsSending] = useState(false);
  const [apiResult, setApiResult] = useState<{
    status?: number;
    ok?: boolean;
    sentPayload?: any;
    responsePayload?: any;
    error?: string;
  } | null>(null);

  const handleAddButton = () => {
    if (buttons.length >= 3) {
      toast({ variant: 'destructive', title: 'Limite Atingido', description: 'O WhatsApp suporta até 3 botões por menu interativo.' });
      return;
    }
    setButtons([...buttons, { id: Date.now().toString(), label: `Botão #${buttons.length + 1}`, url: 'https://' }]);
  };

  const handleRemoveButton = (id: string) => {
    if (buttons.length <= 1) {
      toast({ variant: 'destructive', title: 'Atenção', description: 'Mantenha ao menos 1 botão para testar a mensagem de menu.' });
      return;
    }
    setButtons(buttons.filter((b) => b.id !== id));
  };

  const handleUpdateButton = (id: string, field: 'label' | 'url', val: string) => {
    setButtons(buttons.map((b) => (b.id === id ? { ...b, [field]: val } : b)));
  };

  const handleSendTest = async () => {
    if (!phone || !phone.trim()) {
      toast({ variant: 'destructive', title: 'Número Obrigatório', description: 'Informe o número do WhatsApp com DDD para o teste.' });
      return;
    }

    const upsellToken = settings?.webhookToken || settings?.billingWebhookToken;
    if (!upsellToken) {
      toast({ variant: 'destructive', title: 'Token Não Configurado', description: 'Configure o seu Token da UAZAPI em Configurações para disparar.' });
      return;
    }

    setIsSending(true);
    setApiResult(null);

    const choices = buttons.map((b) => {
      const label = b.label.trim() || 'Acessar';
      let url = b.url.trim();
      if (url && !url.startsWith('http://') && !url.startsWith('https://')) {
        url = `https://${url}`;
      }
      return url ? `${label}|${url}` : label;
    });

    const payloadSent = {
      phoneNumber: phone.trim(),
      type: 'button',
      text: messageText,
      choices: choices,
      imageButton: imageUrl.trim() || undefined,
      footerText: footerText.trim() || undefined,
      token: upsellToken,
    };

    try {
      const res = await fetch('/api/send-menu', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payloadSent),
      });

      const responseText = await res.text();
      let responseJson: any;
      try {
        responseJson = JSON.parse(responseText);
      } catch {
        responseJson = { rawResponse: responseText };
      }

      setApiResult({
        status: res.status,
        ok: res.ok,
        sentPayload: payloadSent,
        responsePayload: responseJson,
      });

      if (res.ok) {
        toast({ title: 'Envio Concluído! 🚀', description: 'Verifique a resposta da API UAZAPI no console abaixo.' });
      } else {
        toast({ variant: 'destructive', title: `Erro na API (${res.status})`, description: 'A UAZAPI retornou erro ao tentar enviar o menu.' });
      }
    } catch (err: any) {
      setApiResult({
        status: 500,
        ok: false,
        sentPayload: payloadSent,
        error: err.message || String(err),
      });
      toast({ variant: 'destructive', title: 'Erro de Conexão', description: 'Falha ao comunicar com o servidor.' });
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title="🧪 Teste de Botões e Cards Interativos (UAZAPI)"
        description="Configure e teste o envio de mensagens com Foto, Rodapé e Botões e visualize o retorno técnico da API em tempo real."
      />

      <main className="flex-1 overflow-auto p-4 md:p-6 space-y-6">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* PAINEL DE CONFIGURAÇÃO */}
          <Card className="lg:col-span-7 border-emerald-500/20 shadow-md">
            <CardHeader className="border-b bg-muted/20">
              <CardTitle className="text-base font-bold flex items-center gap-2">
                <Send className="h-4 w-4 text-emerald-600" />
                Configurar Mensagem de Teste
              </CardTitle>
              <CardDescription className="text-xs">
                Preencha os campos abaixo para simular o Card exatamente como ele será disparado no WhatsApp.
              </CardDescription>
            </CardHeader>

            <CardContent className="p-4 md:p-6 space-y-5">
              {/* Número de Destino */}
              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-emerald-700 dark:text-emerald-400">
                  1. Número do WhatsApp de Destino *
                </Label>
                <Input
                  placeholder="Ex: 5511999999999 ou 11999999999"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="font-mono text-sm"
                />
                <p className="text-[11px] text-muted-foreground">
                  Digite o número completo com DDD (ex: 5511999999999).
                </p>
              </div>

              {/* Link da Imagem */}
              <div className="space-y-1.5">
                <Label className="text-xs font-bold flex items-center gap-1.5">
                  <ImageIcon className="h-3.5 w-3.5 text-emerald-600" />
                  2. Link da Imagem do Card (URL do Imgur ou Web)
                </Label>
                <Input
                  placeholder="https://i.imgur.com/exemplo.jpeg"
                  value={imageUrl}
                  onChange={(e) => setImageUrl(e.target.value)}
                  className="font-mono text-xs"
                />
                {imageUrl && imageUrl.trim() ? (
                  <div className="mt-2 p-1.5 border rounded-xl bg-background w-fit">
                    <img
                      src={imageUrl}
                      alt="Preview"
                      className="h-28 w-auto object-cover rounded-lg"
                      onError={(e) => ((e.target as HTMLElement).style.display = 'none')}
                    />
                  </div>
                ) : null}
              </div>

              {/* Texto Principal */}
              <div className="space-y-1.5">
                <Label className="text-xs font-bold">3. Texto Principal da Mensagem</Label>
                <Textarea
                  rows={5}
                  value={messageText}
                  onChange={(e) => setMessageText(e.target.value)}
                  placeholder="Digite o texto principal acima dos botões..."
                  className="text-xs"
                />
              </div>

              {/* Rodapé */}
              <div className="space-y-1.5">
                <Label className="text-xs font-bold">4. Texto do Rodapé (Opcional)</Label>
                <Input
                  value={footerText}
                  onChange={(e) => setFooterText(e.target.value)}
                  placeholder="Ex: Oferta por tempo limitado"
                  className="text-xs"
                />
              </div>

              {/* Botões Interativos */}
              <div className="space-y-3 pt-2">
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-bold text-emerald-700 dark:text-emerald-400">
                    5. Botões Interativos com Link (HREF)
                  </Label>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleAddButton}
                    className="gap-1 text-xs h-7 border-emerald-500/30 hover:bg-emerald-50 text-emerald-700 dark:text-emerald-400"
                  >
                    <Plus className="h-3 w-3" /> Adicionar Botão
                  </Button>
                </div>

                <div className="space-y-3">
                  {buttons.map((b, idx) => (
                    <div key={b.id} className="p-3 border rounded-xl bg-muted/20 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-bold text-muted-foreground">Botão #{idx + 1}</span>
                        {buttons.length > 1 && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => handleRemoveButton(b.id)}
                            className="h-6 w-6 p-0 text-destructive"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <Input
                          placeholder="Texto do Botão"
                          value={b.label}
                          onChange={(e) => handleUpdateButton(b.id, 'label', e.target.value)}
                          className="text-xs"
                        />
                        <Input
                          placeholder="Link (HREF): https://..."
                          value={b.url}
                          onChange={(e) => handleUpdateButton(b.id, 'url', e.target.value)}
                          className="text-xs font-mono"
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>

            <CardFooter className="border-t p-4 bg-muted/10">
              <Button
                onClick={handleSendTest}
                disabled={isSending}
                size="lg"
                className="w-full gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm shadow-md"
              >
                {isSending ? (
                  <>
                    <RefreshCw className="h-4 w-4 animate-spin" /> Disparando via UAZAPI...
                  </>
                ) : (
                  <>
                    <Send className="h-4 w-4" /> Disparar Mensagem de Teste 🚀
                  </>
                )}
              </Button>
            </CardFooter>
          </Card>

          {/* CONSOLE DE RETORNO DA API */}
          <Card className="lg:col-span-5 border-slate-700 bg-slate-950 text-slate-100 shadow-xl flex flex-col h-full">
            <CardHeader className="border-b border-slate-800 bg-slate-900/80 p-4">
              <CardTitle className="text-sm font-bold flex items-center justify-between text-slate-200">
                <span className="flex items-center gap-2">
                  <Terminal className="h-4 w-4 text-emerald-400" />
                  Console de Resposta da API UAZAPI
                </span>
                {apiResult ? (
                  apiResult.ok ? (
                    <span className="flex items-center gap-1 text-[11px] font-semibold text-emerald-400 bg-emerald-950/60 px-2 py-0.5 rounded border border-emerald-800">
                      <CheckCircle2 className="h-3 w-3" /> HTTP {apiResult.status} OK
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 text-[11px] font-semibold text-rose-400 bg-rose-950/60 px-2 py-0.5 rounded border border-rose-800">
                      <AlertTriangle className="h-3 w-3" /> HTTP {apiResult.status} ERRO
                    </span>
                  )
                ) : null}
              </CardTitle>
              <CardDescription className="text-[11px] text-slate-400">
                Exibe exatamente o payload enviado e o JSON retornado pela API da UAZAPI.
              </CardDescription>
            </CardHeader>

            <CardContent className="p-4 flex-1 overflow-auto font-mono text-xs space-y-4">
              {!apiResult && !isSending ? (
                <div className="h-64 flex flex-col items-center justify-center text-slate-500 text-center p-6 space-y-2">
                  <Terminal className="h-8 w-8 opacity-40" />
                  <p className="text-xs">Nenhum teste disparado ainda.</p>
                  <p className="text-[11px] opacity-70">
                    Preencha o formulário e clique em "Disparar Mensagem de Teste" para ver os detalhes técnicos.
                  </p>
                </div>
              ) : null}

              {isSending ? (
                <div className="h-64 flex flex-col items-center justify-center text-emerald-400 text-center space-y-3">
                  <RefreshCw className="h-7 w-7 animate-spin" />
                  <p className="text-xs font-semibold">Enviando requisição HTTP para a UAZAPI...</p>
                </div>
              ) : null}

              {apiResult ? (
                <div className="space-y-4">
                  {/* Payload Enviado */}
                  <div>
                    <div className="text-[10px] uppercase font-bold text-slate-400 mb-1 flex items-center gap-1">
                      Payload Enviado para /api/send-menu:
                    </div>
                    <pre className="p-3 rounded-lg bg-slate-900 border border-slate-800 text-emerald-300 text-[11px] overflow-x-auto">
                      {JSON.stringify(apiResult.sentPayload, null, 2)}
                    </pre>
                  </div>

                  {/* Resposta UAZAPI */}
                  <div>
                    <div className="text-[10px] uppercase font-bold text-slate-400 mb-1 flex items-center gap-1">
                      Retorno Bruto da UAZAPI (https://pjcontas.uazapi.com/send/menu):
                    </div>
                    <pre
                      className={`p-3 rounded-lg border text-[11px] overflow-x-auto ${
                        apiResult.ok
                          ? 'bg-slate-900 border-slate-800 text-slate-100'
                          : 'bg-rose-950/40 border-rose-800 text-rose-300'
                      }`}
                    >
                      {JSON.stringify(apiResult.responsePayload || apiResult.error, null, 2)}
                    </pre>
                  </div>
                </div>
              ) : null}
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
