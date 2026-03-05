
'use client';

import { useState, useMemo } from 'react';
import { PlusCircle, ShoppingCart, User, Phone, CheckCircle, XCircle, Trash2, Search, RefreshCw } from 'lucide-react';
import { collection, query, orderBy, doc, where, serverTimestamp } from 'firebase/firestore';
import { format } from 'date-fns';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';

import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
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
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Badge } from '@/components/ui/badge';
import { useFirebase, useUser, useCollection, useMemoFirebase, useDoc, addDocumentNonBlocking, setDocumentNonBlocking, deleteDocumentNonBlocking } from '@/firebase';
import type { Lead, Subscription, Settings } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';

const leadSchema = z.object({
  phone: z.string().min(1, 'Número é obrigatório'),
  interestedSubscription: z.string().min(1, 'Selecione uma assinatura'),
});

function LeadForm({ onFinished }: { onFinished: () => void }) {
  const { firestore, user } = useFirebase();
  const { toast } = useToast();

  const subscriptionsQuery = useMemoFirebase(() => {
    if (!user) return null;
    return query(collection(firestore, 'users', user.uid, 'subscriptions'), orderBy('name'));
  }, [firestore, user]);
  const { data: subscriptions } = useCollection<Subscription>(subscriptionsQuery);

  const settingsDocRef = useMemoFirebase(() => {
    if (!user) return null;
    return doc(firestore, 'users', user.uid, 'settings', 'config');
  }, [firestore, user]);
  const { data: settings } = useDoc<Settings>(settingsDocRef);

  const form = useForm<z.infer<typeof leadSchema>>({
    resolver: zodResolver(leadSchema),
    defaultValues: { phone: '', interestedSubscription: '' },
  });

  const onSubmit = async (values: z.infer<typeof leadSchema>) => {
    if (!user) return;

    const leadData = {
      userId: user.uid,
      name: values.phone, // Usamos o telefone como nome já que o campo foi removido
      phone: values.phone,
      interestedSubscription: values.interestedSubscription,
      status: 'pending',
      createdAt: serverTimestamp(),
    };

    await addDocumentNonBlocking(collection(firestore, 'users', user.uid, 'leads'), leadData);
    toast({ title: "Interessado Adicionado!", description: `O lead ${values.phone} foi cadastrado.` });

    // Send Initial Message
    if (settings?.isLeadAutomationActive && settings.leadInitialMessage && settings.webhookToken) {
        let formattedMessage = settings.leadInitialMessage
            .replace(/{cliente}/g, values.phone)
            .replace(/{telefone}/g, values.phone)
            .replace(/{assinatura_interesse}/g, values.interestedSubscription);

        try {
            fetch('/api/send-message', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    message: formattedMessage,
                    phoneNumber: values.phone,
                    token: settings.webhookToken,
                }),
            });
        } catch (e) { console.error(e); }
    }

    onFinished();
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 pt-4">
        <FormField control={form.control} name="phone" render={({ field }) => ( <FormItem><FormLabel>WhatsApp (DDD + Número)</FormLabel><FormControl><Input placeholder="Ex: 5511999998888" {...field} /></FormControl><FormMessage /></FormItem>)} />
        <FormField
          control={form.control}
          name="interestedSubscription"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Assinatura de Interesse</FormLabel>
              <Select onValueChange={field.onChange} defaultValue={field.value}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder="Qual plano deseja comprar?" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {subscriptions?.map((sub) => (
                    <SelectItem key={sub.id} value={sub.name}>{sub.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />
        <DialogFooter className="pt-4">
          <Button type="submit" className="w-full">Cadastrar e Iniciar Atendimento</Button>
        </DialogFooter>
      </form>
    </Form>
  )
}

export default function WantsToBuyPage() {
  const { firestore, user } = useFirebase();
  const { toast } = useToast();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  const settingsDocRef = useMemoFirebase(() => {
    if (!user) return null;
    return doc(firestore, 'users', user.uid, 'settings', 'config');
  }, [firestore, user]);
  const { data: settings } = useDoc<Settings>(settingsDocRef);

  const leadsQuery = useMemoFirebase(() => {
    if (!user) return null;
    return query(collection(firestore, 'users', user.uid, 'leads'), where('status', '==', 'pending'));
  }, [firestore, user]);

  const { data: leads, isLoading } = useCollection<Lead>(leadsQuery);

  const filteredLeads = useMemo(() => {
    if (!leads) return [];
    
    return [...leads]
      .filter(l => 
        l.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
        l.phone.includes(searchTerm)
      )
      .sort((a, b) => {
        const dateA = a.createdAt?.toMillis() || 0;
        const dateB = b.createdAt?.toMillis() || 0;
        return dateB - dateA;
      });
  }, [leads, searchTerm]);

  const handleAction = async (lead: Lead, action: 'comprou' | 'nao-comprou') => {
    if (!user || !settings) return;
    const docRef = doc(firestore, 'users', user.uid, 'leads', lead.id);
    const newStatus = action === 'comprou' ? 'converted' : 'lost';
    
    setDocumentNonBlocking(docRef, { status: newStatus }, { merge: true });
    
    toast({
        title: action === 'comprou' ? "Venda Realizada!" : "Venda Cancelada",
        description: `O status de ${lead.phone} foi atualizado.`,
    });

    // Send automated message
    const messageTemplate = action === 'comprou' ? settings.leadConvertedMessage : settings.leadLostMessage;
    
    if (settings.isLeadAutomationActive && settings.webhookToken && messageTemplate) {
        let formattedMessage = messageTemplate
            .replace(/{cliente}/g, lead.name)
            .replace(/{telefone}/g, lead.phone)
            .replace(/{assinatura_interesse}/g, lead.interestedSubscription);

        try {
            await fetch('/api/send-message', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    message: formattedMessage,
                    phoneNumber: lead.phone,
                    token: settings.webhookToken,
                }),
            });
        } catch (e) { console.error(e); }
    }
  };

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title="Quer Comprar (Leads)"
        description="Gerencie as pessoas interessadas que ainda não são clientes."
      >
        <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              type="search"
              placeholder="Pesquisar..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full rounded-lg bg-background pl-8 md:w-[200px] lg:w-[320px]"
            />
        </div>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
                <Button size="sm" className="gap-1 bg-blue-600 hover:bg-blue-700">
                    <PlusCircle className="h-4 w-4" />
                    Adicionar Interessado
                </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>Novo Interessado</DialogTitle>
                    <DialogDescription>Cadastre um novo lead e inicie a conversa automática.</DialogDescription>
                </DialogHeader>
                <LeadForm onFinished={() => setIsDialogOpen(false)} />
            </DialogContent>
        </Dialog>
      </PageHeader>
      <main className="flex-1 overflow-auto p-4 md:p-6">
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>WhatsApp</TableHead>
                  <TableHead>Interesse</TableHead>
                  <TableHead>Data</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow><TableCell colSpan={4} className="h-24 text-center">Carregando...</TableCell></TableRow>
                ) : filteredLeads.length > 0 ? (
                  filteredLeads.map((lead) => (
                    <TableRow key={lead.id}>
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2">
                            <Phone className="h-4 w-4 text-muted-foreground" />
                            {lead.phone}
                        </div>
                      </TableCell>
                      <TableCell><Badge variant="outline" className="bg-blue-50">{lead.interestedSubscription}</Badge></TableCell>
                      <TableCell className="text-muted-foreground text-xs">{lead.createdAt ? format(lead.createdAt.toDate(), 'dd/MM/yy HH:mm') : '-'}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2">
                            <Button 
                                variant="outline" 
                                size="sm" 
                                className="text-green-600 border-green-200 hover:bg-green-50"
                                onClick={() => handleAction(lead, 'comprou')}
                            >
                                <CheckCircle className="h-4 w-4 mr-1" />
                                Comprou
                            </Button>
                            <Button 
                                variant="outline" 
                                size="sm" 
                                className="text-destructive border-destructive/20 hover:bg-destructive/5"
                                onClick={() => handleAction(lead, 'nao-comprou')}
                            >
                                <XCircle className="h-4 w-4 mr-1" />
                                Não Comprou
                            </Button>
                            <AlertDialog>
                                <AlertDialogTrigger asChild>
                                    <Button variant="ghost" size="icon">
                                        <Trash2 className="h-4 w-4 text-muted-foreground" />
                                    </Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                    <AlertDialogHeader>
                                        <AlertDialogTitle>Excluir Lead?</AlertDialogTitle>
                                        <AlertDialogDescription>Essa ação removerá o interessado sem enviar mensagens de retorno.</AlertDialogDescription>
                                    </AlertDialogHeader>
                                    <AlertDialogFooter>
                                        <AlertDialogCancel>Voltar</AlertDialogCancel>
                                        <AlertDialogAction onClick={() => deleteDocumentNonBlocking(doc(firestore, 'users', user!.uid, 'leads', lead.id))}>Excluir</AlertDialogAction>
                                    </AlertDialogFooter>
                                </AlertDialogContent>
                            </AlertDialog>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow><TableCell colSpan={4} className="h-24 text-center text-muted-foreground">Nenhum interessado pendente.</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
