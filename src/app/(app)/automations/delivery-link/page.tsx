
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
import { Link2 } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';

const deliveryLinkSchema = z.object({
  isDeliveryLinkAutomationActive: z.boolean().default(false),
  deliveryLinkMessage: z.string().optional(),
});

type DeliveryLinkFormData = z.infer<typeof deliveryLinkSchema>;

const availableVariables = [
    "{cliente}", 
    "{telefone}", 
    "{link}",
    "{assinatura}", 
    "{vencimento}", 
    "{valor}", 
    "{status}"
];

export default function DeliveryLinkPage() {
  const { firestore } = useFirebase();
  const { user } = useUser();
  const { toast } = useToast();

  const settingsDocRef = useMemoFirebase(() => {
    if (!user) return null;
    return doc(firestore, 'users', user.uid, 'settings', 'config');
  }, [firestore, user]);

  const { data: settings, isLoading } = useDoc<Settings>(settingsDocRef);

  const form = useForm<DeliveryLinkFormData>({
    resolver: zodResolver(deliveryLinkSchema),
    defaultValues: {
      isDeliveryLinkAutomationActive: false,
      deliveryLinkMessage: '',
    },
  });

  useEffect(() => {
    if (settings) {
      form.reset({
        isDeliveryLinkAutomationActive: settings.isDeliveryLinkAutomationActive ?? false,
        deliveryLinkMessage: settings.deliveryLinkMessage ?? '',
      });
    }
  }, [settings, form]);

  const onSubmit = (data: DeliveryLinkFormData) => {
    if (settingsDocRef) {
      setDocumentNonBlocking(settingsDocRef, data, { merge: true });
      toast({
        title: 'Configurações de Entrega (Link) Salvas!',
        description: 'Sua mensagem de entrega de link foi atualizada com sucesso.',
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
          title="Entrega LINK"
          description="Configure a mensagem com link de acesso."
        />
        <main className="flex-1 overflow-auto p-4 md:p-6">
          <Card>
            <CardContent className="pt-6 space-y-6">
                <Skeleton className="h-12 w-full" />
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
        title="Entrega LINK"
        description="Configure a mensagem automática com link de acesso para novos clientes."
      />
      <main className="flex-1 overflow-auto p-4 md:p-6">
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <Card>
              <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                      <Link2 className="h-5 w-5 text-primary" />
                      Status da Entrega (Link)
                  </CardTitle>
                  <CardDescription>
                      Esta mensagem será enviada quando você cadastrar um cliente usando a opção "Link de Acesso".
                  </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <FormField
                  control={form.control}
                  name="isDeliveryLinkAutomationActive"
                  render={({ field }) => (
                    <FormItem>
                      <div className="flex items-center space-x-4 rounded-md border p-4 bg-muted/30">
                        <div className="flex-1 space-y-1">
                          <FormLabel className="text-base">Ativar Entrega por Link</FormLabel>
                          <p className="text-sm text-muted-foreground">
                            Enviar mensagem com link logo após salvar o cliente.
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

                <FormField
                    control={form.control}
                    name="deliveryLinkMessage"
                    render={({ field }) => (
                        <FormItem>
                        <FormLabel>Mensagem de Entrega (Link)</FormLabel>
                        <CardDescription className="mb-2">Use as variáveis abaixo para incluir os dados de acesso.</CardDescription>
                        <FormControl>
                            <Textarea
                            placeholder="Olá {cliente}, aqui está seu link de acesso exclusivo:&#10;{link}"
                            className="min-h-48"
                            {...field}
                            />
                        </FormControl>
                        <FormMessage />
                        </FormItem>
                    )}
                />
                
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
                
                <Button type="submit" size="lg" disabled={form.formState.isSubmitting}>
                  Salvar Entrega LINK
                </Button>
              </CardContent>
            </Card>
          </form>
        </Form>
      </main>
    </div>
  );
}
