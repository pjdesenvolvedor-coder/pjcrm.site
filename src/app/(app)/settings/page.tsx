import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

export default function SettingsPage() {
  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title="Configurações"
        description="Gerencie as configurações da sua conta e integrações."
      />
      <main className="flex-1 overflow-auto p-4 md:p-6">
        <Tabs defaultValue="integration" className="w-full">
          <TabsList className="grid w-full max-w-md grid-cols-2">
            <TabsTrigger value="general">Geral</TabsTrigger>
            <TabsTrigger value="integration">Integração</TabsTrigger>
          </TabsList>
          <TabsContent value="general">
             <Card>
                <CardHeader>
                    <CardTitle>Configurações Gerais</CardTitle>
                    <CardDescription>Atualize as informações da sua empresa.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="space-y-2">
                        <Label htmlFor="companyName">Nome da Empresa</Label>
                        <Input id="companyName" defaultValue="ZapConnect Inc." />
                    </div>
                     <div className="space-y-2">
                        <Label htmlFor="supportEmail">Email de Suporte</Label>
                        <Input id="supportEmail" type="email" defaultValue="suporte@zapconnect.com" />
                    </div>
                </CardContent>
            </Card>
          </TabsContent>
          <TabsContent value="integration">
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
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
