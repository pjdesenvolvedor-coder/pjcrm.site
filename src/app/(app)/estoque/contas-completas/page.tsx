
'use client';

import { useState, useMemo } from 'react';
import { PlusCircle, Trash2, Edit, Mail, Key, Package, Search, RefreshCw, Layers } from 'lucide-react';
import { collection, query, orderBy, doc, serverTimestamp } from 'firebase/firestore';
import { useFirebase, useUser, useCollection, useMemoFirebase, addDocumentNonBlocking, deleteDocumentNonBlocking, setDocumentNonBlocking } from '@/firebase';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
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
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { useToast } from '@/hooks/use-toast';
import { Badge } from '@/components/ui/badge';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import type { FullAccount, Subscription } from '@/lib/types';

const accountSchema = z.object({
  email: z.string().min(1, 'E-mail/Login é obrigatório'),
  password: z.string().min(1, 'Senha é obrigatória'),
  subscription: z.string().min(1, 'Selecione uma assinatura'),
});

type AccountFormData = z.infer<typeof accountSchema>;

function AccountForm({ onFinished, initialData }: { onFinished: () => void, initialData?: FullAccount }) {
    const { firestore, effectiveUserId } = useFirebase();
    const { toast } = useToast();
    const isEditing = !!initialData;

    const subscriptionsQuery = useMemoFirebase(() => {
        if (!effectiveUserId) return null;
        return query(collection(firestore, 'users', effectiveUserId, 'subscriptions'), orderBy('name'));
    }, [firestore, effectiveUserId]);
    const { data: subscriptions } = useCollection<Subscription>(subscriptionsQuery);

    const form = useForm<AccountFormData>({
        resolver: zodResolver(accountSchema),
        defaultValues: {
            email: initialData?.email || '',
            password: initialData?.password || '',
            subscription: initialData?.subscription || '',
        },
    });

    const onSubmit = (values: AccountFormData) => {
        if (!effectiveUserId) return;

        const data = {
            ...values,
            userId: effectiveUserId,
            status: initialData?.status || 'available',
            createdAt: initialData?.createdAt || serverTimestamp(),
        };

        if (isEditing && initialData?.id) {
            setDocumentNonBlocking(doc(firestore, 'users', effectiveUserId, 'full_accounts', initialData.id), data, { merge: true });
            toast({ title: 'Conta Atualizada!' });
        } else {
            addDocumentNonBlocking(collection(firestore, 'users', effectiveUserId, 'full_accounts'), data);
            toast({ title: 'Conta Adicionada ao Estoque!' });
        }

        onFinished();
    };

    return (
        <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 pt-4">
                <FormField
                    control={form.control}
                    name="email"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>E-mail / Login</FormLabel>
                            <FormControl>
                                <div className="relative">
                                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                    <Input placeholder="usuario@exemplo.com" {...field} className="pl-9" />
                                </div>
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                    )}
                />
                <FormField
                    control={form.control}
                    name="password"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>Senha</FormLabel>
                            <FormControl>
                                <div className="relative">
                                    <Key className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                    <Input placeholder="Senha da conta" {...field} className="pl-9" />
                                </div>
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                    )}
                />
                <FormField
                    control={form.control}
                    name="subscription"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>Assinatura (Produto)</FormLabel>
                            <Select onValueChange={field.onChange} defaultValue={field.value}>
                                <FormControl>
                                    <SelectTrigger>
                                        <SelectValue placeholder="Selecione o plano" />
                                    </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                    {subscriptions?.map((sub) => (
                                        <SelectItem key={sub.id} value={sub.name}>
                                            {sub.name}
                                        </SelectItem>
                                    ))}
                                    {subscriptions?.length === 0 && (
                                        <div className="p-2 text-xs text-center text-muted-foreground">Nenhuma assinatura cadastrada.</div>
                                    )}
                                </SelectContent>
                            </Select>
                            <FormMessage />
                        </FormItem>
                    )}
                />
                <DialogFooter className="pt-4">
                    <Button type="button" variant="ghost" onClick={onFinished}>Cancelar</Button>
                    <Button type="submit">{isEditing ? 'Salvar Alterações' : 'Adicionar ao Estoque'}</Button>
                </DialogFooter>
            </form>
        </Form>
    );
}

export default function ContasCompletasPage() {
  const { firestore, effectiveUserId } = useFirebase();
  const { toast } = useToast();
  
  const [searchTerm, setSearchTerm] = useState('');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingAccount, setEditingAccount] = useState<FullAccount | undefined>(undefined);

  const accountsQuery = useMemoFirebase(() => {
    if (!effectiveUserId) return null;
    return query(collection(firestore, 'users', effectiveUserId, 'full_accounts'), orderBy('createdAt', 'desc'));
  }, [firestore, effectiveUserId]);

  const { data: accounts, isLoading } = useCollection<FullAccount>(accountsQuery);

  const filteredAccounts = useMemo(() => {
    if (!accounts) return [];
    return accounts.filter(acc => 
        acc.email.toLowerCase().includes(searchTerm.toLowerCase()) || 
        acc.subscription.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [accounts, searchTerm]);

  const handleEdit = (account: FullAccount) => {
    setEditingAccount(account);
    setIsDialogOpen(true);
  };

  const handleDelete = (accountId: string) => {
    if (!effectiveUserId) return;
    deleteDocumentNonBlocking(doc(firestore, 'users', effectiveUserId, 'full_accounts', accountId));
    toast({ title: 'Conta Removida do Estoque' });
  };

  const handleAddNew = () => {
    setEditingAccount(undefined);
    setIsDialogOpen(true);
  };

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title="Estoque: Contas Completas"
        description="Gerencie seu estoque de contas prontas para entrega."
      >
        <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              type="search"
              placeholder="Pesquisar e-mail ou plano..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full rounded-lg bg-background pl-8 md:w-[240px] lg:w-[320px]"
            />
        </div>
        <Button size="sm" onClick={handleAddNew} className="gap-1">
            <PlusCircle className="h-4 w-4" />
            Nova Conta
        </Button>
      </PageHeader>
      <main className="flex-1 overflow-auto p-4 md:p-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
                <Layers className="h-5 w-5 text-primary" />
                Estoque Disponível
            </CardTitle>
            <CardDescription>Visualize e gerencie seus acessos de login e senha.</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>E-mail / Login</TableHead>
                  <TableHead>Senha</TableHead>
                  <TableHead>Assinatura</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow><TableCell colSpan={5} className="h-24 text-center">Carregando estoque...</TableCell></TableRow>
                ) : filteredAccounts.length > 0 ? (
                  filteredAccounts.map((account) => (
                    <TableRow key={account.id}>
                      <TableCell className="font-medium">{account.email}</TableCell>
                      <TableCell className="font-mono text-xs">{account.password}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="bg-primary/5">{account.subscription}</Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant={account.status === 'available' ? 'default' : 'secondary'} className={account.status === 'available' ? 'bg-green-500/20 text-green-700' : ''}>
                            {account.status === 'available' ? 'Disponível' : 'Em Uso'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2">
                            <Button variant="ghost" size="icon" onClick={() => handleEdit(account)}>
                                <Edit className="h-4 w-4" />
                            </Button>
                            <AlertDialog>
                                <AlertDialogTrigger asChild>
                                    <Button variant="ghost" size="icon" className="text-destructive">
                                        <Trash2 className="h-4 w-4" />
                                    </Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                    <AlertDialogHeader>
                                        <AlertDialogTitle>Remover do Estoque?</AlertDialogTitle>
                                        <AlertDialogDescription>Essa ação não pode ser desfeita.</AlertDialogDescription>
                                    </AlertDialogHeader>
                                    <AlertDialogFooter>
                                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                        <AlertDialogAction onClick={() => handleDelete(account.id)} className="bg-destructive text-destructive-foreground">Excluir</AlertDialogAction>
                                    </AlertDialogFooter>
                                </AlertDialogContent>
                            </AlertDialog>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">
                        {searchTerm ? 'Nenhuma conta encontrada para esta pesquisa.' : 'Seu estoque está vazio.'}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </main>

      <Dialog open={isDialogOpen} onOpenChange={(open) => { if (!open) setEditingAccount(undefined); setIsDialogOpen(open); }}>
        <DialogContent className="sm:max-w-md">
            <DialogHeader>
                <DialogTitle>{editingAccount ? 'Editar Conta' : 'Adicionar Conta ao Estoque'}</DialogTitle>
                <DialogDescription>Preencha os dados de login e senha do seu fornecedor.</DialogDescription>
            </DialogHeader>
            <AccountForm initialData={editingAccount} onFinished={() => setIsDialogOpen(false)} />
        </DialogContent>
      </Dialog>
    </div>
  );
}
