'use client';

import { useState, useMemo, type ReactNode, useEffect, useCallback } from 'react';
import { PlusCircle, MoreHorizontal, ArrowUpDown, CalendarIcon, MessageSquare, Trash2, User, Phone, Mail, CheckCircle2, ShoppingCart, CalendarDays, Banknote, Wallet, FilePenLine, RefreshCw, X, Eye, LifeBuoy, Plus } from 'lucide-react';
import { add, format } from 'date-fns';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { collection, Timestamp, doc, query, orderBy, limit, getDocs, startAfter, endBefore, limitToLast, type QueryDocumentSnapshot } from 'firebase/firestore';

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
const PAGE_SIZE = 15;

const clientSchema = z.object({
  name: z.string().min(1, 'Nome é obrigatório'),
  telegramUser: z.string().optional(),
  phone: z.string().min(1, 'Número é obrigatório'),
  clientType: z.enum(clientTypes).optional(),
  emails: z.array(z.object({ value: z.string().email('Email inválido') })).min(1, { message: 'Pelo menos um email é obrigatório.'}),
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
  const { firestore, user } = useFirebase();
  const { toast } = useToast();
  const isEditing = !!initialData?.id;

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
      clientType: initialData?.clientType,
      emails: defaultEmails,
      dueDate: initialData?.dueDate ? format((initialData.dueDate as any).toDate(), 'dd/MM/yy') : '',
      dueTimeHour: initialData?.dueDate ? format((initialData.dueDate as any).toDate(), 'HH') : '',
      dueTimeMinute: initialData?.dueDate ? format((initialData.dueDate as any).toDate(), 'mm') : '',
      notes: initialData?.notes || '',
      quantity: defaultEmails.length.toString(),
      subscription: initialData?.subscription || '',
      paymentMethod: initialData?.paymentMethod,
      amountPaid: initialData?.amountPaid || ''
    },
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: 'emails'
  });
  
  const clientType = form.watch('clientType');

  useEffect(() => {
    if (!isEditing && settings !== undefined) { // Wait for settings to be loaded (even if null)
      if (settings?.usePresetTime && settings.presetHour && settings.presetMinute) {
          form.setValue('dueTimeHour', settings.presetHour);
          form.setValue('dueTimeMinute', settings.presetMinute);
      } else {
          const now = new Date();
          form.setValue('dueTimeHour', now.getHours().toString().padStart(2, '0'));
          form.setValue('dueTimeMinute', now.getMinutes().toString().padStart(2, '0'));
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEditing, settings]);
  
  useEffect(() => {
    form.setValue('quantity', fields.length.toString());
  }, [fields, form]);

  const handleDateInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let value = e.target.value.replace(/\D/g, '');
    if (value.length > 6) value = value.slice(0, 6);
  
    let formatted = value;
    if (value.length > 2) {
      formatted = `${value.slice(0, 2)}/${value.slice(2)}`;
    }
    if (value.length > 4) {
      formatted = `${value.slice(0, 2)}/${value.slice(2, 4)}/${value.slice(4)}`;
    }
    
    form.setValue('dueDate', formatted);
  };

  const onSubmit = (values: z.infer<typeof clientSchema>) => {
    if (!user) return;
    
    let dueDateTimestamp: Timestamp | undefined = undefined;
    if (values.dueDate && values.dueDate.length === 8) {
        const [day, month, year] = values.dueDate.split('/');
        const date = new Date(parseInt(year, 10) + 2000, parseInt(month, 10) - 1, parseInt(day, 10));

        if (!isNaN(date.getTime())) {
            const hour = parseInt(values.dueTimeHour || '0', 10);
            const minute = parseInt(values.dueTimeMinute || '0', 10);
            date.setHours(hour, minute);
            dueDateTimestamp = Timestamp.fromDate(date);
        }
    }

    const clientData: Omit<Client, 'id' | 'status' | 'needsSupport'> = {
      userId: user.uid,
      name: values.name,
      email: values.emails.map(email => email.value),
      phone: values.phone,
      telegramUser: values.telegramUser,
      clientType: values.clientType,
      dueDate: dueDateTimestamp,
      notes: values.notes,
      quantity: values.emails.length,
      subscription: values.subscription,
      paymentMethod: values.paymentMethod,
      amountPaid: values.amountPaid,
    };

    if (isEditing && initialData?.id) {
        const docRef = doc(firestore, 'users', user.uid, 'clients', initialData.id);
        const currentStatus = (initialData as Client)?.status || 'Ativo';
        const currentSupportStatus = (initialData as Client)?.needsSupport || false;
        setDocumentNonBlocking(docRef, { ...clientData, status: currentStatus, needsSupport: currentSupportStatus }, { merge: true });
        toast({ title: "Cliente atualizado!", description: `${values.name} foi atualizado com sucesso.` });
    } else {
        addDocumentNonBlocking(collection(firestore, 'users', user.uid, 'clients'), { ...clientData, status: 'Ativo', needsSupport: false });
        toast({ title: "Cliente adicionado!", description: `${values.name} foi adicionado com sucesso.` });
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
          <TabsContent value="dados">
            <div className="space-y-4 py-6">
                <FormField control={form.control} name="name" render={({ field }) => ( <FormItem className="grid grid-cols-1 md:grid-cols-4 md:items-center gap-4"><FormLabel className="md:text-right">Nome *</FormLabel><FormControl><Input placeholder="Nome do Cliente" {...field} className="md:col-span-3" /></FormControl><FormMessage className="md:col-start-2 md:col-span-3" /></FormItem>)} />
                <FormField control={form.control} name="telegramUser" render={({ field }) => ( <FormItem className="grid grid-cols-1 md:grid-cols-4 md:items-center gap-4"><FormLabel className="md:text-right">Usuário Telegram</FormLabel><FormControl><Input placeholder="@usuario_telegram (opcional)" {...field} className="md:col-span-3" /></FormControl><FormMessage className="md:col-start-2 md:col-span-3" /></FormItem>)} />
                <FormField control={form.control} name="phone" render={({ field }) => ( <FormItem className="grid grid-cols-1 md:grid-cols-4 md:items-center gap-4"><FormLabel className="md:text-right">Número *</FormLabel><FormControl><Input placeholder="(00) 00000-0000" {...field} className="md:col-span-3" /></FormControl><FormMessage className="md:col-start-2 md:col-span-3" /></FormItem>)} />
                <FormField
                    control={form.control}
                    name="clientType"
                    render={({ field }) => (
                        <FormItem className="grid grid-cols-1 md:grid-cols-4 md:items-center gap-4">
                            <FormLabel className="md:text-right">Tipo</FormLabel>
                            <FormControl>
                                <div className="md:col-span-3 flex items-center gap-2">
                                    {clientTypes.map((type) => (
                                        <Button
                                            type="button"
                                            variant={field.value === type ? 'default' : 'outline'}
                                            key={type}
                                            onClick={() => field.onChange(field.value === type ? undefined : type)}
                                        >
                                            {type}
                                        </Button>
                                    ))}
                                </div>
                            </FormControl>
                            <FormMessage className="md:col-start-2 md:col-span-3" />
                        </FormItem>
                    )}
                />
                <div className="grid grid-cols-1 md:grid-cols-4 md:items-start gap-4">
                    <FormLabel className="md:text-right md:pt-2">Emails *</FormLabel>
                    <div className="md:col-span-3 space-y-2">
                        {!clientType ? (
                             <FormField
                                control={form.control}
                                name="emails.0.value"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormControl>
                                            <Input type="email" placeholder="email@exemplo.com" {...field} />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                        ) : (
                            <>
                                <ScrollArea className="h-40 w-full rounded-md border">
                                <div className="p-4 space-y-2">
                                    {fields.map((item, index) => (
                                        <FormField
                                            key={item.id}
                                            control={form.control}
                                            name={`emails.${index}.value`}
                                            render={({ field }) => (
                                                <FormItem>
                                                    <div className="flex items-center gap-2">
                                                        <FormControl>
                                                            <Input type="email" placeholder="email@exemplo.com" {...field} />
                                                        </FormControl>
                                                        {fields.length > 1 ? (
                                                            <Button type="button" variant="ghost" size="icon" onClick={() => remove(index)}>
                                                                <X className="h-4 w-4" />
                                                            </Button>
                                                        ) : null}
                                                    </div>
                                                    <FormMessage />
                                                </FormItem>
                                            )}
                                        />
                                    ))}
                                </div>
                                </ScrollArea>
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    onClick={() => append({ value: '' })}
                                >
                                    <Plus className="mr-2 h-4 w-4" />
                                    Adicionar Email
                                </Button>
                            </>
                        )}
                    </div>
                </div>
            </div>
          </TabsContent>
          <TabsContent value="vencimento">
            <div className="space-y-4 py-6">
                <div className="grid grid-cols-1 md:grid-cols-4 md:items-center gap-4"><Label className="md:text-right">Definir</Label><div className="md:col-span-3 flex gap-2"><Button type="button" variant="outline" size="sm" onClick={() => form.setValue('dueDate', format(add(new Date(), { days: 15 }), 'dd/MM/yy'))}>15 dias</Button><Button type="button" variant="outline" size="sm" onClick={() => form.setValue('dueDate', format(add(new Date(), { months: 1 }), 'dd/MM/yy'))}>1 mês</Button><Button type="button" variant="outline" size="sm" onClick={() => form.setValue('dueDate', format(add(new Date(), { months: 3 }), 'dd/MM/yy'))}>3 meses</Button></div></div>
                <FormField
                  control={form.control}
                  name="dueDate"
                  render={({ field }) => (
                      <FormItem className="grid grid-cols-1 md:grid-cols-4 md:items-center gap-4">
                        <FormLabel className="md:text-right">Data</FormLabel>
                        <div className='md:col-span-3'>
                           <div className="relative">
                            <CalendarIcon className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                            <FormControl>
                              <Input
                                placeholder="dd/mm/aa"
                                {...field}
                                onChange={handleDateInputChange}
                                value={field.value || ''}
                                className="pl-9"
                              />
                            </FormControl>
                          </div>
                        </div>
                        <FormMessage className="md:col-start-2 md:col-span-3" />
                      </FormItem>
                    )
                  }
                />
                <div className="grid grid-cols-1 md:grid-cols-4 md:items-center gap-4"><Label className="md:text-right">Horário</Label><div className="md:col-span-3 flex items-center gap-2"><FormField control={form.control} name="dueTimeHour" render={({ field }) => ( <FormItem><FormControl><Input {...field} className="w-20 text-center" /></FormControl></FormItem>)} /><span>:</span><FormField control={form.control} name="dueTimeMinute" render={({ field }) => ( <FormItem><FormControl><Input {...field} className="w-20 text-center" /></FormControl></FormItem>)} /></div></div>
                <FormField control={form.control} name="notes" render={({ field }) => ( <FormItem className="grid grid-cols-1 md:grid-cols-4 md:items-start gap-4"><FormLabel className="md:text-right md:pt-2">Notas</FormLabel><FormControl><Textarea placeholder="Adicione uma observação..." className="md:col-span-3 resize-none" {...field} /></FormControl><FormMessage className="md:col-start-2 md:col-span-3" /></FormItem>)} />
            </div>
          </TabsContent>
          <TabsContent value="pagamento">
            <div className="space-y-4 py-6">
                <FormField control={form.control} name="quantity" render={({ field }) => ( <FormItem className="grid grid-cols-1 md:grid-cols-4 md:items-center gap-4"><FormLabel className="md:text-right">Quantidade</FormLabel><FormControl><Input {...field} readOnly className="md:col-span-3 bg-muted" /></FormControl><FormMessage className="md:col-start-2 md:col-span-3" /></FormItem>)} />
                <FormField
                  control={form.control}
                  name="subscription"
                  render={({ field }) => (
                    <FormItem className="grid grid-cols-1 md:grid-cols-4 md:items-center gap-4">
                      <FormLabel className="md:text-right">Assinatura *</FormLabel>
                      <Select
                        onValueChange={(value) => {
                          field.onChange(value);
                          const selectedSub = subscriptions?.find(s => s.name === value);
                          if (selectedSub) {
                            form.setValue('amountPaid', selectedSub.value, { shouldValidate: true });
                          }
                        }}
                        defaultValue={field.value}
                      >
                        <FormControl>
                          <SelectTrigger className="md:col-span-3">
                            <SelectValue placeholder="Selecione uma assinatura" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {subscriptions?.map((sub) => (
                            <SelectItem key={sub.id} value={sub.name}>
                              {sub.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage className="md:col-start-2 md:col-span-3" />
                    </FormItem>
                  )}
                />
                <FormField control={form.control} name="paymentMethod" render={({ field }) => ( <FormItem className="grid grid-cols-1 md:grid-cols-4 md:items-center gap-4"><FormLabel className="md:text-right">Meio</FormLabel><FormControl><div className="md:col-span-3 flex items-center gap-2"><Button type="button" variant={field.value === 'PIX' ? 'default' : 'outline'} onClick={() => field.onChange('PIX')}>PIX</Button><Button type="button" variant={field.value === 'Cartão' ? 'default' : 'outline'} onClick={() => field.onChange('Cartão')}>Cartão</Button><Button type="button" variant={field.value === 'Boleto' ? 'default' : 'outline'} onClick={() => field.onChange('Boleto')}>Boleto</Button></div></FormControl><FormMessage className="md:col-start-2 md:col-span-3" /></FormItem>)} />
                <FormField
                  control={form.control}
                  name="amountPaid"
                  render={({ field }) => (
                    <FormItem className="grid grid-cols-1 md:grid-cols-4 md:items-center gap-4">
                      <FormLabel className="md:text-right">Valor Pago</FormLabel>
                      <div className="relative md:col-span-3">
                        <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-muted-foreground">
                          R$
                        </span>
                        <FormControl>
                          <Input {...field} placeholder="0,00" className="pl-9 w-full" />
                        </FormControl>
                      </div>
                      <FormMessage className="md:col-start-2 md:col-span-3" />
                    </FormItem>
                  )}
                />
            </div>
          </TabsContent>
        </Tabs>
        <DialogFooter className='pt-4'>
          <Button variant="ghost" type="button" onClick={onFinished}>Cancelar</Button>
          <Button type="submit">{isEditing ? 'Salvar Alterações' : 'Salvar Cliente'}</Button>
        </DialogFooter>
      </form>
    </Form>
  )
}

function SendMessageDialog({ client, onSend, onCancel, isSending }: { client: Client; onSend: (message: string) => void; onCancel: () => void; isSending: boolean; }) {
  const [message, setMessage] = useState('');
  return (
    <>
      <div className="py-4 space-y-2">
        <Label htmlFor="message">Mensagem</Label>
        <Textarea id="message" placeholder="Digite sua mensagem aqui..." value={message} onChange={(e) => setMessage(e.target.value)} className="min-h-[100px]" />
      </div>
      <DialogFooter>
        <Button variant="ghost" onClick={onCancel} disabled={isSending}>Cancelar</Button>
        <Button onClick={() => onSend(message)} disabled={!message.trim() || isSending}>
            {isSending ? (
                <>
                    <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                    Enviando...
                </>
            ) : (
                'Enviar Mensagem Agora'
            )}
        </Button>
      </DialogFooter>
    </>
  );
}

type DialogState =
  | { view: 'closed' }
  | { view: 'add' }
  | { view: 'edit'; client: Client }
  | { view: 'sendMessage'; client: Client };


export default function CustomersPage() {
  const { firestore, user } = useFirebase();
  const { toast } = useToast();

  const [clients, setClients] = useState<Client[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [pagination, setPagination] = useState<{
    first: QueryDocumentSnapshot | null;
    last: QueryDocumentSnapshot | null;
  }>({ first: null, last: null });
  const [hasPrevPage, setHasPrevPage] = useState(false);
  const [hasNextPage, setHasNextPage] = useState(false);

  const [dialogState, setDialogState] = useState<DialogState>({ view: 'closed' });
  const [isSending, setIsSending] = useState(false);
  
  const settingsDocRef = useMemo(() => {
    if (!user) return null;
    return doc(firestore, 'users', user.uid, 'settings', 'config');
  }, [firestore, user]);

  const { data: settings } = useDoc<Settings>(settingsDocRef);

  const fetchClients = useCallback(async (dir: 'next' | 'prev' | 'initial') => {
    setIsLoading(true);
    if (!user) {
      setIsLoading(false);
      return;
    }
  
    const clientsRef = collection(firestore, 'users', user.uid, 'clients');
    let q;
  
    if (dir === 'next' && pagination.last) {
      q = query(clientsRef, orderBy('name'), startAfter(pagination.last), limit(PAGE_SIZE));
    } else if (dir === 'prev' && pagination.first) {
      q = query(clientsRef, orderBy('name'), endBefore(pagination.first), limitToLast(PAGE_SIZE));
    } else {
      q = query(clientsRef, orderBy('name'), limit(PAGE_SIZE));
    }
  
    try {
      const querySnapshot = await getDocs(q);
      const fetchedClients = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Client));
      
      if (fetchedClients.length === 0) {
          if (dir === 'next') setHasNextPage(false);
          if (dir === 'prev') setHasPrevPage(false);
          setIsLoading(false);
          if(dir === 'initial') setClients([]);
          return;
      }
  
      setClients(fetchedClients);
      const first = querySnapshot.docs[0];
      const last = querySnapshot.docs[querySnapshot.docs.length - 1];
      setPagination({ first, last });
      
      const prevCheck = query(clientsRef, orderBy('name'), endBefore(first), limitToLast(1));
      const prevSnap = await getDocs(prevCheck);
      setHasPrevPage(!prevSnap.empty);
  
      const nextCheck = query(clientsRef, orderBy('name'), startAfter(last), limit(1));
      const nextSnap = await getDocs(nextCheck);
      setHasNextPage(!nextSnap.empty);
  
    } catch (error) {
      console.error("Error fetching clients:", error);
      toast({ variant: 'destructive', title: 'Erro ao buscar clientes' });
    } finally {
      setIsLoading(false);
    }
  }, [user, firestore, pagination.first, pagination.last, toast]);

  useEffect(() => {
    if (user) {
      fetchClients('initial');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const handleToggleSupport = (client: Client) => {
    if (!user) return;
    const newSupportStatus = !client.needsSupport;
    const docRef = doc(firestore, 'users', user.uid, 'clients', client.id);
    setDocumentNonBlocking(docRef, { needsSupport: newSupportStatus }, { merge: true });
    toast({
        title: `Suporte ${newSupportStatus ? 'marcado' : 'desmarcado'}`,
        description: `O cliente ${client.name} foi atualizado.`,
    });
    setClients(prevClients => 
        prevClients.map(c => c.id === client.id ? { ...c, needsSupport: newSupportStatus } : c)
    );
  };


  const openDialog = (view: 'add' | 'edit' | 'sendMessage', client?: Client) => {
    if (view === 'edit' && client) {
      setDialogState({ view: 'edit', client });
    } else if (view === 'sendMessage' && client) {
      setDialogState({ view: 'sendMessage', client });
    } else {
      setDialogState({ view: 'add' });
    }
  };

  const closeDialogAndClear = () => {
    setDialogState({ view: 'closed' });
  };

  const onFormFinished = () => {
    closeDialogAndClear();
    fetchClients('initial');
  };
  
  const handleDeleteClient = (client: Client) => {
    if (!user) return;
    const docRef = doc(firestore, 'users', user.uid, 'clients', client.id);
    deleteDocumentNonBlocking(docRef);
    toast({
      title: 'Cliente Excluído',
      description: `O cliente ${client.name} foi removido.`,
    });
    fetchClients('initial');
  };

  const handleSendMessage = async (message: string) => {
    if (dialogState.view !== 'sendMessage') return;

    if (!settings?.webhookToken) {
        toast({
            variant: "destructive",
            title: "Token não configurado",
            description: "Por favor, configure seu token de webhook na página de Configurações.",
        });
        return;
    }

    setIsSending(true);

    try {
        const response = await fetch('/api/send-message', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                message,
                phoneNumber: dialogState.client.phone,
                token: settings.webhookToken,
            }),
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Falha ao enviar mensagem.');
        }

        toast({
            title: "Mensagem Enviada!",
            description: `Sua mensagem foi enviada para ${dialogState.client.name}.`,
        });
        closeDialogAndClear();

    } catch (error: any) {
        console.error("Failed to send message:", error);
        toast({
            variant: "destructive",
            title: "Erro ao Enviar",
            description: error.message || "Não foi possível enviar a mensagem.",
        });
    } finally {
        setIsSending(false);
    }
  };

  const getStatusVariant = (status: 'Ativo' | 'Inativo' | 'Vencido') => {
    switch (status) {
      case 'Ativo': return 'default';
      case 'Inativo': return 'secondary';
      case 'Vencido': return 'destructive';
      default: return 'outline';
    }
  };

  const getDialogContent = () => {
    switch (dialogState.view) {
        case 'add':
            return (
                <>
                    <DialogHeader>
                        <DialogTitle>Adicionar Novo Cliente</DialogTitle>
                        <DialogDescription>
                            Preencha os detalhes do cliente abaixo.
                        </DialogDescription>
                    </DialogHeader>
                    <ClientForm onFinished={onFormFinished} />
                </>
            );
        case 'edit':
            return (
                <>
                    <DialogHeader>
                        <DialogTitle>Editar Cliente</DialogTitle>
                        <DialogDescription>
                            Atualize os detalhes do cliente abaixo.
                        </DialogDescription>
                    </DialogHeader>
                    <ClientForm initialData={dialogState.client} onFinished={onFormFinished} />
                </>
            );
        case 'sendMessage':
            return (
                <>
                    <DialogHeader>
                        <DialogTitle>Enviar Mensagem para {dialogState.client.name}</DialogTitle>
                        <DialogDescription>
                            Digite a mensagem que você deseja enviar para o número {dialogState.client.phone}.
                        </DialogDescription>
                    </DialogHeader>
                    <SendMessageDialog client={dialogState.client} onSend={handleSendMessage} onCancel={closeDialogAndClear} isSending={isSending} />
                </>
            );
        case 'closed':
            return null;
    }
  };

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title="Todos os Clientes"
        description="Gerencie seus clientes aqui."
      >
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => fetchClients('prev')} disabled={!hasPrevPage || isLoading}>
              Anterior
          </Button>
          <Button variant="outline" size="sm" onClick={() => fetchClients('next')} disabled={!hasNextPage || isLoading}>
              Próximo
          </Button>
          <Button size="sm" className="gap-1" onClick={() => openDialog('add')}>
            <PlusCircle className="h-4 w-4" />
            Adicionar Cliente
          </Button>
        </div>
      </PageHeader>
      <main className="flex-1 overflow-auto p-4 md:p-6">
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead><Button variant="ghost" size="sm" className="-ml-3 h-8 data-[state=open]:bg-accent">Nome<ArrowUpDown className="ml-2 h-4 w-4" /></Button></TableHead>
                  <TableHead><Button variant="ghost" size="sm" className="-ml-3 h-8 data-[state=open]:bg-accent">Email<ArrowUpDown className="ml-2 h-4 w-4" /></Button></TableHead>
                  <TableHead><Button variant="ghost" size="sm" className="-ml-3 h-8 data-[state=open]:bg-accent">Status<ArrowUpDown className="ml-2 h-4 w-4" /></Button></TableHead>
                  <TableHead><Button variant="ghost" size="sm" className="-ml-3 h-8 data-[state=open]:bg-accent">Vencimento<ArrowUpDown className="ml-2 h-4 w-4" /></Button></TableHead>
                  <TableHead><Button variant="ghost" size="sm" className="-ml-3 h-8 data-[state=open]:bg-accent">Tipo<ArrowUpDown className="ml-2 h-4 w-4" /></Button></TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow><TableCell colSpan={6} className="h-24 text-center">Carregando...</TableCell></TableRow>
                ) : clients && clients.length > 0 ? (
                  clients.map((client) => (
                    <TableRow key={client.id} data-state={client.needsSupport ? 'selected' : ''}>
                      <TableCell className="font-medium">
                        <div className='flex items-center gap-2'>
                          {client.needsSupport && <LifeBuoy className="h-4 w-4 text-primary" />}
                          {client.name}
                        </div>
                      </TableCell>
                      <TableCell>{Array.isArray(client.email) ? client.email.join(', ') : client.email}</TableCell>
                      <TableCell><Badge variant={getStatusVariant(client.status)} className={cn(client.status === 'Ativo' && 'bg-green-500/20 text-green-700 hover:bg-green-500/30')}>{client.status}</Badge></TableCell>
                      <TableCell>{client.dueDate ? format((client.dueDate as any).toDate(), 'dd/MM/yyyy') : '-'}</TableCell>
                      <TableCell>{client.clientType}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2">
                            <Button variant="outline" size="sm" onClick={() => openDialog('edit', client)}>
                               Editar
                            </Button>
                            <Button variant="ghost" size="icon" onClick={() => openDialog('sendMessage', client)}>
                                <MessageSquare className="h-4 w-4" />
                            </Button>
                            <TooltipProvider>
                                <Tooltip>
                                    <TooltipTrigger asChild>
                                        <Button variant="ghost" size="icon" onClick={() => handleToggleSupport(client)}>
                                            <LifeBuoy className={cn("h-4 w-4", client.needsSupport && "text-primary fill-primary/20")} />
                                        </Button>
                                    </TooltipTrigger>
                                    <TooltipContent>
                                        <p>Marcar/Desmarcar Suporte</p>
                                    </TooltipContent>
                                </Tooltip>
                            </TooltipProvider>
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
                                        Essa ação não pode ser desfeita. Isso removerá permanentemente o cliente.
                                    </AlertDialogDescription>
                                    </AlertDialogHeader>
                                    <AlertDialogFooter>
                                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                    <AlertDialogAction onClick={() => handleDeleteClient(client)}>Excluir</AlertDialogAction>
                                    </AlertDialogFooter>
                                </AlertDialogContent>
                            </AlertDialog>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow><TableCell colSpan={6} className="h-24 text-center">Nenhum cliente encontrado.</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </main>

      <Dialog open={dialogState.view !== 'closed'} onOpenChange={(isOpen) => !isOpen && closeDialogAndClear()}>
        <DialogContent className="sm:max-w-lg">
            {getDialogContent()}
        </DialogContent>
      </Dialog>
    </div>
  );
}
