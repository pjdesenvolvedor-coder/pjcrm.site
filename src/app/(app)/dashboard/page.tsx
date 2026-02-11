'use client';

import { Users, AlertTriangle, Calendar, Clock, DollarSign } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { PageHeader } from '@/components/page-header';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useFirebase, useUser, useCollection, useMemoFirebase } from '@/firebase';
import { collection, query } from 'firebase/firestore';
import type { Client } from '@/lib/types';
import { useState, useMemo } from 'react';
import { isToday, isWithinInterval, addDays, startOfToday, endOfToday, startOfWeek, endOfWeek, startOfMonth, endOfMonth, startOfYear, endOfYear } from 'date-fns';
import { Skeleton } from '@/components/ui/skeleton';
import { PieChart, Pie, Cell } from "recharts";
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";


const parseCurrency = (value?: string): number => {
  if (!value) return 0;
  // Handles formats like "1.500,50" or "1500.50"
  const cleanedValue = value.toString().replace(/\./g, '').replace(',', '.');
  const number = parseFloat(cleanedValue);
  return isNaN(number) ? 0 : number;
};

const formatCurrency = (value: number): string => {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
};

export default function DashboardPage() {
  const { firestore, user } = useFirebase();
  const [period, setPeriod] = useState('this-month');

  const clientsQuery = useMemoFirebase(() => {
    if (!user) return null;
    return query(collection(firestore, 'users', user.uid, 'clients'));
  }, [firestore, user]);

  const { data: clients, isLoading } = useCollection<Client>(clientsQuery);

  const { stats, subscriptionData, paymentMethodData } = useMemo(() => {
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
    };

    if (!clients) {
      return { stats: baseStats, subscriptionData: [], paymentMethodData: [] };
    }

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

    const subscriptionCounts: Record<string, number> = {};
    const paymentMethodCounts: Record<string, number> = {};

    clients.forEach(client => {
      const amount = parseCurrency(client.amountPaid);
      const dueDate = client.dueDate ? client.dueDate.toDate() : null;

      // Stats independent of 'period'
      if (client.status === 'Ativo') {
        activeCount++;
        activeTotal += amount;
      } else if (client.status === 'Vencido') {
        overdueCount++;
        overdueTotal += amount;
      }

      if (dueDate) {
        if (isToday(dueDate)) {
          dueTodayCount++;
          dueTodayTotal += amount;
        } else if (isWithinInterval(dueDate, { start: addDays(today, 1), end: threeDaysFromNow })) {
          dueIn3DaysCount++;
          dueIn3DaysTotal += amount;
        }
      }
      
      // Stat dependent on 'period'
      if (dueDate && isWithinInterval(dueDate, { start: periodStart, end: periodEnd })) {
        totalSales += amount;
      }

      // Chart data
      const sub = client.subscription || 'N/A';
      subscriptionCounts[sub] = (subscriptionCounts[sub] || 0) + 1;

      const method = client.paymentMethod || 'N/A';
      paymentMethodCounts[method] = (paymentMethodCounts[method] || 0) + 1;
    });

    const totalClients = clients.length;
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
      overduePercentage
    };

    const subscriptionData = Object.entries(subscriptionCounts).map(([name, value], index) => ({
      name: name === 'N/A' ? 'Não especificado' : name,
      value,
      fill: `hsl(var(--chart-${index + 1}))`
    }));

    const paymentMethodData = Object.entries(paymentMethodCounts).map(([name, value], index) => ({
      name: name === 'N/A' ? 'Não especificado' : name,
      value,
      fill: `hsl(var(--chart-${index + 1}))`
    }));

    return { stats: finalStats, subscriptionData, paymentMethodData };

  }, [clients, period]);
  
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

  if (isLoading) {
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
        title="Início"
      />
      <main className="flex-1 overflow-auto p-4 md:p-6">
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 p-4 bg-green-50 dark:bg-green-950/50 rounded-t-lg text-green-700 dark:text-green-400">
              <div className="flex items-center gap-2">
                <Users className="h-5 w-5" />
                <CardTitle className="text-sm font-medium">Ativos</CardTitle>
              </div>
              <span className="text-sm font-medium">{stats.activePercentage.toFixed(1)}%</span>
            </CardHeader>
            <CardContent className="flex items-end justify-between p-4">
              <div className="text-3xl font-bold">{stats.activeCount}</div>
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
              <div className="text-3xl font-bold">{stats.overdueCount}</div>
              <div className="text-lg font-semibold">{formatCurrency(stats.overdueTotal)}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 p-4 bg-yellow-50 dark:bg-yellow-950/50 rounded-t-lg text-yellow-700 dark:text-yellow-400">
              <div className="flex items-center gap-2">
                <Calendar className="h-5 w-5" />
                <CardTitle className="text-sm font-medium">Vencem Hoje</CardTitle>
              </div>
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
            </CardHeader>
            <CardContent className="flex items-end justify-between p-4">
              <div className="text-3xl font-bold">{stats.dueIn3DaysCount}</div>
              <div className="text-lg font-semibold">{formatCurrency(stats.dueIn3DaysTotal)}</div>
            </CardContent>
          </Card>
        </div>
        <div className="mt-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
                <div>
                    <CardTitle>Total de Vendas</CardTitle>
                    <p className="text-sm text-muted-foreground">Receita total no período selecionado.</p>
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
                    <DollarSign className="h-10 w-10 text-green-500" />
                    <p className="text-5xl font-bold">{formatCurrency(stats.totalSales)}</p>
                </div>
            </CardContent>
          </Card>
        </div>

         <div className="mt-6 grid grid-cols-1 gap-6 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Assinaturas</CardTitle>
              <CardDescription>Distribuição de clientes por plano</CardDescription>
            </CardHeader>
            <CardContent className="h-[300px]">
              {subscriptionData.length > 0 ? (
                <ChartContainer config={subscriptionChartConfig} className="w-full h-full">
                  <PieChart>
                    <ChartTooltip cursor={false} content={<ChartTooltipContent hideLabel />} />
                    <Pie data={subscriptionData} dataKey="value" nameKey="name" innerRadius={60} strokeWidth={5}>
                      {subscriptionData.map((entry) => (
                        <Cell key={`cell-${entry.name}`} fill={entry.fill} className="stroke-background focus:outline-none" />
                      ))}
                    </Pie>
                    <ChartLegend content={<ChartLegendContent nameKey="name" />} />
                  </PieChart>
                </ChartContainer>
              ) : (
                <div className="flex h-full items-center justify-center text-muted-foreground">
                  Nenhum dado de assinatura para exibir.
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Formas de Pagamento</CardTitle>
              <CardDescription>Distribuição de clientes por forma de pagamento</CardDescription>
            </CardHeader>
            <CardContent className="h-[300px]">
               {paymentMethodData.length > 0 ? (
                <ChartContainer config={paymentMethodChartConfig} className="w-full h-full">
                  <PieChart>
                    <ChartTooltip cursor={false} content={<ChartTooltipContent hideLabel />} />
                    <Pie data={paymentMethodData} dataKey="value" nameKey="name" innerRadius={60} strokeWidth={5}>
                      {paymentMethodData.map((entry) => (
                        <Cell key={`cell-${entry.name}`} fill={entry.fill} className="stroke-background focus:outline-none" />
                      ))}
                    </Pie>
                    <ChartLegend content={<ChartLegendContent nameKey="name" />} />
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
