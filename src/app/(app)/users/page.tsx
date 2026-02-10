'use client';

import { Lock, Unlock } from 'lucide-react';
import Image from 'next/image';
import { PageHeader } from '@/components/page-header';
import { Button, buttonVariants } from '@/components/ui/button';
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
import { useFirebase, useUser, setDocumentNonBlocking } from '@/firebase';
import { collection, query, getDocs, limit, orderBy, startAfter, endBefore, limitToLast, type QueryDocumentSnapshot, doc } from 'firebase/firestore';
import type { UserProfile, UserPermissions } from '@/lib/types';
import { useState, useCallback, useEffect } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/hooks/use-toast';

const permissionsSchema = z.object({
  dashboard: z.boolean().default(false),
  customers: z.boolean().default(false),
  inbox: z.boolean().default(false),
  automations: z.boolean().default(false),
  groups: z.boolean().default(false),
  zapconnect: z.boolean().default(false),
  settings: z.boolean().default(false),
  users: z.boolean().default(false),
});

const userFormSchema = z.object({
  role: z.enum(['Admin', 'Agent']),
  permissions: permissionsSchema,
});

type UserFormData = z.infer<typeof userFormSchema>;

const permissionLabels: { key: keyof UserPermissions, label: string }[] = [
    { key: 'dashboard', label: 'Início' },
    { key: 'customers', label: 'Clientes & Suporte' },
    { key: 'inbox', label: 'Inbox' },
    { key: 'automations', label: 'Automações' },
    { key: 'groups', label: 'Grupos' },
    { key: 'zapconnect', label: 'ZapConexão' },
    { key: 'settings', label: 'Configurações (Token & Assinaturas)' },
    { key: 'users', label: 'Gerenciamento de Usuários' },
];

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
                zapconnect: user.permissions?.zapconnect ?? false,
                settings: user.permissions?.settings ?? false,
                users: user.permissions?.users ?? false,
            },
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

        setDocumentNonBlocking(userDocRef, { 
            role: data.role,
            permissions: finalPermissions,
        }, { merge: true });

        toast({
            title: "Usuário Atualizado!",
            description: `As permissões para ${user.firstName} foram salvas.`
        });
        onFinished();
    };

    return (
        <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                <DialogHeader>
                    <DialogTitle>Editar Usuário: {user.firstName} {user.lastName}</DialogTitle>
                    <DialogDescription>
                        Defina a função e as permissões de acesso para este usuário.
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

  const handleToggleBlockUser = (userToToggle: UserProfile) => {
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
        title: `Usuário ${newStatus === 'blocked' ? 'Bloqueado' : 'Desbloqueado'}`,
        description: `O acesso de ${userToToggle.firstName} foi ${newStatus === 'blocked' ? 'bloqueado' : 'restaurado'}.`,
    });
    
    // Optimistic UI update
    setUsers(prevUsers => prevUsers.map(u => 
        u.id === userToToggle.id ? { ...u, status: newStatus } : u
    ));
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
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading && (
                  <TableRow>
                    <TableCell colSpan={3} className="text-center">Carregando...</TableCell>
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
                    <TableCell className="text-right space-x-2">
                      <Button variant="outline" size="sm" onClick={() => setEditingUser(user)}>Editar</Button>
                       <Button 
                            variant={user.status === 'blocked' ? 'secondary' : 'ghost'} 
                            size="sm" 
                            onClick={() => handleToggleBlockUser(user)}
                            disabled={user.id === currentUser?.uid}
                        >
                            {user.status === 'blocked' ? <Unlock className="mr-2" /> : <Lock className="mr-2" />}
                            {user.status === 'blocked' ? 'Desbloquear' : 'Bloquear'}
                        </Button>
                    </TableCell>
                  </TableRow>
                ))}
                 {!isLoading && users.length === 0 && (
                    <TableRow>
                        <TableCell colSpan={3} className="text-center">Nenhum usuário encontrado.</TableCell>
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
