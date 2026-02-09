'use client';

import { PlusCircle, Trash2 } from 'lucide-react';
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
import type { Subscription } from '@/lib/types';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { useToast } from '@/hooks/use-toast';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';


const subscriptionSchema = z.object({
  name: z.string().min(1, 'Nome é obrigatório'),
  value: z.string().min(1, 'Valor é obrigatório'),
});

export default function SubscriptionsPage() {
  const { firestore, user } = useFirebase();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);

  const subscriptionsQuery = useMemoFirebase(() => {
    if (!user) return null;
    return query(collection(firestore, 'users', user.uid, 'subscriptions'), orderBy('name'));
  }, [firestore, user]);

  const { data: subscriptions, isLoading } = useCollection<Subscription>(subscriptionsQuery);

  const form = useForm<z.infer<typeof subscriptionSchema>>({
    resolver: zodResolver(subscriptionSchema),
    defaultValues: {
      name: '',
      value: '',
    },
  });

  const onSubmit = (values: z.infer<typeof subscriptionSchema>) => {
    if (!user) return;
    const newSubscription = {
      ...values,
      userId: user.uid,
    };
    addDocumentNonBlocking(collection(firestore, 'users', user.uid, 'subscriptions'), newSubscription);
    toast({ title: 'Assinatura criada!', description: `A assinatura "${values.name}" foi adicionada.` });
    form.reset();
    setOpen(false);
  };

  const handleDelete = (subscription: Subscription) => {
    if (!user) return;
    const docRef = doc(firestore, 'users', user.uid, 'subscriptions', subscription.id);
    deleteDocumentNonBlocking(docRef);
    toast({ title: 'Assinatura removida!', description: `A assinatura "${subscription.name}" foi removida.` });
  }

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title="Assinaturas"
        description="Gerencie os planos de assinatura disponíveis."
      >
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="gap-1">
              <PlusCircle className="h-4 w-4" />
              Criar Assinatura
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[425px]">
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)}>
                <DialogHeader>
                  <DialogTitle>Nova Assinatura</DialogTitle>
                  <DialogDescription>
                    Adicione um novo plano para seus clientes.
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
                          <Input {...field} placeholder="Ex: Plano Mensal" className="col-span-3" />
                        </FormControl>
                        <FormMessage className="col-start-2 col-span-3" />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="value"
                    render={({ field }) => (
                      <FormItem className="grid grid-cols-4 items-center gap-4">
                        <FormLabel className="text-right">Valor</FormLabel>
                        <div className="relative col-span-3">
                            <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-muted-foreground">
                                R$
                            </span>
                            <FormControl>
                                <Input {...field} placeholder="0,00" className="pl-9 w-full" />
                            </FormControl>
                        </div>
                        <FormMessage className="col-start-2 col-span-3" />
                      </FormItem>
                    )}
                  />
                </div>
                <DialogFooter>
                  <Button type="submit">Salvar Assinatura</Button>
                </DialogFooter>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </PageHeader>
      <main className="flex-1 overflow-auto p-4 md:p-6">
        <Card>
          <CardHeader>
            <CardTitle>Planos de Assinatura</CardTitle>
            <CardDescription>
              Lista de todos os planos de assinatura configurados.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>Valor</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading && (
                  <TableRow>
                    <TableCell colSpan={3} className="text-center">Carregando...</TableCell>
                  </TableRow>
                )}
                {!isLoading && subscriptions?.map((subscription) => (
                  <TableRow key={subscription.id}>
                    <TableCell className="font-medium">{subscription.name}</TableCell>
                    <TableCell>R$ {subscription.value}</TableCell>
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
                                Essa ação não pode ser desfeita. Isso removerá permanentemente a assinatura.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancelar</AlertDialogCancel>
                              <AlertDialogAction onClick={() => handleDelete(subscription)}>Continuar</AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                    </TableCell>
                  </TableRow>
                ))}
                 {!isLoading && subscriptions?.length === 0 && (
                    <TableRow>
                        <TableCell colSpan={3} className="text-center">Nenhuma assinatura encontrada.</TableCell>
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
