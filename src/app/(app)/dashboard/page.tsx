'use client';

import { Users, AlertTriangle, Calendar, Clock, DollarSign, ArrowUp, ArrowDown, Eye, Trophy, Medal } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { PageHeader } from '@/components/page-header';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useFirebase, useUser, useCollection, useMemoFirebase, useDoc } from '@/firebase';
import { collection, query, where, orderBy, doc, collectionGroup } from 'firebase/firestore';
import type { Client, UserProfile } from '@/lib/types';
import { useState, useMemo, useEffect } from 'react';
import { isToday, isWithinInterval, addDays, startOfToday, endOfToday, startOfWeek, endOfWeek, startOfMonth, endOfMonth, startOfYear, endOfYear } from 'date-fns';
import { Skeleton } from '@/components/ui/skeleton';
import { PieChart, Pie, Cell, ResponsiveContainer } from "recharts";
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { cn } from '@/lib/utils';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';


const parseCurrency = (value?: string | null): number => {
  if (!value) return 0;
  const cleanedValue = value.toString().replace(/\./g, '').replace(',', '.');
  const number = parseFloat(cleanedValue);
  return isNaN(number) ? 0 : number;
};

const formatCurrency = (value: number): string => {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
};

export default function DashboardPage() {
  const { firestore, effectiveUserId, userProfile } = useFirebase();
  const [period, setPeriod] = useState('this-month');
  
  const isAdmin = userProfile?.role === 'Admin';

  // BUSCA GLOBAL DE CLIENTES: Necessária para o Ranking de todos os usuários
  const allClientsQuery = useMemoFirebase(() => {
    if (!firestore) return null;
    // Buscamos todos os clientes do sistema para calcular o Ranking Global
    return query(collectionGroup(firestore, 'clients'));
  }, [firestore]);

  const { data: allClients, isLoading: isLoadingClients } = useCollection<Client>(allClientsQuery);

  // BUSCA GLOBAL DE DONOS DE CONTA: Necessária para identificar os nomes no Ranking
  const ownersQuery = useMemoFirebase(() => {
    if (!firestore) return null;
    return query(collection(firestore, 'users'), where('role', 'in', ['User', 'Admin']));
  }, [firestore]);
  
  const { data: allOwners } = useCollection<UserProfile>(ownersQuery);

  // FILTRO DE CLIENTES LOCAIS: Para os cards de estatísticas e gráficos
  const filteredClients = useMemo(() => {
    if (!allClients) return [];
    if (isAdmin) return allClients; // Admin vê tudo nos cards também
    // Usuários e Atendentes veem apenas os dados da própria equipe nos cards
    return allClients.filter(c => c.userId === effectiveUserId);
  }, [allClients, isAdmin, effectiveUserId]);

  // Lógica do Ranking Global (Donos de Conta)
  const rankingData = useMemo(() => {
    if (!allClients || !allOwners) return [];

    const stats: Record<string, { count: number; revenue: number; name: string }> = {};

    // Inicializa a lista com todos os donos de conta encontrados
    allOwners.forEach(owner => {
        stats[owner.id] = { count: 0, revenue: 0, name: `${owner.firstName} ${owner.lastName}` };
    });

    // Processa TODOS os clientes do sistema para o ranking global
    allClients.forEach(client => {
      if (client.status !== 'Ativo') return;

      // O ranking é sempre baseado no DONO DA CONTA (userId)
      const participantId = client.userId;
      const revenue = parseCurrency(client.amountPaid);

      if (!participantId) return;

      if (!stats[participantId]) {
        stats[participantId] = { 
            count: 0, 
            revenue: 0, 
            name: client.agentName || 'Dono de Conta'
        };
      }

      stats[participantId].count += 1;
      stats[participantId].revenue += revenue;
    });

    // Converte para array, ordena por performance e pega os Top 3
    return Object.entries(stats)
      .map(([id, s]) => ({ id, ...s }))
      .filter(s => s.count > 0)
      .sort((a, b) => b.count - a.count || b.revenue - a.revenue)
      .slice(0, 3);
  }, [allClients, allOwners]);

  const { stats, subscriptionData, paymentMethodData, dueTodayList, dueIn3DaysList } = useMemo(() => {
    const baseStats = {
      activeCount: 0,
      activeTotal: 0,
      overdueCount: 0,
      overdueTotal: 0,
      dueTodayCount: 0,
      dueTodayTotal: 0,
      dueIn3DaysCount: 0,
      dueIn3DaysTotal: 0,
      totalSales: 0,
      activePercentage: 0,
      overduePercentage: 0,
      newClientsTodayCount: 0,
      expiredTodayCount: 0,
    };

    if (!filteredClients) {
      return { stats: baseStats, subscriptionData: [], paymentMethodData: [], dueTodayList: [], dueIn3DaysList: [] };
    }

    const now = new Date();
    const today = startOfToday();
    const threeDaysFromNow = addDays(today, 3);
    
    let periodStart: Date;
    let periodEnd: Date;

    switch (period) {
        case 'today':
            periodStart = startOfToday();
            periodEnd = endOfToday();
            break;
        case 'this-week':
            periodStart = startOfWeek(today, { weekStartsOn: 1 });
            periodEnd = endOfWeek(today, { weekStartsOn: 1 });
            break;
        case 'this-year':
            periodStart = startOfYear(today);
            periodEnd = endOfYear(today);
            break;
        case 'this-month':
        default:
            periodStart = startOfMonth(today);
            periodEnd = endOfMonth(today);
            break;
    }

    let activeCount = 0;
    let activeTotal = 0;
    let overdueCount = 0;
    let overdueTotal = 0;
    let dueTodayCount = 0;
    let dueTodayTotal = 0;
    let dueIn3DaysCount = 0;
    let dueIn3DaysTotal = 0;
    let totalSales = 0;
    let newClientsTodayCount = 0;
    let expiredTodayCount = 0;

    const dueTodayList: Client[] = [];
    const dueIn3DaysList: Client[] = [];

    const subscriptionCounts: Record<string, number> = {};
    const paymentMethodCounts: Record<string, number> = {};

    filteredClients.forEach(client => {
      const amount = parseCurrency(client.amountPaid);
      const dueDate = client.dueDate ? client.dueDate.toDate() : null;
      const createdAt = client.createdAt ? client.createdAt.toDate() : null;

      if (createdAt && isToday(createdAt)) {
          newClientsTodayCount++;
      }

      let isOverdue = false;
      if (client.status === 'Vencido') {
          isOverdue = true;
          if (dueDate && isToday(dueDate)) {
              expiredTodayCount++;
          }
      } else if (client.status === 'Ativo' && dueDate && dueDate <= now) {
          isOverdue = true;
          if (isToday(dueDate)) {
              expiredTodayCount++;
          }
      }
      
      if (isOverdue) {
          overdueCount++;
          overdueTotal += amount;
      } else if (client.status === 'Ativo') {
          activeCount++;
          activeTotal += amount;
      }

      if (dueDate) {
        if (isToday(dueDate) && dueDate > now) {
          dueTodayCount++;
          dueTodayTotal += amount;
          dueTodayList.push(client);
        } 
        else if (isWithinInterval(dueDate, { start: addDays(today, 1), end: threeDaysFromNow })) {
          dueIn3DaysCount++;
          dueIn3DaysTotal += amount;
          dueIn3DaysList.push(client);
        }
      }
      
      const dateToFilter = createdAt || dueDate;
      if (dateToFilter && isWithinInterval(dateToFilter, { start: periodStart, end: periodEnd })) {
        totalSales += amount;
      }

      const sub = client.subscription || 'N/A';
      subscriptionCounts[sub] = (subscriptionCounts[sub] || 0) + 1;

      const method = client.paymentMethod || 'N/A';
      paymentMethodCounts[method] = (paymentMethodCounts[method] || 0) + 1;
    });

    const totalClients = filteredClients.length;
    const activePercentage = totalClients > 0 ? (activeCount / totalClients) * 100 : 0;
    const overduePercentage = totalClients > 0 ? (overdueCount / totalClients) * 100 : 0;
        
    const finalStats = {
      activeCount,
      activeTotal,
      overdueCount,
      overdueTotal,
      dueTodayCount,
      dueTodayTotal,
      dueIn3DaysCount,
      dueIn3DaysTotal,
      totalSales,
      activePercentage,
      overduePercentage,
      newClientsTodayCount,
      expiredTodayCount
    };

    const subscriptionData = Object.entries(subscriptionCounts).map(([name, value], index) => ({
      name: name === 'N/A' ? 'Não especificado' : name,
      value,
      fill: `hsl(var(--chart-${(index % 5) + 1}))`
    }));

    const paymentMethodData = Object.entries(paymentMethodCounts).map(([name, value], index) => ({
      name: name === 'N/A' ? 'Não especificado' : name,
      value,
      fill: `hsl(var(--chart-${(index % 5) + 1}))`
    }));

    return { stats: finalStats, subscriptionData, paymentMethodData, dueTodayList, dueIn3DaysList };

  }, [filteredClients, period]);
  
  const subscriptionChartConfig = useMemo(() => {
    if (!subscriptionData) return {};
    return subscriptionData.reduce((acc, item) => {
        acc[item.name] = {
            label: item.name,
            color: item.fill,
        };
        return acc;
    }, {} as ChartConfig);
  }, [subscriptionData]);
  
  const paymentMethodChartConfig = useMemo(() => {
    if (!paymentMethodData) return {};
    return paymentMethodData.reduce((acc, item) => {
        acc[item.name] = {
            label: item.name,
            color: item.fill,
        };
        return acc;
    }, {} as ChartConfig);
  }, [paymentMethodData]);

  if (isLoadingClients) {
    return (
      <div className="flex flex-col h-full">
        <PageHeader title="Início" />
        <main className="flex-1 overflow-auto p-4 md:p-6">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <Skeleton className="h-28" />
            <Skeleton className="h-28" />
            <Skeleton className="h-28" />
            <Skeleton className="h-28" />
          </div>
          <div className="mt-6">
            <Skeleton className="h-40" />
          </div>
           <div className="mt-6 grid grid-cols-1 gap-6 md:grid-cols-2">
            <Skeleton className="h-96" />
            <Skeleton className="h-96" />
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title={isAdmin ? "Painel do Sistema (Global)" : "Início"}
      />
      <main className="flex-1 overflow-auto p-4 md:p-6">
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 p-4 bg-green-50 dark:bg-green-950/50 rounded-t-lg text-green-700 dark:text-green-400">
              <div className="flex items-center gap-2">
                <Users className="h-5 w-5" />
                <CardTitle className="text-sm font-medium">Assinaturas Ativas</CardTitle>
              </div>
              <span className="text-sm font-medium">{stats.activePercentage.toFixed(1)}%</span>
            </CardHeader>
            <CardContent className="flex items-end justify-between p-4">
              <div className="flex items-baseline gap-2">
                <div className="text-3xl font-bold">{stats.activeCount}</div>
                <div className={cn(
                    "flex items-center text-xs font-medium",
                    stats.newClientsTodayCount >= 1 ? "text-green-600" : "text-red-600"
                )}>
                    {stats.newClientsTodayCount >= 1 ? <ArrowUp className="h-3 w-3 mr-0.5" /> : <ArrowDown className="h-3 w-3 mr-0.5" />}
                    {stats.newClientsTodayCount}
                </div>
              </div>
              <div className="text-lg font-semibold">{formatCurrency(stats.activeTotal)}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 p-4 bg-red-50 dark:bg-red-950/50 rounded-t-lg text-red-700 dark:text-red-400">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5" />
                <CardTitle className="text-sm font-medium">Vencidos</CardTitle>
              </div>
              <div className="flex items-center gap-2 text-sm font-medium">
                <span>{stats.overduePercentage.toFixed(1)}%</span>
              </div>
            </CardHeader>
            <CardContent className="flex items-end justify-between p-4">
              <div className="flex items-baseline gap-2">
                <div className="text-3xl font-bold">{stats.overdueCount}</div>
                <div className={cn(
                    "flex items-center text-xs font-medium",
                    stats.expiredTodayCount >= 1 ? "text-red-600" : "text-green-600"
                )}>
                    {stats.expiredTodayCount >= 1 ? <ArrowUp className="h-3 w-3 mr-0.5" /> : <ArrowDown className="h-3 w-3 mr-0.5" />}
                    {stats.expiredTodayCount}
                </div>
              </div>
              <div className="text-lg font-semibold">{formatCurrency(stats.overdueTotal)}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 p-4 bg-yellow-50 dark:bg-yellow-950/50 rounded-t-lg text-yellow-700 dark:text-yellow-400">
              <div className="flex items-center gap-2">
                <Calendar className="h-5 w-5" />
                <CardTitle className="text-sm font-medium">Vencem Hoje</CardTitle>
              </div>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-8 w-8 hover:bg-yellow-100 dark:hover:bg-yellow-900/50">
                    <Eye className="h-4 w-4" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-80 p-0" align="end">
                  <div className="p-4 border-b bg-muted/30">
                    <h4 className="font-semibold text-sm">Vencimentos de Hoje</h4>
                  </div>
                  <ScrollArea className="h-72">
                    <div className="p-2">
                      {dueTodayList.length > 0 ? (
                        dueTodayList.map(c => (
                          <div key={c.id} className="flex items-center justify-between p-2 hover:bg-muted rounded-md text-xs">
                            <div className="flex flex-col">
                                <span className="font-medium">{c.name}</span>
                                <span className="text-[10px] text-muted-foreground">{c.phone}</span>
                            </div>
                            <Badge variant="outline" className="text-[9px] px-1.5">{c.subscription}</Badge>
                          </div>
                        ))
                      ) : (
                        <p className="text-center text-muted-foreground p-4 text-xs italic">Nenhum vencimento para hoje.</p>
                      )}
                    </div>
                  </ScrollArea>
                </PopoverContent>
              </Popover>
            </CardHeader>
            <CardContent className="flex items-end justify-between p-4">
              <div className="text-3xl font-bold">{stats.dueTodayCount}</div>
              <div className="text-lg font-semibold">{formatCurrency(stats.dueTodayTotal)}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 p-4 bg-blue-50 dark:bg-blue-950/50 rounded-t-lg text-blue-700 dark:text-blue-400">
              <div className="flex items-center gap-2">
                <Clock className="h-5 w-5" />
                <CardTitle className="text-sm font-medium">Vencem em 3 Dias</CardTitle>
              </div>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-8 w-8 hover:bg-blue-100 dark:hover:bg-blue-900/50">
                    <Eye className="h-4 w-4" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-80 p-0" align="end">
                  <div className="p-4 border-b bg-muted/30">
                    <h4 className="font-semibold text-sm">Vencimentos em 3 Dias</h4>
                  </div>
                  <ScrollArea className="h-72">
                    <div className="p-2">
                      {dueIn3DaysList.length > 0 ? (
                        dueIn3DaysList.map(c => (
                          <div key={c.id} className="flex items-center justify-between p-2 hover:bg-muted rounded-md text-xs">
                            <div className="flex flex-col">
                                <span className="font-medium">{c.name}</span>
                                <span className="text-[10px] text-muted-foreground">{c.phone}</span>
                            </div>
                            <Badge variant="outline" className="text-[9px] px-1.5">{c.subscription}</Badge>
                          </div>
                        ))
                      ) : (
                        <p className="text-center text-muted-foreground p-4 text-xs italic">Nenhum vencimento previsto.</p>
                      )}
                    </div>
                  </ScrollArea>
                </PopoverContent>
              </Popover>
            </CardHeader>
            <CardContent className="flex items-end justify-between p-4">
              <div className="text-3xl font-bold">{stats.dueIn3DaysCount}</div>
              <div className="text-lg font-semibold">{formatCurrency(stats.dueIn3DaysTotal)}</div>
            </CardContent>
          </Card>
        </div>

        <div className="mt-6 grid grid-cols-1 lg:grid-cols-3 gap-6">
            <Card className="lg:col-span-2">
                <CardHeader className="flex flex-row items-center justify-between">
                    <div>
                        <CardTitle>Total de Vendas</CardTitle>
                        <p className="text-sm text-muted-foreground">Receita total no período selecionado (Baseado na sua equipe).</p>
                    </div>
                    <Select value={period} onValueChange={setPeriod}>
                        <SelectTrigger className="w-[180px]">
                            <SelectValue placeholder="Selecione o período" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="today">Hoje</SelectItem>
                            <SelectItem value="this-week">Esta Semana</SelectItem>
                            <SelectItem value="this-month">Este Mês</SelectItem>
                            <SelectItem value="this-year">Este Ano</SelectItem>
                        </SelectContent>
                    </Select>
                </CardHeader>
                <CardContent>
                    <div className="flex items-center gap-2">
                        < DollarSign className="h-10 w-10 text-green-500" />
                        <p className="text-5xl font-bold">{formatCurrency(stats.totalSales)}</p>
                    </div>
                </CardContent>
            </Card>

            <Card className="flex flex-col shadow-lg border-primary/20">
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Trophy className="h-5 w-5 text-yellow-500" />
                        Ranking Global: Donos de Conta
                    </CardTitle>
                    <CardDescription>
                        Performance baseada em todas as assinaturas do sistema.
                    </CardDescription>
                </CardHeader>
                <CardContent className="flex-1">
                    <ScrollArea className="h-[200px]">
                        <Table>
                            <TableHeader>
                                <TableRow className="hover:bg-transparent border-b">
                                    <TableHead className="w-12 text-center">Pos</TableHead>
                                    <TableHead>Nome</TableHead>
                                    <TableHead className="text-center">Ativos</TableHead>
                                    <TableHead className="text-right">Faturamento</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {rankingData.map((participant, index) => (
                                    <TableRow key={participant.id} className="group transition-colors">
                                        <TableCell className="font-bold py-3 text-center">
                                            {index === 0 && <Trophy className="h-5 w-5 text-yellow-500 mx-auto" />}
                                            {index === 1 && <Medal className="h-5 w-5 text-slate-400 mx-auto" />}
                                            {index === 2 && <Medal className="h-5 w-5 text-orange-600 mx-auto" />}
                                        </TableCell>
                                        <TableCell className="py-3">
                                            <span className="font-medium text-sm block truncate max-w-[120px]">
                                                {participant.name}
                                            </span>
                                        </TableCell>
                                        <TableCell className="text-center py-3">
                                            <Badge variant="secondary" className="font-bold">{participant.count}</Badge>
                                        </TableCell>
                                        <TableCell className="text-right py-3">
                                            <span className="text-xs font-semibold text-green-600 dark:text-green-400">
                                                {formatCurrency(participant.revenue)}
                                            </span>
                                        </TableCell>
                                    </TableRow>
                                ))}
                                {rankingData.length === 0 && (
                                    <TableRow>
                                        <TableCell colSpan={4} className="text-center text-muted-foreground py-8 italic text-xs">
                                            Nenhum resultado para exibir no ranking.
                                        </TableCell>
                                    </TableRow>
                                )}
                            </TableBody>
                        </Table>
                    </ScrollArea>
                </CardContent>
            </Card>
        </div>

         <div className="mt-6 grid grid-cols-1 gap-6 md:grid-cols-2">
          <Card className="flex flex-col">
            <CardHeader>
              <CardTitle>Assinaturas</CardTitle>
              <CardDescription>Distribuição de clientes por plano (Sua Equipe)</CardDescription>
            </CardHeader>
            <CardContent className="flex-1 min-h-[400px]">
              {subscriptionData.length > 0 ? (
                <ChartContainer config={subscriptionChartConfig} className="w-full h-full aspect-auto">
                  <PieChart>
                    <ChartTooltip cursor={false} content={<ChartTooltipContent hideLabel />} />
                    <Pie data={subscriptionData} dataKey="value" nameKey="name" innerRadius={60} strokeWidth={5}>
                      {subscriptionData.map((entry) => (
                        <Cell key={`cell-${entry.name}`} fill={entry.fill} className="stroke-background focus:outline-none" />
                      ))}
                    </Pie>
                    <ChartLegend content={<ChartLegendContent nameKey="name" className="flex-wrap justify-center" />} />
                  </PieChart>
                </ChartContainer>
              ) : (
                <div className="flex h-full items-center justify-center text-muted-foreground">
                  Nenhum dado de assinatura para exibir.
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="flex flex-col">
            <CardHeader>
              <CardTitle>Formas de Pagamento</CardTitle>
              <CardDescription>Distribuição de clientes por forma de pagamento (Sua Equipe)</CardDescription>
            </CardHeader>
            <CardContent className="flex-1 min-h-[400px]">
               {paymentMethodData.length > 0 ? (
                <ChartContainer config={paymentMethodChartConfig} className="w-full h-full aspect-auto">
                  <PieChart>
                    <ChartTooltip cursor={false} content={<ChartTooltipContent hideLabel />} />
                    <Pie data={paymentMethodData} dataKey="value" nameKey="name" innerRadius={60} strokeWidth={5}>
                      {paymentMethodData.map((entry) => (
                        <Cell key={`cell-${entry.name}`} fill={entry.fill} className="stroke-background focus:outline-none" />
                      ))}
                    </Pie>
                    <ChartLegend content={<ChartLegendContent nameKey="name" className="flex-wrap justify-center" />} />
                  </PieChart>
                </ChartContainer>
              ) : (
                <div className="flex h-full items-center justify-center text-muted-foreground">
                  Nenhum dado de pagamento para exibir.
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
