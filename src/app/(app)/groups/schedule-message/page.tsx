'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { PlusCircle, Upload, CalendarIcon, Trash2, RefreshCw } from 'lucide-react';
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
import { collection, query, orderBy, Timestamp, doc } from 'firebase/firestore';
import type { ScheduledMessage } from '@/lib/types';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

const scheduleSchema = z.object({
    jid: z.string().min(1, { message: "O JID do grupo é obrigatório." }),
    message: z.string().min(1, { message: "A mensagem é obrigatória." }),
    image: z.any(), // File upload handling is simplified for now
    sendDate: z.string().min(10, { message: "A data é obrigatória no formato dd/mm/aaaa." }),
    sendHour: z.string().min(1, { message: "A hora é obrigatória." }),
    sendMinute: z.string().min(1, { message: "O minuto é obrigatório." }),
    repeatDaily: z.boolean().default(false),
});

type ScheduleFormData = z.infer<typeof scheduleSchema>;

function ScheduleMessageForm({ onFinished }: { onFinished: () => void }) {
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
            image: null,
            sendDate: '',
            sendHour: new Date().getHours().toString().padStart(2, '0'),
            sendMinute: new Date().getMinutes().toString().padStart(2, '0'),
            repeatDaily: false,
        },
    });

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

    const handleImageChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (file) {
            form.setValue('image', file);
            const reader = new FileReader();
            reader.onloadend = () => {
                setImagePreview(reader.result as string);
            };
            reader.readAsDataURL(file);
        }
    };
    
    const onSubmit = async (values: ScheduleFormData) => {
        if (!user) return;

        setIsSending(true);

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
                imageUrlDataUri = await new Promise((resolve, reject) => {
                    const reader = new FileReader();
                    reader.onload = () => resolve(reader.result as string);
                    reader.onerror = error => reject(error);
                    reader.readAsDataURL(values.image);
                });
            } catch (error) {
                console.error("Error converting image to base64:", error);
                toast({ variant: 'destructive', title: 'Erro ao processar imagem', description: 'Não foi possível ler o arquivo da imagem.' });
                setIsSending(false);
                return;
            }
        }

        const newScheduledMessageForFirestore = {
            userId: user.uid,
            jid: values.jid,
            message: values.message,
            sendAt: sendAtTimestamp,
            repeatDaily: values.repeatDaily,
            status: 'Scheduled' as const,
            imageUrl: imageUrlDataUri || imagePreview || undefined,
        };
        
        addDocumentNonBlocking(collection(firestore, 'users', user.uid, 'scheduled_messages'), newScheduledMessageForFirestore);

        toast({ title: "Mensagem Agendada!", description: "Sua mensagem foi salva e será enviada no horário programado." });
        onFinished();
        setIsSending(false);
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
                    <FormItem>
                        <FormLabel>Imagem</FormLabel>
                        <FormControl>
                            <Button type="button" variant="outline" className="w-full" onClick={() => imageInputRef.current?.click()}>
                            <Upload className="mr-2 h-4 w-4" />
                            Selecionar Imagem (Opcional)
                            </Button>
                        </FormControl>
                        <Input ref={imageInputRef} type="file" accept="image/*" className="hidden" onChange={handleImageChange} />
                        {imagePreview && <img src={imagePreview} alt="Preview" className="mt-2 h-20 w-20 object-cover rounded-md" data-ai-hint="image preview" />}
                        <FormMessage />
                    </FormItem>
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
                        <div className="flex items-center space-x-2 pt-2">
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
  
   const getStatusVariant = (status: 'Scheduled' | 'Sent' | 'Error') => {
    switch (status) {
      case 'Scheduled': return 'default';
      case 'Sent': return 'secondary'; // Could be green
      case 'Error': return 'destructive';
      default: return 'outline';
    }
  };

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title="Agendar Mensagens"
        description="Agende o envio de mensagens para os grupos cadastrados."
      >
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
                <Button size="sm" className="gap-1">
                    <PlusCircle className="h-4 w-4" />
                    Agendar Mensagem
                </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-lg">
                <ScheduleMessageForm onFinished={() => setIsDialogOpen(false)} />
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
                        <TableHead>Data de Envio</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Ações</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                     {isLoading && (
                        <TableRow>
                            <TableCell colSpan={5} className="text-center">Carregando...</TableCell>
                        </TableRow>
                     )}
                     {!isLoading && scheduledMessages?.map((msg) => (
                        <TableRow key={msg.id}>
                            <TableCell className="font-medium truncate max-w-xs">{msg.jid}</TableCell>
                            <TableCell className="truncate max-w-xs">{msg.message}</TableCell>
                            <TableCell>{format(msg.sendAt.toDate(), 'dd/MM/yyyy HH:mm')}</TableCell>
                            <TableCell>
                                <Badge variant={getStatusVariant(msg.status)} className={cn(msg.status === 'Scheduled' && 'bg-blue-500/20 text-blue-700 hover:bg-blue-500/30', msg.status === 'Sent' && 'bg-green-500/20 text-green-700 hover:bg-green-500/30')}>{msg.status}</Badge>
                            </TableCell>
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
                                                Essa ação não pode ser desfeita. Isso removerá permanentemente o agendamento.
                                            </AlertDialogDescription>
                                        </AlertDialogHeader>
                                        <AlertDialogFooter>
                                            <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                            <AlertDialogAction onClick={() => handleDelete(msg)}>Excluir</AlertDialogAction>
                                        </AlertDialogFooter>
                                    </AlertDialogContent>
                                </AlertDialog>
                            </TableCell>
                        </TableRow>
                     ))}
                     {!isLoading && scheduledMessages?.length === 0 && (
                        <TableRow>
                            <TableCell colSpan={5} className="text-center">Nenhum agendamento encontrado.</TableCell>
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
