'use client';

import React, { useState, useEffect, useRef, useMemo } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  Mail,
  UserCircle,
  LogOut,
  Zap,
  Loader2,
  QrCode,
  Home,
  Users,
  Bot,
  Send,
  ChevronRight,
  Settings as SettingsIcon,
  Contact,
  Package,
  LifeBuoy,
  ShieldAlert,
  TrendingUp,
  UserPlus,
  StickyNote,
  Briefcase,
  Activity,
  AlertTriangle,
  ClipboardList,
  Clock,
  List,
  Filter,
  Database,
  Trash2,
  FileText,
  Boxes,
  KeyRound,
  CalendarDays,
  LayoutDashboard,
  MessageSquareShare,
  UsersRound,
  Wand2,
  Megaphone,
  Eraser,
  MessageCircleMore,
  BarChart3,
  NotepadText,
  Store,
  Webhook,
  DollarSign,
  RefreshCcw,
  Save,
  SaveAll,
  Link2,
  ShieldCheck,
  Bug,
  Copy,
  Key,
  Eye,
  EyeOff,
  ChevronUp,
  ChevronDown,
  Workflow,
} from 'lucide-react';
import Image from 'next/image';
import { Upsell2MessageHandler } from '@/components/upsell-2-message-handler';

import {
  SidebarProvider,
  Sidebar,
  SidebarHeader,
  SidebarContent,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarFooter,
  SidebarInset,
  SidebarMenuSub,
  SidebarMenuSubItem,
  SidebarMenuSubButton,
} from '@/components/ui/sidebar';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import { Button, buttonVariants } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useUser, useAuth, useDoc, useFirebase, useMemoFirebase, useCollection } from '@/firebase';
import { doc, collection, query, where, setDoc } from 'firebase/firestore';
import type { UserProfile, Settings, Client, Lead } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { ScheduledMessageHandler } from '@/components/scheduled-message-handler';
import { UpsellMessageHandler } from '@/components/upsell-message-handler';
import { RemarketingMessageHandler } from '@/components/remarketing-message-handler';
import { SubscriptionTimer } from '@/components/SubscriptionTimer';
import { SystemAlert } from '@/components/SystemAlert';
import { SystemNotification } from '@/components/SystemNotification';
import { RenewalDispatchWidget } from '@/components/RenewalDispatchWidget';

type LiveStatus = {
  status: 'disconnected' | 'connecting' | 'connected';
  profileName?: string;
  profilePicUrl?: string;
};

function ExpirationOverlay() {
    const router = useRouter();
    const auth = useAuth();
    const { toast } = useToast();

    const handleLogout = async () => {
        try {
            await auth.signOut();
            router.push('/login');
            toast({ title: 'Você foi desconectado.' });
        } catch (error) {
            console.error(error);
            toast({ variant: 'destructive', title: 'Erro ao sair.' });
        }
    };

    return (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-background/80 backdrop-blur-sm">
            <Card className="w-full max-w-md m-4 text-center shadow-2xl animate-in fade-in-0 zoom-in-95">
                <CardHeader>
                    <CardTitle className="text-2xl text-destructive">Assinatura Expirada</CardTitle>
                    <CardDescription>Sua assinatura (ou teste grátis) terminou.</CardDescription>
                </CardHeader>
                <CardContent>
                    <p className="text-muted-foreground">
                        Para continuar usando o sistema, por favor, renove ou escolha um plano.
                    </p>
                </CardContent>
                <CardFooter className="flex-col gap-2">
                     <Button className="w-full" onClick={() => router.push('/profile')}>Renovar Assinatura</Button>
                     <Button variant="ghost" className="w-full text-muted-foreground" onClick={handleLogout}>
                        <LogOut className="mr-2 h-4 w-4" />
                        Sair
                     </Button>
                </CardFooter>
            </Card>
        </div>
    );
}

function BlockedOverlay() {
    return (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-background/80 backdrop-blur-sm">
            <Card className="w-full max-w-md m-4 text-center shadow-2xl animate-in fade-in-0 zoom-in-95">
                <CardHeader>
                    <CardTitle className="text-2xl text-destructive">Acesso Bloqueado</CardTitle>
                </CardHeader>
                <CardContent>
                    <p className="text-muted-foreground">
                        Sua conta foi bloqueada pelo administrador. Por favor, entre em contato com o suporte para mais informações.
                    </p>
                </CardContent>
                <CardFooter className="justify-center">
                     <a
                        href="https://wa.link/siil2n"
                        target="_blank"
                        rel="noopener noreferrer"
                        className={cn(buttonVariants({ variant: 'default' }), 'w-full')}
                    >
                        Contatar Suporte
                    </a>
                </CardFooter>
            </Card>
        </div>
    );
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const auth = useAuth();
  const { firestore, effectiveUserId, userProfile, isUserLoading } = useFirebase();
  const { user } = useUser();
  const [isSidebarOpen, setSidebarOpen] = useState(true);
  const { toast } = useToast();
  
  const [isZapConnectOpen, setZapConnectOpen] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<'disconnected' | 'connecting' | 'qr_code' | 'error'>('disconnected');
  const [qrCode, setQrCode] = useState<string | null>(null);
  
  const [hubTokenInput, setHubTokenInput] = useState('');
  const [isSavingHubToken, setIsSavingHubToken] = useState(false);
  const [isTokenSectionOpen, setIsTokenSectionOpen] = useState(false);
  const [showTokenText, setShowTokenText] = useState(false);

  const [liveStatus, setLiveStatus] = useState<LiveStatus | null>(null);
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const [isDisconnecting, setIsDisconnecting] = useState(false);

  const [showExpiredOverlay, setShowExpiredOverlay] = useState(false);

  const settingsDocRef = useMemoFirebase(() => {
    if (!effectiveUserId) return null;
    return doc(firestore, 'users', effectiveUserId, 'settings', 'config');
  }, [firestore, effectiveUserId]);

  const { data: settings, isLoading: isLoadingSettings } = useDoc<Settings>(settingsDocRef);

  useEffect(() => {
    if (settings?.webhookToken !== undefined) {
      setHubTokenInput(settings.webhookToken || '');
    }
  }, [settings?.webhookToken]);

  const supportClientsQuery = useMemoFirebase(() => {
    if (!effectiveUserId) return null;
    return query(collection(firestore, 'users', effectiveUserId, 'clients'), where('needsSupport', '==', true));
  }, [firestore, effectiveUserId]);

  const { data: supportClients } = useCollection<Client>(supportClientsQuery);

  const pendingLeadsQuery = useMemoFirebase(() => {
    if (!effectiveUserId) return null;
    return query(collection(firestore, 'users', effectiveUserId, 'leads'), where('status', '==', 'pending'));
  }, [firestore, effectiveUserId]);
  const { data: pendingLeads } = useCollection<Lead>(pendingLeadsQuery);

  const supportCount = supportClients?.length ?? 0;
  const leadCount = pendingLeads?.length ?? 0;

  const permissions = useMemo(() => {
    const defaultPermissions = {
        dashboard: false,
        customers: false,
        inbox: false,
        automations: false,
        groups: false,
        shot: false,
        zapconnect: false,
        settings: false,
        users: false,
        attendants: false,
        estoque: true,
        notes: false,
        ads: false,
        pix: false,
        usage: false,
        logs: false,
        dbCleaner: true,
        zapVendas: true,
        calendario: true,
        linksClaro: true,
        sendMessage: true,
        flows: true,
    };

    if (userProfile?.role === 'Admin') {
        return Object.keys(defaultPermissions).reduce((acc, key) => {
            acc[key as keyof typeof defaultPermissions] = true;
            return acc;
        }, {} as typeof defaultPermissions);
    }
    return { ...defaultPermissions, ...userProfile?.permissions };
  }, [userProfile]);

  const fetchStatus = React.useCallback(async () => {
    if (isLoadingSettings || !settings?.webhookToken) {
      setLiveStatus({ status: 'disconnected' });
      return;
    }
    try {
      const response = await fetch('/api/status', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ token: settings.webhookToken }),
      });

      if (response.ok) {
        const data = await response.json();
        const statusData = Array.isArray(data) ? data[0] : data;

        if (statusData) {
          const newStatus: LiveStatus = {
            status: statusData.status,
            profileName: statusData.nomeperfil,
            profilePicUrl: statusData.fotoperfil,
          };
          setLiveStatus(newStatus);
          
          if (newStatus.status === 'connected') {
            if (connectionStatus === 'qr_code' || connectionStatus === 'connecting') {
              setConnectionStatus('disconnected');
              setQrCode(null);
            }
          }
        } else {
          setLiveStatus({ status: 'disconnected' });
        }
      } else {
        setLiveStatus({ status: 'disconnected' });
      }
    } catch (error) {
      console.error('Status polling error:', error);
      setLiveStatus({ status: 'disconnected' });
    }
  }, [isLoadingSettings, settings?.webhookToken, connectionStatus, setConnectionStatus, setQrCode]);

  // Fetch status once when webhook token is first available
  useEffect(() => {
    if (settings?.webhookToken) {
      fetchStatus();
    }
  }, [settings?.webhookToken, fetchStatus]);

  // Global continuous polling every 15s to keep sidebar indicator up to date
  useEffect(() => {
    if (!settings?.webhookToken) return;
    const intervalId = setInterval(() => {
      fetchStatus();
    }, 15000);
    return () => clearInterval(intervalId);
  }, [settings?.webhookToken, fetchStatus]);

  // Aggressive poll every 3s when Zap Connect dialog is open and not yet connected
  useEffect(() => {
    if (!isZapConnectOpen || liveStatus?.status === 'connected') return;

    let active = true;
    let timeoutId: NodeJS.Timeout;

    const poll = async () => {
      if (!active) return;
      await fetchStatus();
      if (active && liveStatus?.status !== 'connected' && isZapConnectOpen) {
        timeoutId = setTimeout(poll, 3000);
      }
    };

    poll();

    return () => {
      active = false;
      clearTimeout(timeoutId);
    };
  }, [isZapConnectOpen, liveStatus?.status, fetchStatus]);

  useEffect(() => {
    if (!isZapConnectOpen) {
      setTimeout(() => {
        setConnectionStatus('disconnected');
        setQrCode(null);
      }, 300);
    }
  }, [isZapConnectOpen]);
  
  useEffect(() => {
    if (liveStatus?.status === 'connected' && (connectionStatus === 'qr_code' || connectionStatus === 'connecting')) {
      setConnectionStatus('disconnected');
      setQrCode(null);
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
        pollingIntervalRef.current = null;
      }
    }
  }, [liveStatus, connectionStatus]);

  useEffect(() => {
    if (!isUserLoading && !user) {
      router.push('/login');
    }
  }, [user, isUserLoading, router]);

  useEffect(() => {
    if (!isUserLoading && userProfile && !userProfile.subscriptionPlan && userProfile.role === 'User') {
        router.push('/subscription');
    }
  }, [userProfile, isUserLoading, router]);

  useEffect(() => {
    if (
      !isUserLoading &&
      userProfile &&
      userProfile.role !== 'Admin' &&
      userProfile.subscriptionEndDate &&
      userProfile.subscriptionEndDate.toDate() < new Date()
    ) {
      setShowExpiredOverlay(true);
    } else {
      setShowExpiredOverlay(false);
    }
  }, [userProfile, isUserLoading]);


  if (isUserLoading || !user || !userProfile) {
    return (
        <div className="flex h-screen w-screen items-center justify-center">
            <div className="flex flex-col items-center gap-4">
                <Mail className="h-12 w-12 animate-pulse text-primary" />
                <p className="text-muted-foreground">Carregando...</p>
            </div>
        </div>
    );
  }

  const handleSignOut = async () => {
    await auth.signOut();
    router.push('/login');
  };
  
  const userAvatar = (liveStatus?.status === 'connected' && liveStatus.profilePicUrl) ? liveStatus.profilePicUrl : (userProfile?.avatarUrl || "https://picsum.photos/seed/1/40/40");

  const handleSaveHubToken = async () => {
    if (!effectiveUserId) return;
    const tokenClean = hubTokenInput.trim();
    if (!tokenClean) {
      toast({
        variant: 'destructive',
        title: 'Token inválido',
        description: 'Digite ou cole o token antes de salvar.',
      });
      return;
    }
    setIsSavingHubToken(true);
    try {
      await setDoc(doc(firestore, 'users', effectiveUserId, 'settings', 'config'), { webhookToken: tokenClean }, { merge: true });
      toast({
        title: 'Token Salvo com Sucesso!',
        description: 'Seu token do Hub Principal foi atualizado.',
      });
      fetchStatus();
    } catch (e: any) {
      toast({
        variant: 'destructive',
        title: 'Erro ao salvar',
        description: e.message || 'Falha ao salvar token.',
      });
    } finally {
      setIsSavingHubToken(false);
    }
  };

  const handleConnect = async () => {
    const effectiveToken = (hubTokenInput || settings?.webhookToken || '').trim();
    if (!effectiveToken) {
        toast({
            variant: 'destructive',
            title: 'Token não informado',
            description: 'Por favor, digite ou cole seu token antes de conectar.',
        });
        setConnectionStatus('error');
        return;
    }

    // Se o token digitado for diferente do salvo, salva automaticamente no banco
    if (effectiveUserId && effectiveToken !== settings?.webhookToken) {
        setDoc(doc(firestore, 'users', effectiveUserId, 'settings', 'config'), { webhookToken: effectiveToken }, { merge: true }).catch(() => {});
    }

    setConnectionStatus('connecting');
    setQrCode(null);

    try {
        const response = await fetch('/api/connect', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token: effectiveToken }),
        });

        const data = await response.json().catch(() => ({}));

        if (!response.ok) {
            throw new Error(data.error || `Falha no servidor de conexão (${response.status}).`);
        }

        const qrCodeValue = data.qrcode;

        if (qrCodeValue) {
            setQrCode(qrCodeValue.startsWith('data:image') ? qrCodeValue : `data:image/png;base64,${qrCodeValue}`);
            setConnectionStatus('qr_code');
            toast({ title: 'QR Code Pronto!', description: 'Escaneie para conectar.' });
        } else {
            throw new Error(data.error || 'QR code não foi retornado pela instância.');
        }
    } catch (error: any) {
        console.error('Erro ao conectar Zap:', error);
        setConnectionStatus('error');
        toast({ variant: 'destructive', title: 'Falha na Conexão', description: error.message });
    }
  };
  
  const handleDisconnect = async () => {
    const effectiveToken = (hubTokenInput || settings?.webhookToken || '').trim();
    if (!effectiveToken) return;
    setIsDisconnecting(true);
    try {
        await fetch('/api/disconnect', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token: effectiveToken }),
        });
        toast({ title: 'Desconectado!' });
        setLiveStatus({ status: 'disconnected' });
        setConnectionStatus('disconnected');
        setQrCode(null);
    } catch (error: any) {
        toast({ variant: 'destructive', title: 'Falha ao Desconectar' });
    } finally {
        setIsDisconnecting(false);
    }
  };

  const renderContent = () => {
    if (connectionStatus === 'connecting') {
      return (
        <div className="flex flex-col items-center justify-center text-center p-4 sm:p-6 gap-3 min-h-[220px]">
          <Loader2 className="h-10 w-10 text-primary animate-spin" />
          <p className="text-xs sm:text-sm font-medium text-muted-foreground mt-2">Gerando QR code de conexão...</p>
        </div>
      );
    }
    if (connectionStatus === 'qr_code' && qrCode) {
      return (
        <div className="flex flex-col items-center justify-center text-center py-2 px-1 gap-2">
          <Badge variant="default" className="py-0.5 px-2.5 bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300 text-xs font-semibold">
            <QrCode className="h-3.5 w-3.5 mr-1.5" /> Pronto para escanear
          </Badge>
          <div className="w-48 h-48 sm:w-52 sm:h-52 bg-white rounded-xl flex items-center justify-center my-1.5 p-2 shadow-md border mx-auto">
            <Image src={qrCode} alt="QR Code" width={195} height={195} className="w-full h-full object-contain" data-ai-hint="qr code"/>
          </div>
          <p className="text-xs sm:text-sm font-semibold text-muted-foreground animate-pulse">Aguardando leitura no WhatsApp...</p>
        </div>
      );
    }
    if (liveStatus?.status === 'connected') {
      return (
        <div className="flex flex-col items-center justify-center text-center py-3 px-1 gap-2.5">
          <Badge variant="default" className="py-0.5 px-2.5 bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 text-xs font-semibold">
            WhatsApp Conectado
          </Badge>
          {liveStatus.profilePicUrl && (
            <Image src={liveStatus.profilePicUrl} alt="Foto" width={68} height={68} className="rounded-full my-1.5 shadow-md border-2 border-emerald-500/30 object-cover" />
          )}
          <p className="font-bold text-sm sm:text-base text-foreground truncate max-w-[260px]">{liveStatus.profileName || 'Instância Ativa'}</p>
          <div className="flex flex-col gap-2 w-full pt-1">
            <Button variant="outline" size="sm" className="w-full gap-2 border-emerald-200 text-emerald-700 hover:bg-emerald-50 dark:border-emerald-800 dark:text-emerald-300 text-xs h-8.5" onClick={() => { setZapConnectOpen(false); router.push('/settings/save-contacts'); }}>
              <SaveAll className="h-4 w-4" />
              Salvar Contatos (Exportar)
            </Button>
            <Button variant="destructive" size="sm" className="w-full text-xs h-8.5" onClick={handleDisconnect} disabled={isDisconnecting}>
              {isDisconnecting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : "Desconectar"}
            </Button>
          </div>
        </div>
      );
    }
    return (
      <div className="flex flex-col items-center justify-center text-center py-4 px-1 gap-2 min-h-[180px]">
        <Badge variant="destructive" className="py-0.5 px-2.5 text-xs font-semibold">Desconectado</Badge>
        <p className="text-xs text-muted-foreground">Clique em 'Conectar' abaixo para parear.</p>
        <div className="w-20 h-20 bg-muted/20 rounded-xl flex items-center justify-center my-1 border border-dashed border-border"><Zap className="h-8 w-8 text-muted-foreground/30" /></div>
      </div>
    );
  };


  return (
    <SidebarProvider open={isSidebarOpen} onOpenChange={setSidebarOpen}>
      {showExpiredOverlay && <ExpirationOverlay />}
      {userProfile?.status === 'blocked' && <BlockedOverlay />}
      <SystemAlert />
      <Sidebar variant="sidebar" collapsible="icon">
        <SidebarHeader className="p-4">
          <Link href="/dashboard" className="flex items-center gap-2">
            <Image src="https://i.imgur.com/sgoiuiz.png" alt="Logo" width={32} height={32} className="w-8 h-8" />
            <span className="text-lg font-semibold group-data-[collapsible=icon]:hidden">EMPREENDIMENTOS - CRM</span>
          </Link>
        </SidebarHeader>
        <SidebarContent>
          <Dialog open={isZapConnectOpen} onOpenChange={setZapConnectOpen}>
            <SidebarMenu>
              {/* GROUP 1: VISÃO GERAL */}
              <div className="px-3 py-1 mt-2 text-[10px] font-bold tracking-wider text-muted-foreground uppercase opacity-70">Painel</div>
              {permissions.dashboard && (
                <SidebarMenuItem>
                    <SidebarMenuButton asChild isActive={pathname === '/dashboard'} tooltip="Dashboard">
                        <Link href="/dashboard"><LayoutDashboard className="h-4 w-4" /><span className="text-[13px] font-medium">Dashboard</span></Link>
                    </SidebarMenuButton>
                </SidebarMenuItem>
              )}

              {permissions.calendario && (
                <SidebarMenuItem>
                    <SidebarMenuButton asChild isActive={pathname === '/calendario'} tooltip="Calendário">
                        <Link href="/calendario"><CalendarDays className="h-4 w-4" /><span className="text-[13px] font-medium">Calendário</span></Link>
                    </SidebarMenuButton>
                </SidebarMenuItem>
              )}

              <SidebarMenuItem>
                  <SidebarMenuButton asChild isActive={pathname === '/teste'} tooltip="Teste">
                      <Link href="/teste"><Activity className="h-4 w-4" /><span className="text-[13px] font-medium">Teste</span></Link>
                  </SidebarMenuButton>
              </SidebarMenuItem>

              <SidebarMenuItem>
                  <SidebarMenuButton asChild isActive={pathname === '/webhook-receiver'} tooltip="Receber Webhook">
                      <Link href="/webhook-receiver"><Webhook className="h-4 w-4" /><span className="text-[13px] font-medium">Receber Webhook</span></Link>
                  </SidebarMenuButton>
              </SidebarMenuItem>
              
              {permissions.ads && (
                <SidebarMenuItem>
                  <SidebarMenuButton asChild isActive={pathname === '/notes/ads'} tooltip="Relatórios">
                      <Link href="/notes/ads"><BarChart3 className="h-4 w-4" /><span className="text-[13px] font-medium">Relatórios</span></Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )}

              {/* GROUP 2: GESTÃO */}
              <div className="px-3 py-1 mt-4 text-[10px] font-bold tracking-wider text-muted-foreground uppercase opacity-70">Gestão</div>
              {permissions.customers && (
                <SidebarMenuItem>
                  <Collapsible defaultOpen={pathname.startsWith('/customers') || pathname === '/support'}>
                      <CollapsibleTrigger asChild>
                          <SidebarMenuButton className="w-full justify-between" tooltip="Clientes">
                              <div className="flex items-center gap-2"><UsersRound className="h-4 w-4" /><span className="text-[13px] font-medium">Clientes</span></div>
                              <ChevronRight className="h-4 w-4 shrink-0 transition-transform duration-200 data-[state=open]:rotate-90" />
                          </SidebarMenuButton>
                      </CollapsibleTrigger>
                      <CollapsibleContent>
                          <SidebarMenuSub>
                              <SidebarMenuSubItem><SidebarMenuSubButton className="text-xs" asChild isActive={pathname === '/customers'}><Link href="/customers">Lista Completa</Link></SidebarMenuSubButton></SidebarMenuSubItem>
                              <SidebarMenuSubItem>
                                  <SidebarMenuSubButton className="text-xs" asChild isActive={pathname === '/customers/wants-to-buy'}>
                                      <Link href="/customers/wants-to-buy"><span>Prospectos</span>{leadCount > 0 && <Badge variant="default" className="ml-auto bg-blue-500 h-4 px-1">{leadCount}</Badge>}</Link>
                                  </SidebarMenuSubButton>
                              </SidebarMenuSubItem>
                              <SidebarMenuSubItem>
                                  <SidebarMenuSubButton className="text-xs" asChild isActive={pathname === '/support'}>
                                      <Link href="/support"><span>Tickets</span>{supportCount > 0 && <Badge variant="secondary" className="ml-auto h-4 px-1">{supportCount}</Badge>}</Link>
                                  </SidebarMenuSubButton>
                              </SidebarMenuSubItem>
                          </SidebarMenuSub>
                      </CollapsibleContent>
                  </Collapsible>
                </SidebarMenuItem>
              )}

              {permissions.estoque && (
                <SidebarMenuItem>
                  <Collapsible defaultOpen={pathname.startsWith('/estoque')}>
                      <CollapsibleTrigger asChild>
                          <SidebarMenuButton className="w-full justify-between" tooltip="Estoque">
                              <div className="flex items-center gap-2"><Boxes className="h-4 w-4" /><span className="text-[13px] font-medium">Estoque</span></div>
                              <ChevronRight className="h-4 w-4 shrink-0 transition-transform duration-200 data-[state=open]:rotate-90" />
                          </SidebarMenuButton>
                      </CollapsibleTrigger>
                      <CollapsibleContent>
                          <SidebarMenuSub>
                                <SidebarMenuSubItem>
                                    <SidebarMenuSubButton className="text-xs" asChild isActive={pathname === '/estoque/contas-completas'}>
                                        <Link href="/estoque/contas-completas">Gestão de Contas</Link>
                                    </SidebarMenuSubButton>
                                </SidebarMenuSubItem>
                          </SidebarMenuSub>
                      </CollapsibleContent>
                  </Collapsible>
                </SidebarMenuItem>
              )}

              {permissions.linksClaro && (
                <SidebarMenuItem>
                  <Collapsible defaultOpen={pathname.startsWith('/links-claro')}>
                      <CollapsibleTrigger asChild>
                          <SidebarMenuButton className="w-full justify-between" tooltip="Links Claro">
                              <div className="flex items-center gap-2">
                                <Link2 className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                                <span className="text-[13px] font-bold text-blue-700 dark:text-blue-400">Links Claro</span>
                              </div>
                              <ChevronRight className="h-4 w-4 shrink-0 transition-transform duration-200 data-[state=open]:rotate-90" />
                          </SidebarMenuButton>
                      </CollapsibleTrigger>
                      <CollapsibleContent>
                          <SidebarMenuSub>
                                <SidebarMenuSubItem>
                                    <SidebarMenuSubButton className="text-xs" asChild isActive={pathname === '/links-claro/logins'}>
                                        <Link href="/links-claro/logins">Logins</Link>
                                    </SidebarMenuSubButton>
                                </SidebarMenuSubItem>
                                <SidebarMenuSubItem>
                                    <SidebarMenuSubButton className="text-xs" asChild isActive={pathname === '/links-claro/links'}>
                                        <Link href="/links-claro/links">Links</Link>
                                    </SidebarMenuSubButton>
                                </SidebarMenuSubItem>
                          </SidebarMenuSub>
                      </CollapsibleContent>
                  </Collapsible>
                </SidebarMenuItem>
              )}

              {permissions.notes && (
                <SidebarMenuItem>
                  <SidebarMenuButton asChild isActive={pathname === '/notes/tasks'} tooltip="Tarefas">
                      <Link href="/notes/tasks"><NotepadText className="h-4 w-4" /><span className="text-[13px] font-medium">Tarefas</span></Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )}

              {/* GROUP 3: AUTOMAÇÃO E MENSAGENS */}
              <div className="px-3 py-1 mt-4 text-[10px] font-bold tracking-wider text-muted-foreground uppercase opacity-70">Operacional</div>
              {permissions.automations && (
                <SidebarMenuItem>
                      <Collapsible defaultOpen={pathname.startsWith('/automations')}>
                      <CollapsibleTrigger asChild>
                          <SidebarMenuButton className="w-full justify-between" tooltip="Automações">
                              <div className="flex items-center gap-2"><Wand2 className="h-4 w-4" /><span className="text-[13px] font-medium">Automações</span></div>
                              <ChevronRight className="h-4 w-4 shrink-0 transition-transform duration-200 data-[state=open]:rotate-90" />
                          </SidebarMenuButton>
                      </CollapsibleTrigger>
                      <CollapsibleContent>
                          <SidebarMenuSub>
                                <SidebarMenuSubItem><SidebarMenuSubButton className="text-xs" asChild isActive={pathname === '/automations/renewal'}><Link href="/automations/renewal" className="text-emerald-600 dark:text-emerald-400 font-bold">Renovação PIX ⚡</Link></SidebarMenuSubButton></SidebarMenuSubItem>
                                <SidebarMenuSubItem><SidebarMenuSubButton className="text-xs" asChild isActive={pathname === '/automations/test-renewal'}><Link href="/automations/test-renewal" className="text-amber-600 dark:text-amber-400 font-bold">Teste Renovação 🧪</Link></SidebarMenuSubButton></SidebarMenuSubItem>
                                <SidebarMenuSubItem><SidebarMenuSubButton className="text-xs" asChild isActive={pathname === '/automations/remarketing'}><Link href="/automations/remarketing">Remarketing</Link></SidebarMenuSubButton></SidebarMenuSubItem>
                                <SidebarMenuSubItem><SidebarMenuSubButton className="text-xs" asChild isActive={pathname === '/automations/upsell'}><Link href="/automations/upsell" className="text-emerald-600 dark:text-emerald-400 font-bold">Funil Upsell 🚀</Link></SidebarMenuSubButton></SidebarMenuSubItem>
                                <SidebarMenuSubItem><SidebarMenuSubButton className="text-xs" asChild isActive={pathname === '/automations/upsell-menu'}><Link href="/automations/upsell-menu" className="text-violet-600 dark:text-violet-400 font-bold">Upsell com Menu 🎯</Link></SidebarMenuSubButton></SidebarMenuSubItem>
                                <SidebarMenuSubItem><SidebarMenuSubButton className="text-xs" asChild isActive={pathname === '/automations/delivery-credentials'}><Link href="/automations/delivery-credentials">Envio Acesso (Dados)</Link></SidebarMenuSubButton></SidebarMenuSubItem>
                                <SidebarMenuSubItem><SidebarMenuSubButton className="text-xs" asChild isActive={pathname === '/automations/delivery-link'}><Link href="/automations/delivery-link">Envio Acesso (Link)</Link></SidebarMenuSubButton></SidebarMenuSubItem>
                                <SidebarMenuSubItem><SidebarMenuSubButton className="text-xs" asChild isActive={pathname === '/automations/support'}><Link href="/automations/support">Msg Suporte</Link></SidebarMenuSubButton></SidebarMenuSubItem>
                                <SidebarMenuSubItem><SidebarMenuSubButton className="text-xs" asChild isActive={pathname === '/automations/leads'}><Link href="/automations/leads">Msg Leads</Link></SidebarMenuSubButton></SidebarMenuSubItem>
                          </SidebarMenuSub>
                      </CollapsibleContent>
                  </Collapsible>
                </SidebarMenuItem>
              )}

              {/* FLUXO (BotConversa style) */}
              {(permissions.flows ?? true) && (
                <SidebarMenuItem>
                  <Collapsible defaultOpen={pathname.startsWith('/flows')}>
                      <CollapsibleTrigger asChild>
                          <SidebarMenuButton className="w-full justify-between" tooltip="Fluxo">
                              <div className="flex items-center gap-2">
                                <Workflow className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
                                <span className="text-[13px] font-bold text-indigo-700 dark:text-indigo-400">Fluxo</span>
                              </div>
                              <ChevronRight className="h-4 w-4 shrink-0 transition-transform duration-200 data-[state=open]:rotate-90" />
                          </SidebarMenuButton>
                      </CollapsibleTrigger>
                      <CollapsibleContent>
                          <SidebarMenuSub>
                                <SidebarMenuSubItem>
                                    <SidebarMenuSubButton className="text-xs" asChild isActive={pathname === '/flows/connection'}>
                                        <Link href="/flows/connection">Conectar WhatsApp</Link>
                                    </SidebarMenuSubButton>
                                </SidebarMenuSubItem>
                                <SidebarMenuSubItem>
                                    <SidebarMenuSubButton className="text-xs" asChild isActive={pathname === '/flows' || (pathname.startsWith('/flows/') && pathname !== '/flows/connection' && pathname !== '/flows/settings' && pathname !== '/flows/kanban' && pathname !== '/flows/variables')}>
                                        <Link href="/flows">Canva (Criador)</Link>
                                    </SidebarMenuSubButton>
                                </SidebarMenuSubItem>
                                <SidebarMenuSubItem>
                                    <SidebarMenuSubButton className="text-xs" asChild isActive={pathname === '/flows/variables'}>
                                        <Link href="/flows/variables">Personalizar Variáveis</Link>
                                    </SidebarMenuSubButton>
                                </SidebarMenuSubItem>
                                <SidebarMenuSubItem>
                                    <SidebarMenuSubButton className="text-xs" asChild isActive={pathname === '/flows/kanban'}>
                                        <Link href="/flows/kanban">Kanban de Chats</Link>
                                    </SidebarMenuSubButton>
                                </SidebarMenuSubItem>
                                <SidebarMenuSubItem>
                                    <SidebarMenuSubButton className="text-xs" asChild isActive={pathname === '/flows/settings'}>
                                        <Link href="/flows/settings">Configurações</Link>
                                    </SidebarMenuSubButton>
                                </SidebarMenuSubItem>
                          </SidebarMenuSub>
                      </CollapsibleContent>
                  </Collapsible>
                </SidebarMenuItem>
              )}

              {permissions.shot && (
                <SidebarMenuItem>
                  <Collapsible defaultOpen={pathname.startsWith('/shot')}>
                      <CollapsibleTrigger asChild>
                          <SidebarMenuButton className="w-full justify-between" tooltip="Disparo em Massa">
                              <div className="flex items-center gap-2"><Megaphone className="h-4 w-4" /><span className="text-[13px] font-medium">Campanhas</span></div>
                              <ChevronRight className="h-4 w-4 shrink-0 transition-transform duration-200 data-[state=open]:rotate-90" />
                          </SidebarMenuButton>
                      </CollapsibleTrigger>
                      <CollapsibleContent>
                          <SidebarMenuSub>
                                <SidebarMenuSubItem><SidebarMenuSubButton className="text-xs" asChild isActive={pathname === '/shot/status-product'}><Link href="/shot/status-product">Por Produto</Link></SidebarMenuSubButton></SidebarMenuSubItem>
                          </SidebarMenuSub>
                      </CollapsibleContent>
                  </Collapsible>
                </SidebarMenuItem>
              )}

              {permissions.groups && (
                <SidebarMenuItem>
                  <Collapsible defaultOpen={pathname.startsWith('/groups')}>
                      <CollapsibleTrigger asChild>
                          <SidebarMenuButton className="w-full justify-between" tooltip="Grupos WhatsApp">
                              <div className="flex items-center gap-2"><MessageCircleMore className="h-4 w-4" /><span className="text-[13px] font-medium">Comunidades</span></div>
                              <ChevronRight className="h-4 w-4 shrink-0 transition-transform duration-200 data-[state=open]:rotate-90" />
                          </SidebarMenuButton>
                      </CollapsibleTrigger>
                      <CollapsibleContent>
                          <SidebarMenuSub>
                                <SidebarMenuSubItem><SidebarMenuSubButton className="text-xs" asChild isActive={pathname === '/groups/get-jid'}><Link href="/groups/get-jid">Obter JID</Link></SidebarMenuSubButton></SidebarMenuSubItem>
                                <SidebarMenuSubItem><SidebarMenuSubButton className="text-xs" asChild isActive={pathname === '/groups/extract-members'}><Link href="/groups/extract-members">Extrair Leads</Link></SidebarMenuSubButton></SidebarMenuSubItem>
                                <SidebarMenuSubItem><SidebarMenuSubButton className="text-xs" asChild isActive={pathname === '/groups/schedule-message'}><Link href="/groups/schedule-message">Agendar Envio</Link></SidebarMenuSubButton></SidebarMenuSubItem>
                          </SidebarMenuSub>
                      </CollapsibleContent>
                  </Collapsible>
                </SidebarMenuItem>
              )}

              {permissions.sendMessage && (
                <SidebarMenuItem>
                  <SidebarMenuButton asChild isActive={pathname === '/send-message'} tooltip="Enviar Mensagem">
                      <Link href="/send-message">
                          <Send className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                          <span className="text-[13px] font-medium">Enviar Mensagem</span>
                      </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )}

              {/* GROUP 4: CONEXÕES WPP */}
              <div className="px-3 py-1 mt-4 text-[10px] font-bold tracking-wider text-muted-foreground uppercase opacity-70">Conexões</div>
              
              <SidebarMenuItem>
                  <SidebarMenuButton asChild isActive={pathname === '/settings/save-contacts'} tooltip="Salvar Contatos">
                      <Link href="/settings/save-contacts">
                        <SaveAll className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                        <span className="flex-1 text-[13px] font-bold text-blue-700 dark:text-blue-400">Salvar Contatos</span>
                      </Link>
                  </SidebarMenuButton>
              </SidebarMenuItem>

              {permissions.zapconnect && (
                <DialogTrigger asChild>
                  <SidebarMenuItem>
                    <SidebarMenuButton tooltip={`Hub Principal ${typeof settings?.webhookToken === 'string' && settings.webhookToken.length > 0 ? `(${settings.webhookToken.slice(0, 8)}...)` : ''}`}>
                      <MessageSquareShare className="h-4 w-4 text-emerald-600 dark:text-emerald-500 shrink-0" />
                      <div className="flex flex-col min-w-0 flex-1 text-left group-data-[collapsible=icon]:hidden">
                        <span className="text-[13px] font-bold text-emerald-700 dark:text-emerald-400 leading-tight">Hub Principal</span>
                        {typeof settings?.webhookToken === 'string' && settings.webhookToken.length > 0 && (
                          <span className="text-[10px] text-muted-foreground font-mono leading-none truncate opacity-75">
                            {settings.webhookToken.slice(0, 8)}...
                          </span>
                        )}
                      </div>
                      <div className="group-data-[collapsible=icon]:hidden shrink-0">
                        {liveStatus?.status === 'connected' ? <div className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" /> : <div className="h-2 w-2 rounded-full bg-destructive" />}
                      </div>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                </DialogTrigger>
              )}

              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={pathname === '/zap-cobranca'} tooltip="ZAP Cobrança">
                  <Link href="/zap-cobranca">
                    <DollarSign className="h-4 w-4 text-violet-600 dark:text-violet-400" />
                    <span className="flex-1 text-[13px] font-bold text-violet-700 dark:text-violet-400">ZAP Cobrança</span>
                    <div className="group-data-[collapsible=icon]:hidden">
                      {settings?.useSeparateBillingZap
                        ? (settings?.billingWebhookToken ? <div className="h-2 w-2 rounded-full bg-violet-500" /> : <div className="h-2 w-2 rounded-full bg-destructive" />)
                        : <div className="h-2 w-2 rounded-full bg-emerald-400" />}
                    </div>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton asChild isActive={pathname === '/2-fatores'} tooltip="2FA APP">
                    <Link href="/2-fatores">
                      <ShieldCheck className="h-4 w-4 text-green-600 dark:text-green-400" />
                      <span className="flex-1 text-[13px] font-bold text-green-700 dark:text-green-400">2FA APP</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>

              {permissions.zapVendas && (
                <SidebarMenuItem>
                  <Collapsible>
                      <CollapsibleTrigger asChild>
                          <SidebarMenuButton className="w-full justify-between" tooltip="ZAP VENDAS">
                              <div className="flex items-center gap-2"><Store className="h-4 w-4 text-orange-600 dark:text-orange-500" /><span className="text-[13px] font-bold text-orange-700 dark:text-orange-400">PDV Vendas</span></div>
                              <ChevronRight className="h-4 w-4 shrink-0 transition-transform duration-200 data-[state=open]:rotate-90" />
                          </SidebarMenuButton>
                      </CollapsibleTrigger>
                      <CollapsibleContent>
                          <SidebarMenuSub>
                              <SidebarMenuSubItem><SidebarMenuSubButton className="text-xs" asChild isActive={pathname === '/zap-vendas/connection'}><Link href="/zap-vendas/connection">Aparelho</Link></SidebarMenuSubButton></SidebarMenuSubItem>
                              <SidebarMenuSubItem><SidebarMenuSubButton className="text-xs" asChild isActive={pathname === '/zap-vendas/settings'}><Link href="/zap-vendas/settings">Ajustes</Link></SidebarMenuSubButton></SidebarMenuSubItem>
                          </SidebarMenuSub>
                      </CollapsibleContent>
                  </Collapsible>
                </SidebarMenuItem>
              )}

              {/* GROUP 5: SISTEMA */}
              <div className="px-3 py-1 mt-4 text-[10px] font-bold tracking-wider text-muted-foreground uppercase opacity-70">Sistema</div>
              {permissions.dbCleaner && (
                <SidebarMenuItem>
                  <Collapsible defaultOpen={pathname.startsWith('/db-cleaner')}>
                      <CollapsibleTrigger asChild>
                          <SidebarMenuButton className="w-full justify-between" tooltip="Limpador DB">
                              <div className="flex items-center gap-2"><Eraser className="h-4 w-4" /><span className="text-[13px] font-medium">Limpeza Web</span></div>
                              <ChevronRight className="h-4 w-4 shrink-0 transition-transform duration-200 data-[state=open]:rotate-90" />
                          </SidebarMenuButton>
                      </CollapsibleTrigger>
                      <CollapsibleContent>
                          <SidebarMenuSub>
                                <SidebarMenuSubItem>
                                    <SidebarMenuSubButton className="text-xs" asChild isActive={pathname === '/db-cleaner/duplicates'}>
                                        <Link href="/db-cleaner/duplicates">Remover Duplicatas</Link>
                                    </SidebarMenuSubButton>
                                </SidebarMenuSubItem>
                                <SidebarMenuSubItem>
                                    <SidebarMenuSubButton className="text-xs" asChild isActive={pathname === '/db-cleaner/returns'}>
                                        <Link href="/db-cleaner/returns">Tratar Retornos</Link>
                                    </SidebarMenuSubButton>
                                </SidebarMenuSubItem>
                          </SidebarMenuSub>
                      </CollapsibleContent>
                  </Collapsible>
                </SidebarMenuItem>
              )}

              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={pathname === '/debug'} tooltip="DEBUG / Logs do Sistema">
                  <Link href="/debug">
                    <Bug className="h-4 w-4 text-rose-600 dark:text-rose-400" />
                    <span className="flex-1 text-[13px] font-bold text-rose-600 dark:text-rose-400">DEBUG & Logs</span>
                    <Badge variant="destructive" className="h-4 px-1.5 text-[9px] font-mono bg-rose-600">LIVE</Badge>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              
              {permissions.users && (
                <SidebarMenuItem>
                  <SidebarMenuButton asChild isActive={pathname === '/users'} tooltip="Gerenciar Usuários">
                      <Link href="/users"><Users className="h-4 w-4 text-sky-600 dark:text-sky-400" /><span className="text-[13px] font-medium">Gerenciar Usuários</span></Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )}

              {permissions.settings && (
                <SidebarMenuItem>
                  <Collapsible defaultOpen={pathname.startsWith('/settings')}>
                      <CollapsibleTrigger asChild>
                          <SidebarMenuButton className="w-full justify-between" tooltip="Configurações">
                              <div className="flex items-center gap-2"><SettingsIcon className="h-4 w-4" /><span className="text-[13px] font-medium">Configurações</span></div>
                              <ChevronRight className="h-4 w-4 shrink-0 transition-transform duration-200 data-[state=open]:rotate-90" />
                          </SidebarMenuButton>
                      </CollapsibleTrigger>
                      <CollapsibleContent>
                          <SidebarMenuSub>
                              <SidebarMenuSubItem><SidebarMenuSubButton className="text-xs" asChild isActive={pathname === '/settings'}><Link href="/settings">Geral</Link></SidebarMenuSubButton></SidebarMenuSubItem>
                              <SidebarMenuSubItem><SidebarMenuSubButton className="text-xs" asChild isActive={pathname === '/settings/my-token'}><Link href="/settings/my-token">Tokens n8n</Link></SidebarMenuSubButton></SidebarMenuSubItem>
                              <SidebarMenuSubItem><SidebarMenuSubButton className="text-xs" asChild isActive={pathname === '/settings/subscriptions'}><Link href="/settings/subscriptions">Planos</Link></SidebarMenuSubButton></SidebarMenuSubItem>
                              <SidebarMenuSubItem><SidebarMenuSubButton className="text-xs" asChild isActive={pathname === '/settings/presets'}><Link href="/settings/presets">Predefinições</Link></SidebarMenuSubButton></SidebarMenuSubItem>
                          </SidebarMenuSub>
                      </CollapsibleContent>
                  </Collapsible>
                </SidebarMenuItem>
              )}
              

              {/* COBRAR VENCIDOS - Sempre visível para todos os usuários */}
              <SidebarMenuItem>
                  <SidebarMenuSubItem className="list-none px-0">
                      <SidebarMenuSubButton className="text-xs" asChild isActive={pathname === '/charge-overdue'}>
                          <Link href="/charge-overdue" className="flex items-center gap-2 text-orange-600 dark:text-orange-500">
                              <AlertTriangle className="h-4 w-4" />
                              <span className="font-bold">COBRAR VENCIDOS</span>
                          </Link>
                      </SidebarMenuSubButton>
                  </SidebarMenuSubItem>
              </SidebarMenuItem>
            </SidebarMenu>
            <DialogContent className="w-[95vw] max-w-[420px] max-h-[90vh] overflow-y-auto p-0 gap-0 rounded-2xl shadow-2xl border flex flex-col">
                <DialogHeader className="p-4 sm:p-5 border-b flex flex-row items-center justify-between space-y-0 sticky top-0 bg-background/95 backdrop-blur-sm z-10">
                    <div>
                      <DialogTitle className="text-lg font-bold flex items-center gap-2">
                        <Zap className="h-5 w-5 text-primary" />
                        Hub Principal
                      </DialogTitle>
                      <p className="text-xs text-muted-foreground mt-0.5">Conexão Zap do Sistema</p>
                    </div>
                    {settings?.webhookToken && (
                        <Button 
                            variant="ghost" 
                            size="icon" 
                            className="h-8 w-8 text-muted-foreground hover:text-foreground" 
                            onClick={fetchStatus}
                            title="Atualizar status"
                        >
                            <RefreshCcw className="h-4 w-4" />
                        </Button>
                    )}
                </DialogHeader>

                {/* Bloco de edição/exibição do Token do Hub Principal com opção de Ocultar/Mostrar */}
                <div className="p-4 sm:p-5 pb-1">
                  <div className="flex items-center justify-between p-2.5 rounded-xl border bg-muted/30 hover:bg-muted/50 transition-colors">
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <Key className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                      <div className="flex flex-col min-w-0">
                        <span className="text-xs font-semibold text-foreground leading-tight">Token UAZAPI</span>
                        <span className="text-[11px] text-muted-foreground font-mono truncate max-w-[190px] sm:max-w-[240px]">
                          {hubTokenInput ? (showTokenText ? hubTokenInput : `${hubTokenInput.slice(0, 8)}••••••••${hubTokenInput.slice(-4)}`) : 'Não configurado'}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {settings?.webhookToken && (
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 border-emerald-500/40 text-emerald-600 dark:text-emerald-400 bg-emerald-500/5 font-semibold">
                          Salvo
                        </Badge>
                      )}
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground gap-1"
                        onClick={() => setIsTokenSectionOpen(!isTokenSectionOpen)}
                        title={isTokenSectionOpen ? "Ocultar configurações do token" : "Mostrar/Editar token"}
                      >
                        {isTokenSectionOpen ? (
                          <>
                            <EyeOff className="h-3.5 w-3.5" />
                            <span className="text-[11px]">Ocultar</span>
                          </>
                        ) : (
                          <>
                            <Eye className="h-3.5 w-3.5" />
                            <span className="text-[11px]">Editar</span>
                          </>
                        )}
                      </Button>
                    </div>
                  </div>

                  {isTokenSectionOpen && (
                    <div className="flex flex-col gap-2 p-3 mt-2 rounded-xl border bg-muted/40 border-border animate-in fade-in-0 duration-150">
                      <div className="flex items-center justify-between">
                        <Label className="text-xs font-semibold flex items-center gap-1.5 text-foreground">
                          <Key className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                          Inserir / Alterar Token
                        </Label>
                        <button
                          type="button"
                          onClick={() => setShowTokenText(!showTokenText)}
                          className="text-[11px] text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors"
                          title={showTokenText ? 'Ocultar caracteres' : 'Mostrar caracteres'}
                        >
                          {showTokenText ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                          <span>{showTokenText ? 'Ocultar' : 'Revelar'}</span>
                        </button>
                      </div>
                      <div className="flex gap-1.5 mt-0.5">
                        <Input
                          type={showTokenText ? 'text' : 'password'}
                          placeholder="Cole aqui seu token..."
                          value={hubTokenInput}
                          onChange={(e) => setHubTokenInput(e.target.value)}
                          className="font-mono text-xs h-8 bg-background flex-1 min-w-0"
                        />
                        <Button
                          type="button"
                          variant="default"
                          size="sm"
                          className="h-8 px-2.5 shrink-0 gap-1 text-xs"
                          onClick={handleSaveHubToken}
                          disabled={isSavingHubToken}
                        >
                          {isSavingHubToken ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                          <span className="hidden sm:inline">Salvar</span>
                        </Button>
                        {hubTokenInput && (
                          <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            className="h-8 w-8 shrink-0 text-muted-foreground hover:text-foreground"
                            onClick={() => {
                              navigator.clipboard.writeText(hubTokenInput);
                              toast({ title: 'Token copiado!', description: 'O token foi copiado para a área de transferência.' });
                            }}
                            title="Copiar token"
                          >
                            <Copy className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </div>
                      <p className="text-[10px] text-muted-foreground leading-tight mt-0.5">
                        Insira o token da UAZAPI e clique em Salvar para conectar seu WhatsApp.
                      </p>
                    </div>
                  )}
                </div>

                <div className="px-4 sm:px-5">
                  {renderContent()}
                </div>

                <DialogFooter className="p-4 sm:p-5 border-t bg-muted/30 sticky bottom-0 z-10">
                  {liveStatus?.status !== 'connected' && connectionStatus !== 'qr_code' && (
                    <Button className="w-full h-10 text-sm font-semibold shadow-sm" size="lg" onClick={handleConnect} disabled={connectionStatus === 'connecting'}>
                      {connectionStatus === 'connecting' ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Gerando QR Code...
                        </>
                      ) : (
                        <>
                          <Zap className="mr-2 h-4 w-4" />
                          Conectar WhatsApp
                        </>
                      )}
                    </Button>
                  )}
                </DialogFooter>
            </DialogContent>
          </Dialog>
        </SidebarContent>
        <SidebarFooter className="p-4">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <div className="flex items-center gap-3 w-full cursor-pointer">
                    <Image src={userAvatar} alt="Avatar" width={40} height={40} className="rounded-full" />
                    <div className="flex-1 overflow-hidden group-data-[collapsible=icon]:hidden">
                        <p className="font-semibold text-sm truncate">{userProfile?.firstName} {userProfile?.lastName}</p>
                        <p className="text-xs truncate text-muted-foreground">{userProfile?.email}</p>
                    </div>
                </div>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-56 mb-2" align="end">
                <DropdownMenuLabel>Minha Conta</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild><Link href="/profile"><UserCircle className="mr-2 h-4 w-4" />Perfil</Link></DropdownMenuItem>
                <DropdownMenuItem onClick={handleSignOut}><LogOut className="mr-2 h-4 w-4" />Sair</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </SidebarFooter>
      </Sidebar>
      <SidebarInset>
        <SystemNotification />
        {children}
      </SidebarInset>
      <SubscriptionTimer />
      <Upsell2MessageHandler />
      <RenewalDispatchWidget />
    </SidebarProvider>
  );
}
