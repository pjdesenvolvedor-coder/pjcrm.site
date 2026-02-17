'use client';

import { Lock, Unlock, Package, Trash2, Gift, CalendarDays } from 'lucide-react';
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
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
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
});

const userFormSchema = z.object({
  role: z.enum(['Admin', 'Agent']),
  permissions: permissionsSchema,
  subscriptionEndDate: z.string().optional(),
});

type UserFormData = z.infer<typeof userFormSchema>;

const permissionLabels: { key: keyof UserPermissions, label: string }[] = [
    { key: 'dashboard', label: 'Início' },
    { key: 'customers', label: 'Clientes & Suporte' },
    { key: 'inbox', label: 'Inbox' },
    { key: 'automations', label: 'Automações' },
    { key: 'groups', label: 'Grupos' },
    { key: 'shot', label: 'Disparo em Massa' },
    { key: 'zapconnect', label: 'ZapConexão' },
    { key: 'settings', label: 'Configurações (Assinaturas, etc)' },
    { key: 'users', label: 'Gerenciamento de Usuários' },
];

function UserClientCount({ userId }: { userId: string }) {
  const { firestore } = useFirebase();
  
  const clientsQuery = useMemoFirebase(() => {
    if (!firestore || !userId) return null;
    const clientsRef = collection(firestore, 'users', userId, 'clients');
    return query(clientsRef, where('status', '==', 'Ativo'));
  }, [firestore, userId]);

  const { data: activeClients, isLoading } = useCollection(clientsQuery);

  if (isLoading) {
    return <Skeleton className="h-5 w-5" />;
  }

  return <span>{activeClients?.length ?? 0}</span>;
}

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
            role: user.role,
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
            role: 'Admin' | 'Agent';
            permissions: UserPermissions;
            subscriptionEndDate?: Timestamp | null;
        } = { 
            role: data.role,
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
            title: "Usuário Atualizado!",
            description: `As permissões e assinatura de ${user.firstName} foram salvas.`
        });
        onFinished();
    };

    return (
        <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                <DialogHeader>
                    <DialogTitle>Editar Usuário: {user.firstName} {user.lastName}</DialogTitle>
                    <DialogDescription>
                        Defina a função, permissões e data de vencimento para este usuário.
                    </DialogDescription>
                </DialogHeader>

                <FormField
                    control={form.control}
                    name="role"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>Função</FormLabel>
                            <Select onValueChange={field.onChange} defaultValue={field.value} disabled={user.id === currentUser?.uid}>
                                <FormControl>
                                    <SelectTrigger>
                                        <SelectValue placeholder="Selecione uma função" />
                                    </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                    <SelectItem value="Agent">Agente</SelectItem>
                                    <SelectItem value="Admin">Admin</SelectItem>
                                </SelectContent>
                            </Select>
                            {user.id === currentUser?.uid && <p className="text-xs text-muted-foreground pt-1">Você não pode alterar sua própria função.</p>}
                            <FormMessage />
                        </FormItem>
                    )}
                />

                <div>
                    <Label>Permissões de Acesso</Label>
                    <div className="space-y-2 rounded-md border p-4 mt-2">
                        {permissionLabels.map(({ key, label }) => (
                            <FormField
                                key={key}
                                control={form.control}
                                name={`permissions.${key}`}
                                render={({ field }) => (
                                    <FormItem className="flex flex-row items-center justify-between">
                                        <FormLabel className="font-normal">{label}</FormLabel>
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
                    <Label>Assinatura</Label>
                     <div className="space-y-2 rounded-md border p-4 mt-2">
                        <FormField
                            control={form.control}
                            name="subscriptionEndDate"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel className='flex items-center gap-2'><CalendarDays/>Data de Vencimento</FormLabel>
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
                                    <FormDescription>
                                        Defina a data de expiração da assinatura. Deixe em branco para remover.
                                    </FormDescription>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                    </div>
                </div>

                <DialogFooter>
                    <Button type="button" variant="ghost" onClick={onFinished}>Cancelar</Button>
                    <Button type="submit">Salvar Alterações</Button>
                </DialogFooter>
            </form>
        </Form>
    );
}

const PAGE_SIZE = 15;

export default function UsersPage() {
  const { firestore, user: currentUser } = useFirebase();
  const [editingUser, setEditingUser] = useState<UserProfile | null>(null);
  const { toast } = useToast();

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
      q = query(usersRef, orderBy('firstName'), startAfter(pagination.last), limit(PAGE_SIZE));
    } else if (dir === 'prev' && pagination.first) {
      q = query(usersRef, orderBy('firstName'), endBefore(pagination.first), limitToLast(PAGE_SIZE));
    } else {
      q = query(usersRef, orderBy('firstName'), limit(PAGE_SIZE));
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
    fetchUsers('initial'); // Re-fetch to show updated data
  }

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
        title: "Teste Grátis Concedido!",
        description: `O usuário ${userToGrant.firstName} recebeu 3 dias de teste.`
    });

    // Optimistic UI update
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
    
    if (newStatus === 'blocked') {
        // Release token logic
        try {
            const userSettingsRef = doc(firestore, 'users', userToToggle.id, 'settings', 'config');
            const settingsSnap = await getDoc(userSettingsRef);
            
            if (settingsSnap.exists() && settingsSnap.data().webhookToken) {
                const tokenValue = settingsSnap.data().webhookToken;

                // Disconnect session
                await fetch('https://n8nbeta.typeflow.app.br/webhook/2ac86d63-f7fc-4221-bbaf-efeecec33127', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ token: tokenValue }),
                });

                // Release token from stock
                const tokenQuery = query(collection(firestore, 'tokens'), where('value', '==', tokenValue), limit(1));
                const tokenSnapshot = await getDocs(tokenQuery);
                
                if (!tokenSnapshot.empty) {
                    const tokenDocRef = tokenSnapshot.docs[0].ref;
                    const batch = writeBatch(firestore);
                    batch.update(tokenDocRef, {
                        status: 'available',
                        assignedTo: null,
                        assignedEmail: null,
                    });
                    batch.update(userSettingsRef, { webhookToken: null });
                    await batch.commit();
                }
            }
        } catch(e) {
            console.error("Failed to release token on block:", e);
            toast({
                variant: "destructive",
                title: "Erro ao Liberar Token",
                description: "Não foi possível retornar o token do usuário ao estoque.",
            });
        }
    } else if (newStatus === 'active' && userToToggle.subscriptionPlan) {
        // Re-assign token on unblock
        try {
            const tokensRef = collection(firestore, 'tokens');
            const q = query(tokensRef, where('status', '==', 'available'), limit(1));
            const availableTokenSnap = await getDocs(q);

            if (availableTokenSnap.empty) {
                throw new Error('Nenhum token disponível no estoque para reatribuir.');
            }

            const tokenDoc = availableTokenSnap.docs[0];
            const userSettingsRef = doc(firestore, 'users', userToToggle.id, 'settings', 'config');
            
            await runTransaction(firestore, async (transaction) => {
                transaction.update(tokenDoc.ref, {
                    status: 'in_use',
                    assignedTo: userToToggle.id,
                    assignedEmail: userToToggle.email,
                });
                transaction.set(userSettingsRef, { webhookToken: tokenDoc.data().value }, { merge: true });
            });
             toast({
                title: "Token Reatribuído!",
                description: `Um novo token foi atribuído para ${userToToggle.firstName}.`,
            });

        } catch (e: any) {
            console.error("Failed to assign token on unblock:", e);
            toast({
                variant: "destructive",
                title: "Erro ao Atribuir Token",
                description: e.message || "Não foi possível atribuir um novo token do estoque.",
            });
        }
    }


    const userDocRef = doc(firestore, "users", userToToggle.id);
    
    setDocumentNonBlocking(userDocRef, { status: newStatus }, { merge: true });

    toast({
        title: `Usuário ${newStatus === 'blocked' ? 'Bloqueado' : 'Desbloqueado'}`,
        description: `O acesso de ${userToToggle.firstName} foi ${newStatus === 'blocked' ? 'bloqueado' : 'restaurado'}.`,
    });
    
    // Optimistic UI update
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
            description: "Você não pode excluir seu próprio usuário.",
        });
        return;
    }

    try {
        const userSettingsRef = doc(firestore, 'users', userToDelete.id, 'settings', 'config');
        const settingsSnap = await getDoc(userSettingsRef);

        if (settingsSnap.exists() && settingsSnap.data().webhookToken) {
            const tokenValue = settingsSnap.data().webhookToken;

            // Disconnect session
            await fetch('https://n8nbeta.typeflow.app.br/webhook/2ac86d63-f7fc-4221-bbaf-efeecec33127', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ token: tokenValue }),
            });

            // Find and release token
            const tokenQuery = query(collection(firestore, 'tokens'), where('value', '==', tokenValue), limit(1));
            const tokenSnapshot = await getDocs(tokenQuery);
            if (!tokenSnapshot.empty) {
                const tokenDocRef = tokenSnapshot.docs[0].ref;
                await runTransaction(firestore, async (transaction) => {
                    transaction.update(tokenDocRef, {
                        status: 'available',
                        assignedTo: null,
                        assignedEmail: null,
                    });
                });
            }
        }
        
        // Delete the user's document
        const userDocRef = doc(firestore, "users", userToDelete.id);
        await deleteDoc(userDocRef);

        toast({
            title: "Usuário Excluído",
            description: `Os dados de ${userToDelete.firstName} foram removidos do CRM.`,
        });

        fetchUsers('initial');
    } catch (e: any) {
        console.error("Failed to delete user:", e);
        toast({
            variant: "destructive",
            title: "Erro ao Excluir",
            description: "Não foi possível excluir o usuário. Verifique o console.",
        });
    }
  };


  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title="Gerenciamento de Usuários"
        description="Gerencie os usuários da sua equipe e suas permissões de acesso."
      >
        <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => fetchUsers('prev')} disabled={!hasPrevPage || isLoading}>
                Anterior
            </Button>
            <Button variant="outline" size="sm" onClick={() => fetchUsers('next')} disabled={!hasNextPage || isLoading}>
                Próximo
            </Button>
            <p className="text-sm text-muted-foreground">Novos usuários se cadastram na página de <a href="/signup" className="underline">cadastro</a>.</p>
        </div>
      </PageHeader>
      <main className="flex-1 overflow-auto p-4 md:p-6">
        <Card>
          <CardHeader>
            <CardTitle>Membros da Equipe</CardTitle>
            <CardDescription>
              Gerencie os membros da sua equipe e suas permissões.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Usuário</TableHead>
                  <TableHead>Função</TableHead>
                  <TableHead>Clientes Ativos</TableHead>
                  <TableHead>Assinatura</TableHead>
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
                  <TableRow key={user.id}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <Image
                          src={user.avatarUrl || `https://picsum.photos/seed/${user.id}/40/40`}
                          alt={user.firstName}
                          width={40}
                          height={40}
                          className="rounded-full"
                          data-ai-hint="person portrait"
                        />
                        <div className="font-medium">
                          <p>{user.firstName} {user.lastName}</p>
                          <p className="text-sm text-muted-foreground">{user.email}</p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                        <div className="flex items-center gap-2">
                            <Badge variant={user.role === 'Admin' ? 'destructive' : 'outline'}>{user.role}</Badge>
                            {user.status === 'blocked' && (
                                <Badge variant="secondary" className="border-yellow-400 bg-yellow-50 text-yellow-800">
                                    Bloqueado
                                </Badge>
                            )}
                        </div>
                    </TableCell>
                    <TableCell>
                      <UserClientCount userId={user.id} />
                    </TableCell>
                    <TableCell>
                      <SubscriptionCell endDate={user.subscriptionEndDate} />
                    </TableCell>
                    <TableCell className="text-right space-x-1">
                        <Button variant="outline" size="sm" onClick={() => handleGrantTrial(user)}>
                            <Gift className="mr-2 h-4 w-4" />
                            Teste (+3d)
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => setEditingUser(user)}>Editar</Button>
                        <Button 
                            variant={user.status === 'blocked' ? 'secondary' : 'ghost'} 
                            size="sm" 
                            onClick={() => handleToggleBlockUser(user)}
                            disabled={user.id === currentUser?.uid}
                        >
                            {user.status === 'blocked' ? <Unlock className="mr-2 h-4 w-4" /> : <Lock className="mr-2 h-4 w-4" />}
                            {user.status === 'blocked' ? 'Desbloquear' : 'Bloquear'}
                        </Button>
                        <AlertDialog>
                            <AlertDialogTrigger asChild>
                                <Button variant="destructive" size="sm" disabled={user.id === currentUser?.uid}>
                                    Excluir
                                </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                                <AlertDialogHeader>
                                <AlertDialogTitle>Você tem certeza absoluta?</AlertDialogTitle>
                                <AlertDialogDescription>
                                    Essa ação não pode ser desfeita. Isso excluirá permanentemente os dados do usuário do CRM, desconectará sua sessão e liberará seu token. O usuário NÃO poderá se cadastrar novamente com o mesmo e-mail, a menos que você o exclua manually do console de autenticação do Firebase.
                                </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => handleDeleteUser(user)}>Sim, Excluir</AlertDialogAction>
                                </AlertDialogFooter>
                            </AlertDialogContent>
                        </AlertDialog>
                    </TableCell>
                  </TableRow>
                ))}
                 {!isLoading && users.length === 0 && (
                    <TableRow>
                        <TableCell colSpan={5} className="text-center">Nenhum usuário encontrado.</TableCell>
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
