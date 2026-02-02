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
  const [isConnecting, setIsConnecting] = useState(false);

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
        return;
    }

    setIsConnecting(true);

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

        toast({
            title: 'Conexão Iniciada',
            description: 'A solicitação de conexão foi enviada com sucesso.',
        });

    } catch (error) {
        console.error('Falha ao conectar:', error);
        toast({
            variant: 'destructive',
            title: 'Falha na Conexão',
            description: 'Não foi possível enviar a solicitação para o webhook.',
        });
    } finally {
        setIsConnecting(false);
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
          <Dialog>
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
                <DialogFooter className="p-6 border-t">
                    <Button 
                        type="button" 
                        className="w-full" 
                        size="lg"
                        onClick={handleConnect}
                        disabled={isConnecting || isLoadingSettings}
                    >
                        {isConnecting ? (
                            <>
                                <Zap className="h-4 w-4 mr-2 animate-pulse" />
                                Conectando...
                            </>
                        ) : (
                            <>
                                <Zap className="h-4 w-4 mr-2" />
                                Conectar
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
