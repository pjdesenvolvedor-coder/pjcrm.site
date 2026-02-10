'use client';

import { useState, useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useFirebase, useUser, setDocumentNonBlocking, useDoc, useMemoFirebase } from '@/firebase';
import { doc, Timestamp, collection, query, where, limit, getDocs, runTransaction, getDoc } from 'firebase/firestore';
import { addDays } from 'date-fns';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Check, MessageSquare, Copy, Loader2, PartyPopper, Users, Send } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import type { UserProfile, UserPermissions, Token } from '@/lib/types';
import Image from 'next/image';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';


// A new component for the payment modal to keep the main component clean
function PaymentDialog({
    isOpen,
    onClose,
    plan,
    paymentInfo,
    paymentStatus,
    onCopy,
}: {
    isOpen: boolean;
    onClose: () => void;
    plan: 'basic' | 'pro' | null;
    paymentInfo: { id: string; qr_code: string; qr_code_base64: string } | null;
    paymentStatus: 'pending' | 'paid' | 'error' | null;
    onCopy: (text: string) => void;
}) {
    const planDetails = {
        basic: { name: "Básico", price: "R$ 1,00" },
        pro: { name: "Pro", price: "R$ 2,00" },
    };
    
    const renderContent = () => {
        if (paymentStatus === 'paid') {
            return (
                <div className="flex flex-col items-center justify-center text-center p-8 gap-4 min-h-[340px]">
                    <PartyPopper className="h-16 w-16 text-green-500" />
                    <h3 className="text-xl font-bold">Pagamento Aprovado!</h3>
                    <p className="text-muted-foreground">
                        Seu acesso foi liberado. Você será redirecionado em breve.
                    </p>
                </div>
            );
        }

        if (paymentStatus === 'error' || !paymentInfo) {
             return (
                <div className="flex flex-col items-center justify-center text-center p-8 gap-4 min-h-[340px]">
                    <div className="h-16 w-16 bg-destructive/10 rounded-full flex items-center justify-center">
                        <MessageSquare className="h-8 w-8 text-destructive" />
                    </div>
                    <h3 className="text-xl font-bold">Ocorreu um Erro</h3>
                    <p className="text-muted-foreground">
                        Não foi possível gerar o PIX ou o pagamento expirou. Por favor, tente novamente.
                    </p>
                </div>
            );
        }

        // Pending status
        return (
            <div className="flex flex-col items-center justify-center text-center p-4 gap-4">
                <Badge variant="outline" className="py-1 px-3 border-yellow-400 bg-yellow-50 text-yellow-800">
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Aguardando Pagamento...
                </Badge>
                <p className="text-sm text-muted-foreground px-4">
                    Escaneie o QR Code com o app do seu banco ou use o código Copia e Cola.
                </p>
                <div className="w-48 h-48 bg-white rounded-lg flex items-center justify-center my-2 p-2 shadow-lg">
                    <Image src={paymentInfo.qr_code_base64} alt="PIX QR Code" width={180} height={180} data-ai-hint="qr code"/>
                </div>
                <div className="w-full px-4">
                    <label htmlFor="pix-code" className="text-sm font-medium text-left w-full block mb-1">PIX Copia e Cola</label>
                    <div className="relative">
                        <Input id="pix-code" readOnly value={paymentInfo.qr_code} className="pr-10 bg-muted" />
                        <Button
                            variant="ghost"
                            size="icon"
                            className="absolute right-1 top-1/2 -translate-y-1/2 h-8 w-8"
                            onClick={() => onCopy(paymentInfo.qr_code)}
                        >
                            <Copy className="h-4 w-4" />
                        </Button>
                    </div>
                </div>
                 <p className="text-xs text-muted-foreground mt-2 px-4">
                    Após o pagamento, seu acesso será liberado automaticamente nesta tela.
                </p>
            </div>
        );
    }
    
    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <DialogContent 
                className="sm:max-w-md p-0"
                onOpenAutoFocus={(e) => e.preventDefault()}
            >
                <DialogHeader className="p-6 pb-4">
                    <DialogTitle>Pagamento PIX - Plano {planDetails[plan!]?.name}</DialogTitle>
                    <DialogDescription>
                       Valor total: {planDetails[plan!]?.price}
                    </DialogDescription>
                </DialogHeader>
                {renderContent()}
            </DialogContent>
        </Dialog>
    );
}

export default function SubscriptionPage() {
  const { firestore } = useFirebase();
  const { user, isUserLoading } = useUser();
  const router = useRouter();
  const { toast } = useToast();

  const userDocRef = useMemoFirebase(() => (user ? doc(firestore, 'users', user.uid) : null), [firestore, user]);
  const { data: userProfile } = useDoc<UserProfile>(userDocRef);

  const [selectedPlan, setSelectedPlan] = useState<'basic' | 'pro' | null>(null);
  const [isGeneratingPix, setIsGeneratingPix] = useState(false);
  const [paymentInfo, setPaymentInfo] = useState<{ id: string; qr_code: string; qr_code_base64: string } | null>(null);
  const [paymentStatus, setPaymentStatus] = useState<'pending' | 'paid' | 'error' | null>(null);

  useEffect(() => {
    if (userProfile && userProfile.subscriptionPlan && userProfile.subscriptionEndDate && userProfile.subscriptionEndDate.toDate() > new Date()) {
      toast({
        title: 'Você já tem uma assinatura ativa.',
        description: 'Redirecionando para o painel...',
      });
      router.push('/dashboard');
    }
  }, [userProfile, router, toast]);

  const grantPlanAccess = useCallback(async (plan: 'basic' | 'pro') => {
    if (!user || !firestore) return;
  
    try {
      const userSettingsDoc = await getDoc(doc(firestore, 'users', user.uid, 'settings', 'config'));
      const userDocRef = doc(firestore, 'users', user.uid);
      
      if (userSettingsDoc.exists() && userSettingsDoc.data().webhookToken) {
          const currentUserDoc = await getDoc(userDocRef);
          const currentEndDate = currentUserDoc.exists() && currentUserDoc.data().subscriptionEndDate 
              ? currentUserDoc.data().subscriptionEndDate.toDate() 
              : new Date();
          
          const newEndDate = addDays(currentEndDate > new Date() ? currentEndDate : new Date(), 30);
          
          await setDocumentNonBlocking(userDocRef, {
            subscriptionEndDate: Timestamp.fromDate(newEndDate),
            subscriptionPlan: plan,
          }, { merge: true });
          return;
      }

      const tokensRef = collection(firestore, 'tokens');
      const q = query(tokensRef, where('status', '==', 'available'), limit(1));
      
      const availableTokenSnap = await getDocs(q);
  
      if (availableTokenSnap.empty) {
        throw new Error('Nenhum token de conexão disponível no momento. Contate o suporte.');
      }
  
      const tokenDoc = availableTokenSnap.docs[0];
      const tokenData = tokenDoc.data() as Token;
      
      const userSettingsRef = doc(firestore, 'users', user.uid, 'settings', 'config');
  
      const allPermissionsFalse: UserPermissions = {
        dashboard: false, customers: false, inbox: false, automations: false,
        groups: false, shot: false, zapconnect: false, settings: false, users: false,
      };
  
      let newPermissions: UserPermissions;
      if (plan === 'basic') {
        newPermissions = { ...allPermissionsFalse, dashboard: true, groups: true, shot: true, zapconnect: true };
      } else { // pro
        newPermissions = { dashboard: true, customers: true, inbox: true, automations: true, groups: true, shot: true, zapconnect: true, settings: true, users: false };
      }
  
      const subscriptionEndDate = Timestamp.fromDate(addDays(new Date(), 30));
  
      await runTransaction(firestore, async (transaction) => {
        transaction.update(tokenDoc.ref, {
          status: 'in_use',
          assignedTo: user.uid,
          assignedEmail: user.email,
        });
  
        transaction.set(userDocRef, { 
          subscriptionPlan: plan, 
          permissions: newPermissions,
          subscriptionEndDate: subscriptionEndDate
        }, { merge: true });
  
        transaction.set(userSettingsRef, {
          webhookToken: tokenData.value
        }, { merge: true });
      });
  
    } catch(e: any) {
      console.error("Token assignment or subscription update failed:", e);
      toast({
        variant: 'destructive',
        title: 'Falha na Ativação',
        description: e.message || 'Não foi possível ativar sua assinatura. Por favor, contate o suporte.',
      });
      setPaymentStatus('error'); 
      throw e;
    }
  }, [firestore, user, toast]);

  const handleGeneratePix = async (plan: 'basic' | 'pro', valueInCents: number) => {
    if (isGeneratingPix) return;
    setIsGeneratingPix(true);
    setSelectedPlan(plan);
    setPaymentInfo(null);
    setPaymentStatus(null);

    try {
      const response = await fetch('/api/generate-pix', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value: valueInCents }),
      });

      if (!response.ok) {
        throw new Error('Falha ao gerar o PIX. Tente novamente.');
      }

      const data = await response.json();
      setPaymentInfo(data);
      setPaymentStatus('pending');
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Erro', description: error.message });
      setPaymentStatus('error');
    } finally {
      setIsGeneratingPix(false);
    }
  };
  
  useEffect(() => {
    if (paymentStatus !== 'pending' || !paymentInfo?.id) {
        return;
    }

    const interval = setInterval(async () => {
        try {
            const response = await fetch(`/api/check-pix-status?id=${paymentInfo.id}`);
            if (!response.ok) return; // silent fail to avoid user noise
            
            const data = await response.json();

            if (data.status === 'paid') {
                setPaymentStatus('paid');
                clearInterval(interval);
            }
            
            if (data.status === 'expired' || data.status === 'error' ) {
                 clearInterval(interval);
                 setPaymentStatus('error');
            }

        } catch (error) {
            console.error('Polling error:', error);
        }
    }, 5000); // Poll every 5 seconds

    return () => clearInterval(interval);
  }, [paymentStatus, paymentInfo?.id]);
  
  useEffect(() => {
      if (paymentStatus === 'paid' && selectedPlan) {
          grantPlanAccess(selectedPlan).then(() => {
              toast({
                  title: "Pagamento Aprovado!",
                  description: `Seu acesso ao plano ${selectedPlan === 'basic' ? 'Básico' : 'Pro'} foi liberado. Redirecionando...`,
              });
              setTimeout(() => {
                  window.location.assign('/dashboard');
              }, 2000);
          }).catch(() => {
            // Error is handled inside grantPlanAccess
          });
      }
  }, [paymentStatus, selectedPlan, grantPlanAccess, toast]);

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: 'Copiado!', description: 'Código PIX copiado para a área de transferência.' });
  };
  
  const resetPaymentState = () => {
      setPaymentInfo(null);
      setPaymentStatus(null);
      setSelectedPlan(null);
  }

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
    <>
      <PaymentDialog 
        isOpen={!!paymentInfo}
        onClose={resetPaymentState}
        plan={selectedPlan}
        paymentInfo={paymentInfo}
        paymentStatus={paymentStatus}
        onCopy={handleCopy}
      />
      <div className="flex min-h-screen flex-col items-center justify-center bg-white p-8">
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold tracking-tight">Escolha seu Plano</h1>
          <p className="text-lg text-muted-foreground mt-2">Selecione o plano que melhor se adapta às suas necessidades.</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 w-full max-w-4xl">
          <Card className="flex flex-col">
            <CardHeader className="text-center">
              <CardTitle className="text-2xl">Básico</CardTitle>
              <CardDescription>Plano ideal para quem quer fazer disparos, extrair leads de grupos e programar mesangens parar enviar em grupos!</CardDescription>
            </CardHeader>
            <CardContent className="flex-grow space-y-4">
              <div className="text-4xl font-bold text-center">R$ 1,00 <span className="text-lg font-normal text-muted-foreground">/mês</span></div>
              <ul className="space-y-3 text-muted-foreground">
                <li className="flex items-center gap-2"><Check className="h-5 w-5 text-green-500" /><Users className="h-5 w-5 mr-1" /><span>Menu de Grupos</span></li>
                <li className="flex items-center gap-2"><Check className="h-5 w-5 text-green-500" /><Send className="h-5 w-5 mr-1" /><span>Disparo em Massa</span></li>
                <li className="flex items-center gap-2"><Check className="h-5 w-5 text-green-500" /><Check className="h-5 w-5 text-green-500" /><span>ZapConexão</span></li>
              </ul>
            </CardContent>
            <CardFooter>
              <Button className="w-full" onClick={() => handleGeneratePix('basic', 100)} disabled={isGeneratingPix && selectedPlan === 'basic'}>
                {isGeneratingPix && selectedPlan === 'basic' ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : null}
                Selecionar Plano
              </Button>
            </CardFooter>
          </Card>
          <Card className="border-primary border-2 flex flex-col relative">
            <div className="absolute -top-4 left-1/2 -translate-x-1/2 bg-primary text-primary-foreground px-3 py-1 rounded-full text-sm font-semibold">
              Mais Popular
            </div>
            <CardHeader className="text-center">
              <CardTitle className="text-2xl">Pro</CardTitle>
              <CardDescription>Todas as vantagens do plano Básico, mais o sistema completo de CRM.</CardDescription>
            </CardHeader>
            <CardContent className="flex-grow space-y-4">
              <div className="text-4xl font-bold text-center">R$ 2,00 <span className="text-lg font-normal text-muted-foreground">/mês</span></div>
              <ul className="space-y-3 text-muted-foreground">
                <li className="flex items-center gap-2"><Check className="h-5 w-5 text-green-500" /><span>Todos os recursos do plano **Básico**</span></li>
                <li className="flex items-center gap-2"><Check className="h-5 w-5 text-green-500" /><span>Gestão de Clientes e Cobrança</span></li>
                <li className="flex items-center gap-2"><Check className="h-5 w-5 text-green-500" /><span>Automações e Remarketing</span></li>
                 <li className="flex items-center gap-2"><Check className="h-5 w-5 text-green-500" /><span>Caixa de Entrada (Inbox)</span></li>
              </ul>
            </CardContent>
            <CardFooter>
              <Button className="w-full" onClick={() => handleGeneratePix('pro', 200)} disabled={isGeneratingPix && selectedPlan === 'pro'}>
                 {isGeneratingPix && selectedPlan === 'pro' ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : null}
                Selecionar Plano
              </Button>
            </CardFooter>
          </Card>
        </div>
      </div>
    </>
  );
}
