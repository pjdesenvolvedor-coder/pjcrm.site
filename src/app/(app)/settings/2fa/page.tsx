// src/app/(app)/settings/2fa/page.tsx
'use client';

import { useState, useEffect } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { useFirebase, useUser, setDocumentNonBlocking } from '@/firebase';
import { doc, getDoc } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';
import { z } from 'zod';
import { useForm, SubmitHandler } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';

interface ZapToken {
  id: string;
  token: string;
  name?: string;
}

interface Settings {
  twoFactorTemplate?: string;
  zapTokens?: ZapToken[];
  selectedZapId?: string;
}

const schema = z.object({
  twoFactorTemplate: z.string().min(1, 'Modelo obrigatório'),
  selectedZapId: z.string().optional(),
});

type FormValues = z.infer<typeof schema>;

export default function TwoFASettingsPage() {
  const { firestore } = useFirebase();
  const { toast } = useToast();
  const { effectiveUserId } = useUser();

  const [settings, setSettings] = useState<Settings>({});
  const [zapTokens, setZapTokens] = useState<ZapToken[]>([]);
  const [openDialog, setOpenDialog] = useState(false);

  const { register, handleSubmit, reset, watch } = useForm<FormValues>({
    resolver: zodResolver(schema),
  });

  // Load settings once
  useEffect(() => {
    if (!effectiveUserId) return;
    const load = async () => {
      const docRef = doc(firestore, 'users', effectiveUserId, 'settings', 'config');
      const snap = await getDoc(docRef);
      if (snap.exists()) {
        const data = snap.data() as Settings;
        setSettings(data);
        setZapTokens(data.zapTokens ?? []);
        reset({
          twoFactorTemplate: data.twoFactorTemplate ?? '',
          selectedZapId: data.selectedZapId ?? '',
        });
      }
    };
    load();
  }, [effectiveUserId, firestore, reset]);

  const onSubmit: SubmitHandler<FormValues> = async (values) => {
    if (!effectiveUserId) return;
    const docRef = doc(firestore, 'users', effectiveUserId, 'settings', 'config');
    const payload = {
      twoFactorTemplate: values.twoFactorTemplate,
      zapTokens,
      selectedZapId: values.selectedZapId,
    } as Settings;
    await setDocumentNonBlocking(docRef, payload, { merge: true });
    toast({ title: 'Configurações salvas', description: 'Modelo 2FA e Zaps atualizados.' });
    setSettings(payload);
  };

  // Dialog handlers for adding a new Zap token
  const [newZapName, setNewZapName] = useState('');
  const [newZapToken, setNewZapToken] = useState('');
  const addZap = () => {
    if (!newZapToken.trim()) return;
    const newZap: ZapToken = { id: uuidv4(), token: newZapToken.trim(), name: newZapName.trim() || undefined };
    setZapTokens((prev) => [...prev, newZap]);
    setNewZapName('');
    setNewZapToken('');
    setOpenDialog(false);
  };

  const removeZap = (id: string) => {
    setZapTokens((prev) => prev.filter((z) => z.id !== id));
    if (settings.selectedZapId === id) {
      // clear selection if the removed token was selected
      setSettings((s) => ({ ...s, selectedZapId: undefined }));
    }
  };

  const selectedZapId = watch('selectedZapId');

  return (
    <div className="flex flex-col h-full">
      <PageHeader title="Configurações 2FA" description="Personalize a mensagem de 2FA e gerencie múltiplos Zaps." />
      <Card className="mt-4">
        <CardHeader>
          <CardTitle>Template da Mensagem 2FA</CardTitle>
          <CardDescription>Use {`{codigo}`} como placeholder para o código gerado.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <Textarea {...register('twoFactorTemplate')} placeholder="🔒 *Código de Acesso*\n\nSeu código é {codigo}" rows={4} />
            <div className="flex items-center space-x-2">
              <Select name="selectedZapId" value={selectedZapId} onValueChange={(v) => (document.getElementById('selectedZapId') as HTMLInputElement).value = v)}>
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
              <Button type="button" onClick={() => setOpenDialog(true)}>
                Adicionar Zap
              </Button>
            </div>
            <Button type="submit">Salvar Configurações</Button>
          </form>
        </CardContent>
      </Card>

      {/* Zap Tokens List */}
      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Zaps Cadastrados</CardTitle>
          <CardDescription>Gerencie os tokens de conexão.</CardDescription>
        </CardHeader>
        <CardContent>
          {zapTokens.length === 0 ? (
            <p className="text-muted-foreground">Nenhum Zap cadastrado.</p>
          ) : (
            <ul className="space-y-2">
              {zapTokens.map((z) => (
                <li key={z.id} className="flex items-center justify-between">
                  <span className="font-mono truncate max-w-xs">{z.name ?? z.token}</span>
                  <div className="flex items-center gap-2">
                    <Button variant="ghost" size="sm" onClick={() => removeZap(z.id)}>
                      Remover
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* Dialog to add new Zap */}
      <Dialog open={openDialog} onOpenChange={setOpenDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Adicionar Novo Zap</DialogTitle>
            <DialogDescription>Informe o token (e opcionalmente um nome) para o novo Zap.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <Input placeholder="Nome (opcional)" value={newZapName} onChange={(e) => setNewZapName(e.target.value)} />
            <Input placeholder="Token" value={newZapToken} onChange={(e) => setNewZapToken(e.target.value)} />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpenDialog(false)}>
              Cancelar
            </Button>
            <Button onClick={addZap}>Adicionar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
