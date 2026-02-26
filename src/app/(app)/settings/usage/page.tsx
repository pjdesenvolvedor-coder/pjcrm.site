'use client';

import { PageHeader } from '@/components/page-header';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Activity, BarChart3, ExternalLink, Info, ShieldCheck, Zap, DollarSign, TrendingDown, CreditCard, Clock } from 'lucide-react';
import { firebaseConfig } from '@/firebase/config';
import { Progress } from '@/components/ui/progress';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

export default function FirebaseUsagePage() {
  const projectId = firebaseConfig.projectId;
  const consoleUsageUrl = `https://console.firebase.google.com/project/${projectId}/usage/details`;

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title="Uso do Firebase"
        description="Monitore os limites diários e veja como economizar créditos."
      />
      <main className="flex-1 overflow-auto p-4 md:p-6 space-y-6">
        <Alert className="border-blue-500 bg-blue-50 dark:bg-blue-950/30">
          <Info className="h-4 w-4 text-blue-600" />
          <AlertTitle className="text-blue-800 dark:text-blue-400 font-bold">Liberação Imediata</AlertTitle>
          <AlertDescription className="text-blue-700 dark:text-blue-300">
            Ao adicionar seu cartão e ativar o <strong>Plano Blaze</strong>, os limites são liberados <strong>agora mesmo</strong>. Você não precisa esperar o reset da madrugada.
          </AlertDescription>
        </Alert>

        <Card className="border-yellow-500/50 bg-yellow-50 dark:bg-yellow-950/20">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-yellow-700 dark:text-yellow-400 text-base">
              <Clock className="h-5 w-5" />
              Reset da Cota Gratuita
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm space-y-2">
            <p>Se você preferir continuar no plano gratuito, o limite <strong>reseta entre 04:00 e 05:00 da manhã</strong> (Horário do Pacífico).</p>
          </CardContent>
        </Card>

        <Card className="border-primary bg-primary/5 shadow-lg overflow-hidden">
          <CardHeader className="bg-primary text-primary-foreground">
            <CardTitle className="flex items-center gap-2">
              <Zap className="h-6 w-6" />
              Ativar Plano Blaze (Pague o que usar)
            </CardTitle>
            <CardDescription className="text-primary-foreground/80">Remova o bloqueio diário agora e garanta que o sistema nunca pare.</CardDescription>
          </CardHeader>
          <CardContent className="pt-6 space-y-4">
            <p className="text-sm">
              Você continua tendo a cota gratuita de 50.000 leituras/dia. A diferença é que, se passar disso, o sistema <strong>não trava</strong>; o Google cobrará apenas os centavos excedentes (cerca de R$ 0,35 a cada 100 mil leituras extras).
            </p>
            <div className="bg-background p-4 rounded-lg border text-sm space-y-2">
              <p className="font-bold flex items-center gap-2 text-primary"><CreditCard className="h-4 w-4" /> Passo a passo para liberar:</p>
              <ol className="list-decimal list-inside space-y-1 text-muted-foreground">
                <li>Clique no botão abaixo para abrir o console oficial.</li>
                <li>No canto inferior esquerdo, clique em <strong>"Modify"</strong> ou <strong>"Upgrade"</strong>.</li>
                <li>Selecione o plano <strong>Blaze</strong> e adicione seu cartão.</li>
              </ol>
            </div>
          </CardContent>
          <CardFooter className="bg-muted/50 p-6">
            <Button className="w-full bg-primary hover:bg-primary/90 text-white font-bold py-6 text-lg shadow-xl animate-pulse-primary" asChild>
              <a href={consoleUsageUrl} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="mr-2 h-5 w-5" />
                ABRIR CONSOLE E LIBERAR AGORA
              </a>
            </Button>
          </CardFooter>
        </Card>

        <div className="grid gap-6 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <BarChart3 className="h-5 w-5 text-primary" />
                Limites Spark (Grátis)
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <div className="flex justify-between text-sm font-medium">
                  <span>Leituras</span>
                  <span className="text-muted-foreground">50.000 / dia</span>
                </div>
                <Progress value={0} className="h-2" />
              </div>
              <div className="space-y-2">
                <div className="flex justify-between text-sm font-medium">
                  <span>Escritas</span>
                  <span className="text-muted-foreground">20.000 / dia</span>
                </div>
                <Progress value={0} className="h-2" />
              </div>
            </CardContent>
          </Card>

          <Card className="border-green-500/50 bg-green-500/5">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-green-700 dark:text-green-400 text-base">
                <DollarSign className="h-5 w-5" />
                Estimativa Plano Blaze
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Volume Extra</TableHead>
                    <TableHead className="text-right">Custo Aproximado</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <TableRow>
                    <TableCell>+ 100.000 leituras</TableCell>
                    <TableCell className="text-right">R$ 0,35</TableCell>
                  </TableRow>
                  <TableRow className="font-bold">
                    <TableCell>Uso Intenso (Mês)</TableCell>
                    <TableCell className="text-right">~ R$ 5,00</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
