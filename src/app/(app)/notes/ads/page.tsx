'use client';

import { useState, useMemo, useEffect } from 'react';
import { PlusCircle, DollarSign, LineChart, MessageSquare, Trash2, Edit, TrendingUp, Wallet } from 'lucide-react';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
import { useFirebase, useUser, useCollection, useMemoFirebase, addDocumentNonBlocking, deleteDocumentNonBlocking, setDocumentNonBlocking } from '@/firebase';
import { collection, query, orderBy, doc, Timestamp } from 'firebase/firestore';
import type { AdCampaign } from '@/lib/types';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { useToast } from '@/hooks/use-toast';
import { format, startOfMonth, endOfMonth, parse } from 'date-fns';
import { Skeleton } from '@/components/ui/skeleton';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';

const campaignSchema = z.object({
  campaignDate: z.string().min(1, 'A data é obrigatória.'),
  amountSpent: z.coerce.number().min(0, 'O valor gasto deve ser positivo.'),
  totalReturn: z.coerce.number().min(0, 'O retorno deve ser positivo.'),
  conversationsStarted: z.coerce.number().int().min(0, 'O número de conversas deve ser positivo.'),
});

function CampaignForm({ onFinished, initialData }: { onFinished: () => void, initialData?: AdCampaign }) {
    const { firestore, user } = useFirebase();
    const { toast } = useToast();
    const isEditing = !!initialData;

    const form = useForm<z.infer<typeof campaignSchema>>({
        resolver: zodResolver(campaignSchema),
        defaultValues: initialData ? {
            campaignDate: format(initialData.campaignDate.toDate(), 'yyyy-MM-dd'),
            amountSpent: initialData.amountSpent,
            totalReturn: initialData.totalReturn,
            conversationsStarted: initialData.conversationsStarted,
        } : {
            campaignDate: format(new Date(), 'yyyy-MM-dd'),
            amountSpent: 0,
            totalReturn: 0,
            conversationsStarted: 0,
        }
    });

    const onSubmit = (values: z.infer<typeof campaignSchema>) => {
        if (!user) return;
        
        const campaignDate = parse(values.campaignDate, 'yyyy-MM-dd', new Date());

        const data = {
            userId: user.uid,
            campaignDate: Timestamp.fromDate(campaignDate),
            amountSpent: values.amountSpent,
            totalReturn: values.totalReturn,
            conversationsStarted: values.conversationsStarted,
        };

        if (isEditing && initialData?.id) {
            setDocumentNonBlocking(doc(firestore, 'users', user.uid, 'ad_campaigns', initialData.id), data, { merge: true });
            toast({ title: 'Registro Atualizado!', description: 'O registro da campanha foi salvo.' });
        } else {
            addDocumentNonBlocking(collection(firestore, 'users', user.uid, 'ad_campaigns'), data);
            toast({ title: 'Registro Adicionado!', description: 'O novo registro de campanha foi salvo.' });
        }

        onFinished();
    };

    return (
        <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <DialogHeader>
                    <DialogTitle>{isEditing ? 'Editar' : 'Adicionar'} Registro de Campanha</DialogTitle>
                    <DialogDescription>Preencha os detalhes da sua campanha.</DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                    <FormField control={form.control} name="campaignDate" render={({ field }) => ( <FormItem><FormLabel>Data</FormLabel><FormControl><Input type="date" {...field} /></FormControl><FormMessage /></FormItem> )} />
                    <FormField control={form.control} name="amountSpent" render={({ field }) => ( <FormItem><FormLabel>Valor Gasto (R$)</FormLabel><FormControl><Input type="number" step="0.01" {...field} /></FormControl><FormMessage /></FormItem> )} />
                    <FormField control={form.control} name="totalReturn" render={({ field }) => ( <FormItem><FormLabel>Retorno (R$)</FormLabel><FormControl><Input type="number" step="0.01" {...field} /></FormControl><FormMessage /></FormItem> )} />
                    <FormField control={form.control} name="conversationsStarted" render={({ field }) => ( <FormItem><FormLabel>Conversas Iniciadas</FormLabel><FormControl><Input type="number" {...field} /></FormControl><FormMessage /></FormItem> )} />
                </div>
                <DialogFooter>
                    <Button type="button" variant="ghost" onClick={onFinished}>Cancelar</Button>
                    <Button type="submit">Salvar</Button>
                </DialogFooter>
            </form>
        </Form>
    )
}

export default function AdsPage() {
  const { firestore, user } = useFirebase();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingCampaign, setEditingCampaign] = useState<AdCampaign | undefined>(undefined);

  const campaignsQuery = useMemoFirebase(() => {
    if (!user) return null;
    return query(collection(firestore, 'users', user.uid, 'ad_campaigns'), orderBy('campaignDate', 'desc'));
  }, [firestore, user]);

  const { data: campaigns, isLoading } = useCollection<AdCampaign>(campaignsQuery);

  const monthlyData = useMemo(() => {
    const now = new Date();
    const start = startOfMonth(now);
    const end = endOfMonth(now);

    const filteredCampaigns = campaigns?.filter(c => {
        const campaignDate = c.campaignDate.toDate();
        return campaignDate >= start && campaignDate <= end;
    }) || [];
    
    const stats = filteredCampaigns.reduce((acc, campaign) => {
        acc.gastoTotal += campaign.amountSpent;
        acc.retornoTotal += campaign.totalReturn;
        acc.conversasIniciadas += campaign.conversationsStarted;
        return acc;
    }, { gastoTotal: 0, retornoTotal: 0, conversasIniciadas: 0 });

    const lucroLiquido = stats.retornoTotal - stats.gastoTotal;
    const custoPorMensagem = stats.conversasIniciadas > 0 ? stats.gastoTotal / stats.conversasIniciadas : 0;

    return { ...stats, lucroLiquido, custoPorMensagem, campaigns: filteredCampaigns };
  }, [campaigns]);
  
  const formatCurrency = (value: number) => {
    return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  };

  const handleEdit = (campaign: AdCampaign) => {
    setEditingCampaign(campaign);
    setDialogOpen(true);
  };

  const handleAddNew = () => {
    setEditingCampaign(undefined);
    setDialogOpen(true);
  };

  const handleDelete = (campaignId: string) => {
    if(!user) return;
    deleteDocumentNonBlocking(doc(firestore, 'users', user.uid, 'ad_campaigns', campaignId));
  }

  const statCards = [
    { title: 'Gasto Total', value: formatCurrency(monthlyData.gastoTotal), icon: DollarSign, color: 'text-red-500' },
    { title: 'Retorno Total', value: formatCurrency(monthlyData.retornoTotal), icon: TrendingUp, color: 'text-yellow-500' },
    { title: 'Lucro Líquido', value: formatCurrency(monthlyData.lucroLiquido), icon: Wallet, color: 'text-green-500' },
    { title: 'Conversas Iniciadas', value: monthlyData.conversasIniciadas, icon: MessageSquare, color: 'text-blue-500' },
    { title: 'Custo por Mensagem', value: formatCurrency(monthlyData.custoPorMensagem), icon: DollarSign, color: 'text-purple-500' },
  ];

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title="Relatório de Anúncios"
        description="Monitore seus gastos e retornos."
      >
        <Select defaultValue="this-month">
            <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Selecione o período" />
            </SelectTrigger>
            <SelectContent>
                <SelectItem value="this-month">Este Mês</SelectItem>
            </SelectContent>
        </Select>
      </PageHeader>
      <main className="flex-1 overflow-auto p-4 md:p-6 space-y-6">
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
            {statCards.map((card) => (
                <Card key={card.title}>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">{card.title}</CardTitle>
                        <card.icon className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        {isLoading ? <Skeleton className="h-8 w-3/4" /> : (
                            <div className={`text-2xl font-bold ${card.color}`}>{card.value}</div>
                        )}
                    </CardContent>
                </Card>
            ))}
        </div>
        
        <Dialog open={dialogOpen} onOpenChange={(open) => { if (!open) setEditingCampaign(undefined); setDialogOpen(open); }}>
          <Button onClick={handleAddNew}><PlusCircle className="mr-2" /> Adicionar Registro</Button>
          <DialogContent>
            <CampaignForm onFinished={() => setDialogOpen(false)} initialData={editingCampaign} />
          </DialogContent>
        </Dialog>

        <Card>
            <CardHeader>
                <CardTitle>Histórico de Campanhas</CardTitle>
            </CardHeader>
            <CardContent>
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Data</TableHead>
                            <TableHead>Valor Gasto</TableHead>
                            <TableHead>Retorno</TableHead>
                            <TableHead>Conversas</TableHead>
                            <TableHead>Custo/Msg</TableHead>
                            <TableHead className="text-right">Ações</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {isLoading ? (
                            <TableRow><TableCell colSpan={6} className="text-center">Carregando...</TableCell></TableRow>
                        ) : monthlyData.campaigns.length > 0 ? (
                           monthlyData.campaigns.map((c) => (
                            <TableRow key={c.id}>
                                <TableCell>{format(c.campaignDate.toDate(), 'dd/MM/yyyy')}</TableCell>
                                <TableCell>{formatCurrency(c.amountSpent)}</TableCell>
                                <TableCell>{formatCurrency(c.totalReturn)}</TableCell>
                                <TableCell>{c.conversationsStarted}</TableCell>
                                <TableCell>{formatCurrency(c.conversationsStarted > 0 ? c.amountSpent / c.conversationsStarted : 0)}</TableCell>
                                <TableCell className="text-right">
                                    <Button variant="ghost" size="icon" onClick={() => handleEdit(c)}><Edit className="h-4 w-4" /></Button>
                                    <AlertDialog>
                                        <AlertDialogTrigger asChild><Button variant="ghost" size="icon"><Trash2 className="h-4 w-4 text-destructive" /></Button></AlertDialogTrigger>
                                        <AlertDialogContent>
                                            <AlertDialogHeader>
                                                <AlertDialogTitle>Tem certeza?</AlertDialogTitle>
                                                <AlertDialogDescription>Esta ação irá excluir permanentemente o registro desta campanha.</AlertDialogDescription>
                                            </AlertDialogHeader>
                                            <AlertDialogFooter>
                                                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                                <AlertDialogAction onClick={() => handleDelete(c.id)}>Excluir</AlertDialogAction>
                                            </AlertDialogFooter>
                                        </AlertDialogContent>
                                    </AlertDialog>
                                </TableCell>
                            </TableRow>
                           ))
                        ) : (
                            <TableRow>
                                <TableCell colSpan={6} className="text-center">Nenhum registro de anúncio no período.</TableCell>
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
