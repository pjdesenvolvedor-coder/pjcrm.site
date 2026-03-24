'use client';

import React, { useState, useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon, Loader2, Users } from 'lucide-react';
import { useFirebase, useCollection, useMemoFirebase } from '@/firebase';
import { collection, query } from 'firebase/firestore';
import type { Client } from '@/lib/types';
import {
  format,
  addMonths,
  subMonths,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  isSameMonth,
  isSameDay,
  isToday,
} from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";

export default function CalendarPage() {
  const { firestore, effectiveUserId, isUserLoading } = useFirebase();
  const [currentDate, setCurrentDate] = useState(new Date());

  const clientsQuery = useMemoFirebase(() => {
    if (!effectiveUserId) return null;
    return query(collection(firestore, 'users', effectiveUserId, 'clients'));
  }, [firestore, effectiveUserId]);

  const { data: clients, isLoading } = useCollection<Client>(clientsQuery);

  const nextMonth = () => setCurrentDate(addMonths(currentDate, 1));
  const prevMonth = () => setCurrentDate(subMonths(currentDate, 1));

  // Generate calendar grid
  const monthStart = startOfMonth(currentDate);
  const monthEnd = endOfMonth(monthStart);
  const startDate = startOfWeek(monthStart, { weekStartsOn: 0 }); // Sunday
  const endDate = endOfWeek(monthEnd, { weekStartsOn: 0 });

  const dateFormat = "MMMM yyyy";
  const days = eachDayOfInterval({
    start: startDate,
    end: endDate
  });

  const weekDays = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

  // Calculate expirations per day
  const expirationsByDate = useMemo(() => {
    if (!clients) return {};

    const map: Record<string, Client[]> = {};
    clients.forEach(client => {
      // Only consider clients that are not Inativo and have a dueDate
      if (client.status !== 'Inativo' && client.dueDate) {
        const dateKey = format(client.dueDate.toDate(), 'yyyy-MM-dd');
        if (!map[dateKey]) {
          map[dateKey] = [];
        }
        map[dateKey].push(client);
      }
    });
    return map;
  }, [clients]);

  if (isUserLoading || isLoading) {
    return (
      <div className="flex h-full w-full items-center justify-center p-8 min-h-[500px]">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-10 w-10 animate-spin text-primary" />
          <p className="text-muted-foreground animate-pulse">Carregando calendário...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col p-4 md:p-8 w-full gap-6 animate-in fade-in-50 duration-500">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3">
            <CalendarIcon className="h-8 w-8 text-primary" />
            Calendário de Vencimentos
          </h1>
          <p className="text-muted-foreground mt-1">
            Visualize os clientes com assinatura a vencer em cada dia.
          </p>
        </div>

        <div className="flex items-center gap-2 bg-background border rounded-lg p-1.5 shadow-sm">
          <Button variant="ghost" size="icon" onClick={prevMonth} className="hover:bg-muted">
            <ChevronLeft className="h-5 w-5" />
          </Button>
          <div className="w-48 text-center font-semibold capitalize text-lg">
            {format(currentDate, dateFormat, { locale: ptBR })}
          </div>
          <Button variant="ghost" size="icon" onClick={nextMonth} className="hover:bg-muted">
            <ChevronRight className="h-5 w-5" />
          </Button>
        </div>
      </div>

      <Card className="flex-1 flex flex-col min-h-[600px] overflow-hidden shadow-xl border-muted">
        <CardContent className="flex-1 p-0 flex flex-col min-h-0 overflow-auto bg-card">
          <div className="grid grid-cols-7 border-b bg-muted/40 sticky top-0 z-10 min-w-[700px] shadow-sm">
            {weekDays.map(day => (
              <div key={day} className="py-4 text-center text-sm font-bold text-foreground uppercase tracking-wider">
                {day}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7 flex-1 min-w-[700px] auto-rows-fr bg-muted/10 gap-[1px]">
            {days.map((day, idx) => {
              const dateKey = format(day, 'yyyy-MM-dd');
              const clientsOnDay = expirationsByDate[dateKey] || [];
              const isCurrentMonth = isSameMonth(day, monthStart);
              const isTodayDay = isToday(day);

              return (
                <div
                  key={day.toString()}
                  className={cn(
                    "min-h-[140px] bg-background p-3 transition-colors group relative flex flex-col",
                    !isCurrentMonth && "bg-muted/30 text-muted-foreground/50",
                    isCurrentMonth && "hover:bg-muted/50",
                    isTodayDay && "bg-blue-50/30 ring-1 ring-inset ring-blue-500/20"
                  )}
                >
                  <div className="flex justify-between items-start mb-2">
                    <span className={cn(
                      "text-sm font-bold w-8 h-8 flex items-center justify-center rounded-full transition-colors",
                      isTodayDay && "bg-primary text-primary-foreground shadow-md",
                      !isTodayDay && isCurrentMonth && "text-foreground group-hover:bg-muted",
                    )}>
                      {format(day, 'd')}
                    </span>

                    {clientsOnDay.length > 0 && (
                      <Popover>
                        <PopoverTrigger asChild>
                          <button className="flex items-center justify-center w-8 h-8 bg-destructive text-destructive-foreground hover:bg-destructive/90 rounded-full text-sm font-black shadow-md transition-transform hover:scale-110 active:scale-95 animate-in zoom-in spin-in-12 duration-300">
                            {clientsOnDay.length}
                          </button>
                        </PopoverTrigger>
                        <PopoverContent className="w-80 p-0 shadow-2xl border-muted" align="end" side="bottom">
                          <div className="flex flex-col">
                            <div className="px-4 py-3 border-b bg-muted/30">
                              <h4 className="font-semibold flex items-center gap-2 text-foreground">
                                <Users className="h-4 w-4 text-primary" />
                                Vencimentos em {format(day, 'dd/MM/yyyy')}
                              </h4>
                              <p className="text-xs text-muted-foreground mt-1">
                                {clientsOnDay.length} cliente{clientsOnDay.length !== 1 ? 's' : ''} vence{clientsOnDay.length !== 1 ? 'm' : ''} neste dia.
                              </p>
                            </div>
                            <ScrollArea className="h-[250px]">
                              <div className="p-2 space-y-1">
                                {clientsOnDay.map(c => (
                                  <div key={c.id} className="flex flex-col py-2 px-3 hover:bg-muted rounded-md transition-colors gap-1">
                                    <div className="flex justify-between items-start gap-2">
                                      <span className="font-medium text-sm line-clamp-1 flex-1" title={c.name}>{c.name}</span>
                                      <Badge variant="outline" className="text-[10px] shrink-0 font-medium">
                                        {c.status}
                                      </Badge>
                                    </div>
                                    <span className="text-xs text-muted-foreground flex items-center gap-1">
                                      {c.phone}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            </ScrollArea>
                          </div>
                        </PopoverContent>
                      </Popover>
                    )}
                  </div>

                  {/* Miniature dots for visual effect when there are clients */}
                  {clientsOnDay.length > 0 && (
                    <div className="mt-auto flex flex-wrap gap-1 px-1">
                      {clientsOnDay.slice(0, 5).map((_, i) => (
                        <div key={i} className="w-1.5 h-1.5 rounded-full bg-destructive/60" />
                      ))}
                      {clientsOnDay.length > 5 && (
                        <div className="text-[10px] font-bold text-muted-foreground leading-none flex items-center">
                          +
                        </div>
                      )}
                    </div>
                  )}

                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

