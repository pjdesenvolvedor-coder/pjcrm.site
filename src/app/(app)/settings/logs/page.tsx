
'use client';

import { Activity, Clock, User, Phone, CheckCircle2, XCircle, Loader2 } from 'lucide-react';
import { PageHeader } from '@/components/page-header';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { useFirebase, useCollection, useMemoFirebase } from '@/firebase';
import { collection, query, orderBy, limit } from 'firebase/firestore';
import type { MessageLog } from '@/lib/types';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';

export default function LogsPage() {
  const { firestore, effectiveUserId } = useFirebase();

  const logsQuery = useMemoFirebase(() => {
    if (!effectiveUserId) return null;
    return query(
        collection(firestore, 'users', effectiveUserId, 'logs'), 
        orderBy('timestamp', 'desc'),
        limit(50)
    );
  }, [firestore, effectiveUserId]);

  const { data: logs, isLoading } = useCollection<MessageLog>(logsQuery);

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title="Logs de Envio"
        description="Acompanhe o status dos envios automáticos e os delays aplicados."
      />
      <main className="flex-1 overflow-auto p-4 md:p-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
                <Activity className="h-5 w-5 text-primary" />
                Histórico de Atividade
            </CardTitle>
            <CardDescription>
              Mostra os últimos 50 eventos de envio do sistema (Vencimentos, Remarketing, Upsell, Grupos).
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Horário</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Destinatário</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Delay</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow><TableCell colSpan={5} className="text-center py-8">Carregando logs...</TableCell></TableRow>
                ) : logs?.map((log) => (
                  <TableRow key={log.id}>
                    <TableCell className="text-xs text-muted-foreground">
                        {log.timestamp ? format(log.timestamp.toDate(), 'HH:mm:ss (dd/MM)') : '-'}
                    </TableCell>
                    <TableCell>
                        <Badge variant="outline" className="text-[10px] uppercase">{log.type}</Badge>
                    </TableCell>
                    <TableCell>
                        <div className="flex flex-col">
                            <span className="font-medium text-sm">{log.clientName}</span>
                            <span className="text-[10px] text-muted-foreground">{log.target}</span>
                        </div>
                    </TableCell>
                    <TableCell>
                        <div className="flex items-center gap-2">
                            {log.status === 'Enviando' && <Loader2 className="h-3 w-3 animate-spin text-blue-500" />}
                            {log.status === 'Enviado' && <CheckCircle2 className="h-3 w-3 text-green-500" />}
                            {log.status === 'Erro' && <XCircle className="h-3 w-3 text-destructive" />}
                            <span className={cn(
                                "text-xs font-semibold",
                                log.status === 'Enviando' && "text-blue-500",
                                log.status === 'Enviado' && "text-green-600",
                                log.status === 'Erro' && "text-destructive"
                            )}>
                                {log.status}
                            </span>
                        </div>
                    </TableCell>
                    <TableCell className="text-right text-xs">
                        {log.delayApplied > 0 ? `${log.delayApplied}s` : 'Imediato'}
                    </TableCell>
                  </TableRow>
                ))}
                {!isLoading && logs?.length === 0 && (
                    <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">Nenhum log registrado ainda.</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
