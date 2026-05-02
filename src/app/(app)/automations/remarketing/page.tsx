
'use client';

import { useEffect } from 'react';
import { doc } from 'firebase/firestore';
import { useFirebase, useUser, useDoc, setDocumentNonBlocking, useMemoFirebase } from '@/firebase';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import type { Settings, RemarketingConfig } from '@/lib/types';
import { Skeleton } from '@/components/ui/skeleton';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { AlarmClock, UserPlus, Plus, Trash2 } from 'lucide-react';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

const remarketingConfigSchema = z.object({
  id: z.string(),
  isActive: z.boolean().default(false),
  days: z.coerce.number().min(0).default(3),
  message: z.string().optional(),
  createdAt: z.number().optional(),
});

const remarketingSchema = z.object({
  postSignupRemarketings: z.array(remarketingConfigSchema),
  postDueDateRemarketings: z.array(remarketingConfigSchema),
});

type RemarketingFormData = z.infer<typeof remarketingSchema>;

const availableVariables = ["{cliente}", "{telefone}", "{email}", "{senha}", "{tela}", "{assinatura}", "{vencimento}", "{valor}", "{status}"];

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
      postSignupRemarketings: [],
      postDueDateRemarketings: [],
    },
  });

  const signupFields = useFieldArray({
    control: form.control,
    name: "postSignupRemarketings",
  });

  const dueDateFields = useFieldArray({
    control: form.control,
    name: "postDueDateRemarketings",
  });

  useEffect(() => {
    if (settings) {
      const initialSignup: RemarketingConfig[] = settings.postSignupRemarketings || [];
      const initialDueDate: RemarketingConfig[] = settings.postDueDateRemarketings || [];

      // Migration for signup
      if (initialSignup.length === 0 && settings.postSignupRemarketingMessage) {
        initialSignup.push({
          id: 'legacy-signup',
          isActive: settings.isPostSignupRemarketingActive ?? false,
          days: settings.postSignupRemarketingDays ?? 3,
          message: settings.postSignupRemarketingMessage ?? '',
          createdAt: 0,
        });
      }

      // Migration for due date
      if (initialDueDate.length === 0 && settings.postDueDateRemarketingMessage) {
        initialDueDate.push({
          id: 'legacy-duedate',
          isActive: settings.isPostDueDateRemarketingActive ?? false,
          days: settings.postDueDateRemarketingDays ?? 3,
          message: settings.postDueDateRemarketingMessage ?? '',
          createdAt: 0,
        });
      }

      form.reset({
        postSignupRemarketings: initialSignup,
        postDueDateRemarketings: initialDueDate,
      });
    }
  }, [settings, form]);

  const onSubmit = (data: RemarketingFormData) => {
    if (settingsDocRef) {
      setDocumentNonBlocking(settingsDocRef, data, { merge: true });
      toast({
        title: 'Configurações Salvas!',
        description: 'Suas automações de remarketing foram configuradas com sucesso.',
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

  const handleAddRemarketing = (type: 'signup' | 'duedate') => {
    const newRemarketing = { id: crypto.randomUUID(), isActive: false, days: 3, message: '', createdAt: Date.now() };
    if (type === 'signup') signupFields.append(newRemarketing);
    else dueDateFields.append(newRemarketing);
  };

  if (isLoading) {
    return (
      <div className="flex flex-col h-full">
        <PageHeader title="Automação de Remarketing" description="Configurando múltiplos fluxos..." />
        <main className="flex-1 p-4 md:p-6 space-y-6">
          <Skeleton className="h-48 w-full" />
          <Skeleton className="h-48 w-full" />
        </main>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title="Automação de Remarketing"
        description="Reengaje seus clientes com múltiplos fluxos automáticos."
      />
      <main className="flex-1 overflow-auto p-4 md:p-6">
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <Tabs defaultValue="signup" className="w-full">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="signup" className="gap-2">
                  <UserPlus className="h-4 w-4" /> Pós-Cadastro
                </TabsTrigger>
                <TabsTrigger value="duedate" className="gap-2">
                  <AlarmClock className="h-4 w-4" /> Pós-Vencimento
                </TabsTrigger>
              </TabsList>

              <TabsContent value="signup" className="space-y-6 pt-4">
                <div className="flex justify-between items-center">
                  <div className="space-y-1">
                    <h2 className="text-xl font-semibold">Remarketing Pós-Cadastro</h2>
                    <p className="text-sm text-muted-foreground">Envie mensagens após o cadastro inicial.</p>
                  </div>
                  <Button type="button" size="sm" onClick={() => handleAddRemarketing('signup')} className="gap-2">
                    <Plus className="h-4 w-4" /> Novo Fluxo
                  </Button>
                </div>

                <div className="space-y-4">
                  {signupFields.fields.map((field, index) => (
                    <Card key={field.id} className="border-l-4 border-l-primary">
                      <CardContent className="pt-6 space-y-4">
                        <div className="flex justify-between items-center">
                          <Badge variant="outline">Fluxo #{index + 1}</Badge>
                          <Button 
                            type="button" 
                            variant="ghost" 
                            size="icon" 
                            onClick={() => signupFields.remove(index)}
                            className="text-destructive hover:bg-destructive/10"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>

                        <FormField
                          control={form.control}
                          name={`postSignupRemarketings.${index}.isActive`}
                          render={({ field }) => (
                            <FormItem className="flex items-center space-x-4 rounded-md border p-4 bg-muted/30">
                              <div className="flex-1 space-y-1">
                                <FormLabel className="text-base">Ativar este remarketing</FormLabel>
                              </div>
                              <FormControl>
                                <Switch 
                                  checked={field.value} 
                                  onCheckedChange={(checked) => {
                                      field.onChange(checked);
                                      if (checked) {
                                          form.setValue(`postSignupRemarketings.${index}.createdAt`, Date.now(), { shouldDirty: true });
                                      }
                                  }} 
                                />
                              </FormControl>
                            </FormItem>
                          )}
                        />

                        <div className="flex items-center gap-2">
                          <Label>Enviar após</Label>
                          <FormField
                            control={form.control}
                            name={`postSignupRemarketings.${index}.days`}
                            render={({ field }) => (
                              <FormItem>
                                <FormControl><Input type="number" className="w-20" {...field} /></FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                          <Label>dias do cadastro.</Label>
                        </div>

                        <FormField
                          control={form.control}
                          name={`postSignupRemarketings.${index}.message`}
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Mensagem</FormLabel>
                              <FormControl><Textarea placeholder="Olá {cliente}, bem-vindo!..." className="min-h-32" {...field} /></FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        {field.createdAt !== undefined && field.createdAt > 0 && (
                            <p className="text-[10px] text-muted-foreground">
                                Criado em: {new Date(field.createdAt!).toLocaleString()} (Clientes antigos ignorados)
                            </p>
                        )}
                      </CardContent>
                    </Card>
                  ))}
                  {signupFields.fields.length === 0 && (
                    <div className="text-center py-12 border-2 border-dashed rounded-lg text-muted-foreground">
                      Nenhum remarketing pós-cadastro configurado.
                    </div>
                  )}
                </div>
              </TabsContent>

              <TabsContent value="duedate" className="space-y-6 pt-4">
                <div className="flex justify-between items-center">
                  <div className="space-y-1">
                    <h2 className="text-xl font-semibold">Remarketing Pós-Vencimento</h2>
                    <p className="text-sm text-muted-foreground">Reengaje clientes após a assinatura vencer.</p>
                  </div>
                  <Button type="button" size="sm" onClick={() => handleAddRemarketing('duedate')} className="gap-2">
                    <Plus className="h-4 w-4" /> Novo Fluxo
                  </Button>
                </div>

                <div className="space-y-4">
                  {dueDateFields.fields.map((field, index) => (
                    <Card key={field.id} className="border-l-4 border-l-destructive">
                      <CardContent className="pt-6 space-y-4">
                        <div className="flex justify-between items-center">
                          <Badge variant="outline">Fluxo #{index + 1}</Badge>
                          <Button 
                            type="button" 
                            variant="ghost" 
                            size="icon" 
                            onClick={() => dueDateFields.remove(index)}
                            className="text-destructive hover:bg-destructive/10"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>

                        <FormField
                          control={form.control}
                          name={`postDueDateRemarketings.${index}.isActive`}
                          render={({ field }) => (
                            <FormItem className="flex items-center space-x-4 rounded-md border p-4 bg-muted/30">
                              <div className="flex-1 space-y-1">
                                <FormLabel className="text-base">Ativar este remarketing</FormLabel>
                              </div>
                              <FormControl>
                                <Switch 
                                  checked={field.value} 
                                  onCheckedChange={(checked) => {
                                      field.onChange(checked);
                                      if (checked) {
                                          form.setValue(`postDueDateRemarketings.${index}.createdAt`, Date.now(), { shouldDirty: true });
                                      }
                                  }} 
                                />
                              </FormControl>
                            </FormItem>
                          )}
                        />

                        <div className="flex items-center gap-2">
                          <Label>Enviar após</Label>
                          <FormField
                            control={form.control}
                            name={`postDueDateRemarketings.${index}.days`}
                            render={({ field }) => (
                              <FormItem>
                                <FormControl><Input type="number" className="w-20" {...field} /></FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                          <Label>dias do vencimento.</Label>
                        </div>

                        <FormField
                          control={form.control}
                          name={`postDueDateRemarketings.${index}.message`}
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Mensagem</FormLabel>
                              <FormControl><Textarea placeholder="Olá {cliente}, notamos que sua assinatura venceu..." className="min-h-32" {...field} /></FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        {field.createdAt !== undefined && field.createdAt > 0 && (
                            <p className="text-[10px] text-muted-foreground">
                                Criado em: {new Date(field.createdAt!).toLocaleString()} (Clientes antigos ignorados)
                            </p>
                        )}
                      </CardContent>
                    </Card>
                  ))}
                  {dueDateFields.fields.length === 0 && (
                    <div className="text-center py-12 border-2 border-dashed rounded-lg text-muted-foreground">
                      Nenhum remarketing pós-vencimento configurado.
                    </div>
                  )}
                </div>
              </TabsContent>
            </Tabs>
            
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
            
            <Button type="submit" disabled={form.formState.isSubmitting} className="w-full md:w-auto h-12 px-8">
              Salvar Todas as Configurações de Remarketing
            </Button>
          </form>
        </Form>
      </main>
    </div>
  );
}
