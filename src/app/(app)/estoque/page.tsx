'use client';

import { PlusCircle, Trash2, Copy } from 'lucide-react';
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useFirebase, useUser, useCollection, useMemoFirebase, addDocumentNonBlocking, deleteDocumentNonBlocking } from '@/firebase';
import { collection, query, orderBy, doc } from 'firebase/firestore';
import type { Estoque } from '@/lib/types';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { useToast } from '@/hooks/use-toast';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

const estoqueSchema = z.object({
  nome: z.string().min(1, 'Nome é obrigatório'),
  login: z.string().min(1, 'Login é obrigatório'),
  senha: z.string().min(1, 'Senha é obrigatória'),
});

export default function EstoquePage() {
  const { firestore, user } = useFirebase();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);

  const estoqueQuery = useMemoFirebase(() => {
    if (!user) return null;
    return query(collection(firestore, 'users', user.uid, 'estoque'), orderBy('nome'));
  }, [firestore, user]);

  const { data: estoque, isLoading } = useCollection<Estoque>(estoqueQuery);

  const form = useForm<z.infer<typeof estoqueSchema>>({
    resolver: zodResolver(estoqueSchema),
    defaultValues: {
      nome: '',
      login: '',
      senha: '',
    },
  });

  const onSubmit = (values: z.infer<typeof estoqueSchema>) => {
    if (!user) return;
    const newEstoqueItem = {
      ...values,
      userId: user.uid,
      status: 'Disponível' as const,
    };
    addDocumentNonBlocking(collection(firestore, 'users', user.uid, 'estoque'), newEstoqueItem);
    toast({ title: 'Item Adicionado!', description: `A conta "${values.nome}" foi adicionada ao estoque.` });
    form.reset();
    setOpen(false);
  };

  const handleDelete = (item: Estoque) => {
    if (!user) return;
    const docRef = doc(firestore, 'users', user.uid, 'estoque', item.id);
    deleteDocumentNonBlocking(docRef);
    toast({ title: 'Item Removido!', description: `A conta "${item.nome}" foi removida do estoque.` });
  }

  const handleCopyToClipboard = (text: string, fieldName: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: 'Copiado!', description: `O ${fieldName} foi copiado para a área de transferência.` });
  };
  
  const getStatusVariant = (status: 'Disponível' | 'Em Uso') => {
    return status === 'Disponível' ? 'default' : 'secondary';
  }

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title="Estoque de Contas"
        description="Gerencie seu estoque de contas."
      >
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="gap-1">
              <PlusCircle className="h-4 w-4" />
              Adicionar Conta
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[425px]">
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)}>
                <DialogHeader>
                  <DialogTitle>Nova Conta</DialogTitle>
                  <DialogDescription>
                    Adicione uma nova conta ao seu estoque.
                  </DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                  <FormField control={form.control} name="nome" render={({ field }) => ( <FormItem><FormLabel>Nome da Conta</FormLabel><FormControl><Input {...field} placeholder="Ex: Conta de Anúncios 1" /></FormControl><FormMessage /></FormItem>)} />
                  <FormField control={form.control} name="login" render={({ field }) => ( <FormItem><FormLabel>Login/Email</FormLabel><FormControl><Input {...field} placeholder="email@exemplo.com" /></FormControl><FormMessage /></FormItem>)} />
                  <FormField control={form.control} name="senha" render={({ field }) => ( <FormItem><FormLabel>Senha</FormLabel><FormControl><Input type="password" {...field} placeholder="••••••••" /></FormControl><FormMessage /></FormItem>)} />
                </div>
                <DialogFooter>
                  <Button type="submit">Salvar Conta</Button>
                </DialogFooter>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </PageHeader>
      <main className="flex-1 overflow-auto p-4 md:p-6">
        <Card>
          <CardHeader>
            <CardTitle>Contas em Estoque</CardTitle>
            <CardDescription>
              Lista de todas as contas configuradas no seu estoque.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>Login</TableHead>
                  <TableHead>Senha</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading && (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center">Carregando...</TableCell>
                  </TableRow>
                )}
                {!isLoading && estoque?.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell className="font-medium">{item.nome}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <span>{item.login}</span>
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleCopyToClipboard(item.login, 'Login')}><Copy className="h-3.5 w-3.5" /></Button>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <span>{'*'.repeat(8)}</span>
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleCopyToClipboard(item.senha, 'Senha')}><Copy className="h-3.5 w-3.5" /></Button>
                      </div>
                    </TableCell>
                    <TableCell>
                        <Badge variant={getStatusVariant(item.status)} className={cn(item.status === 'Disponível' ? 'bg-green-500/20 text-green-700' : 'bg-yellow-500/20 text-yellow-700')}>{item.status}</Badge>
                    </TableCell>
                    <TableCell className="text-right">
                       <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="ghost" size="icon">
                                <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Você tem certeza?</AlertDialogTitle>
                              <AlertDialogDescription>
                                Essa ação não pode ser desfeita. Isso removerá permanentemente a conta do seu estoque.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancelar</AlertDialogCancel>
                              <AlertDialogAction onClick={() => handleDelete(item)}>Continuar</AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                    </TableCell>
                  </TableRow>
                ))}
                 {!isLoading && estoque?.length === 0 && (
                    <TableRow>
                        <TableCell colSpan={5} className="text-center">Nenhuma conta encontrada no estoque.</TableCell>
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
