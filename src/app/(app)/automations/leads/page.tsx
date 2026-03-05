
'use client';

import { useEffect } from 'react';
import { doc } from 'firebase/firestore';
import { useFirebase, useUser, useDoc, setDocumentNonBlocking, useMemoFirebase } from '@/firebase';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import type { Settings } from '@/lib/types';
import { Skeleton } from '@/components/ui/skeleton';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { ShoppingCart, UserPlus, CheckCircle, XCircle } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';

const leadAutomationSchema = z.object({
  isLeadAutomationActive: z.boolean().default(false),
  leadInitialMessage: z.string().optional(),
  leadConvertedMessage: z.string().optional(),
  leadLostMessage: z.string().optional(),
});

type LeadAutomationFormData = z.infer<typeof leadAutomationSchema>;

const availableVariables = [
    "{cliente}", 
    "{telefone}", 
    "{assinatura_interesse}",
];

export default function LeadAutomationPage() {
  const { firestore } = useFirebase();
  const { user } = useUser();
  const { toast } = useToast();

  const settingsDocRef = useMemoFirebase(() => {
    if (!user) return null;
    return doc(firestore, 'users', user.uid, 'settings', 'config');
  }, [firestore, user]);

  const { data: settings, isLoading } = useDoc<Settings>(settingsDocRef);

  const form = useForm<LeadAutomationFormData>({
    resolver: zodResolver(leadAutomationSchema),
    defaultValues: {
      isLeadAutomationActive: false,
      leadInitialMessage: '',
      leadConvertedMessage: '',
      leadLostMessage: '',
    },
  });

  useEffect(() => {
    if (settings) {
      form.reset({
        isLeadAutomationActive: settings.isLeadAutomationActive ?? false,
        leadInitialMessage: settings.leadInitialMessage ?? '',
        leadConvertedMessage: settings.leadConvertedMessage ?? '',
        leadLostMessage: settings.leadLostMessage ?? '',
      });
    }
  }, [settings, form]);

  const onSubmit = (data: LeadAutomationFormData) => {
    if (settingsDocRef) {
      setDocumentNonBlocking(settingsDocRef, data, { merge: true });
      toast({
        title: 'Configurações de Leads Salvas!',
        description: 'Suas mensagens automáticas para o menu "Quer Comprar" foram configuradas.',
      });
    }
  };
  
  const copyVariableToClipboard = (variable: string) => {
    navigator.clipboard.writeText(variable);
    toast({
        title: 'Variável Copiada!',
        description: `A variável ${variable} foi copiada para a área de transferência.`,
    })
  }

  if (isLoading) {
    return (
      <div className="flex flex-col h-full">
        <PageHeader
          title="Automação de Vendas (Leads)"
          description="Configure as mensagens para quem quer comprar."
        />
        <main className="flex-1 overflow-auto p-4 md:p-6">
          <Card>
            <CardContent className="pt-6 space-y-6">
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-32 w-full" />
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
        title="Automação de Vendas (Leads)"
        description="Configure as mensagens para quem quer comprar."
      />
      <main className="flex-1 overflow-auto p-4 md:p-6">
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <Card>
              <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                      <ShoppingCart className="h-5 w-5 text-primary" />
                      Status das Mensagens
                  </CardTitle>
                  <CardDescription>
                      Habilite para enviar mensagens automáticas ao adicionar ou finalizar um interessado no menu "Quer Comprar".
                  </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <FormField
                  control={form.control}
                  name="isLeadAutomationActive"
                  render={({ field }) => (
                    <FormItem>
                      <div className="flex items-center space-x-4 rounded-md border p-4 bg-muted/30">
                        <div className="flex-1 space-y-1">
                          <FormLabel className="text-base">Ativar Automações de Lead</FormLabel>
                          <p className="text-sm text-muted-foreground">
                            Enviar saudações e retornos automáticos.
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

                <div className="grid gap-6">
                    <FormField
                        control={form.control}
                        name="leadInitialMessage"
                        render={({ field }) => (
                            <FormItem>
                            <FormLabel className="flex items-center gap-2"><UserPlus className="h-4 w-4" /> Mensagem: Novo Interesse (Boas-vindas)</FormLabel>
                            <CardDescription className="mb-2">Enviada assim que o lead é adicionado no menu.</CardDescription>
                            <FormControl>
                                <Textarea
                                placeholder="Olá {cliente}, vi que você tem interesse na assinatura {assinatura_interesse}! Como posso te ajudar?"
                                className="min-h-32"
                                {...field}
                                />
                            </FormControl>
                            <FormMessage />
                            </FormItem>
                        )}
                    />

                    <FormField
                        control={form.control}
                        name="leadConvertedMessage"
                        render={({ field }) => (
                            <FormItem>
                            <FormLabel className="flex items-center gap-2 text-green-600"><CheckCircle className="h-4 w-4" /> Mensagem: Venda Concluída ("Comprou")</FormLabel>
                            <CardDescription className="mb-2">Enviada ao clicar no botão verde de compra realizada.</CardDescription>
                            <FormControl>
                                <Textarea
                                placeholder="Parabéns {cliente}! Sua compra da assinatura {assinatura_interesse} foi confirmada. Seja bem-vindo!"
                                className="min-h-32"
                                {...field}
                                />
                            </FormControl>
                            <FormMessage />
                            </FormItem>
                        )}
                    />

                    <FormField
                        control={form.control}
                        name="leadLostMessage"
                        render={({ field }) => (
                            <FormItem>
                            <FormLabel className="flex items-center gap-2 text-destructive"><XCircle className="h-4 w-4" /> Mensagem: Venda Perdida ("Não Comprou")</FormLabel>
                            <CardDescription className="mb-2">Enviada ao clicar no botão vermelho de desistência.</CardDescription>
                            <FormControl>
                                <Textarea
                                placeholder="Olá {cliente}, que pena que não conseguimos fechar agora. Estaremos à disposição para quando decidir assinar {assinatura_interesse}!"
                                className="min-h-32"
                                {...field}
                                />
                            </FormControl>
                            <FormMessage />
                            </FormItem>
                        )}
                    />
                </div>
                
                <div>
                    <Label className="text-sm font-semibold">Variáveis disponíveis:</Label>
                    <div className="flex flex-wrap gap-2 mt-2">
                        {availableVariables.map(variable => (
                            <Badge 
                                key={variable} 
                                variant="outline" 
                                className="cursor-pointer hover:bg-accent"
                                onClick={() => copyVariableToClipboard(variable)}
                            >
                                {variable}
                            </Badge>
                        ))}
                    </div>
                </div>
                
                <Button type="submit" size="lg" disabled={form.formState.isSubmitting} className="w-full md:w-auto">
                  Salvar Todas as Configurações de Vendas
                </Button>
              </CardContent>
            </Card>
          </form>
        </Form>
      </main>
    </div>
  );
}
