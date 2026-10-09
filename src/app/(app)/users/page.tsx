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
  ChevronRight
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
import { useFirebase, useUser, setDocumentNonBlocking, useCollection, useMemoFirebase } from '@/firebase';
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
import type { UserProfile, UserPermissions } from '@/lib/types';
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

const permissionLabels: { key: keyof UserPermissions; label: string }[] = [
  { key: 'dashboard', label: 'Início (Dash)' },
  { key: 'customers', label: 'Clientes & Leads' },
  { key: 'automations', label: 'Automações & Vencimentos' },
  { key: 'groups', label: 'Grupos & Comunidades' },
  { key: 'shot', label: 'Disparo em Massa' },
  { key: 'zapconnect', label: 'Hub Principal (Zap Conexão)' },
  { key: 'zapVendas', label: 'PDV Vendas' },
  { key: 'pix', label: 'Gerar Pix (Cobrança)' },
  { key: 'dbCleaner', label: 'Limpeza Web (DB Cleaner)' },
  { key: 'notes', label: 'Notas & Tarefas' },
  { key: 'ads', label: 'Relatórios de Anúncios' },
  { key: 'estoque', label: 'Estoque de Contas' },
  { key: 'linksClaro', label: 'Links Claro' },
  { key: 'flows', label: 'Fluxos & Menus' },
  { key: 'settings', label: 'Configurações' },
  { key: 'users', label: 'Gerenciar Usuários (Admin)' },
];

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
  if (days > 0) return `${days}d ${hours}h`;
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

function UserClientCount({ userId }: { userId: string }) {
  const { firestore } = useFirebase();
  const clientsQuery = useMemoFirebase(() => {
    if (!firestore || !userId) return null;
    return collection(firestore, 'users', userId, 'clients');
  }, [firestore, userId]);

  const { data: clients, isLoading } = useCollection(clientsQuery);

  if (isLoading) {
    return <Skeleton className="h-4 w-6" />;
  }

  return (
    <span className="inline-flex items-center gap-1 font-mono text-xs font-semibold px-2 py-0.5 rounded-md bg-muted text-foreground">
      {clients?.length ?? 0}
    </span>
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
    return <Skeleton className="h-4 w-20" />;
  }

  const isExpired = remainingTime === 'Expirado';
  const isLifetime = remainingTime === 'Vitalício';

  return (
    <div className="flex flex-col">
      <div className="flex items-center gap-1.5">
        {isExpired ? (
          <Badge variant="destructive" className="h-5 text-[10px] px-1.5">
            Expirado
          </Badge>
        ) : isLifetime ? (
          <Badge variant="secondary" className="h-5 text-[10px] px-1.5 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20">
            Vitalício
          </Badge>
        ) : (
          <span className="font-mono text-xs font-semibold text-foreground">
            {remainingTime}
          </span>
        )}
      </div>
      {endDate && (
        <span className="text-[11px] text-muted-foreground mt-0.5">
          Até {format(endDate.toDate(), 'dd/MM/yyyy')}
        </span>
      )}
    </div>
  );
}

function UserEditModal({ user, onFinished }: { user: UserProfile; onFinished: () => void }) {
  const { firestore, user: currentUser } = useFirebase();
  const { toast } = useToast();

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

  const onSubmit = (data: UserFormData) => {
    if (!firestore) return;

    const userDocRef = doc(firestore, 'users', user.id);
    const finalRole = data.role;
    const finalPermissions = finalRole === 'Admin'
      ? permissionLabels.reduce((acc, p) => ({ ...acc, [p.key]: true }), {})
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
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg font-bold">
            <Edit3 className="h-5 w-5 text-primary" />
            Editar Usuário: {user.firstName} {user.lastName}
          </DialogTitle>
          <DialogDescription>
            Gerencie o nível de acesso, status da conta, validade e permissões do CRM.
          </DialogDescription>
        </DialogHeader>

        {/* Informações Básicas */}
        <div className="grid grid-cols-2 gap-3 p-3 bg-muted/40 rounded-lg border text-xs">
          <div>
            <span className="text-muted-foreground block text-[10px] uppercase font-semibold">Nome</span>
            <span className="font-semibold text-foreground">{user.firstName} {user.lastName}</span>
          </div>
          <div>
            <span className="text-muted-foreground block text-[10px] uppercase font-semibold">Email</span>
            <span className="font-mono text-foreground truncate block">{user.email}</span>
          </div>
        </div>

        {/* Cargo e Status */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <FormField
            control={form.control}
            name="role"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-xs font-semibold">Cargo / Acesso</FormLabel>
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
                <FormLabel className="text-xs font-semibold">Plano</FormLabel>
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
                    <SelectItem value="blocked">Bloqueado</SelectItem>
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        {/* Validade da Assinatura */}
        <div className="space-y-2 p-3.5 rounded-lg border bg-muted/20">
          <FormField
            control={form.control}
            name="subscriptionEndDate"
            render={({ field }) => (
              <FormItem>
                <div className="flex items-center justify-between">
                  <FormLabel className="flex items-center gap-1.5 text-xs font-semibold">
                    <Calendar className="h-3.5 w-3.5 text-primary" />
                    Data de Vencimento
                  </FormLabel>
                  <span className="text-[10px] text-muted-foreground">Formato: DD/MM/AAAA</span>
                </div>
                <div className="flex gap-2 items-center">
                  <FormControl>
                    <Input
                      placeholder="DD/MM/AAAA (ou vazio para vitalício)"
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
                </div>
                <div className="flex flex-wrap gap-1.5 mt-2">
                  <Button type="button" variant="outline" size="sm" className="h-7 text-[11px] px-2" onClick={() => handleAddDays(3)}>
                    +3 dias
                  </Button>
                  <Button type="button" variant="outline" size="sm" className="h-7 text-[11px] px-2" onClick={() => handleAddDays(7)}>
                    +7 dias
                  </Button>
                  <Button type="button" variant="outline" size="sm" className="h-7 text-[11px] px-2" onClick={() => handleAddDays(30)}>
                    +30 dias
                  </Button>
                  <Button type="button" variant="outline" size="sm" className="h-7 text-[11px] px-2" onClick={() => handleAddDays(365)}>
                    +1 ano
                  </Button>
                  <Button type="button" variant="ghost" size="sm" className="h-7 text-[11px] px-2 text-muted-foreground" onClick={handleSetLifetime}>
                    Vitalício
                  </Button>
                </div>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        {/* Menus e Permissões */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <Label className="text-xs font-semibold flex items-center gap-1.5">
              <Layers className="h-3.5 w-3.5 text-primary" />
              Menus e Recursos Liberados
            </Label>
            {currentRole === 'Admin' && (
              <span className="text-[10px] text-primary font-medium">Admin possui acesso a todos os menus</span>
            )}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 rounded-lg border p-3 max-h-[220px] overflow-y-auto bg-muted/10">
            {permissionLabels.map(({ key, label }) => (
              <FormField
                key={key}
                control={form.control}
                name={`permissions.${key}` as any}
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center justify-between space-y-0 p-2 hover:bg-muted/50 rounded-md border border-transparent hover:border-border transition-colors">
                    <FormLabel className="font-normal cursor-pointer text-xs flex-1 pr-2">{label}</FormLabel>
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

        <DialogFooter className="pt-2">
          <Button type="button" variant="ghost" onClick={onFinished}>
            Cancelar
          </Button>
          <Button type="submit" className="gap-2 bg-primary">
            Salvar Alterações
          </Button>
        </DialogFooter>
      </form>
    </Form>
  );
}

const PAGE_SIZE_USERS = 25;

export default function UsersPage() {
  const { firestore, user: currentUser, userProfile } = useFirebase();
  const [editingUser, setEditingUser] = useState<UserProfile | null>(null);
  const { toast } = useToast();

  const [users, setUsers] = useState<UserProfile[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'blocked' | 'expired'>('all');
  const [roleFilter, setRoleFilter] = useState<'all' | 'Admin' | 'User'>('all');

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
        title: "Erro ao carregar usuários",
        description: "Não foi possível listar os usuários."
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
      title: "Dias Adicionados!",
      description: `${userToGrant.firstName} recebeu +${days} dias de acesso.`
    });

    setUsers(prev => prev.map(u => u.id === userToGrant.id ? { ...u, ...dataToUpdate } : u));
  };

  const handleToggleBlockUser = async (userToToggle: UserProfile) => {
    if (!firestore || !currentUser) return;

    if (userToToggle.id === currentUser?.uid) {
      toast({
        variant: "destructive",
        title: "Ação não permitida",
        description: "Você não pode bloquear a si próprio.",
      });
      return;
    }

    const newStatus = userToToggle.status === 'blocked' ? 'active' : 'blocked';
    const userDocRef = doc(firestore, "users", userToToggle.id);

    try {
      await setDocumentNonBlocking(userDocRef, { status: newStatus }, { merge: true });

      toast({
        title: newStatus === 'blocked' ? 'Usuário Bloqueado' : 'Usuário Desbloqueado',
        description: `O acesso de ${userToToggle.firstName} foi ${newStatus === 'blocked' ? 'bloqueado' : 'liberado'}.`,
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
        description: "Você não pode excluir o administrador logado.",
      });
      return;
    }

    try {
      const userDocRef = doc(firestore, "users", userToDelete.id);
      await deleteDoc(userDocRef);

      toast({
        title: "Usuário Excluído",
        description: `A conta de ${userToDelete.firstName} foi removida do sistema.`,
      });

      fetchUsers('initial');
    } catch (e: any) {
      toast({
        variant: "destructive",
        title: "Erro ao Excluir",
        description: "Não foi possível excluir o usuário.",
      });
    }
  };

  // Filtragem local dos usuários na página atual
  const filteredUsers = useMemo(() => {
    return users.filter(u => {
      const name = `${u.firstName || ''} ${u.lastName || ''}`.toLowerCase();
      const email = (u.email || '').toLowerCase();
      const queryStr = searchTerm.toLowerCase().trim();

      const matchesSearch = !queryStr || name.includes(queryStr) || email.includes(queryStr);
      if (!matchesSearch) return false;

      if (roleFilter !== 'all') {
        if (roleFilter === 'Admin' && u.role !== 'Admin') return false;
        if (roleFilter === 'User' && u.role === 'Admin') return false;
      }

      if (statusFilter !== 'all') {
        if (statusFilter === 'blocked' && u.status !== 'blocked') return false;
        if (statusFilter === 'active' && u.status === 'blocked') return false;
        if (statusFilter === 'expired') {
          if (!u.subscriptionEndDate) return false;
          const isExp = u.subscriptionEndDate.toDate() < new Date();
          if (!isExp) return false;
        }
      }

      return true;
    });
  }, [users, searchTerm, statusFilter, roleFilter]);

  // Estatísticas da página carregada
  const stats = useMemo(() => {
    const total = users.length;
    const active = users.filter(u => u.status !== 'blocked').length;
    const blocked = users.filter(u => u.status === 'blocked').length;
    const expired = users.filter(u => u.subscriptionEndDate && u.subscriptionEndDate.toDate() < new Date()).length;
    return { total, active, blocked, expired };
  }, [users]);

  return (
    <div className="flex flex-col h-full space-y-6 p-4 md:p-8 max-w-7xl mx-auto w-full">
      <PageHeader
        title="Gerenciar Usuários"
        description="Painel administrativo de controle de contas, acessos e assinaturas dos usuários do CRM."
      >
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => fetchUsers('initial')} disabled={isLoading} className="gap-1.5 text-xs">
            <RefreshCw className={cn("h-3.5 w-3.5", isLoading && "animate-spin")} />
            Atualizar
          </Button>
          <Button variant="outline" size="sm" onClick={() => fetchUsers('prev')} disabled={!hasPrevPage || isLoading} className="gap-1 text-xs">
            <ChevronLeft className="h-3.5 w-3.5" />
            Anterior
          </Button>
          <Button variant="outline" size="sm" onClick={() => fetchUsers('next')} disabled={!hasNextPage || isLoading} className="gap-1 text-xs">
            Próximo
            <ChevronRight className="h-3.5 w-3.5" />
          </Button>
        </div>
      </PageHeader>

      {/* Cards de Métricas */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="shadow-sm border-border">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs text-muted-foreground font-medium">Total de Usuários</p>
              <h3 className="text-2xl font-bold mt-1">{stats.total}</h3>
            </div>
            <div className="p-2.5 rounded-full bg-primary/10 text-primary">
              <Users className="h-5 w-5" />
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-sm border-border">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs text-muted-foreground font-medium">Usuários Ativos</p>
              <h3 className="text-2xl font-bold mt-1 text-emerald-600 dark:text-emerald-400">{stats.active}</h3>
            </div>
            <div className="p-2.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
              <UserCheck className="h-5 w-5" />
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-sm border-border">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs text-muted-foreground font-medium">Bloqueados</p>
              <h3 className="text-2xl font-bold mt-1 text-rose-600 dark:text-rose-400">{stats.blocked}</h3>
            </div>
            <div className="p-2.5 rounded-full bg-rose-500/10 text-rose-600 dark:text-rose-400">
              <UserX className="h-5 w-5" />
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-sm border-border">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs text-muted-foreground font-medium">Vencidos / Expirados</p>
              <h3 className="text-2xl font-bold mt-1 text-amber-600 dark:text-amber-400">{stats.expired}</h3>
            </div>
            <div className="p-2.5 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400">
              <Clock className="h-5 w-5" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Barra de Filtros e Busca */}
      <Card className="shadow-sm border-border">
        <CardHeader className="p-4 pb-3">
          <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por nome ou e-mail..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9 h-9 text-xs"
              />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Select value={statusFilter} onValueChange={(val: any) => setStatusFilter(val)}>
                <SelectTrigger className="h-9 w-[130px] text-xs">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos Status</SelectItem>
                  <SelectItem value="active">Ativos</SelectItem>
                  <SelectItem value="blocked">Bloqueados</SelectItem>
                  <SelectItem value="expired">Vencidos</SelectItem>
                </SelectContent>
              </Select>

              <Select value={roleFilter} onValueChange={(val: any) => setRoleFilter(val)}>
                <SelectTrigger className="h-9 w-[130px] text-xs">
                  <SelectValue placeholder="Cargo" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos Cargos</SelectItem>
                  <SelectItem value="Admin">Administradores</SelectItem>
                  <SelectItem value="User">Usuários</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/30">
                <TableHead className="w-[300px]">Usuário</TableHead>
                <TableHead>Plano & Nível</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Clientes CRM</TableHead>
                <TableHead>Vencimento</TableHead>
                <TableHead className="text-right pr-6">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-12 text-muted-foreground">
                    <RefreshCw className="h-6 w-6 animate-spin mx-auto mb-2 text-primary opacity-60" />
                    Carregando usuários do sistema...
                  </TableCell>
                </TableRow>
              )}

              {!isLoading && filteredUsers.map((user) => {
                const isCurrentUser = user.id === currentUser?.uid;
                const isBlocked = user.status === 'blocked';
                const isExpired = user.subscriptionEndDate && user.subscriptionEndDate.toDate() < new Date();

                return (
                  <TableRow key={user.id} className={cn("hover:bg-muted/40 transition-colors", isBlocked && "opacity-60 bg-muted/20")}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <div className="relative shrink-0">
                          <Image
                            src={user.avatarUrl || `https://picsum.photos/seed/${user.id}/40/40`}
                            alt={user.firstName || 'User'}
                            width={38}
                            height={38}
                            className="rounded-full border border-border object-cover bg-muted"
                            data-ai-hint="person portrait"
                          />
                        </div>
                        <div className="flex flex-col min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="font-semibold text-xs text-foreground truncate">
                              {user.firstName} {user.lastName}
                            </span>
                            {isCurrentUser && (
                              <Badge variant="outline" className="text-[9px] px-1 py-0 h-4 border-primary/40 text-primary bg-primary/5">
                                VOCÊ
                              </Badge>
                            )}
                            {user.role === 'Admin' && (
                              <Badge variant="destructive" className="text-[9px] px-1 py-0 h-4 bg-rose-600">
                                ADMIN
                              </Badge>
                            )}
                          </div>
                          <span className="text-[11px] text-muted-foreground truncate font-mono mt-0.5">
                            {user.email}
                          </span>
                        </div>
                      </div>
                    </TableCell>

                    <TableCell>
                      <div className="flex flex-col gap-1">
                        <Badge variant="outline" className={cn(
                          "w-fit text-[10px] uppercase font-bold",
                          user.subscriptionPlan === 'pro' && "border-purple-500/40 text-purple-600 dark:text-purple-400 bg-purple-500/5",
                          user.subscriptionPlan === 'basic' && "border-blue-500/40 text-blue-600 dark:text-blue-400 bg-blue-500/5",
                          !user.subscriptionPlan && "border-border text-muted-foreground"
                        )}>
                          {user.subscriptionPlan ? `Plano ${user.subscriptionPlan}` : (user.role === 'Admin' ? 'Acesso Total' : 'Sem Plano')}
                        </Badge>
                        {user.createdAt && (
                          <span className="text-[10px] text-muted-foreground">
                            Criado em {format(user.createdAt.toDate(), 'dd/MM/yy')}
                          </span>
                        )}
                      </div>
                    </TableCell>

                    <TableCell>
                      {isBlocked ? (
                        <Badge variant="outline" className="border-rose-500/40 text-rose-600 dark:text-rose-400 bg-rose-500/10 text-[10px]">
                          Bloqueado
                        </Badge>
                      ) : isExpired ? (
                        <Badge variant="outline" className="border-amber-500/40 text-amber-600 dark:text-amber-400 bg-amber-500/10 text-[10px]">
                          Vencido
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="border-emerald-500/40 text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 text-[10px]">
                          Ativo
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
                          className="h-8 px-2 text-xs gap-1 border-border hover:border-emerald-500 hover:text-emerald-600"
                          title="Adicionar 3 dias de acesso grátis"
                        >
                          <Gift className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                          <span className="hidden sm:inline">+3 dias</span>
                        </Button>

                        {/* Botão de Editar e Permissões */}
                        <Button 
                          variant="outline" 
                          size="sm" 
                          onClick={() => setEditingUser(user)}
                          className="h-8 px-2.5 text-xs gap-1.5"
                          title="Editar permissões e assinatura"
                        >
                          <Edit3 className="h-3.5 w-3.5 text-primary" />
                          <span>Permissões</span>
                        </Button>

                        {/* Botão Bloquear / Desbloquear */}
                        <Button
                          variant={isBlocked ? 'secondary' : 'ghost'}
                          size="icon"
                          className={cn("h-8 w-8", isBlocked && "text-rose-600 hover:text-rose-700 bg-rose-50 dark:bg-rose-950/40")}
                          onClick={() => handleToggleBlockUser(user)}
                          disabled={isCurrentUser}
                          title={isBlocked ? "Desbloquear Usuário" : "Bloquear Usuário"}
                        >
                          {isBlocked ? <Unlock className="h-4 w-4" /> : <Lock className="h-4 w-4 text-muted-foreground" />}
                        </Button>

                        {/* Menu de Mais Ações & Excluir */}
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground">
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-48">
                            <DropdownMenuLabel className="text-xs">Opções de Validade</DropdownMenuLabel>
                            <DropdownMenuItem onClick={() => handleGrantDays(user, 7)} className="text-xs">
                              <PlusCircle className="mr-2 h-3.5 w-3.5 text-emerald-600" /> +7 Dias de Acesso
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleGrantDays(user, 30)} className="text-xs">
                              <PlusCircle className="mr-2 h-3.5 w-3.5 text-emerald-600" /> +30 Dias de Acesso
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <div className="flex items-center px-2 py-1.5 text-xs text-destructive hover:bg-destructive/10 rounded-sm cursor-pointer w-full">
                                  <Trash2 className="mr-2 h-3.5 w-3.5" /> Excluir Usuário
                                </div>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>Excluir Usuário permanentemente?</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    Esta ação excluirá permanentemente a conta e o cadastro de {user.firstName} ({user.email}). Essa ação não pode ser desfeita.
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                  <AlertDialogAction
                                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                    onClick={() => handleDeleteUser(user)}
                                  >
                                    Sim, Excluir Conta
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
                  <TableCell colSpan={6} className="text-center py-10 text-muted-foreground">
                    <Users className="h-8 w-8 mx-auto mb-2 opacity-30" />
                    Nenhum usuário encontrado com os filtros selecionados.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Modal de Edição */}
      <Dialog open={!!editingUser} onOpenChange={(open) => !open && setEditingUser(null)}>
        <DialogContent className="sm:max-w-lg">
          {editingUser && <UserEditModal user={editingUser} onFinished={handleEditFinished} />}
        </DialogContent>
      </Dialog>
    </div>
  );
}
