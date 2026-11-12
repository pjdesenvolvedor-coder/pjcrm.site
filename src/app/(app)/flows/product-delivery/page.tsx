'use client';

import React, { useState, useEffect, useMemo } from 'react';
import {
  collection,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  setDoc,
  getDocs,
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
  FlowProduct,
  FlowProductStockItem,
  FlowProductDeliveryConfig,
  FlowOrder,
  FlowDefinition,
} from '@/lib/types';
import {
  DEFAULT_GENERAL_PRODUCT_DELIVERY_MESSAGE,
  DEFAULT_FLOW_PIX_BILLING_MESSAGE,
  formatCentsToBrl,
} from '@/lib/flow-product-delivery';
import { DEFAULT_PJPAY_TOKEN } from '@/lib/pjpay';

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

  // 3. Produtos exclusivos deste Fluxo (sem nenhum vínculo com o restante do sistema)
  const flowProductsQuery = useMemoFirebase(() => {
    if (!effectiveUserId) return null;
    return collection(firestore, 'users', effectiveUserId, 'flow_products');
  }, [firestore, effectiveUserId]);
  const { data: flowProducts, isLoading: isLoadingFlowProducts } =
    useCollection<FlowProduct>(flowProductsQuery);

  // 4. Histórico de Pedidos PIX do Fluxo
  const ordersQuery = useMemoFirebase(() => {
    if (!effectiveUserId) return null;
    return query(collection(firestore, 'flow_orders'), where('userId', '==', effectiveUserId));
  }, [firestore, effectiveUserId]);
  const { data: flowOrders } = useCollection<FlowOrder>(ordersQuery);

  // Estados de Gerenciamento de Produtos Exclusivos do Fluxo
  const [isCreateProductOpen, setIsCreateProductOpen] = useState(false);
  const [newProductName, setNewProductName] = useState('');
  const [newProductPrice, setNewProductPrice] = useState('');
  const [newProductDescription, setNewProductDescription] = useState('');
  const [isSavingNewProduct, setIsSavingNewProduct] = useState(false);

  const [editingFlowProduct, setEditingFlowProduct] = useState<FlowProduct | null>(null);
  const [isSavingEditProduct, setIsSavingEditProduct] = useState(false);
  const [deletingFlowProductId, setDeletingFlowProductId] = useState<string | null>(null);
  const [isSyncingFlows, setIsSyncingFlows] = useState(false);

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
  const [deliverySendCopyButtons, setDeliverySendCopyButtons] = useState(true);
  const [isSavingGeneralMsg, setIsSavingGeneralMsg] = useState(false);

  const [selectedProductForMsg, setSelectedProductForMsg] = useState('');
  const [customProductMsgText, setCustomProductMsgText] = useState('');
  const [isSavingProductMsg, setIsSavingProductMsg] = useState(false);

  // Estados de Configuração do Gateway PIX
  const [pixGateway, setPixGateway] = useState<'pjpay' | 'linkinpay' | 'custom'>('pjpay');
  const [pixApiToken, setPixApiToken] = useState(DEFAULT_PJPAY_TOKEN);
  const [registerClientInCrm, setRegisterClientInCrm] = useState(true);
  const [pixSendCopyButton, setPixSendCopyButton] = useState(true);
  const [defaultPixBillingMessage, setDefaultPixBillingMessage] = useState(
    DEFAULT_FLOW_PIX_BILLING_MESSAGE
  );
  const [isSavingGateway, setIsSavingGateway] = useState(false);
  const [isVerifyingOrders, setIsVerifyingOrders] = useState(false);
  const [deliveringOrderId, setDeliveringOrderId] = useState<string | null>(null);

  // Estados de Teste da API PJ Pay Gateway na tela
  const [testAmountReais, setTestAmountReais] = useState('10,00');
  const [testPayerName, setTestPayerName] = useState('Cliente Teste');
  const [isGeneratingTestPix, setIsGeneratingTestPix] = useState(false);
  const [testPixResult, setTestPixResult] = useState<{
    id: string;
    qr_code: string;
    qr_code_base64: string;
    value: number;
    status: string;
  } | null>(null);
  const [isCheckingTestStatus, setIsCheckingTestStatus] = useState(false);

  // Sincronizar estados quando deliveryConfig carregar
  useEffect(() => {
    if (deliveryConfig) {
      setGeneralMessage(
        deliveryConfig.generalDeliveryMessage || DEFAULT_GENERAL_PRODUCT_DELIVERY_MESSAGE
      );
      setOutOfStockMessage(deliveryConfig.outOfStockMessage || '');
      setDeliverySendCopyButtons(deliveryConfig.deliverySendCopyButtons !== false);
      setPixGateway(deliveryConfig.pixGateway || 'pjpay');
      setPixApiToken(deliveryConfig.pixApiToken || DEFAULT_PJPAY_TOKEN);
      setRegisterClientInCrm(deliveryConfig.registerClientInCrm !== false);
      setPixSendCopyButton(deliveryConfig.pixSendCopyButton !== false);
      setDefaultPixBillingMessage(
        deliveryConfig.defaultPixBillingMessage || DEFAULT_FLOW_PIX_BILLING_MESSAGE
      );
    }
  }, [deliveryConfig]);

  // Verificação automática a cada 10s enquanto houver pedidos PIX pendentes na tela
  useEffect(() => {
    if (!effectiveUserId) return;
    const hasPending = (flowOrders || []).some((o) => o.status === 'pending');
    if (!hasPending) return;

    const timer = setInterval(() => {
      fetch('/api/flows/payment-webhook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'verify_all',
          userId: effectiveUserId,
        }),
      }).catch(() => {});
    }, 10000);

    return () => clearInterval(timer);
  }, [effectiveUserId, flowOrders]);

  // Auto-registro de produtos a partir do estoque existente para preservar o que já foi cadastrado neste fluxo
  useEffect(() => {
    if (!effectiveUserId || !stockItems || !flowProducts) return;
    const existingNames = new Set(
      (flowProducts || []).map((p) => (p.name || '').trim().toLowerCase())
    );
    const missingNames = new Map<string, number | null | undefined>();

    stockItems.forEach((item) => {
      const name = (item.productName || '').trim();
      if (name && !existingNames.has(name.toLowerCase())) {
        if (!missingNames.has(name.toLowerCase())) {
          missingNames.set(name.toLowerCase(), item.defaultPrice);
        }
      }
    });

    if (missingNames.size === 0) return;

    missingNames.forEach(async (price, lowerName) => {
      const originalItem = stockItems.find(
        (i) => (i.productName || '').trim().toLowerCase() === lowerName
      );
      const originalName = originalItem?.productName?.trim() || lowerName;
      try {
        await addDoc(collection(firestore, 'users', effectiveUserId, 'flow_products'), {
          userId: effectiveUserId,
          name: originalName,
          defaultPrice: price || null,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
      } catch {}
    });
  }, [effectiveUserId, stockItems, flowProducts, firestore]);

  // Lista consolidada de nomes de produtos exclusivos deste Fluxo (zero vínculo com outros produtos do sistema)
  const allProductNames = useMemo(() => {
    const set = new Set<string>();
    (flowProducts || []).forEach((p) => {
      if (p.name?.trim()) set.add(p.name.trim());
    });
    (stockItems || []).forEach((i) => {
      if (i.productName?.trim()) set.add(i.productName.trim());
    });
    if (deliveryConfig?.productMessages) {
      Object.keys(deliveryConfig.productMessages).forEach((k) => {
        if (k.trim()) set.add(k.trim());
      });
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [flowProducts, stockItems, deliveryConfig?.productMessages]);

  // Resumo de produtos exclusivos do fluxo e seus estoques
  const productSummaryList = useMemo(() => {
    const map = new Map<
      string,
      {
        id?: string;
        name: string;
        defaultPrice?: number | null;
        description?: string;
        available: number;
        delivered: number;
        total: number;
      }
    >();

    // Inicializa com todos os produtos criados no fluxo
    (flowProducts || []).forEach((p) => {
      const name = (p.name || '').trim();
      if (!name) return;
      map.set(name.toLowerCase(), {
        id: p.id,
        name,
        defaultPrice: p.defaultPrice,
        description: p.description,
        available: 0,
        delivered: 0,
        total: 0,
      });
    });

    // Contabiliza estoque do fluxo
    (stockItems || []).forEach((item) => {
      const name = (item.productName || 'Sem Nome').trim();
      const key = name.toLowerCase();
      const cur = map.get(key) || {
        name,
        defaultPrice: item.defaultPrice,
        available: 0,
        delivered: 0,
        total: 0,
      };
      if (item.status === 'available') cur.available += 1;
      else cur.delivered += 1;
      cur.total += 1;
      map.set(key, cur);
    });

    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [flowProducts, stockItems]);

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

  // Criar novo produto exclusivo do fluxo
  const handleCreateFlowProduct = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!effectiveUserId) return;
    const name = newProductName.trim();
    if (!name) {
      toast({
        variant: 'destructive',
        title: 'Nome obrigatório',
        description: 'Informe o nome do produto exclusivo do fluxo.',
      });
      return;
    }

    const alreadyExists = (flowProducts || []).some(
      (p) => p.name.trim().toLowerCase() === name.toLowerCase()
    );
    if (alreadyExists) {
      toast({
        variant: 'destructive',
        title: 'Produto já existe',
        description: `Já existe um produto com o nome "${name}" neste fluxo.`,
      });
      return;
    }

    setIsSavingNewProduct(true);
    try {
      const parsedPrice = newProductPrice
        ? parseFloat(newProductPrice.replace(',', '.'))
        : null;

      await addDoc(collection(firestore, 'users', effectiveUserId, 'flow_products'), {
        userId: effectiveUserId,
        name,
        defaultPrice: parsedPrice && !isNaN(parsedPrice) ? parsedPrice : null,
        description: newProductDescription.trim() || '',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      // Seleciona automaticamente para o formulário de estoque
      setProductName(name);
      if (parsedPrice && !isNaN(parsedPrice)) {
        setDefaultPrice(String(parsedPrice).replace('.', ','));
      }

      toast({
        title: 'Produto do fluxo criado com sucesso!',
        description: `"${name}" já está pronto para receber estoque e ser entregue no fluxo.`,
      });

      setIsCreateProductOpen(false);
      setNewProductName('');
      setNewProductPrice('');
      setNewProductDescription('');
    } catch (err: any) {
      toast({
        variant: 'destructive',
        title: 'Erro ao criar produto',
        description: err.message,
      });
    } finally {
      setIsSavingNewProduct(false);
    }
  };

  // Sincroniza produtos (nome e preço) em todos os fluxos do usuário
  const syncProductsWithAllFlows = async (
    targetProduct?: { name: string; prevName?: string; priceFormatted?: string | null }
  ): Promise<number> => {
    if (!effectiveUserId) return 0;
    try {
      const flowsSnap = await getDocs(collection(firestore, 'users', effectiveUserId, 'flows'));
      if (flowsSnap.empty) return 0;

      // Mapa de produtos do fluxo para consulta rápida
      const productPriceMap = new Map<string, { name: string; priceFormatted?: string }>();
      (flowProducts || []).forEach((p) => {
        const pName = (p.name || '').trim();
        if (!pName) return;
        const formatted =
          p.defaultPrice !== undefined && p.defaultPrice !== null
            ? Number(p.defaultPrice).toFixed(2).replace('.', ',')
            : undefined;
        productPriceMap.set(pName.toLowerCase(), { name: pName, priceFormatted: formatted });
      });

      // Se passou um target específico durante edição do produto, atualiza no mapa
      if (targetProduct) {
        const targetClean = targetProduct.name.trim();
        const priceClean = targetProduct.priceFormatted || undefined;
        productPriceMap.set(targetClean.toLowerCase(), { name: targetClean, priceFormatted: priceClean });
        if (targetProduct.prevName && targetProduct.prevName.trim()) {
          productPriceMap.set(targetProduct.prevName.trim().toLowerCase(), {
            name: targetClean,
            priceFormatted: priceClean,
          });
        }
      }

      let updatedFlowsCount = 0;
      for (const flowDoc of flowsSnap.docs) {
        const flowData = flowDoc.data() as FlowDefinition;
        let flowChanged = false;

        const updatedNodes = (flowData.nodes || []).map((node) => {
          if (node.data?.nodeType === 'pix_payment') {
            const currentProd = (node.data.pixProductName || '').trim().toLowerCase();
            const matched = productPriceMap.get(currentProd);

            if (matched) {
              const needsNameChange = node.data.pixProductName !== matched.name;
              const needsPriceChange =
                Boolean(matched.priceFormatted) && node.data.pixAmount !== matched.priceFormatted;

              if (needsNameChange || needsPriceChange) {
                flowChanged = true;
                const nextData: any = {
                  ...node.data,
                  pixProductName: matched.name,
                };
                if (matched.priceFormatted) {
                  nextData.pixAmount = matched.priceFormatted;
                }
                if (!node.data.label || node.data.label.startsWith('PIX:') || (targetProduct?.prevName && node.data.label === `PIX: ${targetProduct.prevName}`)) {
                  nextData.label = `PIX: ${matched.name}`;
                }
                return {
                  ...node,
                  data: nextData,
                };
              }
            }
          }
          return node;
        });

        if (flowChanged) {
          await updateDoc(doc(firestore, 'users', effectiveUserId, 'flows', flowDoc.id), {
            nodes: updatedNodes,
            updatedAt: new Date().toISOString(),
          });
          updatedFlowsCount++;
        }
      }

      return updatedFlowsCount;
    } catch (err) {
      console.error('[syncProductsWithAllFlows] Erro:', err);
      return 0;
    }
  };

  const handleManualSyncFlows = async () => {
    setIsSyncingFlows(true);
    try {
      const count = await syncProductsWithAllFlows();
      toast({
        title: 'Sincronização de Fluxos Concluída!',
        description:
          count > 0
            ? `${count} fluxo(s) foram atualizados com os valores e nomes mais recentes dos produtos.`
            : 'Todos os fluxos já estão 100% sincronizados com os valores dos produtos.',
      });
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Erro ao sincronizar', description: err.message });
    } finally {
      setIsSyncingFlows(false);
    }
  };

  // Salvar alterações de um produto do fluxo
  const handleSaveEditProduct = async () => {
    if (!effectiveUserId || !editingFlowProduct) return;
    const name = editingFlowProduct.name.trim();
    if (!name) {
      toast({
        variant: 'destructive',
        title: 'Nome obrigatório',
        description: 'O nome do produto não pode ficar em branco.',
      });
      return;
    }

    setIsSavingEditProduct(true);
    try {
      const prev = (flowProducts || []).find((p) => p.id === editingFlowProduct.id);
      const prevName = prev?.name?.trim();

      const parsedPrice =
        typeof editingFlowProduct.defaultPrice === 'string'
          ? parseFloat(String(editingFlowProduct.defaultPrice).replace(',', '.'))
          : editingFlowProduct.defaultPrice;

      await updateDoc(
        doc(firestore, 'users', effectiveUserId, 'flow_products', editingFlowProduct.id),
        {
          name,
          defaultPrice: parsedPrice && !isNaN(parsedPrice) ? parsedPrice : null,
          description: editingFlowProduct.description?.trim() || '',
          updatedAt: new Date().toISOString(),
        }
      );

      // Se o nome mudou, sincroniza os itens de estoque correspondentes
      if (prevName && prevName.toLowerCase() !== name.toLowerCase()) {
        const itemsToUpdate = (stockItems || []).filter(
          (i) => (i.productName || '').trim().toLowerCase() === prevName.toLowerCase()
        );
        for (const it of itemsToUpdate) {
          await updateDoc(
            doc(firestore, 'users', effectiveUserId, 'flow_product_stock', it.id),
            {
              productName: name,
              updatedAt: new Date().toISOString(),
            }
          );
        }
        if (productName.toLowerCase() === prevName.toLowerCase()) {
          setProductName(name);
        }
      }

      // Sincronizar automaticamente todos os fluxos que usam este produto (atualiza nome e valor do PIX)
      const formattedPrice =
        parsedPrice && !isNaN(parsedPrice)
          ? Number(parsedPrice).toFixed(2).replace('.', ',')
          : null;

      const syncedFlowsCount = await syncProductsWithAllFlows({
        name,
        prevName,
        priceFormatted: formattedPrice,
      });

      if (syncedFlowsCount > 0) {
        toast({
          title: 'Produto e fluxos sincronizados!',
          description: `O novo valor de R$ ${formattedPrice || '0,00'} e o nome foram atualizados em ${syncedFlowsCount} fluxo(s) automaticamente.`,
        });
      } else {
        toast({ title: 'Produto do fluxo atualizado!' });
      }
      setEditingFlowProduct(null);
    } catch (err: any) {
      toast({
        variant: 'destructive',
        title: 'Erro ao atualizar produto',
        description: err.message,
      });
    } finally {
      setIsSavingEditProduct(false);
    }
  };

  // Excluir produto exclusivo do fluxo
  const handleDeleteFlowProduct = async (id: string) => {
    if (!effectiveUserId) return;
    try {
      await deleteDoc(doc(firestore, 'users', effectiveUserId, 'flow_products', id));
      toast({ title: 'Produto removido do fluxo.' });
      setDeletingFlowProductId(null);
    } catch (err: any) {
      toast({
        variant: 'destructive',
        title: 'Erro ao excluir produto',
        description: err.message,
      });
    }
  };

  // Adicionar 1 login ao estoque
  const handleAddSingleStock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!effectiveUserId) return;
    if (!productName.trim() || !email.trim() || !password.trim()) {
      toast({
        variant: 'destructive',
        title: 'Campos obrigatórios',
        description: 'Selecione/informe o Produto do Fluxo, E-mail e Senha.',
      });
      return;
    }

    setIsAddingStock(true);
    try {
      const cleanProdName = productName.trim();
      const parsedPrice = defaultPrice
        ? parseFloat(defaultPrice.replace(',', '.'))
        : undefined;
      const parsedSlots = Math.max(1, parseInt(maxSlots, 10) || 1);

      // Garante que o produto existe na coleção flow_products exclusiva deste fluxo
      const existsInFlow = (flowProducts || []).some(
        (p) => p.name.trim().toLowerCase() === cleanProdName.toLowerCase()
      );
      if (!existsInFlow) {
        await addDoc(collection(firestore, 'users', effectiveUserId, 'flow_products'), {
          userId: effectiveUserId,
          name: cleanProdName,
          defaultPrice: parsedPrice && !isNaN(parsedPrice) ? parsedPrice : null,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
      }

      await addDoc(collection(firestore, 'users', effectiveUserId, 'flow_product_stock'), {
        userId: effectiveUserId,
        productName: cleanProdName,
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
        title: 'Login adicionado ao estoque do fluxo!',
        description: `Conta de "${cleanProdName}" pronta para entrega automática.`,
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
        title: 'Informe o produto do fluxo',
        description: 'Selecione ou informe o produto do fluxo para os logins em lote.',
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
      const cleanBulkName = bulkProductName.trim();
      const parsedPrice = bulkDefaultPrice
        ? parseFloat(bulkDefaultPrice.replace(',', '.'))
        : undefined;
      const parsedSlots = Math.max(1, parseInt(bulkMaxSlots, 10) || 1);

      // Garante que o produto existe na coleção flow_products exclusiva deste fluxo
      const existsInFlow = (flowProducts || []).some(
        (p) => p.name.trim().toLowerCase() === cleanBulkName.toLowerCase()
      );
      if (!existsInFlow) {
        await addDoc(collection(firestore, 'users', effectiveUserId, 'flow_products'), {
          userId: effectiveUserId,
          name: cleanBulkName,
          defaultPrice: parsedPrice && !isNaN(parsedPrice) ? parsedPrice : null,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
      }

      const colRef = collection(firestore, 'users', effectiveUserId, 'flow_product_stock');

      for (const line of lines) {
        const parts = line.split(/[:|;,\t]/);
        if (parts.length < 2) continue;
        const itemEmail = parts[0].trim();
        const itemPass = parts.slice(1).join(':').trim();
        if (!itemEmail || !itemPass) continue;

        await addDoc(colRef, {
          userId: effectiveUserId,
          productName: cleanBulkName,
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
        description: `Estoque de "${cleanBulkName}" abastecido com sucesso.`,
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
          deliverySendCopyButtons,
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
          pixSendCopyButton,
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
            {/* 1. SEÇÃO DE PRODUTOS EXCLUSIVOS DO FLUXO */}
            <Card className="border-indigo-200/80 dark:border-indigo-900/60 shadow-xs">
              <CardHeader className="pb-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Package className="h-5 w-5 text-indigo-600" />
                    Produtos Exclusivos do Fluxo ({productSummaryList.length})
                  </CardTitle>
                  <CardDescription>
                    Estes produtos existem apenas neste fluxo de entrega automática, sem qualquer vínculo com os outros produtos do sistema.
                  </CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleManualSyncFlows}
                    disabled={isSyncingFlows}
                    className="gap-1.5 text-xs border-emerald-300 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-50 dark:hover:bg-emerald-950/40"
                    title="Atualiza todos os blocos de PIX dos fluxos com os nomes e preços mais recentes dos produtos"
                  >
                    {isSyncingFlows ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <RefreshCcw className="h-3.5 w-3.5" />
                    )}
                    Sincronizar nos Fluxos
                  </Button>
                  <Button
                    type="button"
                    onClick={() => {
                      setNewProductName('');
                      setNewProductPrice('');
                      setNewProductDescription('');
                      setIsCreateProductOpen(true);
                    }}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5 shrink-0"
                  >
                    <Plus className="h-4 w-4" />
                    Novo Produto do Fluxo
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {productSummaryList.length === 0 ? (
                  <div className="py-6 text-center border-2 border-dashed rounded-xl bg-muted/20 space-y-2">
                    <Package className="h-8 w-8 mx-auto text-muted-foreground/60" />
                    <p className="text-sm font-semibold">Nenhum produto criado no fluxo ainda</p>
                    <p className="text-xs text-muted-foreground max-w-md mx-auto">
                      Crie seus produtos exclusivos do fluxo aqui para abastecer o estoque e realizar entregas automáticas via PIX.
                    </p>
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => {
                        setNewProductName('');
                        setNewProductPrice('');
                        setNewProductDescription('');
                        setIsCreateProductOpen(true);
                      }}
                      className="mt-2 bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5"
                    >
                      <Plus className="h-4 w-4" />
                      Criar Primeiro Produto
                    </Button>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {productSummaryList.map((prod) => (
                      <div
                        key={prod.name}
                        className="p-3.5 rounded-xl border bg-card/60 hover:bg-card hover:border-indigo-300 dark:hover:border-indigo-800 transition-all flex flex-col justify-between gap-3 shadow-2xs"
                      >
                        <div>
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex items-center gap-2">
                              <div className="p-2 rounded-lg bg-indigo-500/10 text-indigo-600 dark:text-indigo-400">
                                <Package className="h-4 w-4" />
                              </div>
                              <div>
                                <h4 className="text-sm font-bold text-foreground leading-tight">
                                  {prod.name}
                                </h4>
                                <p className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 mt-0.5">
                                  {prod.defaultPrice
                                    ? `R$ ${Number(prod.defaultPrice).toFixed(2).replace('.', ',')}`
                                    : 'Preço livre / Bloco'}
                                </p>
                              </div>
                            </div>
                            <div className="flex items-center gap-1">
                              {prod.id && (
                                <>
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    className="h-7 w-7 text-muted-foreground hover:text-foreground"
                                    title="Editar produto"
                                    onClick={() => {
                                      const original = (flowProducts || []).find((p) => p.id === prod.id);
                                      if (original) {
                                        setEditingFlowProduct(original);
                                      }
                                    }}
                                  >
                                    <Edit className="h-3.5 w-3.5" />
                                  </Button>
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    className="h-7 w-7 text-muted-foreground hover:text-destructive"
                                    title="Excluir produto"
                                    onClick={() => setDeletingFlowProductId(prod.id!)}
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </Button>
                                </>
                              )}
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center justify-between pt-2 border-t text-xs">
                          <div className="flex items-center gap-2">
                            <span
                              className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold ${
                                prod.available > 0
                                  ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                                  : 'bg-rose-500/15 text-rose-700 dark:text-rose-300'
                              }`}
                            >
                              {prod.available > 0 ? `${prod.available} disp.` : 'Sem estoque'}
                            </span>
                            {prod.delivered > 0 && (
                              <span className="text-[11px] text-muted-foreground">
                                {prod.delivered} entregue(s)
                              </span>
                            )}
                          </div>

                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-7 text-[11px] gap-1 border-indigo-200 text-indigo-700 hover:bg-indigo-50 dark:border-indigo-800 dark:text-indigo-300"
                            onClick={() => {
                              setProductName(prod.name);
                              if (prod.defaultPrice) {
                                setDefaultPrice(String(prod.defaultPrice).replace('.', ','));
                              }
                              document.getElementById('stock-form-card')?.scrollIntoView({ behavior: 'smooth' });
                            }}
                          >
                            <Plus className="h-3 w-3" />
                            Add Estoque
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* 2. CARD DE CADASTRO DE NOVO LOGIN */}
            <Card id="stock-form-card" className="border-indigo-200/70 dark:border-indigo-900/50 shadow-xs">
              <CardHeader className="pb-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div>
                  <CardTitle className="text-base flex items-center gap-2">
                    <KeyRound className="h-5 w-5 text-emerald-600" />
                    Adicionar Login ao Estoque
                  </CardTitle>
                  <CardDescription>
                    Cadastre o produto do fluxo, e-mail e senha que serão entregues automaticamente assim que o PIX for pago no Fluxo.
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
                    {/* Produto do Fluxo */}
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <Label className="text-xs font-bold">
                          Produto do Fluxo *
                        </Label>
                        <button
                          type="button"
                          onClick={() => {
                            setNewProductName('');
                            setNewProductPrice(defaultPrice);
                            setNewProductDescription('');
                            setIsCreateProductOpen(true);
                          }}
                          className="text-[11px] text-emerald-600 dark:text-emerald-400 hover:underline flex items-center gap-1 font-semibold"
                        >
                          <Plus className="h-3 w-3" />
                          Novo Produto
                        </button>
                      </div>
                      <div className="flex gap-2">
                        <Select
                          value={productName}
                          onValueChange={(val) => {
                            setProductName(val);
                            const found = (flowProducts || []).find((p) => p.name === val);
                            if (found?.defaultPrice && !defaultPrice) {
                              setDefaultPrice(String(found.defaultPrice).replace('.', ','));
                            }
                          }}
                        >
                          <SelectTrigger className="flex-1">
                            <SelectValue
                              placeholder={
                                (flowProducts || []).length > 0
                                  ? 'Selecione o produto do fluxo...'
                                  : 'Crie um produto do fluxo...'
                              }
                            />
                          </SelectTrigger>
                          <SelectContent>
                            {(flowProducts || []).map((p) => (
                              <SelectItem key={p.id} value={p.name}>
                                📦 {p.name}{' '}
                                {p.defaultPrice
                                  ? `(R$ ${Number(p.defaultPrice).toFixed(2).replace('.', ',')})`
                                  : ''}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => {
                            setNewProductName('');
                            setNewProductPrice(defaultPrice);
                            setNewProductDescription('');
                            setIsCreateProductOpen(true);
                          }}
                          className="shrink-0 text-xs gap-1 border-emerald-300 text-emerald-700 hover:bg-emerald-50 dark:border-emerald-800 dark:text-emerald-300"
                        >
                          <Plus className="h-3.5 w-3.5" />
                          Criar
                        </Button>
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

                {/* Opção de Enviar Mensagem com Botões de Cópia */}
                <div className="flex items-center justify-between p-3.5 rounded-xl border bg-slate-50 dark:bg-slate-900">
                  <div className="space-y-0.5 pr-4">
                    <Label className="text-sm font-semibold flex items-center gap-2">
                      <Copy className="h-4 w-4 text-indigo-600" />
                      Enviar com botões Copiar E-mail e Copiar Senha
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      Anexa os botões interativos nativos no WhatsApp para o cliente copiar o e-mail e a senha do produto entregue com 1 clique (sem descrições extras nos botões).
                    </p>
                  </div>
                  <Switch
                    checked={deliverySendCopyButtons}
                    onCheckedChange={setDeliverySendCopyButtons}
                  />
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
                      1. Escolha o Produto Exclusivo do Fluxo
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
                          <SelectTrigger className="sm:w-[280px]">
                            <SelectValue placeholder="Selecionar produto do fluxo..." />
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
                        placeholder="Ou digite o nome do produto do fluxo..."
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
                      Token Bearer da PJ Pay Gateway
                    </Label>
                    <Input
                      type="text"
                      placeholder="pj_live_W9IMRIG1GFW48ND7YIUEX5sELQB4tDLD"
                      value={pixApiToken}
                      onChange={(e) => setPixApiToken(e.target.value)}
                      className="font-mono text-xs"
                    />
                    <p className="text-[11px] text-emerald-700 dark:text-emerald-400 font-medium">
                      ✅ Integrado com POST https://www.pjgateway.com/api/v1/payments e GET /api/v1/payments/&#123;id&#125;
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

                <div className="p-3.5 rounded-xl border bg-emerald-50/40 dark:bg-emerald-950/20 border-emerald-200/60 dark:border-emerald-900/50 flex items-center justify-between">
                  <div className="space-y-0.5 pr-4">
                    <Label className="text-xs font-bold flex items-center gap-1.5 text-emerald-950 dark:text-emerald-200">
                      <Copy className="h-3.5 w-3.5 text-emerald-600" />
                      Botão de Copiar Chave PIX (Interativo no WhatsApp)
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      Anexa o botão oficial &quot;Copiar Código Pix&quot; (estilo grupos) na mensagem do Copia e Cola para o cliente copiar a chave com 1 toque no celular.
                    </p>
                  </div>
                  <Switch
                    checked={pixSendCopyButton}
                    onCheckedChange={setPixSendCopyButton}
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

            {/* CARD DE TESTE RÁPIDO DA API PJ PAY GATEWAY */}
            <Card className="border-emerald-200 dark:border-emerald-900/60">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <QrCode className="h-5 w-5 text-emerald-600" />
                  Testar Geração de PIX na PJ Pay Gateway
                </CardTitle>
                <CardDescription>
                  Gere uma cobrança PIX de teste em tempo real via <code className="font-mono">POST https://www.pjgateway.com/api/v1/payments</code> e consulte o status em <code className="font-mono">GET /api/v1/payments/&#123;id&#125;</code>.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
                  <div className="space-y-1">
                    <Label className="text-xs font-bold">Nome do Pagador (payer.name)</Label>
                    <Input
                      value={testPayerName}
                      onChange={(e) => setTestPayerName(e.target.value)}
                      placeholder="Nome do Cliente"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs font-bold">Valor em R$</Label>
                    <Input
                      value={testAmountReais}
                      onChange={(e) => setTestAmountReais(e.target.value)}
                      placeholder="10,00"
                    />
                  </div>
                  <Button
                    type="button"
                    disabled={isGeneratingTestPix}
                    onClick={async () => {
                      setIsGeneratingTestPix(true);
                      try {
                        const rawVal = parseFloat(testAmountReais.replace(',', '.')) || 10;
                        const amountInCents = Math.max(100, Math.round(rawVal * 100));
                        const res = await fetch('/api/flows/payment-webhook', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({
                            action: 'test_create_pix',
                            amountInCents,
                            payerName: testPayerName,
                            apiToken: pixApiToken,
                          }),
                        });
                        const data = await res.json();
                        if (data.success && data.payment) {
                          setTestPixResult(data.payment);
                          toast({
                            title: 'PIX Gerado com Sucesso!',
                            description: `ID: ${data.payment.id}`,
                          });
                        } else {
                          toast({
                            variant: 'destructive',
                            title: 'Erro ao gerar PIX',
                            description: data.error || 'Falha na requisição',
                          });
                        }
                      } catch (err: any) {
                        toast({
                          variant: 'destructive',
                          title: 'Erro',
                          description: err.message,
                        });
                      } finally {
                        setIsGeneratingTestPix(false);
                      }
                    }}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5"
                  >
                    {isGeneratingTestPix ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <QrCode className="h-4 w-4" />
                    )}
                    Gerar PIX de Teste
                  </Button>
                </div>

                {testPixResult && (
                  <div className="p-4 rounded-xl border bg-emerald-50/40 dark:bg-emerald-950/20 space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="space-y-0.5">
                        <span className="text-xs font-bold text-emerald-900 dark:text-emerald-200">
                          ID do Pagamento: <code className="font-mono">{testPixResult.id}</code>
                        </span>
                        <div className="flex items-center gap-2">
                          <Badge
                            className={
                              testPixResult.status === 'paid'
                                ? 'bg-emerald-600 text-white'
                                : 'bg-amber-500 text-white'
                            }
                          >
                            Status: {testPixResult.status.toUpperCase()}
                          </Badge>
                        </div>
                      </div>

                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={isCheckingTestStatus}
                        onClick={async () => {
                          setIsCheckingTestStatus(true);
                          try {
                            const res = await fetch('/api/flows/payment-webhook', {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({
                                action: 'check_pix_status',
                                paymentId: testPixResult.id,
                                apiToken: pixApiToken,
                              }),
                            });
                            const data = await res.json();
                            if (data.success) {
                              setTestPixResult((prev) =>
                                prev ? { ...prev, status: data.status } : prev
                              );
                              toast({
                                title: data.paid
                                  ? '✅ Pagamento Confirmado (status: paid)!'
                                  : `Status atual: ${data.status}`,
                              });
                            }
                          } finally {
                            setIsCheckingTestStatus(false);
                          }
                        }}
                        className="gap-1.5 text-xs"
                      >
                        {isCheckingTestStatus ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <RefreshCcw className="h-3.5 w-3.5" />
                        )}
                        Consultar Status (GET /payments/{testPixResult.id.slice(0, 8)}...)
                      </Button>
                    </div>

                    <div className="flex flex-col sm:flex-row gap-4 items-center">
                      {testPixResult.qr_code_base64 && (
                        <img
                          src={
                            testPixResult.qr_code_base64.startsWith('data:')
                              ? testPixResult.qr_code_base64
                              : `data:image/png;base64,${testPixResult.qr_code_base64}`
                          }
                          alt="QR Code PIX"
                          className="w-36 h-36 rounded-lg border bg-white p-1.5 shrink-0"
                        />
                      )}
                      <div className="flex-1 w-full space-y-1.5">
                        <Label className="text-xs font-bold">
                          Código PIX Copia e Cola (pix.qr_code):
                        </Label>
                        <Textarea
                          readOnly
                          rows={3}
                          value={testPixResult.qr_code}
                          className="font-mono text-[11px] bg-background"
                        />
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            navigator.clipboard.writeText(testPixResult.qr_code);
                            toast({ title: 'PIX Copia e Cola copiado!' });
                          }}
                          className="gap-1.5 text-xs"
                        >
                          <Copy className="h-3.5 w-3.5" />
                          Copiar Código PIX
                        </Button>
                      </div>
                    </div>
                  </div>
                )}
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
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-bold">Produto do Fluxo *</Label>
                  <button
                    type="button"
                    onClick={() => {
                      setNewProductName('');
                      setNewProductPrice(bulkDefaultPrice);
                      setNewProductDescription('');
                      setIsCreateProductOpen(true);
                    }}
                    className="text-[11px] text-emerald-600 dark:text-emerald-400 hover:underline flex items-center gap-1 font-semibold"
                  >
                    <Plus className="h-3 w-3" />
                    Novo Produto
                  </button>
                </div>
                <Select
                  value={bulkProductName}
                  onValueChange={(val) => {
                    setBulkProductName(val);
                    const found = (flowProducts || []).find((p) => p.name === val);
                    if (found?.defaultPrice && !bulkDefaultPrice) {
                      setBulkDefaultPrice(String(found.defaultPrice).replace('.', ','));
                    }
                  }}
                >
                  <SelectTrigger>
                    <SelectValue
                      placeholder={
                        (flowProducts || []).length > 0
                          ? 'Selecione o produto do fluxo...'
                          : 'Crie um produto do fluxo...'
                      }
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {(flowProducts || []).map((p) => (
                      <SelectItem key={p.id} value={p.name}>
                        📦 {p.name}{' '}
                        {p.defaultPrice
                          ? `(R$ ${Number(p.defaultPrice).toFixed(2).replace('.', ',')})`
                          : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
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

      {/* MODAL DE CRIAÇÃO DE PRODUTO EXCLUSIVO DO FLUXO */}
      <Dialog open={isCreateProductOpen} onOpenChange={setIsCreateProductOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Package className="h-5 w-5 text-emerald-600" />
              Novo Produto Exclusivo do Fluxo
            </DialogTitle>
            <DialogDescription>
              Este produto existirá unicamente dentro deste menu de entrega automática, sem qualquer vínculo com os outros produtos ou assinaturas do CRM.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleCreateFlowProduct} className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label className="text-xs font-bold">
                Nome do Produto do Fluxo *
              </Label>
              <Input
                placeholder="Ex: Netflix 4K, Disney+, Canva Pro, IPTV Mensal..."
                value={newProductName}
                onChange={(e) => setNewProductName(e.target.value)}
                autoFocus
              />
              <p className="text-[11px] text-muted-foreground">
                Nome exibido no fluxo e entregue após a confirmação do pagamento.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-bold">
                Valor Padrão da Cobrança PIX R$ (Opcional)
              </Label>
              <Input
                placeholder="Ex: 19,90"
                value={newProductPrice}
                onChange={(e) => setNewProductPrice(e.target.value)}
              />
              <p className="text-[11px] text-muted-foreground">
                Preço sugerido automaticamente ao adicionar este produto em um bloco do Fluxo.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">
                Descrição / Notas (Opcional)
              </Label>
              <Input
                placeholder="Ex: Entrega de tela única compartilhada..."
                value={newProductDescription}
                onChange={(e) => setNewProductDescription(e.target.value)}
              />
            </div>

            <DialogFooter className="pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsCreateProductOpen(false)}
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={isSavingNewProduct}
                className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5"
              >
                {isSavingNewProduct && <Loader2 className="h-4 w-4 animate-spin" />}
                Criar Produto do Fluxo
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* MODAL DE EDIÇÃO DE PRODUTO DO FLUXO */}
      <Dialog
        open={!!editingFlowProduct}
        onOpenChange={(open) => !open && setEditingFlowProduct(null)}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Edit className="h-5 w-5 text-indigo-600" />
              Editar Produto do Fluxo
            </DialogTitle>
            <DialogDescription>
              Altere os dados deste produto exclusivo do fluxo.
            </DialogDescription>
          </DialogHeader>

          {editingFlowProduct && (
            <div className="space-y-4 py-2">
              <div className="space-y-1.5">
                <Label className="text-xs font-bold">Nome do Produto *</Label>
                <Input
                  value={editingFlowProduct.name}
                  onChange={(e) =>
                    setEditingFlowProduct({
                      ...editingFlowProduct,
                      name: e.target.value,
                    })
                  }
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-bold">
                  Valor Padrão R$ (Opcional)
                </Label>
                <Input
                  value={
                    editingFlowProduct.defaultPrice !== undefined &&
                    editingFlowProduct.defaultPrice !== null
                      ? String(editingFlowProduct.defaultPrice)
                      : ''
                  }
                  onChange={(e) =>
                    setEditingFlowProduct({
                      ...editingFlowProduct,
                      defaultPrice: e.target.value as any,
                    })
                  }
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">
                  Descrição (Opcional)
                </Label>
                <Input
                  value={editingFlowProduct.description || ''}
                  onChange={(e) =>
                    setEditingFlowProduct({
                      ...editingFlowProduct,
                      description: e.target.value,
                    })
                  }
                />
              </div>
            </div>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setEditingFlowProduct(null)}
            >
              Cancelar
            </Button>
            <Button
              onClick={handleSaveEditProduct}
              disabled={isSavingEditProduct}
              className="bg-indigo-600 hover:bg-indigo-700 text-white"
            >
              {isSavingEditProduct && (
                <Loader2 className="h-4 w-4 animate-spin mr-1.5" />
              )}
              Salvar Alterações
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* MODAL DE CONFIRMAÇÃO DE EXCLUSÃO DE PRODUTO DO FLUXO */}
      <Dialog
        open={!!deletingFlowProductId}
        onOpenChange={(open) => !open && setDeletingFlowProductId(null)}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-rose-600">
              <AlertTriangle className="h-5 w-5" />
              Excluir Produto do Fluxo?
            </DialogTitle>
            <DialogDescription>
              Tem certeza de que deseja remover este produto exclusivo do fluxo? O produto deixará de aparecer na lista de seleção. Os logins de estoque já adicionados permanecerão salvos no histórico.
            </DialogDescription>
          </DialogHeader>

          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => setDeletingFlowProductId(null)}
            >
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (deletingFlowProductId) {
                  handleDeleteFlowProduct(deletingFlowProductId);
                }
              }}
            >
              Excluir Produto
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
