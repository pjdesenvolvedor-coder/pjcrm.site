'use client';

import { useEffect } from 'react';
import { doc } from 'firebase/firestore';
import { useFirebase, useUser, useDoc, setDocumentNonBlocking, useMemoFirebase } from '@/firebase';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import type { Settings, UpsellMenuConfig, UpsellMenuButton } from '@/lib/types';
import { Skeleton } from '@/components/ui/skeleton';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Plus, Trash2, MessageSquare, Image, Clock, MousePointerClick } from 'lucide-react';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';

const upsellMenuButtonSchema = z.object({
  id: z.string(),
  label: z.string().min(1, 'Texto do botão obrigatório'),
  action: z.string().min(1, 'Ação do botão obrigatória'),
});

const upsellMenuConfigSchema = z.object({
  id: z.string(),
  isActive: z.boolean().default(false),
  upsellDelayMinutes: z.coerce.number().min(0).default(1),
  createdAt: z.number().optional(),
  text: z.string().min(1, 'Mensagem obrigatória'),
  footerText: z.string().optional(),
  imageUrl: z.string().optional(),
  buttons: z.array(upsellMenuButtonSchema).min(1, 'Adicione ao menos 1 botão'),
});

const formSchema = z.object({
  upsellMenus: z.array(upsellMenuConfigSchema),
});

type FormData = z.infer<typeof formSchema>;

const availableVariables = ['{cliente}', '{telefone}', '{email}', '{senha}', '{tela}', '{assinatura}', '{vencimento}', '{valor}'];

export default function UpsellMenuPage() {
  const { firestore } = useFirebase();
  const { user } = useUser();
  const { toast } = useToast();

  const settingsDocRef = useMemoFirebase(() => {
    if (!user) return null;
    return doc(firestore, 'users', user.uid, 'settings', 'config');
  }, [firestore, user]);

  const { data: settings, isLoading } = useDoc<Settings>(settingsDocRef);

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: { upsellMenus: [] },
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: 'upsellMenus',
  });

  useEffect(() => {
    if (settings) {
      form.reset({ upsellMenus: settings.upsellMenus || [] });
    }
  }, [settings, form]);

  const onSubmit = (data: FormData) => {
    if (!settingsDocRef) return;
    setDocumentNonBlocking(settingsDocRef, data, { merge: true });
    toast({ title: 'Salvo!', description: 'Upsells com menu configurados com sucesso.' });
  };

  const handleAddUpsell = () => {
    append({
      id: crypto.randomUUID(),
      isActive: false,
      upsellDelayMinutes: 1,
      createdAt: Date.now(),
      text: '',
      footerText: '',
      imageUrl: '',
      buttons: [{ id: crypto.randomUUID(), label: '', action: '' }],
    });
  };

  const copyVariable = (v: string) => {
    navigator.clipboard.writeText(v);
    toast({ title: 'Copiado!', description: `${v} copiado para a área de transferência.` });
  };

  if (isLoading) {
    return (
      <div className="flex flex-col h-full">
        <PageHeader title="Upsell com Menu" description="Carregando..." />
        <main className="flex-1 p-4 md:p-6 space-y-4">
          <Skeleton className="h-48 w-full" />
          <Skeleton className="h-48 w-full" />
        </main>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title="Upsell com Menu"
        description="Envie mensagens interativas com botões para seus clientes automaticamente."
      />
      <main className="flex-1 overflow-auto p-4 md:p-6">
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">

            {/* Variáveis disponíveis */}
            <Card>
              <CardContent className="pt-4 pb-4">
                <Label className="text-sm text-muted-foreground">Variáveis disponíveis (clique para copiar):</Label>
                <div className="flex flex-wrap gap-2 mt-2">
                  {availableVariables.map(v => (
                    <Badge
                      key={v}
                      variant="outline"
                      className="cursor-pointer hover:bg-accent"
                      onClick={() => copyVariable(v)}
                    >
                      {v}
                    </Badge>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Lista de upsells */}
            <div className="space-y-6">
              {fields.map((field, index) => (
                <UpsellMenuCard
                  key={field.id}
                  index={index}
                  form={form}
                  onRemove={() => remove(index)}
                />
              ))}

              {fields.length === 0 && (
                <div className="text-center py-16 border-2 border-dashed rounded-lg text-muted-foreground">
                  <MessageSquare className="h-10 w-10 mx-auto mb-3 opacity-40" />
                  <p className="font-medium">Nenhum upsell com menu configurado</p>
                  <p className="text-sm mt-1">Clique em "Novo Upsell com Menu" para começar</p>
                </div>
              )}
            </div>

            <div className="flex gap-3 flex-wrap">
              <Button type="button" variant="outline" onClick={handleAddUpsell} className="gap-2">
                <Plus className="h-4 w-4" /> Novo Upsell com Menu
              </Button>
              <Button type="submit" className="gap-2">
                Salvar Configurações
              </Button>
            </div>

          </form>
        </Form>
      </main>
    </div>
  );
}

// ─── Componente de card individual ──────────────────────────────────────────

function UpsellMenuCard({ index, form, onRemove }: { index: number; form: any; onRemove: () => void }) {
  const { fields: buttonFields, append: appendButton, remove: removeButton } = useFieldArray({
    control: form.control,
    name: `upsellMenus.${index}.buttons`,
  });

  const { toast } = useToast();

  const handleAddButton = () => {
    appendButton({ id: crypto.randomUUID(), label: '', action: '' });
  };

  return (
    <Card className="border-l-4 border-l-primary shadow-md">
      <CardHeader className="pb-2">
        <div className="flex justify-between items-center">
          <CardTitle className="text-base flex items-center gap-2">
            <MessageSquare className="h-4 w-4 text-primary" />
            Upsell com Menu #{index + 1}
          </CardTitle>
          <Button type="button" variant="ghost" size="icon" onClick={onRemove} className="text-destructive hover:bg-destructive/10">
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>

      <CardContent className="space-y-5">

        {/* Ativar */}
        <FormField
          control={form.control}
          name={`upsellMenus.${index}.isActive`}
          render={({ field }) => (
            <FormItem className="flex items-center gap-4 rounded-md border p-4 bg-muted/30">
              <div className="flex-1">
                <FormLabel className="text-base">Ativar este upsell</FormLabel>
                <p className="text-xs text-muted-foreground mt-0.5">Só aplica a clientes adicionados após a ativação</p>
              </div>
              <FormControl>
                <Switch
                  checked={field.value}
                  onCheckedChange={(checked) => {
                    field.onChange(checked);
                    if (checked) {
                      form.setValue(`upsellMenus.${index}.createdAt`, Date.now(), { shouldDirty: true });
                    }
                  }}
                />
              </FormControl>
            </FormItem>
          )}
        />

        {/* Delay */}
        <div className="flex items-center gap-3">
          <Clock className="h-4 w-4 text-muted-foreground shrink-0" />
          <Label>Enviar após</Label>
          <FormField
            control={form.control}
            name={`upsellMenus.${index}.upsellDelayMinutes`}
            render={({ field }) => (
              <FormItem>
                <FormControl>
                  <Input type="number" className="w-24" min={0} {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <Label>minuto(s) do cadastro</Label>
        </div>

        {/* Imagem (opcional) */}
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Image className="h-4 w-4 text-muted-foreground" />
            <Label>Imagem (opcional)</Label>
          </div>
          <FormField
            control={form.control}
            name={`upsellMenus.${index}.imageUrl`}
            render={({ field }) => (
              <FormItem>
                <FormControl>
                  <Input placeholder="https://exemplo.com/imagem.jpg" {...field} value={field.value ?? ''} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        {/* Mensagem principal */}
        <FormField
          control={form.control}
          name={`upsellMenus.${index}.text`}
          render={({ field }) => (
            <FormItem>
              <FormLabel>Mensagem principal *</FormLabel>
              <FormControl>
                <Textarea
                  placeholder="Olá {cliente}! Temos uma oferta especial para você..."
                  className="min-h-28"
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Rodapé (opcional) */}
        <FormField
          control={form.control}
          name={`upsellMenus.${index}.footerText`}
          render={({ field }) => (
            <FormItem>
              <FormLabel>Rodapé (opcional)</FormLabel>
              <FormControl>
                <Input placeholder="ex: Oferta por tempo limitado" {...field} value={field.value ?? ''} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Botões */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <MousePointerClick className="h-4 w-4 text-muted-foreground" />
              <Label>Botões <span className="text-destructive">*</span> (mín. 1)</Label>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleAddButton}
              className="gap-1 text-xs h-8"
              disabled={buttonFields.length >= 3}
            >
              <Plus className="h-3 w-3" /> Adicionar Botão
            </Button>
          </div>

          {buttonFields.length === 0 && (
            <p className="text-xs text-destructive">Adicione ao menos 1 botão</p>
          )}

          {buttonFields.map((btn, btnIndex) => (
            <div key={btn.id} className="flex gap-2 items-start p-3 border rounded-lg bg-muted/20">
              <div className="flex-1 space-y-2">
                <FormField
                  control={form.control}
                  name={`upsellMenus.${index}.buttons.${btnIndex}.label`}
                  render={({ field }) => (
                    <FormItem>
                      <FormControl>
                        <Input placeholder="Texto do botão (ex: Comprar Agora)" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name={`upsellMenus.${index}.buttons.${btnIndex}.action`}
                  render={({ field }) => (
                    <FormItem>
                      <FormControl>
                        <Input
                          placeholder="URL (https://...), call:+55..., copy:código, ou texto de resposta"
                          {...field}
                        />
                      </FormControl>
                      <p className="text-[10px] text-muted-foreground">
                        URL → link externo · call:+55... → ligar · copy:código → copiar · texto → resposta simples
                      </p>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => removeButton(btnIndex)}
                className="text-destructive hover:bg-destructive/10 shrink-0 mt-1"
                disabled={buttonFields.length <= 1}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
          {buttonFields.length >= 3 && (
            <p className="text-xs text-muted-foreground">Máximo de 3 botões por mensagem (limite do WhatsApp)</p>
          )}
        </div>

        {/* Info de criação */}
        {form.watch(`upsellMenus.${index}.createdAt`) > 0 && (
          <p className="text-[10px] text-muted-foreground">
            Ativo desde: {new Date(form.watch(`upsellMenus.${index}.createdAt`)).toLocaleString('pt-BR')} — clientes anteriores são ignorados
          </p>
        )}

      </CardContent>
    </Card>
  );
}
