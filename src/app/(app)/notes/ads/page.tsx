'use client';

import { useState, useMemo } from 'react';
import { PlusCircle, DollarSign, MessageSquare, Trash2, Edit, TrendingUp, Wallet } from 'lucide-react';
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
import type { AdCampaign, BusinessManager } from '@/lib/types';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { useToast } from '@/hooks/use-toast';
import { format, parse, startOfDay, endOfDay, startOfWeek, endOfWeek, startOfMonth, endOfMonth, startOfYear, endOfYear } from 'date-fns';
import { Skeleton } from '@/components/ui/skeleton';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';

const campaignSchema = z.object({
  campaignDate: z.string().min(1, 'A data é obrigatória.'),
  amountSpent: z.coerce.number().min(0, 'O valor gasto deve ser positivo.'),
  totalReturn: z.coerce.number().min(0, 'O retorno deve ser positivo.'),
  conversationsStarted: z.coerce.number().int().min(0, 'O número de conversas deve ser positivo.'),
  bm: z.string().optional(),
});

function CampaignForm({ onFinished, initialData }: { onFinished: () => void, initialData?: AdCampaign }) {
    const { firestore, user } = useFirebase();
    const { toast } = useToast();
    const isEditing = !!initialData;
    
    const bmsQuery = useMemoFirebase(() => {
      if (!user) return null;
      return query(collection(firestore, 'users', user.uid, 'business_managers'), orderBy('name'));
    }, [firestore, user]);
    const { data: bms } = useCollection<BusinessManager>(bmsQuery);

    const form = useForm<z.infer<typeof campaignSchema>>({
        resolver: zodResolver(campaignSchema),
        defaultValues: initialData ? {
            campaignDate: format(initialData.campaignDate.toDate(), 'yyyy-MM-dd'),
            amountSpent: initialData.amountSpent,
            totalReturn: initialData.totalReturn,
            conversationsStarted: initialData.conversationsStarted,
            bm: initialData.bm || '',
        } : {
            campaignDate: format(new Date(), 'yyyy-MM-dd'),
            amountSpent: 0,
            totalReturn: 0,
            conversationsStarted: 0,
            bm: '',
        }
    });

    const onSubmit = (values: z.infer<typeof campaignSchema>) => {
        if (!user) return;
        
        const campaignDate = parse(values.campaignDate, 'yyyy-MM-dd', new Date());

        const data: Partial<AdCampaign> = {
            userId: user.uid,
            campaignDate: Timestamp.fromDate(campaignDate),
            amountSpent: values.amountSpent,
            totalReturn: values.totalReturn,
            conversationsStarted: values.conversationsStarted,
            bm: values.bm || '',
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
                    <FormField
                      control={form.control}
                      name="bm"
                      render={({ field }) => (
                          <FormItem>
                              <FormLabel>Nome da BM</FormLabel>
                              <Select onValueChange={field.onChange} defaultValue={field.value}>
                                  <FormControl>
                                      <SelectTrigger>
                                          <SelectValue placeholder="Selecione uma BM" />
                                      </SelectTrigger>
                                  </FormControl>
                                  <SelectContent>
                                      {bms?.map((bm) => (
                                          <SelectItem key={bm.id} value={bm.name}>
                                              {bm.name}
                                          </SelectItem>
                                      ))}
                                  </SelectContent>
                              </Select>
                              <FormMessage />
                          </FormItem>
                      )}
                    />
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
  const [period, setPeriod] = useState('this-month');
  const [selectedBm, setSelectedBm] = useState('all');

  const campaignsQuery = useMemoFirebase(() => {
    if (!user) return null;
    return query(collection(firestore, 'users', user.uid, 'ad_campaigns'), orderBy('campaignDate', 'desc'));
  }, [firestore, user]);

  const { data: campaigns, isLoading } = useCollection<AdCampaign>(campaignsQuery);
  
  const bmsQuery = useMemoFirebase(() => {
    if (!user) return null;
    return query(collection(firestore, 'users', user.uid, 'business_managers'), orderBy('name'));
  }, [firestore, user]);
  const { data: bms } = useCollection<BusinessManager>(bmsQuery);

  const businessManagers = useMemo(() => {
    if (!bms) return [];
    const bmNames = bms.map(bm => bm.name);
    return ['all', ...bmNames];
  }, [bms]);

  const filteredData = useMemo(() => {
    const now = new Date();
    let start, end;

    switch (period) {
        case 'today':
            start = startOfDay(now);
            end = endOfDay(now);
            break;
        case 'this-week':
            start = startOfWeek(now);
            end = endOfWeek(now);
            break;
        case 'this-year':
            start = startOfYear(now);
            end = endOfYear(now);
            break;
        case 'this-month':
        default:
            start = startOfMonth(now);
            end = endOfMonth(now);
            break;
    }

    const periodCampaigns = campaigns?.filter(c => {
        const campaignDate = c.campaignDate.toDate();
        return campaignDate >= start && campaignDate <= end;
    }) || [];

    const bmCampaigns = selectedBm === 'all'
        ? periodCampaigns
        : periodCampaigns.filter(c => c.bm === selectedBm);
    
    const stats = bmCampaigns.reduce((acc, campaign) => {
        acc.gastoTotal += campaign.amountSpent;
        acc.retornoTotal += campaign.totalReturn;
        acc.conversasIniciadas += campaign.conversationsStarted;
        return acc;
    }, { gastoTotal: 0, retornoTotal: 0, conversasIniciadas: 0 });

    const lucroLiquido = stats.retornoTotal - stats.gastoTotal;
    const custoPorMensagem = stats.conversasIniciadas > 0 ? stats.gastoTotal / stats.conversasIniciadas : 0;

    return { ...stats, lucroLiquido, custoPorMensagem, campaigns: bmCampaigns };
  }, [campaigns, period, selectedBm]);
  
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
    { title: 'Gasto Total', value: formatCurrency(filteredData.gastoTotal), icon: DollarSign, color: 'text-red-500' },
    { title: 'Retorno Total', value: formatCurrency(filteredData.retornoTotal), icon: TrendingUp, color: 'text-yellow-500' },
    { title: 'Lucro Líquido', value: formatCurrency(filteredData.lucroLiquido), icon: Wallet, color: 'text-green-500' },
    { title: 'Conversas Iniciadas', value: filteredData.conversasIniciadas, icon: MessageSquare, color: 'text-blue-500' },
    { title: 'Custo por Mensagem', value: formatCurrency(filteredData.custoPorMensagem), icon: DollarSign, color: 'text-purple-500' },
  ];

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title="Relatório de Anúncios"
        description="Monitore seus gastos e retornos."
      >
        <div className="flex items-center gap-2">
            <Select value={selectedBm} onValueChange={setSelectedBm}>
                <SelectTrigger className="w-[180px]">
                    <SelectValue placeholder="Selecione a BM" />
                </SelectTrigger>
                <SelectContent>
                    {businessManagers.map(bm => (
                        <SelectItem key={bm} value={bm}>{bm === 'all' ? 'Todas as BMs' : bm}</SelectItem>
                    ))}
                </SelectContent>
            </Select>
            <Select value={period} onValueChange={setPeriod}>
                <SelectTrigger className="w-[180px]">
                    <SelectValue placeholder="Selecione o período" />
                </SelectTrigger>
                <SelectContent>
                    <SelectItem value="today">Hoje</SelectItem>
                    <SelectItem value="this-week">Esta Semana</SelectItem>
                    <SelectItem value="this-month">Este Mês</SelectItem>
                    <SelectItem value="this-year">Este Ano</SelectItem>
                </SelectContent>
            </Select>
        </div>
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
                            <TableHead>BM</TableHead>
                            <TableHead>Valor Gasto</TableHead>
                            <TableHead>Retorno</TableHead>
                            <TableHead>Conversas</TableHead>
                            <TableHead>Custo/Msg</TableHead>
                            <TableHead className="text-right">Ações</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {isLoading ? (
                            <TableRow><TableCell colSpan={7} className="text-center">Carregando...</TableCell></TableRow>
                        ) : filteredData.campaigns.length > 0 ? (
                           filteredData.campaigns.map((c) => (
                            <TableRow key={c.id}>
                                <TableCell>{format(c.campaignDate.toDate(), 'dd/MM/yyyy')}</TableCell>
                                <TableCell>{c.bm || '-'}</TableCell>
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
                                <TableCell colSpan={7} className="text-center">Nenhum registro de anúncio no período.</TableCell>
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
