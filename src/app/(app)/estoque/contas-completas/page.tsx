
'use client';

import { useState, useMemo, useEffect } from 'react';
import { PlusCircle, Trash2, Edit, Mail, Key, Package, Search, RefreshCw, Layers, CheckCircle2, History, CalendarDays, Clock, AlertTriangle, RotateCcw } from 'lucide-react';
import { collection, query, orderBy, doc, serverTimestamp, Timestamp } from 'firebase/firestore';
import { useFirebase, useUser, useCollection, useMemoFirebase, addDocumentNonBlocking, deleteDocumentNonBlocking, setDocumentNonBlocking } from '@/firebase';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { format, add, differenceInDays, isAfter } from 'date-fns';
import { cn } from '@/lib/utils';

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

function AccountResetCard({ account, onReset }: { account: FullAccount, onReset: (acc: FullAccount) => void }) {
    const usedAtDate = account.usedAt?.toDate() || new Date();
    const expiryDate = add(usedAtDate, { days: 30 });
    const isExpired = isAfter(new Date(), expiryDate);
    const daysRemaining = 30 - differenceInDays(new Date(), usedAtDate);

    return (
        <Card className={cn(
            "relative overflow-hidden border-2 transition-all duration-500",
            isExpired 
                ? "bg-destructive text-destructive-foreground border-destructive animate-pulse-destructive" 
                : "hover:shadow-md border-muted"
        )}>
            <CardHeader className="pb-2">
                <div className="flex justify-between items-start">
                    <div className="space-y-1">
                        <CardTitle className={cn("text-base truncate max-w-[200px]", isExpired ? "text-white" : "")}>
                            {account.email}
                        </CardTitle>
                        <CardDescription className={isExpired ? "text-white/80" : ""}>
                            {account.subscription}
                        </CardDescription>
                    </div>
                    <Badge variant={isExpired ? "secondary" : "outline"} className={cn(isExpired ? "bg-white text-destructive font-bold" : "")}>
                        {isExpired ? "EXPIRADO" : `${daysRemaining} dias`}
                    </Badge>
                </div>
            </CardHeader>
            <CardContent className="space-y-2 pb-4">
                <div className="flex items-center gap-2 text-xs">
                    <Key className="h-3 w-3 opacity-70" />
                    <span className="font-mono">{account.password}</span>
                </div>
                <div className="flex items-center gap-2 text-[10px] opacity-80">
                    <Clock className="h-3 w-3" />
                    Retirada em: {format(usedAtDate, 'dd/MM/yyyy HH:mm')}
                </div>
                {isExpired && (
                    <div className="mt-4 p-2 bg-white/20 rounded flex items-center gap-2 text-xs font-bold">
                        <AlertTriangle className="h-4 w-4" />
                        REDEFINIÇÃO OBRIGATÓRIA
                    </div>
                )}
            </CardContent>
            <CardFooter className="pt-0">
                <Button 
                    variant={isExpired ? "secondary" : "outline"} 
                    className="w-full h-8 text-xs gap-2"
                    onClick={() => onReset(account)}
                >
                    <RotateCcw className="h-3 w-3" />
                    Renovar e Voltar ao Estoque
                </Button>
            </CardFooter>
        </Card>
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

  const availableAccounts = useMemo(() => {
    if (!accounts) return [];
    return accounts.filter(acc => acc.status === 'available' && (
        acc.email.toLowerCase().includes(searchTerm.toLowerCase()) || 
        acc.subscription.toLowerCase().includes(searchTerm.toLowerCase())
    ));
  }, [accounts, searchTerm]);

  const usedAccounts = useMemo(() => {
    if (!accounts) return [];
    return accounts.filter(acc => acc.status === 'used' && (
        acc.email.toLowerCase().includes(searchTerm.toLowerCase()) || 
        acc.subscription.toLowerCase().includes(searchTerm.toLowerCase())
    )).sort((a, b) => {
        const dateA = a.usedAt?.toMillis() || 0;
        const dateB = b.usedAt?.toMillis() || 0;
        return dateB - dateA;
    });
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

  const handleMarkAsUsed = (account: FullAccount) => {
    if (!effectiveUserId) return;
    const docRef = doc(firestore, 'users', effectiveUserId, 'full_accounts', account.id);
    setDocumentNonBlocking(docRef, { 
        status: 'used',
        usedAt: serverTimestamp() 
    }, { merge: true });
    toast({ title: 'Conta Retirada!', description: 'A conta foi movida para redefinição.' });
  };

  const handleBackToStock = (account: FullAccount) => {
    if (!effectiveUserId) return;
    const docRef = doc(firestore, 'users', effectiveUserId, 'full_accounts', account.id);
    setDocumentNonBlocking(docRef, { 
        status: 'available',
        usedAt: null,
        createdAt: serverTimestamp() // Reset the addition date to the top of list
    }, { merge: true });
    toast({ title: 'Senha Redefinida!', description: 'A conta voltou para o estoque disponível.' });
  };

  const handleAddNew = () => {
    setEditingAccount(undefined);
    setIsDialogOpen(true);
  };

  const formatDate = (timestamp?: Timestamp) => {
    if (!timestamp) return '-';
    return format(timestamp.toDate(), 'dd/MM/yyyy HH:mm');
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
              placeholder="Pesquisar..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full rounded-lg bg-background pl-8 md:w-[200px]"
            />
        </div>
        <Button size="sm" onClick={handleAddNew} className="gap-1">
            <PlusCircle className="h-4 w-4" />
            Nova Conta
        </Button>
      </PageHeader>
      
      <main className="flex-1 overflow-auto p-4 md:p-6">
        <Tabs defaultValue="estoque" className="w-full space-y-6">
          <TabsList className="grid w-full grid-cols-3 max-w-2xl">
            <TabsTrigger value="estoque" className="gap-2">
                <Layers className="h-4 w-4" /> Estoque
            </TabsTrigger>
            <TabsTrigger value="redefinir" className="gap-2">
                <RefreshCw className="h-4 w-4" /> Redefinir Senha
            </TabsTrigger>
            <TabsTrigger value="historico" className="gap-2">
                <History className="h-4 w-4" /> Logs
            </TabsTrigger>
          </TabsList>

          <TabsContent value="estoque">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                    <Layers className="h-5 w-5 text-primary" />
                    Estoque Disponível ({availableAccounts.length})
                </CardTitle>
                <CardDescription>Visualização detalhada dos acessos prontos para entrega.</CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Dados de Acesso</TableHead>
                      <TableHead>Assinatura</TableHead>
                      <TableHead className="hidden md:table-cell">Adicionado em</TableHead>
                      <TableHead className="text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {isLoading ? (
                      <TableRow><TableCell colSpan={4} className="h-24 text-center">Carregando...</TableCell></TableRow>
                    ) : availableAccounts.length > 0 ? (
                      availableAccounts.map((account) => (
                        <TableRow key={account.id}>
                          <TableCell>
                            <div className="flex flex-col">
                                <span className="font-medium text-sm">{account.email}</span>
                                <span className="text-xs text-muted-foreground font-mono">{account.password}</span>
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className="bg-primary/5">{account.subscription}</Badge>
                          </TableCell>
                          <TableCell className="hidden md:table-cell text-xs text-muted-foreground">
                            <div className="flex items-center gap-1">
                                <CalendarDays className="h-3 w-3" />
                                {formatDate(account.createdAt)}
                            </div>
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-1">
                                <Button 
                                    variant="outline" 
                                    size="sm" 
                                    className="h-8 text-green-600 border-green-200 hover:bg-green-50 gap-1"
                                    onClick={() => handleMarkAsUsed(account)}
                                >
                                    <CheckCircle2 className="h-3.5 w-3.5" />
                                    <span className="hidden sm:inline">Retirar</span>
                                </Button>
                                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleEdit(account)}>
                                    <Edit className="h-4 w-4" />
                                </Button>
                                <AlertDialog>
                                    <AlertDialogTrigger asChild>
                                        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive">
                                            <Trash2 className="h-4 w-4" />
                                        </Button>
                                    </AlertDialogTrigger>
                                    <AlertDialogContent>
                                        <AlertDialogHeader>
                                            <AlertDialogTitle>Remover do Estoque?</AlertDialogTitle>
                                            <AlertDialogDescription>Esta conta será apagada permanentemente.</AlertDialogDescription>
                                        </AlertDialogHeader>
                                        <AlertDialogFooter>
                                            <AlertDialogCancel>Voltar</AlertDialogCancel>
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
                        <TableCell colSpan={4} className="h-24 text-center text-muted-foreground">Nenhuma conta disponível.</TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="redefinir">
            <div className="space-y-4">
                <div className="flex items-center gap-2 p-4 bg-muted/30 rounded-lg border">
                    <RefreshCw className="h-5 w-5 text-primary" />
                    <div>
                        <h3 className="font-semibold">Contas em Período de Redefinição</h3>
                        <p className="text-xs text-muted-foreground">As contas ficam aqui por 30 dias após a retirada. Quando expiram, a box fica vermelha indicando a troca necessária.</p>
                    </div>
                </div>
                {isLoading ? (
                    <div className="grid gap-4 md:grid-cols-3"><div className="h-40 bg-muted animate-pulse rounded-lg" /></div>
                ) : usedAccounts.length > 0 ? (
                    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                        {usedAccounts.map((account) => (
                            <AccountResetCard 
                                key={account.id} 
                                account={account} 
                                onReset={handleBackToStock} 
                            />
                        ))}
                    </div>
                ) : (
                    <Card className="border-dashed flex items-center justify-center p-12 text-muted-foreground">
                        Nenhuma conta pendente de redefinição no momento.
                    </Card>
                )}
            </div>
          </TabsContent>

          <TabsContent value="historico">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                    <History className="h-5 w-5 text-muted-foreground" />
                    Histórico de Uso ({usedAccounts.length})
                </CardTitle>
                <CardDescription>Controle de logins que já foram retirados do estoque.</CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Conta</TableHead>
                      <TableHead>Assinatura</TableHead>
                      <TableHead>Datas</TableHead>
                      <TableHead className="text-right">Ação</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {isLoading ? (
                      <TableRow><TableCell colSpan={4} className="h-24 text-center">Carregando...</TableCell></TableRow>
                    ) : usedAccounts.length > 0 ? (
                      usedAccounts.map((account) => (
                        <TableRow key={account.id} className="opacity-70 grayscale-[0.5]">
                          <TableCell>
                            <div className="flex flex-col">
                                <span className="font-medium text-sm line-through decoration-muted-foreground/50">{account.email}</span>
                                <Badge variant="secondary" className="w-fit text-[10px] mt-1 h-4">RETIRADA</Badge>
                            </div>
                          </TableCell>
                          <TableCell>
                            <span className="text-sm">{account.subscription}</span>
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-col gap-1 text-[10px]">
                                <div className="flex items-center gap-1 text-muted-foreground">
                                    <PlusCircle className="h-3 w-3" /> Add: {formatDate(account.createdAt)}
                                </div>
                                <div className="flex items-center gap-1 text-primary font-medium">
                                    <Clock className="h-3 w-3" /> Fim: {formatDate(account.usedAt)}
                                </div>
                            </div>
                          </TableCell>
                          <TableCell className="text-right">
                            <AlertDialog>
                                <AlertDialogTrigger asChild>
                                    <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive">
                                        <Trash2 className="h-4 w-4" />
                                    </Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                    <AlertDialogHeader>
                                        <AlertDialogTitle>Excluir Log Histórico?</AlertDialogTitle>
                                        <AlertDialogDescription>Isso removerá o registro desta conta para sempre.</AlertDialogDescription>
                                    </AlertDialogHeader>
                                    <AlertDialogFooter>
                                        <AlertDialogCancel>Voltar</AlertDialogCancel>
                                        <AlertDialogAction onClick={() => handleDelete(account.id)} className="bg-destructive text-destructive-foreground">Excluir</AlertDialogAction>
                                    </AlertDialogFooter>
                                </AlertDialogContent>
                            </AlertDialog>
                          </TableCell>
                        </TableRow>
                      ))
                    ) : (
                      <TableRow>
                        <TableCell colSpan={4} className="h-24 text-center text-muted-foreground">Nenhuma retirada registrada.</TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
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
