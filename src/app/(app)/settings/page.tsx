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
                <CardTitle>Integração com WhatsApp &amp; Webhook</CardTitle>
                <CardDescription>
                  Conecte sua conta do WhatsApp e configure seu webhook para enviar e receber mensagens.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="apiKey">API Key do WhatsApp</Label>
                  <Input id="apiKey" type="password" defaultValue="**************" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="phoneId">WhatsApp Phone Number ID</Label>
                  <Input id="phoneId" defaultValue="1450XXXXXXX" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="webhookUrl">URL do Webhook</Label>
                  <Input id="webhookUrl" placeholder="https://seu-servidor.com/webhook" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="webhookToken">Token do Webhook</Label>
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
