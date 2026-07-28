'use client';

import React, { useEffect } from 'react';
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
import { Copy, Plus, Trash2, Rocket, Sparkles, CheckCircle2, Zap, Clock, ShieldCheck, HelpCircle } from 'lucide-react';
import { setDocumentNonBlocking } from '@/firebase/non-blocking-updates';
import { Badge } from '@/components/ui/badge';

const upsellItemSchema = z.object({
  id: z.string(),
  isActive: z.boolean(),
  upsellDelayMinutes: z.coerce.number().min(0, 'O tempo deve ser no mínimo 0 minutos.'),
  upsellMessage: z.string().min(1, 'A mensagem de upsell é obrigatória.'),
  createdAt: z.number().optional(),
});

const upsellFormSchema = z.object({
  upsells2: z.array(upsellItemSchema),
});

type UpsellFormData = z.infer<typeof upsellFormSchema>;

export default function Upsell2Page() {
  const { firestore, user } = useFirebase();
  const { toast } = useToast();

  const settingsDocRef = useMemoFirebase(() => {
    if (!user) return null;
    return doc(firestore, 'users', user.uid, 'settings', 'config');
  }, [firestore, user]);

  const { data: settings, isLoading } = useDoc<Settings>(settingsDocRef);

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
        form.reset({ upsells2: settings.upsells2 });
      } else {
        form.reset({
          upsells2: [{
            id: crypto.randomUUID(),
            isActive: false,
            upsellDelayMinutes: 5,
            upsellMessage: 'Olá {cliente}! Temos uma oferta especial exclusiva para a sua assinatura {assinatura}. Clique no link para aproveitar!',
            createdAt: Date.now(),
          }],
        });
      }
    }
  }, [settings, form]);

  const onSubmit = (data: UpsellFormData) => {
    if (settingsDocRef) {
      const existingUpsellsMap = new Map((settings?.upsells2 || []).map(u => [u.id, u.createdAt]));
      const now = Date.now();
      const updatedUpsells = data.upsells2.map(u => {
        const existingTimestamp = existingUpsellsMap.get(u.id) || u.createdAt;
        return {
          ...u,
          upsellDelayMinutes: Number(u.upsellDelayMinutes) || 0,
          createdAt: (existingTimestamp && Number(existingTimestamp) > 0) ? Number(existingTimestamp) : now,
        };
      });

      setDocumentNonBlocking(settingsDocRef, { upsells2: updatedUpsells }, { merge: true });
      toast({
        title: 'Funil Upsell 2.0 Salvo com Sucesso! 🚀',
        description: 'Suas regras de automação foram salvas e estão ativas para novos cadastros.',
      });
    }
  };

  const copyVariableToClipboard = (variable: string) => {
    navigator.clipboard.writeText(variable);
    toast({
      title: 'Variável Copiada!',
      description: `A variável ${variable} foi copiada para a área de transferência.`,
    });
  };

  const handleAddUpsell = () => {
    append({
      id: crypto.randomUUID(),
      isActive: false,
      upsellDelayMinutes: 5,
      upsellMessage: '',
      createdAt: Date.now(),
    });
  };

  if (isLoading) {
    return (
      <div className="flex flex-col h-full">
        <PageHeader
          title="Funil Upsell 2.0 🚀"
          description="Nova engine de automação de Upsell com envio direto via API UAZAPI."
        />
        <main className="flex-1 overflow-auto p-4 md:p-6">
          <Card className="border-emerald-500/20">
            <CardContent className="pt-6 space-y-6">
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-32 w-full" />
            </CardContent>
          </Card>
        </main>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title="Funil Upsell 2.0 🚀"
        description="Engine de disparo direto na API UAZAPI com suporte nativo a JSON e regras dinâmicas."
      >
        <Button size="sm" onClick={handleAddUpsell} className="gap-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white font-semibold shadow-md shadow-emerald-500/10">
          <Plus className="h-4 w-4" />
          Adicionar Nova Regra 2.0
        </Button>
      </PageHeader>

      <main className="flex-1 overflow-auto p-4 md:p-6 space-y-6">
        {/* Banner Hero Explicativo & Status */}
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 border border-emerald-500/30 p-6 shadow-xl text-white">
          <div className="absolute top-0 right-0 p-8 opacity-10 pointer-events-none">
            <Rocket className="h-48 w-48 text-emerald-400" />
          </div>
          
          <div className="relative z-10 space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge className="bg-emerald-500/20 text-emerald-300 border-emerald-500/30 font-mono text-xs px-2.5 py-1 flex items-center gap-1.5">
                <Zap className="h-3.5 w-3.5 text-emerald-400" /> API UAZAPI Direta
              </Badge>
              <Badge className="bg-cyan-500/20 text-cyan-300 border-cyan-500/30 font-mono text-xs px-2.5 py-1 flex items-center gap-1.5">
                <ShieldCheck className="h-3.5 w-3.5 text-cyan-400" /> Sanitização JSON
              </Badge>
              <Badge className="bg-blue-500/20 text-blue-300 border-blue-500/30 font-mono text-xs px-2.5 py-1 flex items-center gap-1.5">
                <Clock className="h-3.5 w-3.5 text-blue-400" /> Regra Ativa Pós-Criação
              </Badge>
            </div>

            <div>
              <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-white flex items-center gap-2">
                Como Funciona o Funil Upsell 2.0 🚀
              </h2>
              <p className="text-slate-300 text-sm mt-1 max-w-2xl leading-relaxed">
                Assim que um novo cliente é adicionado no CRM, o temporizador começa a contar o tempo configurado. Quando o delay expira, a mensagem é enviada via requisição direta na API da UAZAPI com sanitização total de quebras de linha e caracteres especiais.
              </p>
            </div>

            {/* Step-by-step indicator */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
              <div className="bg-slate-800/60 border border-slate-700/60 rounded-xl p-3 flex items-center gap-3">
                <div className="h-8 w-8 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-bold text-sm">1</div>
                <div>
                  <p className="text-xs font-semibold text-white">Novo Cliente Adicionado</p>
                  <p className="text-[11px] text-slate-400">Gravado no CRM com data atual</p>
                </div>
              </div>
              <div className="bg-slate-800/60 border border-slate-700/60 rounded-xl p-3 flex items-center gap-3">
                <div className="h-8 w-8 rounded-lg bg-teal-500/20 text-teal-400 flex items-center justify-center font-bold text-sm">2</div>
                <div>
                  <p className="text-xs font-semibold text-white">Contagem do Delay</p>
                  <p className="text-[11px] text-slate-400">Aguardando X minutos</p>
                </div>
              </div>
              <div className="bg-slate-800/60 border border-slate-700/60 rounded-xl p-3 flex items-center gap-3">
                <div className="h-8 w-8 rounded-lg bg-cyan-500/20 text-cyan-400 flex items-center justify-center font-bold text-sm">3</div>
                <div>
                  <p className="text-xs font-semibold text-white">Disparo Direto UAZAPI</p>
                  <p className="text-[11px] text-slate-400">Mensagem entregue via WhatsApp</p>
                </div>
              </div>
            </div>
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
                                ? `Envia após ${delay} min do cadastro para novos clientes`
                                : `Ative o interruptor para programar o envio desta mensagem`}
                            </CardDescription>
                          </div>
                        </div>

                        {fields.length > 1 && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => remove(index)}
                            className="text-destructive hover:text-destructive hover:bg-destructive/10 gap-1.5 text-xs"
                          >
                            <Trash2 className="h-4 w-4" />
                            Remover Regra
                          </Button>
                        )}
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
                            <Label className="font-semibold text-sm">Tempo de Espera Pós-Cadastro</Label>
                            <p className="text-xs text-muted-foreground">Quanto tempo aguardar após o cliente ser inserido no CRM</p>
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

                      {/* Mensagem de Upsell 2.0 */}
                      <FormField
                        control={form.control}
                        name={`upsells2.${index}.upsellMessage`}
                        render={({ field }) => (
                          <FormItem>
                            <div className="flex items-center justify-between mb-1.5">
                              <FormLabel className="font-semibold text-sm">Mensagem de Upsell 2.0</FormLabel>
                              <span className="text-xs text-muted-foreground flex items-center gap-1">
                                <HelpCircle className="h-3.5 w-3.5" /> Padrão de Envio JSON Ativo
                              </span>
                            </div>
                            <FormControl>
                              <Textarea
                                placeholder="Olá {cliente}! Temos uma oferta imperdível exclusiva para o seu plano {assinatura}..."
                                className="min-h-[150px] font-mono text-sm leading-relaxed p-4 border-emerald-500/20 focus:border-emerald-500 rounded-xl"
                                {...field}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      {/* Variáveis Dinâmicas para Copiar */}
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
                <p className="text-[11px] text-muted-foreground">Novos cadastros receberão as mensagens programadas via API UAZAPI.</p>
              </div>

              <Button type="submit" size="lg" className="w-full sm:w-auto gap-2 bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-600 hover:from-emerald-700 hover:to-teal-700 text-white font-bold px-8 shadow-lg shadow-emerald-500/20 text-base">
                <CheckCircle2 className="h-5 w-5" />
                Salvar Configurações Upsell 2.0 🚀
              </Button>
            </div>
          </form>
        </Form>
      </main>
    </div>
  );
}
