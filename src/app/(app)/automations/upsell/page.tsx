
'use client';

import { useEffect } from 'react';
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
import { Rocket } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';

const upsellSchema = z.object({
  isUpsellActive: z.boolean().default(false),
  upsellDelayMinutes: z.coerce.number().min(0).default(5),
  upsellMessage: z.string().optional(),
});

type UpsellFormData = z.infer<typeof upsellSchema>;

const availableVariables = ["{cliente}", "{telefone}", "{email}", "{assinatura}", "{vencimento}", "{valor}", "{status}"];

export default function UpsellPage() {
  const { firestore } = useFirebase();
  const { user } = useUser();
  const { toast } = useToast();

  const settingsDocRef = useMemoFirebase(() => {
    if (!user) return null;
    return doc(firestore, 'users', user.uid, 'settings', 'config');
  }, [firestore, user]);

  const { data: settings, isLoading } = useDoc<Settings>(settingsDocRef);

  const form = useForm<UpsellFormData>({
    resolver: zodResolver(upsellSchema),
    defaultValues: {
      isUpsellActive: false,
      upsellDelayMinutes: 5,
      upsellMessage: '',
    },
  });

  useEffect(() => {
    if (settings) {
      form.reset({
        isUpsellActive: settings.isUpsellActive ?? false,
        upsellDelayMinutes: settings.upsellDelayMinutes ?? 5,
        upsellMessage: settings.upsellMessage ?? '',
      });
    }
  }, [settings, form]);

  const onSubmit = (data: UpsellFormData) => {
    if (settingsDocRef) {
      setDocumentNonBlocking(settingsDocRef, data, { merge: true });
      toast({
        title: 'Configurações de UPSELL Salvas!',
        description: 'Sua automação de upsell foi configurada com sucesso.',
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
          title="Automação de UPSELL"
          description="Aumente seu ticket médio oferecendo novos produtos logo após o cadastro."
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
        title="Automação de UPSELL"
        description="Aumente seu ticket médio oferecendo novos produtos logo após o cadastro."
      />
      <main className="flex-1 overflow-auto p-4 md:p-6">
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <Card>
              <CardContent className="pt-6 space-y-6">
                <FormField
                  control={form.control}
                  name="isUpsellActive"
                  render={({ field }) => (
                    <FormItem>
                      <div className="flex items-center space-x-4 rounded-md border p-4">
                        <Rocket className="h-6 w-6 text-primary" />
                        <div className="flex-1 space-y-1">
                          <FormLabel className="text-base">Ativar UPSELL Automático</FormLabel>
                          <p className="text-sm text-muted-foreground">
                            Envia uma mensagem automática para o cliente após x minutos do cadastro.
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

                <div className="flex items-center gap-2">
                    <Label>Enviar após</Label>
                    <FormField
                    control={form.control}
                    name="upsellDelayMinutes"
                    render={({ field }) => (
                        <FormItem>
                            <FormControl>
                                <Input type="number" className="w-20" {...field} />
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                    )}
                    />
                    <Label>minutos do cadastro.</Label>
                </div>

                <FormField
                  control={form.control}
                  name="upsellMessage"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Mensagem de UPSELL</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder="Olá {cliente}, vi que você acabou de entrar! Tenho uma oferta especial..."
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
                  Salvar Configurações de UPSELL
                </Button>
              </CardContent>
            </Card>
          </form>
        </Form>
      </main>
    </div>
  );
}
