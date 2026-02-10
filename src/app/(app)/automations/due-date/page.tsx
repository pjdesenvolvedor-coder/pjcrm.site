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
import { Bot } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';

const dueDateMessageSchema = z.object({
  isDueDateMessageActive: z.boolean().default(false),
  dueDateMessage: z.string().optional(),
});

type DueDateMessageFormData = z.infer<typeof dueDateMessageSchema>;

const availableVariables = ["{cliente}", "{telefone}", "{email}", "{assinatura}", "{vencimento}", "{valor}", "{status}"];

export default function DueDateMessagePage() {
  const { firestore } = useFirebase();
  const { user } = useUser();
  const { toast } = useToast();

  const settingsDocRef = useMemoFirebase(() => {
    if (!user) return null;
    return doc(firestore, 'users', user.uid, 'settings', 'config');
  }, [firestore, user]);

  const { data: settings, isLoading } = useDoc<Settings>(settingsDocRef);

  const form = useForm<DueDateMessageFormData>({
    resolver: zodResolver(dueDateMessageSchema),
    defaultValues: {
      isDueDateMessageActive: false,
      dueDateMessage: '',
    },
  });

  useEffect(() => {
    if (settings) {
      form.reset({
        isDueDateMessageActive: settings.isDueDateMessageActive ?? false,
        dueDateMessage: settings.dueDateMessage ?? '',
      });
    }
  }, [settings, form]);

  const onSubmit = (data: DueDateMessageFormData) => {
    if (settingsDocRef) {
      setDocumentNonBlocking(settingsDocRef, data, { merge: true });
      toast({
        title: 'Configurações Salvas!',
        description: 'Suas configurações de mensagem de vencimento foram salvas com sucesso.',
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
          title="Configuração da Mensagem de Vencimento"
          description="Esta mensagem será enviada automaticamente para o cliente assim que a assinatura vencer."
        />
        <main className="flex-1 overflow-auto p-4 md:p-6">
          <Card>
            <CardContent className="pt-6 space-y-6">
                <Skeleton className="h-12 w-full" />
                <div className="space-y-2">
                    <Skeleton className="h-6 w-1/4" />
                    <Skeleton className="h-32 w-full" />
                </div>
                 <Skeleton className="h-9 w-48" />
            </CardContent>
          </Card>
        </main>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title="Configuração da Mensagem de Vencimento"
        description="Esta mensagem será enviada automaticamente para o cliente assim que a assinatura vencer."
      />
      <main className="flex-1 overflow-auto p-4 md:p-6">
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)}>
            <Card>
              <CardContent className="pt-6 space-y-6">
                <FormField
                  control={form.control}
                  name="isDueDateMessageActive"
                  render={({ field }) => (
                    <FormItem>
                      <div className="flex items-center space-x-4 rounded-md border p-4">
                        <Bot className="h-6 w-6" />
                        <div className="flex-1 space-y-1">
                          <FormLabel className="text-base">Ativar Mensagem de Vencimento</FormLabel>
                          <p className="text-sm text-muted-foreground">
                            Habilite para enviar a mensagem quando a fatura vencer.
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
                  name="dueDateMessage"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Mensagem de Vencimento</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder="Digite sua mensagem aqui..."
                          className="min-h-32"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <div>
                    <Label className="text-sm">Variáveis disponíveis:</Label>
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
                
                <Button type="submit" disabled={form.formState.isSubmitting}>
                  Salvar Todas as Configurações
                </Button>
              </CardContent>
            </Card>
          </form>
        </Form>
      </main>
    </div>
  );
}
