
'use client';

import { useEffect } from 'react';
import { doc, serverTimestamp } from 'firebase/firestore';
import { useFirebase, useUser, useDoc, setDocumentNonBlocking, useMemoFirebase } from '@/firebase';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import type { SystemMaintenance } from '@/lib/types';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { ShieldAlert, AlertTriangle } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';

const maintenanceSchema = z.object({
  isActive: z.boolean().default(false),
  message: z.string().min(1, 'A mensagem não pode estar vazia.'),
});

type MaintenanceFormData = z.infer<typeof maintenanceSchema>;

export default function MaintenancePage() {
  const { firestore } = useFirebase();
  const { user } = useUser();
  const { toast } = useToast();

  const maintenanceDocRef = useMemoFirebase(() => {
    if (!firestore) return null;
    return doc(firestore, 'system_maintenance', 'current');
  }, [firestore]);

  const { data: maintenanceData, isLoading } = useDoc<SystemMaintenance>(maintenanceDocRef);

  const form = useForm<MaintenanceFormData>({
    resolver: zodResolver(maintenanceSchema),
    defaultValues: {
      isActive: false,
      message: 'Atualização do sistema. Aguarde até 00:01...',
    },
  });

  useEffect(() => {
    if (maintenanceData) {
      form.reset({
        isActive: maintenanceData.isActive ?? false,
        message: maintenanceData.message ?? 'Atualização do sistema. Aguarde até 00:01...',
      });
    }
  }, [maintenanceData, form]);

  const onSubmit = (data: MaintenanceFormData) => {
    if (maintenanceDocRef) {
      setDocumentNonBlocking(maintenanceDocRef, {
        ...data,
        updatedAt: serverTimestamp(),
      }, { merge: true });
      
      toast({
        title: data.isActive ? 'Manutenção Ativada!' : 'Manutenção Desativada!',
        description: data.isActive 
            ? 'O sistema está bloqueado para todos os agentes.' 
            : 'O sistema foi liberado para uso.',
      });
    }
  };

  if (isLoading) {
    return (
      <div className="flex flex-col h-full">
        <PageHeader title="Modo Manutenção" />
        <main className="flex-1 p-4 md:p-6">
          <Card><CardContent className="pt-6"><Skeleton className="h-40 w-full" /></CardContent></Card>
        </main>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title="Modo Manutenção"
        description="Bloqueie o acesso total ao sistema para todos os usuários."
      />
      <main className="flex-1 overflow-auto p-4 md:p-6">
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)}>
            <Card className="border-destructive/20">
              <CardHeader className="bg-destructive/5">
                  <CardTitle className="flex items-center gap-2 text-destructive">
                      <ShieldAlert className="h-5 w-5" />
                      Bloqueio Total do Sistema
                  </CardTitle>
                  <CardDescription>
                      Ao ativar esta opção, o sistema exibirá uma tela fosca para TODOS os agentes, impedindo qualquer ação. Administradores continuam com acesso livre.
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
                          <FormLabel className="text-base font-bold">Ativar Bloqueio Crítico</FormLabel>
                          <p className="text-sm text-muted-foreground">Trava a navegação e exibe o aviso global de manutenção.</p>
                        </div>
                        <FormControl>
                          <Switch checked={field.value} onCheckedChange={field.onChange} />
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
                      <FormLabel>Mensagem de Bloqueio</FormLabel>
                      <FormControl>
                        <Textarea placeholder="Ex: Manutenção agendada..." className="min-h-32" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <Button 
                    type="submit" 
                    variant={form.watch('isActive') ? 'destructive' : 'default'}
                    disabled={form.formState.isSubmitting}
                >
                  {form.watch('isActive') ? 'Bloquear Agora' : 'Salvar e Manter Liberado'}
                </Button>
              </CardContent>
            </Card>
          </form>
        </Form>
      </main>
    </div>
  );
}
