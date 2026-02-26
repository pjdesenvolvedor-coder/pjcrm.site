'use client';

import { PageHeader } from '@/components/page-header';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Activity, BarChart3, ExternalLink, Info, ShieldCheck, Zap, DollarSign, TrendingDown, CreditCard } from 'lucide-react';
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
          <AlertTitle className="text-blue-800 dark:text-blue-400 font-bold">Informação Importante</AlertTitle>
          <AlertDescription className="text-blue-700 dark:text-blue-300">
            O erro "Quota Exceeded" acontece porque o Google bloqueia o uso gratuito após 50 mil leituras. Fazer o upgrade para o Plano Blaze resolve isso imediatamente.
          </AlertDescription>
        </Alert>

        <Card className="border-primary bg-primary/5 shadow-lg overflow-hidden">
          <CardHeader className="bg-primary text-primary-foreground">
            <CardTitle className="flex items-center gap-2">
              <Zap className="h-6 w-6" />
              Liberar Limites (Plano Blaze)
            </CardTitle>
            <CardDescription className="text-primary-foreground/80">Remova o bloqueio diário e garanta que o sistema nunca pare.</CardDescription>
          </CardHeader>
          <CardContent className="pt-6 space-y-4">
            <p className="text-sm">
              Ao ativar o <strong>Plano Blaze (Pague o que usar)</strong>, você continua tendo a mesma cota gratuita de 50.000 leituras/dia. A diferença é que, se passar desse limite, o sistema <strong>não trava</strong>; o Google cobrará apenas os centavos excedentes no seu cartão.
            </p>
            <div className="bg-background p-4 rounded-lg border text-sm space-y-2">
              <p className="font-bold flex items-center gap-2 text-primary"><CreditCard className="h-4 w-4" /> Passo a passo para liberar:</p>
              <ol className="list-decimal list-inside space-y-1 text-muted-foreground">
                <li>Clique no botão abaixo para abrir o console oficial.</li>
                <li>No canto inferior esquerdo da tela que abrirá, clique em <strong>"Modify"</strong> ou <strong>"Upgrade"</strong>.</li>
                <li>Selecione o plano <strong>Blaze</strong> e adicione seu cartão de crédito.</li>
              </ol>
            </div>
          </CardContent>
          <CardFooter className="bg-muted/50 p-6">
            <Button className="w-full bg-primary hover:bg-primary/90 text-white font-bold py-6 text-lg shadow-xl animate-pulse-primary" asChild>
              <a href={consoleUsageUrl} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="mr-2 h-5 w-5" />
                ABRIR CONSOLE E FAZER UPGRADE
              </a>
            </Button>
          </CardFooter>
        </Card>

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
          </Card>

          <Card className="border-green-500/50 bg-green-500/5">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-green-700 dark:text-green-400">
                <DollarSign className="h-5 w-5" />
                Estimativa Plano Blaze (Pago)
              </CardTitle>
              <CardDescription>Custo baixíssimo para o volume excedente.</CardDescription>
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
              <p className="text-xs text-muted-foreground mt-4 italic">
                * Valores aproximados. Você só paga o que passar das 50 mil leituras gratuitas.
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
            <div className="flex items-start gap-3 text-sm p-3 bg-background rounded-lg border shadow-sm">
              <ShieldCheck className="h-5 w-5 text-green-500 shrink-0" />
              <div>
                <p className="font-bold">WhatsApp: 10s</p>
                <p className="text-muted-foreground text-xs">Verificação de conexão reduzida.</p>
              </div>
            </div>
            <div className="flex items-start gap-3 text-sm p-3 bg-background rounded-lg border shadow-sm">
              <TrendingDown className="h-5 w-5 text-green-500 shrink-0" />
              <div>
                <p className="font-bold">Automações: 5m</p>
                <p className="text-muted-foreground text-xs">Buscas no banco a cada 5 minutos.</p>
              </div>
            </div>
            <div className="flex items-start gap-3 text-sm p-3 bg-background rounded-lg border shadow-sm">
              <Activity className="h-5 w-5 text-green-500 shrink-0" />
              <div>
                <p className="font-bold">Cache Local</p>
                <p className="text-muted-foreground text-xs">Priorizamos dados salvos no navegador.</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
