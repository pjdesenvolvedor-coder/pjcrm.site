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
import { Card, CardContent } from '@/components/ui/card';
import { PageHeader } from '@/components/page-header';
import { useDoc, useFirebase, useMemoFirebase } from '@/firebase';
import { doc } from 'firebase/firestore';
import type { Settings, UpsellConfig } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';
import { Skeleton } from '@/components/ui/skeleton';
import { Label } from '@/components/ui/label';
import { Copy, Plus, Trash2, Rocket, Sparkles, CheckCircle2 } from 'lucide-react';
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
        title: 'Funil Upsell 2.0 Salvo!',
        description: 'Suas automações de Upsell 2.0 foram salvas com sucesso.',
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
          description="Nova engine de automação de Upsell com envio direto em API."
        />
        <main className="flex-1 overflow-auto p-4 md:p-6">
          <Card>
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
        description="Nova engine de automação de Upsell com envio direto via API UAZAPI."
      >
        <Button size="sm" onClick={handleAddUpsell} className="gap-2 bg-emerald-600 hover:bg-emerald-700 text-white">
          <Plus className="h-4 w-4" />
          Adicionar Mais Regras (Upsell 2.0)
        </Button>
      </PageHeader>

      <main className="flex-1 overflow-auto p-4 md:p-6">
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <div className="space-y-6">
              {fields.map((field, index) => (
                <Card key={field.id} className="border-emerald-500/20 shadow-sm relative overflow-hidden">
                  <CardContent className="pt-6 space-y-6">
                    <div className="flex justify-between items-center">
                      <h3 className="font-semibold text-lg flex items-center gap-2 text-emerald-600 dark:text-emerald-400">
                        <Sparkles className="h-5 w-5" />
                        Regra Upsell 2.0 #{index + 1}
                      </h3>
                      {fields.length > 1 && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => remove(index)}
                          className="text-destructive hover:text-destructive hover:bg-destructive/10"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>

                    <FormField
                      control={form.control}
                      name={`upsells2.${index}.isActive`}
                      render={({ field }) => (
                        <FormItem>
                          <div className="flex items-center space-x-4 rounded-md border p-4 bg-muted/30">
                            <div className="flex-1 space-y-1">
                              <FormLabel className="text-base font-semibold">Ativar este UPSELL 2.0</FormLabel>
                              <p className="text-sm text-muted-foreground">
                                Habilite para disparar esta mensagem assim que o tempo pós-cadastro expirar.
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

                    <div className="flex items-center gap-3">
                      <Label className="font-medium">Enviar após o cadastro:</Label>
                      <FormField
                        control={form.control}
                        name={`upsells2.${index}.upsellDelayMinutes`}
                        render={({ field }) => (
                          <FormItem>
                            <FormControl>
                              <div className="flex items-center gap-2">
                                <Input type="number" className="w-24 text-center font-bold" {...field} />
                                <span className="text-sm font-medium text-muted-foreground">minutos</span>
                              </div>
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    <FormField
                      control={form.control}
                      name={`upsells2.${index}.upsellMessage`}
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Mensagem de Upsell 2.0</FormLabel>
                          <p className="text-xs text-muted-foreground mb-2">
                            Quebras de linha e caracteres especiais serão formatados com segurança no padrão JSON de envio da API.
                          </p>
                          <FormControl>
                            <Textarea
                              placeholder="Digite sua mensagem de upsell..."
                              className="min-h-[140px] font-mono text-sm"
                              {...field}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <div className="space-y-2 pt-2 border-t">
                      <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Variáveis Disponíveis para Copiar</Label>
                      <div className="flex flex-wrap gap-2">
                        {['{cliente}', '{telefone}', '{email}', '{assinatura}', '{vencimento}', '{valor}', '{senha}', '{tela}', '{pin_tela}', '{status}'].map((variable) => (
                          <Button
                            key={variable}
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => copyVariableToClipboard(variable)}
                            className="text-xs font-mono gap-1 hover:bg-emerald-50 hover:text-emerald-700 dark:hover:bg-emerald-950/40"
                          >
                            <Copy className="h-3 w-3" />
                            {variable}
                          </Button>
                        ))}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            <div className="flex justify-end gap-4 pt-4 border-t">
              <Button type="submit" size="lg" className="gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold px-8 shadow-md">
                <CheckCircle2 className="h-5 w-5" />
                Salvar Configurações Upsell 2.0
              </Button>
            </div>
          </form>
        </Form>
      </main>
    </div>
  );
}
