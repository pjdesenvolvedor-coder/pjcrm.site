'use client';

import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export default function SettingsPage() {
  // TODO: Save token to a secure place (e.g., Firestore with proper rules)
  // For now, it's just a UI element.
  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title="Configurações"
        description="Gerencie as configurações da sua conta e integrações."
      />
      <main className="flex-1 overflow-auto p-4 md:p-6">
        <Card>
          <CardHeader>
            <CardTitle>Integração via Webhook</CardTitle>
            <CardDescription>
              Configure o token de autenticação para as requisições via webhook.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="webhookToken">Token de Autenticação</Label>
              <Input id="webhookToken" type="password" placeholder="Seu token secreto" />
            </div>
          </CardContent>
          <CardContent>
              <Button>Salvar Alterações</Button>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}

    