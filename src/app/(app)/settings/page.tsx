'use client';

import { useState, useEffect } from 'react';
import { doc } from 'firebase/firestore';
import { useFirebase, useUser, useDoc, setDocumentNonBlocking, useMemoFirebase } from '@/firebase';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import type { Settings } from '@/lib/types';
import { Skeleton } from '@/components/ui/skeleton';

export default function SettingsPage() {
  const { firestore } = useFirebase();
  const { user } = useUser();
  const { toast } = useToast();

  const [token, setToken] = useState('');

  const settingsDocRef = useMemoFirebase(() => {
    if (!user) return null;
    // Use a fixed document ID 'config' to treat it as a singleton for the user
    return doc(firestore, 'users', user.uid, 'settings', 'config');
  }, [firestore, user]);

  const { data: settings, isLoading } = useDoc<Settings>(settingsDocRef);

  useEffect(() => {
    if (settings?.webhookToken) {
      setToken(settings.webhookToken);
    }
  }, [settings]);

  const handleSave = () => {
    if (settingsDocRef) {
      setDocumentNonBlocking(settingsDocRef, { webhookToken: token }, { merge: true });
      toast({
        title: 'Configurações Salvas!',
        description: 'Seu token de autenticação foi salvo com sucesso.',
      });
    }
  };

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title="Token"
        description="Gerencie seu token de autenticação para integrações."
      />
      <main className="flex-1 overflow-auto p-4 md:p-6 space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Integração via Webhook</CardTitle>
            <CardDescription>
              Configure o token de autenticação para as requisições via webhook.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {isLoading ? (
              <div className="space-y-2">
                <Skeleton className="h-4 w-[150px]" />
                <Skeleton className="h-10 w-full" />
              </div>
            ) : (
              <div className="space-y-2">
                <Label htmlFor="webhookToken">Token de Autenticação</Label>
                <Input
                  id="webhookToken"
                  type="password"
                  placeholder="Seu token secreto"
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                />
              </div>
            )}
          </CardContent>
          <CardContent>
            <Button onClick={handleSave} disabled={isLoading}>
              {isLoading ? 'Carregando...' : 'Salvar Alterações'}
            </Button>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
