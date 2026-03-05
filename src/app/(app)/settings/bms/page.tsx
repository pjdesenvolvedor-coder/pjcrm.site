
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
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { useFirebase, useUser, useCollection, useMemoFirebase, addDocumentNonBlocking, deleteDocumentNonBlocking } from '@/firebase';
import { collection, query, orderBy, doc } from 'firebase/firestore';
import type { BusinessManager } from '@/lib/types';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { useToast } from '@/hooks/use-toast';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';


const bmSchema = z.object({
  name: z.string().min(1, 'Nome é obrigatório'),
});

export default function BmsPage() {
  const { firestore, effectiveUserId } = useFirebase();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);

  const bmsQuery = useMemoFirebase(() => {
    if (!effectiveUserId) return null;
    return query(collection(firestore, 'users', effectiveUserId, 'business_managers'), orderBy('name'));
  }, [firestore, effectiveUserId]);

  const { data: bms, isLoading } = useCollection<BusinessManager>(bmsQuery);

  const form = useForm<z.infer<typeof bmSchema>>({
    resolver: zodResolver(bmSchema),
    defaultValues: {
      name: '',
    },
  });

  const onSubmit = (values: z.infer<typeof bmSchema>) => {
    if (!effectiveUserId) return;
    const newBm = {
      ...values,
      userId: effectiveUserId,
    };
    addDocumentNonBlocking(collection(firestore, 'users', effectiveUserId, 'business_managers'), newBm);
    toast({ title: 'BM criada!', description: `A BM "${values.name}" foi adicionada.` });
    form.reset();
    setOpen(false);
  };

  const handleDelete = (bm: BusinessManager) => {
    if (!effectiveUserId) return;
    const docRef = doc(firestore, 'users', effectiveUserId, 'business_managers', bm.id);
    deleteDocumentNonBlocking(docRef);
    toast({ title: 'BM removida!', description: `A BM "${bm.name}" foi removida.` });
  }

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title="Business Managers (BMs)"
        description="Gerencie as BMs disponíveis para as campanhas de anúncios."
      >
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="gap-1">
              <PlusCircle className="h-4 w-4" />
              Criar BM
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[425px]">
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)}>
                <DialogHeader>
                  <DialogTitle>Nova BM</DialogTitle>
                  <DialogDescription>
                    Adicione uma nova BM para vincular às suas campanhas.
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
                          <Input {...field} placeholder="Ex: BM Clientes" className="col-span-3" />
                        </FormControl>
                        <FormMessage className="col-start-2 col-span-3" />
                      </FormItem>
                    )}
                  />
                </div>
                <DialogFooter>
                  <Button type="submit">Salvar BM</Button>
                </DialogFooter>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </PageHeader>
      <main className="flex-1 overflow-auto p-4 md:p-6">
        <Card>
          <CardHeader>
            <CardTitle>BMs Cadastradas</CardTitle>
            <CardDescription>
              Lista de todas as BMs configuradas para vincular aos anúncios.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading && (
                  <TableRow>
                    <TableCell colSpan={2} className="text-center">Carregando...</TableCell>
                  </TableRow>
                )}
                {!isLoading && bms?.map((bm) => (
                  <TableRow key={bm.id}>
                    <TableCell className="font-medium">{bm.name}</TableCell>
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
                                Essa ação não pode ser desfeita. Isso removerá permanentemente a BM.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancelar</AlertDialogCancel>
                              <AlertDialogAction onClick={() => handleDelete(bm)}>Continuar</AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                    </TableCell>
                  </TableRow>
                ))}
                 {!isLoading && bms?.length === 0 && (
                    <TableRow>
                        <TableCell colSpan={2} className="text-center">Nenhuma BM encontrada.</TableCell>
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
