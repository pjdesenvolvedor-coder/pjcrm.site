
'use client';

import { PlusCircle, Trash2, Edit } from 'lucide-react';
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
import { useFirebase, useUser, useCollection, useMemoFirebase, addDocumentNonBlocking, deleteDocumentNonBlocking, setDocumentNonBlocking } from '@/firebase';
import { collection, query, orderBy, doc } from 'firebase/firestore';
import type { Subscription } from '@/lib/types';
import { useState, useEffect } from 'react';
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
  const { firestore, effectiveUserId } = useFirebase();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [editingSubscription, setEditingSubscription] = useState<Subscription | null>(null);

  const subscriptionsQuery = useMemoFirebase(() => {
    if (!effectiveUserId) return null;
    return query(collection(firestore, 'users', effectiveUserId, 'subscriptions'), orderBy('name'));
  }, [firestore, effectiveUserId]);

  const { data: subscriptions, isLoading } = useCollection<Subscription>(subscriptionsQuery);

  const form = useForm<z.infer<typeof subscriptionSchema>>({
    resolver: zodResolver(subscriptionSchema),
    defaultValues: {
      name: '',
      value: '',
    },
  });

  useEffect(() => {
    if (editingSubscription) {
      form.reset({
        name: editingSubscription.name,
        value: editingSubscription.value,
      });
    } else {
      form.reset({
        name: '',
        value: '',
      });
    }
  }, [editingSubscription, form]);

  const onSubmit = (values: z.infer<typeof subscriptionSchema>) => {
    if (!effectiveUserId) return;

    if (editingSubscription) {
      const docRef = doc(firestore, 'users', effectiveUserId, 'subscriptions', editingSubscription.id);
      setDocumentNonBlocking(docRef, { ...values, userId: effectiveUserId }, { merge: true });
      toast({ title: 'Assinatura atualizada!', description: `A assinatura "${values.name}" foi salva com sucesso.` });
    } else {
      const newSubscription = {
        ...values,
        userId: effectiveUserId,
      };
      addDocumentNonBlocking(collection(firestore, 'users', effectiveUserId, 'subscriptions'), newSubscription);
      toast({ title: 'Assinatura criada!', description: `A assinatura "${values.name}" foi adicionada.` });
    }
    
    setEditingSubscription(null);
    form.reset();
    setOpen(false);
  };

  const handleDelete = (subscription: Subscription) => {
    if (!effectiveUserId) return;
    const docRef = doc(firestore, 'users', effectiveUserId, 'subscriptions', subscription.id);
    deleteDocumentNonBlocking(docRef);
    toast({ title: 'Assinatura removida!', description: `A assinatura "${subscription.name}" foi removida.` });
  };

  const handleEdit = (subscription: Subscription) => {
    setEditingSubscription(subscription);
    setOpen(true);
  };

  const handleAddNew = () => {
    setEditingSubscription(null);
    setOpen(true);
  };

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title="Assinaturas"
        description="Gerencie os planos de assinatura disponíveis."
      >
        <Dialog open={open} onOpenChange={(isOpen) => {
          setOpen(isOpen);
          if (!isOpen) setEditingSubscription(null);
        }}>
          <DialogTrigger asChild>
            <Button size="sm" className="gap-1" onClick={handleAddNew}>
              <PlusCircle className="h-4 w-4" />
              Criar Assinatura
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[425px]">
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)}>
                <DialogHeader>
                  <DialogTitle>{editingSubscription ? 'Editar Assinatura' : 'Nova Assinatura'}</DialogTitle>
                  <DialogDescription>
                    {editingSubscription 
                      ? 'Atualize os detalhes do plano para seus clientes.' 
                      : 'Adicione um novo plano para seus clientes.'}
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
                  <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
                  <Button type="submit">{editingSubscription ? 'Salvar Alterações' : 'Salvar Assinatura'}</Button>
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
                       <div className="flex items-center justify-end gap-2">
                        <Button variant="ghost" size="icon" onClick={() => handleEdit(subscription)}>
                            <Edit className="h-4 w-4" />
                        </Button>
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
                       </div>
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
