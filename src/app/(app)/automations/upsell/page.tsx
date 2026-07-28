
'use client';

import { useEffect } from 'react';
import { doc } from 'firebase/firestore';
import { useFirebase, useUser, useDoc, setDocumentNonBlocking, useMemoFirebase } from '@/firebase';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import type { Settings, UpsellConfig } from '@/lib/types';
import { Skeleton } from '@/components/ui/skeleton';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Rocket, Plus, Trash2 } from 'lucide-react';
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
            isActive: settings.isUpsellActive ?? false,
            upsellDelayMinutes: settings.upsellDelayMinutes ?? 5,
            upsellMessage: settings.upsellMessage ?? '',
            createdAt: 0,
          }]
        });
      } else if (fields.length === 0) {
          form.reset({ upsells: [{ id: crypto.randomUUID(), isActive: false, upsellDelayMinutes: 5, upsellMessage: '', createdAt: Date.now() }] });
      }
    }
  }, [settings, form]);

  const onSubmit = (data: UpsellFormData) => {
    if (settingsDocRef) {
      const existingUpsellsMap = new Map((settings?.upsells || []).map(u => [u.id, u.createdAt]));
      const now = Date.now();
      
      const updatedUpsells = data.upsells.map(u => {
        const existingTimestamp = existingUpsellsMap.get(u.id) || u.createdAt;
        return {
          ...u,
          upsellDelayMinutes: Number(u.upsellDelayMinutes) || 0,
          createdAt: (existingTimestamp && Number(existingTimestamp) > 0) ? Number(existingTimestamp) : now
        };
      });

      setDocumentNonBlocking(settingsDocRef, { upsells: updatedUpsells }, { merge: true });
      toast({
        title: 'Configurações de UPSELL Salvas!',
        description: 'Suas automações de upsell foram configuradas e salvas com sucesso.',
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
      >
        <Button size="sm" onClick={handleAddUpsell} className="gap-2">
            <Plus className="h-4 w-4" />
            Adicionar Mais Upsell
        </Button>
      </PageHeader>
      <main className="flex-1 overflow-auto p-4 md:p-6 space-y-6">
        {/* Read-Only Informative Banner */}
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-md bg-amber-500/20 text-amber-600 dark:text-amber-400">
              <Rocket className="h-5 w-5" />
            </div>
            <div>
              <h3 className="font-semibold text-foreground text-sm flex items-center gap-2">
                Modo Somente Leitura (Funil Upsell 1.0)
                <Badge variant="outline" className="border-amber-500/40 text-amber-600 dark:text-amber-400">Desativado</Badge>
              </h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                Esta tela serve apenas para você visualizar e copiar as mensagens antigas. Nenhuma lógica do Upsell 1.0 está em execução.
              </p>
            </div>
          </div>
          <Button size="sm" className="gap-2 bg-emerald-600 hover:bg-emerald-700 text-white shrink-0" onClick={() => window.location.href = '/automations/upsell-2'}>
            <Rocket className="h-4 w-4" />
            Ir para Funil Upsell 2.0 🚀
          </Button>
        </div>

        <Form {...form}>
          <form onSubmit={(e) => e.preventDefault()} className="space-y-6">
            <div className="space-y-6">
                {fields.map((field, index) => (
                    <Card key={field.id}>
                        <CardContent className="pt-6 space-y-6">
                            <div className="flex justify-between items-center">
                                <h3 className="font-semibold text-lg flex items-center gap-2">
                                    <Rocket className="h-5 w-5 text-primary" />
                                    Upsell #{index + 1}
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
                                name={`upsells.${index}.isActive`}
                                render={({ field }) => (
                                    <FormItem>
                                    <div className="flex items-center space-x-4 rounded-md border p-4">
                                        <div className="flex-1 space-y-1">
                                        <FormLabel className="text-base">Ativar este UPSELL</FormLabel>
                                        <p className="text-sm text-muted-foreground">
                                            Habilite para enviar esta mensagem automática.
                                        </p>
                                        </div>
                                        <FormControl>
                                        <Switch
                                            checked={field.value}
                                            disabled={true}
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
                                    name={`upsells.${index}.upsellDelayMinutes`}
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormControl>
                                                <Input type="number" className="w-20" disabled={true} {...field} />
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                                <Label>minutos do cadastro.</Label>
                            </div>

                            <FormField
                                control={form.control}
                                name={`upsells.${index}.upsellMessage`}
                                render={({ field }) => (
                                    <FormItem>
                                    <FormLabel>Mensagem de UPSELL (Modo Leitura)</FormLabel>
                                    <FormControl>
                                        <Textarea
                                        placeholder="Olá {cliente}, vi que você acabou de entrar! Tenho uma oferta especial..."
                                        className="min-h-32 bg-muted/20"
                                        readOnly={true}
                                        {...field}
                                        />
                                    </FormControl>
                                    <FormMessage />
                                    </FormItem>
                                )}
                            />
                            {field.createdAt && (
                                <p className="text-[10px] text-muted-foreground">
                                    Criado em: {new Date(field.createdAt).toLocaleString()} (Clientes antigos serão ignorados)
                                </p>
                            )}
                        </CardContent>
                    </Card>
                ))}
            </div>
            
            {fields.length > 0 && (
                <div className="space-y-4">
                    <Card>
                        <CardContent className="pt-6">
                            <Label className="text-sm">Variáveis disponíveis para todas as mensagens:</Label>
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
                        </CardContent>
                    </Card>
                    
                    <Button type="submit" disabled={form.formState.isSubmitting} className="w-full md:w-auto">
                        Salvar Todas as Configurações de UPSELL
                    </Button>
                </div>
            )}
          </form>
        </Form>
      </main>
    </div>
  );
}
