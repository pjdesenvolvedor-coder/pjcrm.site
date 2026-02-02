'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  MessageSquare,
  LayoutDashboard,
  MessageCircle,
  Bot,
  Users,
  UserCircle,
  Settings as SettingsIcon, // Renamed to avoid conflict
  LogOut,
  Zap,
  WifiOff,
  Loader2,
  QrCode,
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
} from '@/components/ui/sidebar';
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
import { useUser, useAuth, useDoc, useFirebase, useMemoFirebase } from '@/firebase';
import { doc } from 'firebase/firestore';
import type { UserProfile, Settings } from '@/lib/types';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';

const navItems = [
  { href: '/dashboard', icon: LayoutDashboard, label: 'Painel' },
  { href: '#connect-zap', icon: Zap, label: 'Conectar Zap' },
  { href: '/inbox', icon: MessageCircle, label: 'Caixa de Entrada' },
  { href: '/automations', icon: Bot, label: 'Automações' },
  { href: '/customers', icon: Users, label: 'Clientes' },
  { href: '/users', icon: UserCircle, label: 'Usuários' },
  { href: '/settings', icon: SettingsIcon, label: 'Configurações' },
];

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


  useEffect(() => {
    if (!isUserLoading && !user) {
      router.push('/login');
    }
  }, [user, isUserLoading, router]);
  
  useEffect(() => {
    if (!isZapConnectOpen) {
      setTimeout(() => {
        setConnectionStatus('disconnected');
        setQrCode(null);
      }, 300);
    }
  }, [isZapConnectOpen]);


  if (isUserLoading || !user) {
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
  
  const userAvatar = userProfile?.avatarUrl || "https://picsum.photos/seed/1/40/40";

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
        const response = await fetch('https://n8nbeta.typeflow.app.br/webhook-test/aeb30639-baf0-4862-9f5f-a3cc468ab7c5', {
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

        if (data.qr) {
            setQrCode(`data:image/png;base64,${data.qr}`);
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


  return (
    <SidebarProvider open={isSidebarOpen} onOpenChange={setSidebarOpen}>
      <Sidebar
        variant="sidebar"
        collapsible="icon"
        className="border-r border-sidebar-border"
      >
        <SidebarHeader className="p-4">
          <Link href="/dashboard" className="flex items-center gap-2">
            <MessageSquare className="w-8 h-8 text-sidebar-primary" />
            <span className="text-xl font-semibold text-sidebar-foreground group-data-[collapsible=icon]:hidden">
              ZapConnect
            </span>
          </Link>
        </SidebarHeader>
        <SidebarContent>
          <Dialog open={isZapConnectOpen} onOpenChange={setZapConnectOpen}>
            <SidebarMenu>
              {navItems.map((item) => {
                if (item.href === '#connect-zap') {
                  return (
                    <DialogTrigger asChild key={item.href}>
                      <SidebarMenuItem>
                        <SidebarMenuButton tooltip={{ children: item.label }}>
                          <item.icon />
                          <span>{item.label}</span>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    </DialogTrigger>
                  );
                }
                return (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton
                      asChild
                      isActive={pathname.startsWith(item.href)}
                      tooltip={{ children: item.label }}
                    >
                      <Link href={item.href}>
                        <item.icon />
                        <span>{item.label}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
            <DialogContent className="sm:max-w-sm p-0">
                <DialogHeader className="flex flex-row items-center justify-between p-6 border-b">
                    <div className="flex items-center gap-2">
                        <Zap className="h-6 w-6 text-primary" />
                        <DialogTitle className="text-xl font-bold">ZapConnect</DialogTitle>
                    </div>
                </DialogHeader>
                
                {connectionStatus === 'disconnected' && (
                  <div className="flex flex-col items-center justify-center text-center p-8 gap-4">
                      <Badge variant="secondary" className="py-1 px-3">
                          <WifiOff className="h-4 w-4 mr-2" />
                          Desconectado
                      </Badge>
                      <p className="text-sm text-muted-foreground">Clique em 'Conectar' para parear com o WhatsApp.</p>
                      <div className="w-40 h-40 bg-muted/50 rounded-lg flex items-center justify-center my-4">
                          <WifiOff className="h-20 w-20 text-muted-foreground/30" />
                      </div>
                  </div>
                )}

                {connectionStatus === 'connecting' && (
                  <div className="flex flex-col items-center justify-center text-center p-8 gap-4 min-h-[340px]">
                      <Loader2 className="h-16 w-16 text-primary animate-spin" />
                      <p className="text-sm text-muted-foreground mt-4">Aguardando QR code...</p>
                  </div>
                )}

                {connectionStatus === 'qr_code' && qrCode && (
                  <div className="flex flex-col items-center justify-center text-center p-8 gap-4">
                       <Badge variant="default" className="py-1 px-3 bg-green-500/20 text-green-700 hover:bg-green-500/30">
                          <QrCode className="h-4 w-4 mr-2" />
                          Pronto para escanear
                      </Badge>
                      <p className="text-sm text-muted-foreground">Abra o WhatsApp e escaneie o código abaixo.</p>
                      <div className="w-40 h-40 bg-white rounded-lg flex items-center justify-center my-4 p-2">
                          <Image src={qrCode} alt="QR Code do WhatsApp" width={150} height={150} data-ai-hint="qr code"/>
                      </div>
                  </div>
                )}

                {connectionStatus === 'error' && (
                    <div className="flex flex-col items-center justify-center text-center p-8 gap-4 min-h-[340px]">
                        <Badge variant="destructive" className="py-1 px-3">
                            <WifiOff className="h-4 w-4 mr-2" />
                            Falha na conexão
                        </Badge>
                        <p className="text-sm text-muted-foreground">Não foi possível conectar. Tente novamente.</p>
                    </div>
                )}

                <DialogFooter className="p-6 border-t">
                    <Button 
                        type="button" 
                        className="w-full" 
                        size="lg"
                        onClick={handleConnect}
                        disabled={connectionStatus === 'connecting' || isLoadingSettings}
                    >
                        {connectionStatus === 'connecting' ? (
                            <>
                                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                Conectando...
                            </>
                        ) : (
                            <>
                                <Zap className="h-4 w-4 mr-2" />
                                {connectionStatus === 'error' ? 'Tentar Novamente' : 'Conectar'}
                            </>
                        )}
                    </Button>
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
    </SidebarProvider>
  );
}
