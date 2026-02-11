'use client';

import { useState, useEffect } from 'react';
import { useFirebase, useUser, useDoc, useMemoFirebase, setDocumentNonBlocking } from '@/firebase';
import { doc, Timestamp } from 'firebase/firestore';
import { updatePassword, EmailAuthProvider, reauthenticateWithCredential } from 'firebase/auth';
import { PageHeader } from '@/components/page-header';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Button, buttonVariants } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { useToast } from '@/hooks/use-toast';
import type { UserProfile, Settings } from '@/lib/types';
import { Skeleton } from '@/components/ui/skeleton';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { differenceInSeconds, addDays } from 'date-fns';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import Image from 'next/image';
import { Copy, Loader2, PartyPopper, MessageSquare, KeyRound, ShieldCheck, CalendarClock, Repeat, Package } from 'lucide-react';
import Link from 'next/link';


// --------- Helper functions & Components from other files (SubscriptionTimer, SubscriptionPage) ----------

function formatDuration(seconds: number) {
    if (seconds < 0) return "Expirado";
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    if (days > 0) return `${days}d ${hours}h`;
    const minutes = Math.floor((seconds % 3600) / 60);
    if (hours > 0) return `${hours}h ${minutes}m`;
    const secs = Math.floor(seconds % 60);
    return `${minutes}m ${secs}s`;
}

function SubscriptionTimeLeft({ endDate }: { endDate?: Timestamp }) {
    const [remainingTime, setRemainingTime] = useState<string | null>(null);

    useEffect(() => {
        if (!endDate) {
            setRemainingTime(null);
            return;
        }
        const subscriptionEndDate = endDate.toDate();
        const updateRemainingTime = () => {
             const now = new Date();
             const totalSeconds = differenceInSeconds(subscriptionEndDate, now);
             setRemainingTime(formatDuration(totalSeconds));
        }
        updateRemainingTime();
        const intervalId = setInterval(updateRemainingTime, 1000);
        return () => clearInterval(intervalId);
    }, [endDate]);

    if (remainingTime === null) return <Skeleton className="h-6 w-24" />;
    return <span className="font-semibold text-lg">{remainingTime}</span>;
}

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
        basic: { name: "Básico", price: "R$ 69,90" },
        pro: { name: "Pro", price: "R$ 119,90" },
    };
    
    const renderContent = () => {
        if (paymentStatus === 'paid') {
            return (
                <div className="flex flex-col items-center justify-center text-center p-8 gap-4 min-h-[340px]">
                    <PartyPopper className="h-16 w-16 text-green-500" />
                    <h3 className="text-xl font-bold">Pagamento Aprovado!</h3>
                    <p className="text-muted-foreground">
                        Sua assinatura foi renovada com sucesso.
                    </p>
                </div>
            );
        }

        if (paymentStatus === 'error' || !paymentInfo) {
             return (
                <div className="flex flex-col items-center justify-center text-center p-8 gap-4 min-h-[340px]">
                    <MessageSquare className="h-16 w-16 text-destructive" />
                    <h3 className="text-xl font-bold">Ocorreu um Erro</h3>
                    <p className="text-muted-foreground">
                        Não foi possível gerar o PIX ou o pagamento expirou. Tente novamente.
                    </p>
                </div>
            );
        }

        return (
            <div className="flex flex-col items-center justify-center text-center p-4 gap-4">
                <Badge variant="outline" className="py-1 px-3 border-yellow-400 bg-yellow-50 text-yellow-800"><Loader2 className="h-4 w-4 mr-2 animate-spin" />Aguardando Pagamento...</Badge>
                <p className="text-sm text-muted-foreground px-4">Escaneie o QR Code com o app do seu banco ou use o código Copia e Cola.</p>
                <div className="w-48 h-48 bg-white rounded-lg flex items-center justify-center my-2 p-2 shadow-lg"><Image src={paymentInfo.qr_code_base64} alt="PIX QR Code" width={180} height={180} data-ai-hint="qr code"/></div>
                <div className="w-full px-4">
                    <Label htmlFor="pix-code" className="text-sm font-medium text-left w-full block mb-1">PIX Copia e Cola</Label>
                    <div className="relative"><Input id="pix-code" readOnly value={paymentInfo.qr_code} className="pr-10 bg-muted" /><Button variant="ghost" size="icon" className="absolute right-1 top-1/2 -translate-y-1/2 h-8 w-8" onClick={() => onCopy(paymentInfo.qr_code)}><Copy className="h-4 w-4" /></Button></div>
                </div>
            </div>
        );
    }
    
    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="sm:max-w-md p-0" onOpenAutoFocus={(e) => e.preventDefault()}>
                <DialogHeader className="p-6 pb-4"><DialogTitle>Renovação - Plano {planDetails[plan!]?.name}</DialogTitle><DialogDescription>Valor: {planDetails[plan!]?.price}</DialogDescription></DialogHeader>
                {renderContent()}
            </DialogContent>
        </Dialog>
    );
}

// --------- Password Change Form -----------

const passwordSchema = z.object({
    currentPassword: z.string().min(1, 'Senha atual é obrigatória.'),
    newPassword: z.string().min(6, 'A nova senha deve ter pelo menos 6 caracteres.'),
}).refine(data => data.newPassword !== data.currentPassword, {
    message: "A nova senha deve ser diferente da atual.",
    path: ["newPassword"],
});


function PasswordChangeForm() {
    const { user, auth } = useFirebase();
    const { toast } = useToast();

    const form = useForm<z.infer<typeof passwordSchema>>({
        resolver: zodResolver(passwordSchema),
        defaultValues: { currentPassword: '', newPassword: '' }
    });

    const onSubmit = async (data: z.infer<typeof passwordSchema>) => {
        if (!user || !user.email) return;

        const credential = EmailAuthProvider.credential(user.email, data.currentPassword);

        try {
            await reauthenticateWithCredential(user, credential);
            await updatePassword(user, data.newPassword);
            toast({ title: "Senha alterada!", description: "Sua senha foi atualizada com sucesso." });
            form.reset();
        } catch (error: any) {
            console.error("Password change error", error);
            let description = "Ocorreu um erro desconhecido.";
            if (error.code === 'auth/wrong-password' || error.code === 'auth/invalid-credential') {
                description = "A senha atual está incorreta.";
            }
            toast({ variant: "destructive", title: "Falha ao alterar senha", description });
        }
    };

    return (
        <Card>
            <CardHeader><CardTitle className="flex items-center gap-2"><KeyRound/> Alterar Senha</CardTitle></CardHeader>
            <CardContent>
                <Form {...form}>
                    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                        <FormField control={form.control} name="currentPassword" render={({ field }) => (
                            <FormItem><FormLabel>Senha Atual</FormLabel><FormControl><Input type="password" {...field} /></FormControl><FormMessage /></FormItem>
                        )}/>
                        <FormField control={form.control} name="newPassword" render={({ field }) => (
                            <FormItem><FormLabel>Nova Senha</FormLabel><FormControl><Input type="password" {...field} /></FormControl><FormMessage /></FormItem>
                        )}/>
                        <Button type="submit" disabled={form.formState.isSubmitting}>
                            {form.formState.isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin"/>}
                            Salvar Nova Senha
                        </Button>
                    </form>
                </Form>
            </CardContent>
        </Card>
    )
}

// --------- Admin Token Manager -----------
function AdminTokenManager() {
    const { firestore, user } = useFirebase();
    const { toast } = useToast();
    const [tokenInput, setTokenInput] = useState('');
    const [isSaving, setIsSaving] = useState(false);

    const settingsDocRef = useMemoFirebase(() => {
        if (!user) return null;
        return doc(firestore, 'users', user.uid, 'settings', 'config');
    }, [firestore, user]);

    const { data: settings, isLoading } = useDoc<Settings>(settingsDocRef);

    useEffect(() => {
        if (settings?.webhookToken) {
            setTokenInput(settings.webhookToken);
        }
    }, [settings]);

    const handleSaveToken = () => {
        if (!user || !tokenInput.trim()) {
            toast({ variant: 'destructive', title: 'Token inválido', description: 'O token não pode estar vazio.' });
            return;
        }
        setIsSaving(true);
        const settingsRef = doc(firestore, 'users', user.uid, 'settings', 'config');
        
        setDocumentNonBlocking(settingsRef, { webhookToken: tokenInput.trim() }, { merge: true });
        
        toast({ title: 'Token Salvo!', description: 'O token de webhook foi definido para sua conta.' });
        setIsSaving(false);
    };
    
    return (
        <Card>
            <CardHeader>
                <CardTitle className="flex items-center gap-2"><Package/> Gerenciamento de Token (Admin)</CardTitle>
                <CardDescription>Defina ou atualize o token de webhook para sua conta de administrador. Recomenda-se usar um token do estoque de tokens.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
                <Label htmlFor="admin-token">Seu Token de Webhook</Label>
                <div className="flex items-center gap-2">
                    <Input
                        id="admin-token"
                        value={tokenInput}
                        onChange={(e) => setTokenInput(e.target.value)}
                        placeholder="Cole o token aqui..."
                        disabled={isLoading || isSaving}
                    />
                    <Button variant="outline" size="icon" onClick={() => navigator.clipboard.writeText(tokenInput)} disabled={!tokenInput}>
                        <Copy className="h-4 w-4" />
                    </Button>
                </div>
            </CardContent>
            <CardFooter>
                <Button onClick={handleSaveToken} disabled={isSaving || isLoading}>
                    {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : null}
                    {isLoading ? 'Carregando...' : isSaving ? 'Salvando...' : 'Salvar Meu Token'}
                </Button>
            </CardFooter>
        </Card>
    );
}


// --------- Main Profile Page Component ----------

export default function ProfilePage() {
    const { firestore, user } = useFirebase();
    const { toast } = useToast();

    const userDocRef = useMemoFirebase(() => (user ? doc(firestore, 'users', user.uid) : null), [firestore, user]);
    const { data: userProfile, isLoading: isProfileLoading } = useDoc<UserProfile>(userDocRef);

    const [isRenewing, setIsRenewing] = useState(false);
    const [paymentInfo, setPaymentInfo] = useState<{ id: string; qr_code: string; qr_code_base64: string } | null>(null);
    const [paymentStatus, setPaymentStatus] = useState<'pending' | 'paid' | 'error' | null>(null);
    const [isProcessingRenewal, setIsProcessingRenewal] = useState(false);

    const handleRenewSubscription = async () => {
        if (isRenewing || !userProfile?.subscriptionPlan) return;
        
        setIsRenewing(true);
        setPaymentInfo(null);
        setPaymentStatus(null);
        setIsProcessingRenewal(false);
        
        const planPrices = { basic: 6990, pro: 11990 };
        const valueInCents = planPrices[userProfile.subscriptionPlan];

        try {
            const response = await fetch('/api/generate-pix', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ value: valueInCents }),
            });
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({ error: 'Falha ao gerar o PIX.' }));
                throw new Error(errorData.error);
            }
            const data = await response.json();
            setPaymentInfo(data);
            setPaymentStatus('pending');
        } catch (error: any) {
            toast({ variant: 'destructive', title: 'Erro', description: error.message });
            setPaymentStatus('error');
        } finally {
            setIsRenewing(false);
        }
    };
    
    useEffect(() => {
        if (paymentStatus !== 'pending' || !paymentInfo?.id) return;
        const interval = setInterval(async () => {
            try {
                const res = await fetch(`/api/check-pix-status?id=${paymentInfo.id}`);
                if (!res.ok) return;
                const data = await res.json();
                if (data.status === 'paid') {
                    setPaymentStatus('paid');
                    clearInterval(interval);
                } else if (data.status === 'expired' || data.status === 'error' ) {
                     clearInterval(interval);
                     setPaymentStatus('error');
                }
            } catch (e) { console.error('Polling error:', e); }
        }, 5000);
        return () => clearInterval(interval);
    }, [paymentStatus, paymentInfo?.id]);

    useEffect(() => {
        const grantRenewalAccess = async () => {
             if (paymentStatus !== 'paid' || !userProfile || !userDocRef || isProcessingRenewal) {
                return;
            }
            setIsProcessingRenewal(true);
            try {
                const currentEndDate = userProfile.subscriptionEndDate ? userProfile.subscriptionEndDate.toDate() : new Date();
                const newEndDate = addDays(currentEndDate > new Date() ? currentEndDate : new Date(), 30);
                
                await setDocumentNonBlocking(userDocRef, {
                    subscriptionEndDate: Timestamp.fromDate(newEndDate),
                    trialActivated: false, // Remove trial tag on renewal
                }, { merge: true });

                toast({ title: "Assinatura Renovada!", description: `Seu acesso foi estendido.` });
                setTimeout(() => {
                    setPaymentInfo(null);
                    setPaymentStatus(null);
                }, 3000);
            } catch(e) {
                toast({ variant: 'destructive', title: 'Falha na Renovação', description: 'Não foi possível atualizar sua assinatura.' });
                setIsProcessingRenewal(false); // Allow retry on error
            }
        };
        grantRenewalAccess();
    }, [paymentStatus, userProfile, userDocRef, toast, isProcessingRenewal]);
    
    const handleCopy = (text: string) => {
        navigator.clipboard.writeText(text);
        toast({ title: 'Copiado!', description: 'Código PIX copiado.' });
    };

    const resetDialog = () => {
        setPaymentInfo(null);
        setPaymentStatus(null);
        setIsProcessingRenewal(false);
    }

    if (isProfileLoading) {
        return (
            <div className="flex flex-col h-full">
                <PageHeader title="Meu Perfil" description="Gerencie sua conta e assinatura." />
                <main className="flex-1 overflow-auto p-4 md:p-6 space-y-6 max-w-4xl mx-auto w-full">
                    <Skeleton className="h-48 w-full" />
                    <Skeleton className="h-64 w-full" />
                </main>
            </div>
        );
    }

    return (
        <>
        <PaymentDialog 
            isOpen={!!paymentInfo}
            onClose={resetDialog}
            plan={userProfile?.subscriptionPlan || null}
            paymentInfo={paymentInfo}
            paymentStatus={paymentStatus}
            onCopy={handleCopy}
        />
        <div className="flex flex-col h-full">
            <PageHeader title="Meu Perfil" description="Gerencie sua conta e assinatura." />
            <main className="flex-1 overflow-auto p-4 md:p-6 space-y-6 max-w-4xl mx-auto w-full">
                {userProfile?.role === 'Admin' && <AdminTokenManager />}
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2"><ShieldCheck/> Plano e Assinatura</CardTitle>
                        <CardDescription>Informações sobre seu plano atual e data de vencimento.</CardDescription>
                    </CardHeader>
                    {userProfile?.subscriptionPlan ? (
                        <CardContent className="space-y-4">
                            <div className="flex justify-between items-center p-4 border rounded-lg">
                                <div>
                                    <Label>Plano Atual</Label>
                                    <p className="font-semibold text-lg capitalize flex items-center gap-2">
                                        {userProfile.subscriptionPlan}
                                        {userProfile.trialActivated && userProfile.subscriptionEndDate && userProfile.subscriptionEndDate.toDate() > new Date() && (
                                            <Badge variant="outline" className="border-yellow-400 bg-yellow-50 text-yellow-800 dark:border-yellow-600 dark:bg-yellow-950/50 dark:text-yellow-300">
                                                Teste Grátis
                                            </Badge>
                                        )}
                                        <Badge>{userProfile.role}</Badge>
                                    </p>
                                </div>
                                <div>
                                    <Label className="flex items-center gap-2"><CalendarClock/> Vence em</Label>
                                    <SubscriptionTimeLeft endDate={userProfile.subscriptionEndDate} />
                                </div>
                            </div>
                        </CardContent>
                    ) : (
                         <CardContent>
                             <p className="text-muted-foreground">Você não possui uma assinatura ativa.</p>
                         </CardContent>
                    )}
                    <CardFooter className="flex-wrap gap-2">
                       {userProfile?.subscriptionPlan && (
                            <>
                                <Button onClick={handleRenewSubscription} disabled={isRenewing}>
                                    {isRenewing && <Loader2 className="mr-2 h-4 w-4 animate-spin"/>}
                                    <Repeat className="mr-2 h-4 w-4" />
                                    Renovar Assinatura
                                </Button>
                            </>
                       )}
                    </CardFooter>
                </Card>

                <PasswordChangeForm />

            </main>
        </div>
        </>
    );
}
