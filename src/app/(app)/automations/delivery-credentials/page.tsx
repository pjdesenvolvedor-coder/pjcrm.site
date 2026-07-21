
'use client';

import { useEffect, useState } from 'react';
import { doc, collection, query, orderBy } from 'firebase/firestore';
import { useFirebase, useUser, useDoc, setDocumentNonBlocking, useMemoFirebase, useCollection } from '@/firebase';
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
import { KeyRound, Trash2, Edit } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';

const deliveryAutomationSchema = z.object({
  isDeliveryAutomationActive: z.boolean().default(false),
  deliveryMessage: z.string().optional(),
});

type DeliveryAutomationFormData = z.infer<typeof deliveryAutomationSchema>;

const availableVariables = [
    "{cliente}", 
    "{telefone}", 
    "{email}", 
    "{senha}", 
    "{tela}",
    "{pin_tela}",
    "{assinatura}", 
    "{vencimento}", 
    "{valor}", 
    "{status}"
];

export default function DeliveryCredentialsPage() {
  const { firestore } = useFirebase();
  const { user } = useUser();
  const { toast } = useToast();

  const settingsDocRef = useMemoFirebase(() => {
    if (!user) return null;
    return doc(firestore, 'users', user.uid, 'settings', 'config');
  }, [firestore, user]);

  const { data: settings, isLoading } = useDoc<Settings>(settingsDocRef);

  const form = useForm<DeliveryAutomationFormData>({
    resolver: zodResolver(deliveryAutomationSchema),
    defaultValues: {
      isDeliveryAutomationActive: false,
      deliveryMessage: '',
    },
  });

  useEffect(() => {
    if (settings) {
      form.reset({
        isDeliveryAutomationActive: settings.isDeliveryAutomationActive ?? false,
        deliveryMessage: settings.deliveryMessage ?? '',
      });
    }
  }, [settings, form]);

  const onSubmit = (data: DeliveryAutomationFormData) => {
    if (settingsDocRef) {
      setDocumentNonBlocking(settingsDocRef, data, { merge: true });
      toast({
        title: 'Configurações de Entrega (Dados) Salvas!',
        description: 'Sua mensagem de entrega de email/senha foi atualizada.',
      });
    }
  };
  const subscriptionsQuery = useMemoFirebase(() => {
    if (!user) return null;
    return query(collection(firestore, 'users', user.uid, 'subscriptions'), orderBy('name'));
  }, [firestore, user]);

  const { data: subscriptions } = useCollection<Subscription>(subscriptionsQuery);

  const [selectedSub, setSelectedSub] = useState<string>('');
  const [specificMessage, setSpecificMessage] = useState<string>('');

  const handleSaveSpecific = () => {
    if (!selectedSub) {
      toast({ variant: 'destructive', title: 'Erro', description: 'Por favor, selecione uma assinatura.' });
      return;
    }
    if (!settingsDocRef || !settings) return;

    const currentMap = settings.customDeliveryMessages || {};
    const updatedMap = {
      ...currentMap,
      [selectedSub]: specificMessage
    };

    setDocumentNonBlocking(settingsDocRef, { customDeliveryMessages: updatedMap }, { merge: true });
    toast({
      title: 'Entrega específica salva!',
      description: `Mensagem personalizada definida para o produto "${selectedSub}".`
    });

    setSelectedSub('');
    setSpecificMessage('');
  };

  const handleRemoveSpecific = (subName: string) => {
    if (!settingsDocRef || !settings) return;

    const currentMap = settings.customDeliveryMessages || {};
    const updatedMap = { ...currentMap };
    delete updatedMap[subName];

    setDocumentNonBlocking(settingsDocRef, { customDeliveryMessages: updatedMap }, { merge: true });
    toast({
      title: 'Entrega específica removida!',
      description: `Mensagem personalizada removida para "${subName}". Voltará a usar a mensagem geral.`
    });
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
          title="Entrega EMAIL/SENHA"
          description="Configure a mensagem com dados de acesso."
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
        title="Entrega EMAIL/SENHA"
        description="Configure a mensagem automática com os dados de acesso para novos clientes."
      />
      <main className="flex-1 overflow-auto p-4 md:p-6">
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <Card>
              <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                      <KeyRound className="h-5 w-5 text-primary" />
                      Status da Entrega (Dados)
                  </CardTitle>
                  <CardDescription>
                      Esta mensagem será enviada quando você cadastrar um cliente usando a opção "Email/Senha".
                  </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <FormField
                  control={form.control}
                  name="isDeliveryAutomationActive"
                  render={({ field }) => (
                    <FormItem>
                      <div className="flex items-center space-x-4 rounded-md border p-4 bg-muted/30">
                        <div className="flex-1 space-y-1">
                          <FormLabel className="text-base">Ativar Entrega Automática</FormLabel>
                          <p className="text-sm text-muted-foreground">
                            Enviar dados de acesso logo após salvar o cliente.
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
                    name="deliveryMessage"
                    render={({ field }) => (
                        <FormItem>
                        <FormLabel>Mensagem de Entrega (Email/Senha)</FormLabel>
                        <CardDescription className="mb-2">Use as variáveis abaixo para incluir os dados de acesso.</CardDescription>
                        <FormControl>
                            <Textarea
                            placeholder="Olá {cliente}, aqui estão seus dados de acesso:&#10;E-mail: {email}&#10;Senha: {senha}&#10;Tela: {tela}&#10;PIN: {pin_tela}"
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
                  Salvar Entrega EMAIL/SENHA
                </Button>
              </CardContent>
            </Card>
          </form>
        </Form>

        {/* Card for specific product delivery messages */}
        <Card className="mt-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <KeyRound className="h-5 w-5 text-primary" />
              Entrega por Produto (Específica)
            </CardTitle>
            <CardDescription>
              Defina mensagens de entrega personalizadas para assinaturas específicas. Se configurado, o cliente receberá esta mensagem específica em vez da mensagem geral.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end rounded-md border p-4 bg-muted/20">
              <div className="space-y-2">
                <Label>Selecione a Assinatura</Label>
                <Select value={selectedSub} onValueChange={(val) => {
                  setSelectedSub(val);
                  setSpecificMessage(settings?.customDeliveryMessages?.[val] || '');
                }}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione o plano/assinatura" />
                  </SelectTrigger>
                  <SelectContent>
                    {subscriptions?.map(sub => (
                      <SelectItem key={sub.id} value={sub.name}>
                        {sub.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="md:col-span-2 space-y-2">
                <Label>Mensagem de Entrega Específica</Label>
                <Textarea 
                  placeholder="Mensagem personalizada para este produto..."
                  value={specificMessage}
                  onChange={(e) => setSpecificMessage(e.target.value)}
                  className="min-h-[100px]"
                />
              </div>

              <div className="md:col-span-3 flex justify-end">
                <Button 
                  type="button" 
                  onClick={handleSaveSpecific}
                  disabled={!selectedSub || !specificMessage.trim()}
                >
                  Salvar Entrega Específica
                </Button>
              </div>
            </div>

            {/* List of configured specific messages */}
            <div className="space-y-4">
              <Label className="text-base font-semibold">Configurações Ativas</Label>
              {(!settings?.customDeliveryMessages || Object.keys(settings.customDeliveryMessages).length === 0) ? (
                <p className="text-sm text-muted-foreground italic">Nenhuma entrega específica configurada. Todos os planos usam a mensagem geral.</p>
              ) : (
                <div className="grid grid-cols-1 gap-4">
                  {Object.entries(settings.customDeliveryMessages).map(([subName, msg]) => (
                    <div key={subName} className="flex flex-col md:flex-row md:items-start justify-between p-4 rounded-md border gap-4 bg-background">
                      <div className="space-y-1 flex-1">
                        <Badge variant="outline" className="font-semibold text-primary">{subName}</Badge>
                        <pre className="text-xs text-muted-foreground font-sans whitespace-pre-wrap mt-2 bg-muted/40 p-2 rounded">
                          {msg}
                        </pre>
                      </div>
                      <div className="flex gap-2 self-end md:self-start">
                        <Button 
                          variant="outline" 
                          size="sm" 
                          onClick={() => {
                            setSelectedSub(subName);
                            setSpecificMessage(msg);
                          }}
                        >
                          <Edit className="h-4 w-4 mr-1" /> Editar
                        </Button>
                        <Button 
                          variant="destructive" 
                          size="sm" 
                          onClick={() => handleRemoveSpecific(subName)}
                        >
                          <Trash2 className="h-4 w-4 mr-1" /> Remover
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
