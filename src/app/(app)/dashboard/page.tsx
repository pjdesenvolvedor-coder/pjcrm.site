'use client';

import { Users, AlertTriangle, Calendar, Clock, DollarSign } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PageHeader } from '@/components/page-header';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useFirebase, useUser, useCollection, useMemoFirebase } from '@/firebase';
import { collection, query, orderBy } from 'firebase/firestore';
import type { Client } from '@/lib/types';
import { useState, useMemo } from 'react';
import { isToday, isWithinInterval, addDays, startOfToday, endOfToday, startOfWeek, endOfWeek, startOfMonth, endOfMonth, startOfYear, endOfYear } from 'date-fns';
import { Skeleton } from '@/components/ui/skeleton';

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

  const dashboardData = useMemo(() => {
    if (!clients) {
      return {
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
    }

    const today = startOfToday();
    const threeDaysFromNow = addDays(today, 3);
    
    let activeCount = 0;
    let activeTotal = 0;
    let overdueCount = 0;
    let overdueTotal = 0;
    let dueTodayCount = 0;
    let dueTodayTotal = 0;
    let dueIn3DaysCount = 0;
    let dueIn3DaysTotal = 0;

    clients.forEach(client => {
      const amount = parseCurrency(client.amountPaid);
      const dueDate = client.dueDate ? client.dueDate.toDate() : null;

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
    });

    const totalClients = clients.length;
    const activePercentage = totalClients > 0 ? (activeCount / totalClients) * 100 : 0;
    const overduePercentage = totalClients > 0 ? (overdueCount / totalClients) * 100 : 0;


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

    const totalSales = clients
        .filter(client => {
            const dueDate = client.dueDate ? client.dueDate.toDate() : null;
            // Assuming sales are counted based on due date. If another date field is more appropriate, it should be used.
            return dueDate && isWithinInterval(dueDate, { start: periodStart, end: periodEnd });
        })
        .reduce((sum, client) => sum + parseCurrency(client.amountPaid), 0);
        

    return {
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

  }, [clients, period]);
  
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
              <span className="text-sm font-medium">{dashboardData.activePercentage.toFixed(1)}%</span>
            </CardHeader>
            <CardContent className="flex items-end justify-between p-4">
              <div className="text-3xl font-bold">{dashboardData.activeCount}</div>
              <div className="text-lg font-semibold">{formatCurrency(dashboardData.activeTotal)}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 p-4 bg-red-50 dark:bg-red-950/50 rounded-t-lg text-red-700 dark:text-red-400">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5" />
                <CardTitle className="text-sm font-medium">Vencidos</CardTitle>
              </div>
              <div className="flex items-center gap-2 text-sm font-medium">
                <span>{dashboardData.overduePercentage.toFixed(1)}%</span>
              </div>
            </CardHeader>
            <CardContent className="flex items-end justify-between p-4">
              <div className="text-3xl font-bold">{dashboardData.overdueCount}</div>
              <div className="text-lg font-semibold">{formatCurrency(dashboardData.overdueTotal)}</div>
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
              <div className="text-3xl font-bold">{dashboardData.dueTodayCount}</div>
              <div className="text-lg font-semibold">{formatCurrency(dashboardData.dueTodayTotal)}</div>
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
              <div className="text-3xl font-bold">{dashboardData.dueIn3DaysCount}</div>
              <div className="text-lg font-semibold">{formatCurrency(dashboardData.dueIn3DaysTotal)}</div>
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
                    <p className="text-5xl font-bold">{formatCurrency(dashboardData.totalSales)}</p>
                </div>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
