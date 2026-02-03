'use client';

import { PlusCircle } from 'lucide-react';
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
  DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useFirebase } from '@/firebase';
import { collection, query, getDocs, limit, orderBy, startAfter, endBefore, limitToLast, type QueryDocumentSnapshot } from 'firebase/firestore';
import type { UserProfile } from '@/lib/types';
import { useState, useCallback, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';

const userSchema = z.object({
  name: z.string().min(1, 'Nome é obrigatório'),
  email: z.string().email('Email inválido'),
  role: z.enum(['Admin', 'Agent']),
});

const PAGE_SIZE = 15;

export default function UsersPage() {
  const { firestore } = useFirebase();
  const [open, setOpen] = useState(false);

  const [users, setUsers] = useState<UserProfile[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [pagination, setPagination] = useState<{
    first: QueryDocumentSnapshot | null;
    last: QueryDocumentSnapshot | null;
  }>({ first: null, last: null });
  const [hasPrevPage, setHasPrevPage] = useState(false);
  const [hasNextPage, setHasNextPage] = useState(false);
  
  const form = useForm<z.infer<typeof userSchema>>({
    resolver: zodResolver(userSchema),
    defaultValues: {
      name: '',
      email: '',
      role: 'Agent',
    },
  });

  const fetchUsers = useCallback(async (dir: 'next' | 'prev' | 'initial') => {
    setIsLoading(true);
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
  }, [fetchUsers]);

  // TODO: Implement user invitation logic (e.g., via Firebase Functions)
  // This form currently doesn't do anything.
  const onSubmit = (values: z.infer<typeof userSchema>) => {
    console.log("Inviting user:", values);
    form.reset();
    setOpen(false);
  };


  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title="Gerenciamento de Usuários"
        description="Adicione, remova e edite os usuários da sua equipe."
      >
        <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => fetchUsers('prev')} disabled={!hasPrevPage || isLoading}>
                Anterior
            </Button>
            <Button variant="outline" size="sm" onClick={() => fetchUsers('next')} disabled={!hasNextPage || isLoading}>
                Próximo
            </Button>
            <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Button size="sm" className="gap-1">
                <PlusCircle className="h-4 w-4" />
                Adicionar Usuário
                </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[425px]">
            <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)}>
                    <DialogHeader>
                    <DialogTitle>Novo Usuário</DialogTitle>
                    <DialogDescription>
                        Convide um novo membro para sua equipe.
                    </DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                        <FormField
                            control={form.control}
                            name="name"
                            render={({ field }) => (
                            <FormItem className="grid grid-cols-4 items-center gap-4">
                                <FormLabel className="text-right">Nome</FormLabel>
                                <FormControl>
                                <Input {...field} placeholder="Nome Completo" className="col-span-3" />
                                </FormControl>
                                <FormMessage className="col-start-2 col-span-3" />
                            </FormItem>
                            )}
                        />
                        <FormField
                            control={form.control}
                            name="email"
                            render={({ field }) => (
                            <FormItem className="grid grid-cols-4 items-center gap-4">
                                <FormLabel className="text-right">Email</FormLabel>
                                <FormControl>
                                <Input {...field} type="email" placeholder="m@example.com" className="col-span-3" />
                                </FormControl>
                                <FormMessage className="col-start-2 col-span-3" />
                            </FormItem>
                            )}
                        />
                        <FormField
                            control={form.control}
                            name="role"
                            render={({ field }) => (
                            <FormItem className="grid grid-cols-4 items-center gap-4">
                                <FormLabel className="text-right">Função</FormLabel>
                                <Select onValueChange={field.onChange} defaultValue={field.value}>
                                    <FormControl>
                                        <SelectTrigger className="col-span-3">
                                            <SelectValue placeholder="Selecione uma função" />
                                        </SelectTrigger>
                                    </FormControl>
                                    <SelectContent>
                                        <SelectItem value="Agent">Agente</SelectItem>
                                        <SelectItem value="Admin">Admin</SelectItem>
                                    </SelectContent>
                                </Select>
                                <FormMessage className="col-start-2 col-span-3" />
                            </FormItem>
                            )}
                        />
                    </div>
                    <DialogFooter>
                    <Button type="submit">Convidar</Button>
                    </DialogFooter>
                </form>
                </Form>
            </DialogContent>
            </Dialog>
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
                  <TableHead>
                    <span className="sr-only">Ações</span>
                  </TableHead>
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
                      <Badge variant={user.role === 'Admin' ? 'destructive' : 'outline'}>{user.role}</Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="sm">Remover</Button>
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
    </div>
  );
}
