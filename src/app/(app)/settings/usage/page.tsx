
'use client';

import { PageHeader } from '@/components/page-header';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Activity, BarChart3, ExternalLink, Info, ShieldCheck, Zap } from 'lucide-react';
import { firebaseConfig } from '@/firebase/config';
import { Progress } from '@/components/ui/progress';

export default function FirebaseUsagePage() {
  const projectId = firebaseConfig.projectId;
  const consoleUsageUrl = `https://console.firebase.google.com/project/${projectId}/usage/details`;

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title="Uso do Firebase"
        description="Monitore os limites diários e o consumo do seu banco de dados."
      />
      <main className="flex-1 overflow-auto p-4 md:p-6 space-y-6">
        <Alert>
          <Info className="h-4 w-4" />
          <AlertTitle>Informação Importante</AlertTitle>
          <AlertDescription>
            Por questões de segurança do Google, os números de uso em tempo real só podem ser visualizados diretamente no Console do Firebase.
          </AlertDescription>
        </Alert>

        <div className="grid gap-6 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BarChart3 className="h-5 w-5 text-primary" />
                Limites do Plano Spark (Grátis)
              </CardTitle>
              <CardDescription>Estes são os seus limites diários gratuitos. Eles resetam todo dia à meia-noite.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <div className="flex justify-between text-sm font-medium">
                  <span>Leituras de Documentos</span>
                  <span className="text-muted-foreground">50.000 / dia</span>
                </div>
                <Progress value={0} className="h-2" />
                <p className="text-xs text-muted-foreground italic">Consultas à lista de clientes, dashboard e automações.</p>
              </div>

              <div className="space-y-2">
                <div className="flex justify-between text-sm font-medium">
                  <span>Escritas de Documentos</span>
                  <span className="text-muted-foreground">20.000 / dia</span>
                </div>
                <Progress value={0} className="h-2" />
                <p className="text-xs text-muted-foreground italic">Salvar clientes, notas e status de mensagens enviadas.</p>
              </div>

              <div className="space-y-2">
                <div className="flex justify-between text-sm font-medium">
                  <span>Exclusões de Documentos</span>
                  <span className="text-muted-foreground">20.000 / dia</span>
                </div>
                <Progress value={0} className="h-2" />
              </div>
            </CardContent>
            <CardFooter>
                <Button className="w-full" asChild>
                    <a href={consoleUsageUrl} target="_blank" rel="noopener noreferrer">
                        <ExternalLink className="mr-2 h-4 w-4" />
                        Ver Consumo Real no Console
                    </a>
                </Button>
            </CardFooter>
          </Card>

          <Card className="border-primary/50 bg-primary/5">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Zap className="h-5 w-5 text-primary" />
                Dicas de Economia Aplicadas
              </CardTitle>
              <CardDescription>Já configuramos o sistema para ser o mais econômico possível.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <ul className="space-y-3">
                <li className="flex items-start gap-3 text-sm">
                  <ShieldCheck className="h-5 w-5 text-green-500 shrink-0" />
                  <span><strong>Intervalos Longos:</strong> As automações de Vencimento e Upsell agora checam dados a cada 5 minutos em vez de 1 minuto.</span>
                </li>
                <li className="flex items-start gap-3 text-sm">
                  <ShieldCheck className="h-5 w-5 text-green-500 shrink-0" />
                  <span><strong>WhatsApp Otimizado:</strong> A verificação de conexão acontece a cada 10 segundos, economizando rede e bateria.</span>
                </li>
                <li className="flex items-start gap-3 text-sm">
                  <ShieldCheck className="h-5 w-5 text-green-500 shrink-0" />
                  <span><strong>Cache Inteligente:</strong> O sistema prioriza dados salvos localmente antes de pedir novas leituras ao banco.</span>
                </li>
              </ul>
              <div className="pt-4 p-4 rounded-lg bg-background border text-sm">
                  <p className="font-semibold mb-1">Recomendação:</p>
                  <p className="text-muted-foreground">Se você atingir os limites com frequência, considere o <strong>Plano Blaze</strong>. Ele continua gratuito até os limites acima e cobra apenas centavos pelo que exceder, garantindo que o sistema nunca pare.</p>
              </div>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
