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
import { AlarmClock, UserPlus } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';

const remarketingSchema = z.object({
  isPostDueDateRemarketingActive: z.boolean().default(false),
  postDueDateRemarketingDays: z.coerce.number().min(0).optional(),
  postDueDateRemarketingMessage: z.string().optional(),
  isPostSignupRemarketingActive: z.boolean().default(false),
  postSignupRemarketingDays: z.coerce.number().min(0).optional(),
  postSignupRemarketingMessage: z.string().optional(),
});

type RemarketingFormData = z.infer<typeof remarketingSchema>;

const availableVariables = ["{cliente}", "{telefone}", "{email}", "{assinatura}", "{vencimento}", "{valor}", "{status}"];

export default function RemarketingPage() {
  const { firestore } = useFirebase();
  const { user } = useUser();
  const { toast } = useToast();

  const settingsDocRef = useMemoFirebase(() => {
    if (!user) return null;
    return doc(firestore, 'users', user.uid, 'settings', 'config');
  }, [firestore, user]);

  const { data: settings, isLoading } = useDoc<Settings>(settingsDocRef);

  const form = useForm<RemarketingFormData>({
    resolver: zodResolver(remarketingSchema),
    defaultValues: {
      isPostDueDateRemarketingActive: false,
      postDueDateRemarketingDays: 3,
      postDueDateRemarketingMessage: '',
      isPostSignupRemarketingActive: false,
      postSignupRemarketingDays: 3,
      postSignupRemarketingMessage: '',
    },
  });

  useEffect(() => {
    if (settings) {
      form.reset({
        isPostDueDateRemarketingActive: settings.isPostDueDateRemarketingActive ?? false,
        postDueDateRemarketingDays: settings.postDueDateRemarketingDays ?? 3,
        postDueDateRemarketingMessage: settings.postDueDateRemarketingMessage ?? '',
        isPostSignupRemarketingActive: settings.isPostSignupRemarketingActive ?? false,
        postSignupRemarketingDays: settings.postSignupRemarketingDays ?? 3,
        postSignupRemarketingMessage: settings.postSignupRemarketingMessage ?? '',
      });
    }
  }, [settings, form]);

  const onSubmit = (data: RemarketingFormData) => {
    if (settingsDocRef) {
      setDocumentNonBlocking(settingsDocRef, data, { merge: true });
      toast({
        title: 'Configurações Salvas!',
        description: 'Suas configurações de remarketing foram salvas com sucesso.',
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
          title="Automação de Remarketing"
          description="Reengaje seus clientes com mensagens automáticas estratégicas."
        />
        <main className="flex-1 overflow-auto p-4 md:p-6 space-y-6">
          <Card>
            <CardContent className="pt-6 space-y-6">
                <Skeleton className="h-24 w-full" />
                <Skeleton className="h-32 w-full" />
            </CardContent>
          </Card>
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
        title="Automação de Remarketing"
        description="Reengaje seus clientes com mensagens automáticas estratégicas."
      />
      <main className="flex-1 overflow-auto p-4 md:p-6">
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <Card>
              <CardContent className="pt-6 space-y-6">
                <h2 className="text-xl font-semibold">Remarketing Pós-Vencimento</h2>
                <p className="text-sm text-muted-foreground -mt-4">Envie uma mensagem para clientes um tempo após a assinatura deles ter vencido.</p>
                <FormField
                  control={form.control}
                  name="isPostDueDateRemarketingActive"
                  render={({ field }) => (
                    <FormItem>
                      <div className="flex items-center space-x-4 rounded-md border p-4">
                        <AlarmClock className="h-6 w-6" />
                        <div className="flex-1 space-y-1">
                          <FormLabel className="text-base">Ativar Remarketing Pós-Vencimento</FormLabel>
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
                <div className="flex items-center gap-2">
                    <Label>Enviar após</Label>
                    <FormField
                    control={form.control}
                    name="postDueDateRemarketingDays"
                    render={({ field }) => (
                        <FormItem>
                            <FormControl>
                                <Input type="number" className="w-20" {...field} />
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                    )}
                    />
                    <Label>dias do vencimento.</Label>
                </div>
                <FormField
                  control={form.control}
                  name="postDueDateRemarketingMessage"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Mensagem de Remarketing</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder="Olá {cliente}, notamos que sua assinatura venceu..."
                          className="min-h-32"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-6 space-y-6">
                <h2 className="text-xl font-semibold">Remarketing Pós-Cadastro</h2>
                <p className="text-sm text-muted-foreground -mt-4">Envie uma mensagem de boas-vindas ou um lembrete para novos clientes após um tempo do cadastro.</p>
                <FormField
                  control={form.control}
                  name="isPostSignupRemarketingActive"
                  render={({ field }) => (
                    <FormItem>
                      <div className="flex items-center space-x-4 rounded-md border p-4">
                        <UserPlus className="h-6 w-6" />
                        <div className="flex-1 space-y-1">
                          <FormLabel className="text-base">Ativar Remarketing Pós-Cadastro</FormLabel>
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
                <div className="flex items-center gap-2">
                    <Label>Enviar após</Label>
                    <FormField
                    control={form.control}
                    name="postSignupRemarketingDays"
                    render={({ field }) => (
                        <FormItem>
                            <FormControl>
                                <Input type="number" className="w-20" {...field} />
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                    )}
                    />
                    <Label>dias do cadastro.</Label>
                </div>

                <FormField
                  control={form.control}
                  name="postSignupRemarketingMessage"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Mensagem de Remarketing</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder="Olá {cliente}, bem-vindo! Que tal dar o próximo passo e ativar sua assinatura?"
                          className="min-h-32"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </CardContent>
            </Card>
            
            <div>
                <Label className="text-sm">Variáveis disponíveis para ambas as mensagens:</Label>
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
          </form>
        </Form>
      </main>
    </div>
  );
}
