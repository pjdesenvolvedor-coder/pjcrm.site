 homeland
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
import { AlertTriangle, ShieldAlert } from 'lucide-react';
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
        instanceId: `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
        updatedAt: serverTimestamp(),
      };
      setDocumentNonBlocking(alertDocRef, newAlertData, { merge: false });
      toast({
        title: data.isActive ? 'Sistema Bloqueado!' : 'Bloqueio Removido!',
        description: data.isActive 
            ? 'O modo de manutenção foi ativado para todos os usuários.' 
            : 'O sistema foi liberado para uso normal.',
      });
    }
  };

  if (isLoading) {
    return (
      <div className="flex flex-col h-full">
        <PageHeader
          title="Manutenção e Bloqueio Global"
          description="Controle o acesso geral ao sistema."
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
        title="Manutenção e Bloqueio Global"
        description="Controle o acesso geral ao sistema."
      />
      <main className="flex-1 overflow-auto p-4 md:p-6">
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)}>
            <Card className="border-destructive/20">
              <CardHeader className="bg-destructive/5">
                  <CardTitle className="flex items-center gap-2 text-destructive">
                      <ShieldAlert className="h-5 w-5" />
                      Modo de Manutenção Crítica
                  </CardTitle>
                  <CardDescription>
                      Ao ativar esta opção, o sistema exibirá uma tela fosca para TODOS os usuários, impedindo qualquer ação. Use isso quando as cotas diárias esgotarem ou para atualizações.
                  </CardDescription>
              </CardHeader>
              <CardContent className="pt-6 space-y-6">
                <FormField
                  control={form.control}
                  name="isActive"
                  render={({ field }) => (
                    <FormItem>
                      <div className="flex items-center space-x-4 rounded-md border p-4 bg-background">
                        <AlertTriangle className="h-6 w-6 text-destructive" />
                        <div className="flex-1 space-y-1">
                          <FormLabel className="text-base font-bold">Bloquear Todo o Sistema</FormLabel>
                          <p className="text-sm text-muted-foreground">
                            Ative para travar a navegação e exibir o aviso global.
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
                      <FormLabel>Mensagem Exibida no Bloqueio</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder="Ex: Atualização do sistema. Aguarde até 00:01..."
                          className="min-h-40"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <Button 
                    type="submit" 
                    variant={form.watch('isActive') ? 'destructive' : 'default'}
                    className="w-full md:w-auto"
                    disabled={form.formState.isSubmitting}
                >
                  {form.watch('isActive') ? 'Ativar Bloqueio Agora' : 'Salvar e Liberar Sistema'}
                </Button>
              </CardContent>
            </Card>
          </form>
        </Form>
      </main>
    </div>
  );
}
