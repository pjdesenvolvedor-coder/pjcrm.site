'use client';

import { PlusCircle } from 'lucide-react';
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
import { Label } from "@/components/ui/label"
import { Textarea } from '@/components/ui/textarea';
import { useCollection, useFirebase, useUser, useMemoFirebase } from '@/firebase';
import { addDocumentNonBlocking } from '@/firebase/non-blocking-updates';
import { collection } from 'firebase/firestore';
import type { CustomerSegment } from '@/lib/types';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';

const segmentSchema = z.object({
  name: z.string().min(1, 'Nome é obrigatório'),
  criteria: z.string().min(1, 'Critérios são obrigatórios'),
});

export default function CustomersPage() {
  const { firestore } = useFirebase();
  const { user } = useUser();
  const [open, setOpen] = useState(false);

  const segmentsQuery = useMemoFirebase(() => {
    if (!user) return null;
    return collection(firestore, 'users', user.uid, 'customer_segments');
  }, [firestore, user]);

  const { data: segments, isLoading } = useCollection<CustomerSegment>(segmentsQuery);

  const form = useForm<z.infer<typeof segmentSchema>>({
    resolver: zodResolver(segmentSchema),
    defaultValues: {
      name: '',
      criteria: '',
    },
  });

  const onSubmit = (values: z.infer<typeof segmentSchema>) => {
    if (!user) return;
    const newSegment = {
      ...values,
      userId: user.uid,
      customerCount: 0, // Default value
    };
    addDocumentNonBlocking(collection(firestore, 'users', user.uid, 'customer_segments'), newSegment);
    form.reset();
    setOpen(false);
  };

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title="Segmentos de Clientes"
        description="Agrupe seus clientes com base em critérios personalizados."
      >
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="gap-1">
              <PlusCircle className="h-4 w-4" />
              Criar Segmento
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[425px]">
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)}>
                <DialogHeader>
                  <DialogTitle>Novo Segmento</DialogTitle>
                  <DialogDescription>
                    Defina um novo segmento de clientes.
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
                          <Input {...field} className="col-span-3" />
                        </FormControl>
                        <FormMessage className="col-start-2 col-span-3" />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="criteria"
                    render={({ field }) => (
                      <FormItem className="grid grid-cols-4 items-start gap-4">
                        <FormLabel className="text-right pt-2">Critérios</FormLabel>
                        <FormControl>
                          <Textarea {...field} className="col-span-3" />
                        </FormControl>
                        <FormMessage className="col-start-2 col-span-3" />
                      </FormItem>
                    )}
                  />
                </div>
                <DialogFooter>
                  <Button type="submit">Salvar Segmento</Button>
                </DialogFooter>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </PageHeader>
      <main className="flex-1 overflow-auto p-4 md:p-6">
        <Card>
          <CardHeader>
            <CardTitle>Segmentos Criados</CardTitle>
            <CardDescription>
              Gerencie seus segmentos de clientes.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome do Segmento</TableHead>
                  <TableHead>Critérios</TableHead>
                  <TableHead className="text-right">Nº de Clientes</TableHead>
                  <TableHead>
                    <span className="sr-only">Ações</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading && (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center">Carregando...</TableCell>
                  </TableRow>
                )}
                {!isLoading && segments?.map((segment) => (
                  <TableRow key={segment.id}>
                    <TableCell className="font-medium">{segment.name}</TableCell>
                    <TableCell>{segment.criteria}</TableCell>
                    <TableCell className="text-right">{segment.customerCount}</TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="sm">Ver Clientes</Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}

    