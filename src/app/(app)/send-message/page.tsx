// src/app/(app)/send-message/page.tsx
'use client';

import { useEffect, useState } from 'react';
import { useForm, SubmitHandler } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { PageHeader } from '@/components/page-header';
import { useFirebase, useUser } from '@/firebase';
import { doc, getDoc } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';

interface ZapToken {
  id: string;
  token: string;
  name?: string;
}

interface Settings {
  zapTokens?: ZapToken[];
  selectedZapId?: string;
}

const schema = z.object({
  message: z.string().min(1, 'Mensagem é obrigatória'),
  phoneNumber: z.string().min(1, 'Número do cliente é obrigatório'),
  selectedZapId: z.string().optional(),
});

type FormValues = z.infer<typeof schema>;

export default function SendMessagePage() {
  const { firestore } = useFirebase();
  const { effectiveUserId } = useUser();
  const { toast } = useToast();

  const [zapTokens, setZapTokens] = useState<ZapToken[]>([]);

  const { register, handleSubmit, reset, watch } = useForm<FormValues>({
    resolver: zodResolver(schema),
  });

  // Load zap tokens from user settings
  useEffect(() => {
    if (!effectiveUserId) return;
    const load = async () => {
      const docRef = doc(firestore, 'users', effectiveUserId, 'settings', 'config');
      const snap = await getDoc(docRef);
      if (snap.exists()) {
        const data = snap.data() as Settings;
        setZapTokens(data.zapTokens ?? []);
        reset({
          selectedZapId: data.selectedZapId ?? '',
        });
      }
    };
    load();
  }, [effectiveUserId, firestore, reset]);

  const onSubmit: SubmitHandler<FormValues> = async (values) => {
    const tokenObj = zapTokens.find((z) => z.id === values.selectedZapId);
    if (!tokenObj) {
      toast({ title: 'Zap não selecionado', description: 'Selecione um Zap válido.', variant: 'destructive' });
      return;
    }
    try {
      const res = await fetch('/api/send-message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: values.message,
          phoneNumber: values.phoneNumber,
          token: tokenObj.token,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Erro ao enviar');
      toast({ title: 'Mensagem enviada', description: 'A mensagem foi enviada com sucesso.' });
    } catch (e: any) {
      toast({ title: 'Erro', description: e.message, variant: 'destructive' });
    }
  };

  const selectedZapId = watch('selectedZapId');

  return (
    <div className="flex flex-col h-full">
      <PageHeader title="Enviar Mensagem" description="Envie uma mensagem personalizada usando um Zap configurado." />
      <Card className="mt-4">
        <CardHeader>
          <CardTitle>Nova Mensagem</CardTitle>
          <CardDescription>Preencha os dados e escolha o Zap a ser usado.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <Textarea {...register('message')} placeholder="Digite sua mensagem..." rows={4} />
            <Input {...register('phoneNumber')} placeholder="Número do cliente (apenas dígitos)" />
            <div className="flex items-center space-x-2">
              <Select
                name="selectedZapId"
                value={selectedZapId}
                onValueChange={(v) => (document.getElementById('selectedZapId') as HTMLInputElement).value = v}
              >
                <SelectTrigger className="w-[200px]">
                  <SelectValue placeholder="Selecione o Zap" />
                </SelectTrigger>
                <SelectContent>
                  {zapTokens.map((z) => (
                    <SelectItem key={z.id} value={z.id}>
                      {z.name ?? z.token.slice(0, 6) + '...'}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input id="selectedZapId" type="hidden" {...register('selectedZapId')} />
            </div>
            <Button type="submit">Enviar Mensagem</Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
