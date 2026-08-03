'use client';

import { useState, useEffect } from 'react';
import { doc } from 'firebase/firestore';
import { useFirebase, useUser, useDoc, setDocumentNonBlocking, useMemoFirebase } from '@/firebase';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import type { Settings } from '@/lib/types';
import { Skeleton } from '@/components/ui/skeleton';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Rocket, Plus, Trash2, Send, RefreshCw } from 'lucide-react';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';

const upsellConfigSchema = z.object({
  id: z.string(),
  isActive: z.boolean().default(false),
  upsellDelayMinutes: z.coerce.number().min(0).default(5),
  upsellMessage: z.string().optional(),
  createdAt: z.number().optional(),
});

const upsellSchema = z.object({
  upsells: z.array(upsellConfigSchema),
});

type UpsellFormData = z.infer<typeof upsellSchema>;

const availableVariables = ["{cliente}", "{telefone}", "{email}", "{senha}", "{tela}", "{assinatura}", "{vencimento}", "{valor}", "{status}"];

export default function UpsellPage() {
  const { firestore } = useFirebase();
  const { user } = useUser();
  const { toast } = useToast();

  const [testDialogOpen, setTestDialogOpen] = useState(false);
  const [testRuleData, setTestRuleData] = useState<any>(null);
  const [testPhone, setTestPhone] = useState('8791791807');
  const [isSendingTest, setIsSendingTest] = useState(false);

  const settingsDocRef = useMemoFirebase(() => {
    if (!user) return null;
    return doc(firestore, 'users', user.uid, 'settings', 'config');
  }, [firestore, user]);

  const { data: settings, isLoading } = useDoc<Settings>(settingsDocRef);

  const form = useForm<UpsellFormData>({
    resolver: zodResolver(upsellSchema),
    defaultValues: {
      upsells: [],
    },
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "upsells",
  });

  useEffect(() => {
    if (settings) {
      if (settings.upsells && settings.upsells.length > 0) {
        form.reset({ upsells: settings.upsells });
      } else if (settings.upsellMessage) {
        form.reset({
          upsells: [{
            id: 'legacy-1',
            isActive: settings.isUpsellActive ?? true,
            upsellDelayMinutes: settings.upsellDelayMinutes ?? 5,
            upsellMessage: settings.upsellMessage ?? '',
            createdAt: Date.now(),
          }]
        });
      } else if (fields.length === 0) {
        form.reset({ upsells: [{ id: crypto.randomUUID(), isActive: true, upsellDelayMinutes: 5, upsellMessage: '', createdAt: Date.now() }] });
      }
    }
  }, [settings, form]);

  const onSubmit = (data: UpsellFormData) => {
    if (settingsDocRef) {
      const existingUpsells = settings?.upsells || [];
      const now = Date.now();
      
      const updatedUpsells = data.upsells.map((u, index) => {
        const existing = existingUpsells[index] || existingUpsells.find(ex => ex.id === u.id);
        const permanentId = existing?.id || (u.id && typeof u.id === 'string' && u.id.trim() ? u.id.trim() : crypto.randomUUID());
        const permanentCreatedAt = existing?.createdAt || u.createdAt || now;

        return {
          ...u,
          id: permanentId,
          ruleId: permanentId,
          upsellDelayMinutes: Number(u.upsellDelayMinutes) || 0,
          createdAt: Number(permanentCreatedAt) || now
        };
      });

      setDocumentNonBlocking(settingsDocRef, { upsells: updatedUpsells }, { merge: true });
      toast({
        title: 'Configurações de UPSELL Salvas! 🚀',
        description: 'Suas regras de upsell foram gravadas e o robô de envio disparará nos horários configurados.',
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
      isActive: true,
      upsellDelayMinutes: 5,
      upsellMessage: '',
      createdAt: Date.now(),
    });
  };

  const handleOpenTestModal = (ruleIndex: number) => {
    const currentUpsells = form.getValues('upsells');
    const rule = currentUpsells[ruleIndex];
    if (!rule || !rule.upsellMessage?.trim()) {
      toast({
        title: 'Mensagem vazia!',
        description: 'Escreva uma mensagem antes de testar.',
        variant: 'destructive',
      });
      return;
    }

    setTestRuleData(rule);
    setTestDialogOpen(true);
  };

  const handleExecuteRuleTest = async () => {
    const token = settings?.webhookToken || settings?.billingWebhookToken;
    if (!token) {
      toast({
        title: 'Token não configurado!',
        description: 'Configure seu Token UAZAPI em Configurações > Tokens antes de testar.',
        variant: 'destructive',
      });
      return;
    }

    if (!testPhone.trim()) {
      toast({
        title: 'Telefone inválido',
        description: 'Preencha o número para envio de teste.',
        variant: 'destructive',
      });
      return;
    }

    setIsSendingTest(true);
    let msg = testRuleData?.upsellMessage || '';
    msg = msg
      .replace(/{cliente}/g, 'Cliente Teste')
      .replace(/{telefone}/g, testPhone.trim())
      .replace(/{email}/g, 'cliente@email.com')
      .replace(/{senha}/g, '123456')
      .replace(/{tela}/g, 'Perfil 1')
      .replace(/{assinatura}/g, 'Netflix Ultra HD')
      .replace(/{vencimento}/g, '30/12/2026')
      .replace(/{valor}/g, '35,00')
      .replace(/{status}/g, 'Ativo');

    try {
      const res = await fetch('/api/send-message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phoneNumber: testPhone.trim(),
          message: msg,
          token: token,
        }),
      });

      const json = await res.json();
      if (res.ok && json.success) {
        toast({
          title: 'Teste enviado com sucesso! 🚀',
          description: `Mensagem disparada para ${testPhone.trim()}`,
        });
        setTestDialogOpen(false);
      } else {
        toast({
          title: 'Erro ao enviar teste',
          description: json.error || json.details || 'Falha ao comunicar com UAZAPI',
          variant: 'destructive',
        });
      }
    } catch (err: any) {
      toast({
        title: 'Erro no servidor',
        description: err.message || String(err),
        variant: 'destructive',
      });
    } finally {
      setIsSendingTest(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex flex-col h-full">
        <PageHeader
          title="Automação de UPSELL"
          description="Aumente seu ticket médio oferecendo novos produtos após o cadastro do cliente."
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
        title="Automação de UPSELL 🚀"
        description="Configure sequências de mensagens automáticas com temporizador para aumentar seu faturamento."
      >
        <Button size="sm" onClick={handleAddUpsell} className="gap-2 bg-emerald-600 hover:bg-emerald-700 text-white">
            <Plus className="h-4 w-4" />
            Adicionar Mais Upsell
        </Button>
      </PageHeader>
      <main className="flex-1 overflow-auto p-4 md:p-6 space-y-6">
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <div className="space-y-6">
                {fields.map((field, index) => (
                    <Card key={field.id} className="border-border/60">
                        <CardContent className="pt-6 space-y-6">
                            <div className="flex justify-between items-center">
                                <h3 className="font-semibold text-lg flex items-center gap-2">
                                    <Rocket className="h-5 w-5 text-emerald-500" />
                                    Regra de Upsell #{index + 1}
                                </h3>
                                <div className="flex items-center gap-2">
                                    <Button
                                      type="button"
                                      variant="outline"
                                      size="sm"
                                      onClick={() => handleOpenTestModal(index)}
                                      className="gap-2 text-emerald-600 border-emerald-500/30 hover:bg-emerald-500/10"
                                    >
                                      <Send className="h-3.5 w-3.5" />
                                      Testar Esta Regra 🚀
                                    </Button>

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
                            </div>

                            <FormField
                                control={form.control}
                                name={`upsells.${index}.isActive`}
                                render={({ field }) => (
                                    <FormItem>
                                    <div className="flex items-center space-x-4 rounded-md border p-4">
                                        <div className="flex-1 space-y-1">
                                        <FormLabel className="text-base">Ativar esta Regra</FormLabel>
                                        <p className="text-sm text-muted-foreground">
                                            Habilite para disparar esta mensagem no tempo programado.
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

                            <div className="flex items-center gap-2 bg-muted/30 p-3 rounded-lg border">
                                <Label className="text-sm font-medium">Enviar exatamente após</Label>
                                <FormField
                                    control={form.control}
                                    name={`upsells.${index}.upsellDelayMinutes`}
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormControl>
                                                <Input type="number" className="w-24 text-center font-bold" min={0} {...field} />
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                                <Label className="text-sm font-medium">minutos do cadastro do cliente.</Label>
                            </div>

                            <FormField
                                control={form.control}
                                name={`upsells.${index}.upsellMessage`}
                                render={({ field }) => (
                                    <FormItem>
                                    <FormLabel className="font-semibold">Mensagem de UPSELL</FormLabel>
                                    <FormControl>
                                        <Textarea
                                        placeholder="Olá {cliente}, vi que você acabou de entrar! Tenho uma oferta especial para você..."
                                        className="min-h-32 font-mono text-sm"
                                        {...field}
                                        />
                                    </FormControl>
                                    <FormMessage />
                                    </FormItem>
                                )}
                            />
                        </CardContent>
                    </Card>
                ))}
            </div>
            
            {fields.length > 0 && (
                <div className="space-y-4">
                    <Card>
                        <CardContent className="pt-6">
                            <Label className="text-sm font-semibold">Variáveis disponíveis para personalização:</Label>
                            <div className="flex flex-wrap gap-2 mt-3">
                                {availableVariables.map(variable => (
                                    <Badge 
                                        key={variable} 
                                        variant="outline" 
                                        className="cursor-pointer hover:bg-emerald-500/10 hover:border-emerald-500 text-xs py-1"
                                        onClick={() => copyVariableToClipboard(variable)}
                                    >
                                        {variable}
                                    </Badge>
                                ))}
                            </div>
                        </CardContent>
                    </Card>
                    
                    <Button type="submit" disabled={form.formState.isSubmitting} className="w-full md:w-auto bg-emerald-600 hover:bg-emerald-700 text-white gap-2 font-bold">
                        <Rocket className="h-4 w-4" />
                        Salvar Todas as Regras de UPSELL 🚀
                    </Button>
                </div>
            )}
          </form>
        </Form>
      </main>

      {/* MODAL DE TESTE RÁPIDO */}
      <Dialog open={testDialogOpen} onOpenChange={setTestDialogOpen}>
        <DialogContent className="sm:max-w-[500px] max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-emerald-600">
              <Rocket className="h-5 w-5" />
              Testar Envio Desta Regra
            </DialogTitle>
            <DialogDescription>
              Informe o WhatsApp para receber a mensagem de teste imediatamente.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-3">
            <div className="space-y-2">
              <Label htmlFor="test-phone">Número de WhatsApp (com DDD)</Label>
              <Input
                id="test-phone"
                placeholder="Ex: 8791791807"
                value={testPhone}
                onChange={(e) => setTestPhone(e.target.value)}
              />
            </div>

            <div className="bg-muted p-3 rounded-md space-y-1.5 text-xs">
              <span className="font-semibold text-foreground">Prévia da Mensagem:</span>
              <p className="whitespace-pre-wrap font-mono text-muted-foreground">
                {(testRuleData?.upsellMessage || '')
                  .replace(/{cliente}/g, 'Cliente Teste')
                  .replace(/{telefone}/g, testPhone.trim())
                  .replace(/{email}/g, 'cliente@email.com')
                  .replace(/{senha}/g, '123456')
                  .replace(/{tela}/g, 'Perfil 1')
                  .replace(/{assinatura}/g, 'Netflix Ultra HD')
                  .replace(/{vencimento}/g, '30/12/2026')
                  .replace(/{valor}/g, '35,00')
                  .replace(/{status}/g, 'Ativo')}
              </p>
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="ghost" onClick={() => setTestDialogOpen(false)} disabled={isSendingTest}>
              Cancelar
            </Button>
            <Button
              onClick={handleExecuteRuleTest}
              disabled={isSendingTest}
              className="bg-emerald-600 hover:bg-emerald-700 text-white gap-2 font-bold"
            >
              {isSendingTest ? (
                <>
                  <RefreshCw className="h-4 w-4 animate-spin" />
                  Enviando Teste...
                </>
              ) : (
                <>
                  <Send className="h-4 w-4" />
                  Enviar Teste Agora 🚀
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
