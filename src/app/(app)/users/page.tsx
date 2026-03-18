
'use client';

import { Lock, Unlock, Package, Trash2, Gift, CalendarDays, UserPlus, Copy, Check } from 'lucide-react';
import Image from 'next/image';
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
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useFirebase, useUser, setDocumentNonBlocking, useCollection, useMemoFirebase } from '@/firebase';
import { collection, query, getDocs, limit, orderBy, startAfter, endBefore, limitToLast, type QueryDocumentSnapshot, doc, where, Timestamp, getDoc, writeBatch, runTransaction, deleteDoc } from 'firebase/firestore';
import type { UserProfile, UserPermissions } from '@/lib/types';
import { useState, useCallback, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from '@/components/ui/form';
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { differenceInSeconds, addDays, format } from 'date-fns';

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
});

type UserFormData = z.infer<typeof userFormSchema>;

const permissionLabels: { key: keyof UserPermissions, label: string }[] = [
    { key: 'dashboard', label: 'Início (Dash)' },
    { key: 'customers', label: 'Clientes (Todos, Leads, Suporte)' },
    { key: 'automations', label: 'Automações (Vencimento, etc)' },
    { key: 'groups', label: 'Grupos (JID, Extração, Agenda)' },
    { key: 'shot', label: 'Disparo em Massa' },
    { key: 'notes', label: 'Notas (Minhas Tarefas)' },
    { key: 'ads', label: 'Relatórios (Anúncios)' },
    { key: 'zapconnect', label: 'ZapConexão (Pareamento)' },
    { key: 'pix', label: 'Gerar Pix (Cobrança)' },
    { key: 'estoque', label: 'Estoque de Contas' },
    { key: 'settings', label: 'Configurações (BMs, Assinaturas)' },
    { key: 'users', label: 'Gerenciar Atendentes' },
    { key: 'dbCleaner', label: 'Limpador de DB' },
];

function UserClientCount({ userId, adminId }: { userId: string, adminId: string }) {
  const { firestore } = useFirebase();
  
  const clientsQuery = useMemoFirebase(() => {
    if (!firestore || !adminId || !userId) return null;
    const clientsRef = collection(firestore, 'users', adminId, 'clients');
    // Filtra clientes cujo agentId é o atendente e o status é Ativo
    return query(clientsRef, where('agentId', '==', userId), where('status', '==', 'Ativo'));
  }, [firestore, adminId, userId]);

  const { data: activeClients, isLoading } = useCollection(clientsQuery);

  if (isLoading) {
    return <Skeleton className="h-5 w-5" />;
  }

  return <span>{activeClients?.length ?? 0}</span>;
}

const userFormSchema = z.object({
  role: z.enum(['Admin', 'Agent', 'User']),
  permissions: permissionsSchema,
  subscriptionEndDate: z.string().optional(),
});

function formatDuration(seconds: number) {
    if (seconds < 0) return "Expirado";
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    if (days > 0) return `${days}d ${hours}h`;
    
    const minutes = Math.floor((seconds % 3600) / 60);
    if (hours > 0) return `${hours}h ${minutes}m`;

    return `${minutes}m`;
}

function SubscriptionCell({ endDate }: { endDate?: Timestamp }) {
  const [remainingTime, setRemainingTime] = useState<string | null>(null);

  useEffect(() => {
    if (!endDate) {
      setRemainingTime("-");
      return;
    }

    const subscriptionEndDate = endDate.toDate();

    const updateRemainingTime = () => {
      const now = new Date();
      const totalSeconds = differenceInSeconds(subscriptionEndDate, now);
      setRemainingTime(formatDuration(totalSeconds));
    };

    updateRemainingTime();
    const intervalId = setInterval(updateRemainingTime, 60000); // Update every minute

    return () => clearInterval(intervalId);
  }, [endDate]);

  if (remainingTime === null) {
      return <Skeleton className="h-4 w-20" />;
  }

  return <span>{remainingTime}</span>;
}

function UserEditForm({ user, onFinished }: { user: UserProfile, onFinished: () => void }) {
    const { firestore, user: currentUser } = useFirebase();
    const { toast } = useToast();

    const form = useForm<UserFormData>({
        resolver: zodResolver(userFormSchema),
        defaultValues: {
            role: user.role as any,
            permissions: {
                dashboard: user.permissions?.dashboard ?? true,
                customers: user.permissions?.customers ?? false,
                inbox: user.permissions?.inbox ?? false,
                automations: user.permissions?.automations ?? false,
                groups: user.permissions?.groups ?? false,
                shot: user.permissions?.shot ?? false,
                zapconnect: user.permissions?.zapconnect ?? false,
                settings: user.permissions?.settings ?? false,
                users: user.permissions?.users ?? false,
                estoque: user.permissions?.estoque ?? false,
                notes: user.permissions?.notes ?? false,
                ads: user.permissions?.ads ?? false,
                pix: user.permissions?.pix ?? false,
                dbCleaner: user.permissions?.dbCleaner ?? false,
            },
            subscriptionEndDate: user.subscriptionEndDate ? format(user.subscriptionEndDate.toDate(), 'dd/MM/yyyy') : '',
        },
    });

    const role = form.watch('role');

    useEffect(() => {
        if (role === 'Admin') {
            permissionLabels.forEach(({ key }) => {
                form.setValue(`permissions.${key}`, true);
            });
        }
    }, [role, form]);


    const onSubmit = (data: UserFormData) => {
        const userDocRef = doc(firestore, "users", user.id);
        
        const finalPermissions = role === 'Admin' 
            ? permissionLabels.reduce((acc, p) => ({ ...acc, [p.key]: true }), {})
            : data.permissions;
        
        const dataToUpdate: {
            role: 'Admin' | 'Agent' | 'User';
            permissions: UserPermissions;
            subscriptionEndDate?: Timestamp | null;
        } = { 
            role: data.role as any,
            permissions: finalPermissions as UserPermissions,
        };

        if (data.subscriptionEndDate && data.subscriptionEndDate.length === 10) {
            const [day, month, year] = data.subscriptionEndDate.split('/');
            const date = new Date(parseInt(year, 10), parseInt(month, 10) - 1, parseInt(day, 10));
            if (!isNaN(date.getTime())) {
                date.setHours(23, 59, 59); // Set to end of day
                dataToUpdate.subscriptionEndDate = Timestamp.fromDate(date);
            }
        } else if (data.subscriptionEndDate === '') {
            dataToUpdate.subscriptionEndDate = null;
        }

        setDocumentNonBlocking(userDocRef, dataToUpdate, { merge: true });

        toast({
            title: "Atendente Atualizado!",
            description: `As permissões e menus de ${user.firstName} foram salvos.`
        });
        onFinished();
    };

    return (
        <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                <DialogHeader>
                    <DialogTitle>Permissões: {user.firstName} {user.lastName}</DialogTitle>
                    <DialogDescription>
                        Escolha quais menus este atendente poderá visualizar e usar.
                    </DialogDescription>
                </DialogHeader>

                <FormField
                    control={form.control}
                    name="role"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>Nível de Acesso</FormLabel>
                            <Select onValueChange={field.onChange} defaultValue={field.value} disabled={user.id === currentUser?.uid}>
                                <FormControl>
                                    <SelectTrigger>
                                        <SelectValue placeholder="Selecione uma função" />
                                    </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                    <SelectItem value="Agent">Atendente (Agente)</SelectItem>
                                    <SelectItem value="Admin">Administrador (Total)</SelectItem>
                                    <SelectItem value="User">Usuário Comum</SelectItem>
                                </SelectContent>
                            </Select>
                            {user.id === currentUser?.uid && <p className="text-xs text-muted-foreground pt-1">Você é o dono da conta principal.</p>}
                            <FormMessage />
                        </FormItem>
                    )}
                />

                <div>
                    <Label>Menus Visíveis</Label>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 rounded-md border p-4 mt-2 max-h-[300px] overflow-y-auto">
                        {permissionLabels.map(({ key, label }) => (
                            <FormField
                                key={key}
                                control={form.control}
                                name={`permissions.${key}`}
                                render={({ field }) => (
                                    <FormItem className="flex flex-row items-center justify-between space-y-0 p-2 hover:bg-muted/50 rounded-sm">
                                        <FormLabel className="font-normal cursor-pointer text-xs">{label}</FormLabel>
                                        <FormControl>
                                            <Checkbox
                                                checked={field.value}
                                                onCheckedChange={field.onChange}
                                                disabled={role === 'Admin'}
                                            />
                                        </FormControl>
                                    </FormItem>
                                )}
                            />
                        ))}
                    </div>
                </div>
                 <div>
                    <Label>Validade do Acesso</Label>
                     <div className="space-y-2 rounded-md border p-4 mt-2">
                        <FormField
                            control={form.control}
                            name="subscriptionEndDate"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel className='flex items-center gap-2 text-xs'><CalendarDays className='h-3 w-3'/>Data de Vencimento</FormLabel>
                                    <FormControl>
                                        <Input
                                            placeholder="dd/mm/aaaa"
                                            {...field}
                                            value={field.value || ''}
                                            onChange={(e) => {
                                                let value = e.target.value.replace(/\D/g, '');
                                                if (value.length > 8) value = value.slice(0, 8);
                                                let formatted = value;
                                                if (value.length > 2) {
                                                    formatted = `${value.slice(0, 2)}/${value.slice(2)}`;
                                                }
                                                if (value.length > 4) {
                                                    formatted = `${value.slice(0, 2)}/${value.slice(2, 4)}/${value.slice(4)}`;
                                                }
                                                field.onChange(formatted);
                                            }}
                                        />
                                    </FormControl>
                                    <FormDescription className="text-[10px]">
                                        O atendente será bloqueado após esta data. Deixe vazio para acesso vitalício.
                                    </FormDescription>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                    </div>
                </div>

                <DialogFooter>
                    <Button type="button" variant="ghost" onClick={onFinished}>Cancelar</Button>
                    <Button type="submit">Salvar Permissões</Button>
                </DialogFooter>
            </form>
        </Form>
    );
}

const PAGE_SIZE_USERS = 15;

export default function UsersPage() {
  const { firestore, user: currentUser, effectiveUserId } = useFirebase();
  const [editingUser, setEditingUser] = useState<UserProfile | null>(null);
  const { toast } = useToast();
  const [hasCopied, setHasCopied] = useState(false);

  const [users, setUsers] = useState<UserProfile[]>([]);
  const [isLoading, setIsLoading] = useState(true);
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
          if(dir === 'initial') setUsers([]);
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
    } finally {
      setIsLoading(false);
    }
  }, [firestore, pagination.first, pagination.last]);

  useEffect(() => {
    fetchUsers('initial');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firestore]);
  
  const handleEditFinished = () => {
    setEditingUser(null);
    fetchUsers('initial');
  }

  const handleCopySignupLink = () => {
      const url = window.location.origin + '/signup';
      navigator.clipboard.writeText(url);
      setHasCopied(true);
      toast({
          title: "Link Copiado!",
          description: "Envie este link para seu novo atendente se cadastrar."
      });
      setTimeout(() => setHasCopied(false), 3000);
  };

  const handleGrantTrial = (userToGrant: UserProfile) => {
    if (!firestore) return;

    const currentEndDate = userToGrant.subscriptionEndDate
        ? userToGrant.subscriptionEndDate.toDate()
        : new Date();

    const newEndDate = addDays(
        currentEndDate > new Date() ? currentEndDate : new Date(),
        3
    );

    const userDocRef = doc(firestore, "users", userToGrant.id);
    
    const dataToUpdate: Partial<UserProfile> = {
        subscriptionEndDate: Timestamp.fromDate(newEndDate),
        status: 'active'
    };

    if (!userToGrant.subscriptionPlan) {
        dataToUpdate.subscriptionPlan = 'basic';
        dataToUpdate.trialActivated = true;
    }

    setDocumentNonBlocking(userDocRef, dataToUpdate, { merge: true });

    toast({
        title: "Acesso Liberado!",
        description: `O atendente ${userToGrant.firstName} recebeu +3 dias de acesso.`
    });

    setUsers(prevUsers => prevUsers.map(u =>
        u.id === userToGrant.id
            ? { ...u, ...dataToUpdate }
            : u
    ));
  };


  const handleToggleBlockUser = async (userToToggle: UserProfile) => {
    if (!firestore || !currentUser) return;

    if (userToToggle.id === currentUser?.uid) {
        toast({
            variant: "destructive",
            title: "Ação não permitida",
            description: "Você não pode bloquear seu próprio usuário.",
        });
        return;
    }

    const newStatus = userToToggle.status === 'blocked' ? 'active' : 'blocked';
    const userDocRef = doc(firestore, "users", userToToggle.id);
    
    setDocumentNonBlocking(userDocRef, { status: newStatus }, { merge: true });

    toast({
        title: `Atendente ${newStatus === 'blocked' ? 'Bloqueado' : 'Desbloqueado'}`,
        description: `O acesso de ${userToToggle.firstName} foi ${newStatus === 'blocked' ? 'removido' : 'restaurado'}.`,
    });
    
    setUsers(prevUsers => prevUsers.map(u => 
        u.id === userToToggle.id ? { ...u, status: newStatus } : u
    ));
  };

  const handleDeleteUser = async (userToDelete: UserProfile) => {
    if (!firestore || !currentUser) return;

    if (userToDelete.id === currentUser?.uid) {
        toast({
            variant: "destructive",
            title: "Ação não permitida",
            description: "Você não pode excluir o administrador mestre.",
        });
        return;
    }

    try {
        const userDocRef = doc(firestore, "users", userToDelete.id);
        await deleteDoc(userDocRef);

        toast({
            title: "Atendente Removido",
            description: `Os dados de ${userToDelete.firstName} foram removidos.`,
        });

        fetchUsers('initial');
    } catch (e: any) {
        toast({
            variant: "destructive",
            title: "Erro ao Excluir",
            description: "Não foi possível excluir o atendente.",
        });
    }
  };


  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title="Gerenciar Atendentes"
        description="Controle quem acessa o seu CRM e quais menus estão visíveis para eles."
      >
        <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => fetchUsers('prev')} disabled={!hasPrevPage || isLoading}>
                Anterior
            </Button>
            <Button variant="outline" size="sm" onClick={() => fetchUsers('next')} disabled={!hasNextPage || isLoading}>
                Próximo
            </Button>
            <Button size="sm" className="gap-2 bg-blue-600 hover:bg-blue-700" onClick={handleCopySignupLink}>
                {hasCopied ? <Check className="h-4 w-4" /> : <UserPlus className="h-4 w-4" />}
                Convidar Atendente
            </Button>
        </div>
      </PageHeader>
      <main className="flex-1 overflow-auto p-4 md:p-6">
        <Card>
          <CardHeader>
            <CardTitle>Sua Equipe</CardTitle>
            <CardDescription>
              Abaixo estão listados todos os atendentes cadastrados. Use o botão "Editar" para liberar menus específicos.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Atendente</TableHead>
                  <TableHead>Nível</TableHead>
                  <TableHead>Clientes Ativos</TableHead>
                  <TableHead>Vencimento</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading && (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center">Carregando...</TableCell>
                  </TableRow>
                )}
                {!isLoading && users?.map((user) => (
                  <TableRow key={user.id} className={cn(user.status === 'blocked' && "opacity-60")}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <Image
                          src={user.avatarUrl || `https://picsum.photos/seed/${user.id}/40/40`}
                          alt={user.firstName}
                          width={40}
                          height={40}
                          className="rounded-full border"
                          data-ai-hint="person portrait"
                        />
                        <div className="font-medium">
                          <p className='flex items-center gap-2'>
                              {user.firstName} {user.lastName}
                              {user.id === currentUser?.uid && <Badge variant="outline" className="text-[10px] py-0">VOCÊ</Badge>}
                          </p>
                          <p className="text-sm text-muted-foreground">{user.email}</p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                        <div className="flex items-center gap-2">
                            <Badge variant={user.role === 'Admin' ? 'destructive' : 'outline'}>{user.role === 'Admin' ? 'Admin' : 'Atendente'}</Badge>
                            {user.status === 'blocked' && (
                                <Badge variant="secondary" className="border-yellow-400 bg-yellow-50 text-yellow-800">
                                    Bloqueado
                                </Badge>
                            )}
                        </div>
                    </TableCell>
                    <TableCell>
                      <UserClientCount userId={user.id} adminId={effectiveUserId} />
                    </TableCell>
                    <TableCell>
                      <SubscriptionCell endDate={user.subscriptionEndDate} />
                    </TableCell>
                    <TableCell className="text-right space-x-1">
                        <Button variant="outline" size="sm" onClick={() => handleGrantTrial(user)} className="text-xs">
                            <Gift className="mr-1 h-3 w-3" />
                            +3 dias
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => setEditingUser(user)}>Permissões</Button>
                        <Button 
                            variant={user.status === 'blocked' ? 'secondary' : 'ghost'} 
                            size="sm" 
                            onClick={() => handleToggleBlockUser(user)}
                            disabled={user.id === currentUser?.uid}
                        >
                            {user.status === 'blocked' ? <Unlock className="h-4 w-4" /> : <Lock className="h-4 w-4" />}
                        </Button>
                        <AlertDialog>
                            <AlertDialogTrigger asChild>
                                <Button variant="ghost" size="icon" disabled={user.id === currentUser?.uid} className="text-destructive">
                                    <Trash2 className="h-4 w-4" />
                                </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                                <AlertDialogHeader>
                                <AlertDialogTitle>Remover Atendente?</AlertDialogTitle>
                                <AlertDialogDescription>
                                    Isso excluirá os dados de {user.firstName} permanentemente do seu CRM.
                                </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                    <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => handleDeleteUser(user)}>Sim, Remover</AlertDialogAction>
                                </AlertDialogFooter>
                            </AlertDialogContent>
                        </AlertDialog>
                    </TableCell>
                  </TableRow>
                ))}
                 {!isLoading && users.length === 0 && (
                    <TableRow>
                        <TableCell colSpan={5} className="text-center">Nenhum atendente cadastrado.</TableCell>
                    </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </main>

      <Dialog open={!!editingUser} onOpenChange={(open) => !open && setEditingUser(null)}>
        <DialogContent className="sm:max-w-md">
            {editingUser && <UserEditForm user={editingUser} onFinished={handleEditFinished} />}
        </DialogContent>
      </Dialog>
    </div>
  );
}
