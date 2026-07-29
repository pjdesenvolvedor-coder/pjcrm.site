'use client';

import React, { useEffect, useState } from 'react';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Button } from '@/components/ui/button';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { PageHeader } from '@/components/page-header';
import { useDoc, useFirebase, useMemoFirebase } from '@/firebase';
import { doc } from 'firebase/firestore';
import type { Settings, UpsellConfig } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';
import { Skeleton } from '@/components/ui/skeleton';
import { Label } from '@/components/ui/label';
import { Copy, Plus, Trash2, Rocket, Sparkles, CheckCircle2, Clock, HelpCircle, Image as ImageIcon, MousePointerClick, Upload, Send, Terminal, Key } from 'lucide-react';
import { setDocumentNonBlocking } from '@/firebase/non-blocking-updates';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { getStorage, ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage';

function ImageUploaderInput({ value, onChange }: { value?: string; onChange: (val: string) => void }) {
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = React.useState(false);
  const { firebaseApp } = useFirebase();

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 10 * 1024 * 1024) {
      alert('A imagem é muito grande. Escolha um arquivo de até 10MB.');
      return;
    }

    try {
      setIsUploading(true);
      const storage = getStorage(firebaseApp);
      const fileRef = storageRef(storage, `upsell-2-images/${Date.now()}_${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`);
      await uploadBytes(fileRef, file);
      const downloadUrl = await getDownloadURL(fileRef);
      onChange(downloadUrl);
    } catch (err) {
      console.error("Erro ao subir arquivo para o Firebase Storage, usando Data URI fallback:", err);
      const reader = new FileReader();
      reader.onload = (evt) => {
        const base64 = evt.target?.result as string;
        if (base64) {
          onChange(base64);
        }
      };
      reader.readAsDataURL(file);
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
        <Input
          placeholder="Cole a URL da foto ou selecione no seu computador"
          value={value || ''}
          onChange={(e) => onChange(e.target.value)}
          className="text-xs font-mono flex-1"
        />
        <input
          type="file"
          accept="image/*"
          ref={fileInputRef}
          onChange={handleFileSelect}
          className="hidden"
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={isUploading}
          onClick={() => fileInputRef.current?.click()}
          className="gap-1.5 text-xs shrink-0 border-emerald-500/40 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 font-semibold"
        >
          <Upload className="h-3.5 w-3.5" />
          {isUploading ? 'Enviando Foto...' : 'Escolher Foto do Computador 📁'}
        </Button>
      </div>

      {value && value.trim() ? (
        <div className="relative group w-fit rounded-xl border overflow-hidden bg-background shadow-sm p-1.5">
          <img
            src={value}
            alt="Preview da Mídia"
            className="h-32 w-auto object-cover rounded-lg max-w-full"
            onError={(e) => {
              (e.target as HTMLElement).style.display = 'none';
            }}
          />
          <Button
            type="button"
            variant="destructive"
            size="sm"
            onClick={() => onChange('')}
            className="mt-1.5 gap-1 text-[11px] h-7 w-full"
          >
            <Trash2 className="h-3 w-3" />
            Remover Imagem
          </Button>
        </div>
      ) : null}
    </div>
  );
}

const upsellButtonSchema = z.object({
  id: z.string(),
  label: z.string().min(1, 'O texto do botão é obrigatório.'),
  url: z.string().min(1, 'O link do botão é obrigatório.'),
});

const upsellItemSchema = z.object({
  id: z.string(),
  isActive: z.boolean(),
  upsellDelayMinutes: z.coerce.number().min(0, 'O tempo deve ser no mínimo 0 minutos.'),
  upsellMessage: z.string().min(1, 'A mensagem de upsell é obrigatória.'),
  messageType: z.string().default('button'),
  imageButton: z.string().optional(),
  footerText: z.string().optional(),
  buttons: z.array(upsellButtonSchema).optional(),
  createdAt: z.number().optional(),
});

const upsellFormSchema = z.object({
  upsells2: z.array(upsellItemSchema),
});

type UpsellFormData = z.infer<typeof upsellFormSchema>;

function ButtonsArrayField({ nestIndex, control }: { nestIndex: number; control: any }) {
  const { fields, append, remove } = useFieldArray({
    control,
    name: `upsells2.${nestIndex}.buttons`,
  });

  return (
    <div className="space-y-4 pt-2 border-t border-emerald-500/20">
      <div className="flex items-center justify-between">
        <div>
          <Label className="font-bold text-sm text-foreground flex items-center gap-2">
            <MousePointerClick className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
            Botões Interativos com Link (HREF)
          </Label>
          <p className="text-xs text-muted-foreground">Adicione os botões clicáveis que serão exibidos abaixo da mensagem.</p>
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => append({ id: crypto.randomUUID(), label: 'Comprar Agora 🚀', url: 'https://www.contaspj.shop/' })}
          className="gap-1.5 text-xs border-emerald-500/30 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400"
        >
          <Plus className="h-3.5 w-3.5" />
          Adicionar Botão
        </Button>
      </div>

      {fields.length === 0 && (
        <div className="p-4 rounded-xl border border-dashed text-center text-xs text-muted-foreground bg-muted/20">
          Nenhum botão adicionado. Clique no botão acima para incluir um botão de link.
        </div>
      )}

      <div className="space-y-3">
        {fields.map((item, btnIndex) => (
          <div key={item.id} className="p-3.5 rounded-xl border bg-background flex flex-col sm:flex-row items-start sm:items-center gap-3 relative group">
            <div className="flex-1 w-full space-y-1">
              <Label className="text-xs font-semibold">Texto do Botão #{btnIndex + 1}</Label>
              <FormField
                control={control}
                name={`upsells2.${nestIndex}.buttons.${btnIndex}.label`}
                render={({ field }) => (
                  <FormItem className="m-0">
                    <FormControl>
                      <Input placeholder="Ex: Comprar Agora 🛒" className="text-xs font-medium" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="flex-1 w-full space-y-1">
              <Label className="text-xs font-semibold">Link de Destino (HREF)</Label>
              <FormField
                control={control}
                name={`upsells2.${nestIndex}.buttons.${btnIndex}.url`}
                render={({ field }) => (
                  <FormItem className="m-0">
                    <FormControl>
                      <Input placeholder="https://..." className="text-xs font-mono" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {fields.length > 1 && (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => remove(btnIndex)}
                className="text-destructive hover:text-destructive hover:bg-destructive/10 self-end sm:self-center shrink-0"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export default function Upsell2Page() {
  const { firestore, user } = useFirebase();
  const { toast } = useToast();

  const settingsDocRef = useMemoFirebase(() => {
    if (!user) return null;
    return doc(firestore, 'users', user.uid, 'settings', 'config');
  }, [firestore, user]);

  const { data: settings, isLoading } = useDoc<Settings>(settingsDocRef);

  const [testDialogOpen, setTestDialogOpen] = useState(false);
  const [testRuleData, setTestRuleData] = useState<any>(null);
  const [testPhone, setTestPhone] = useState('');
  const [isSendingTest, setIsSendingTest] = useState(false);
  const [testApiResult, setTestApiResult] = useState<any>(null);

  const form = useForm<UpsellFormData>({
    resolver: zodResolver(upsellFormSchema),
    defaultValues: {
      upsells2: [],
    },
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: 'upsells2',
  });

  useEffect(() => {
    if (settings) {
      if (settings.upsells2 && settings.upsells2.length > 0) {
        form.reset({
          upsells2: settings.upsells2.map((u) => ({
            ...u,
            messageType: 'button',
            buttons: Array.isArray(u.buttons) && u.buttons.length > 0
              ? u.buttons
              : [{ id: crypto.randomUUID(), label: 'Comprar Agora 🚀', url: 'https://www.contaspj.shop/' }],
          })),
        });
      } else {
        form.reset({
          upsells2: [{
            id: crypto.randomUUID(),
            isActive: false,
            upsellDelayMinutes: 5,
            upsellMessage: '🚀 ASSINATURAS PREMIUM COM ENTREGA AUTOMÁTICA!\n\n✅ Entrega imediata após a compra\n🛡️ Suporte por 30 dias\n🔒 Contas seguras e testadas\n🎬 Netflix, Disney+, HBO Max, Prime Video, Globoplay, Telecine e muito mais!',
            messageType: 'button',
            imageButton: 'https://i.imgur.com/l8StCRM.jpeg',
            footerText: '⚡ Entrega Automática • 🛡️ Suporte 30 Dias • 🔒 Compra 100% Segura',
            buttons: [{ id: crypto.randomUUID(), label: 'Comprar Agora - ENTREGA AUTOMÁTICA', url: 'https://www.contaspj.shop/' }],
            createdAt: Date.now(),
          }],
        });
      }
    }
  }, [settings, form]);

  const copyVariableToClipboard = (variableName: string) => {
    navigator.clipboard.writeText(variableName);
    toast({
      title: 'Copiado! 📋',
      description: `Variável ${variableName} copiada para a área de transferência.`,
    });
  };

  const openTestRuleModal = (ruleIndex: number) => {
    const currentRule = form.getValues(`upsells2.${ruleIndex}`);
    setTestRuleData(currentRule);
    setTestApiResult(null);
    setTestDialogOpen(true);
  };

  const handleExecuteRuleTest = async () => {
    if (!testPhone || !testPhone.trim()) {
      toast({ variant: 'destructive', title: 'Número Obrigatório', description: 'Informe o número do WhatsApp com DDD.' });
      return;
    }

    const token = settings?.webhookToken || settings?.billingWebhookToken;
    if (!token) {
      toast({ variant: 'destructive', title: 'Token Faltando', description: 'Configure seu Token UAZAPI nas configurações.' });
      return;
    }

    setIsSendingTest(true);
    setTestApiResult(null);

    const choices = (testRuleData?.buttons || []).map((b: any) => {
      const label = b.label.trim() || 'Acessar';
      let url = b.url.trim();
      if (url && !url.startsWith('http://') && !url.startsWith('https://')) {
        url = `https://${url}`;
      }
      return url ? `${label}|${url}` : label;
    });

    const payload = {
      phoneNumber: testPhone.trim(),
      type: 'button',
      text: testRuleData?.upsellMessage || '',
      choices: choices.length > 0 ? choices : ['Comprar Agora|https://www.contaspj.shop/'],
      imageButton: testRuleData?.imageButton?.trim() || undefined,
      footerText: testRuleData?.footerText?.trim() || undefined,
      token: token,
    };

    try {
      const res = await fetch('/api/send-menu', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const textRes = await res.text();
      let jsonRes: any;
      try {
        jsonRes = JSON.parse(textRes);
      } catch {
        jsonRes = { rawResponse: textRes };
      }

      setTestApiResult({ status: res.status, ok: res.ok, sentPayload: payload, responsePayload: jsonRes });

      if (res.ok) {
        toast({ title: 'Mensagem de Teste Disparada! 🚀', description: 'Verifique seu WhatsApp e o console do modal.' });
      } else {
        toast({ variant: 'destructive', title: `Erro ${res.status}`, description: 'Falha no disparo do menu.' });
      }
    } catch (err: any) {
      setTestApiResult({ status: 500, ok: false, sentPayload: payload, error: err.message });
    } finally {
      setIsSendingTest(false);
    }
  };

  const onSubmit = async (data: UpsellFormData) => {
    if (settingsDocRef) {
      const existingUpsellsMap = new Map((settings?.upsells2 || []).map(u => [u.id, u.createdAt]));
      const now = Date.now();

      const updatedUpsells = data.upsells2.map((u) => {
        const existingTimestamp = existingUpsellsMap.get(u.id) || u.createdAt;
        return {
          ...u,
          id: (u.id && typeof u.id === 'string' && u.id.trim()) ? u.id.trim() : crypto.randomUUID(),
          upsellDelayMinutes: Number(u.upsellDelayMinutes) || 0,
          messageType: 'button',
          imageButton: (u.imageButton || '').trim(),
          footerText: (u.footerText || '').trim(),
          buttons: (u.buttons || []).map(b => ({
            id: b.id || crypto.randomUUID(),
            label: b.label.trim(),
            url: b.url.trim(),
          })),
          createdAt: (existingTimestamp && Number(existingTimestamp) > 0) ? Number(existingTimestamp) : now,
        };
      });

      setDocumentNonBlocking(settingsDocRef, { upsells2: updatedUpsells }, { merge: true });
      toast({
        title: 'Funil Upsell 2.0 Salvo com Sucesso! 🚀',
        description: 'Regras ativas e prontas para disparar no WhatsApp com Foto, Texto e Botões.',
      });
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <PageHeader title="Funil Upsell 2.0 🚀" description="Carregando configurações do funil..." />
        <Skeleton className="h-64 w-full rounded-2xl" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full space-y-6">
      <PageHeader
        title="Funil Upsell 2.0 🚀"
        description="Configure mensagens com Foto, Rodapé e Botões Interativos com Link (HREF) disparadas automaticamente em horários programados pós-cadastro."
      />

      <main className="flex-1 overflow-auto p-1 space-y-6">
        {/* Banner Informativo */}
        <div className="p-5 rounded-2xl bg-gradient-to-r from-emerald-950 via-slate-900 to-slate-950 text-white shadow-xl border border-emerald-500/30">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-emerald-400 font-bold text-sm uppercase tracking-wider">
                <Rocket className="h-4 w-4" /> Motor de Disparo UAZAPI Unificado
              </div>
              <h2 className="text-xl font-extrabold tracking-tight">Funil de Vendas Interativo e Automatizado</h2>
              <p className="text-xs text-slate-300 max-w-2xl leading-relaxed">
                Cada regra configurada dispara o Card Completo com Imagem, Texto, Rodapé e Botões Clicáveis para o cliente respeitando rigorosamente os minutos pós-cadastro.
              </p>
            </div>

            <Button
              type="button"
              onClick={() => {
                append({
                  id: crypto.randomUUID(),
                  isActive: true,
                  upsellDelayMinutes: 10,
                  upsellMessage: '🚀 ASSINATURAS PREMIUM COM ENTREGA AUTOMÁTICA!\n\n✅ Entrega imediata após a compra\n🛡️ Suporte por 30 dias',
                  messageType: 'button',
                  imageButton: 'https://i.imgur.com/l8StCRM.jpeg',
                  footerText: '⚡ Entrega Automática • 🛡️ Suporte 30 Dias',
                  buttons: [{ id: crypto.randomUUID(), label: 'Comprar Agora - ENTREGA AUTOMÁTICA', url: 'https://www.contaspj.shop/' }],
                  createdAt: Date.now(),
                });
              }}
              className="gap-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs h-10 px-4 rounded-xl shadow-lg shrink-0"
            >
              <Plus className="h-4 w-4" /> Adicionar Nova Regra de Upsell
            </Button>
          </div>
        </div>

        {/* Formulário com as Regras de Upsell 2.0 */}
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <div className="space-y-6">
              {fields.map((field, index) => {
                const isActive = form.watch(`upsells2.${index}.isActive`);
                const delay = form.watch(`upsells2.${index}.upsellDelayMinutes`);

                return (
                  <Card key={field.id} className={`transition-all duration-200 overflow-hidden ${
                    isActive 
                      ? 'border-emerald-500/40 dark:border-emerald-500/30 shadow-md shadow-emerald-500/5 bg-card' 
                      : 'border-border/60 opacity-85 bg-card/60'
                  }`}>
                    <CardHeader className="border-b bg-muted/20 pb-4">
                      <div className="flex flex-wrap items-center justify-between gap-4">
                        <div className="flex items-center gap-3">
                          <div className={`p-2.5 rounded-xl ${
                            isActive 
                              ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20' 
                              : 'bg-muted text-muted-foreground'
                          }`}>
                            <Sparkles className="h-5 w-5" />
                          </div>
                          <div>
                            <CardTitle className="text-lg font-bold flex items-center gap-2">
                              Regra Upsell 2.0 #{index + 1}
                              {isActive ? (
                                <Badge variant="default" className="bg-emerald-500 text-white hover:bg-emerald-600 text-[11px] font-semibold px-2 py-0.5">
                                  ● Ativa
                                </Badge>
                              ) : (
                                <Badge variant="outline" className="text-muted-foreground text-[11px] px-2 py-0.5">
                                  Pausada
                                </Badge>
                              )}
                            </CardTitle>
                            <CardDescription className="text-xs mt-0.5">
                              {isActive 
                                ? `Envia após ${delay} min do cadastro do cliente`
                                : `Ative o interruptor para programar esta mensagem`}
                            </CardDescription>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => openTestRuleModal(index)}
                            className="gap-1.5 text-xs border-amber-500/40 hover:bg-amber-50 dark:hover:bg-amber-950/40 text-amber-700 dark:text-amber-400 font-semibold"
                          >
                            <Send className="h-3.5 w-3.5" />
                            Testar Envio Desta Regra 🚀
                          </Button>

                          {fields.length > 1 && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => remove(index)}
                              className="text-destructive hover:text-destructive hover:bg-destructive/10 gap-1.5 text-xs"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      </div>
                    </CardHeader>

                    <CardContent className="pt-6 space-y-6">
                      {/* Ativar/Desativar */}
                      <FormField
                        control={form.control}
                        name={`upsells2.${index}.isActive`}
                        render={({ field }) => (
                          <FormItem>
                            <div className="flex items-center justify-between rounded-xl border p-4 bg-muted/20 hover:bg-muted/30 transition-colors">
                              <div className="space-y-0.5">
                                <FormLabel className="text-base font-semibold cursor-pointer">
                                  Ativar esta regra no Funil 2.0
                                </FormLabel>
                                <p className="text-xs text-muted-foreground">
                                  Dispara a mensagem automaticamente quando o temporizador atinge o tempo configurado.
                                </p>
                              </div>
                              <FormControl>
                                <Switch
                                  checked={field.value}
                                  onCheckedChange={field.onChange}
                                />
                              </FormControl>
                            </div>
                          </FormItem>
                        )}
                      />

                      {/* Tempo de Espera (Delay) */}
                      <div className="p-4 rounded-xl border bg-slate-50 dark:bg-slate-900/50 flex flex-wrap items-center justify-between gap-4">
                        <div className="flex items-center gap-3">
                          <Clock className="h-5 w-5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                          <div>
                            <Label className="font-semibold text-sm">1. Tempo de Espera Pós-Cadastro</Label>
                            <p className="text-xs text-muted-foreground">Quanto tempo aguardar após o cliente ser cadastrado</p>
                          </div>
                        </div>

                        <FormField
                          control={form.control}
                          name={`upsells2.${index}.upsellDelayMinutes`}
                          render={({ field }) => (
                            <FormItem className="m-0">
                              <FormControl>
                                <div className="flex items-center gap-2">
                                  <Input type="number" className="w-28 text-center font-bold text-lg h-10 border-emerald-500/30" {...field} />
                                  <span className="text-sm font-semibold text-muted-foreground">minutos</span>
                                </div>
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>

                      {/* Imagem e Rodapé */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 rounded-xl border bg-muted/10">
                        <FormField
                          control={form.control}
                          name={`upsells2.${index}.imageButton`}
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel className="text-xs font-bold flex items-center gap-1.5">
                                <ImageIcon className="h-3.5 w-3.5 text-emerald-600" />
                                2. Imagem do Card (URL ou Arquivo do PC)
                              </FormLabel>
                              <FormControl>
                                <ImageUploaderInput value={field.value} onChange={field.onChange} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <FormField
                          control={form.control}
                          name={`upsells2.${index}.footerText`}
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel className="text-xs font-bold flex items-center gap-1.5">
                                3. Texto do Rodapé (Opcional)
                              </FormLabel>
                              <FormControl>
                                <Input placeholder="Ex: Oferta por tempo limitado" className="text-xs" {...field} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>

                      {/* Campo do Texto da Mensagem */}
                      <FormField
                        control={form.control}
                        name={`upsells2.${index}.upsellMessage`}
                        render={({ field }) => (
                          <FormItem>
                            <div className="flex items-center justify-between mb-1.5">
                              <FormLabel className="font-bold text-sm">
                                4. Texto Principal da Mensagem (Acima dos Botões)
                              </FormLabel>
                              <span className="text-xs text-muted-foreground flex items-center gap-1">
                                <HelpCircle className="h-3.5 w-3.5" /> UAZAPI Card Format
                              </span>
                            </div>
                            <FormControl>
                              <Textarea
                                placeholder="Olá {cliente}! Temos uma oferta imperdível exclusiva para o seu plano {assinatura}..."
                                className="min-h-[140px] font-mono text-sm leading-relaxed p-4 border-emerald-500/20 focus:border-emerald-500 rounded-xl"
                                {...field}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      {/* Sub-formulário de Botões Interativos */}
                      <ButtonsArrayField nestIndex={index} control={form.control} />

                      {/* Variáveis Dinâmicas */}
                      <div className="space-y-2.5 pt-4 border-t">
                        <div className="flex items-center justify-between">
                          <Label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                            Variáveis Personalizadas para Inserir na Mensagem
                          </Label>
                          <span className="text-[11px] text-muted-foreground">Clique para copiar</span>
                        </div>
                        
                        <div className="flex flex-wrap gap-2">
                          {[
                            { name: '{cliente}', label: 'Nome do Cliente' },
                            { name: '{telefone}', label: 'Telefone' },
                            { name: '{email}', label: 'E-mail' },
                            { name: '{assinatura}', label: 'Plano/Produto' },
                            { name: '{vencimento}', label: 'Data Vencimento' },
                            { name: '{valor}', label: 'Valor Pago' },
                            { name: '{senha}', label: 'Senha' },
                            { name: '{tela}', label: 'Tela' },
                            { name: '{pin_tela}', label: 'PIN Tela' },
                            { name: '{status}', label: 'Status' },
                          ].map((item) => (
                            <Button
                              key={item.name}
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => copyVariableToClipboard(item.name)}
                              className="text-xs font-mono gap-1.5 hover:bg-emerald-50 hover:text-emerald-700 dark:hover:bg-emerald-950/40 border-emerald-500/20"
                            >
                              <Copy className="h-3 w-3 text-emerald-600 dark:text-emerald-400" />
                              <span className="font-bold">{item.name}</span>
                            </Button>
                          ))}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>

            {/* Barra de Ações Salvar */}
            <div className="sticky bottom-4 z-20 bg-background/80 backdrop-blur-md p-4 rounded-2xl border shadow-2xl flex items-center justify-between gap-4">
              <div className="hidden sm:block">
                <p className="text-xs font-semibold text-foreground">Pronto para salvar?</p>
                <p className="text-[11px] text-muted-foreground">Regras ativas serão disparadas automaticamente via UAZAPI.</p>
              </div>

              <Button type="submit" size="lg" className="w-full sm:w-auto gap-2 bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-600 hover:from-emerald-700 hover:to-teal-700 text-white font-bold px-8 shadow-lg shadow-emerald-500/20 text-base">
                <CheckCircle2 className="h-5 w-5" />
                Salvar Configurações Upsell 2.0 🚀
              </Button>
            </div>
          </form>
        </Form>
      </main>

      {/* DIALOG DE TESTE RÁPIDO DE REGRA */}
      <Dialog open={testDialogOpen} onOpenChange={setTestDialogOpen}>
        <DialogContent className="max-w-2xl bg-slate-950 text-slate-100 border-slate-800">
          <DialogHeader>
            <DialogTitle className="text-base font-bold flex items-center gap-2 text-emerald-400">
              <Send className="h-4 w-4" />
              Testar Envio da Regra no WhatsApp
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-400">
              Dispara a mensagem configurada nesta regra exatamente como o cliente receberá.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label className="text-xs font-bold text-emerald-400">Número do WhatsApp para Teste *</Label>
              <Input
                placeholder="Ex: 5511999999999 ou 8799999999"
                value={testPhone}
                onChange={(e) => setTestPhone(e.target.value)}
                className="bg-slate-900 border-slate-700 font-mono text-sm text-white"
              />
            </div>

            {testRuleData && (
              <div className="p-3 rounded-xl bg-slate-900 border border-slate-800 text-xs space-y-2">
                <p className="font-bold text-slate-300">Resumo da Mensagem:</p>
                <p className="text-slate-400 line-clamp-3">{testRuleData.upsellMessage}</p>
                {testRuleData.imageButton && (
                  <p className="text-[11px] text-emerald-400 font-mono truncate">Foto: {testRuleData.imageButton}</p>
                )}
                <p className="text-[11px] text-slate-400">
                  Botões: {(testRuleData.buttons || []).map((b: any) => b.label).join(' | ')}
                </p>
              </div>
            )}

            {testApiResult && (
              <div className="space-y-2">
                <div className="text-[11px] font-bold text-slate-400 flex items-center justify-between">
                  <span>Console UAZAPI:</span>
                  <Badge variant={testApiResult.ok ? 'default' : 'destructive'} className="text-[10px]">
                    HTTP {testApiResult.status}
                  </Badge>
                </div>
                <pre className="p-3 rounded-lg bg-black border border-slate-800 text-[11px] font-mono text-emerald-400 max-h-48 overflow-auto">
                  {JSON.stringify(testApiResult.responsePayload || testApiResult.error, null, 2)}
                </pre>
              </div>
            )}
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" size="sm" onClick={() => setTestDialogOpen(false)} className="border-slate-700 text-slate-300">
              Fechar
            </Button>
            <Button
              onClick={handleExecuteRuleTest}
              disabled={isSendingTest}
              size="sm"
              className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold gap-2"
            >
              {isSendingTest ? 'Disparando...' : 'Enviar Teste Agora 🚀'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
