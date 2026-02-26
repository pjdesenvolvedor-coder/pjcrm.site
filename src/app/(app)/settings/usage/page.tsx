'use client';

import { PageHeader } from '@/components/page-header';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Activity, BarChart3, ExternalLink, Info, ShieldCheck, Zap, DollarSign, TrendingDown } from 'lucide-react';
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
        <Alert>
          <Info className="h-4 w-4" />
          <AlertTitle>Informação Importante</AlertTitle>
          <AlertDescription>
            Os números exatos de uso só podem ser visualizados no Console do Firebase. Abaixo mostramos seus limites e estimativas.
          </AlertDescription>
        </Alert>

        <div className="grid gap-6 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BarChart3 className="h-5 w-5 text-primary" />
                Limites do Plano Spark (Grátis)
              </CardTitle>
              <CardDescription>Limites gratuitos que resetam todo dia à meia-noite.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <div className="flex justify-between text-sm font-medium">
                  <span>Leituras de Documentos</span>
                  <span className="text-muted-foreground">50.000 / dia</span>
                </div>
                <Progress value={0} className="h-2" />
                <p className="text-xs text-muted-foreground italic">Usado por: Listas, Dashboard, Verificação de Vencimento.</p>
              </div>

              <div className="space-y-2">
                <div className="flex justify-between text-sm font-medium">
                  <span>Escritas de Documentos</span>
                  <span className="text-muted-foreground">20.000 / dia</span>
                </div>
                <Progress value={0} className="h-2" />
                <p className="text-xs text-muted-foreground italic">Usado por: Cadastro de clientes, marcar msg como enviada.</p>
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

          <Card className="border-green-500/50 bg-green-500/5">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-green-700 dark:text-green-400">
                <DollarSign className="h-5 w-5" />
                Estimativa Plano Blaze (Pago)
              </CardTitle>
              <CardDescription>O Blaze é "pague o que usar". Se você passar o limite grátis, o custo é baixíssimo.</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Volume Extra</TableHead>
                    <TableHead>Custo em USD</TableHead>
                    <TableHead className="text-right">Custo em BRL</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <TableRow>
                    <TableCell>+ 50.000 leituras</TableCell>
                    <TableCell>$ 0,03</TableCell>
                    <TableCell className="text-right">~ R$ 0,18</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell>+ 100.000 leituras</TableCell>
                    <TableCell>$ 0,06</TableCell>
                    <TableCell className="text-right">~ R$ 0,35</TableCell>
                  </TableRow>
                  <TableRow className="font-bold">
                    <TableCell>Uso intenso (Mês)</TableCell>
                    <TableCell>$ 0,90</TableCell>
                    <TableCell className="text-right">~ R$ 5,00</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
              <p className="text-xs text-muted-foreground mt-4">
                * Valores baseados no preço de US$ 0,06 por 100k leituras. Custo mensal estimado dobrando a cota grátis todos os dias.
              </p>
            </CardContent>
          </Card>
        </div>

        <Card className="border-primary/50 bg-primary/5">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Zap className="h-5 w-5 text-primary" />
              Otimizações de Economia Ativas
            </CardTitle>
            <CardDescription>O sistema já está configurado para consumir o mínimo possível.</CardDescription>
          </CardHeader>
          <CardContent className="grid md:grid-cols-3 gap-4">
            <div className="flex items-start gap-3 text-sm p-3 bg-background rounded-lg border">
              <ShieldCheck className="h-5 w-5 text-green-500 shrink-0" />
              <div>
                <p className="font-bold">WhatsApp: 10s</p>
                <p className="text-muted-foreground">Verificação de conexão otimizada.</p>
              </div>
            </div>
            <div className="flex items-start gap-3 text-sm p-3 bg-background rounded-lg border">
              <TrendingDown className="h-5 w-5 text-green-500 shrink-0" />
              <div>
                <p className="font-bold">Automações: 5m</p>
                <p className="text-muted-foreground">Consultas ao banco apenas a cada 5 minutos.</p>
              </div>
            </div>
            <div className="flex items-start gap-3 text-sm p-3 bg-background rounded-lg border">
              <Activity className="h-5 w-5 text-green-500 shrink-0" />
              <div>
                <p className="font-bold">Cache Local</p>
                <p className="text-muted-foreground">Priorizamos o carregamento de dados salvos no navegador.</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
