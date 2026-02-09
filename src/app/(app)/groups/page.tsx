'use client';

import { useState } from 'react';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Send } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

export default function GroupsPage() {
  const { toast } = useToast();
  const [groupCode, setGroupCode] = useState('');

  const handleGetGroupCode = async () => {
    if (!groupCode.trim()) {
      toast({
        variant: 'destructive',
        title: 'Código Inválido',
        description: 'Por favor, insira o código do convite do grupo.',
      });
      return;
    }

    // Placeholder for API call
    console.log('Submitting group code:', groupCode);
    toast({
      title: 'Código Enviado',
      description: `O código "${groupCode}" foi enviado para processamento.`,
    });
    setGroupCode('');
  };

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title="Gerenciamento de Grupos"
        description="Obtenha códigos de grupo e envie mensagens."
      />
      <main className="flex-1 overflow-auto p-4 md:p-6">
        <Tabs defaultValue="get-code" className="w-full max-w-2xl mx-auto">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="get-code">Obter Código do Grupo</TabsTrigger>
            <TabsTrigger value="schedule-messages">Agendar Mensagens</TabsTrigger>
          </TabsList>
          <TabsContent value="get-code">
            <Card>
              <CardHeader>
                <CardTitle>Obter código do grupo</CardTitle>
                <CardDescription>
                  Cole apenas o código do link de convite. Ex: do link
                  https://chat.whatsapp.com/JIgDbPX9Q4g7Kij2xzlx6R, cole apenas
                  JIgDbPX9Q4g7Kij2xzlx6R.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="group-code">Link do grupo do zap</Label>
                  <Input
                    id="group-code"
                    placeholder="Insira o código do convite aqui..."
                    value={groupCode}
                    onChange={(e) => setGroupCode(e.target.value)}
                  />
                </div>
                <Button onClick={handleGetGroupCode} className="w-full">
                  <Send className="mr-2 h-4 w-4" />
                  Enviar
                </Button>
              </CardContent>
            </Card>
          </TabsContent>
          <TabsContent value="schedule-messages">
            <Card>
              <CardHeader>
                <CardTitle>Agendar Mensagens</CardTitle>
                <CardDescription>
                  Agende o envio de mensagens para os grupos cadastrados.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex flex-col items-center justify-center text-center text-muted-foreground p-8">
                  <p>Funcionalidade de agendamento de mensagens em desenvolvimento.</p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
