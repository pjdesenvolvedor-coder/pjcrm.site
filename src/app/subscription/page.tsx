'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useFirebase, useUser, setDocumentNonBlocking } from '@/firebase';
import { doc } from 'firebase/firestore';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Check, MessageSquare } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import type { UserPermissions } from '@/lib/types';


export default function SubscriptionPage() {
  const { firestore } = useFirebase();
  const { user, isUserLoading } = useUser();
  const router = useRouter();
  const { toast } = useToast();
  const [isSubscribing, setIsSubscribing] = useState<string | null>(null);

  const handleSelectPlan = (plan: 'basic' | 'pro') => {
    if (!user || !firestore) {
      toast({
        variant: 'destructive',
        title: 'Erro',
        description: 'Usuário não autenticado.',
      });
      return;
    }

    setIsSubscribing(plan);

    const userDocRef = doc(firestore, 'users', user.uid);
    
    const allPermissionsFalse: UserPermissions = {
      dashboard: false,
      customers: false,
      inbox: false,
      automations: false,
      groups: false,
      zapconnect: false,
      settings: false,
      users: false,
    };

    let newPermissions: UserPermissions;

    if (plan === 'basic') {
      newPermissions = {
        ...allPermissionsFalse,
        dashboard: true,
        groups: true,
        settings: true,
      };
    } else { // pro
      newPermissions = {
        dashboard: true,
        customers: true,
        inbox: true,
        automations: true,
        groups: true,
        zapconnect: true,
        settings: true,
        users: false, // Keep users for admins only
      };
    }

    setDocumentNonBlocking(userDocRef, {
      subscriptionPlan: plan,
      permissions: newPermissions,
    }, { merge: true });

    toast({
      title: 'Plano Selecionado!',
      description: `Você agora está no plano ${plan === 'basic' ? 'Básico' : 'Pro'}.`,
    });

    // Give a moment for the user doc to update before redirecting
    setTimeout(() => {
      router.push('/dashboard');
    }, 1000);
  };

  if (isUserLoading || !user) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-white">
        <div className="flex flex-col items-center gap-4">
          <MessageSquare className="h-12 w-12 animate-pulse text-primary" />
          <p className="text-muted-foreground">Carregando...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-white p-8">
      <div className="text-center mb-12">
        <h1 className="text-4xl font-bold tracking-tight">Escolha seu Plano</h1>
        <p className="text-lg text-muted-foreground mt-2">Selecione o plano que melhor se adapta às suas necessidades.</p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 w-full max-w-4xl">
        <Card className="flex flex-col">
          <CardHeader className="text-center">
            <CardTitle className="text-2xl">Básico</CardTitle>
            <CardDescription>Acesso essencial para gerenciamento de grupos.</CardDescription>
          </CardHeader>
          <CardContent className="flex-grow space-y-4">
            <div className="text-4xl font-bold text-center">Grátis</div>
            <ul className="space-y-3 text-muted-foreground">
              <li className="flex items-center gap-2">
                <Check className="h-5 w-5 text-green-500" />
                <span>Menu de Grupos</span>
              </li>
              <li className="flex items-center gap-2">
                <Check className="h-5 w-5 text-green-500" />
                <span>Menu de Configurações</span>
              </li>
            </ul>
          </CardContent>
          <CardFooter>
            <Button 
              className="w-full" 
              onClick={() => handleSelectPlan('basic')}
              disabled={!!isSubscribing}
            >
              {isSubscribing === 'basic' ? 'Selecionando...' : 'Selecionar Plano'}
            </Button>
          </CardFooter>
        </Card>
        <Card className="border-primary border-2 flex flex-col relative">
          <div className="absolute -top-4 left-1/2 -translate-x-1/2 bg-primary text-primary-foreground px-3 py-1 rounded-full text-sm font-semibold">
            Mais Popular
          </div>
          <CardHeader className="text-center">
            <CardTitle className="text-2xl">Pro</CardTitle>
            <CardDescription>Acesso total a todas as funcionalidades do CRM.</CardDescription>
          </CardHeader>
          <CardContent className="flex-grow space-y-4">
            <div className="text-4xl font-bold text-center">R$ 99/mês</div>
            <ul className="space-y-3 text-muted-foreground">
              <li className="flex items-center gap-2">
                <Check className="h-5 w-5 text-green-500" />
                <span>Todos os menus do site</span>
              </li>
               <li className="flex items-center gap-2">
                <Check className="h-5 w-5 text-green-500" />
                <span>Acesso completo ao CRM</span>
              </li>
              <li className="flex items-center gap-2">
                <Check className="h-5 w-5 text-green-500" />
                <span>Automações avançadas</span>
              </li>
            </ul>
          </CardContent>
          <CardFooter>
             <Button 
              className="w-full" 
              onClick={() => handleSelectPlan('pro')}
              disabled={!!isSubscribing}
            >
              {isSubscribing === 'pro' ? 'Selecionando...' : 'Selecionar Plano'}
            </Button>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}
