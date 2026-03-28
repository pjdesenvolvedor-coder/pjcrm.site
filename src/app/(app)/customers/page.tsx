
'use client';

import { useState, useMemo, type ReactNode, useEffect } from 'react';
import { PlusCircle, MoreHorizontal, ArrowUpDown, CalendarIcon, MessageSquare, Trash2, User, Phone, Mail, CheckCircle2, ShoppingCart, CalendarDays, Banknote, Wallet, FilePenLine, RefreshCw, X, Eye, LifeBuoy, Plus, ArrowUp, ArrowDown, Search, Key, Monitor, Clock, RotateCw, Send, Link2, ShieldEllipsis, Download, Upload } from 'lucide-react';
import { add, format } from 'date-fns';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { collection, Timestamp, doc, query, orderBy, serverTimestamp } from 'firebase/firestore';

import { PageHeader } from '@/components/page-header';
import { Button, buttonVariants } from '@/components/ui/button';
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
const deliveryMethods = ["credentials", "link"] as const;

// Helper to format CPF or Email
const formatEmailOrCPF = (value: string) => {
    // Se o valor contém letras ou o símbolo @, ignoramos a formatação de CPF
    // Isso permite e-mails com números (ex: joao123@gmail.com)
    if (/[a-zA-Z@]/.test(value)) {
        return value;
    }

    const cleanValue = value.replace(/\D/g, '');
    
    // Só aplica máscara se o que sobrar forem apenas números e não tiver cara de e-mail
    if (cleanValue.length > 0) {
        let formatted = cleanValue;
        if (cleanValue.length > 3) formatted = `${cleanValue.slice(0, 3)}.${cleanValue.slice(3)}`;
        if (cleanValue.length > 6) formatted = `${cleanValue.slice(0, 3)}.${cleanValue.slice(3, 6)}.${cleanValue.slice(6)}`;
        if (cleanValue.length > 9) formatted = `${cleanValue.slice(0, 3)}.${cleanValue.slice(3, 6)}.${cleanValue.slice(6, 9)}-${cleanValue.slice(9, 11)}`;
        return formatted.slice(0, 14);
    }
    
    return value;
};

const clientSchema = z.object({
  name: z.string().min(1, 'Nome é obrigatório'),
  telegramUser: z.string().optional(),
  phone: z.string().min(1, 'Número é obrigatório'),
  clientType: z.enum(clientTypes).optional(),
  deliveryMethod: z.enum(deliveryMethods).default("credentials"),
  emails: z.array(z.object({ value: z.string().optional() })).optional(),
  password: z.string().optional(),
  screen: z.string().optional(),
  pinScreen: z.string().optional(),
  accessLink: z.string().optional(),
  dueDate: z.string().optional(),
  dueTimeHour: z.string().optional(),
  dueTimeMinute: z.string().optional(),
  notes: z.string().optional(),
  quantity: z.string().optional(),
  subscription: z.string().min(1, 'Assinatura é obrigatória'),
  paymentMethod: z.enum(paymentMethods).optional(),
  amountPaid: z.string().optional(),
}).superRefine((data, ctx) => {
    if (data.deliveryMethod === 'credentials') {
        if (!data.clientType && (!data.password || data.password.trim() === '')) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: "Senha é obrigatória para entrega de dados.",
                path: ["password"],
            });
        }

        if (!data.emails || data.emails.length === 0 || !data.emails[0].value) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: "Pelo menos um e-mail ou CPF é obrigatório para entrega de dados.",
                path: ["emails"],
            });
        }
    }

    if (data.emails) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        const cpfRegex = /^\d{3}\.\d{3}\.\d{3}-\d{2}$/;
        
        data.emails.forEach((e, idx) => {
            if (e.value) {
                const isEmail = emailRegex.test(e.value);
                const isCpf = cpfRegex.test(e.value);
                
                if (!isEmail && !isCpf) {
                    ctx.addIssue({
                        code: z.ZodIssueCode.custom,
                        message: "Insira um e-mail válido ou CPF (000.000.000-00)",
                        path: ["emails", idx, "value"],
                    });
                }
            }
        });
    }
});

function SendMessageDialog({ client, onSend, onCancel, isSending }: { client: Client; onSend: (message: string) => void; onCancel: () => void; isSending: boolean; }) {
  const [message, setMessage] = useState('');
  return (
    <div className="space-y-4">
      <DialogHeader>
          <DialogTitle>Enviar Mensagem para {client.name}</DialogTitle>
          <DialogDescription>
              Digite a mensagem que você deseja enviar para o número {client.phone}.
          </DialogDescription>
      </DialogHeader>
      <div className="py-2 space-y-2">
        <Label htmlFor="message">Sua Mensagem</Label>
        <Textarea 
            id="message" 
            placeholder="Olá {cliente}, como posso ajudar?..." 
            value={message} 
            onChange={(e) => setMessage(e.target.value)} 
            className="min-h-[120px]" 
        />
        <p className="text-[10px] text-muted-foreground">Nota: Tags manuais como {"{cliente}"} não funcionam neste envio direto.</p>
      </div>
      <DialogFooter>
        <Button variant="ghost" onClick={onCancel} disabled={isSending}>Cancelar</Button>
        <Button onClick={() => onSend(message)} disabled={!message.trim() || isSending}>
            {isSending ? <><RefreshCw className="mr-2 h-4 w-4 animate-spin" />Enviando...</> : <><Send className="mr-2 h-4 w-4" />Enviar Agora</>}
        </Button>
      </DialogFooter>
    </div>
  );
}

function ClientForm({ initialData, onFinished }: { initialData?: Partial<Client>, onFinished: () => void }) {
  const { firestore, effectiveUserId, userProfile } = useFirebase();
  const { user } = useUser();
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
      deliveryMethod: initialData?.deliveryMethod || "credentials",
      emails: defaultEmails,
      password: initialData?.password || '',
      screen: initialData?.screen || '',
      pinScreen: initialData?.pinScreen || '',
      accessLink: initialData?.accessLink || '',
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
  const deliveryMethod = form.watch('deliveryMethod');

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
  }, [isEditing, settings, form]);
  
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
    if (!effectiveUserId || !user) return;
    
    let dueDateTimestamp: Timestamp | undefined = undefined;
    if (values.dueDate && values.dueDate.length === 8) {
        const [day, month, year] = values.dueDate.split('/');
        const date = new Date(parseInt(year, 10) + 2000, parseInt(month, 10) - 1, parseInt(day, 10));
        if (!isNaN(date.getTime())) {
            date.setHours(parseInt(values.dueTimeHour || '0', 10), parseInt(values.dueTimeMinute || '0', 10));
            dueDateTimestamp = Timestamp.fromDate(date);
        }
    }

    const emailList = values.emails 
        ? values.emails.map(email => email.value).filter(Boolean) as string[]
        : [];

    const clientData: any = {
      userId: effectiveUserId,
      name: values.name,
      email: emailList,
      phone: values.phone,
      password: (values.deliveryMethod === 'credentials' && !values.clientType) ? (values.password || null) : null,
      screen: (values.deliveryMethod === 'credentials' && !values.clientType) ? (values.screen || null) : null,
      pinScreen: (values.deliveryMethod === 'credentials' && !values.clientType) ? (values.pinScreen || null) : null,
      accessLink: values.deliveryMethod === 'link' ? (values.accessLink || null) : null,
      deliveryMethod: values.deliveryMethod,
      telegramUser: values.telegramUser ?? null,
      clientType: values.clientType ?? null,
      dueDate: dueDateTimestamp ?? null,
      notes: values.notes ?? null,
      quantity: emailList.length || 1,
      subscription: values.subscription,
      paymentMethod: values.paymentMethod ?? null,
      amountPaid: values.amountPaid ?? null,
      agentId: user.uid,
      agentName: userProfile ? `${userProfile.firstName} ${userProfile.lastName}` : 'Sistema',
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

        const isDeliveryActive = values.deliveryMethod === 'credentials' ? settings?.isDeliveryAutomationActive : settings?.isDeliveryLinkAutomationActive;
        const deliveryMessageTemplate = values.deliveryMethod === 'credentials' ? settings?.deliveryMessage : settings?.deliveryLinkMessage;

        if (isDeliveryActive && deliveryMessageTemplate && settings?.webhookToken) {
            let formattedMessage = deliveryMessageTemplate
                .replace(/{cliente}/g, values.name).replace(/{telefone}/g, values.phone)
                .replace(/{email}/g, emailList.join(', '))
                .replace(/{senha}/g, values.password || 'N/A').replace(/{tela}/g, values.screen || 'N/A')
                .replace(/{pin_tela}/g, values.pinScreen || 'N/A')
                .replace(/{link}/g, values.accessLink || 'N/A')
                .replace(/{assinatura}/g, values.subscription)
                .replace(/{vencimento}/g, dueDateTimestamp ? format(dueDateTimestamp.toDate(), 'dd/MM/yyyy') : 'N/A')
                .replace(/{valor}/g, values.amountPaid || '0,00').replace(/{status}/g, newStatus);

            try {
                // Envia os dados do cliente para o webhook n8n antes de enviar a mensagem no zap
                await fetch('https://n8nbeta.typeflow.app.br/webhook-test/9719b2d6-7167-4615-8515-3cd67da869e7', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        nome: values.name,
                        numero: values.phone,
                        token: settings.webhookToken
                    })
                });
            } catch (error) {
                console.error("Falha ao enviar webhook n8n:", error);
            }

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
                <FormField
                    control={form.control}
                    name="clientType"
                    render={({ field }) => (
                        <FormItem className="grid grid-cols-1 md:grid-cols-4 md:items-center gap-4">
                            <FormLabel className="md:text-right">Tipo</FormLabel>
                            <div className="md:col-span-3 flex gap-2">
                                <Button 
                                    type="button" 
                                    variant={!field.value ? "default" : "outline"} 
                                    size="sm" 
                                    className="flex-1 md:flex-none"
                                    onClick={() => {
                                        field.onChange(undefined);
                                        form.setValue('emails', [{ value: '' }]);
                                    }}
                                >
                                    Individual
                                </Button>
                                <Button 
                                    type="button" 
                                    variant={field.value === "PACOTE" ? "default" : "outline"} 
                                    size="sm" 
                                    className="flex-1 md:flex-none"
                                    onClick={() => field.onChange("PACOTE")}
                                >
                                    Pacote / Revenda
                                </Button>
                            </div>
                        </FormItem>
                    )}
                />
                
                <FormField
                    control={form.control}
                    name="deliveryMethod"
                    render={({ field }) => (
                        <FormItem className="grid grid-cols-1 md:grid-cols-4 md:items-center gap-4 border-y py-2 border-dashed">
                            <FormLabel className="md:text-right font-bold text-xs uppercase">Entrega por</FormLabel>
                            <div className="md:col-span-3 flex gap-2">
                                <Button 
                                    type="button" 
                                    variant={field.value === 'credentials' ? "default" : "outline"} 
                                    size="sm" 
                                    className="flex-1 h-8 text-xs gap-1"
                                    onClick={() => field.onChange("credentials")}
                                >
                                    <Key className="h-3 w-3" /> Email / Senha
                                </Button>
                                <Button 
                                    type="button" 
                                    variant={field.value === 'link' ? "default" : "outline"} 
                                    size="sm" 
                                    className="flex-1 h-8 text-xs gap-1"
                                    onClick={() => field.onChange("link")}
                                >
                                    <Link2 className="h-3 w-3" /> Link de Acesso
                                </Button>
                            </div>
                        </FormItem>
                    )}
                />

                <FormField control={form.control} name="name" render={({ field }) => ( <FormItem className="grid grid-cols-1 md:grid-cols-4 md:items-center gap-4"><FormLabel className="md:text-right">Nome *</FormLabel><FormControl><Input placeholder="Nome" {...field} className="md:col-span-3" /></FormControl><FormMessage className="md:col-start-2 md:col-span-3" /></FormItem>)} />
                <FormField control={form.control} name="phone" render={({ field }) => ( <FormItem className="grid grid-cols-1 md:grid-cols-4 md:items-center gap-4"><FormLabel className="md:text-right">Número *</FormLabel><FormControl><Input placeholder="WhatsApp" {...field} className="md:col-span-3" /></FormControl><FormMessage className="md:col-start-2 md:col-span-3" /></FormItem>)} />
                
                <div className="grid grid-cols-1 md:grid-cols-4 md:items-start gap-4">
                    <FormLabel className="md:text-right md:pt-2">
                        Emails/CPF {deliveryMethod === 'credentials' && '*'}
                    </FormLabel>
                    <div className="md:col-span-3 space-y-2">
                        {!clientType ? (
                            <FormField control={form.control} name="emails.0.value" render={({ field }) => ( 
                                <FormItem>
                                    <FormControl>
                                        <Input 
                                            placeholder="email@exemplo.com ou CPF" 
                                            {...field} 
                                            onChange={(e) => field.onChange(formatEmailOrCPF(e.target.value))}
                                        />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem> 
                            )} />
                        ) : (
                            <>
                                <ScrollArea className="h-40 w-full rounded-md border p-4 space-y-2">
                                    {fields.map((item, index) => (
                                        <FormField key={item.id} control={form.control} name={`emails.${index}.value`} render={({ field }) => (
                                            <FormItem>
                                                <div className="flex items-center gap-2">
                                                    <FormControl>
                                                        <Input 
                                                            placeholder="email ou CPF" 
                                                            {...field} 
                                                            onChange={(e) => field.onChange(formatEmailOrCPF(e.target.value))}
                                                        />
                                                    </FormControl>
                                                    {fields.length > 1 && <Button type="button" variant="ghost" size="icon" onClick={() => remove(index)}><X className="h-4 w-4" /></Button>}
                                                </div>
                                                <FormMessage />
                                            </FormItem>
                                        )}/>
                                    ))}
                                </ScrollArea>
                                <Button type="button" variant="outline" size="sm" onClick={() => append({ value: '' })}><Plus className="mr-2 h-4 w-4" />Adicionar Item</Button>
                            </>
                        )}
                    </div>
                </div>

                {deliveryMethod === 'credentials' && !clientType && (
                  <>
                    <FormField control={form.control} name="password" render={({ field }) => (
                        <FormItem className="grid grid-cols-1 md:grid-cols-4 md:items-center gap-4"><FormLabel className="md:text-right">Senha *</FormLabel><FormControl><div className="relative md:col-span-3"><Key className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" /><Input placeholder="Senha" {...field} className="pl-9" /></div></FormControl><FormMessage className="md:col-start-2 md:col-span-3" /></FormItem>
                    )}/>
                    <FormField control={form.control} name="screen" render={({ field }) => (
                        <FormItem className="grid grid-cols-1 md:grid-cols-4 md:items-center gap-4">
                          <FormLabel className="md:text-right">Tela</FormLabel>
                          <Select onValueChange={field.onChange} defaultValue={field.value}>
                            <FormControl>
                              <SelectTrigger className="md:col-span-3">
                                <div className="flex items-center gap-2">
                                  <Monitor className="h-4 w-4 text-muted-foreground" />
                                  <SelectValue placeholder="Tela" />
                                </div>
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {screenOptions.map(o => <SelectItem key={o} value={o}>Tela {o}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </FormItem>
                    )}/>
                    <FormField control={form.control} name="pinScreen" render={({ field }) => (
                        <FormItem className="grid grid-cols-1 md:grid-cols-4 md:items-center gap-4">
                            <FormLabel className="md:text-right">PIN Tela</FormLabel>
                            <FormControl>
                                <div className="relative md:col-span-3">
                                    <ShieldEllipsis className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                    <Input placeholder="PIN (Opcional)" {...field} className="pl-9" />
                                </div>
                            </FormControl>
                            <FormMessage className="md:col-start-2 md:col-span-3" />
                        </FormItem>
                    )}/>
                  </>
                )}

                {deliveryMethod === 'link' && (
                    <FormField control={form.control} name="accessLink" render={({ field }) => (
                        <FormItem className="grid grid-cols-1 md:grid-cols-4 md:items-center gap-4">
                            <FormLabel className="md:text-right">Link de Acesso</FormLabel>
                            <FormControl>
                                <div className="relative md:col-span-3">
                                    <Link2 className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                    <Input placeholder="https://..." {...field} className="pl-9" />
                                </div>
                            </FormControl>
                            <FormMessage className="md:col-start-2 md:col-span-3" />
                        </FormItem>
                    )}/>
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
                <FormField control={form.control} name="subscription" render={({ field }) => (
                  <FormItem className="grid grid-cols-1 md:grid-cols-4 md:items-center gap-4">
                    <FormLabel className="md:text-right">Plano *</FormLabel>
                    <Select onValueChange={(v) => { field.onChange(v); const s = subscriptions?.find(x => x.name === v); if (s) form.setValue('amountPaid', s.value); }} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger className="md:col-span-3">
                          <SelectValue placeholder="Selecione" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {subscriptions?.map(s => <SelectItem key={s.id} value={s.name}>{s.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </FormItem>
                )} />
                <FormField control={form.control} name="paymentMethod" render={({ field }) => (
                  <FormItem className="grid grid-cols-1 md:grid-cols-4 md:items-center gap-4">
                    <FormLabel className="md:text-right">Forma *</FormLabel>
                    <div className="md:col-span-3 flex flex-wrap gap-2">
                        {paymentMethods.map(m => (
                            <Button
                                key={m}
                                type="button"
                                variant={field.value === m ? "default" : "outline"}
                                size="sm"
                                className="flex-1 md:flex-none"
                                onClick={() => field.onChange(m)}
                            >
                                {m}
                            </Button>
                        ))}
                    </div>
                    <FormMessage className="md:col-start-2 md:col-span-3" />
                  </FormItem>
                )} />
                <FormField control={form.control} name="amountPaid" render={({ field }) => ( <FormItem className="grid grid-cols-1 md:grid-cols-4 md:items-center gap-4"><FormLabel className="md:text-right">Valor</FormLabel><div className="relative md:col-span-3"><span className="absolute inset-y-0 left-0 flex items-center pl-3 text-muted-foreground">R$</span><FormControl><Input {...field} placeholder="0,00" className="pl-9" /></FormControl></div></FormItem> )} />
          </TabsContent>
        </Tabs>
        <DialogFooter className='pt-4'><Button variant="ghost" type="button" onClick={onFinished}>Cancelar</Button><Button type="submit">{isEditing ? 'Salvar' : 'Cadastrar'}</Button></DialogFooter>
      </form>
    </Form>
  )
}

function RenewDialog({ client, onFinished }: { client: Client, onFinished: () => void }) {
    const { firestore, effectiveUserId, userProfile } = useFirebase();
    const { user } = useUser();
    const { toast } = useToast();
    const [emails, setEmails] = useState(client.email.join(', '));
    const [amount, setAmount] = useState(client.amountPaid || '0,00');
    const [period, setPeriod] = useState('1');

    const handleRenewAction = () => {
        if (!effectiveUserId || !user) return;
        const clientDocRef = doc(firestore, 'users', effectiveUserId, 'clients', client.id);
        
        const newDueDate = add(new Date(), { months: 1 });
        
        setDocumentNonBlocking(clientDocRef, {
            status: 'Ativo',
            email: emails.split(',').map(e => e.trim()).filter(Boolean),
            amountPaid: amount,
            dueDate: Timestamp.fromDate(newDueDate),
            createdAt: serverTimestamp(),
            agentId: user.uid,
            agentName: userProfile ? `${userProfile.firstName} ${userProfile.lastName}` : 'Sistema',
        }, { merge: true });

        toast({ title: "Cliente Renovado!", description: `Acesso estendido por 1 mês para ${client.name}.` });
        onFinished();
    };

    return (
        <div className="space-y-6 pt-4">
            <div className="space-y-4">
                <div className="space-y-2">
                    <Label>E-mails/CPF em uso (Separe por vírgula se houver mais de um)</Label>
                    <Input 
                        value={emails} 
                        onChange={(e) => setEmails(formatEmailOrCPF(e.target.value))} 
                        placeholder="email@exemplo.com ou CPF" 
                    />
                </div>
                <div className="space-y-2">
                    <Label>Valor da Renovação (R$)</Label>
                    <div className="relative">
                        <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-muted-foreground">R$</span>
                        <Input 
                            value={amount} 
                            onChange={(e) => setAmount(e.target.value)} 
                            placeholder="0,00" 
                            className="pl-9"
                        />
                    </div>
                </div>
                <div className="space-y-2">
                    <Label>Período de Renovação</Label>
                    <Select value={period} onValueChange={setPeriod}>
                        <SelectTrigger>
                            <SelectValue placeholder="Selecione o período" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="1">1 Mês</SelectItem>
                        </SelectContent>
                    </Select>
                </div>
            </div>
            <DialogFooter>
                <Button variant="ghost" onClick={onFinished}>Cancelar</Button>
                <Button onClick={handleRenewAction} className="gap-2">
                    <RotateCw className="h-4 w-4" />
                    Confirmar Renovação
                </Button>
            </DialogFooter>
        </div>
    );
}

export default function CustomersPage() {
  const { firestore, effectiveUserId, userProfile } = useFirebase();
  const { user } = useUser();
  const { toast } = useToast();
  const [dialogState, setDialogState] = useState<any>({ view: 'closed' });
  const [searchTerm, setSearchTerm] = useState('');
  const [sortConfig, setSortConfig] = useState<any>({ key: 'name', direction: 'ascending' });
  const [isSendingMessage, setIsSendingMessage] = useState(false);
  
  const settingsDocRef = useMemoFirebase(() => (effectiveUserId ? doc(firestore, 'users', effectiveUserId, 'settings', 'config') : null), [firestore, effectiveUserId]);
  const { data: settings } = useDoc<Settings>(settingsDocRef);

  const clientsQuery = useMemoFirebase(() => (effectiveUserId ? collection(firestore, 'users', effectiveUserId, 'clients') : null), [firestore, effectiveUserId]);
  const { data: clients, isLoading } = useCollection<Client>(clientsQuery);

  const requestSort = (key: string) => {
    let direction = 'ascending';
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'ascending') {
      direction = 'descending';
    }
    setSortConfig({ key, direction });
  };

  const filteredClients = useMemo(() => {
    if (!clients) return [];
    let items = clients.filter(c => {
        const search = searchTerm.toLowerCase();
        const emailsStr = Array.isArray(c.email) ? c.email.join(' ') : (c.email || '');
        return c.name.toLowerCase().includes(search) || 
               c.phone.includes(search) || 
               emailsStr.toLowerCase().includes(search);
    });
    if (sortConfig) {
        items.sort((a: any, b: any) => {
            let aV = a[sortConfig.key];
            let bV = b[sortConfig.key];
            
            if (aV?.toMillis) aV = aV.toMillis();
            if (bV?.toMillis) bV = bV.toMillis();
            
            if (aV === null || aV === undefined) return 1;
            if (bV === null || bV === undefined) return -1;

            if (aV < bV) return sortConfig.direction === 'ascending' ? -1 : 1;
            if (aV > bV) return sortConfig.direction === 'ascending' ? 1 : -1;
            return 0;
        });
    }
    return items;
  }, [clients, searchTerm, sortConfig]);

  const handleToggleSupport = (client: Client) => {
    if (!effectiveUserId) return;
    const newSupportState = !client.needsSupport;
    const ref = doc(firestore, 'users', effectiveUserId, 'clients', client.id);
    setDocumentNonBlocking(ref, { needsSupport: newSupportState }, { merge: true });
    toast({ title: `Suporte ${newSupportState ? 'marcado' : 'desmarcado'}` });

    if (settings?.isSupportAutomationActive && settings.webhookToken) {
        const messageTemplate = newSupportState ? settings.supportStartedMessage : settings.supportFinishedMessage;
        if (messageTemplate) {
            let formattedMessage = messageTemplate
                .replace(/{cliente}/g, client.name)
                .replace(/{telefone}/g, client.phone)
                .replace(/{email}/g, Array.isArray(client.email) ? client.email.join(', ') : client.email)
                .replace(/{assinatura}/g, client.subscription || '')
                .replace(/{vencimento}/g, client.dueDate ? format(client.dueDate.toDate(), 'dd/MM/yyyy') : 'N/A')
                .replace(/{valor}/g, client.amountPaid || '0,00')
                .replace(/{senha}/g, client.password || 'N/A')
                .replace(/{tela}/g, client.screen || 'N/A')
                .replace(/{pin_tela}/g, client.pinScreen || 'N/A')
                .replace(/{link}/g, client.accessLink || 'N/A')
                .replace(/{status}/g, client.status);

            fetch('/api/send-message', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    message: formattedMessage,
                    phoneNumber: client.phone,
                    token: settings.webhookToken,
                }),
            }).catch(e => console.error("Falha na automação de suporte:", e));
        }
    }
  };

  const handleSendMessage = async (message: string) => {
    if (!dialogState.client || !effectiveUserId) return;

    if (!settings?.webhookToken) {
        toast({
            variant: "destructive",
            title: "Token não configurado",
            description: "Por favor, configure seu token de webhook na página de Configurações.",
        });
        return;
    }

    setIsSendingMessage(true);

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
        setDialogState({ view: 'closed' });

    } catch (error: any) {
        console.error("Failed to send message:", error);
        toast({
            variant: "destructive",
            title: "Erro ao Enviar",
            description: error.message || "Não foi possível enviar a mensagem.",
        });
    } finally {
        setIsSendingMessage(false);
    }
  };

  const handleResendAccess = async (client: Client) => {
      if (!settings?.webhookToken) {
          toast({ variant: 'destructive', title: 'Erro', description: 'Token de webhook não configurado.' });
          return;
      }

      const deliveryMethod = client.deliveryMethod || 'credentials';
      const messageTemplate = deliveryMethod === 'credentials' ? settings.deliveryMessage : settings.deliveryLinkMessage;

      if (!messageTemplate) {
          toast({ variant: 'destructive', title: 'Erro', description: 'Mensagem de entrega não configurada nas Configurações.' });
          return;
      }

      let formattedMessage = messageTemplate
          .replace(/{cliente}/g, client.name)
          .replace(/{telefone}/g, client.phone)
          .replace(/{email}/g, Array.isArray(client.email) ? client.email.join(', ') : (client.email || 'N/A'))
          .replace(/{senha}/g, client.password || 'N/A')
          .replace(/{tela}/g, client.screen || 'N/A')
          .replace(/{pin_tela}/g, client.pinScreen || 'N/A')
          .replace(/{link}/g, client.accessLink || 'N/A')
          .replace(/{assinatura}/g, client.subscription || 'N/A')
          .replace(/{vencimento}/g, client.dueDate ? format((client.dueDate as any).toDate(), 'dd/MM/yyyy') : 'N/A')
          .replace(/{valor}/g, client.amountPaid || '0,00')
          .replace(/{status}/g, client.status);

      try {
          const response = await fetch('/api/send-message', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ message: formattedMessage, phoneNumber: client.phone, token: settings.webhookToken }),
          });

          if (!response.ok) throw new Error('Falha no envio');
          toast({ title: 'Acesso reenviado', description: 'Mensagem com dados de acesso foi enviada para o cliente.' });
      } catch (error) {
          toast({ variant: 'destructive', title: 'Erro ao enviar', description: 'Não foi possível reenviar o acesso.' });
      }
  };

  const handleExport = () => {
    if (!clients || clients.length === 0) {
        toast({ variant: 'destructive', title: 'Nenhum dado', description: 'Não há clientes para exportar.' });
        return;
    }

    const timestamp = format(new Date(), 'dd-MM-yyyy');

    // 1. Export JSON (Full DB Backup)
    const jsonStr = JSON.stringify(clients, null, 2);
    const jsonBlob = new Blob([jsonStr], { type: 'application/json' });
    const jsonUrl = URL.createObjectURL(jsonBlob);
    const jsonLink = document.createElement('a');
    jsonLink.href = jsonUrl;
    jsonLink.download = `backup_clientes_${timestamp}.json`;
    jsonLink.click();
    URL.revokeObjectURL(jsonUrl);

    // 2. Export TXT (Formatted List)
    // Format: NomeCliente - NumeroClientes - Emaildaconta - Plano - VENCIMENTO
    const txtLines = clients.map(c => {
        const name = c.name || 'Sem Nome';
        const phone = c.phone || 'Sem Telefone';
        const email = Array.isArray(c.email) ? c.email.join(', ') : (c.email || 'Sem Email');
        const plan = c.subscription || 'Sem Plano';
        const dueDate = c.dueDate ? format(c.dueDate.toDate(), 'dd/MM/yyyy') : 'Sem Vencimento';
        
        return `${name} - ${phone} - ${email} - ${plan} - ${dueDate}`;
    });

    const txtContent = txtLines.join('\n');
    const txtBlob = new Blob([txtContent], { type: 'text/plain' });
    const txtUrl = URL.createObjectURL(txtBlob);
    const txtLink = document.createElement('a');
    txtLink.href = txtUrl;
    txtLink.download = `lista_clientes_${timestamp}.txt`;
    
    // Pequeno delay para garantir que o navegador não bloqueie múltiplos downloads
    setTimeout(() => {
        txtLink.click();
        URL.revokeObjectURL(txtUrl);
    }, 100);

    toast({ 
        title: 'Exportação concluída!', 
        description: 'Foram gerados arquivos JSON (Backup) e TXT (Lista formatada).' 
    });
  };

  const handleImport = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !effectiveUserId) return;

    const reader = new FileReader();
    reader.onload = async (e) => {
        try {
            const content = e.target?.result as string;
            const importedClients = JSON.parse(content);

            if (!Array.isArray(importedClients)) {
                throw new Error("O arquivo deve conter uma lista de clientes.");
            }

            let count = 0;
            for (const c of importedClients) {
                if (!c.name || !c.phone) continue;

                const { id, ...clientData } = c; // remove old ID
                
                // Handle dates - if exported as JSON they come back as strings or plain objects
                if (clientData.dueDate) {
                    if (typeof clientData.dueDate === 'string') {
                        clientData.dueDate = Timestamp.fromDate(new Date(clientData.dueDate));
                    } else if (clientData.dueDate.seconds) {
                        clientData.dueDate = new Timestamp(clientData.dueDate.seconds, clientData.dueDate.nanoseconds || 0);
                    }
                }

                const finalData = {
                    ...clientData,
                    userId: effectiveUserId,
                    agentId: user?.uid,
                    agentName: userProfile ? `${userProfile.firstName} ${userProfile.lastName}` : 'Sistema',
                    createdAt: serverTimestamp(),
                };

                addDocumentNonBlocking(collection(firestore, 'users', effectiveUserId, 'clients'), finalData);
                count++;
            }

            toast({ title: 'Importação concluída!', description: `${count} clientes foram adicionados.` });
        } catch (error: any) {
            console.error(error);
            toast({ variant: 'destructive', title: 'Erro na importação', description: error.message });
        } finally {
            event.target.value = ''; // reset input
        }
    };
    reader.readAsText(file);
  };

  return (
    <div className="flex flex-col h-full">
      <PageHeader title="Todos os Clientes">
        <div className="relative"><Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" /><Input placeholder="Pesquisar por nome, tel ou e-mail..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="pl-8 md:w-[240px]" /></div>
        <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={handleExport} className="gap-1 hidden md:flex">
                <Download className="h-4 w-4" /> Exportar
            </Button>
            <Label htmlFor="import-clients" className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), "cursor-pointer gap-1 hidden md:flex")}>
                <Upload className="h-4 w-4" /> Importar
                <input 
                    id="import-clients"
                    type="file" 
                    accept=".json" 
                    className="hidden" 
                    onChange={handleImport}
                />
            </Label>
            <Button size="sm" onClick={() => setDialogState({ view: 'add' })}><PlusCircle className="h-4 w-4 mr-1" />Adicionar</Button>
        </div>
      </PageHeader>
      <main className="flex-1 overflow-auto p-4 md:p-6">
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="cursor-pointer hover:text-foreground transition-colors" onClick={() => requestSort('name')}>
                    <div className="flex items-center gap-1">
                        Nome {sortConfig?.key === 'name' && (sortConfig.direction === 'ascending' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />)}
                    </div>
                </TableHead>
                <TableHead>Email/CPF</TableHead>
                <TableHead className="cursor-pointer hover:text-foreground transition-colors" onClick={() => requestSort('subscription')}>
                    <div className="flex items-center gap-1">
                        Plano {sortConfig?.key === 'subscription' && (sortConfig.direction === 'ascending' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />)}
                    </div>
                </TableHead>
                <TableHead className="cursor-pointer hover:text-foreground transition-colors" onClick={() => requestSort('status')}>
                    <div className="flex items-center gap-1">
                        Status {sortConfig?.key === 'status' && (sortConfig.direction === 'ascending' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />)}
                    </div>
                </TableHead>
                <TableHead className="cursor-pointer hover:text-foreground transition-colors" onClick={() => requestSort('dueDate')}>
                    <div className="flex items-center gap-1">
                        Vencimento {sortConfig?.key === 'dueDate' && (sortConfig.direction === 'ascending' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />)}
                    </div>
                </TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={6} className="text-center">Carregando...</TableCell></TableRow>
              ) : filteredClients.map((client) => (
                <TableRow key={client.id} className={cn(client.needsSupport && "bg-primary/5")}>
                    <TableCell><div className='flex items-center gap-2'>{client.needsSupport && <LifeBuoy className="h-4 w-4 text-primary" />}{client.name}</div></TableCell>
                    <TableCell><div className="text-xs text-muted-foreground max-w-[180px] truncate">{Array.isArray(client.email) ? client.email[0] : client.email}</div></TableCell>
                    <TableCell><Badge variant="outline" className="font-normal">{client.subscription || '-'}</Badge></TableCell>
                    <TableCell><Badge variant={client.status === 'Ativo' ? 'default' : 'destructive'} className={cn(client.status === 'Ativo' && 'bg-green-500/20 text-green-700')}>{client.status}</Badge></TableCell>
                    <TableCell>{client.dueDate ? format((client.dueDate as any).toDate(), 'dd/MM/yyyy') : '-'}</TableCell>
                    <TableCell className="text-right space-x-1 whitespace-nowrap">
                        <TooltipProvider>
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <Button variant="outline" size="icon" className="h-8 w-8 text-amber-600 border-amber-200 hover:bg-amber-50" onClick={() => handleResendAccess(client)}>
                                        <Key className="h-4 w-4" />
                                    </Button>
                                </TooltipTrigger>
                                <TooltipContent>Reenviar Acesso</TooltipContent>
                            </Tooltip>
                        </TooltipProvider>

                        <TooltipProvider>
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <Button variant="outline" size="icon" className="h-8 w-8 text-indigo-600 border-indigo-200 hover:bg-indigo-50" onClick={() => setDialogState({ view: 'add', client: { name: client.name, phone: client.phone, telegramUser: client.telegramUser } })}>
                                        <ShoppingCart className="h-4 w-4" />
                                    </Button>
                                </TooltipTrigger>
                                <TooltipContent>Nova Compra (Mesmo Cliente)</TooltipContent>
                            </Tooltip>
                        </TooltipProvider>

                        <Button variant="outline" size="icon" className="h-8 w-8 text-blue-600 border-blue-200 hover:bg-blue-50" onClick={() => setDialogState({ view: 'message', client })}>
                            <MessageSquare className="h-4 w-4" />
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => setDialogState({ view: 'renew', client })} className="gap-1 border-green-200 text-green-700 hover:bg-green-50">
                            <RotateCw className="h-3 w-3" />
                            Renovar
                        </Button>
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
            <DialogHeader>
                <DialogTitle>
                    {dialogState.view === 'add' && 'Novo Cliente'}
                    {dialogState.view === 'edit' && 'Editar Cliente'}
                    {dialogState.view === 'renew' && `Renovar: ${dialogState.client?.name}`}
                    {dialogState.view === 'message' && 'Iniciar Conversa'}
                </DialogTitle>
            </DialogHeader>
            {dialogState.view === 'renew' && (
                <RenewDialog client={dialogState.client} onFinished={() => setDialogState({ view: 'closed' })} />
            )}
            {(dialogState.view === 'add' || dialogState.view === 'edit') && (
                <ClientForm initialData={dialogState.client} onFinished={() => setDialogState({ view: 'closed' })} />
            )}
            {dialogState.view === 'message' && (
                <SendMessageDialog 
                    client={dialogState.client} 
                    onSend={handleSendMessage} 
                    onCancel={() => setDialogState({ view: 'closed' })} 
                    isSending={isSendingMessage} 
                />
            )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
