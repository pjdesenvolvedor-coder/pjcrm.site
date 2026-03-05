
'use client';

import { useState, useMemo, type ReactNode, useEffect } from 'react';
import { PlusCircle, MoreHorizontal, ArrowUpDown, CalendarIcon, MessageSquare, Trash2, User, Phone, Mail, CheckCircle2, ShoppingCart, CalendarDays, Banknote, Wallet, FilePenLine, RefreshCw, X, Eye, LifeBuoy, Plus, ArrowUp, ArrowDown, Search, Key, Monitor, Clock } from 'lucide-react';
import { add, format } from 'date-fns';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { collection, Timestamp, doc, query, orderBy, serverTimestamp } from 'firebase/firestore';

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
import { cn } from '@/lib/utils';
import { useFirebase, useUser, setDocumentNonBlocking, deleteDocumentNonBlocking, useDoc, addDocumentNonBlocking, useCollection, useMemoFirebase } from '@/firebase';
import type { Client, Settings, Subscription } from '@/lib/types';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import Image from 'next/image';
import { Tooltip, TooltipProvider, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { ScrollArea } from '@/components/ui/scroll-area';

const clientTypes = ["PACOTE", "REVENDA"] as const;
const paymentMethods = ["PIX", "Cartão", "Boleto"] as const;
const screenOptions = ["1", "2", "3", "4", "5", "6", "7"] as const;

const clientSchema = z.object({
  name: z.string().min(1, 'Nome é obrigatório'),
  telegramUser: z.string().optional(),
  phone: z.string().min(1, 'Número é obrigatório'),
  clientType: z.enum(clientTypes).optional(),
  emails: z.array(z.object({ value: z.string().email('Email inválido') })).min(1, { message: 'Pelo menos um email é obrigatório.'}),
  password: z.string().optional(),
  screen: z.string().optional(),
  dueDate: z.string().optional(),
  dueTimeHour: z.string().optional(),
  dueTimeMinute: z.string().optional(),
  notes: z.string().optional(),
  quantity: z.string().optional(),
  subscription: z.string().min(1, 'Assinatura é obrigatória'),
  paymentMethod: z.enum(paymentMethods).optional(),
  amountPaid: z.string().optional(),
});

function ClientForm({ initialData, onFinished }: { initialData?: Partial<Client>, onFinished: () => void }) {
  const { firestore, effectiveUserId } = useFirebase();
  const { toast } = useToast();
  const isEditing = !!initialData?.id;

  const subscriptionsQuery = useMemoFirebase(() => {
    if (!effectiveUserId) return null;
    return query(collection(firestore, 'users', effectiveUserId, 'subscriptions'), orderBy('name'));
  }, [firestore, effectiveUserId]);
  const { data: subscriptions } = useCollection<Subscription>(subscriptionsQuery);

  const settingsDocRef = useMemoFirebase(() => {
    if (!effectiveUserId) return null;
    return doc(firestore, 'users', effectiveUserId, 'settings', 'config');
  }, [firestore, effectiveUserId]);
  const { data: settings } = useDoc<Settings>(settingsDocRef);


  const defaultEmails = useMemo(() => {
    if (initialData?.email) {
      return Array.isArray(initialData.email) ? initialData.email.map(e => ({ value: e })) : [{ value: initialData.email }];
    }
    return [{ value: '' }];
  }, [initialData]);

  const form = useForm<z.infer<typeof clientSchema>>({
    resolver: zodResolver(clientSchema),
    defaultValues: {
      name: initialData?.name || '',
      telegramUser: initialData?.telegramUser || '',
      phone: initialData?.phone || '',
      clientType: initialData?.clientType || undefined,
      emails: defaultEmails,
      password: initialData?.password || '',
      screen: initialData?.screen || '',
      dueDate: initialData?.dueDate ? format((initialData.dueDate as any).toDate(), 'dd/MM/yy') : '',
      dueTimeHour: initialData?.dueDate ? format((initialData.dueDate as any).toDate(), 'HH') : '',
      dueTimeMinute: initialData?.dueDate ? format((initialData.dueDate as any).toDate(), 'mm') : '',
      notes: initialData?.notes || '',
      quantity: defaultEmails.length.toString(),
      subscription: initialData?.subscription || '',
      paymentMethod: initialData?.paymentMethod || undefined,
      amountPaid: initialData?.amountPaid || ''
    },
  });

  const { fields, append, remove } = useFieldArray({ control: form.control, name: 'emails' });
  const clientType = form.watch('clientType');

  useEffect(() => {
    if (!isEditing && settings !== undefined) {
      if (settings?.usePresetTime && settings.presetHour && settings.presetMinute) {
          form.setValue('dueTimeHour', settings.presetHour);
          form.setValue('dueTimeMinute', settings.presetMinute);
      } else {
          const now = new Date();
          form.setValue('dueTimeHour', now.getHours().toString().padStart(2, '0'));
          form.setValue('dueTimeMinute', now.getMinutes().toString().padStart(2, '0'));
      }
    }
  }, [isEditing, settings]);
  
  useEffect(() => {
    form.setValue('quantity', fields.length.toString());
  }, [fields, form]);

  const handleDateInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let value = e.target.value.replace(/\D/g, '');
    if (value.length > 6) value = value.slice(0, 6);
    let formatted = value;
    if (value.length > 2) formatted = `${value.slice(0, 2)}/${value.slice(2)}`;
    if (value.length > 4) formatted = `${value.slice(0, 2)}/${value.slice(2, 4)}/${value.slice(4)}`;
    form.setValue('dueDate', formatted);
  };

  const onSubmit = async (values: z.infer<typeof clientSchema>) => {
    if (!effectiveUserId) return;
    
    let dueDateTimestamp: Timestamp | undefined = undefined;
    if (values.dueDate && values.dueDate.length === 8) {
        const [day, month, year] = values.dueDate.split('/');
        const date = new Date(parseInt(year, 10) + 2000, parseInt(month, 10) - 1, parseInt(day, 10));
        if (!isNaN(date.getTime())) {
            date.setHours(parseInt(values.dueTimeHour || '0', 10), parseInt(values.dueTimeMinute || '0', 10));
            dueDateTimestamp = Timestamp.fromDate(date);
        }
    }

    const clientData: any = {
      userId: effectiveUserId,
      name: values.name,
      email: values.emails.map(email => email.value),
      phone: values.phone,
      password: values.clientType ? null : (values.password || null),
      screen: values.screen || null,
      telegramUser: values.telegramUser ?? null,
      clientType: values.clientType ?? null,
      dueDate: dueDateTimestamp ?? null,
      notes: values.notes ?? null,
      quantity: values.emails.length,
      subscription: values.subscription,
      paymentMethod: values.paymentMethod ?? null,
      amountPaid: values.amountPaid ?? null,
    };

    if (isEditing && initialData?.id) {
        const docRef = doc(firestore, 'users', effectiveUserId, 'clients', initialData.id);
        let newStatus = (initialData as Client)?.status || 'Ativo';
        if (newStatus !== 'Inativo') {
            newStatus = (dueDateTimestamp && dueDateTimestamp.toDate() > new Date()) ? 'Ativo' : (dueDateTimestamp ? 'Vencido' : 'Ativo');
        }
        setDocumentNonBlocking(docRef, { ...clientData, status: newStatus, needsSupport: (initialData as Client)?.needsSupport || false }, { merge: true });
        toast({ title: "Cliente atualizado!" });
    } else {
        const newStatus = (dueDateTimestamp && dueDateTimestamp.toDate() <= new Date()) ? 'Vencido' : 'Ativo';
        await addDocumentNonBlocking(collection(firestore, 'users', effectiveUserId, 'clients'), { 
            ...clientData, status: newStatus, needsSupport: false, createdAt: serverTimestamp(), upsellSent: false
        });
        toast({ title: "Cliente adicionado!" });

        if (settings?.isDeliveryAutomationActive && settings.deliveryMessage && settings.webhookToken) {
            let formattedMessage = settings.deliveryMessage
                .replace(/{cliente}/g, values.name).replace(/{telefone}/g, values.phone)
                .replace(/{email}/g, values.emails.map(e => e.value).join(', '))
                .replace(/{senha}/g, values.password || 'N/A').replace(/{tela}/g, values.screen || 'N/A')
                .replace(/{assinatura}/g, values.subscription)
                .replace(/{vencimento}/g, dueDateTimestamp ? format(dueDateTimestamp.toDate(), 'dd/MM/yyyy') : 'N/A')
                .replace(/{valor}/g, values.amountPaid || '0,00').replace(/{status}/g, newStatus);

            fetch('/api/send-message', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ message: formattedMessage, phoneNumber: values.phone, token: settings.webhookToken }),
            }).catch(console.error);
        }
    }
    onFinished();
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)}>
        <Tabs defaultValue="dados" className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="dados">Dados</TabsTrigger>
            <TabsTrigger value="vencimento">Vencimento</TabsTrigger>
            <TabsTrigger value="pagamento">Pagamento</TabsTrigger>
          </TabsList>
          <TabsContent value="dados" className="py-6 space-y-4">
                <FormField control={form.control} name="name" render={({ field }) => ( <FormItem className="grid grid-cols-1 md:grid-cols-4 md:items-center gap-4"><FormLabel className="md:text-right">Nome *</FormLabel><FormControl><Input placeholder="Nome" {...field} className="md:col-span-3" /></FormControl><FormMessage className="md:col-start-2 md:col-span-3" /></FormItem>)} />
                <FormField control={form.control} name="phone" render={({ field }) => ( <FormItem className="grid grid-cols-1 md:grid-cols-4 md:items-center gap-4"><FormLabel className="md:text-right">Número *</FormLabel><FormControl><Input placeholder="WhatsApp" {...field} className="md:col-span-3" /></FormControl><FormMessage className="md:col-start-2 md:col-span-3" /></FormItem>)} />
                <div className="grid grid-cols-1 md:grid-cols-4 md:items-start gap-4">
                    <FormLabel className="md:text-right md:pt-2">Emails *</FormLabel>
                    <div className="md:col-span-3 space-y-2">
                        {!clientType ? (
                             <FormField control={form.control} name="emails.0.value" render={({ field }) => ( <FormItem><FormControl><Input type="email" placeholder="email@exemplo.com" {...field} /></FormControl><FormMessage /></FormItem> )} />
                        ) : (
                            <>
                                <ScrollArea className="h-40 w-full rounded-md border p-4 space-y-2">
                                    {fields.map((item, index) => (
                                        <FormField key={item.id} control={form.control} name={`emails.${index}.value`} render={({ field }) => (
                                            <FormItem><div className="flex items-center gap-2"><FormControl><Input type="email" placeholder="email" {...field} /></FormControl>{fields.length > 1 && <Button type="button" variant="ghost" size="icon" onClick={() => remove(index)}><X className="h-4 w-4" /></Button>}</div><FormMessage /></FormItem>
                                        )}/>
                                    ))}
                                </ScrollArea>
                                <Button type="button" variant="outline" size="sm" onClick={() => append({ value: '' })}><Plus className="mr-2 h-4 w-4" />Adicionar Email</Button>
                            </>
                        )}
                    </div>
                </div>
                {!clientType && (
                  <>
                    <FormField control={form.control} name="password" render={({ field }) => (
                        <FormItem className="grid grid-cols-1 md:grid-cols-4 md:items-center gap-4"><FormLabel className="md:text-right">Senha</FormLabel><FormControl><div className="relative md:col-span-3"><Key className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" /><Input placeholder="Senha" {...field} className="pl-9" /></div></FormControl><FormMessage className="md:col-start-2 md:col-span-3" /></FormItem>
                    )}/>
                    <FormField control={form.control} name="screen" render={({ field }) => (
                        <FormItem className="grid grid-cols-1 md:grid-cols-4 md:items-center gap-4"><FormLabel className="md:text-right">Tela</FormLabel><Select onValueChange={field.onChange} defaultValue={field.value}><FormControl><SelectTrigger className="md:col-span-3"><div className="flex items-center gap-2"><Monitor className="h-4 w-4 text-muted-foreground" /><SelectValue placeholder="Tela" /></div></SelectTrigger></FormControl><SelectContent>{screenOptions.map(o => <SelectItem key={o} value={o}>Tela {o}</SelectItem>)}</SelectContent></Select></FormItem>
                    )}/>
                  </>
                )}
          </TabsContent>
          <TabsContent value="vencimento" className="py-6 space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-4 md:items-center gap-4"><Label className="md:text-right">Definir</Label><div className="md:col-span-3 flex gap-2"><Button type="button" variant="outline" size="sm" onClick={() => form.setValue('dueDate', format(add(new Date(), { days: 15 }), 'dd/MM/yy'))}>15 dias</Button><Button type="button" variant="outline" size="sm" onClick={() => form.setValue('dueDate', format(add(new Date(), { months: 1 }), 'dd/MM/yy'))}>1 mês</Button></div></div>
                <FormField control={form.control} name="dueDate" render={({ field }) => ( <FormItem className="grid grid-cols-1 md:grid-cols-4 md:items-center gap-4"><FormLabel className="md:text-right">Data</FormLabel><div className='md:col-span-3'><div className="relative"><CalendarIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" /><FormControl><Input placeholder="dd/mm/aa" {...field} onChange={handleDateInputChange} className="pl-9" /></FormControl></div></div></FormItem> )} />
                
                <div className="grid grid-cols-1 md:grid-cols-4 md:items-center gap-4">
                    <FormLabel className="md:text-right">Horário</FormLabel>
                    <div className="md:col-span-3 flex items-center gap-2">
                        <div className="relative flex-1">
                            <Clock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                            <FormField
                                control={form.control}
                                name="dueTimeHour"
                                render={({ field }) => (
                                    <FormControl>
                                        <Input {...field} placeholder="HH" className="pl-9 text-center" maxLength={2} />
                                    </FormControl>
                                )}
                            />
                        </div>
                        <span className="font-bold text-lg">:</span>
                        <div className="relative flex-1">
                            <FormField
                                control={form.control}
                                name="dueTimeMinute"
                                render={({ field }) => (
                                    <FormControl>
                                        <Input {...field} placeholder="MM" className="text-center" maxLength={2} />
                                    </FormControl>
                                )}
                            />
                        </div>
                    </div>
                </div>

                <FormField control={form.control} name="notes" render={({ field }) => ( <FormItem className="grid grid-cols-1 md:grid-cols-4 md:items-start gap-4"><FormLabel className="md:text-right md:pt-2">Notas</FormLabel><FormControl><Textarea placeholder="Obs..." className="md:col-span-3" {...field} /></FormControl></FormItem> )} />
          </TabsContent>
          <TabsContent value="pagamento" className="py-6 space-y-4">
                <FormField control={form.control} name="subscription" render={({ field }) => ( <FormItem className="grid grid-cols-1 md:grid-cols-4 md:items-center gap-4"><FormLabel className="md:text-right">Plano *</FormLabel><Select onValueChange={(v) => { field.onChange(v); const s = subscriptions?.find(x => x.name === v); if (s) form.setValue('amountPaid', s.value); }} defaultValue={field.value}><FormControl><SelectTrigger className="md:col-span-3"><SelectValue placeholder="Selecione" /></SelectTrigger></FormControl><SelectContent>{subscriptions?.map(s => <SelectItem key={s.id} value={s.name}>{s.name}</SelectItem>)}</SelectContent></FormItem> )} />
                <FormField control={form.control} name="amountPaid" render={({ field }) => ( <FormItem className="grid grid-cols-1 md:grid-cols-4 md:items-center gap-4"><FormLabel className="md:text-right">Valor</FormLabel><div className="relative md:col-span-3"><span className="absolute inset-y-0 left-0 flex items-center pl-3 text-muted-foreground">R$</span><FormControl><Input {...field} placeholder="0,00" className="pl-9" /></FormControl></div></FormItem> )} />
          </TabsContent>
        </Tabs>
        <DialogFooter className='pt-4'><Button variant="ghost" type="button" onClick={onFinished}>Cancelar</Button><Button type="submit">{isEditing ? 'Salvar' : 'Cadastrar'}</Button></DialogFooter>
      </form>
    </Form>
  )
}

export default function CustomersPage() {
  const { firestore, effectiveUserId } = useFirebase();
  const { toast } = useToast();
  const [dialogState, setDialogState] = useState<any>({ view: 'closed' });
  const [searchTerm, setSearchTerm] = useState('');
  const [sortConfig, setSortConfig] = useState<any>({ key: 'name', direction: 'ascending' });
  
  const settingsDocRef = useMemoFirebase(() => (effectiveUserId ? doc(firestore, 'users', effectiveUserId, 'settings', 'config') : null), [firestore, effectiveUserId]);
  const { data: settings } = useDoc<Settings>(settingsDocRef);

  const clientsQuery = useMemoFirebase(() => (effectiveUserId ? collection(firestore, 'users', effectiveUserId, 'clients') : null), [firestore, effectiveUserId]);
  const { data: clients, isLoading } = useCollection<Client>(clientsQuery);

  const filteredClients = useMemo(() => {
    if (!clients) return [];
    let items = clients.filter(c => c.name.toLowerCase().includes(searchTerm.toLowerCase()) || c.phone.includes(searchTerm));
    if (sortConfig) {
        items.sort((a: any, b: any) => {
            const aV = a[sortConfig.key];
            const bV = b[sortConfig.key];
            if (aV < bV) return sortConfig.direction === 'ascending' ? -1 : 1;
            if (aV > bV) return sortConfig.direction === 'ascending' ? 1 : -1;
            return 0;
        });
    }
    return items;
  }, [clients, searchTerm, sortConfig]);

  const handleToggleSupport = (client: Client) => {
    if (!effectiveUserId) return;
    const ref = doc(firestore, 'users', effectiveUserId, 'clients', client.id);
    setDocumentNonBlocking(ref, { needsSupport: !client.needsSupport }, { merge: true });
    toast({ title: `Suporte ${!client.needsSupport ? 'marcado' : 'desmarcado'}` });
  };

  return (
    <div className="flex flex-col h-full">
      <PageHeader title="Todos os Clientes">
        <div className="relative"><Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" /><Input placeholder="Pesquisar..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="pl-8 md:w-[320px]" /></div>
        <Button size="sm" onClick={() => setDialogState({ view: 'add' })}><PlusCircle className="h-4 w-4 mr-1" />Adicionar</Button>
      </PageHeader>
      <main className="flex-1 overflow-auto p-4 md:p-6">
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>Plano</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Vencimento</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={5} className="text-center">Carregando...</TableCell></TableRow>
              ) : filteredClients.map((client) => (
                <TableRow key={client.id} className={cn(client.needsSupport && "bg-primary/5")}>
                    <TableCell><div className='flex items-center gap-2'>{client.needsSupport && <LifeBuoy className="h-4 w-4 text-primary" />}{client.name}</div></TableCell>
                    <TableCell><Badge variant="outline" className="font-normal">{client.subscription || '-'}</Badge></TableCell>
                    <TableCell><Badge variant={client.status === 'Ativo' ? 'default' : 'destructive'} className={cn(client.status === 'Ativo' && 'bg-green-500/20 text-green-700')}>{client.status}</Badge></TableCell>
                    <TableCell>{client.dueDate ? format((client.dueDate as any).toDate(), 'dd/MM/yyyy') : '-'}</TableCell>
                    <TableCell className="text-right space-x-1">
                        <Button variant="outline" size="sm" onClick={() => setDialogState({ view: 'edit', client })}>Editar</Button>
                        <Button variant="ghost" size="icon" onClick={() => handleToggleSupport(client)}><LifeBuoy className={cn("h-4 w-4", client.needsSupport && "text-primary fill-primary/20")} /></Button>
                        <AlertDialog>
                            <AlertDialogTrigger asChild><Button variant="ghost" size="icon" className="text-destructive"><Trash2 className="h-4 w-4" /></Button></AlertDialogTrigger><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Excluir Cliente?</AlertDialogTitle></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Não</AlertDialogCancel><AlertDialogAction onClick={() => deleteDocumentNonBlocking(doc(firestore, 'users', effectiveUserId!, 'clients', client.id))}>Sim</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
                    </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      </main>
      <Dialog open={dialogState.view !== 'closed'} onOpenChange={(o) => !o && setDialogState({ view: 'closed' })}>
        <DialogContent className="sm:max-w-lg">
            <DialogHeader><DialogTitle>{dialogState.view === 'add' ? 'Novo Cliente' : 'Editar Cliente'}</DialogTitle></DialogHeader>
            <ClientForm initialData={dialogState.client} onFinished={() => setDialogState({ view: 'closed' })} />
        </DialogContent>
      </Dialog>
    </div>
  );
}
