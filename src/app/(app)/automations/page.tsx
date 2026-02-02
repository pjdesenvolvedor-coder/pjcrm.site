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
import { useCollection, useFirebase, useUser, useMemoFirebase } from '@/firebase';
import { addDocumentNonBlocking } from '@/firebase/non-blocking-updates';
import { collection } from 'firebase/firestore';
import type { AutomatedMessageWorkflow } from '@/lib/types';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';

const automationSchema = z.object({
  name: z.string().min(1, 'Nome é obrigatório'),
  trigger: z.string().min(1, 'Gatilho é obrigatório'),
});

export default function AutomationsPage() {
  const { firestore } = useFirebase();
  const { user } = useUser();
  const [open, setOpen] = useState(false);

  const automationsQuery = useMemoFirebase(() => {
    if (!user) return null;
    return collection(firestore, 'users', user.uid, 'automated_message_workflows');
  }, [firestore, user]);

  const { data: automations, isLoading } = useCollection<AutomatedMessageWorkflow>(automationsQuery);

  const form = useForm<z.infer<typeof automationSchema>>({
    resolver: zodResolver(automationSchema),
    defaultValues: {
      name: '',
      trigger: '',
    },
  });

  const onSubmit = (values: z.infer<typeof automationSchema>) => {
    if (!user) return;
    const newAutomation = {
      ...values,
      userId: user.uid,
      status: 'Active',
    };
    addDocumentNonBlocking(collection(firestore, 'users', user.uid, 'automated_message_workflows'), newAutomation);
    form.reset();
    setOpen(false);
  };


  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title="Automações de Mensagens"
        description="Crie e gerencie fluxos de mensagens automáticas."
      >
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="gap-1">
              <PlusCircle className="h-4 w-4" />
              Criar Automação
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[425px]">
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)}>
                <DialogHeader>
                  <DialogTitle>Nova Automação</DialogTitle>
                  <DialogDescription>
                    Configure um novo fluxo de automação para seus clientes.
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
                    name="trigger"
                    render={({ field }) => (
                      <FormItem className="grid grid-cols-4 items-center gap-4">
                        <FormLabel className="text-right">Gatilho</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                          <FormControl>
                            <SelectTrigger className="col-span-3">
                              <SelectValue placeholder="Selecione um gatilho" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="new-customer">Novo Cliente</SelectItem>
                            <SelectItem value="ticket-closed">Ticket Fechado</SelectItem>
                            <SelectItem value="inactive-customer">Cliente Inativo</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage className="col-start-2 col-span-3" />
                      </FormItem>
                    )}
                  />
                </div>
                <DialogFooter>
                  <Button type="submit">Salvar Automação</Button>
                </DialogFooter>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </PageHeader>
      <main className="flex-1 overflow-auto p-4 md:p-6">
        <Card>
          <CardHeader>
            <CardTitle>Automações Ativas</CardTitle>
            <CardDescription>
              Lista de todas as automações configuradas na sua conta.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>Gatilho</TableHead>
                  <TableHead>Status</TableHead>
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
                {!isLoading && automations?.map((automation) => (
                  <TableRow key={automation.id}>
                    <TableCell className="font-medium">{automation.name}</TableCell>
                    <TableCell>{automation.trigger}</TableCell>
                    <TableCell>
                      <Badge variant={automation.status === 'Active' ? 'default' : 'secondary'} className={automation.status === 'Active' ? 'bg-green-500/20 text-green-700 hover:bg-green-500/30' : ''}>
                        {automation.status === 'Active' ? 'Ativo' : 'Inativo'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Button variant="ghost" size="sm">Editar</Button>
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

    