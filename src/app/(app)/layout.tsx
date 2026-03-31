
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
} from 'lucide-react';
import Image from 'next/image';

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
import { useUser, useAuth, useDoc, useFirebase, useMemoFirebase, useCollection } from '@/firebase';
import { doc, collection, query, where } from 'firebase/firestore';
import type { UserProfile, Settings, Client, Lead } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { ScheduledMessageHandler } from '@/components/scheduled-message-handler';
import { DueDateMessageHandler } from '@/components/due-date-message-handler';
import { UpsellMessageHandler } from '@/components/upsell-message-handler';
import { RemarketingMessageHandler } from '@/components/remarketing-message-handler';
import { SubscriptionTimer } from '@/components/SubscriptionTimer';
import { SystemAlert } from '@/components/SystemAlert';
import { SystemNotification } from '@/components/SystemNotification';

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
  
  const [liveStatus, setLiveStatus] = useState<LiveStatus | null>(null);
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const [isDisconnecting, setIsDisconnecting] = useState(false);

  const [showExpiredOverlay, setShowExpiredOverlay] = useState(false);

  const settingsDocRef = useMemoFirebase(() => {
    if (!effectiveUserId) return null;
    return doc(firestore, 'users', effectiveUserId, 'settings', 'config');
  }, [firestore, effectiveUserId]);

  const { data: settings, isLoading: isLoadingSettings } = useDoc<Settings>(settingsDocRef);

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
  }, [isLoadingSettings, settings, connectionStatus, setConnectionStatus, setQrCode]);

  useEffect(() => {
    if (settings?.webhookToken) {
      fetchStatus();
      const intervalId = setInterval(fetchStatus, 10000);
      return () => clearInterval(intervalId);
    }
  }, [settings?.webhookToken, fetchStatus]);

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

  const handleConnect = async () => {
    if (!settings?.webhookToken) {
        toast({
            variant: 'destructive',
            title: 'Token não encontrado',
            description: 'Seu token de autenticação não foi configurado.',
        });
        setConnectionStatus('error');
        return;
    }

    setConnectionStatus('connecting');
    setQrCode(null);

    try {
        const response = await fetch('https://n8nbeta.typeflow.app.br/webhook/aeb30639-baf0-4862-9f5f-a3cc468ab7c5', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token: settings.webhookToken }),
        });

        if (!response.ok) throw new Error('Falha na resposta do webhook.');

        const data = await response.json();
        const qrCodeValue = data.qrcode;

        if (qrCodeValue) {
            setQrCode(qrCodeValue.startsWith('data:image') ? qrCodeValue : `data:image/png;base64,${qrCodeValue}`);
            setConnectionStatus('qr_code');
            toast({ title: 'QR Code Pronto!', description: 'Escaneie para conectar.' });
        } else {
            throw new Error('QR code inválido.');
        }
    } catch (error: any) {
        console.error(error);
        setConnectionStatus('error');
        toast({ variant: 'destructive', title: 'Falha na Conexão', description: error.message });
    }
  };
  
  const handleDisconnect = async () => {
    if (!settings?.webhookToken) return;
    setIsDisconnecting(true);
    try {
        await fetch('https://n8nbeta.typeflow.app.br/webhook/2ac86d63-f7fc-4221-bbaf-efeecec33127', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token: settings.webhookToken }),
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
        <div className="flex flex-col items-center justify-center text-center p-8 gap-4 min-h-[340px]">
          <Loader2 className="h-16 w-16 text-primary animate-spin" />
          <p className="text-sm text-muted-foreground mt-4">Gerando QR code...</p>
        </div>
      );
    }
    if (connectionStatus === 'qr_code' && qrCode) {
      return (
        <div className="flex flex-col items-center justify-center text-center p-8 gap-4">
          <Badge variant="default" className="py-1 px-3 bg-blue-100 text-blue-800">
            <QrCode className="h-4 w-4 mr-2" /> Pronto para escanear
          </Badge>
          <div className="w-56 h-56 bg-white rounded-lg flex items-center justify-center my-4 p-2 shadow-lg">
            <Image src={qrCode} alt="QR Code" width={220} height={220} data-ai-hint="qr code"/>
          </div>
          <p className="text-lg font-semibold text-muted-foreground animate-pulse">Aguardando conexão...</p>
        </div>
      );
    }
    if (liveStatus?.status === 'connected') {
      return (
        <div className="flex flex-col items-center justify-center text-center p-8 gap-4 min-h-[340px]">
          <Badge variant="default" className="py-1 px-3 bg-green-100 text-green-800">Conectado</Badge>
          {liveStatus.profilePicUrl && <Image src={liveStatus.profilePicUrl} alt="Foto" width={96} height={96} className="rounded-full my-4 shadow-lg" />}
          <p className="font-semibold text-lg">{liveStatus.profileName}</p>
           <Button variant="destructive" onClick={handleDisconnect} disabled={isDisconnecting}>
              {isDisconnecting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : "Desconectar"}
            </Button>
        </div>
      );
    }
    return (
        <div className="flex flex-col items-center justify-center text-center p-8 gap-4 min-h-[340px]">
          <Badge variant="destructive" className="py-1 px-3">Desconectado</Badge>
          <p className="text-sm text-muted-foreground">Clique em 'Conectar' para parear.</p>
          <div className="w-40 h-40 bg-muted/20 rounded-lg flex items-center justify-center my-4"><Zap className="h-20 w-20 text-muted-foreground/20" /></div>
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
                                <SidebarMenuSubItem><SidebarMenuSubButton className="text-xs" asChild isActive={pathname === '/automations/due-date'}><Link href="/automations/due-date">Avisos Re-Cobrança</Link></SidebarMenuSubButton></SidebarMenuSubItem>
                                <SidebarMenuSubItem><SidebarMenuSubButton className="text-xs" asChild isActive={pathname === '/automations/remarketing'}><Link href="/automations/remarketing">Remarketing</Link></SidebarMenuSubButton></SidebarMenuSubItem>
                                <SidebarMenuSubItem><SidebarMenuSubButton className="text-xs" asChild isActive={pathname === '/automations/upsell'}><Link href="/automations/upsell">Funil Upsell</Link></SidebarMenuSubButton></SidebarMenuSubItem>
                                <SidebarMenuSubItem><SidebarMenuSubButton className="text-xs" asChild isActive={pathname === '/automations/delivery-credentials'}><Link href="/automations/delivery-credentials">Envio Acesso (Dados)</Link></SidebarMenuSubButton></SidebarMenuSubItem>
                                <SidebarMenuSubItem><SidebarMenuSubButton className="text-xs" asChild isActive={pathname === '/automations/delivery-link'}><Link href="/automations/delivery-link">Envio Acesso (Link)</Link></SidebarMenuSubButton></SidebarMenuSubItem>
                                <SidebarMenuSubItem><SidebarMenuSubButton className="text-xs" asChild isActive={pathname === '/automations/support'}><Link href="/automations/support">Msg Suporte</Link></SidebarMenuSubButton></SidebarMenuSubItem>
                                <SidebarMenuSubItem><SidebarMenuSubButton className="text-xs" asChild isActive={pathname === '/automations/leads'}><Link href="/automations/leads">Msg Leads</Link></SidebarMenuSubButton></SidebarMenuSubItem>
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
                                <SidebarMenuSubItem><SidebarMenuSubButton className="text-xs" asChild isActive={pathname === '/shot/list'}><Link href="/shot/list">Lista de Disparo</Link></SidebarMenuSubButton></SidebarMenuSubItem>
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

              {/* GROUP 4: CONEXÕES WPP */}
              <div className="px-3 py-1 mt-4 text-[10px] font-bold tracking-wider text-muted-foreground uppercase opacity-70">Conexões</div>
              {permissions.zapconnect && (
                <DialogTrigger asChild>
                  <SidebarMenuItem>
                    <SidebarMenuButton tooltip="Conexão Automática">
                      <MessageSquareShare className="h-4 w-4 text-emerald-600 dark:text-emerald-500" /><span className="flex-1 text-[13px] font-bold text-emerald-700 dark:text-emerald-400">Hub Principal</span>
                      <div className="group-data-[collapsible=icon]:hidden">
                        {liveStatus?.status === 'connected' ? <div className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" /> : <div className="h-2 w-2 rounded-full bg-destructive" />}
                      </div>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                </DialogTrigger>
              )}

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

              {permissions.settings && (
                <SidebarMenuItem>
                  <Collapsible>
                      <CollapsibleTrigger asChild>
                          <SidebarMenuButton className="w-full justify-between" tooltip="Configurações">
                              <div className="flex items-center gap-2"><SettingsIcon className="h-4 w-4" /><span className="text-[13px] font-medium">Ajustes</span></div>
                              <ChevronRight className="h-4 w-4 shrink-0 transition-transform duration-200 data-[state=open]:rotate-90" />
                          </SidebarMenuButton>
                      </CollapsibleTrigger>
                      <CollapsibleContent>
                          <SidebarMenuSub>
                              {userProfile?.role === 'Admin' && (
                                <>
                                  <SidebarMenuSubItem><SidebarMenuSubButton className="text-xs" asChild isActive={pathname === '/users'}><Link href="/users">Utilizadores</Link></SidebarMenuSubButton></SidebarMenuSubItem>
                                  <SidebarMenuSubItem><SidebarMenuSubButton className="text-xs" asChild isActive={pathname === '/settings/usage'}><Link href="/settings/usage">Painel de Custos</Link></SidebarMenuSubButton></SidebarMenuSubItem>
                                  <SidebarMenuSubItem><SidebarMenuSubButton className="text-xs" asChild isActive={pathname === '/settings/alerts'}><Link href="/settings/alerts">Mural Alertas</Link></SidebarMenuSubButton></SidebarMenuSubItem>
                                  <SidebarMenuSubItem><SidebarMenuSubButton className="text-xs" asChild isActive={pathname === '/settings/maintenance'}><Link href="/settings/maintenance">Controle Suspensão</Link></SidebarMenuSubButton></SidebarMenuSubItem>
                                  <SidebarMenuSubItem><SidebarMenuSubButton className="text-xs" asChild isActive={pathname === '/settings/tokens'}><Link href="/settings/tokens">Tickets Sistema</Link></SidebarMenuSubButton></SidebarMenuSubItem>
                                  <SidebarMenuSubItem><SidebarMenuSubButton className="text-xs" asChild isActive={pathname === '/settings/my-token'}><Link href="/settings/my-token">Meu Ticket</Link></SidebarMenuSubButton></SidebarMenuSubItem>
                                </>
                              )}
                              {(userProfile?.role === 'Admin' || userProfile?.role === 'User') && (
                                  <>
                                    <SidebarMenuSubItem><SidebarMenuSubButton className="text-xs" asChild isActive={pathname === '/settings/attendants'}><Link href="/settings/attendants">Funcionários</Link></SidebarMenuSubButton></SidebarMenuSubItem>
                                    <SidebarMenuSubItem><SidebarMenuSubButton className="text-xs" asChild isActive={pathname === '/settings/presets'}><Link href="/settings/presets">Timers Padrão</Link></SidebarMenuSubButton></SidebarMenuSubItem>
                                    <SidebarMenuSubItem><SidebarMenuSubButton className="text-xs" asChild isActive={pathname === '/settings/save-contacts'}><Link href="/settings/save-contacts">Salvar Contatos</Link></SidebarMenuSubButton></SidebarMenuSubItem>
                                  </>
                              )}
                              <SidebarMenuSubItem><SidebarMenuSubButton className="text-xs" asChild isActive={pathname === '/settings/logs'}><Link href="/settings/logs">Central de Logs</Link></SidebarMenuSubButton></SidebarMenuSubItem>
                              <SidebarMenuSubItem><SidebarMenuSubButton className="text-xs" asChild isActive={pathname === '/settings/bms'}><Link href="/settings/bms">Cofre de AdAccounts</Link></SidebarMenuSubButton></SidebarMenuSubItem>
                              <SidebarMenuSubItem><SidebarMenuSubButton className="text-xs" asChild isActive={pathname === '/settings/subscriptions'}><Link href="/settings/subscriptions">Gestão Planos Gerais</Link></SidebarMenuSubButton></SidebarMenuSubItem>
                          </SidebarMenuSub>
                      </CollapsibleContent>
                  </Collapsible>
                </SidebarMenuItem>
              )}
            </SidebarMenu>
            <DialogContent className="sm:max-w-sm">
                <DialogHeader className="p-6 border-b"><DialogTitle className="text-xl font-bold flex items-center gap-2"><Zap className="text-primary" />ZapConexão</DialogTitle></DialogHeader>
                {renderContent()}
                <DialogFooter className="p-6 border-t bg-muted/50">
                  {liveStatus?.status !== 'connected' && connectionStatus !== 'qr_code' && (
                    <Button className="w-full" size="lg" onClick={handleConnect} disabled={connectionStatus === 'connecting'}><Zap className="mr-2 h-4 w-4" />Conectar</Button>
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
      {/* 
        <ScheduledMessageHandler />
        <DueDateMessageHandler />
        <UpsellMessageHandler />
        <RemarketingMessageHandler /> 
      */}
      <SubscriptionTimer />
    </SidebarProvider>
  );
}
