'use client';

import { useState, useRef, useEffect, Suspense, useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import { PlusCircle, Upload, CalendarIcon, Trash2, RefreshCw, AlertTriangle, Pencil, Copy, Send, RotateCcw, ListFilter, Search, Check, CheckCircle2, X, Plus, ExternalLink, MousePointerClick } from 'lucide-react';
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
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useFirebase, useUser, addDocumentNonBlocking, useCollection, useMemoFirebase, deleteDocumentNonBlocking } from '@/firebase';
import { collection, query, orderBy, Timestamp, doc, getDoc, updateDoc } from 'firebase/firestore';
import type { ScheduledMessage, Settings, ScheduledGroupButton } from '@/lib/types';
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

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

interface ListedGroup {
    jid: string;
    name: string;
    participantCount: number;
}

function ScheduleMessageForm({ 
    onFinished, 
    initialMessage,
    initialJid = '',
    isEditMode = false 
}: { 
    onFinished: () => void; 
    initialMessage?: ScheduledMessage;
    initialJid?: string;
    isEditMode?: boolean;
}) {
    const { firestore, user } = useFirebase();
    const { toast } = useToast();
    const imageInputRef = useRef<HTMLInputElement>(null);
    const [imagePreview, setImagePreview] = useState<string | null>(null);
    const [isSending, setIsSending] = useState(false);

    const [isLoadingGroups, setIsLoadingGroups] = useState(false);
    const [availableGroups, setAvailableGroups] = useState<ListedGroup[] | null>(null);
    const [showGroupPicker, setShowGroupPicker] = useState(false);
    const [groupSearchQuery, setGroupSearchQuery] = useState('');
    const [selectedGroupName, setSelectedGroupName] = useState<string | null>(null);

    const [buttons, setButtons] = useState<ScheduledGroupButton[]>(() => {
        if (initialMessage?.buttons && initialMessage.buttons.length > 0) {
            return initialMessage.buttons;
        }
        if (initialMessage?.siteLink || initialMessage?.supportNumber) {
            const legacy: ScheduledGroupButton[] = [];
            if (initialMessage.siteLink) {
                legacy.push({ id: 'btn-1', label: 'Comprar Agora', type: 'url', value: initialMessage.siteLink });
            }
            if (initialMessage.supportNumber) {
                legacy.push({ id: 'btn-2', label: 'Preciso de Suporte', type: 'contact', value: initialMessage.supportNumber });
            }
            return legacy;
        }
        return [
            { id: 'btn-1', label: 'Comprar Agora', type: 'url', value: '' },
            { id: 'btn-2', label: 'Preciso de Suporte', type: 'contact', value: '' },
        ];
    });

    const form = useForm<ScheduleFormData>({
        resolver: zodResolver(scheduleSchema),
        defaultValues: {
            jid: initialJid || '',
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

            if (initialMessage.buttons && initialMessage.buttons.length > 0) {
                setButtons(initialMessage.buttons);
            } else if (initialMessage.siteLink || initialMessage.supportNumber) {
                const legacy: ScheduledGroupButton[] = [];
                if (initialMessage.siteLink) {
                    legacy.push({ id: 'btn-1', label: 'Comprar Agora', type: 'url', value: initialMessage.siteLink });
                }
                if (initialMessage.supportNumber) {
                    legacy.push({ id: 'btn-2', label: 'Preciso de Suporte', type: 'contact', value: initialMessage.supportNumber });
                }
                setButtons(legacy);
            } else {
                setButtons([
                    { id: 'btn-1', label: 'Comprar Agora', type: 'url', value: '' },
                    { id: 'btn-2', label: 'Preciso de Suporte', type: 'contact', value: '' },
                ]);
            }
        } else if (initialJid) {
            form.setValue('jid', initialJid);
            setButtons([
                { id: 'btn-1', label: 'Comprar Agora', type: 'url', value: '' },
                { id: 'btn-2', label: 'Preciso de Suporte', type: 'contact', value: '' },
            ]);
        } else {
            setButtons([
                { id: 'btn-1', label: 'Comprar Agora', type: 'url', value: '' },
                { id: 'btn-2', label: 'Preciso de Suporte', type: 'contact', value: '' },
            ]);
        }
    }, [initialMessage, initialJid, form]);

    const handleAddButton = () => {
        if (buttons.length >= 3) {
            toast({ variant: 'destructive', title: 'Limite de botões', description: 'O WhatsApp suporta no máximo 3 botões por mensagem.' });
            return;
        }
        setButtons(prev => [
            ...prev,
            {
                id: `btn-${Date.now()}`,
                label: `Botão ${prev.length + 1}`,
                type: 'url',
                value: '',
            }
        ]);
    };

    const handleRemoveButton = (id: string) => {
        setButtons(prev => prev.filter(b => b.id !== id));
    };

    const handleUpdateButton = (id: string, field: 'label' | 'type' | 'value', val: string) => {
        setButtons(prev => prev.map(b => {
            if (b.id !== id) return b;
            return { ...b, [field]: val };
        }));
    };

    const handleFetchConnectedGroups = async () => {
        if (!user) return;
        setIsLoadingGroups(true);
        try {
            const settingsDocRef = doc(firestore, 'users', user.uid, 'settings', 'config');
            const settingsSnap = await getDoc(settingsDocRef);
            const token = settingsSnap.exists() ? (settingsSnap.data() as Settings).webhookToken : '';

            if (!token) {
                toast({ variant: 'destructive', title: 'WhatsApp não conectado', description: 'Configure seu token antes de buscar grupos.' });
                return;
            }

            const response = await fetch('/api/groups/list', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ token }),
            });

            const data = await response.json().catch(() => ({}));
            if (!response.ok || !data.success) {
                throw new Error(data.error || 'Falha ao buscar grupos.');
            }

            const groups = data.groups || [];
            setAvailableGroups(groups);
            setShowGroupPicker(true);

            // Atualiza nome do grupo selecionado se já houver JID
            const currentJid = form.getValues('jid');
            if (currentJid) {
                const found = groups.find((g: ListedGroup) => g.jid === currentJid);
                if (found) setSelectedGroupName(found.name);
            }
        } catch (err: any) {
            toast({ variant: 'destructive', title: 'Erro ao listar grupos', description: err.message });
        } finally {
            setIsLoadingGroups(false);
        }
    };

    // Auto-carrega grupos ao abrir o formulário
    useEffect(() => {
        if (!availableGroups && user) {
            handleFetchConnectedGroups();
        }
    }, [user]);

    const filteredGroups = useMemo(() => {
        if (!availableGroups) return [];
        if (!groupSearchQuery.trim()) return availableGroups;
        const queryNorm = groupSearchQuery.toLowerCase().trim();
        return availableGroups.filter(g => 
            g.name.toLowerCase().includes(queryNorm) || 
            g.jid.toLowerCase().includes(queryNorm)
        );
    }, [availableGroups, groupSearchQuery]);

    const handleSelectGroup = (group: ListedGroup) => {
        form.setValue('jid', group.jid);
        setSelectedGroupName(group.name);
        setGroupSearchQuery('');
        setShowGroupPicker(false);
    };

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

        // Imagem é opcional se já existir preview no modo de edição
        if (!values.image && !imagePreview && !values.message) {
            form.setError('message', { type: 'manual', message: 'Preencha a mensagem ou selecione uma imagem.' });
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

        let finalImageUrl: string | null = null;
        if (values.image instanceof File) {
            try {
                finalImageUrl = await compressImage(values.image);
            } catch (error) {
                console.error("Error compressing image:", error);
                toast({ variant: 'destructive', title: 'Erro ao processar imagem', description: 'Não foi possível compactar a imagem.' });
                setIsSending(false);
                return;
            }
        } else if (imagePreview) {
            finalImageUrl = imagePreview;
        }

        const validButtons = buttons
            .filter(b => b.label.trim() && b.value.trim())
            .map(b => ({
                id: b.id,
                label: b.label.trim(),
                type: b.type,
                value: b.value.trim()
            }));

        const legacySiteLink = validButtons.find(b => b.type === 'url')?.value || null;
        const legacySupportNumber = validButtons.find(b => b.type === 'contact')?.value || null;

        try {
            if (isEditMode && initialMessage) {
                const docRef = doc(firestore, 'users', user.uid, 'scheduled_messages', initialMessage.id);
                await updateDoc(docRef, {
                    jid: values.jid,
                    message: values.message,
                    sendAt: sendAtTimestamp,
                    repeatDaily: Boolean(values.repeatDaily),
                    status: 'Scheduled' as const,
                    imageUrl: finalImageUrl || null,
                    useBillingZap: Boolean(values.useBillingZap),
                    buttons: validButtons,
                    supportNumber: legacySupportNumber,
                    siteLink: legacySiteLink,
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
                    repeatDaily: Boolean(values.repeatDaily),
                    status: 'Scheduled' as const,
                    imageUrl: finalImageUrl || null,
                    useBillingZap: Boolean(values.useBillingZap),
                    buttons: validButtons,
                    supportNumber: legacySupportNumber,
                    siteLink: legacySiteLink,
                    errorReason: null,
                    retryCount: 0,
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
                        <DialogTitle>{isEditMode ? 'Editar Agendamento' : 'Agendar Mensagem de Grupo'}</DialogTitle>
                        <DialogDescription>
                            Preencha os detalhes para programar o disparo da mensagem no grupo.
                        </DialogDescription>
                    </DialogHeader>
                    <Alert className="border-yellow-400 bg-yellow-50 text-yellow-800 dark:border-yellow-600 dark:bg-yellow-950/50 dark:text-yellow-300 [&>svg]:text-yellow-600 dark:[&>svg]:text-yellow-400">
                        <AlertTriangle className="h-4 w-4" />
                        <AlertTitle className="font-bold">Atenção</AlertTitle>
                        <AlertDescription>
                        ⚠️ O WhatsApp conectado precisa participar do grupo para enviar a mensagem. 🔐
                        </AlertDescription>
                    </Alert>

                    {/* Campo de Grupo com Pesquisa Integrada */}
                    <FormField
                        control={form.control}
                        name="jid"
                        render={({ field }) => (
                            <FormItem className="space-y-1.5">
                                <div className="flex items-center justify-between">
                                    <FormLabel>Grupo de Destino (JID)</FormLabel>
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        size="sm"
                                        onClick={handleFetchConnectedGroups}
                                        disabled={isLoadingGroups}
                                        className="h-6 text-xs text-primary gap-1 px-1.5"
                                    >
                                        <ListFilter className="h-3 w-3" />
                                        {isLoadingGroups ? 'Buscando...' : (availableGroups ? 'Atualizar Grupos' : 'Buscar Meus Grupos')}
                                    </Button>
                                </div>

                                <FormControl>
                                    <div className="relative">
                                        <Input 
                                            placeholder="Digite o JID ou pesquise pelo nome do grupo..." 
                                            {...field}
                                            onChange={(e) => {
                                                field.onChange(e.target.value);
                                                setGroupSearchQuery(e.target.value);
                                                if (availableGroups && availableGroups.length > 0) {
                                                    setShowGroupPicker(true);
                                                }
                                                // Se digitou diretamente um JID que coincide com um grupo conhecido
                                                if (availableGroups) {
                                                    const match = availableGroups.find(g => g.jid === e.target.value || g.name.toLowerCase() === e.target.value.toLowerCase());
                                                    if (match) {
                                                        setSelectedGroupName(match.name);
                                                    } else {
                                                        setSelectedGroupName(null);
                                                    }
                                                }
                                            }}
                                            onFocus={() => {
                                                if (availableGroups && availableGroups.length > 0) {
                                                    setShowGroupPicker(true);
                                                }
                                            }}
                                        />
                                    </div>
                                </FormControl>

                                {selectedGroupName && (
                                    <div className="flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400 font-medium pt-0.5">
                                        <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                                        <span>Grupo selecionado: <strong>{selectedGroupName}</strong></span>
                                    </div>
                                )}
                                <FormMessage />

                                {/* Menu Dropdown com Busca e Grupos Conectados */}
                                {showGroupPicker && availableGroups && (
                                    <div className="mt-2 border rounded-lg p-2.5 bg-card shadow-lg max-h-60 overflow-hidden flex flex-col space-y-2 z-50 border-primary/20">
                                        <div className="flex items-center justify-between text-xs font-semibold text-muted-foreground pb-1 border-b">
                                            <span className="flex items-center gap-1">
                                                <Search className="h-3.5 w-3.5 text-primary" />
                                                Buscar nos Grupos Conectados ({filteredGroups.length})
                                            </span>
                                            <button 
                                                type="button" 
                                                onClick={() => setShowGroupPicker(false)} 
                                                className="text-[11px] text-muted-foreground hover:text-foreground hover:underline"
                                            >
                                                Fechar ✕
                                            </button>
                                        </div>

                                        {/* Barra de Pesquisa Rápida */}
                                        <div className="relative">
                                            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
                                            <Input
                                                placeholder="Digite para filtrar por nome ou JID..."
                                                value={groupSearchQuery}
                                                onChange={(e) => setGroupSearchQuery(e.target.value)}
                                                className="h-8 pl-8 pr-7 text-xs bg-muted/30"
                                                autoFocus
                                            />
                                            {groupSearchQuery && (
                                                <button
                                                    type="button"
                                                    onClick={() => setGroupSearchQuery('')}
                                                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                                                >
                                                    <X className="h-3.5 w-3.5" />
                                                </button>
                                            )}
                                        </div>

                                        {/* Lista de Grupos Filtrada */}
                                        <div className="overflow-y-auto max-h-36 space-y-1 pr-1">
                                            {filteredGroups.map(g => (
                                                <button
                                                    key={g.jid}
                                                    type="button"
                                                    onClick={() => handleSelectGroup(g)}
                                                    className={cn(
                                                        "w-full flex items-center justify-between p-2 rounded text-left hover:bg-muted text-xs transition-colors",
                                                        field.value === g.jid && "bg-primary/10 border border-primary/40 text-primary font-medium"
                                                    )}
                                                >
                                                    <div className="min-w-0 flex-1 pr-2">
                                                        <div className="font-semibold truncate">{g.name}</div>
                                                        <div className="text-[10px] font-mono text-muted-foreground truncate">{g.jid}</div>
                                                    </div>
                                                    {field.value === g.jid && <Check className="h-3.5 w-3.5 text-primary shrink-0" />}
                                                </button>
                                            ))}
                                            {filteredGroups.length === 0 && (
                                                <p className="text-xs text-muted-foreground text-center py-3 italic">
                                                    Nenhum grupo encontrado para "{groupSearchQuery}".
                                                </p>
                                            )}
                                        </div>
                                    </div>
                                )}
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
                                    <Textarea placeholder="Escreva sua mensagem... (pode usar @todos ou @all para mencionar)" className="resize-none" rows={3} {...field} />
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
                                <FormLabel>Imagem (Opcional)</FormLabel>
                                <FormControl>
                                    <Button type="button" variant="outline" className="w-full" onClick={() => imageInputRef.current?.click()}>
                                    <Upload className="mr-2 h-4 w-4" />
                                    {field.value || imagePreview ? 'Alterar Imagem' : 'Selecionar Imagem'}
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
                                {imagePreview && (
                                    <div className="flex items-center gap-2 mt-2">
                                        <img src={imagePreview} alt="Preview" className="h-16 w-16 object-cover rounded-md border" />
                                        <Button
                                            type="button"
                                            variant="ghost"
                                            size="sm"
                                            className="text-xs text-destructive h-7"
                                            onClick={() => {
                                                setImagePreview(null);
                                                field.onChange(undefined);
                                            }}
                                        >
                                            Remover Imagem
                                        </Button>
                                    </div>
                                )}
                                <FormMessage />
                            </FormItem>
                        )}
                    />

                    {/* Seção de Botões Interativos */}
                    <div className="space-y-3 rounded-lg border p-3.5 bg-muted/20">
                        <div className="flex items-center justify-between gap-2">
                            <div>
                                <div className="text-sm font-semibold flex items-center gap-1.5">
                                    <ExternalLink className="h-4 w-4 text-primary" />
                                    Botões Interativos ({buttons.length}/3)
                                </div>
                                <p className="text-xs text-muted-foreground">
                                    Adicione até 3 botões com link do site ou WhatsApp direto.
                                </p>
                            </div>
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={handleAddButton}
                                disabled={buttons.length >= 3}
                                className="h-8 text-xs gap-1 shrink-0"
                            >
                                <Plus className="h-3.5 w-3.5" />
                                Adicionar Botão
                            </Button>
                        </div>

                        {buttons.length === 0 ? (
                            <p className="text-xs text-muted-foreground italic text-center py-2">
                                Nenhum botão adicionado. A mensagem será enviada sem botões.
                            </p>
                        ) : (
                            <div className="space-y-2.5 pt-1">
                                {buttons.map((btn, index) => (
                                    <div key={btn.id} className="p-2.5 border rounded-md bg-card space-y-2 shadow-sm">
                                        <div className="flex items-center justify-between gap-2">
                                            <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                                                Botão #{index + 1}
                                            </span>
                                            <Button
                                                type="button"
                                                variant="ghost"
                                                size="sm"
                                                onClick={() => handleRemoveButton(btn.id)}
                                                className="h-6 w-6 p-0 text-destructive hover:bg-destructive/10"
                                                title="Remover botão"
                                            >
                                                <Trash2 className="h-3.5 w-3.5" />
                                            </Button>
                                        </div>

                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                            <div>
                                                <Label className="text-xs">Texto do Botão</Label>
                                                <Input
                                                    value={btn.label}
                                                    onChange={(e) => handleUpdateButton(btn.id, 'label', e.target.value)}
                                                    placeholder="Ex: Comprar Agora"
                                                    className="h-8 text-xs mt-1"
                                                />
                                            </div>
                                            <div>
                                                <Label className="text-xs">Tipo de Ação</Label>
                                                <Select
                                                    value={btn.type}
                                                    onValueChange={(val: 'url' | 'contact') => handleUpdateButton(btn.id, 'type', val)}
                                                >
                                                    <SelectTrigger className="h-8 text-xs mt-1">
                                                        <SelectValue />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        <SelectItem value="url">🔗 Link do Site (URL)</SelectItem>
                                                        <SelectItem value="contact">💬 Contato WhatsApp</SelectItem>
                                                    </SelectContent>
                                                </Select>
                                            </div>
                                        </div>

                                        <div>
                                            <Label className="text-xs">
                                                {btn.type === 'contact' ? 'Número WhatsApp de Suporte' : 'Endereço do Link (URL)'}
                                            </Label>
                                            <Input
                                                value={btn.value}
                                                onChange={(e) => handleUpdateButton(btn.id, 'value', e.target.value)}
                                                placeholder={btn.type === 'contact' ? 'Ex: 5511999998888' : 'Ex: https://seusite.com'}
                                                className="h-8 text-xs mt-1"
                                            />
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
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
                                    <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3">
                                        <div className="space-y-0.5">
                                            <FormLabel className="text-sm font-medium">Usar ZAP Cobrança</FormLabel>
                                            <p className="text-[12px] text-muted-foreground mr-4">
                                                Dispara pelo WhatsApp de cobrança. Se desmarcado, utiliza o Hub Principal.
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
                                            <FormLabel className="text-sm">
                                                Repetir diariamente no mesmo horário
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
    );
}

function ScheduleMessageContent() {
  const { firestore, user } = useFirebase();
  const searchParams = useSearchParams();
  const initialJid = searchParams.get('jid') || '';

  const { toast } = useToast();
  const [isDialogOpen, setIsDialogOpen] = useState(Boolean(initialJid));
  const [dialogConfig, setDialogConfig] = useState<{
    mode: 'create' | 'edit' | 'duplicate';
    message?: ScheduledMessage;
    jid?: string;
  }>({ mode: 'create', jid: initialJid });
  const [isSendingNow, setIsSendingNow] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (initialJid) {
      setDialogConfig({ mode: 'create', jid: initialJid });
      setIsDialogOpen(true);
    }
  }, [initialJid]);

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

  const handleResetStatus = async (message: ScheduledMessage) => {
    if (!user) return;
    try {
        const docRef = doc(firestore, 'users', user.uid, 'scheduled_messages', message.id);
        await updateDoc(docRef, {
            status: 'Scheduled',
            retryCount: 0,
            errorReason: null
        });
        toast({ title: 'Status Destravado', description: 'A mensagem voltou ao status Agendado com sucesso.' });
    } catch (err: any) {
        toast({ variant: 'destructive', title: 'Erro ao destravar', description: err.message || 'Não foi possível atualizar o status.' });
    }
  };

  const handleOpenCreate = () => {
    setDialogConfig({ mode: 'create', jid: '' });
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
                buttons: msg.buttons,
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
            toast({ title: 'Mensagem Enviada!', description: 'A mensagem foi disparada com sucesso para o grupo via UazAPI.' });
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
        title="Agendar Mensagens de Grupo"
        description="Agende envios automáticos para grupos do WhatsApp através da API oficial da UazAPI."
      >
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <Button size="sm" className="gap-1" onClick={handleOpenCreate}>
                <PlusCircle className="h-4 w-4" />
                Agendar Mensagem
            </Button>
            <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
                <ScheduleMessageForm 
                    onFinished={() => setIsDialogOpen(false)} 
                    initialMessage={dialogConfig.message}
                    initialJid={dialogConfig.jid}
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
                    Lista de todas as mensagens agendadas para envio em grupos.
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
                            <TableCell colSpan={6} className="text-center py-6">Carregando agendamentos...</TableCell>
                        </TableRow>
                     )}
                     {!isLoading && scheduledMessages?.map((msg) => (
                        <TableRow key={msg.id}>
                            <TableCell className="font-medium truncate max-w-xs">{msg.jid}</TableCell>
                            <TableCell className="max-w-xs">
                                <div className="truncate font-medium">{msg.message}</div>
                                {msg.buttons && msg.buttons.length > 0 ? (
                                    <div className="flex flex-wrap gap-1 mt-1">
                                        {msg.buttons.map(b => (
                                            <span key={b.id} className="inline-flex items-center gap-0.5 text-[10px] bg-muted px-1.5 py-0.5 rounded text-muted-foreground border">
                                                {b.type === 'contact' ? '💬' : '🔗'} {b.label}
                                            </span>
                                        ))}
                                    </div>
                                ) : (msg.siteLink || msg.supportNumber) ? (
                                    <div className="flex flex-wrap gap-1 mt-1">
                                        {msg.siteLink && (
                                            <span className="inline-flex items-center gap-0.5 text-[10px] bg-muted px-1.5 py-0.5 rounded text-muted-foreground border">
                                                🔗 Comprar Agora
                                            </span>
                                        )}
                                        {msg.supportNumber && (
                                            <span className="inline-flex items-center gap-0.5 text-[10px] bg-muted px-1.5 py-0.5 rounded text-muted-foreground border">
                                                💬 Preciso de Suporte
                                            </span>
                                        )}
                                    </div>
                                ) : null}
                            </TableCell>
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
                                    {/* Destravar / Resetar Status */}
                                    {msg.status === 'Sending' && (
                                        <Button 
                                            variant="ghost" 
                                            size="icon" 
                                            disabled={isSendingNow[msg.id]}
                                            onClick={() => handleResetStatus(msg)}
                                            className="text-amber-600 hover:text-amber-700 hover:bg-amber-50 dark:text-amber-400 dark:hover:bg-amber-950/30"
                                            title="Destravar / Resetar para Agendado"
                                        >
                                            <RotateCcw className="h-4 w-4" />
                                        </Button>
                                    )}

                                    {/* Enviar Agora */}
                                    <Button 
                                        variant="ghost" 
                                        size="icon" 
                                        disabled={isSendingNow[msg.id]}
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
                                        disabled={isSendingNow[msg.id]}
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
                                        disabled={isSendingNow[msg.id]}
                                        onClick={() => handleOpenDuplicate(msg)}
                                        className="text-amber-600 hover:text-amber-700 hover:bg-amber-50 dark:text-amber-400 dark:hover:bg-amber-950/30"
                                        title="Duplicar"
                                    >
                                        <Copy className="h-4 w-4" />
                                    </Button>

                                    {/* Excluir */}
                                    <AlertDialog>
                                        <AlertDialogTrigger asChild>
                                            <Button variant="ghost" size="icon" disabled={isSendingNow[msg.id]} title="Excluir Agendamento">
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
                            <TableCell colSpan={6} className="text-center py-6 text-muted-foreground">Nenhum agendamento encontrado.</TableCell>
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

export default function ScheduleMessagePage() {
  return (
    <Suspense fallback={<div className="p-6 text-muted-foreground">Carregando agendamentos...</div>}>
      <ScheduleMessageContent />
    </Suspense>
  );
}
