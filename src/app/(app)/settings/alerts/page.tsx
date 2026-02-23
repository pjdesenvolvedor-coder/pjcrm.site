'use client';

import { useState, useEffect } from 'react';
import { doc, serverTimestamp } from 'firebase/firestore';
import { useFirebase, useUser, useDoc, setDocumentNonBlocking, useMemoFirebase } from '@/firebase';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import type { SystemAlert } from '@/lib/types';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { AlertTriangle } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';

const alertSchema = z.object({
  isActive: z.boolean().default(false),
  message: z.string().min(1, 'A mensagem não pode estar vazia.'),
});

type AlertFormData = z.infer<typeof alertSchema>;

export default function SystemAlertsPage() {
  const { firestore } = useFirebase();
  const { user } = useUser();
  const { toast } = useToast();

  const alertDocRef = useMemoFirebase(() => {
    if (!firestore) return null;
    return doc(firestore, 'system_alerts', 'current');
  }, [firestore]);

  const { data: currentAlert, isLoading } = useDoc<SystemAlert>(alertDocRef);

  const form = useForm<AlertFormData>({
    resolver: zodResolver(alertSchema),
    defaultValues: {
      isActive: false,
      message: '',
    },
  });

  useEffect(() => {
    if (currentAlert) {
      form.reset({
        isActive: currentAlert.isActive ?? false,
        message: currentAlert.message ?? '',
      });
    }
  }, [currentAlert, form]);

  const onSubmit = (data: AlertFormData) => {
    if (alertDocRef) {
      const newAlertData = {
        ...data,
        // By generating a new unique ID every time, we ensure that every user will see the new alert,
        // because their stored 'dismissedAlertId' in localStorage will no longer match.
        instanceId: `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
        updatedAt: serverTimestamp(),
      };
      setDocumentNonBlocking(alertDocRef, newAlertData, { merge: false }); // Overwrite completely
      toast({
        title: 'Alerta Salvo!',
        description: 'O aviso do sistema foi atualizado com sucesso.',
      });
    }
  };

  if (isLoading) {
    return (
      <div className="flex flex-col h-full">
        <PageHeader
          title="Configuração do Alerta Global"
          description="Crie um aviso que será exibido para todos os usuários ao acessarem o sistema."
        />
        <main className="flex-1 overflow-auto p-4 md:p-6">
          <Card>
            <CardContent className="pt-6 space-y-6">
                <Skeleton className="h-24 w-full" />
                <Skeleton className="h-32 w-full" />
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
        title="Configuração do Alerta Global"
        description="Crie um aviso que será exibido para todos os usuários ao acessarem o sistema."
      />
      <main className="flex-1 overflow-auto p-4 md:p-6">
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)}>
            <Card>
              <CardContent className="pt-6 space-y-6">
                <FormField
                  control={form.control}
                  name="isActive"
                  render={({ field }) => (
                    <FormItem>
                      <div className="flex items-center space-x-4 rounded-md border p-4">
                        <AlertTriangle className="h-6 w-6 text-destructive" />
                        <div className="flex-1 space-y-1">
                          <FormLabel className="text-base">Ativar Alerta Global</FormLabel>
                          <p className="text-sm text-muted-foreground">
                            Habilite para exibir a mensagem para todos os usuários.
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
                  name="message"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Mensagem do Alerta</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder="Digite o aviso aqui..."
                          className="min-h-40"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <Button type="submit" disabled={form.formState.isSubmitting}>
                  Salvar e Publicar Alerta
                </Button>
              </CardContent>
            </Card>
          </form>
        </Form>
      </main>
    </div>
  );
}
