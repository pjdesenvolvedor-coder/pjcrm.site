'use client';

import { Users, AlertTriangle, Calendar, Clock, Eye, DollarSign } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PageHeader } from '@/components/page-header';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

export default function DashboardPage() {
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
              <span className="text-sm font-medium">0.0%</span>
            </CardHeader>
            <CardContent className="flex items-end justify-between p-4">
              <div className="text-3xl font-bold">0</div>
              <div className="text-lg font-semibold">R$ 0,00</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 p-4 bg-red-50 dark:bg-red-950/50 rounded-t-lg text-red-700 dark:text-red-400">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5" />
                <CardTitle className="text-sm font-medium">Vencidos</CardTitle>
              </div>
              <div className="flex items-center gap-2 text-sm font-medium">
                <Eye className="h-4 w-4" />
                <span>0.0%</span>
              </div>
            </CardHeader>
            <CardContent className="flex items-end justify-between p-4">
              <div className="text-3xl font-bold">0</div>
              <div className="text-lg font-semibold">R$ 0,00</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 p-4 bg-yellow-50 dark:bg-yellow-950/50 rounded-t-lg text-yellow-700 dark:text-yellow-400">
              <div className="flex items-center gap-2">
                <Calendar className="h-5 w-5" />
                <CardTitle className="text-sm font-medium">Vencem Hoje</CardTitle>
              </div>
              <Eye className="h-4 w-4" />
            </CardHeader>
            <CardContent className="flex items-end justify-between p-4">
              <div className="text-3xl font-bold">0</div>
              <div className="text-lg font-semibold">R$ 0,00</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 p-4 bg-blue-50 dark:bg-blue-950/50 rounded-t-lg text-blue-700 dark:text-blue-400">
              <div className="flex items-center gap-2">
                <Clock className="h-5 w-5" />
                <CardTitle className="text-sm font-medium">Vencem em 3 Dias</CardTitle>
              </div>
               <Eye className="h-4 w-4" />
            </CardHeader>
            <CardContent className="flex items-end justify-between p-4">
              <div className="text-3xl font-bold">0</div>
              <div className="text-lg font-semibold">R$ 0,00</div>
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
                <Select defaultValue="this-month">
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
                    <p className="text-5xl font-bold">R$ 0,00</p>
                </div>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
