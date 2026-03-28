'use client';

import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { Send, Loader2 } from 'lucide-react';

export default function TestPage() {
  const [url, setUrl] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  const handleTest = async () => {
    if (!url) {
      toast({
        variant: 'destructive',
        title: 'Erro',
        description: 'Por favor, insira uma URL válida.',
      });
      return;
    }

    try {
      new URL(url);
    } catch (e) {
      toast({
        variant: 'destructive',
        title: 'Erro',
        description: 'A URL inserida não é válida.',
      });
      return;
    }

    setIsLoading(true);

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: 'Teste de Webhook do CRM',
          timestamp: new Date().toISOString(),
        }),
      });

      if (response.ok) {
        toast({
          title: 'Sucesso',
          description: 'A requisição POST foi enviada com sucesso.',
        });
      } else {
        toast({
          variant: 'destructive',
          title: 'Erro na requisição',
          description: `O servidor retornou o status ${response.status}`,
        });
      }
    } catch (error: any) {
      console.error('Erro ao enviar webhook:', error);
      toast({
        variant: 'destructive',
        title: 'Falha ao enviar',
        description: error.message || 'Ocorreu um erro ao tentar enviar a requisição.',
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-full w-full">
      <div className="flex-1 space-y-4 p-4 md:p-8 pt-6">
        <div className="flex items-center justify-between space-y-2">
          <h2 className="text-3xl font-bold tracking-tight">Teste de Webhook</h2>
        </div>

        <Card className="max-w-2xl">
          <CardHeader>
            <CardTitle>Disparar Webhook</CardTitle>
            <CardDescription>
              Insira a URL do seu webhook abaixo para enviar uma requisição POST de teste.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <label htmlFor="webhook-url" className="text-sm font-medium leading-none">
                URL do Webhook
              </label>
              <div className="flex gap-2">
                <Input
                  id="webhook-url"
                  placeholder="https://sua-url-de-webhook.com/..."
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  className="flex-1"
                />
                <Button onClick={handleTest} disabled={isLoading || !url}>
                  {isLoading ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="mr-2 h-4 w-4" />
                  )}
                  Testar
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
