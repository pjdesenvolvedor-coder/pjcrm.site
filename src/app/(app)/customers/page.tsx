'use client';

import { useState, useMemo, type ReactNode } from 'react';
import { PlusCircle, MoreHorizontal, ArrowUpDown, CalendarIcon, Eye, MessageSquare, LifeBuoy, Trash2, User, Phone, Mail, CheckCircle2, ShoppingCart, CalendarDays, Banknote, Wallet, FilePenLine, RefreshCw } from 'lucide-react';
import { add, format } from 'date-fns';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { collection, Timestamp, doc } from 'firebase/firestore';

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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
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
import { useCollection, useFirebase, useUser, useMemoFirebase, addDocumentNonBlocking, setDocumentNonBlocking } from '@/firebase';
import type { Client } from '@/lib/types';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Checkbox } from '@/components/ui/checkbox';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import { useToast } from '@/hooks/use-toast';

const clientTypes = ["PACOTE", "REVENDA"] as const;
const paymentMethods = ["PIX", "Cartão", "Boleto"] as const;


const clientSchema = z.object({
  name: z.string().min(1, 'Nome é obrigatório'),
  telegramUser: z.string().optional(),
  phone: z.string().min(1, 'Número é obrigatório'),
  clientType: z.array(z.enum(clientTypes)).optional(),
  email: z.string().email('Email inválido'),
  dueDate: z.date().optional(),
  dueTimeHour: z.string().optional(),
  dueTimeMinute: z.string().optional(),
  notes: z.string().optional(),
  quantity: z.string().optional(),
  subscription: z.string().min(1, 'Assinatura é obrigatória'),
  paymentMethod: z.enum(paymentMethods).optional(),
  amountPaid: z.string().optional(),
});


// Helper component for the Client Form
function ClientForm({ initialData, onFinished }: { initialData?: Client | null, onFinished: () => void }) {
  const { firestore } = useFirebase();
  const { user } = useUser();
  const { toast } = useToast();
  const isEditing = !!initialData;

  const form = useForm<z.infer<typeof clientSchema>>({
    resolver: zodResolver(clientSchema),
    defaultValues: initialData ? {
      name: initialData.name,
      telegramUser: initialData.telegramUser || '',
      phone: initialData.phone,
      clientType: initialData.clientType || [],
      email: initialData.email,
      dueDate: initialData.dueDate ? initialData.dueDate.toDate() : undefined,
      dueTimeHour: initialData.dueDate ? format(initialData.dueDate.toDate(), 'HH') : '18',
      dueTimeMinute: initialData.dueDate ? format(initialData.dueDate.toDate(), 'mm') : '19',
      notes: initialData.notes || '',
      quantity: initialData.quantity?.toString() || '1',
      subscription: initialData.subscription || '',
      paymentMethod: initialData.paymentMethod,
      amountPaid: initialData.amountPaid || ''
    } : {
      name: '',
      telegramUser: '',
      phone: '',
      clientType: [],
      email: '',
      dueDate: undefined,
      dueTimeHour: '18',
      dueTimeMinute: '19',
      notes: '',
      quantity: '1',
      subscription: '',
      paymentMethod: undefined,
      amountPaid: '',
    },
  });

  const onSubmit = (values: z.infer<typeof clientSchema>) => {
    if (!user) return;
    
    let dueDateTimestamp: Timestamp | undefined = undefined;
    if (values.dueDate) {
        const date = new Date(values.dueDate);
        const hour = parseInt(values.dueTimeHour || '0', 10);
        const minute = parseInt(values.dueTimeMinute || '0', 10);
        date.setHours(hour, minute);
        dueDateTimestamp = Timestamp.fromDate(date);
    }

    const clientData: Omit<Client, 'id' | 'status'> = {
      userId: user.uid,
      name: values.name,
      email: values.email,
      phone: values.phone,
      telegramUser: values.telegramUser,
      clientType: values.clientType,
      dueDate: dueDateTimestamp,
      notes: values.notes,
      quantity: values.quantity ? parseInt(values.quantity, 10) : 1,
      subscription: values.subscription,
      paymentMethod: values.paymentMethod,
      amountPaid: values.amountPaid,
    };

    if (isEditing && initialData) {
        const docRef = doc(firestore, 'users', user.uid, 'clients', initialData.id);
        setDocumentNonBlocking(docRef, { ...clientData, status: initialData.status }, { merge: true });
        toast({ title: "Cliente atualizado!", description: `${values.name} foi atualizado com sucesso.` });
    } else {
        addDocumentNonBlocking(collection(firestore, 'users', user.uid, 'clients'), { ...clientData, status: 'Ativo' });
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
                {/* Form fields for data */}
                <FormField control={form.control} name="name" render={({ field }) => ( <FormItem className="grid grid-cols-4 items-center gap-4"><FormLabel className="text-right">Nome *</FormLabel><FormControl><Input placeholder="Nome do Cliente" {...field} className="col-span-3" /></FormControl><FormMessage className="col-start-2 col-span-3" /></FormItem>)} />
                <FormField control={form.control} name="telegramUser" render={({ field }) => ( <FormItem className="grid grid-cols-4 items-center gap-4"><FormLabel className="text-right">Usuário Telegram</FormLabel><FormControl><Input placeholder="@usuario_telegram (opcional)" {...field} className="col-span-3" /></FormControl><FormMessage className="col-start-2 col-span-3" /></FormItem>)} />
                <FormField control={form.control} name="phone" render={({ field }) => ( <FormItem className="grid grid-cols-4 items-center gap-4"><FormLabel className="text-right">Número *</FormLabel><FormControl><Input placeholder="(00) 00000-0000" {...field} className="col-span-3" /></FormControl><FormMessage className="col-start-2 col-span-3" /></FormItem>)} />
                <div className="grid grid-cols-4 items-center gap-4"><div/><div className="col-span-3 flex items-center space-x-4">{clientTypes.map((item) => ( <FormField key={item} control={form.control} name="clientType" render={({ field }) => ( <FormItem key={item} className="flex flex-row items-start space-x-2 space-y-0"><FormControl><Checkbox checked={field.value?.includes(item)} onCheckedChange={(checked) => { return checked ? field.onChange([...(field.value || []), item]) : field.onChange(field.value?.filter((value) => value !== item)) }} /></FormControl><FormLabel className="font-normal text-sm">{item}</FormLabel></FormItem> )} /> ))}</div></div>
                <FormField control={form.control} name="email" render={({ field }) => ( <FormItem className="grid grid-cols-4 items-center gap-4"><FormLabel className="text-right">Email *</FormLabel><FormControl><Input type="email" placeholder="email@exemplo.com" {...field} className="col-span-3" /></FormControl><FormMessage className="col-start-2 col-span-3" /></FormItem>)} />
            </div>
          </TabsContent>
          <TabsContent value="vencimento">
            <div className="space-y-4 py-6">
                {/* Form fields for due date */}
                <div className="grid grid-cols-4 items-center gap-4"><Label className="text-right">Definir</Label><div className="col-span-3 flex gap-2"><Button type="button" variant="outline" size="sm" onClick={() => form.setValue('dueDate', add(new Date(), { days: 15 }))}>15 dias</Button><Button type="button" variant="outline" size="sm" onClick={() => form.setValue('dueDate', add(new Date(), { months: 1 }))}>1 mês</Button><Button type="button" variant="outline" size="sm" onClick={() => form.setValue('dueDate', add(new Date(), { months: 3 }))}>3 meses</Button></div></div>
                <FormField control={form.control} name="dueDate" render={({ field }) => ( <FormItem className="grid grid-cols-4 items-center gap-4"><div /><Popover><PopoverTrigger asChild><FormControl><Button variant={"outline"} className={cn("col-span-3 justify-start text-left font-normal", !field.value && "text-muted-foreground")}><CalendarIcon className="mr-2 h-4 w-4" />{field.value ? format(field.value, "dd/MM/yyyy") : <span>Selecione uma data</span>}</Button></FormControl></PopoverTrigger><PopoverContent className="w-auto p-0"><Calendar mode="single" selected={field.value} onSelect={field.onChange} initialFocus /></PopoverContent></Popover><FormMessage className="col-start-2 col-span-3" /></FormItem> )} />
                <div className="grid grid-cols-4 items-center gap-4"><div /><div className="col-span-3 flex items-center gap-2"><FormField control={form.control} name="dueTimeHour" render={({ field }) => ( <FormItem><FormControl><Input {...field} className="w-20 text-center" /></FormControl></FormItem>)} /><span>:</span><FormField control={form.control} name="dueTimeMinute" render={({ field }) => ( <FormItem><FormControl><Input {...field} className="w-20 text-center" /></FormControl></FormItem>)} /></div></div>
                <FormField control={form.control} name="notes" render={({ field }) => ( <FormItem className="grid grid-cols-4 items-start gap-4"><FormLabel className="text-right pt-2">Notas</FormLabel><FormControl><Textarea placeholder="Adicione uma observação..." className="col-span-3 resize-none" {...field} /></FormControl><FormMessage className="col-start-2 col-span-3" /></FormItem>)} />
            </div>
          </TabsContent>
          <TabsContent value="pagamento">
            <div className="space-y-4 py-6">
                {/* Form fields for payment */}
                <FormField control={form.control} name="quantity" render={({ field }) => ( <FormItem className="grid grid-cols-4 items-center gap-4"><FormLabel className="text-right">Quantidade</FormLabel><FormControl><Input {...field} className="col-span-3" /></FormControl><FormMessage className="col-start-2 col-span-3" /></FormItem>)} />
                <FormField control={form.control} name="subscription" render={({ field }) => ( <FormItem className="grid grid-cols-4 items-center gap-4"><FormLabel className="text-right">Assinatura *</FormLabel><Select onValueChange={field.onChange} defaultValue={field.value}><FormControl><SelectTrigger className="col-span-3"><SelectValue placeholder="Selecione uma assinatura" /></SelectTrigger></FormControl><SelectContent><SelectItem value="plano_mensal">Plano Mensal</SelectItem><SelectItem value="plano_trimestral">Plano Trimestral</SelectItem><SelectItem value="plano_anual">Plano Anual</SelectItem></SelectContent></Select><FormMessage className="col-start-2 col-span-3" /></FormItem>)} />
                <FormField control={form.control} name="paymentMethod" render={({ field }) => ( <FormItem className="grid grid-cols-4 items-center gap-4"><FormLabel className="text-right">Meio</FormLabel><FormControl><div className="col-span-3 flex items-center gap-2"><Button type="button" variant={field.value === 'PIX' ? 'default' : 'outline'} onClick={() => field.onChange('PIX')}>PIX</Button><Button type="button" variant={field.value === 'Cartão' ? 'default' : 'outline'} onClick={() => field.onChange('Cartão')}>Cartão</Button><Button type="button" variant={field.value === 'Boleto' ? 'default' : 'outline'} onClick={() => field.onChange('Boleto')}>Boleto</Button></div></FormControl><FormMessage className="col-start-2 col-span-3" /></FormItem>)} />
                <FormField control={form.control} name="amountPaid" render={({ field }) => ( <FormItem className="grid grid-cols-4 items-center gap-4"><FormLabel className="text-right">Valor Pago</FormLabel><FormControl><Input placeholder="R$ 0,00" {...field} className="col-span-3" /></FormControl><FormMessage className="col-start-2 col-span-3" /></FormItem>)} />
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

function ClientDetailView({ client, onClose, onEdit }: { client: Client; onClose: () => void; onEdit: (client: Client) => void }) {
  const getStatusVariant = (status: 'Ativo' | 'Inativo' | 'Vencido') => {
    switch (status) {
      case 'Ativo': return 'default';
      case 'Inativo': return 'secondary';
      case 'Vencido': return 'destructive';
      default: return 'outline';
    }
  };

  return (
    <>
      <DialogHeader className="p-6 pb-4">
        <div className="flex items-center gap-3">
          <User className="h-6 w-6 text-muted-foreground" />
          <DialogTitle className="text-2xl font-bold">{client.name}</DialogTitle>
        </div>
        <DialogDescription>Visualizando detalhes completos do cliente.</DialogDescription>
      </DialogHeader>
      <div className="px-6 pb-6 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4">
          <div className="space-y-4">
            <div className="flex items-center gap-3"><Phone className="h-5 w-5 text-muted-foreground" /><span>{client.phone}</span></div>
            <div className="flex items-center gap-3"><Mail className="h-5 w-5 text-muted-foreground" /><span className="truncate">{client.email}</span></div>
          </div>
          <div className="space-y-4">
            <div className="flex items-center gap-3"><CheckCircle2 className="h-5 w-5 text-green-500" /><Badge variant={getStatusVariant(client.status)}>{client.status}</Badge></div>
            <div className="flex items-center gap-3"><ShoppingCart className="h-5 w-5 text-muted-foreground" /><span>{client.subscription}</span></div>
            <div className="flex items-center gap-3"><CalendarDays className="h-5 w-5 text-muted-foreground" /><span>Vencimento: {client.dueDate ? format(client.dueDate.toDate(), 'dd/MM/yyyy HH:mm') : '-'}</span></div>
          </div>
        </div>
        <Separator />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4">
          <div className="flex items-center gap-3"><Banknote className="h-5 w-5 text-muted-foreground" /><span>Meio: {client.paymentMethod || 'N/A'}</span></div>
          <div className="flex items-center gap-3"><Wallet className="h-5 w-5 text-muted-foreground" /><span>Valor Pago: {client.amountPaid || 'N/A'}</span></div>
        </div>
      </div>
      <DialogFooter className="bg-muted/50 p-6 flex justify-end gap-2">
        <Button variant="outline" onClick={() => onEdit(client)}><FilePenLine className="mr-2 h-4 w-4" /> Editar Cliente</Button>
        <Button className="bg-yellow-400 hover:bg-yellow-500 text-black"><RefreshCw className="mr-2 h-4 w-4" /> Renovar</Button>
        <Button onClick={onClose}>Fechar</Button>
      </DialogFooter>
    </>
  );
}


export default function CustomersPage() {
  const { firestore } = useFirebase();
  const { user } = useUser();
  
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogType, setDialogType] = useState<'view' | 'form' | null>(null);
  const [dialogContent, setDialogContent] = useState<ReactNode | null>(null);


  const clientsQuery = useMemoFirebase(() => {
    if (!user) return null;
    return collection(firestore, 'users', user.uid, 'clients');
  }, [firestore, user]);

  const { data: clients, isLoading } = useCollection<Client>(clientsQuery);

  const handleOpenChange = (isOpen: boolean) => {
    setDialogOpen(isOpen);
    if (!isOpen) {
      // Clear content after animation
      setTimeout(() => {
        setDialogContent(null);
        setDialogType(null);
      }, 300);
    }
  };

  const openDialog = (type: 'view' | 'form', content: ReactNode) => {
    setDialogType(type);
    setDialogContent(content);
    setDialogOpen(true);
  };
  
  const closeDialogAndClear = () => {
    handleOpenChange(false);
  }

  const handleViewDetails = (client: Client) => {
    openDialog(
      'view',
      <ClientDetailView
        client={client}
        onClose={closeDialogAndClear}
        onEdit={(clientToEdit) => handleEdit(clientToEdit)}
      />
    );
  };

  const handleAdd = () => {
    openDialog(
      'form',
      <>
        <DialogHeader>
            <DialogTitle>Adicionar Novo Cliente</DialogTitle>
            <DialogDescription>
                Preencha os detalhes do cliente abaixo.
            </DialogDescription>
        </DialogHeader>
        <ClientForm onFinished={closeDialogAndClear} />
      </>
    );
  };
  
  const handleEdit = (client: Client) => {
    openDialog(
        'form',
        <>
            <DialogHeader>
                <DialogTitle>Editar Cliente</DialogTitle>
                <DialogDescription>
                    Atualize os detalhes do cliente abaixo.
                </Description>
            </DialogHeader>
            <ClientForm initialData={client} onFinished={closeDialogAndClear} />
        </>
    );
  };

  const getStatusVariant = (status: 'Ativo' | 'Inativo' | 'Vencido') => {
    switch (status) {
      case 'Ativo': return 'default';
      case 'Inativo': return 'secondary';
      case 'Vencido': return 'destructive';
      default: return 'outline';
    }
  };

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title="Todos os Clientes"
        description="Gerencie seus clientes aqui."
      >
        <div className="flex items-center gap-2">
          <Select defaultValue="ativo">
            <SelectTrigger className="w-[180px]"><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="ativo">Ativo</SelectItem>
              <SelectItem value="inativo">Inativo</SelectItem>
              <SelectItem value="vencido">Vencido</SelectItem>
            </SelectContent>
          </Select>
          <Button size="sm" className="gap-1" onClick={handleAdd}>
            <PlusCircle className="h-4 w-4" />
            Adicionar Cliente
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-9 w-9"><MoreHorizontal className="h-4 w-4" /></Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem>Exportar Clientes</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
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
                    <TableRow key={client.id}>
                      <TableCell className="font-medium">{client.name}</TableCell>
                      <TableCell>{client.email}</TableCell>
                      <TableCell><Badge variant={getStatusVariant(client.status)} className={cn(client.status === 'Ativo' && 'bg-green-500/20 text-green-700 hover:bg-green-500/30')}>{client.status}</Badge></TableCell>
                      <TableCell>{client.dueDate ? format(client.dueDate.toDate(), 'dd/MM/yyyy') : '-'}</TableCell>
                      <TableCell>{client.clientType?.join(', ')}</TableCell>
                      <TableCell className="text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="h-8 w-8"><span className="sr-only">Abrir menu</span><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onSelect={() => handleViewDetails(client)}><Eye className="mr-2 h-4 w-4" />Visualizar Detalhes</DropdownMenuItem>
                            <DropdownMenuItem><MessageSquare className="mr-2 h-4 w-4" />Enviar Mensagem</DropdownMenuItem>
                            <DropdownMenuItem><LifeBuoy className="mr-2 h-4 w-4" />Marcar Suporte</DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem className="text-destructive focus:text-destructive focus:bg-destructive/10"><Trash2 className="mr-2 h-4 w-4" />Apagar Cliente</DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
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

      <Dialog open={dialogOpen} onOpenChange={handleOpenChange}>
        <DialogContent
          className={cn({
            'sm:max-w-2xl p-0': dialogType === 'view',
            'sm:max-w-lg': dialogType === 'form',
          })}
        >
          {dialogContent}
        </DialogContent>
      </Dialog>
    </div>
  );
}
