
'use client';

import { Lock, Unlock, Gift, CalendarDays, UserPlus, Check, Copy, Trash2 } from 'lucide-react';
import Image from 'next/image';
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
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useFirebase, useUser, setDocumentNonBlocking, useCollection, useMemoFirebase } from '@/firebase';
import { collection, query, getDocs, orderBy, doc, where, Timestamp, deleteDoc, limit } from 'firebase/firestore';
import type { UserProfile, UserPermissions } from '@/lib/types';
import { useState, useCallback, useEffect, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from '@/components/ui/form';
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { differenceInSeconds, addDays, format } from 'date-fns';

const permissionsSchema = z.object({
  dashboard: z.boolean().default(false),
  customers: z.boolean().default(false),
  inbox: z.boolean().default(false),
  automations: z.boolean().default(false),
  groups: z.boolean().default(false),
  shot: z.boolean().default(false),
  zapconnect: z.boolean().default(false),
  settings: z.boolean().default(false),
  estoque: z.boolean().default(false),
  notes: z.boolean().default(false),
  ads: z.boolean().default(false),
  pix: z.boolean().default(false),
  logs: z.boolean().default(false),
});

type UserFormData = z.infer<typeof userFormSchema>;

const permissionLabels: { key: keyof UserPermissions, label: string }[] = [
    { key: 'dashboard', label: 'Início (Dash)' },
    { key: 'customers', label: 'Clientes (Todos, Leads, Suporte)' },
    { key: 'automations', label: 'Automações (Vencimento, etc)' },
    { key: 'groups', label: 'Grupos (JID, Extração, Agenda)' },
    { key: 'shot', label: 'Disparo em Massa' },
    { key: 'notes', label: 'Notas (Minhas Tarefas)' },
    { key: 'ads', label: 'Relatórios (Anúncios)' },
    { key: 'zapconnect', label: 'ZapConexão (Pareamento)' },
    { key: 'pix', label: 'Gerar Pix (Cobrança)' },
    { key: 'estoque', label: 'Estoque de Contas' },
    { key: 'settings', label: 'Configurações' },
    { key: 'logs', label: 'Logs de Envio' },
];

const userFormSchema = z.object({
  permissions: permissionsSchema,
  subscriptionEndDate: z.string().optional(),
});

function UserEditForm({ attendant, onFinished }: { attendant: UserProfile, onFinished: () => void }) {
    const { firestore } = useFirebase();
    const { toast } = useToast();

    const form = useForm<UserFormData>({
        resolver: zodResolver(userFormSchema),
        defaultValues: {
            permissions: {
                dashboard: attendant.permissions?.dashboard ?? true,
                customers: attendant.permissions?.customers ?? false,
                inbox: attendant.permissions?.inbox ?? false,
                automations: attendant.permissions?.automations ?? false,
                groups: attendant.permissions?.groups ?? false,
                shot: attendant.permissions?.shot ?? false,
                zapconnect: attendant.permissions?.zapconnect ?? false,
                settings: attendant.permissions?.settings ?? false,
                estoque: attendant.permissions?.estoque ?? false,
                notes: attendant.permissions?.notes ?? false,
                ads: attendant.permissions?.ads ?? false,
                pix: attendant.permissions?.pix ?? false,
                logs: attendant.permissions?.logs ?? false,
            },
            subscriptionEndDate: attendant.subscriptionEndDate ? format(attendant.subscriptionEndDate.toDate(), 'dd/MM/yyyy') : '',
        },
    });

    const onSubmit = (data: UserFormData) => {
        const userDocRef = doc(firestore, "users", attendant.id);
        
        const dataToUpdate: any = { 
            permissions: data.permissions,
        };

        if (data.subscriptionEndDate && data.subscriptionEndDate.length === 10) {
            const [day, month, year] = data.subscriptionEndDate.split('/');
            const date = new Date(parseInt(year, 10), parseInt(month, 10) - 1, parseInt(day, 10));
            if (!isNaN(date.getTime())) {
                date.setHours(23, 59, 59);
                dataToUpdate.subscriptionEndDate = Timestamp.fromDate(date);
            }
        }

        setDocumentNonBlocking(userDocRef, dataToUpdate, { merge: true });
        toast({ title: "Atendente Atualizado!" });
        onFinished();
    };

    return (
        <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                <DialogHeader>
                    <DialogTitle>Gerenciar Atendente: {attendant.firstName}</DialogTitle>
                    <DialogDescription>Defina quais menus este atendente poderá acessar.</DialogDescription>
                </DialogHeader>

                <div>
                    <Label>Menus Visíveis</Label>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 rounded-md border p-4 mt-2 max-h-[300px] overflow-y-auto">
                        {permissionLabels.map(({ key, label }) => (
                            <FormField
                                key={key}
                                control={form.control}
                                name={`permissions.${key}` as any}
                                render={({ field }) => (
                                    <FormItem className="flex flex-row items-center justify-between space-y-0 p-2 hover:bg-muted/50 rounded-sm">
                                        <FormLabel className="font-normal cursor-pointer text-xs">{label}</FormLabel>
                                        <FormControl>
                                            <Checkbox
                                                checked={field.value}
                                                onCheckedChange={field.onChange}
                                            />
                                        </FormControl>
                                    </FormItem>
                                )}
                            />
                        ))}
                    </div>
                </div>

                <DialogFooter>
                    <Button type="button" variant="ghost" onClick={onFinished}>Cancelar</Button>
                    <Button type="submit">Salvar Alterações</Button>
                </DialogFooter>
            </form>
        </Form>
    );
}

export default function AttendantsPage() {
  const { firestore, user: currentUser } = useFirebase();
  const [editingAttendant, setEditingAttendant] = useState<UserProfile | null>(null);
  const { toast } = useToast();
  const [hasCopied, setHasCopied] = useState(false);

  const attendantsQuery = useMemoFirebase(() => {
    if (!firestore || !currentUser) return null;
    return query(
        collection(firestore, 'users'), 
        where('parentId', '==', currentUser.uid)
    );
  }, [firestore, currentUser]);

  const { data: attendantsRaw, isLoading } = useCollection<UserProfile>(attendantsQuery);

  const attendants = useMemo(() => {
    if (!attendantsRaw) return null;
    return [...attendantsRaw].sort((a, b) => {
        const nameA = a.firstName || '';
        const nameB = b.firstName || '';
        return nameA.localeCompare(nameB);
    });
  }, [attendantsRaw]);

  const handleCopyInviteLink = () => {
      const url = window.location.origin + '/signup?ref=' + currentUser?.uid;
      navigator.clipboard.writeText(url);
      setHasCopied(true);
      toast({ title: "Link de Convite Copiado!" });
      setTimeout(() => setHasCopied(false), 3000);
  };

  const handleGrantTrial = (target: UserProfile) => {
    const newEndDate = addDays(new Date(), 3);
    setDocumentNonBlocking(doc(firestore, "users", target.id), {
        subscriptionEndDate: Timestamp.fromDate(newEndDate),
        status: 'active'
    }, { merge: true });
    toast({ title: "Acesso Liberado (+3 dias)" });
  };

  const handleToggleBlock = (target: UserProfile) => {
    const newStatus = target.status === 'blocked' ? 'active' : 'blocked';
    setDocumentNonBlocking(doc(firestore, "users", target.id), { status: newStatus }, { merge: true });
    toast({ title: `Atendente ${newStatus === 'blocked' ? 'Bloqueado' : 'Desbloqueado'}` });
  };

  const handleDelete = async (target: UserProfile) => {
    await deleteDoc(doc(firestore, "users", target.id));
    toast({ title: "Atendente Removido" });
  };

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title="Gerenciar Equipe"
        description="Gerencie seus atendentes e o que eles podem ver no sistema."
      >
        <Button size="sm" className="gap-2 bg-blue-600 hover:bg-blue-700" onClick={handleCopyInviteLink}>
            {hasCopied ? <Check className="h-4 w-4" /> : <UserPlus className="h-4 w-4" />}
            Convidar Atendente
        </Button>
      </PageHeader>
      <main className="flex-1 overflow-auto p-4 md:p-6">
        <Card>
          <CardHeader>
            <CardTitle>Seus Atendentes</CardTitle>
            <CardDescription>Estes usuários trabalham na sua conta e acessam os seus dados.</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Validade</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow><TableCell colSpan={4} className="text-center">Carregando...</TableCell></TableRow>
                ) : attendants?.map((att) => (
                  <TableRow key={att.id} className={cn(att.status === 'blocked' && "opacity-60")}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <Image src={att.avatarUrl || `https://picsum.photos/seed/${att.id}/40/40`} alt={att.firstName} width={32} height={32} className="rounded-full" />
                        <div>
                          <p className="font-medium text-sm">{att.firstName} {att.lastName}</p>
                          <p className="text-xs text-muted-foreground">{att.email}</p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                        <Badge variant={att.status === 'blocked' ? 'destructive' : 'outline'}>
                            {att.status === 'blocked' ? 'Bloqueado' : 'Ativo'}
                        </Badge>
                    </TableCell>
                    <TableCell className="text-xs">
                        {att.subscriptionEndDate ? format(att.subscriptionEndDate.toDate(), 'dd/MM/yyyy') : 'Vitalício'}
                    </TableCell>
                    <TableCell className="text-right space-x-1">
                        <Button variant="outline" size="sm" onClick={() => handleGrantTrial(att)} className="text-[10px] h-7 px-2">+3 dias</Button>
                        <Button variant="outline" size="sm" onClick={() => setEditingAttendant(att)} className="text-xs h-7">Menus</Button>
                        <Button variant="ghost" size="icon" onClick={() => handleToggleBlock(att)} className="h-7 w-7">
                            {att.status === 'blocked' ? <Unlock className="h-4 w-4" /> : <Lock className="h-4 w-4" />}
                        </Button>
                        <AlertDialog>
                            <AlertDialogTrigger asChild><Button variant="ghost" size="icon" className="h-7 w-7 text-destructive"><Trash2 className="h-4 w-4"/></Button></AlertDialogTrigger>
                            <AlertDialogContent>
                                <AlertDialogHeader><AlertDialogTitle>Remover Atendente?</AlertDialogTitle><AlertDialogDescription>Isso excluirá o acesso de {att.firstName} permanentemente.</AlertDialogDescription></AlertDialogHeader>
                                <AlertDialogFooter><AlertDialogCancel>Voltar</AlertDialogCancel><AlertDialogAction onClick={() => handleDelete(att)}>Excluir</AlertDialogAction></AlertDialogFooter>
                            </AlertDialogContent>
                        </AlertDialog>
                    </TableCell>
                  </TableRow>
                ))}
                {!isLoading && attendants?.length === 0 && <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-8">Nenhum atendente cadastrado.</TableCell></TableRow>}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </main>

      <Dialog open={!!editingAttendant} onOpenChange={(o) => !o && setEditingAttendant(null)}>
        <DialogContent className="sm:max-w-md">
            {editingAttendant && <UserEditForm attendant={editingAttendant} onFinished={() => setEditingAttendant(null)} />}
        </DialogContent>
      </Dialog>
    </div>
  );
}
