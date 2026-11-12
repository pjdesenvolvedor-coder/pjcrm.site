'use client';

import React, { useState, useEffect, useMemo } from 'react';
import {
  collection,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  setDoc,
  query,
  where,
} from 'firebase/firestore';
import { useFirebase, useCollection, useDoc, useMemoFirebase } from '@/firebase';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import {
  Package,
  Plus,
  Trash2,
  Edit,
  CheckCircle2,
  Clock,
  KeyRound,
  Mail,
  MessageSquareText,
  Sparkles,
  Copy,
  RefreshCcw,
  Search,
  Layers,
  QrCode,
  Send,
  AlertTriangle,
  RotateCcw,
  Loader2,
  ShieldCheck,
} from 'lucide-react';
import type {
  FlowProductStockItem,
  FlowProductDeliveryConfig,
  FlowOrder,
  Subscription,
} from '@/lib/types';
import {
  DEFAULT_GENERAL_PRODUCT_DELIVERY_MESSAGE,
  DEFAULT_FLOW_PIX_BILLING_MESSAGE,
  formatCentsToBrl,
} from '@/lib/flow-product-delivery';

const DELIVERY_VARIABLES = [
  { token: '{produto}', desc: 'Nome do produto comprado' },
  { token: '{email}', desc: 'E-mail (login) do estoque' },
  { token: '{senha}', desc: 'Senha do estoque' },
  { token: '{cliente}', desc: 'Nome completo do cliente' },
  { token: '{primeiro_nome}', desc: 'Primeiro nome do cliente' },
  { token: '{tela}', desc: 'Tela / Perfil (se houver)' },
  { token: '{pin_tela}', desc: 'PIN da tela (se houver)' },
  { token: '{valor}', desc: 'Valor pago no PIX' },
  { token: '{vencimento}', desc: 'Data de vencimento (+30 dias)' },
  { token: '{telefone}', desc: 'WhatsApp do cliente' },
];

export default function FlowProductDeliveryPage() {
  const { firestore, effectiveUserId } = useFirebase();
  const { toast } = useToast();

  // 1. Configurações de Entrega Automática de Produtos
  const configDocRef = useMemoFirebase(() => {
    if (!effectiveUserId) return null;
    return doc(firestore, 'users', effectiveUserId, 'settings', 'flow_product_delivery');
  }, [firestore, effectiveUserId]);
  const { data: deliveryConfig, isLoading: isLoadingConfig } =
    useDoc<FlowProductDeliveryConfig>(configDocRef);

  // 2. Estoque de Logins
  const stockQuery = useMemoFirebase(() => {
    if (!effectiveUserId) return null;
    return collection(firestore, 'users', effectiveUserId, 'flow_product_stock');
  }, [firestore, effectiveUserId]);
  const { data: stockItems, isLoading: isLoadingStock } =
    useCollection<FlowProductStockItem>(stockQuery);

  // 3. Assinaturas / Produtos já existentes no CRM (para sugestão rápida)
  const subscriptionsQuery = useMemoFirebase(() => {
    if (!effectiveUserId) return null;
    return collection(firestore, 'users', effectiveUserId, 'subscriptions');
  }, [firestore, effectiveUserId]);
  const { data: subscriptions } = useCollection<Subscription>(subscriptionsQuery);

  // 4. Histórico de Pedidos PIX do Fluxo
  const ordersQuery = useMemoFirebase(() => {
    if (!effectiveUserId) return null;
    return query(collection(firestore, 'flow_orders'), where('userId', '==', effectiveUserId));
  }, [firestore, effectiveUserId]);
  const { data: flowOrders } = useCollection<FlowOrder>(ordersQuery);

  // Estados do formulário de Novo Login (Individual)
  const [productName, setProductName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [screen, setScreen] = useState('');
  const [pinScreen, setPinScreen] = useState('');
  const [defaultPrice, setDefaultPrice] = useState('');
  const [maxSlots, setMaxSlots] = useState('1');
  const [isAddingStock, setIsAddingStock] = useState(false);

  // Estados do Modal de Adição em Lote
  const [isBulkOpen, setIsBulkOpen] = useState(false);
  const [bulkProductName, setBulkProductName] = useState('');
  const [bulkDefaultPrice, setBulkDefaultPrice] = useState('');
  const [bulkMaxSlots, setBulkMaxSlots] = useState('1');
  const [bulkLines, setBulkLines] = useState('');
  const [isSavingBulk, setIsSavingBulk] = useState(false);

  // Estados de Edição de Item do Estoque
  const [editingItem, setEditingItem] = useState<FlowProductStockItem | null>(null);
  const [isSavingEdit, setIsSavingEdit] = useState(false);

  // Filtros do Estoque
  const [filterProduct, setFilterProduct] = useState<string>('ALL');
  const [filterStatus, setFilterStatus] = useState<'ALL' | 'available' | 'delivered'>('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  // Estados de Mensagens (Geral + Individual por Produto)
  const [generalMessage, setGeneralMessage] = useState(DEFAULT_GENERAL_PRODUCT_DELIVERY_MESSAGE);
  const [outOfStockMessage, setOutOfStockMessage] = useState('');
  const [isSavingGeneralMsg, setIsSavingGeneralMsg] = useState(false);

  const [selectedProductForMsg, setSelectedProductForMsg] = useState('');
  const [customProductMsgText, setCustomProductMsgText] = useState('');
  const [isSavingProductMsg, setIsSavingProductMsg] = useState(false);

  // Estados de Configuração do Gateway PIX
  const [pixGateway, setPixGateway] = useState<'pjpay' | 'linkinpay' | 'custom'>('pjpay');
  const [pixApiToken, setPixApiToken] = useState('');
  const [registerClientInCrm, setRegisterClientInCrm] = useState(true);
  const [defaultPixBillingMessage, setDefaultPixBillingMessage] = useState(
    DEFAULT_FLOW_PIX_BILLING_MESSAGE
  );
  const [isSavingGateway, setIsSavingGateway] = useState(false);
  const [isVerifyingOrders, setIsVerifyingOrders] = useState(false);
  const [deliveringOrderId, setDeliveringOrderId] = useState<string | null>(null);

  // Sincronizar estados quando deliveryConfig carregar
  useEffect(() => {
    if (deliveryConfig) {
      setGeneralMessage(
        deliveryConfig.generalDeliveryMessage || DEFAULT_GENERAL_PRODUCT_DELIVERY_MESSAGE
      );
      setOutOfStockMessage(deliveryConfig.outOfStockMessage || '');
      setPixGateway(deliveryConfig.pixGateway || 'pjpay');
      setPixApiToken(deliveryConfig.pixApiToken || '');
      setRegisterClientInCrm(deliveryConfig.registerClientInCrm !== false);
      setDefaultPixBillingMessage(
        deliveryConfig.defaultPixBillingMessage || DEFAULT_FLOW_PIX_BILLING_MESSAGE
      );
    }
  }, [deliveryConfig]);

  // Lista consolidada de nomes de produtos (estoque + assinaturas + mensagens personalizadas)
  const allProductNames = useMemo(() => {
    const set = new Set<string>();
    (stockItems || []).forEach((i) => {
      if (i.productName?.trim()) set.add(i.productName.trim());
    });
    (subscriptions || []).forEach((s) => {
      if (s.name?.trim()) set.add(s.name.trim());
    });
    if (deliveryConfig?.productMessages) {
      Object.keys(deliveryConfig.productMessages).forEach((k) => {
        if (k.trim()) set.add(k.trim());
      });
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [stockItems, subscriptions, deliveryConfig?.productMessages]);

  // Resumo de estoque por produto
  const productSummaryList = useMemo(() => {
    const map = new Map<
      string,
      { name: string; available: number; delivered: number; total: number }
    >();
    (stockItems || []).forEach((item) => {
      const name = (item.productName || 'Sem Nome').trim();
      const key = name.toLowerCase();
      const cur = map.get(key) || { name, available: 0, delivered: 0, total: 0 };
      if (item.status === 'available') cur.available += 1;
      else cur.delivered += 1;
      cur.total += 1;
      map.set(key, cur);
    });
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [stockItems]);

  // Lista filtrada e ordenada do estoque
  const filteredStock = useMemo(() => {
    const list = [...(stockItems || [])];
    list.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));

    return list.filter((item) => {
      if (
        filterProduct !== 'ALL' &&
        (item.productName || '').trim().toLowerCase() !== filterProduct.toLowerCase()
      ) {
        return false;
      }
      if (filterStatus !== 'ALL' && item.status !== filterStatus) {
        return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchProd = (item.productName || '').toLowerCase().includes(q);
        const matchEmail = (item.email || '').toLowerCase().includes(q);
        const matchPhone = (item.deliveredToPhone || '').toLowerCase().includes(q);
        const matchName = (item.deliveredToName || '').toLowerCase().includes(q);
        if (!matchProd && !matchEmail && !matchPhone && !matchName) return false;
      }
      return true;
    });
  }, [stockItems, filterProduct, filterStatus, searchQuery]);

  // Lista ordenada de pedidos do fluxo
  const sortedOrders = useMemo(() => {
    const list = [...(flowOrders || [])];
    list.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
    return list;
  }, [flowOrders]);

  // Contadores gerais
  const totalAvailable = useMemo(
    () => (stockItems || []).filter((i) => i.status === 'available').length,
    [stockItems]
  );
  const totalDelivered = useMemo(
    () => (stockItems || []).filter((i) => i.status === 'delivered').length,
    [stockItems]
  );

  // Adicionar 1 login ao estoque
  const handleAddSingleStock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!effectiveUserId) return;
    if (!productName.trim() || !email.trim() || !password.trim()) {
      toast({
        variant: 'destructive',
        title: 'Campos obrigatórios',
        description: 'Preencha o Nome do Produto, E-mail e Senha.',
      });
      return;
    }

    setIsAddingStock(true);
    try {
      const parsedPrice = defaultPrice
        ? parseFloat(defaultPrice.replace(',', '.'))
        : undefined;
      const parsedSlots = Math.max(1, parseInt(maxSlots, 10) || 1);

      await addDoc(collection(firestore, 'users', effectiveUserId, 'flow_product_stock'), {
        userId: effectiveUserId,
        productName: productName.trim(),
        email: email.trim(),
        password: password.trim(),
        screen: screen.trim() || '',
        pinScreen: pinScreen.trim() || '',
        defaultPrice: parsedPrice && !isNaN(parsedPrice) ? parsedPrice : null,
        maxSlots: parsedSlots,
        usedSlots: 0,
        status: 'available',
        createdAt: new Date().toISOString(),
      });

      setEmail('');
      setPassword('');
      setScreen('');
      setPinScreen('');

      toast({
        title: 'Login adicionado ao estoque!',
        description: `Conta de "${productName.trim()}" pronta para entrega automática.`,
      });
    } catch (err: any) {
      toast({
        variant: 'destructive',
        title: 'Erro ao salvar no estoque',
        description: err.message,
      });
    } finally {
      setIsAddingStock(false);
    }
  };

  // Adicionar vários logins em lote
  const handleAddBulkStock = async () => {
    if (!effectiveUserId) return;
    if (!bulkProductName.trim()) {
      toast({
        variant: 'destructive',
        title: 'Informe o nome do produto',
        description: 'Digite ou selecione o produto para os logins em lote.',
      });
      return;
    }

    const lines = bulkLines
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);

    if (lines.length === 0) {
      toast({
        variant: 'destructive',
        title: 'Lista vazia',
        description: 'Cole ao menos 1 linha no formato email:senha',
      });
      return;
    }

    setIsSavingBulk(true);
    let addedCount = 0;
    try {
      const parsedPrice = bulkDefaultPrice
        ? parseFloat(bulkDefaultPrice.replace(',', '.'))
        : undefined;
      const parsedSlots = Math.max(1, parseInt(bulkMaxSlots, 10) || 1);
      const colRef = collection(firestore, 'users', effectiveUserId, 'flow_product_stock');

      for (const line of lines) {
        const parts = line.split(/[:|;,\t]/);
        if (parts.length < 2) continue;
        const itemEmail = parts[0].trim();
        const itemPass = parts.slice(1).join(':').trim();
        if (!itemEmail || !itemPass) continue;

        await addDoc(colRef, {
          userId: effectiveUserId,
          productName: bulkProductName.trim(),
          email: itemEmail,
          password: itemPass,
          screen: '',
          pinScreen: '',
          defaultPrice: parsedPrice && !isNaN(parsedPrice) ? parsedPrice : null,
          maxSlots: parsedSlots,
          usedSlots: 0,
          status: 'available',
          createdAt: new Date().toISOString(),
        });
        addedCount++;
      }

      toast({
        title: `${addedCount} login(s) adicionados!`,
        description: `Estoque de "${bulkProductName.trim()}" abastecido com sucesso.`,
      });
      setBulkLines('');
      setIsBulkOpen(false);
    } catch (err: any) {
      toast({
        variant: 'destructive',
        title: 'Erro ao importar em lote',
        description: err.message,
      });
    } finally {
      setIsSavingBulk(false);
    }
  };

  // Salvar edição de um item do estoque
  const handleSaveEditItem = async () => {
    if (!effectiveUserId || !editingItem) return;
    setIsSavingEdit(true);
    try {
      const itemRef = doc(
        firestore,
        'users',
        effectiveUserId,
        'flow_product_stock',
        editingItem.id
      );
      await updateDoc(itemRef, {
        productName: editingItem.productName.trim(),
        email: editingItem.email.trim(),
        password: editingItem.password.trim(),
        screen: editingItem.screen?.trim() || '',
        pinScreen: editingItem.pinScreen?.trim() || '',
        maxSlots: Math.max(1, Number(editingItem.maxSlots) || 1),
        status: editingItem.status,
        updatedAt: new Date().toISOString(),
      });
      toast({ title: 'Login atualizado com sucesso!' });
      setEditingItem(null);
    } catch (err: any) {
      toast({
        variant: 'destructive',
        title: 'Erro ao atualizar',
        description: err.message,
      });
    } finally {
      setIsSavingEdit(false);
    }
  };

  // Alternar status Disponível / Entregue
  const handleToggleStockStatus = async (item: FlowProductStockItem) => {
    if (!effectiveUserId) return;
    try {
      const nextStatus = item.status === 'available' ? 'delivered' : 'available';
      await updateDoc(
        doc(firestore, 'users', effectiveUserId, 'flow_product_stock', item.id),
        {
          status: nextStatus,
          usedSlots: nextStatus === 'available' ? 0 : item.maxSlots || 1,
          updatedAt: new Date().toISOString(),
        }
      );
      toast({
        title:
          nextStatus === 'available'
            ? 'Login devolvido ao estoque disponível!'
            : 'Login marcado como entregue!',
      });
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Erro', description: err.message });
    }
  };

  // Excluir item do estoque
  const handleDeleteStockItem = async (id: string) => {
    if (!effectiveUserId) return;
    try {
      await deleteDoc(doc(firestore, 'users', effectiveUserId, 'flow_product_stock', id));
      toast({ title: 'Login removido do estoque.' });
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Erro ao excluir', description: err.message });
    }
  };

  // Salvar Mensagem Geral de Entrega
  const handleSaveGeneralMessage = async () => {
    if (!configDocRef) return;
    setIsSavingGeneralMsg(true);
    try {
      await setDoc(
        configDocRef,
        {
          generalDeliveryMessage: generalMessage,
          outOfStockMessage,
          updatedAt: new Date().toISOString(),
        },
        { merge: true }
      );
      toast({
        title: 'Mensagem Geral de Entrega salva!',
        description: 'Todos os produtos sem mensagem específica usarão este modelo.',
      });
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Erro ao salvar', description: err.message });
    } finally {
      setIsSavingGeneralMsg(false);
    }
  };

  // Salvar Mensagem Individual de um Produto
  const handleSaveProductSpecificMessage = async () => {
    if (!configDocRef) return;
    const prod = selectedProductForMsg.trim();
    if (!prod) {
      toast({
        variant: 'destructive',
        title: 'Selecione ou digite o produto',
        description: 'Informe qual produto terá esta mensagem personalizada.',
      });
      return;
    }
    if (!customProductMsgText.trim()) {
      toast({
        variant: 'destructive',
        title: 'Mensagem vazia',
        description: 'Digite a mensagem de entrega personalizada para este produto.',
      });
      return;
    }

    setIsSavingProductMsg(true);
    try {
      const currentMap = { ...(deliveryConfig?.productMessages || {}) };
      currentMap[prod] = customProductMsgText.trim();

      await setDoc(
        configDocRef,
        {
          productMessages: currentMap,
          updatedAt: new Date().toISOString(),
        },
        { merge: true }
      );

      toast({
        title: `Mensagem de "${prod}" salva!`,
        description: `Quando o cliente comprar "${prod}", receberá esta mensagem personalizada.`,
      });
      setSelectedProductForMsg('');
      setCustomProductMsgText('');
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Erro ao salvar', description: err.message });
    } finally {
      setIsSavingProductMsg(false);
    }
  };

  // Remover Mensagem Individual de um Produto
  const handleRemoveProductSpecificMessage = async (prodKey: string) => {
    if (!configDocRef || !deliveryConfig?.productMessages) return;
    try {
      const updatedMap = { ...deliveryConfig.productMessages };
      delete updatedMap[prodKey];
      await setDoc(
        configDocRef,
        {
          productMessages: updatedMap,
          updatedAt: new Date().toISOString(),
        },
        { merge: true }
      );
      toast({
        title: `Mensagem específica de "${prodKey}" removida`,
        description: 'O produto voltará a usar a Mensagem Geral de Entrega.',
      });
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Erro ao remover', description: err.message });
    }
  };

  // Salvar Configurações de Gateway PIX
  const handleSaveGatewaySettings = async () => {
    if (!configDocRef) return;
    setIsSavingGateway(true);
    try {
      await setDoc(
        configDocRef,
        {
          pixGateway,
          pixApiToken: pixApiToken.trim(),
          registerClientInCrm,
          defaultPixBillingMessage,
          updatedAt: new Date().toISOString(),
        },
        { merge: true }
      );
      toast({
        title: 'Configurações de Pagamento PIX salvas!',
        description: 'Suas configurações de geração e confirmação de PIX estão ativas.',
      });
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Erro ao salvar', description: err.message });
    } finally {
      setIsSavingGateway(false);
    }
  };

  // Verificar pagamentos pendentes manualmente
  const handleVerifyPendingOrders = async () => {
    if (!effectiveUserId) return;
    setIsVerifyingOrders(true);
    try {
      const res = await fetch('/api/flows/payment-webhook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'verify_all',
          userId: effectiveUserId,
        }),
      });
      const data = await res.json();
      if (data.delivered > 0) {
        toast({
          title: `${data.delivered} pagamento(s) aprovado(s) e entregue(s)!`,
          description: 'Os logins foram enviados aos clientes no WhatsApp.',
        });
      } else {
        toast({
          title: 'Verificação concluída',
          description: `Foram consultados ${data.checked || 0} pedido(s) pendente(s). Nenhum novo pagamento pendente.`,
        });
      }
    } catch (err: any) {
      toast({
        variant: 'destructive',
        title: 'Erro ao verificar pagamentos',
        description: err.message,
      });
    } finally {
      setIsVerifyingOrders(false);
    }
  };

  // Forçar entrega manual de um pedido específico
  const handleForceDeliverOrder = async (orderId: string) => {
    setDeliveringOrderId(orderId);
    try {
      const res = await fetch('/api/flows/payment-webhook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'force_deliver',
          orderId,
        }),
      });
      const data = await res.json();
      if (data.success) {
        toast({
          title: 'Produto entregue com sucesso!',
          description: 'O login do estoque foi enviado no WhatsApp do cliente.',
        });
      } else {
        toast({
          variant: 'destructive',
          title: 'Não foi possível entregar',
          description: data.error || 'Verifique se há estoque disponível para este produto.',
        });
      }
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Erro', description: err.message });
    } finally {
      setDeliveringOrderId(null);
    }
  };

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title="Entrega de Produtos (Automática)"
        description="Gerencie o estoque de logins (produto, e-mail e senha) e personalize as mensagens de entrega automática após o pagamento PIX no Fluxo."
      />

      <main className="flex-1 overflow-auto p-4 md:p-6 space-y-6">
        {/* CARDS DE RESUMO */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="border-emerald-200 dark:border-emerald-900/60 bg-emerald-50/30 dark:bg-emerald-950/10">
            <CardContent className="p-4 flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-400 uppercase tracking-wider">
                  Logins Disponíveis
                </p>
                <p className="text-2xl font-extrabold text-emerald-900 dark:text-emerald-200 mt-1">
                  {totalAvailable}
                </p>
                <p className="text-[11px] text-muted-foreground">
                  Prontos para entrega imediata
                </p>
              </div>
              <div className="p-3 rounded-xl bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
                <Package className="h-6 w-6" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4 flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Logins Entregues
                </p>
                <p className="text-2xl font-extrabold mt-1">{totalDelivered}</p>
                <p className="text-[11px] text-muted-foreground">
                  Enviados automaticamente no Zap
                </p>
              </div>
              <div className="p-3 rounded-xl bg-indigo-500/15 text-indigo-600 dark:text-indigo-400">
                <CheckCircle2 className="h-6 w-6" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4 flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Produtos com Estoque
                </p>
                <p className="text-2xl font-extrabold mt-1">
                  {productSummaryList.length}
                </p>
                <p className="text-[11px] text-muted-foreground">
                  {Object.keys(deliveryConfig?.productMessages || {}).length} com msg individual
                </p>
              </div>
              <div className="p-3 rounded-xl bg-violet-500/15 text-violet-600 dark:text-violet-400">
                <Layers className="h-6 w-6" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4 flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Pedidos PIX no Fluxo
                </p>
                <p className="text-2xl font-extrabold mt-1">
                  {(flowOrders || []).length}
                </p>
                <button
                  type="button"
                  onClick={handleVerifyPendingOrders}
                  disabled={isVerifyingOrders}
                  className="text-[11px] font-semibold text-emerald-600 hover:underline flex items-center gap-1 mt-0.5"
                >
                  {isVerifyingOrders ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <RefreshCcw className="h-3 w-3" />
                  )}
                  Verificar pagamentos agora
                </button>
              </div>
              <div className="p-3 rounded-xl bg-amber-500/15 text-amber-600 dark:text-amber-400">
                <QrCode className="h-6 w-6" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* ABAS PRINCIPAIS */}
        <Tabs defaultValue="stock" className="space-y-4">
          <TabsList className="grid w-full grid-cols-1 sm:grid-cols-3 h-auto gap-1 p-1">
            <TabsTrigger value="stock" className="gap-2 py-2.5 text-xs sm:text-sm font-semibold">
              <Package className="h-4 w-4 text-emerald-600" />
              1. Estoque de Produtos (Logins)
            </TabsTrigger>
            <TabsTrigger value="messages" className="gap-2 py-2.5 text-xs sm:text-sm font-semibold">
              <MessageSquareText className="h-4 w-4 text-indigo-600" />
              2. Mensagem de Entrega (Geral e Individual)
            </TabsTrigger>
            <TabsTrigger value="gateway" className="gap-2 py-2.5 text-xs sm:text-sm font-semibold">
              <QrCode className="h-4 w-4 text-amber-600" />
              3. API de Pagamento PIX & Pedidos
            </TabsTrigger>
          </TabsList>

          {/* ================= ABA 1: ESTOQUE DE PRODUTOS (LOGINS) ================= */}
          <TabsContent value="stock" className="space-y-6">
            {/* CARD DE CADASTRO DE NOVO LOGIN */}
            <Card className="border-indigo-200/70 dark:border-indigo-900/50 shadow-xs">
              <CardHeader className="pb-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div>
                  <CardTitle className="text-base flex items-center gap-2">
                    <KeyRound className="h-5 w-5 text-emerald-600" />
                    Adicionar Login ao Estoque
                  </CardTitle>
                  <CardDescription>
                    Cadastre o nome do produto, e-mail e senha que serão entregues automaticamente assim que o PIX for pago no Fluxo.
                  </CardDescription>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setBulkProductName(productName);
                    setBulkDefaultPrice(defaultPrice);
                    setIsBulkOpen(true);
                  }}
                  className="gap-1.5 border-indigo-300 text-indigo-700 hover:bg-indigo-50 dark:border-indigo-800 dark:text-indigo-300 shrink-0"
                >
                  <Layers className="h-4 w-4" />
                  Adicionar Vários em Lote
                </Button>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleAddSingleStock} className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {/* Nome do Produto */}
                    <div className="space-y-1.5">
                      <Label className="text-xs font-bold">
                        Nome do Produto *
                      </Label>
                      <div className="flex gap-2">
                        <Input
                          placeholder="Ex: Netflix, HBO Max, Canva Pro..."
                          value={productName}
                          onChange={(e) => setProductName(e.target.value)}
                          className="flex-1"
                        />
                        {allProductNames.length > 0 && (
                          <Select
                            value=""
                            onValueChange={(val) => setProductName(val)}
                          >
                            <SelectTrigger className="w-[130px] shrink-0 text-xs">
                              <SelectValue placeholder="Existentes" />
                            </SelectTrigger>
                            <SelectContent>
                              {allProductNames.map((p) => (
                                <SelectItem key={p} value={p}>
                                  {p}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}
                      </div>
                    </div>

                    {/* E-mail (Login) */}
                    <div className="space-y-1.5">
                      <Label className="text-xs font-bold flex items-center gap-1">
                        <Mail className="h-3.5 w-3.5 text-muted-foreground" />
                        E-mail / Login *
                      </Label>
                      <Input
                        placeholder="Ex: conta1@gmail.com"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                      />
                    </div>

                    {/* Senha */}
                    <div className="space-y-1.5">
                      <Label className="text-xs font-bold flex items-center gap-1">
                        <KeyRound className="h-3.5 w-3.5 text-muted-foreground" />
                        Senha *
                      </Label>
                      <Input
                        placeholder="Ex: Senha123@"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                      />
                    </div>
                  </div>

                  {/* Campos Opcionais */}
                  <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 pt-1">
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">
                        Valor Padrão R$ (Opcional)
                      </Label>
                      <Input
                        placeholder="Ex: 19,90"
                        value={defaultPrice}
                        onChange={(e) => setDefaultPrice(e.target.value)}
                        className="h-9 text-xs"
                      />
                    </div>

                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">
                        Tela / Perfil (Opcional)
                      </Label>
                      <Input
                        placeholder="Ex: Tela 01"
                        value={screen}
                        onChange={(e) => setScreen(e.target.value)}
                        className="h-9 text-xs"
                      />
                    </div>

                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">
                        PIN da Tela (Opcional)
                      </Label>
                      <Input
                        placeholder="Ex: 1234"
                        value={pinScreen}
                        onChange={(e) => setPinScreen(e.target.value)}
                        className="h-9 text-xs"
                      />
                    </div>

                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">
                        Quantas vezes entregar este login?
                      </Label>
                      <Select value={maxSlots} onValueChange={setMaxSlots}>
                        <SelectTrigger className="h-9 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="1">1 vez (Uso Único / Individual)</SelectItem>
                          <SelectItem value="2">Até 2 clientes (Compartilhada)</SelectItem>
                          <SelectItem value="3">Até 3 clientes (Compartilhada)</SelectItem>
                          <SelectItem value="4">Até 4 clientes (Compartilhada)</SelectItem>
                          <SelectItem value="5">Até 5 clientes (Compartilhada)</SelectItem>
                          <SelectItem value="10">Até 10 clientes</SelectItem>
                          <SelectItem value="999">Ilimitado (Mesmo login para todos)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="flex justify-end pt-2">
                    <Button
                      type="submit"
                      disabled={isAddingStock}
                      className="bg-emerald-600 hover:bg-emerald-700 text-white gap-2"
                    >
                      {isAddingStock ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Plus className="h-4 w-4" />
                      )}
                      Adicionar Login ao Estoque
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>

            {/* PILLS DE RESUMO POR PRODUTO */}
            {productSummaryList.length > 0 && (
              <div className="flex flex-wrap items-center gap-2">
                <Badge
                  variant={filterProduct === 'ALL' ? 'default' : 'outline'}
                  className="cursor-pointer py-1.5 px-3 text-xs"
                  onClick={() => setFilterProduct('ALL')}
                >
                  Todos os Produtos ({(stockItems || []).length})
                </Badge>
                {productSummaryList.map((p) => (
                  <Badge
                    key={p.name}
                    variant={
                      filterProduct.toLowerCase() === p.name.toLowerCase()
                        ? 'default'
                        : 'outline'
                    }
                    className="cursor-pointer py-1.5 px-3 text-xs gap-1.5"
                    onClick={() => setFilterProduct(p.name)}
                  >
                    <span>📦 {p.name}</span>
                    <span className="px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 font-bold">
                      {p.available} disp.
                    </span>
                    {p.delivered > 0 && (
                      <span className="text-muted-foreground">
                        ({p.delivered} entregues)
                      </span>
                    )}
                  </Badge>
                ))}
              </div>
            )}

            {/* TABELA DE ESTOQUE */}
            <Card>
              <CardHeader className="pb-3">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div>
                    <CardTitle className="text-base">
                      Logins Cadastrados no Estoque ({filteredStock.length})
                    </CardTitle>
                    <CardDescription>
                      O sistema entrega automaticamente o login disponível mais antigo do produto escolhido no Fluxo.
                    </CardDescription>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <div className="relative w-full sm:w-56">
                      <Search className="h-4 w-4 absolute left-2.5 top-2.5 text-muted-foreground" />
                      <Input
                        placeholder="Buscar produto, e-mail..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="pl-8 h-9 text-xs"
                      />
                    </div>

                    <Select
                      value={filterStatus}
                      onValueChange={(v: any) => setFilterStatus(v)}
                    >
                      <SelectTrigger className="w-[140px] h-9 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="ALL">Todos os Status</SelectItem>
                        <SelectItem value="available">🟢 Disponíveis</SelectItem>
                        <SelectItem value="delivered">⚪ Já Entregues</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </CardHeader>

              <CardContent>
                {isLoadingStock ? (
                  <div className="py-10 text-center text-sm text-muted-foreground">
                    Carregando estoque...
                  </div>
                ) : filteredStock.length === 0 ? (
                  <div className="py-10 text-center border rounded-xl bg-muted/20 space-y-2">
                    <Package className="h-8 w-8 mx-auto text-muted-foreground" />
                    <p className="text-sm font-semibold">
                      Nenhum login encontrado no estoque
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Adicione o nome do produto, e-mail e senha no formulário acima para começar.
                    </p>
                  </div>
                ) : (
                  <div className="overflow-x-auto border rounded-xl">
                    <table className="w-full text-xs text-left">
                      <thead className="bg-muted/50 text-muted-foreground uppercase border-b">
                        <tr>
                          <th className="p-3 font-bold">Produto</th>
                          <th className="p-3 font-bold">E-mail (Login)</th>
                          <th className="p-3 font-bold">Senha</th>
                          <th className="p-3 font-bold">Tela / PIN</th>
                          <th className="p-3 font-bold">Usos</th>
                          <th className="p-3 font-bold">Status</th>
                          <th className="p-3 font-bold text-right">Ações</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {filteredStock.map((item) => {
                          const maxS = Math.max(1, Number(item.maxSlots) || 1);
                          const usedS = Number(item.usedSlots) || 0;
                          return (
                            <tr
                              key={item.id}
                              className="hover:bg-muted/30 transition-colors"
                            >
                              <td className="p-3 font-bold text-slate-900 dark:text-slate-100">
                                📦 {item.productName}
                              </td>
                              <td className="p-3 font-mono text-indigo-600 dark:text-indigo-400">
                                {item.email}
                              </td>
                              <td className="p-3 font-mono">
                                {item.password}
                              </td>
                              <td className="p-3 text-muted-foreground">
                                {item.screen || item.pinScreen
                                  ? `${item.screen || ''} ${item.pinScreen ? `(PIN: ${item.pinScreen})` : ''}`
                                  : '-'}
                              </td>
                              <td className="p-3">
                                <Badge variant="outline" className="text-[10px] font-mono">
                                  {usedS} / {maxS >= 999 ? '∞' : maxS}
                                </Badge>
                              </td>
                              <td className="p-3">
                                {item.status === 'available' ? (
                                  <Badge className="bg-emerald-600 hover:bg-emerald-700 text-white text-[10px]">
                                    Disponível
                                  </Badge>
                                ) : (
                                  <div className="space-y-0.5">
                                    <Badge variant="secondary" className="text-[10px]">
                                      Entregue
                                    </Badge>
                                    {item.deliveredToPhone && (
                                      <p className="text-[10px] text-muted-foreground">
                                        Para: {item.deliveredToName || item.deliveredToPhone}
                                      </p>
                                    )}
                                  </div>
                                )}
                              </td>
                              <td className="p-3 text-right">
                                <div className="flex items-center justify-end gap-1">
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    className="h-7 w-7"
                                    title={
                                      item.status === 'available'
                                        ? 'Marcar como entregue'
                                        : 'Reativar login no estoque'
                                    }
                                    onClick={() => handleToggleStockStatus(item)}
                                  >
                                    <RotateCcw className="h-3.5 w-3.5 text-emerald-600" />
                                  </Button>
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    className="h-7 w-7"
                                    title="Editar login"
                                    onClick={() => setEditingItem(item)}
                                  >
                                    <Edit className="h-3.5 w-3.5 text-slate-600" />
                                  </Button>
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    className="h-7 w-7 text-rose-600 hover:text-rose-700"
                                    title="Excluir login"
                                    onClick={() => handleDeleteStockItem(item.id)}
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </Button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ================= ABA 2: MENSAGENS DE ENTREGA (GERAL E INDIVIDUAL) ================= */}
          <TabsContent value="messages" className="space-y-6">
            {/* 1. MENSAGEM DE ENTREGA GERAL (PADRÃO) */}
            <Card className="border-indigo-200 dark:border-indigo-900/60">
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <MessageSquareText className="h-5 w-5 text-indigo-600" />
                  Mensagem de Entrega Geral (Todos os Produtos)
                </CardTitle>
                <CardDescription>
                  Esta é a mensagem padrão que será enviada automaticamente no WhatsApp do cliente assim que o pagamento PIX for aprovado (para qualquer produto que não tenha mensagem individual).
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs font-bold">
                      Texto da Mensagem Geral de Entrega
                    </Label>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs text-indigo-600"
                      onClick={() =>
                        setGeneralMessage(DEFAULT_GENERAL_PRODUCT_DELIVERY_MESSAGE)
                      }
                    >
                      Restaurar Modelo Padrão
                    </Button>
                  </div>
                  <Textarea
                    rows={8}
                    value={generalMessage}
                    onChange={(e) => setGeneralMessage(e.target.value)}
                    placeholder="Olá {cliente}, aqui está o seu acesso ao {produto}..."
                    className="font-sans text-sm"
                  />
                </div>

                {/* Variáveis disponíveis */}
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold flex items-center gap-1.5 text-muted-foreground">
                    <Sparkles className="h-3.5 w-3.5 text-indigo-500" />
                    Clique em uma variável para inserir na Mensagem Geral:
                  </Label>
                  <div className="flex flex-wrap gap-1.5">
                    {DELIVERY_VARIABLES.map((v) => (
                      <Badge
                        key={v.token}
                        variant="outline"
                        className="cursor-pointer hover:bg-indigo-50 dark:hover:bg-indigo-950/50 text-xs py-1 px-2.5 font-mono"
                        onClick={() =>
                          setGeneralMessage((prev) => `${prev} ${v.token}`)
                        }
                        title={v.desc}
                      >
                        +{v.token}{' '}
                        <span className="font-sans text-[10px] text-muted-foreground ml-1">
                          ({v.desc})
                        </span>
                      </Badge>
                    ))}
                  </div>
                </div>

                <div className="pt-2 flex justify-end">
                  <Button
                    type="button"
                    onClick={handleSaveGeneralMessage}
                    disabled={isSavingGeneralMsg}
                    className="bg-indigo-600 hover:bg-indigo-700 text-white gap-2"
                  >
                    {isSavingGeneralMsg && (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    )}
                    Salvar Mensagem Geral
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* 2. MENSAGEM DE ENTREGA INDIVIDUAL POR PRODUTO */}
            <Card className="border-emerald-200 dark:border-emerald-900/60">
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Sparkles className="h-5 w-5 text-emerald-600" />
                  Mensagem de Entrega Individual por Produto (Específica)
                </CardTitle>
                <CardDescription>
                  Quer que um produto específico tenha uma mensagem própria (ex: instruções específicas da Netflix, link do app, regras de tela)? Configure abaixo! Se configurado, o sistema enviará a mensagem exclusiva daquele produto em vez da mensagem geral.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="p-4 rounded-xl border bg-muted/20 space-y-4">
                  <div className="space-y-1.5">
                    <Label className="text-xs font-bold">
                      1. Escolha ou Digite o Produto
                    </Label>
                    <div className="flex flex-col sm:flex-row gap-2">
                      {allProductNames.length > 0 && (
                        <Select
                          value={
                            allProductNames.includes(selectedProductForMsg)
                              ? selectedProductForMsg
                              : undefined
                          }
                          onValueChange={(val) => {
                            setSelectedProductForMsg(val);
                            const existing =
                              deliveryConfig?.productMessages?.[val] || '';
                            setCustomProductMsgText(
                              existing || DEFAULT_GENERAL_PRODUCT_DELIVERY_MESSAGE
                            );
                          }}
                        >
                          <SelectTrigger className="sm:w-[260px]">
                            <SelectValue placeholder="Selecionar produto..." />
                          </SelectTrigger>
                          <SelectContent>
                            {allProductNames.map((p) => (
                              <SelectItem key={p} value={p}>
                                📦 {p}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                      <Input
                        placeholder="Ou digite o nome exato do produto (ex: Netflix)..."
                        value={selectedProductForMsg}
                        onChange={(e) => setSelectedProductForMsg(e.target.value)}
                        className="flex-1"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-xs font-bold">
                      2. Mensagem Exclusiva para &quot;
                      {selectedProductForMsg || 'Produto Selecionado'}&quot;
                    </Label>
                    <Textarea
                      rows={7}
                      placeholder={DEFAULT_GENERAL_PRODUCT_DELIVERY_MESSAGE}
                      value={customProductMsgText}
                      onChange={(e) => setCustomProductMsgText(e.target.value)}
                      className="font-sans text-sm"
                    />
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {DELIVERY_VARIABLES.map((v) => (
                        <Badge
                          key={v.token}
                          variant="outline"
                          className="cursor-pointer hover:bg-emerald-50 dark:hover:bg-emerald-950/50 text-xs font-mono"
                          onClick={() =>
                            setCustomProductMsgText(
                              (prev) => `${prev} ${v.token}`
                            )
                          }
                        >
                          +{v.token}
                        </Badge>
                      ))}
                    </div>
                  </div>

                  <div className="flex justify-end">
                    <Button
                      type="button"
                      onClick={handleSaveProductSpecificMessage}
                      disabled={isSavingProductMsg}
                      className="bg-emerald-600 hover:bg-emerald-700 text-white gap-2"
                    >
                      {isSavingProductMsg && (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      )}
                      Salvar Mensagem deste Produto
                    </Button>
                  </div>
                </div>

                {/* Lista de Produtos que já possuem Mensagem Individual */}
                <div className="space-y-3">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                    Produtos com Mensagem Individual Configurada (
                    {Object.keys(deliveryConfig?.productMessages || {}).length})
                  </h4>

                  {Object.keys(deliveryConfig?.productMessages || {}).length ===
                  0 ? (
                    <div className="p-4 rounded-xl border bg-muted/10 text-xs text-muted-foreground text-center">
                      Nenhuma mensagem individual configurada ainda. Todos os produtos estão utilizando a Mensagem Geral de Entrega.
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {Object.entries(
                        deliveryConfig?.productMessages || {}
                      ).map(([prodKey, msgVal]) => (
                        <div
                          key={prodKey}
                          className="p-3.5 rounded-xl border bg-card space-y-2 shadow-2xs"
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-bold text-sm text-emerald-700 dark:text-emerald-400 flex items-center gap-1.5">
                              📦 {prodKey}
                            </span>
                            <div className="flex items-center gap-1">
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="h-7 px-2 text-xs gap-1"
                                onClick={() => {
                                  setSelectedProductForMsg(prodKey);
                                  setCustomProductMsgText(msgVal);
                                }}
                              >
                                <Edit className="h-3.5 w-3.5" />
                                Editar
                              </Button>
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="h-7 px-2 text-xs text-rose-600 hover:text-rose-700"
                                onClick={() =>
                                  handleRemoveProductSpecificMessage(prodKey)
                                }
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </div>
                          <p className="text-xs text-muted-foreground whitespace-pre-wrap line-clamp-4 bg-muted/30 p-2 rounded border">
                            {msgVal}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ================= ABA 3: API DE PAGAMENTO PIX & HISTÓRICO DE PEDIDOS ================= */}
          <TabsContent value="gateway" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <ShieldCheck className="h-5 w-5 text-emerald-600" />
                  Configuração da API de Pagamento PIX
                </CardTitle>
                <CardDescription>
                  Configure o gateway e o token da API que irá gerar o PIX quando o cliente clicar no botão do Fluxo e confirmar o pagamento automaticamente.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label className="text-xs font-bold">Gateway de Pagamento PIX</Label>
                    <Select
                      value={pixGateway}
                      onValueChange={(v: any) => setPixGateway(v)}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="pjpay">
                          ⚡ PJ Pay Gateway (Integrado & Automático)
                        </SelectItem>
                        <SelectItem value="linkinpay">
                          🔗 LinkinPay Gateway
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs font-bold">
                      Token da API de Pagamento (Opcional se já configurado no sistema)
                    </Label>
                    <Input
                      type="password"
                      placeholder="Deixe em branco para usar o token padrão da sua conta..."
                      value={pixApiToken}
                      onChange={(e) => setPixApiToken(e.target.value)}
                    />
                    <p className="text-[11px] text-muted-foreground">
                      Se você tiver uma chave de API específica para as vendas do Fluxo, cole aqui.
                    </p>
                  </div>
                </div>

                <div className="p-3.5 rounded-xl border bg-muted/20 flex items-center justify-between">
                  <div className="space-y-0.5 pr-4">
                    <Label className="text-xs font-bold">
                      Cadastrar cliente automaticamente no CRM após entregar o produto
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      Quando o pagamento PIX for aprovado, além de enviar o e-mail e senha no WhatsApp, o sistema cadastra o cliente como Ativo (+30 dias) na sua lista de clientes.
                    </p>
                  </div>
                  <Switch
                    checked={registerClientInCrm}
                    onCheckedChange={setRegisterClientInCrm}
                  />
                </div>

                <div className="p-3.5 rounded-xl border bg-slate-50 dark:bg-slate-900 space-y-1.5">
                  <Label className="text-xs font-bold">
                    URL de Webhook de Confirmação Automática (Configurada Automaticamente):
                  </Label>
                  <div className="flex items-center gap-2">
                    <Input
                      readOnly
                      value="https://www.pjcrm.site/api/flows/payment-webhook"
                      className="font-mono text-xs bg-background"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        navigator.clipboard.writeText(
                          'https://www.pjcrm.site/api/flows/payment-webhook'
                        );
                        toast({ title: 'URL de Webhook copiada!' });
                      }}
                    >
                      <Copy className="h-4 w-4 mr-1" />
                      Copiar
                    </Button>
                  </div>
                </div>

                <div className="flex justify-end">
                  <Button
                    type="button"
                    onClick={handleSaveGatewaySettings}
                    disabled={isSavingGateway}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white gap-2"
                  >
                    {isSavingGateway && (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    )}
                    Salvar Configurações de Pagamento
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* HISTÓRICO DE PEDIDOS PIX E ENTREGAS DO FLUXO */}
            <Card>
              <CardHeader className="pb-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div>
                  <CardTitle className="text-base">
                    Histórico de Cobranças PIX & Entregas do Fluxo (
                    {sortedOrders.length})
                  </CardTitle>
                  <CardDescription>
                    Acompanhe em tempo real todos os PIX gerados nos blocos do Fluxo e os logins entregues.
                  </CardDescription>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleVerifyPendingOrders}
                  disabled={isVerifyingOrders}
                  className="gap-1.5"
                >
                  {isVerifyingOrders ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <RefreshCcw className="h-4 w-4" />
                  )}
                  Verificar Pagamentos Pendentes
                </Button>
              </CardHeader>
              <CardContent>
                {sortedOrders.length === 0 ? (
                  <div className="py-8 text-center border rounded-xl bg-muted/10 text-xs text-muted-foreground">
                    Nenhum pedido PIX gerado pelo Fluxo ainda. Adicione o bloco &quot;Gerar PIX (Produto)&quot; no Canva Criador!
                  </div>
                ) : (
                  <div className="overflow-x-auto border rounded-xl">
                    <table className="w-full text-xs text-left">
                      <thead className="bg-muted/50 text-muted-foreground uppercase border-b">
                        <tr>
                          <th className="p-3 font-bold">Data</th>
                          <th className="p-3 font-bold">Cliente / WhatsApp</th>
                          <th className="p-3 font-bold">Produto</th>
                          <th className="p-3 font-bold">Valor</th>
                          <th className="p-3 font-bold">Login Entregue</th>
                          <th className="p-3 font-bold">Status</th>
                          <th className="p-3 font-bold text-right">Ação</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {sortedOrders.map((ord) => (
                          <tr key={ord.id} className="hover:bg-muted/30">
                            <td className="p-3 text-muted-foreground whitespace-nowrap">
                              {ord.createdAt
                                ? new Date(ord.createdAt).toLocaleString('pt-BR')
                                : '-'}
                            </td>
                            <td className="p-3">
                              <div className="font-semibold">
                                {ord.contactName || 'Cliente'}
                              </div>
                              <div className="text-[11px] text-muted-foreground font-mono">
                                {ord.phoneNumber}
                              </div>
                            </td>
                            <td className="p-3 font-bold">📦 {ord.productName}</td>
                            <td className="p-3 font-semibold text-emerald-700 dark:text-emerald-400">
                              {formatCentsToBrl(ord.amountInCents || 0)}
                            </td>
                            <td className="p-3 font-mono text-[11px]">
                              {ord.deliveredEmail ? (
                                <div>
                                  <span className="text-indigo-600 dark:text-indigo-400">
                                    {ord.deliveredEmail}
                                  </span>
                                  <br />
                                  <span className="text-muted-foreground">
                                    Senha: {ord.deliveredPassword}
                                  </span>
                                </div>
                              ) : (
                                '-'
                              )}
                            </td>
                            <td className="p-3">
                              {ord.status === 'delivered' ? (
                                <Badge className="bg-emerald-600 text-white text-[10px]">
                                  Pago & Entregue
                                </Badge>
                              ) : ord.status === 'out_of_stock' ? (
                                <Badge
                                  variant="destructive"
                                  className="text-[10px]"
                                >
                                  Pago (Sem Estoque)
                                </Badge>
                              ) : (
                                <Badge variant="outline" className="text-[10px]">
                                  Aguardando PIX
                                </Badge>
                              )}
                            </td>
                            <td className="p-3 text-right">
                              {ord.status !== 'delivered' && (
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  disabled={deliveringOrderId === ord.id}
                                  onClick={() => handleForceDeliverOrder(ord.id)}
                                  className="h-7 text-[11px] gap-1 border-emerald-300 text-emerald-700 hover:bg-emerald-50"
                                >
                                  {deliveringOrderId === ord.id ? (
                                    <Loader2 className="h-3 w-3 animate-spin" />
                                  ) : (
                                    <Send className="h-3 w-3" />
                                  )}
                                  Entregar Agora
                                </Button>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>

      {/* MODAL DE ADIÇÃO EM LOTE */}
      <Dialog open={isBulkOpen} onOpenChange={setIsBulkOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Layers className="h-5 w-5 text-indigo-600" />
              Adicionar Vários Logins em Lote
            </DialogTitle>
            <DialogDescription>
              Cole vários logins de uma só vez (1 por linha no formato{' '}
              <code className="font-mono font-bold">email:senha</code>).
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-bold">Nome do Produto *</Label>
                <Input
                  placeholder="Ex: Netflix"
                  value={bulkProductName}
                  onChange={(e) => setBulkProductName(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-bold">
                  Valor Padrão R$ (Opcional)
                </Label>
                <Input
                  placeholder="Ex: 19,90"
                  value={bulkDefaultPrice}
                  onChange={(e) => setBulkDefaultPrice(e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-bold">
                Lista de Logins (1 por linha: email:senha)
              </Label>
              <Textarea
                rows={8}
                placeholder={`conta1@gmail.com:senha123\nconta2@gmail.com:senha456\nconta3@gmail.com:senha789`}
                value={bulkLines}
                onChange={(e) => setBulkLines(e.target.value)}
                className="font-mono text-xs"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsBulkOpen(false)}>
              Cancelar
            </Button>
            <Button
              onClick={handleAddBulkStock}
              disabled={isSavingBulk}
              className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5"
            >
              {isSavingBulk && <Loader2 className="h-4 w-4 animate-spin" />}
              Importar para o Estoque
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* MODAL DE EDIÇÃO DE LOGIN DO ESTOQUE */}
      <Dialog
        open={!!editingItem}
        onOpenChange={(open) => !open && setEditingItem(null)}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Editar Login do Estoque</DialogTitle>
          </DialogHeader>
          {editingItem && (
            <div className="space-y-3 py-2">
              <div className="space-y-1">
                <Label className="text-xs font-bold">Nome do Produto</Label>
                <Input
                  value={editingItem.productName}
                  onChange={(e) =>
                    setEditingItem({
                      ...editingItem,
                      productName: e.target.value,
                    })
                  }
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs font-bold">E-mail (Login)</Label>
                <Input
                  value={editingItem.email}
                  onChange={(e) =>
                    setEditingItem({ ...editingItem, email: e.target.value })
                  }
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs font-bold">Senha</Label>
                <Input
                  value={editingItem.password}
                  onChange={(e) =>
                    setEditingItem({ ...editingItem, password: e.target.value })
                  }
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label className="text-xs">Tela (Opcional)</Label>
                  <Input
                    value={editingItem.screen || ''}
                    onChange={(e) =>
                      setEditingItem({ ...editingItem, screen: e.target.value })
                    }
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">PIN (Opcional)</Label>
                  <Input
                    value={editingItem.pinScreen || ''}
                    onChange={(e) =>
                      setEditingItem({
                        ...editingItem,
                        pinScreen: e.target.value,
                      })
                    }
                  />
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-xs font-bold">Status</Label>
                <Select
                  value={editingItem.status}
                  onValueChange={(v: 'available' | 'delivered') =>
                    setEditingItem({ ...editingItem, status: v })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="available">🟢 Disponível</SelectItem>
                    <SelectItem value="delivered">⚪ Entregue</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingItem(null)}>
              Cancelar
            </Button>
            <Button
              onClick={handleSaveEditItem}
              disabled={isSavingEdit}
              className="bg-indigo-600 hover:bg-indigo-700 text-white"
            >
              Salvar Alterações
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
