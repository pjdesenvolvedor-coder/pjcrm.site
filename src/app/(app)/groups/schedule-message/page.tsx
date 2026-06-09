'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { PlusCircle, Upload, CalendarIcon, Trash2, RefreshCw, AlertTriangle, Pencil, Copy, Send } from 'lucide-react';
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
import { useFirebase, useUser, addDocumentNonBlocking, useCollection, useMemoFirebase, deleteDocumentNonBlocking } from '@/firebase';
import { collection, query, orderBy, Timestamp, doc, getDoc, updateDoc } from 'firebase/firestore';
import type { ScheduledMessage } from '@/lib/types';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/hooks/use-toast';
import { format, addDays } from 'date-fns';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

const compressImage = (file: File, maxWidth = 1024, maxHeight = 1024, quality = 0.7): Promise<string> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = (event) => {
            const img = document.createElement('img');
            img.src = event.target?.result as string;
            img.onload = () => {
                const canvas = document.createElement('canvas');
                let width = img.width;
                let height = img.height;

                if (width > height) {
                    if (width > maxWidth) {
                        height = Math.round((height * maxWidth) / width);
                        width = maxWidth;
                    }
                } else {
                    if (height > maxHeight) {
                        width = Math.round((width * maxHeight) / height);
                        height = maxHeight;
                    }
                }

                canvas.width = width;
                canvas.height = height;

                const ctx = canvas.getContext('2d');
                if (!ctx) {
                    reject(new Error('Canvas context is null'));
                    return;
                }
                ctx.drawImage(img, 0, 0, width, height);

                const dataUrl = canvas.toDataURL('image/jpeg', quality);
                resolve(dataUrl);
            };
            img.onerror = (err) => reject(err);
        };
        reader.onerror = (err) => reject(err);
    });
};

const scheduleSchema = z.object({
    jid: z.string().min(1, { message: "O JID do grupo é obrigatório." }),
    message: z.string().min(1, { message: "A mensagem é obrigatória." }),
    image: z.instanceof(File).optional(),
    sendDate: z.string().min(10, { message: "A data é obrigatória no formato dd/mm/aaaa." }),
    sendHour: z.string().min(1, { message: "A hora é obrigatória." }),
    sendMinute: z.string().min(1, { message: "O minuto é obrigatório." }),
    repeatDaily: z.boolean().default(false),
    useBillingZap: z.boolean().default(false),
    supportNumber: z.string().optional(),
    siteLink: z.string().optional(),
});

type ScheduleFormData = z.infer<typeof scheduleSchema>;

function ScheduleMessageForm({ 
    onFinished, 
    initialMessage,
    isEditMode = false 
}: { 
    onFinished: () => void; 
    initialMessage?: ScheduledMessage;
    isEditMode?: boolean;
}) {
    const { firestore, user } = useFirebase();
    const { toast } = useToast();
    const imageInputRef = useRef<HTMLInputElement>(null);
    const [imagePreview, setImagePreview] = useState<string | null>(null);
    const [isSending, setIsSending] = useState(false);

    const form = useForm<ScheduleFormData>({
        resolver: zodResolver(scheduleSchema),
        defaultValues: {
            jid: '',
            message: '',
            image: undefined,
            sendDate: '',
            sendHour: new Date().getHours().toString().padStart(2, '0'),
            sendMinute: new Date().getMinutes().toString().padStart(2, '0'),
            repeatDaily: false,
            useBillingZap: false,
            supportNumber: '',
            siteLink: '',
        },
    });

    useEffect(() => {
        if (initialMessage) {
            const date = initialMessage.sendAt.toDate();
            form.reset({
                jid: initialMessage.jid,
                message: initialMessage.message,
                image: undefined,
                sendDate: format(date, 'dd/MM/yyyy'),
                sendHour: format(date, 'HH'),
                sendMinute: format(date, 'mm'),
                repeatDaily: initialMessage.repeatDaily,
                useBillingZap: initialMessage.useBillingZap,
                supportNumber: initialMessage.supportNumber || '',
                siteLink: initialMessage.siteLink || '',
            });
            setImagePreview(initialMessage.imageUrl || null);
        } else {
            form.reset({
                jid: '',
                message: '',
                image: undefined,
                sendDate: '',
                sendHour: new Date().getHours().toString().padStart(2, '0'),
                sendMinute: new Date().getMinutes().toString().padStart(2, '0'),
                repeatDaily: false,
                useBillingZap: false,
                supportNumber: '',
                siteLink: '',
            });
            setImagePreview(null);
        }
    }, [initialMessage, form]);

    const handleDateInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        let value = e.target.value.replace(/\D/g, '');
        if (value.length > 8) value = value.slice(0, 8);

        let formatted = value;
        if (value.length > 2) {
        formatted = `${value.slice(0, 2)}/${value.slice(2)}`;
        }
        if (value.length > 4) {
        formatted = `${value.slice(0, 2)}/${value.slice(2, 4)}/${value.slice(4)}`;
        }
        form.setValue('sendDate', formatted);
    };

    const onSubmit = async (values: ScheduleFormData) => {
        if (!user) return;

        setIsSending(true);

        // Custom validation for required image
        if (!values.image && !imagePreview) {
            form.setError('image', { type: 'manual', message: 'A imagem é obrigatória para o agendamento.' });
            setIsSending(false);
            return;
        }

        const [day, month, year] = values.sendDate.split('/');
        const date = new Date(parseInt(year, 10), parseInt(month, 10) - 1, parseInt(day, 10));
        
        if (isNaN(date.getTime())) {
            toast({ variant: 'destructive', title: 'Data inválida' });
            setIsSending(false);
            return;
        }

        date.setHours(parseInt(values.sendHour, 10), parseInt(values.sendMinute, 10));

        const now = new Date();
        if (date.getTime() < now.getTime()) {
            toast({
                variant: "destructive",
                title: "Data/Hora inválida",
                description: "O horário de envio não pode ser no passado.",
            });
            setIsSending(false);
            return;
        }
        
        const sendAtTimestamp = Timestamp.fromDate(date);

        let imageUrlDataUri: string | undefined = undefined;
        if (values.image instanceof File) {
            try {
                imageUrlDataUri = await compressImage(values.image);
            } catch (error) {
                console.error("Error compressing image:", error);
                toast({ variant: 'destructive', title: 'Erro ao processar imagem', description: 'Não foi possível compactar a imagem.' });
                setIsSending(false);
                return;
            }
        }

        try {
            if (isEditMode && initialMessage) {
                const docRef = doc(firestore, 'users', user.uid, 'scheduled_messages', initialMessage.id);
                await updateDoc(docRef, {
                    jid: values.jid,
                    message: values.message,
                    sendAt: sendAtTimestamp,
                    repeatDaily: values.repeatDaily,
                    status: 'Scheduled' as const,
                    imageUrl: imageUrlDataUri || initialMessage.imageUrl || undefined,
                    useBillingZap: values.useBillingZap,
                    supportNumber: values.supportNumber || undefined,
                    siteLink: values.siteLink || undefined,
                    errorReason: null,
                    retryCount: 0
                });
                toast({ title: "Agendamento Atualizado!", description: "Os detalhes do agendamento foram atualizados com sucesso." });
            } else {
                const newScheduledMessageForFirestore = {
                    userId: user.uid,
                    jid: values.jid,
                    message: values.message,
                    sendAt: sendAtTimestamp,
                    repeatDaily: values.repeatDaily,
                    status: 'Scheduled' as const,
                    imageUrl: imageUrlDataUri || initialMessage?.imageUrl || undefined,
                    useBillingZap: values.useBillingZap,
                    supportNumber: values.supportNumber || undefined,
                    siteLink: values.siteLink || undefined,
                };
                addDocumentNonBlocking(collection(firestore, 'users', user.uid, 'scheduled_messages'), newScheduledMessageForFirestore);
                toast({ title: "Mensagem Agendada!", description: "Sua mensagem foi salva e será enviada no horário programado." });
            }
            onFinished();
        } catch (error: any) {
            console.error("Error saving scheduled message:", error);
            toast({ variant: 'destructive', title: 'Erro ao salvar agendamento', description: error.message || 'Erro de conexão/servidor.' });
        } finally {
            setIsSending(false);
        }
    };

    return (
        <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <fieldset disabled={isSending} className="space-y-4">
                    <DialogHeader>
                        <DialogTitle>Agendar Mensagem de Grupo</DialogTitle>
                        <DialogDescription>
                            Preencha os detalhes para agendar uma nova mensagem para um grupo.
                        </DialogDescription>
                    </DialogHeader>
                    <Alert className="border-yellow-400 bg-yellow-50 text-yellow-800 dark:border-yellow-600 dark:bg-yellow-950/50 dark:text-yellow-300 [&>svg]:text-yellow-600 dark:[&>svg]:text-yellow-400">
                        <AlertTriangle className="h-4 w-4" />
                        <AlertTitle className="font-bold">Atenção</AlertTitle>
                        <AlertDescription>
                        ⚠️ Você precisa ser administrador do grupo para agendar uma mensagem. 🔐
                        </AlertDescription>
                    </Alert>
                    <FormField
                        control={form.control}
                        name="jid"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>Grupo (JID)</FormLabel>
                                <FormControl>
                                    <Input placeholder="Cole o JID do grupo aqui..." {...field} />
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                    <FormField
                        control={form.control}
                        name="message"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>Mensagem</FormLabel>
                                <FormControl>
                                    <Textarea placeholder="Escreva sua mensagem..." className="resize-none" {...field} />
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                    <FormField
                        control={form.control}
                        name="image"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>Imagem</FormLabel>
                                <FormControl>
                                    <Button type="button" variant="outline" className="w-full" onClick={() => imageInputRef.current?.click()}>
                                    <Upload className="mr-2 h-4 w-4" />
                                    {field.value ? 'Alterar Imagem' : 'Selecionar Imagem'}
                                    </Button>
                                </FormControl>
                                <Input 
                                    ref={imageInputRef} 
                                    type="file" 
                                    accept="image/*" 
                                    className="hidden" 
                                    onChange={(e) => {
                                        const file = e.target.files?.[0];
                                        if (file) {
                                            field.onChange(file);
                                            const reader = new FileReader();
                                            reader.onloadend = () => {
                                                setImagePreview(reader.result as string);
                                            };
                                            reader.readAsDataURL(file);
                                        }
                                    }} 
                                />
                                {imagePreview && <img src={imagePreview} alt="Preview" className="mt-2 h-20 w-20 object-cover rounded-md" data-ai-hint="image preview" />}
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <FormField
                            control={form.control}
                            name="supportNumber"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Número para suporte (Opcional)</FormLabel>
                                    <FormControl>
                                        <Input placeholder="Ex: 5511999998888" {...field} />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                        <FormField
                            control={form.control}
                            name="siteLink"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Link do Site (Opcional)</FormLabel>
                                    <FormControl>
                                        <Input placeholder="Ex: https://seusite.com" {...field} />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                    </div>
                    <div className='space-y-2'>
                        <Label>Data e Hora do Envio</Label>
                        <div className="flex items-start gap-2">
                            <div className="flex-1">
                                <FormField
                                    control={form.control}
                                    name="sendDate"
                                    render={({ field }) => (
                                    <FormItem>
                                        <div className="relative">
                                            <CalendarIcon className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                            <FormControl>
                                                <Input placeholder="dd/mm/aaaa" {...field} className="pl-9" onChange={handleDateInputChange} />
                                            </FormControl>
                                        </div>
                                        <FormMessage />
                                    </FormItem>
                                    )}
                                />
                            </div>
                            <div className="w-20">
                                <FormField
                                    control={form.control}
                                    name="sendHour"
                                    render={({ field }) => (
                                    <FormItem>
                                        <FormControl>
                                            <Input className="w-full text-center" {...field} />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                    )}
                                />
                            </div>
                            <span className="pt-2">:</span>
                            <div className="w-20">
                                <FormField
                                    control={form.control}
                                    name="sendMinute"
                                    render={({ field }) => (
                                    <FormItem>
                                        <FormControl>
                                            <Input className="w-full text-center" {...field} />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                    )}
                                />
                            </div>
                        </div>
                        <div className="flex flex-col gap-3 pt-4">
                            <FormField
                                control={form.control}
                                name="useBillingZap"
                                render={({ field }) => (
                                    <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                                        <div className="space-y-0.5">
                                            <FormLabel className="text-base">Usar ZAP Cobrança</FormLabel>
                                            <p className="text-[13px] text-muted-foreground mr-4">
                                                Habilitar envio pelo número de cobrança. Se desmarcado (padrão), o Hub Principal será utilizado.
                                            </p>
                                        </div>
                                        <FormControl>
                                            <Checkbox
                                                checked={field.value}
                                                onCheckedChange={field.onChange}
                                            />
                                        </FormControl>
                                    </FormItem>
                                )}
                            />

                            <FormField
                                control={form.control}
                                name="repeatDaily"
                                render={({ field }) => (
                                    <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                                        <FormControl>
                                            <Checkbox
                                                checked={field.value}
                                                onCheckedChange={field.onChange}
                                            />
                                        </FormControl>
                                        <div className="space-y-1 leading-none">
                                            <FormLabel>
                                                Repetir diariamente
                                            </FormLabel>
                                        </div>
                                    </FormItem>
                                )}
                            />
                        </div>
                    </div>
                </fieldset>

                <DialogFooter>
                    <Button type="button" variant="ghost" onClick={onFinished} disabled={isSending}>Cancelar</Button>
                    <Button type="submit" disabled={isSending}>
                        {isSending ? (
                            <>
                                <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                                Salvando...
                            </>
                        ) : (
                            'Salvar Agendamento'
                        )}
                    </Button>
                </DialogFooter>
            </form>
        </Form>
    )
}


export default function ScheduleMessagePage() {
  const { firestore, user } = useFirebase();
  const { toast } = useToast();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [dialogConfig, setDialogConfig] = useState<{
    mode: 'create' | 'edit' | 'duplicate';
    message?: ScheduledMessage;
  }>({ mode: 'create' });
  const [isSendingNow, setIsSendingNow] = useState<Record<string, boolean>>({});

  const scheduledMessagesQuery = useMemoFirebase(() => {
    if (!user) return null;
    return query(collection(firestore, 'users', user.uid, 'scheduled_messages'), orderBy('sendAt', 'desc'));
  }, [firestore, user]);

  const { data: scheduledMessages, isLoading } = useCollection<ScheduledMessage>(scheduledMessagesQuery);

  const handleDelete = (message: ScheduledMessage) => {
    if (!user) return;
    const docRef = doc(firestore, 'users', user.uid, 'scheduled_messages', message.id);
    deleteDocumentNonBlocking(docRef);
    toast({ title: 'Agendamento Removido', description: 'A mensagem foi removida da lista de agendamentos.' });
  };

  const handleOpenCreate = () => {
    setDialogConfig({ mode: 'create' });
    setIsDialogOpen(true);
  };

  const handleOpenEdit = (msg: ScheduledMessage) => {
    setDialogConfig({ mode: 'edit', message: msg });
    setIsDialogOpen(true);
  };

  const handleOpenDuplicate = (msg: ScheduledMessage) => {
    setDialogConfig({ mode: 'duplicate', message: msg });
    setIsDialogOpen(true);
  };

  const handleSendNow = async (msg: ScheduledMessage) => {
    if (!user) return;
    setIsSendingNow(prev => ({ ...prev, [msg.id]: true }));
    try {
        const settingsDocRef = doc(firestore, 'users', user.uid, 'settings', 'config');
        const settingsSnap = await getDoc(settingsDocRef);
        if (!settingsSnap.exists()) {
            toast({ variant: 'destructive', title: 'Erro', description: 'Configurações de token não encontradas.' });
            setIsSendingNow(prev => ({ ...prev, [msg.id]: false }));
            return;
        }
        const settings = settingsSnap.data() as Settings;
        const msgToken = msg.useBillingZap && settings.useSeparateBillingZap && settings.billingWebhookToken 
            ? settings.billingWebhookToken 
            : settings.webhookToken;
            
        if (!msgToken) {
            toast({ variant: 'destructive', title: 'Erro', description: 'Token de disparo não configurado.' });
            setIsSendingNow(prev => ({ ...prev, [msg.id]: false }));
            return;
        }

        const docRef = doc(firestore, 'users', user.uid, 'scheduled_messages', msg.id);
        await updateDoc(docRef, { status: 'Sending' });

        const response = await fetch('/api/send-group-message', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                jid: msg.jid,
                message: msg.message,
                imageUrl: msg.imageUrl,
                token: msgToken,
                supportNumber: msg.supportNumber,
                siteLink: msg.siteLink
            })
        });

        if (response.ok) {
            if (msg.repeatDaily) {
                await updateDoc(docRef, {
                    sendAt: Timestamp.fromDate(addDays(msg.sendAt.toDate(), 1)),
                    status: 'Scheduled',
                    retryCount: 0,
                    errorReason: null
                });
            } else {
                await updateDoc(docRef, {
                    status: 'Sent',
                    errorReason: null
                });
            }
            toast({ title: 'Mensagem Enviada!', description: 'A mensagem foi disparada com sucesso para o grupo.' });
        } else {
            let errorMsg = 'Erro desconhecido';
            try {
                const errData = await response.json();
                errorMsg = errData.error || errData.details || response.statusText || `Status ${response.status}`;
            } catch {
                try {
                    const errText = await response.text();
                    errorMsg = errText || `Status ${response.status}`;
                } catch {}
            }
            
            await updateDoc(docRef, {
                status: 'Error',
                errorReason: errorMsg
            });
            toast({ variant: 'destructive', title: 'Erro ao enviar agendamento', description: errorMsg });
        }
    } catch (err: any) {
        console.error("Error sending scheduled message now:", err);
        toast({ variant: 'destructive', title: 'Erro de processamento', description: err.message || 'Erro ao processar envio imediato.' });
    } finally {
        setIsSendingNow(prev => ({ ...prev, [msg.id]: false }));
    }
  };
  
  const getStatusVariant = (status: string) => {
    switch (status) {
      case 'Scheduled': return 'default';
      case 'Sent': return 'secondary';
      case 'Error': return 'destructive';
      case 'Sending': return 'secondary';
      default: return 'outline';
    }
  };

  const translateStatus = (status: string): string => {
    switch (status) {
      case 'Scheduled':
        return 'Agendado';
      case 'Sent':
        return 'Enviado';
      case 'Error':
        return 'Erro';
      case 'Sending':
        return 'Enviando...';
      default:
        return status;
    }
  };

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title="Agendar Mensagens"
        description="Agende o envio de mensagens para os grupos cadastrados."
      >
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <Button size="sm" className="gap-1" onClick={handleOpenCreate}>
                <PlusCircle className="h-4 w-4" />
                Agendar Mensagem
            </Button>
            <DialogContent className="sm:max-w-lg">
                <ScheduleMessageForm 
                    onFinished={() => setIsDialogOpen(false)} 
                    initialMessage={dialogConfig.message}
                    isEditMode={dialogConfig.mode === 'edit'}
                />
            </DialogContent>
        </Dialog>
      </PageHeader>
      <main className="flex-1 overflow-auto p-4 md:p-6">
        <Card>
            <CardHeader>
                <CardTitle>Mensagens Agendadas</CardTitle>
                <CardDescription>
                    Lista de todas as mensagens agendadas para envio.
                </CardDescription>
            </CardHeader>
            <CardContent>
                <Table>
                <TableHeader>
                    <TableRow>
                        <TableHead>Grupo (JID)</TableHead>
                        <TableHead>Mensagem</TableHead>
                        <TableHead>Canal</TableHead>
                        <TableHead>Data de Envio</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Ações</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                     {isLoading && (
                        <TableRow>
                            <TableCell colSpan={6} className="text-center">Carregando...</TableCell>
                        </TableRow>
                     )}
                     {!isLoading && scheduledMessages?.map((msg) => (
                        <TableRow key={msg.id}>
                            <TableCell className="font-medium truncate max-w-xs">{msg.jid}</TableCell>
                            <TableCell className="truncate max-w-xs">{msg.message}</TableCell>
                            <TableCell>
                                <Badge variant="outline" className="text-xs font-normal">
                                    {msg.useBillingZap ? 'ZAP Cobrança' : 'Hub Principal'}
                                </Badge>
                            </TableCell>
                            <TableCell>{format(msg.sendAt.toDate(), 'dd/MM/yyyy HH:mm')}</TableCell>
                            <TableCell>
                                <div className="flex flex-col gap-1 items-start">
                                    <Badge 
                                        variant={getStatusVariant(msg.status)} 
                                        className={cn(
                                            msg.status === 'Scheduled' && 'bg-blue-500/20 text-blue-700 hover:bg-blue-500/30', 
                                            msg.status === 'Sent' && 'bg-green-500/20 text-green-700 hover:bg-green-500/30'
                                        )}
                                    >
                                        {msg.status === 'Scheduled' && (msg.retryCount || 0) > 0 
                                            ? `Retentando (${msg.retryCount}/1)` 
                                            : translateStatus(msg.status)}
                                    </Badge>
                                    {msg.errorReason && (
                                        <span className="text-[11px] text-destructive max-w-xs break-all leading-tight">
                                            {msg.errorReason}
                                        </span>
                                    )}
                                </div>
                            </TableCell>
                            <TableCell className="text-right">
                                <div className="flex items-center justify-end gap-1">
                                    {/* Enviar Agora */}
                                    <Button 
                                        variant="ghost" 
                                        size="icon" 
                                        disabled={msg.status === 'Sending' || isSendingNow[msg.id]}
                                        onClick={() => handleSendNow(msg)}
                                        className="text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 dark:text-emerald-400 dark:hover:bg-emerald-950/30"
                                        title="Enviar Agora"
                                    >
                                        {isSendingNow[msg.id] ? (
                                            <RefreshCw className="h-4 w-4 animate-spin" />
                                        ) : (
                                            <Send className="h-4 w-4" />
                                        )}
                                    </Button>

                                    {/* Editar */}
                                    <Button 
                                        variant="ghost" 
                                        size="icon" 
                                        disabled={msg.status === 'Sending' || isSendingNow[msg.id]}
                                        onClick={() => handleOpenEdit(msg)}
                                        className="text-blue-600 hover:text-blue-700 hover:bg-blue-50 dark:text-blue-400 dark:hover:bg-blue-950/30"
                                        title="Editar"
                                    >
                                        <Pencil className="h-4 w-4" />
                                    </Button>

                                    {/* Duplicar */}
                                    <Button 
                                        variant="ghost" 
                                        size="icon" 
                                        disabled={msg.status === 'Sending' || isSendingNow[msg.id]}
                                        onClick={() => handleOpenDuplicate(msg)}
                                        className="text-amber-600 hover:text-amber-700 hover:bg-amber-50 dark:text-amber-400 dark:hover:bg-amber-950/30"
                                        title="Duplicar"
                                    >
                                        <Copy className="h-4 w-4" />
                                    </Button>

                                    {/* Excluir */}
                                    <AlertDialog>
                                        <AlertDialogTrigger asChild>
                                            <Button variant="ghost" size="icon" disabled={msg.status === 'Sending' || isSendingNow[msg.id]}>
                                                <Trash2 className="h-4 w-4 text-destructive" />
                                            </Button>
                                        </AlertDialogTrigger>
                                        <AlertDialogContent>
                                            <AlertDialogHeader>
                                                <AlertDialogTitle>Você tem certeza?</AlertDialogTitle>
                                                <AlertDialogDescription>
                                                    Essa ação não pode ser desfeita. Isso removerá permanentemente o agendamento.
                                                </AlertDialogDescription>
                                            </AlertDialogHeader>
                                            <AlertDialogFooter>
                                                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                                <AlertDialogAction onClick={() => handleDelete(msg)}>Excluir</AlertDialogAction>
                                            </AlertDialogFooter>
                                        </AlertDialogContent>
                                    </AlertDialog>
                                </div>
                            </TableCell>
                        </TableRow>
                     ))}
                     {!isLoading && scheduledMessages?.length === 0 && (
                        <TableRow>
                            <TableCell colSpan={6} className="text-center">Nenhum agendamento encontrado.</TableCell>
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
