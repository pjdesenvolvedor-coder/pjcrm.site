'use client';

import React, { useState, useCallback, useEffect, useMemo } from 'react';
import Image from 'next/image';
import { 
  Users, 
  ShieldCheck, 
  UserCheck, 
  UserX, 
  Clock, 
  Lock, 
  Unlock, 
  Trash2, 
  Gift, 
  CalendarDays, 
  Search, 
  RefreshCw, 
  Edit3, 
  CheckCircle2, 
  AlertCircle,
  MoreVertical,
  PlusCircle,
  Calendar,
  Sparkles,
  Shield,
  Layers,
  ChevronLeft,
  ChevronRight,
  Download,
  Copy,
  Check,
  Zap,
  TrendingUp,
  SlidersHorizontal,
  FolderLock,
  MessageSquare,
  BadgeDollarSign,
  Activity,
  ExternalLink,
  Crown
} from 'lucide-react';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useFirebase, useUser, setDocumentNonBlocking, useCollection, useMemoFirebase, useDoc } from '@/firebase';
import { 
  collection, 
  query, 
  getDocs, 
  limit, 
  orderBy, 
  startAfter, 
  endBefore, 
  limitToLast, 
  type QueryDocumentSnapshot, 
  doc, 
  Timestamp, 
  deleteDoc 
} from 'firebase/firestore';
import type { UserProfile, UserPermissions, Settings } from '@/lib/types';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from '@/components/ui/form';
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { 
  AlertDialog, 
  AlertDialogAction, 
  AlertDialogCancel, 
  AlertDialogContent, 
  AlertDialogDescription, 
  AlertDialogFooter, 
  AlertDialogHeader, 
  AlertDialogTitle, 
  AlertDialogTrigger 
} from '@/components/ui/alert-dialog';
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuLabel, 
  DropdownMenuSeparator, 
  DropdownMenuTrigger 
} from '@/components/ui/dropdown-menu';
import { Skeleton } from '@/components/ui/skeleton';
import { differenceInSeconds, addDays, format, isAfter } from 'date-fns';

const permissionsSchema = z.object({
  dashboard: z.boolean().default(false),
  customers: z.boolean().default(false),
  inbox: z.boolean().default(false),
  automations: z.boolean().default(false),
  groups: z.boolean().default(false),
  shot: z.boolean().default(false),
  zapconnect: z.boolean().default(false),
  settings: z.boolean().default(false),
  users: z.boolean().default(false),
  estoque: z.boolean().default(false),
  notes: z.boolean().default(false),
  ads: z.boolean().default(false),
  pix: z.boolean().default(false),
  dbCleaner: z.boolean().default(false),
  zapVendas: z.boolean().default(false),
  linksClaro: z.boolean().default(false),
  flows: z.boolean().default(false),
});

interface PermissionCategory {
  category: string;
  items: { key: keyof UserPermissions; label: string; desc: string }[];
}

const categorizedPermissions: PermissionCategory[] = [
  {
    category: "Comercial & Vendas",
    items: [
      { key: 'dashboard', label: 'Dashboard Geral', desc: 'Métricas e resumo da operação' },
      { key: 'customers', label: 'Clientes & Leads', desc: 'Gestão de contatos e funil' },
      { key: 'zapVendas', label: 'PDV Zap Vendas', desc: 'Módulo de vendas e catálogo' },
      { key: 'shot', label: 'Disparo em Massa', desc: 'Envio para listas de clientes' },
      { key: 'estoque', label: 'Estoque de Contas', desc: 'Armazenamento de credenciais' },
    ]
  },
  {
    category: "Comunicação & Automações",
    items: [
      { key: 'zapconnect', label: 'Hub Principal (WhatsApp)', desc: 'Conexão e pareamento QR' },
      { key: 'groups', label: 'Grupos & Comunidades', desc: 'Extração e agendamento de grupos' },
      { key: 'automations', label: 'Automações & Vencimentos', desc: 'Mensagens automáticas e cobrança' },
      { key: 'flows', label: 'Fluxos & Menus Interativos', desc: 'Bot e fluxos de conversa' },
      { key: 'inbox', label: 'Chat Ao Vivo (Inbox)', desc: 'Central de conversas unificadas' },
    ]
  },
  {
    category: "Financeiro & Operacional",
    items: [
      { key: 'pix', label: 'Gerador Pix & Cobrança', desc: 'Cobrança via QR Pix dinâmico' },
      { key: 'linksClaro', label: 'Links & Logins Claro', desc: 'Gestão de acessos e logins' },
      { key: 'notes', label: 'Notas & Tarefas', desc: 'Anotações da equipe' },
      { key: 'ads', label: 'Relatórios de Anúncios', desc: 'Métricas de campanhas' },
    ]
  },
  {
    category: "Administração & Sistema",
    items: [
      { key: 'dbCleaner', label: 'Limpeza Web (DB Cleaner)', desc: 'Remoção de duplicatas e retornos' },
      { key: 'settings', label: 'Configurações do CRM', desc: 'Ajustes gerais e integrações' },
      { key: 'users', label: 'Gerenciar Usuários (Admin)', desc: 'Controle de contas da plataforma' },
    ]
  }
];

const allPermissionKeys = categorizedPermissions.flatMap(c => c.items.map(i => i.key));

const userFormSchema = z.object({
  role: z.enum(['Admin', 'User', 'Agent']),
  subscriptionPlan: z.enum(['basic', 'pro', 'none']).optional(),
  status: z.enum(['active', 'blocked']),
  permissions: permissionsSchema,
  subscriptionEndDate: z.string().optional(),
});

type UserFormData = z.infer<typeof userFormSchema>;

function formatDuration(seconds: number) {
  if (seconds < 0) return "Expirado";
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  if (days > 0) return `${days}d ${hours}h restantes`;
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours > 0) return `${hours}h ${minutes}m restantes`;
  return `${minutes}m restantes`;
}

function UserClientCount({ userId }: { userId: string }) {
  const { firestore } = useFirebase();
  const clientsQuery = useMemoFirebase(() => {
    if (!firestore || !userId) return null;
    return collection(firestore, 'users', userId, 'clients');
  }, [firestore, userId]);

  const { data: clients, isLoading } = useCollection(clientsQuery);

  if (isLoading) {
    return <Skeleton className="h-4 w-8" />;
  }

  const count = clients?.length ?? 0;

  return (
    <div className="flex items-center gap-1.5">
      <span className={cn(
        "font-mono text-xs font-bold px-2 py-0.5 rounded-full border",
        count > 0 
          ? "bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/20" 
          : "bg-muted text-muted-foreground border-border"
      )}>
        {count} {count === 1 ? 'cliente' : 'clientes'}
      </span>
    </div>
  );
}

function UserWebhookStatus({ userId }: { userId: string }) {
  const { firestore } = useFirebase();
  const settingsDocRef = useMemoFirebase(() => {
    if (!firestore || !userId) return null;
    return doc(firestore, 'users', userId, 'settings', 'config');
  }, [firestore, userId]);

  const { data: settings, isLoading } = useDoc<Settings>(settingsDocRef);

  if (isLoading) {
    return <Skeleton className="h-4 w-16" />;
  }

  const hasToken = typeof settings?.webhookToken === 'string' && settings.webhookToken.length > 0;

  return hasToken ? (
    <Badge variant="outline" className="text-[10px] h-5 px-1.5 border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 gap-1">
      <Zap className="h-3 w-3 fill-emerald-500 text-emerald-500" /> WhatsApp Configurado
    </Badge>
  ) : (
    <span className="text-[11px] text-muted-foreground italic">Sem WhatsApp vinculado</span>
  );
}

function SubscriptionCell({ endDate }: { endDate?: Timestamp }) {
  const [remainingTime, setRemainingTime] = useState<string | null>(null);

  useEffect(() => {
    if (!endDate) {
      setRemainingTime("Vitalício");
      return;
    }

    const subDate = endDate.toDate();
    const updateTime = () => {
      const now = new Date();
      const totalSeconds = differenceInSeconds(subDate, now);
      setRemainingTime(formatDuration(totalSeconds));
    };

    updateTime();
    const interval = setInterval(updateTime, 60000);
    return () => clearInterval(interval);
  }, [endDate]);

  if (remainingTime === null) {
    return <Skeleton className="h-4 w-24" />;
  }

  const isExpired = remainingTime === 'Expirado';
  const isLifetime = remainingTime === 'Vitalício';

  return (
    <div className="flex flex-col gap-0.5">
      <div className="flex items-center gap-1.5">
        {isExpired ? (
          <Badge variant="destructive" className="h-5 text-[10px] px-2 font-semibold">
            Expirado
          </Badge>
        ) : isLifetime ? (
          <Badge variant="outline" className="h-5 text-[10px] px-2 font-semibold border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400">
            Vitalício
          </Badge>
        ) : (
          <span className="font-mono text-xs font-semibold text-foreground">
            {remainingTime}
          </span>
        )}
      </div>
      {endDate && (
        <span className="text-[11px] text-muted-foreground font-mono">
          Vence em {format(endDate.toDate(), 'dd/MM/yyyy')}
        </span>
      )}
    </div>
  );
}

function UserEditModal({ user, onFinished }: { user: UserProfile; onFinished: () => void }) {
  const { firestore, user: currentUser } = useFirebase();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<'profile' | 'permissions' | 'diagnostics'>('profile');

  const form = useForm<UserFormData>({
    resolver: zodResolver(userFormSchema),
    defaultValues: {
      role: user.role || 'User',
      subscriptionPlan: (user.subscriptionPlan as any) || 'none',
      status: user.status || 'active',
      permissions: {
        dashboard: user.permissions?.dashboard ?? true,
        customers: user.permissions?.customers ?? true,
        inbox: user.permissions?.inbox ?? false,
        automations: user.permissions?.automations ?? true,
        groups: user.permissions?.groups ?? true,
        shot: user.permissions?.shot ?? true,
        zapconnect: user.permissions?.zapconnect ?? true,
        settings: user.permissions?.settings ?? true,
        users: user.permissions?.users ?? (user.role === 'Admin'),
        estoque: user.permissions?.estoque ?? true,
        notes: user.permissions?.notes ?? true,
        ads: user.permissions?.ads ?? true,
        pix: user.permissions?.pix ?? true,
        dbCleaner: user.permissions?.dbCleaner ?? true,
        zapVendas: user.permissions?.zapVendas ?? true,
        linksClaro: user.permissions?.linksClaro ?? true,
        flows: user.permissions?.flows ?? true,
      },
      subscriptionEndDate: user.subscriptionEndDate ? format(user.subscriptionEndDate.toDate(), 'dd/MM/yyyy') : '',
    },
  });

  const currentRole = form.watch('role');

  const handleAddDays = (days: number) => {
    const currentEndStr = form.getValues('subscriptionEndDate');
    let baseDate = new Date();
    if (currentEndStr && currentEndStr.length === 10) {
      const [day, month, year] = currentEndStr.split('/');
      const parsed = new Date(parseInt(year, 10), parseInt(month, 10) - 1, parseInt(day, 10));
      if (!isNaN(parsed.getTime()) && isAfter(parsed, new Date())) {
        baseDate = parsed;
      }
    }
    const newDate = addDays(baseDate, days);
    form.setValue('subscriptionEndDate', format(newDate, 'dd/MM/yyyy'));
  };

  const handleSetLifetime = () => {
    form.setValue('subscriptionEndDate', '');
  };

  const handleSelectAllPermissions = (enable: boolean) => {
    allPermissionKeys.forEach((key) => {
      form.setValue(`permissions.${key}` as any, enable);
    });
  };

  const onSubmit = (data: UserFormData) => {
    if (!firestore) return;

    const userDocRef = doc(firestore, 'users', user.id);
    const finalRole = data.role;
    const finalPermissions = finalRole === 'Admin'
      ? allPermissionKeys.reduce((acc, k) => ({ ...acc, [k]: true }), {})
      : data.permissions;

    const dataToUpdate: any = {
      role: finalRole,
      status: data.status,
      permissions: finalPermissions,
      subscriptionPlan: data.subscriptionPlan === 'none' ? null : data.subscriptionPlan,
    };

    if (data.subscriptionEndDate && data.subscriptionEndDate.length === 10) {
      const [day, month, year] = data.subscriptionEndDate.split('/');
      const date = new Date(parseInt(year, 10), parseInt(month, 10) - 1, parseInt(day, 10));
      if (!isNaN(date.getTime())) {
        date.setHours(23, 59, 59);
        dataToUpdate.subscriptionEndDate = Timestamp.fromDate(date);
      }
    } else if (data.subscriptionEndDate === '') {
      dataToUpdate.subscriptionEndDate = null;
    }

    setDocumentNonBlocking(userDocRef, dataToUpdate, { merge: true });

    toast({
      title: "Usuário Atualizado!",
      description: `As alterações para ${user.firstName} foram salvas com sucesso.`
    });
    onFinished();
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <DialogHeader className="pb-2 border-b">
          <div className="flex items-center gap-3">
            <Image
              src={user.avatarUrl || `https://picsum.photos/seed/${user.id}/40/40`}
              alt={user.firstName || 'User'}
              width={42}
              height={42}
              className="rounded-full border border-border bg-muted object-cover"
            />
            <div>
              <DialogTitle className="text-lg font-bold flex items-center gap-2">
                {user.firstName} {user.lastName}
                {user.role === 'Admin' && <Badge variant="destructive" className="text-[10px] h-4 px-1.5">ADMIN</Badge>}
              </DialogTitle>
              <DialogDescription className="text-xs font-mono">
                {user.email} &bull; ID: {user.id.slice(0, 8)}...
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={(val: any) => setActiveTab(val)} className="w-full">
          <TabsList className="grid grid-cols-3 w-full h-9">
            <TabsTrigger value="profile" className="text-xs font-medium">Plano & Validade</TabsTrigger>
            <TabsTrigger value="permissions" className="text-xs font-medium">Permissões de Menus</TabsTrigger>
            <TabsTrigger value="diagnostics" className="text-xs font-medium">Diagnóstico & Instância</TabsTrigger>
          </TabsList>

          {/* ABA 1: PLANO E VALIDADE */}
          <TabsContent value="profile" className="space-y-4 pt-2">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <FormField
                control={form.control}
                name="role"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs font-semibold">Cargo de Acesso</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value} disabled={user.id === currentUser?.uid}>
                      <FormControl>
                        <SelectTrigger className="h-9 text-xs">
                          <SelectValue placeholder="Selecione o cargo" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="User">Usuário Comum</SelectItem>
                        <SelectItem value="Admin">Administrador (Total)</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="subscriptionPlan"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs font-semibold">Plano Ativo</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger className="h-9 text-xs">
                          <SelectValue placeholder="Plano" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="none">Sem Plano</SelectItem>
                        <SelectItem value="basic">Plano Basic</SelectItem>
                        <SelectItem value="pro">Plano Pro</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="status"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs font-semibold">Status da Conta</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value} disabled={user.id === currentUser?.uid}>
                      <FormControl>
                        <SelectTrigger className="h-9 text-xs">
                          <SelectValue placeholder="Status" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="active">Ativo (Liberado)</SelectItem>
                        <SelectItem value="blocked">Bloqueado (Suspenso)</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* Validade da Assinatura */}
            <div className="space-y-2.5 p-3.5 rounded-lg border bg-muted/20">
              <FormField
                control={form.control}
                name="subscriptionEndDate"
                render={({ field }) => (
                  <FormItem>
                    <div className="flex items-center justify-between">
                      <FormLabel className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                        <Calendar className="h-3.5 w-3.5 text-primary" />
                        Data de Término da Assinatura
                      </FormLabel>
                      <span className="text-[10px] text-muted-foreground font-mono">DD/MM/AAAA</span>
                    </div>
                    <FormControl>
                      <Input
                        placeholder="DD/MM/AAAA (Deixe vazio para Vitalício)"
                        {...field}
                        value={field.value || ''}
                        onChange={(e) => {
                          let val = e.target.value.replace(/\D/g, '');
                          if (val.length > 8) val = val.slice(0, 8);
                          let formatted = val;
                          if (val.length > 2) formatted = `${val.slice(0, 2)}/${val.slice(2)}`;
                          if (val.length > 4) formatted = `${val.slice(0, 2)}/${val.slice(2, 4)}/${val.slice(4)}`;
                          field.onChange(formatted);
                        }}
                        className="h-9 font-mono text-xs bg-background"
                      />
                    </FormControl>
                    <div className="flex flex-wrap items-center gap-1.5 pt-1">
                      <span className="text-[10px] text-muted-foreground mr-1">Atalhos:</span>
                      <Button type="button" variant="outline" size="sm" className="h-6 text-[10px] px-2" onClick={() => handleAddDays(3)}>
                        +3 dias
                      </Button>
                      <Button type="button" variant="outline" size="sm" className="h-6 text-[10px] px-2" onClick={() => handleAddDays(7)}>
                        +7 dias
                      </Button>
                      <Button type="button" variant="outline" size="sm" className="h-6 text-[10px] px-2" onClick={() => handleAddDays(15)}>
                        +15 dias
                      </Button>
                      <Button type="button" variant="outline" size="sm" className="h-6 text-[10px] px-2" onClick={() => handleAddDays(30)}>
                        +30 dias
                      </Button>
                      <Button type="button" variant="outline" size="sm" className="h-6 text-[10px] px-2" onClick={() => handleAddDays(365)}>
                        +1 ano
                      </Button>
                      <Button type="button" variant="ghost" size="sm" className="h-6 text-[10px] px-2 text-muted-foreground" onClick={handleSetLifetime}>
                        Vitalício
                      </Button>
                    </div>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          </TabsContent>

          {/* ABA 2: PERMISSÕES DE MENUS */}
          <TabsContent value="permissions" className="space-y-3 pt-2">
            <div className="flex items-center justify-between pb-1">
              <p className="text-xs text-muted-foreground">
                Selecione os menus e funcionalidades que este usuário pode acessar.
              </p>
              {currentRole !== 'Admin' && (
                <div className="flex gap-1.5">
                  <Button type="button" variant="ghost" size="sm" className="h-6 text-[10px] px-2" onClick={() => handleSelectAllPermissions(true)}>
                    Marcar Todos
                  </Button>
                  <Button type="button" variant="ghost" size="sm" className="h-6 text-[10px] px-2 text-muted-foreground" onClick={() => handleSelectAllPermissions(false)}>
                    Desmarcar Todos
                  </Button>
                </div>
              )}
            </div>

            {currentRole === 'Admin' && (
              <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-700 dark:text-amber-400 text-xs flex items-center gap-2">
                <Crown className="h-4 w-4 shrink-0" />
                <span>Usuários com cargo <strong>Administrador</strong> possuem acesso irrestrito a todos os módulos da plataforma.</span>
              </div>
            )}

            <div className="space-y-4 max-h-[280px] overflow-y-auto pr-1">
              {categorizedPermissions.map((cat) => (
                <div key={cat.category} className="space-y-1.5">
                  <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider block">
                    {cat.category}
                  </span>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                    {cat.items.map(({ key, label, desc }) => (
                      <FormField
                        key={key}
                        control={form.control}
                        name={`permissions.${key}` as any}
                        render={({ field }) => (
                          <FormItem className="flex flex-row items-center justify-between space-y-0 p-2 rounded-lg border bg-card hover:bg-muted/40 transition-colors">
                            <div className="flex flex-col min-w-0 pr-2">
                              <FormLabel className="font-medium cursor-pointer text-xs leading-tight">{label}</FormLabel>
                              <span className="text-[10px] text-muted-foreground truncate">{desc}</span>
                            </div>
                            <FormControl>
                              <Checkbox
                                checked={currentRole === 'Admin' ? true : field.value}
                                onCheckedChange={field.onChange}
                                disabled={currentRole === 'Admin'}
                              />
                            </FormControl>
                          </FormItem>
                        )}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </TabsContent>

          {/* ABA 3: DIAGNÓSTICO & INSTÂNCIA */}
          <TabsContent value="diagnostics" className="space-y-3 pt-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="p-3 rounded-lg border bg-muted/20 space-y-1">
                <span className="text-[10px] uppercase font-bold text-muted-foreground">Clientes Cadastrados</span>
                <div className="pt-1">
                  <UserClientCount userId={user.id} />
                </div>
              </div>

              <div className="p-3 rounded-lg border bg-muted/20 space-y-1">
                <span className="text-[10px] uppercase font-bold text-muted-foreground">Status do WhatsApp</span>
                <div className="pt-1">
                  <UserWebhookStatus userId={user.id} />
                </div>
              </div>

              <div className="p-3 rounded-lg border bg-muted/20 space-y-1">
                <span className="text-[10px] uppercase font-bold text-muted-foreground">Data de Cadastro</span>
                <p className="font-mono text-xs font-semibold text-foreground">
                  {user.createdAt ? format(user.createdAt.toDate(), 'dd/MM/yyyy HH:mm') : 'Não registrado'}
                </p>
              </div>

              <div className="p-3 rounded-lg border bg-muted/20 space-y-1">
                <span className="text-[10px] uppercase font-bold text-muted-foreground">ID do Usuário (UID)</span>
                <p className="font-mono text-[11px] text-muted-foreground truncate" title={user.id}>
                  {user.id}
                </p>
              </div>
            </div>
          </TabsContent>
        </Tabs>

        <DialogFooter className="pt-3 border-t">
          <Button type="button" variant="ghost" onClick={onFinished}>
            Cancelar
          </Button>
          <Button type="submit" className="gap-1.5 bg-primary">
            <Check className="h-4 w-4" />
            Salvar Alterações
          </Button>
        </DialogFooter>
      </form>
    </Form>
  );
}

const PAGE_SIZE_USERS = 30;

export default function UsersPage() {
  const { firestore, user: currentUser, userProfile } = useFirebase();
  const [editingUser, setEditingUser] = useState<UserProfile | null>(null);
  const { toast } = useToast();

  const [users, setUsers] = useState<UserProfile[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeFilterTab, setActiveFilterTab] = useState<'all' | 'active' | 'expired' | 'blocked' | 'admin'>('all');
  const [planFilter, setPlanFilter] = useState<'all' | 'pro' | 'basic' | 'none'>('all');
  const [sortBy, setSortBy] = useState<'name' | 'recent' | 'expiration'>('name');

  const [pagination, setPagination] = useState<{
    first: QueryDocumentSnapshot | null;
    last: QueryDocumentSnapshot | null;
  }>({ first: null, last: null });
  const [hasPrevPage, setHasPrevPage] = useState(false);
  const [hasNextPage, setHasNextPage] = useState(false);

  const fetchUsers = useCallback(async (dir: 'next' | 'prev' | 'initial') => {
    setIsLoading(true);
    if (!firestore) {
      setIsLoading(false);
      return;
    }
    const usersRef = collection(firestore, 'users');
    let q;

    if (dir === 'next' && pagination.last) {
      q = query(usersRef, orderBy('firstName'), startAfter(pagination.last), limit(PAGE_SIZE_USERS));
    } else if (dir === 'prev' && pagination.first) {
      q = query(usersRef, orderBy('firstName'), endBefore(pagination.first), limitToLast(PAGE_SIZE_USERS));
    } else {
      q = query(usersRef, orderBy('firstName'), limit(PAGE_SIZE_USERS));
    }

    try {
      const querySnapshot = await getDocs(q);
      const fetchedUsers = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as UserProfile));

      if (fetchedUsers.length === 0) {
        if (dir === 'next') setHasNextPage(false);
        if (dir === 'prev') setHasPrevPage(false);
        if (dir === 'initial') setUsers([]);
        setIsLoading(false);
        return;
      }

      setUsers(fetchedUsers);
      const first = querySnapshot.docs[0];
      const last = querySnapshot.docs[querySnapshot.docs.length - 1];
      setPagination({ first, last });

      const prevCheck = query(usersRef, orderBy('firstName'), endBefore(first), limitToLast(1));
      const prevSnap = await getDocs(prevCheck);
      setHasPrevPage(!prevSnap.empty);

      const nextCheck = query(usersRef, orderBy('firstName'), startAfter(last), limit(1));
      const nextSnap = await getDocs(nextCheck);
      setHasNextPage(!nextSnap.empty);

    } catch (error) {
      console.error("Error fetching users:", error);
      toast({
        variant: "destructive",
        title: "Erro ao listar usuários",
        description: "Falha ao carregar a lista do banco de dados."
      });
    } finally {
      setIsLoading(false);
    }
  }, [firestore, pagination.first, pagination.last, toast]);

  useEffect(() => {
    fetchUsers('initial');
  }, [firestore]);

  const handleEditFinished = () => {
    setEditingUser(null);
    fetchUsers('initial');
  };

  const handleGrantDays = (userToGrant: UserProfile, days: number = 3) => {
    if (!firestore) return;

    let baseDate = new Date();
    if (userToGrant.subscriptionEndDate) {
      const existingDate = userToGrant.subscriptionEndDate.toDate();
      if (isAfter(existingDate, new Date())) {
        baseDate = existingDate;
      }
    }

    const newEndDate = addDays(baseDate, days);
    const userDocRef = doc(firestore, "users", userToGrant.id);

    const dataToUpdate: Partial<UserProfile> = {
      subscriptionEndDate: Timestamp.fromDate(newEndDate),
      status: 'active'
    };

    if (!userToGrant.subscriptionPlan) {
      dataToUpdate.subscriptionPlan = 'basic';
    }

    setDocumentNonBlocking(userDocRef, dataToUpdate, { merge: true });

    toast({
      title: "Validade Estendida!",
      description: `${userToGrant.firstName} recebeu +${days} dias de acesso ao CRM.`
    });

    setUsers(prev => prev.map(u => u.id === userToGrant.id ? { ...u, ...dataToUpdate } : u));
  };

  const handleSetLifetime = (userToSet: UserProfile) => {
    if (!firestore) return;

    const userDocRef = doc(firestore, "users", userToSet.id);
    const dataToUpdate: any = {
      subscriptionEndDate: null,
      status: 'active'
    };

    setDocumentNonBlocking(userDocRef, dataToUpdate, { merge: true });

    toast({
      title: "Acesso Vitalício!",
      description: `${userToSet.firstName} agora possui acesso permanente ao CRM.`
    });

    setUsers(prev => prev.map(u => u.id === userToSet.id ? { ...u, ...dataToUpdate } : u));
  };

  const handleToggleBlockUser = async (userToToggle: UserProfile) => {
    if (!firestore || !currentUser) return;

    if (userToToggle.id === currentUser?.uid) {
      toast({
        variant: "destructive",
        title: "Ação não permitida",
        description: "Você não pode bloquear o seu próprio usuário administrador.",
      });
      return;
    }

    const newStatus = userToToggle.status === 'blocked' ? 'active' : 'blocked';
    const userDocRef = doc(firestore, "users", userToToggle.id);

    try {
      await setDocumentNonBlocking(userDocRef, { status: newStatus }, { merge: true });

      toast({
        title: newStatus === 'blocked' ? 'Usuário Bloqueado' : 'Usuário Desbloqueado',
        description: `O acesso de ${userToToggle.firstName} foi ${newStatus === 'blocked' ? 'suspenso' : 'liberado'}.`,
      });

      setUsers(prev => prev.map(u => u.id === userToToggle.id ? { ...u, status: newStatus } : u));
    } catch (error) {
      console.error("Error toggling block status:", error);
      toast({
        variant: "destructive",
        title: "Erro",
        description: "Ocorreu um erro ao alterar o status do usuário.",
      });
    }
  };

  const handleDeleteUser = async (userToDelete: UserProfile) => {
    if (!firestore || !currentUser) return;

    if (userToDelete.id === currentUser?.uid) {
      toast({
        variant: "destructive",
        title: "Ação não permitida",
        description: "Você não pode excluir a sua própria conta de administrador.",
      });
      return;
    }

    try {
      const userDocRef = doc(firestore, "users", userToDelete.id);
      await deleteDoc(userDocRef);

      toast({
        title: "Usuário Excluído com Sucesso",
        description: `A conta de ${userToDelete.firstName} foi removida da plataforma.`,
      });

      fetchUsers('initial');
    } catch (e: any) {
      toast({
        variant: "destructive",
        title: "Erro ao Excluir",
        description: "Não foi possível remover o usuário.",
      });
    }
  };

  // Exportar lista para CSV
  const handleExportCSV = () => {
    if (users.length === 0) {
      toast({ title: "Nenhum dado para exportar" });
      return;
    }

    const headers = ["ID", "Nome", "Sobrenome", "Email", "Cargo", "Plano", "Status", "Vencimento", "Data Cadastro"];
    const rows = users.map(u => [
      u.id,
      `"${(u.firstName || '').replace(/"/g, '""')}"`,
      `"${(u.lastName || '').replace(/"/g, '""')}"`,
      `"${(u.email || '').replace(/"/g, '""')}"`,
      u.role,
      u.subscriptionPlan || 'Nenhum',
      u.status === 'blocked' ? 'Bloqueado' : 'Ativo',
      u.subscriptionEndDate ? format(u.subscriptionEndDate.toDate(), 'yyyy-MM-dd') : 'Vitalício',
      u.createdAt ? format(u.createdAt.toDate(), 'yyyy-MM-dd HH:mm') : ''
    ]);

    const csvContent = "data:text/csv;charset=utf-8,\uFEFF" + [headers.join(","), ...rows.map(e => e.join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `usuarios_crm_${format(new Date(), 'yyyy-MM-dd')}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    toast({
      title: "Planilha Exportada!",
      description: "O download do arquivo CSV com todos os usuários foi iniciado."
    });
  };

  // Estatísticas globais da lista
  const stats = useMemo(() => {
    const total = users.length;
    const active = users.filter(u => u.status !== 'blocked').length;
    const blocked = users.filter(u => u.status === 'blocked').length;
    const expired = users.filter(u => u.subscriptionEndDate && u.subscriptionEndDate.toDate() < new Date()).length;
    const pro = users.filter(u => u.subscriptionPlan === 'pro').length;
    const basic = users.filter(u => u.subscriptionPlan === 'basic').length;
    const admins = users.filter(u => u.role === 'Admin').length;
    return { total, active, blocked, expired, pro, basic, admins };
  }, [users]);

  // Filtragem e Ordenação dos usuários
  const filteredUsers = useMemo(() => {
    return users.filter(u => {
      const name = `${u.firstName || ''} ${u.lastName || ''}`.toLowerCase();
      const email = (u.email || '').toLowerCase();
      const id = (u.id || '').toLowerCase();
      const queryStr = searchTerm.toLowerCase().trim();

      const matchesSearch = !queryStr || name.includes(queryStr) || email.includes(queryStr) || id.includes(queryStr);
      if (!matchesSearch) return false;

      // Filtro por Tab
      if (activeFilterTab === 'active' && u.status === 'blocked') return false;
      if (activeFilterTab === 'blocked' && u.status !== 'blocked') return false;
      if (activeFilterTab === 'admin' && u.role !== 'Admin') return false;
      if (activeFilterTab === 'expired') {
        if (!u.subscriptionEndDate) return false;
        if (u.subscriptionEndDate.toDate() >= new Date()) return false;
      }

      // Filtro por Plano
      if (planFilter !== 'all') {
        if (planFilter === 'none' && u.subscriptionPlan) return false;
        if (planFilter !== 'none' && u.subscriptionPlan !== planFilter) return false;
      }

      return true;
    }).sort((a, b) => {
      if (sortBy === 'name') {
        return (a.firstName || '').localeCompare(b.firstName || '');
      }
      if (sortBy === 'recent') {
        const timeA = a.createdAt ? a.createdAt.toDate().getTime() : 0;
        const timeB = b.createdAt ? b.createdAt.toDate().getTime() : 0;
        return timeB - timeA;
      }
      if (sortBy === 'expiration') {
        const expA = a.subscriptionEndDate ? a.subscriptionEndDate.toDate().getTime() : 9999999999999;
        const expB = b.subscriptionEndDate ? b.subscriptionEndDate.toDate().getTime() : 9999999999999;
        return expA - expB;
      }
      return 0;
    });
  }, [users, searchTerm, activeFilterTab, planFilter, sortBy]);

  return (
    <div className="flex flex-col h-full space-y-6 p-4 md:p-8 max-w-7xl mx-auto w-full">
      {/* Header com estilo elegante */}
      <PageHeader
        title="Gerenciamento de Usuários"
        description="Controle central de contas, permissões, assinaturas e instâncias dos usuários do CRM."
      >
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleExportCSV} disabled={isLoading || users.length === 0} className="gap-1.5 text-xs h-8">
            <Download className="h-3.5 w-3.5 text-muted-foreground" />
            Exportar CSV
          </Button>
          <Button variant="outline" size="sm" onClick={() => fetchUsers('initial')} disabled={isLoading} className="gap-1.5 text-xs h-8">
            <RefreshCw className={cn("h-3.5 w-3.5", isLoading && "animate-spin")} />
            Atualizar
          </Button>
          <div className="flex items-center border rounded-md p-0.5 bg-muted/40">
            <Button variant="ghost" size="icon" onClick={() => fetchUsers('prev')} disabled={!hasPrevPage || isLoading} className="h-7 w-7">
              <ChevronLeft className="h-3.5 w-3.5" />
            </Button>
            <Button variant="ghost" size="icon" onClick={() => fetchUsers('next')} disabled={!hasNextPage || isLoading} className="h-7 w-7">
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </PageHeader>

      {/* Cards de Métricas e Indicadores no Topo */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3.5">
        <Card className="shadow-sm border-border bg-card/60 backdrop-blur-sm">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-[11px] text-muted-foreground font-semibold uppercase tracking-wider">Total de Usuários</p>
              <h3 className="text-2xl font-bold mt-1 text-foreground">{stats.total}</h3>
            </div>
            <div className="p-2.5 rounded-xl bg-primary/10 text-primary">
              <Users className="h-5 w-5" />
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-sm border-border bg-card/60 backdrop-blur-sm">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-[11px] text-muted-foreground font-semibold uppercase tracking-wider">Usuários Ativos</p>
              <h3 className="text-2xl font-bold mt-1 text-emerald-600 dark:text-emerald-400">{stats.active}</h3>
            </div>
            <div className="p-2.5 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
              <UserCheck className="h-5 w-5" />
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-sm border-border bg-card/60 backdrop-blur-sm">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-[11px] text-muted-foreground font-semibold uppercase tracking-wider">Planos Assinados</p>
              <h3 className="text-2xl font-bold mt-1 text-purple-600 dark:text-purple-400">
                {stats.pro + stats.basic} <span className="text-xs font-normal text-muted-foreground">({stats.pro} Pro / {stats.basic} Basic)</span>
              </h3>
            </div>
            <div className="p-2.5 rounded-xl bg-purple-500/10 text-purple-600 dark:text-purple-400">
              <Crown className="h-5 w-5" />
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-sm border-border bg-card/60 backdrop-blur-sm">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-[11px] text-muted-foreground font-semibold uppercase tracking-wider">Vencidos / Trial</p>
              <h3 className="text-2xl font-bold mt-1 text-amber-600 dark:text-amber-400">{stats.expired}</h3>
            </div>
            <div className="p-2.5 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400">
              <Clock className="h-5 w-5" />
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-sm border-border bg-card/60 backdrop-blur-sm col-span-2 lg:col-span-1">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-[11px] text-muted-foreground font-semibold uppercase tracking-wider">Bloqueados</p>
              <h3 className="text-2xl font-bold mt-1 text-rose-600 dark:text-rose-400">{stats.blocked}</h3>
            </div>
            <div className="p-2.5 rounded-xl bg-rose-500/10 text-rose-600 dark:text-rose-400">
              <UserX className="h-5 w-5" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Painel Principal com Tabela e Filtros */}
      <Card className="shadow-sm border-border">
        <CardHeader className="p-4 pb-3 space-y-3">
          {/* Tabs de Filtro Rápido */}
          <div className="flex flex-col lg:flex-row gap-3 items-stretch lg:items-center justify-between border-b pb-3">
            <div className="flex flex-wrap items-center gap-1.5">
              <Button
                variant={activeFilterTab === 'all' ? 'secondary' : 'ghost'}
                size="sm"
                onClick={() => setActiveFilterTab('all')}
                className="h-8 text-xs font-semibold gap-1.5"
              >
                Todos
                <Badge variant="outline" className="text-[10px] h-4 px-1">{stats.total}</Badge>
              </Button>

              <Button
                variant={activeFilterTab === 'active' ? 'secondary' : 'ghost'}
                size="sm"
                onClick={() => setActiveFilterTab('active')}
                className="h-8 text-xs font-semibold gap-1.5 text-emerald-700 dark:text-emerald-400"
              >
                Ativos
                <Badge variant="outline" className="text-[10px] h-4 px-1 border-emerald-500/30 text-emerald-600">{stats.active}</Badge>
              </Button>

              <Button
                variant={activeFilterTab === 'expired' ? 'secondary' : 'ghost'}
                size="sm"
                onClick={() => setActiveFilterTab('expired')}
                className="h-8 text-xs font-semibold gap-1.5 text-amber-700 dark:text-amber-400"
              >
                Vencidos
                <Badge variant="outline" className="text-[10px] h-4 px-1 border-amber-500/30 text-amber-600">{stats.expired}</Badge>
              </Button>

              <Button
                variant={activeFilterTab === 'blocked' ? 'secondary' : 'ghost'}
                size="sm"
                onClick={() => setActiveFilterTab('blocked')}
                className="h-8 text-xs font-semibold gap-1.5 text-rose-700 dark:text-rose-400"
              >
                Bloqueados
                <Badge variant="outline" className="text-[10px] h-4 px-1 border-rose-500/30 text-rose-600">{stats.blocked}</Badge>
              </Button>

              <Button
                variant={activeFilterTab === 'admin' ? 'secondary' : 'ghost'}
                size="sm"
                onClick={() => setActiveFilterTab('admin')}
                className="h-8 text-xs font-semibold gap-1.5 text-primary"
              >
                Admins
                <Badge variant="outline" className="text-[10px] h-4 px-1 border-primary/30 text-primary">{stats.admins}</Badge>
              </Button>
            </div>

            {/* Ordenação */}
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground hidden sm:inline">Ordenar por:</span>
              <Select value={sortBy} onValueChange={(val: any) => setSortBy(val)}>
                <SelectTrigger className="h-8 w-[140px] text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="name">Nome (A-Z)</SelectItem>
                  <SelectItem value="recent">Mais Recentes</SelectItem>
                  <SelectItem value="expiration">Vencimento</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Busca e Filtro de Plano */}
          <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Pesquisar por nome, e-mail ou UID..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9 h-9 text-xs bg-background"
              />
            </div>

            <div className="flex items-center gap-2">
              <Select value={planFilter} onValueChange={(val: any) => setPlanFilter(val)}>
                <SelectTrigger className="h-9 w-[150px] text-xs">
                  <SelectValue placeholder="Filtrar por Plano" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os Planos</SelectItem>
                  <SelectItem value="pro">Plano Pro</SelectItem>
                  <SelectItem value="basic">Plano Basic</SelectItem>
                  <SelectItem value="none">Sem Plano</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40 hover:bg-muted/40 border-b">
                <TableHead className="w-[300px]">Usuário</TableHead>
                <TableHead>Plano & Cadastro</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Clientes CRM</TableHead>
                <TableHead>Vencimento do Acesso</TableHead>
                <TableHead className="text-right pr-6">Ações Administrativas</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-16 text-muted-foreground">
                    <RefreshCw className="h-7 w-7 animate-spin mx-auto mb-3 text-primary opacity-60" />
                    <p className="text-sm font-medium">Carregando usuários do sistema...</p>
                  </TableCell>
                </TableRow>
              )}

              {!isLoading && filteredUsers.map((user) => {
                const isCurrentUser = user.id === currentUser?.uid;
                const isBlocked = user.status === 'blocked';
                const isExpired = user.subscriptionEndDate && user.subscriptionEndDate.toDate() < new Date();

                return (
                  <TableRow key={user.id} className={cn("hover:bg-muted/30 transition-colors border-b", isBlocked && "opacity-60 bg-muted/10")}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <div className="relative shrink-0">
                          <Image
                            src={user.avatarUrl || `https://picsum.photos/seed/${user.id}/40/40`}
                            alt={user.firstName || 'User'}
                            width={40}
                            height={40}
                            className="rounded-full border border-border object-cover bg-muted"
                          />
                          <span className={cn(
                            "absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-background",
                            isBlocked ? "bg-rose-500" : (isExpired ? "bg-amber-500" : "bg-emerald-500")
                          )} />
                        </div>
                        <div className="flex flex-col min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="font-semibold text-xs text-foreground truncate max-w-[160px]">
                              {user.firstName} {user.lastName}
                            </span>
                            {isCurrentUser && (
                              <Badge variant="outline" className="text-[9px] px-1.5 py-0 h-4 border-primary/40 text-primary bg-primary/5 font-bold">
                                VOCÊ
                              </Badge>
                            )}
                            {user.role === 'Admin' && (
                              <Badge variant="destructive" className="text-[9px] px-1.5 py-0 h-4 bg-rose-600 font-bold">
                                ADMIN
                              </Badge>
                            )}
                          </div>
                          <div className="flex items-center gap-1 text-[11px] text-muted-foreground font-mono mt-0.5">
                            <span className="truncate max-w-[170px]" title={user.email}>{user.email}</span>
                            <button
                              type="button"
                              onClick={() => {
                                navigator.clipboard.writeText(user.email);
                                toast({ title: "Email copiado!", description: user.email });
                              }}
                              className="opacity-50 hover:opacity-100 transition-opacity"
                              title="Copiar email"
                            >
                              <Copy className="h-3 w-3" />
                            </button>
                          </div>
                        </div>
                      </div>
                    </TableCell>

                    <TableCell>
                      <div className="flex flex-col gap-1">
                        <Badge variant="outline" className={cn(
                          "w-fit text-[10px] uppercase font-bold px-2 py-0.5",
                          user.subscriptionPlan === 'pro' && "border-purple-500/40 text-purple-600 dark:text-purple-400 bg-purple-500/10",
                          user.subscriptionPlan === 'basic' && "border-blue-500/40 text-blue-600 dark:text-blue-400 bg-blue-500/10",
                          !user.subscriptionPlan && "border-border text-muted-foreground bg-muted/30"
                        )}>
                          {user.subscriptionPlan ? `Plano ${user.subscriptionPlan}` : (user.role === 'Admin' ? 'Acesso Total' : 'Sem Plano')}
                        </Badge>
                        {user.createdAt && (
                          <span className="text-[10px] text-muted-foreground">
                            Cadastrado em {format(user.createdAt.toDate(), 'dd/MM/yyyy')}
                          </span>
                        )}
                      </div>
                    </TableCell>

                    <TableCell>
                      {isBlocked ? (
                        <Badge variant="outline" className="border-rose-500/40 text-rose-600 dark:text-rose-400 bg-rose-500/10 text-[10px] font-semibold gap-1">
                          <Lock className="h-3 w-3" /> Bloqueado
                        </Badge>
                      ) : isExpired ? (
                        <Badge variant="outline" className="border-amber-500/40 text-amber-600 dark:text-amber-400 bg-amber-500/10 text-[10px] font-semibold gap-1">
                          <Clock className="h-3 w-3" /> Vencido
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="border-emerald-500/40 text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 text-[10px] font-semibold gap-1">
                          <CheckCircle2 className="h-3 w-3" /> Ativo
                        </Badge>
                      )}
                    </TableCell>

                    <TableCell>
                      <UserClientCount userId={user.id} />
                    </TableCell>

                    <TableCell>
                      <SubscriptionCell endDate={user.subscriptionEndDate} />
                    </TableCell>

                    <TableCell className="text-right pr-6">
                      <div className="flex items-center justify-end gap-1.5">
                        {/* Botão rápido +3 dias */}
                        <Button 
                          variant="outline" 
                          size="sm" 
                          onClick={() => handleGrantDays(user, 3)} 
                          className="h-8 px-2 text-xs gap-1 border-border hover:border-emerald-500 hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/20"
                          title="Dar +3 dias de acesso grátis"
                        >
                          <Gift className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                          <span className="hidden sm:inline font-medium">+3 dias</span>
                        </Button>

                        {/* Botão de Gestão Completa */}
                        <Button 
                          variant="outline" 
                          size="sm" 
                          onClick={() => setEditingUser(user)}
                          className="h-8 px-2.5 text-xs gap-1.5 font-medium border-border hover:border-primary hover:text-primary"
                          title="Abrir painel de gestão deste usuário"
                        >
                          <Edit3 className="h-3.5 w-3.5 text-primary" />
                          <span>Gerenciar</span>
                        </Button>

                        {/* Botão Bloquear / Desbloquear */}
                        <Button
                          variant={isBlocked ? 'secondary' : 'ghost'}
                          size="icon"
                          className={cn("h-8 w-8", isBlocked && "text-rose-600 hover:text-rose-700 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900")}
                          onClick={() => handleToggleBlockUser(user)}
                          disabled={isCurrentUser}
                          title={isBlocked ? "Desbloquear Usuário" : "Bloquear Usuário"}
                        >
                          {isBlocked ? <Unlock className="h-4 w-4" /> : <Lock className="h-4 w-4 text-muted-foreground" />}
                        </Button>

                        {/* Menu de Mais Ações */}
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground">
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-52">
                            <DropdownMenuLabel className="text-xs">Estender Validade</DropdownMenuLabel>
                            <DropdownMenuItem onClick={() => handleGrantDays(user, 7)} className="text-xs">
                              <PlusCircle className="mr-2 h-3.5 w-3.5 text-emerald-600" /> +7 Dias de Acesso
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleGrantDays(user, 15)} className="text-xs">
                              <PlusCircle className="mr-2 h-3.5 w-3.5 text-emerald-600" /> +15 Dias de Acesso
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleGrantDays(user, 30)} className="text-xs">
                              <PlusCircle className="mr-2 h-3.5 w-3.5 text-emerald-600" /> +30 Dias de Acesso
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleSetLifetime(user)} className="text-xs">
                              <Crown className="mr-2 h-3.5 w-3.5 text-amber-500" /> Tornar Vitalício
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem 
                              onClick={() => {
                                navigator.clipboard.writeText(user.id);
                                toast({ title: "UID copiado!", description: user.id });
                              }} 
                              className="text-xs"
                            >
                              <Copy className="mr-2 h-3.5 w-3.5" /> Copiar UID do Firebase
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <div className="flex items-center px-2 py-1.5 text-xs text-destructive hover:bg-destructive/10 rounded-sm cursor-pointer w-full">
                                  <Trash2 className="mr-2 h-3.5 w-3.5" /> Excluir Conta Permanentemente
                                </div>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>Excluir Usuário Permanentemente?</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    Esta ação excluirá o perfil de <strong>{user.firstName} {user.lastName}</strong> ({user.email}). Todos os dados associados a esta conta serão removidos. Essa ação não pode ser desfeita.
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                  <AlertDialogAction
                                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                    onClick={() => handleDeleteUser(user)}
                                  >
                                    Sim, Excluir Usuário
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}

              {!isLoading && filteredUsers.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-14 text-muted-foreground">
                    <Users className="h-9 w-9 mx-auto mb-2 opacity-30" />
                    <p className="font-semibold text-sm">Nenhum usuário encontrado</p>
                    <p className="text-xs mt-0.5">Tente ajustar seus termos de pesquisa ou filtros selecionados.</p>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Modal de Gestão Completo 360 */}
      <Dialog open={!!editingUser} onOpenChange={(open) => !open && setEditingUser(null)}>
        <DialogContent className="sm:max-w-xl">
          {editingUser && <UserEditModal user={editingUser} onFinished={handleEditFinished} />}
        </DialogContent>
      </Dialog>
    </div>
  );
}
