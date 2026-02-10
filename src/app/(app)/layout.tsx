'use client';

import React, { useState, useEffect, useRef, useMemo } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  MessageSquare,
  LayoutDashboard,
  UserCircle,
  LogOut,
  Zap,
  Loader2,
  QrCode,
  Home,
  Users,
  Bot,
  Send,
  CreditCard,
  ChevronRight,
  Settings as SettingsIcon, // Renamed to avoid conflict
  Contact,
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
import { Button } from '@/components/ui/button';
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
import { Badge } from "@/components/ui/badge";
import { useUser, useAuth, useDoc, useFirebase, useMemoFirebase, useCollection } from '@/firebase';
import { doc, collection, query, where } from 'firebase/firestore';
import type { UserProfile, Settings, Client } from '@/lib/types';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { ScheduledMessageHandler } from '@/components/scheduled-message-handler';
import { DueDateMessageHandler } from '@/components/due-date-message-handler';
import { SubscriptionTimer } from '@/components/SubscriptionTimer';

type LiveStatus = {
  status: 'disconnected' | 'connecting' | 'connected';
  profileName?: string;
  profilePicUrl?: string;
};

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const auth = useAuth();
  const { firestore } = useFirebase();
  const { user, isUserLoading } = useUser();
  const [isSidebarOpen, setSidebarOpen] = useState(true);
  const { toast } = useToast();
  
  const [isZapConnectOpen, setZapConnectOpen] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<'disconnected' | 'connecting' | 'qr_code' | 'error'>('disconnected');
  const [qrCode, setQrCode] = useState<string | null>(null);
  
  const [liveStatus, setLiveStatus] = useState<LiveStatus | null>(null);
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const [isDisconnecting, setIsDisconnecting] = useState(false);

  const userDocRef = useMemoFirebase(() => {
    if (!user) return null;
    return doc(firestore, 'users', user.uid);
  },[firestore, user]);
  
  const { data: userProfile, isLoading: isProfileLoading } = useDoc<UserProfile>(userDocRef);
  
  const settingsDocRef = useMemoFirebase(() => {
    if (!user) return null;
    return doc(firestore, 'users', user.uid, 'settings', 'config');
  }, [firestore, user]);

  const { data: settings, isLoading: isLoadingSettings } = useDoc<Settings>(settingsDocRef);

  const supportClientsQuery = useMemoFirebase(() => {
    if (!user) return null;
    return query(collection(firestore, 'users', user.uid, 'clients'), where('needsSupport', '==', true));
  }, [firestore, user]);

  const { data: supportClients } = useCollection<Client>(supportClientsQuery);

  const supportCount = supportClients?.length ?? 0;

  const permissions = useMemo(() => {
    const defaultPermissions = {
        dashboard: false,
        customers: false,
        inbox: false,
        automations: false,
        groups: false,
        zapconnect: false,
        settings: false,
        users: false,
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
      fetchStatus(); // Initial fetch
      const intervalId = setInterval(fetchStatus, 5000); // Poll every 5 seconds
      return () => clearInterval(intervalId);
    }
  }, [settings?.webhookToken, fetchStatus]);

  useEffect(() => {
    if (!isZapConnectOpen) {
      // Reset dialog-specific state when it closes
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
    if (!isProfileLoading && userProfile && !userProfile.subscriptionPlan && userProfile.role !== 'Admin') {
        router.push('/subscription');
    }
  }, [userProfile, isProfileLoading, router]);

  useEffect(() => {
    if (
      !isProfileLoading &&
      userProfile &&
      userProfile.role !== 'Admin' &&
      userProfile.subscriptionEndDate &&
      userProfile.subscriptionEndDate.toDate() < new Date()
    ) {
      router.push('/subscription');
    }
  }, [userProfile, isProfileLoading, router]);

  if (isUserLoading || !user || isProfileLoading) {
    return (
        <div className="flex h-screen w-screen items-center justify-center">
            <div className="flex flex-col items-center gap-4">
                <MessageSquare className="h-12 w-12 animate-pulse text-primary" />
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
            description: 'Por favor, configure seu token de autenticação na página de Configurações.',
        });
        setConnectionStatus('error');
        return;
    }

    setConnectionStatus('connecting');
    setQrCode(null);

    try {
        const response = await fetch('https://n8nbeta.typeflow.app.br/webhook/aeb30639-baf0-4862-9f5f-a3cc468ab7c5', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ token: settings.webhookToken }),
        });

        if (!response.ok) {
            throw new Error('A resposta da rede não foi boa.');
        }

        const data = await response.json();
        const qrCodeValue = data.qrcode;

        if (qrCodeValue) {
            setQrCode(qrCodeValue.startsWith('data:image') ? qrCodeValue : `data:image/png;base64,${qrCodeValue}`);
            setConnectionStatus('qr_code');
            toast({
                title: 'QR Code Pronto!',
                description: 'Escaneie o código com seu WhatsApp para conectar.',
            });
        } else {
            throw new Error('A resposta do webhook não continha um QR code válido.');
        }

    } catch (error: any) {
        console.error('Falha ao conectar:', error);
        setConnectionStatus('error');
        toast({
            variant: 'destructive',
            title: 'Falha na Conexão',
            description: error.message || 'Não foi possível obter o QR code do webhook.',
        });
    }
  };
  
  const handleDisconnect = async () => {
    if (!settings?.webhookToken) {
        toast({
            variant: 'destructive',
            title: 'Token não encontrado',
            description: 'Não é possível desconectar sem um token de autenticação.',
        });
        return;
    }

    setIsDisconnecting(true);
    try {
        const response = await fetch('https://n8nbeta.typeflow.app.br/webhook/2ac86d63-f7fc-4221-bbaf-efeecec33127', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ token: settings.webhookToken }),
        });

        if (!response.ok) {
            throw new Error('A resposta da rede não foi boa ao desconectar.');
        }

        toast({
            title: 'Desconectado!',
            description: 'Sua sessão do WhatsApp foi encerrada.',
        });
        setLiveStatus({ status: 'disconnected' });
        // Reset the main dialog view
        setConnectionStatus('disconnected');
        setQrCode(null);

    } catch (error: any) {
        console.error('Falha ao desconectar:', error);
        toast({
            variant: 'destructive',
            title: 'Falha ao Desconectar',
            description: error.message || 'Não foi possível encerrar a conexão.',
        });
    } finally {
        setIsDisconnecting(false);
    }
  };

  const renderContent = () => {
    if (connectionStatus === 'connecting') {
      return (
        <div className="flex flex-col items-center justify-center text-center p-8 gap-4 min-h-[340px]">
          <Loader2 className="h-16 w-16 text-primary animate-spin" />
          <p className="text-sm text-muted-foreground mt-4">Aguardando QR code...</p>
        </div>
      );
    }
    if (connectionStatus === 'qr_code' && qrCode) {
      return (
        <div className="flex flex-col items-center justify-center text-center p-8 gap-4">
          <Badge variant="default" className="py-1 px-3 bg-blue-100 text-blue-800">
            <QrCode className="h-4 w-4 mr-2" />
            Pronto para escanear
          </Badge>
          <p className="text-sm text-muted-foreground">Abra o WhatsApp e escaneie o código abaixo.</p>
          <div className="w-40 h-40 bg-white rounded-lg flex items-center justify-center my-4 p-2 shadow-lg">
            <img src={qrCode} alt="QR Code do WhatsApp" width={150} height={150} data-ai-hint="qr code"/>
          </div>
        </div>
      );
    }
     if (connectionStatus === 'error') {
      return (
        <div className="flex flex-col items-center justify-center text-center p-8 gap-4 min-h-[340px]">
          <Badge variant="destructive" className="py-1 px-3">
            <div className="h-2 w-2 mr-2 rounded-full bg-red-500"></div>
            Falha na conexão
          </Badge>
          <p className="text-sm text-muted-foreground">Não foi possível conectar. Tente novamente.</p>
        </div>
      );
    }

    if (liveStatus?.status === 'connected') {
      return (
        <div className="flex flex-col items-center justify-center text-center p-8 gap-4 min-h-[340px]">
          <Badge variant="default" className="py-1 px-3 bg-green-100 text-green-800">
            <div className="h-2 w-2 mr-2 rounded-full bg-green-500 animate-pulse"></div>
            Conectado
          </Badge>
          {liveStatus.profilePicUrl ? (
            <Image 
                src={liveStatus.profilePicUrl} 
                alt="Foto de Perfil" 
                width={96} 
                height={96} 
                className="rounded-full my-4 border-4 border-background shadow-lg"
                data-ai-hint="person avatar"
            />
          ) : (
            <div className="w-24 h-24 my-4 rounded-full bg-muted flex items-center justify-center">
              <UserCircle className="w-16 h-16 text-muted-foreground" />
            </div>
          )}
          <p className="font-semibold text-lg">{liveStatus.profileName || 'Nome não disponível'}</p>
           <Button
              type="button"
              variant="destructive"
              className="mt-4 animate-pulse-destructive"
              onClick={handleDisconnect}
              disabled={isDisconnecting}
            >
              {isDisconnecting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Desconectando...
                </>
              ) : (
                <>
                  <div className="h-2 w-2 mr-2 rounded-full bg-red-500"></div>
                  Desconectar
                </>
              )}
            </Button>
        </div>
      );
    }

    if (!liveStatus || liveStatus.status === 'disconnected') {
       return (
        <div className="flex flex-col items-center justify-center text-center p-8 gap-4 min-h-[340px]">
          <Badge variant="destructive" className="py-1 px-3">
            <div className="h-2 w-2 mr-2 rounded-full bg-red-500"></div>
            Desconectado
          </Badge>
          <p className="text-sm text-muted-foreground">
            Clique em 'Conectar' para parear com o WhatsApp.
          </p>
          <div className="w-40 h-40 bg-gradient-to-br from-muted/30 to-muted/10 rounded-lg flex items-center justify-center my-4">
            <Zap className="h-20 w-20 text-muted-foreground/20" />
          </div>
        </div>
      );
    }
    
    // Fallback for connecting status or other intermediate states
    return (
       <div className="flex flex-col items-center justify-center text-center p-8 gap-4 min-h-[340px]">
         <Loader2 className="h-16 w-16 text-primary animate-spin" />
         <p className="text-sm text-muted-foreground mt-4">Verificando status...</p>
       </div>
     );

  };


  return (
    <SidebarProvider open={isSidebarOpen} onOpenChange={setSidebarOpen}>
      <Sidebar
        variant="sidebar"
        collapsible="icon"
        className="border-r border-sidebar-border"
      >
        <SidebarHeader className="p-4">
          <Link href="/dashboard" className="flex items-center gap-2">
            <Image
              src="https://i.imgur.com/sgoiuiz.png"
              alt="EMPREENDIMENTOS Logo"
              width={32}
              height={32}
              className="w-8 h-8"
              data-ai-hint="logo"
            />
            <span className="text-lg font-semibold text-sidebar-foreground group-data-[collapsible=icon]:hidden">
              EMPREENDIMENTOS - CRM
            </span>
          </Link>
        </SidebarHeader>
        <SidebarContent>
          <Dialog open={isZapConnectOpen} onOpenChange={setZapConnectOpen}>
            <SidebarMenu>
              {permissions.dashboard && (
                <SidebarMenuItem>
                    <SidebarMenuButton asChild isActive={pathname === '/dashboard'} tooltip={{ children: 'Início' }}>
                        <Link href="/dashboard"><Home /><span>Início</span></Link>
                    </SidebarMenuButton>
                </SidebarMenuItem>
              )}

              {permissions.customers && (
                <SidebarMenuItem>
                  <Collapsible>
                      <CollapsibleTrigger asChild>
                          <SidebarMenuButton className="w-full justify-between" tooltip={{children: 'Clientes'}}>
                              <div className="flex items-center gap-2">
                                  <Contact />
                                  <span>Clientes</span>
                              </div>
                              <ChevronRight className="h-4 w-4 shrink-0 transition-transform duration-200 data-[state=open]:rotate-90" />
                          </SidebarMenuButton>
                      </CollapsibleTrigger>
                      <CollapsibleContent>
                          <SidebarMenuSub>
                              <SidebarMenuSubItem>
                                  <SidebarMenuSubButton asChild isActive={pathname.startsWith('/customers')}>
                                      <Link href="/customers">Todos os Clientes</Link>
                                  </SidebarMenuSubButton>
                              </SidebarMenuSubItem>
                              <SidebarMenuSubItem>
                                  <SidebarMenuSubButton asChild isActive={pathname.startsWith('/support')}>
                                      <Link href="/support">
                                          <span>Suporte</span>
                                          {supportCount > 0 && (
                                              <Badge variant="secondary" className="ml-auto h-5 w-5 flex items-center justify-center p-0">
                                                  {supportCount}
                                              </Badge>
                                          )}
                                      </Link>
                                  </SidebarMenuSubButton>
                              </SidebarMenuSubItem>
                          </SidebarMenuSub>
                      </CollapsibleContent>
                  </Collapsible>
                </SidebarMenuItem>
              )}
              
              {permissions.inbox && (
                <SidebarMenuItem>
                    <SidebarMenuButton asChild isActive={pathname === '/inbox'} tooltip={{ children: 'Inbox' }}>
                        <Link href="/inbox"><MessageSquare /><span>Inbox</span></Link>
                    </SidebarMenuButton>
                </SidebarMenuItem>
              )}
              
              {permissions.automations && (
                <SidebarMenuItem>
                  <Collapsible>
                      <CollapsibleTrigger asChild>
                          <SidebarMenuButton className="w-full justify-between" tooltip={{children: 'Automações'}}>
                              <div className="flex items-center gap-2">
                                  <Bot />
                                  <span>Automações</span>
                              </div>
                              <ChevronRight className="h-4 w-4 shrink-0 transition-transform duration-200 data-[state=open]:rotate-90" />
                          </SidebarMenuButton>
                      </CollapsibleTrigger>
                      <CollapsibleContent>
                          <SidebarMenuSub>
                                <SidebarMenuSubItem>
                                    <SidebarMenuSubButton asChild isActive={pathname.startsWith('/automations/due-date')}>
                                        <Link href="/automations/due-date">Vencimento</Link>
                                    </SidebarMenuSubButton>
                                </SidebarMenuSubItem>
                                <SidebarMenuSubItem>
                                    <SidebarMenuSubButton asChild isActive={pathname.startsWith('/automations/remarketing')}>
                                        <Link href="/automations/remarketing">Remarketing</Link>
                                    </SidebarMenuSubButton>
                                </SidebarMenuSubItem>
                          </SidebarMenuSub>
                      </CollapsibleContent>
                  </Collapsible>
                </SidebarMenuItem>
              )}

              {permissions.groups && (
                <SidebarMenuItem>
                  <Collapsible>
                      <CollapsibleTrigger asChild>
                          <SidebarMenuButton className="w-full justify-between" tooltip={{children: 'Grupos'}}>
                              <div className="flex items-center gap-2">
                                  <Users />
                                  <span>Grupos</span>
                              </div>
                              <ChevronRight className="h-4 w-4 shrink-0 transition-transform duration-200 data-[state=open]:rotate-90" />
                          </SidebarMenuButton>
                      </CollapsibleTrigger>
                      <CollapsibleContent>
                          <SidebarMenuSub>
                                <SidebarMenuSubItem>
                                    <SidebarMenuSubButton asChild isActive={pathname.startsWith('/groups/get-jid')}>
                                        <Link href="/groups/get-jid">Obter JID Grupo</Link>
                                    </SidebarMenuSubButton>
                                </SidebarMenuSubItem>
                                <SidebarMenuSubItem>
                                    <SidebarMenuSubButton asChild isActive={pathname.startsWith('/groups/schedule-message')}>
                                        <Link href="/groups/schedule-message">Agendar Mensagem</Link>
                                    </SidebarMenuSubButton>
                                </SidebarMenuSubItem>
                          </SidebarMenuSub>
                      </CollapsibleContent>
                  </Collapsible>
                </SidebarMenuItem>
              )}

              {permissions.zapconnect && (
                <DialogTrigger asChild>
                  <SidebarMenuItem>
                    <SidebarMenuButton tooltip={{ children: 'ZapConexão' }}>
                      <Zap />
                      <span className="flex-1">ZapConexão</span>
                      <div className="group-data-[collapsible=icon]:hidden">
                        {liveStatus?.status === 'connected' ? (
                          <Badge variant="secondary" className="py-0.5 px-2 text-xs font-medium bg-green-100 text-green-800 border-green-200">
                            <div className="h-2 w-2 mr-1 rounded-full bg-green-500 animate-pulse"></div>
                            Conectado
                          </Badge>
                        ) : (
                          <Badge variant="destructive" className="py-0.5 px-2 text-xs font-medium">
                            <div className="h-2 w-2 mr-1 rounded-full bg-red-500"></div>
                            Desconectado
                          </Badge>
                        )}
                      </div>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                </DialogTrigger>
              )}

              {(permissions.settings || permissions.users) && (
                <SidebarMenuItem>
                  <Collapsible>
                      <CollapsibleTrigger asChild>
                          <SidebarMenuButton className="w-full justify-between" tooltip={{children: 'Configurações'}}>
                              <div className="flex items-center gap-2">
                                  <SettingsIcon />
                                  <span>Configurações</span>
                              </div>
                              <ChevronRight className="h-4 w-4 shrink-0 transition-transform duration-200 data-[state=open]:rotate-90" />
                          </SidebarMenuButton>
                      </CollapsibleTrigger>
                      <CollapsibleContent>
                          <SidebarMenuSub>
                              {permissions.settings && (
                                <SidebarMenuSubItem>
                                    <SidebarMenuSubButton asChild isActive={pathname === '/settings'}>
                                        <Link href="/settings">Token</Link>
                                    </SidebarMenuSubButton>
                                </SidebarMenuSubItem>
                              )}
                              {permissions.settings && (
                                <SidebarMenuSubItem>
                                    <SidebarMenuSubButton asChild isActive={pathname.startsWith('/settings/subscriptions')}>
                                        <Link href="/settings/subscriptions">Assinaturas</Link>
                                    </SidebarMenuSubButton>
                                </SidebarMenuSubItem>
                              )}
                               {permissions.settings && (
                                <SidebarMenuSubItem>
                                    <SidebarMenuSubButton asChild isActive={pathname.startsWith('/settings/presets')}>
                                        <Link href="/settings/presets">Predefinição</Link>
                                    </SidebarMenuSubButton>
                                </SidebarMenuSubItem>
                              )}
                              {permissions.users && (
                                <SidebarMenuSubItem>
                                    <SidebarMenuSubButton asChild isActive={pathname.startsWith('/users')}>
                                        <Link href="/users">Gerenciamento de Usuários</Link>
                                    </SidebarMenuSubButton>
                                </SidebarMenuSubItem>
                              )}
                          </SidebarMenuSub>
                      </CollapsibleContent>
                  </Collapsible>
                </SidebarMenuItem>
              )}

            </SidebarMenu>
            <DialogContent className="sm:max-w-sm">
                <DialogHeader className="p-6 border-b">
                    <div className="flex items-center gap-2">
                        <Zap className="h-6 w-6 text-primary" />
                        <DialogTitle className="text-xl font-bold">ZapConexão</DialogTitle>
                    </div>
                </DialogHeader>
                
                {renderContent()}

                <DialogFooter className="p-6 border-t bg-muted/50">
                  {(liveStatus?.status !== 'connected' && connectionStatus !== 'qr_code') && (
                    <Button
                      type="button"
                      className="w-full animate-pulse-primary"
                      size="lg"
                      onClick={handleConnect}
                      disabled={isLoadingSettings || connectionStatus === 'connecting'}
                    >
                      {connectionStatus === 'connecting' ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          Conectando...
                        </>
                      ) : connectionStatus === 'error' ? (
                        <>
                          <Zap className="h-4 w-4 mr-2" />
                          Tentar Novamente
                        </>
                      ) : (
                        <>
                          <Zap className="h-4 w-4 mr-2" />
                          Conectar
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
                    {isProfileLoading ? (
                        <Skeleton className="h-10 w-10 rounded-full" />
                    ) : (
                        <Image
                        src={userAvatar}
                        alt="Avatar do usuário"
                        width={40}
                        height={40}
                        className="rounded-full"
                        data-ai-hint="user avatar"
                        />
                    )}
                    <div className="flex-1 overflow-hidden group-data-[collapsible=icon]:hidden">
                        {isProfileLoading ? (
                            <div className='space-y-1'>
                                <Skeleton className="h-4 w-24" />
                                <Skeleton className="h-3 w-32" />
                            </div>
                        ) : (
                            <>
                                <p className="font-semibold text-sm truncate text-sidebar-foreground">{userProfile?.firstName} {userProfile?.lastName}</p>
                                <p className="text-xs truncate text-sidebar-foreground/70">{userProfile?.email}</p>
                            </>
                        )}
                    </div>
                </div>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-56 mb-2" align="end" forceMount>
                <DropdownMenuLabel className="font-normal">
                <div className="flex flex-col space-y-1">
                    <p className="text-sm font-medium leading-none">{userProfile?.firstName} {userProfile?.lastName}</p>

                    <p className="text-xs leading-none text-muted-foreground">
                    {userProfile?.email}
                    </p>
                </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleSignOut}>
                    <LogOut className="mr-2 h-4 w-4" />
                    <span>Sair</span>
                </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </SidebarFooter>
      </Sidebar>
      <SidebarInset>{children}</SidebarInset>
      <ScheduledMessageHandler />
      <DueDateMessageHandler />
      <SubscriptionTimer />
    </SidebarProvider>
  );
}
