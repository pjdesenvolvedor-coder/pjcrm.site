'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import Image from 'next/image';
import { CopyButton } from './copy-button';
import { AlertTriangle, CheckCircle, CreditCard, Loader2 } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';


interface PixDetails {
    qr_code: string;
    qr_code_base64: string;
    value: number; // in cents
    status: 'pending' | 'paid' | 'expired' | 'error';
}

export default function PublicPaymentPage({ params }: { params: { transactionId: string } }) {
    const [pixDetails, setPixDetails] = useState<PixDetails | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const fetchDetails = async () => {
            try {
                const res = await fetch(`/api/get-pix-details?id=${params.transactionId}`);
                if (!res.ok) {
                    throw new Error('Não foi possível carregar os detalhes do pagamento.');
                }
                const data: PixDetails = await res.json();
                setPixDetails(data);
            } catch (e: any) {
                setError(e.message || 'Ocorreu um erro.');
            } finally {
                setIsLoading(false);
            }
        };

        fetchDetails();
    }, [params.transactionId]);

    useEffect(() => {
        if (pixDetails?.status !== 'pending') {
            return;
        }

        const interval = setInterval(async () => {
            try {
                const res = await fetch(`/api/check-pix-status?id=${params.transactionId}`);
                if (!res.ok) return;

                const data = await res.json();
                if (data.status === 'paid' || data.status === 'expired' || data.status === 'error') {
                    setPixDetails(prev => prev ? { ...prev, status: data.status } : null);
                    clearInterval(interval);
                }
            } catch (e) {
                console.error('Polling for PIX status failed:', e);
            }
        }, 5000); // Poll every 5 seconds

        return () => clearInterval(interval);

    }, [pixDetails, params.transactionId]);


    const renderContent = () => {
        if (isLoading) {
            return (
                <div className="flex flex-col items-center justify-center text-center gap-6">
                    <Skeleton className="w-56 h-56 rounded-lg" />
                    <div className="w-full px-4 space-y-2">
                        <Skeleton className="h-5 w-48" />
                        <Skeleton className="h-10 w-full" />
                    </div>
                </div>
            );
        }

        if (error || !pixDetails) {
             return (
                <div className="flex flex-col items-center justify-center text-center p-8 gap-4">
                    <AlertTriangle className="h-20 w-20 text-destructive" />
                    <h3 className="text-2xl font-bold">Erro ao Carregar</h3>
                    <p className="text-muted-foreground">{error || 'Os detalhes desta cobrança não puderam ser encontrados.'}</p>
                </div>
            );
        }

        if (pixDetails.status === 'paid') {
            return (
                <div className="flex flex-col items-center justify-center text-center p-8 gap-4">
                    <CheckCircle className="h-20 w-20 text-green-500" />
                    <h3 className="text-2xl font-bold">Pagamento Aprovado!</h3>
                    <p className="text-muted-foreground">Obrigado! Seu pagamento foi confirmado.</p>
                </div>
            )
        }
        
        if (pixDetails.status !== 'pending' || !pixDetails.qr_code_base64) {
             return (
                <div className="flex flex-col items-center justify-center text-center p-8 gap-4">
                    <AlertTriangle className="h-20 w-20 text-destructive" />
                    <h3 className="text-2xl font-bold">Cobrança Expirada ou Inválida</h3>
                    <p className="text-muted-foreground">Esta cobrança PIX não está mais disponível para pagamento.</p>
                </div>
            )
        }

        return (
            <div className="flex flex-col items-center justify-center text-center gap-6">
                 <div className="flex flex-col items-center justify-center text-center">
                    <Loader2 className="h-6 w-6 text-yellow-500 animate-spin mb-2" />
                    <p className="text-sm font-medium text-yellow-600">Aguardando pagamento...</p>
                 </div>
                <div className="w-56 h-56 bg-white rounded-lg flex items-center justify-center my-2 p-2 shadow-lg">
                    <Image src={pixDetails.qr_code_base64} alt="PIX QR Code" width={200} height={200} data-ai-hint="qr code"/>
                </div>
                <div className="w-full px-4">
                    <Label htmlFor="pix-code" className="text-sm font-medium text-left w-full block mb-1">
                        Clique para copiar o PIX Copia e Cola
                    </Label>
                    <CopyButton textToCopy={pixDetails.qr_code} />
                </div>
            </div>
        )
    }

    const valueInReais = pixDetails?.value ? (pixDetails.value / 100).toLocaleString('pt-BR', {
        style: 'currency',
        currency: 'BRL',
    }) : <Skeleton className="h-6 w-24 inline-block" />;

    return (
        <div className="flex min-h-screen items-center justify-center bg-muted/40 p-4">
            <Card className="w-full max-w-md shadow-lg">
                <CardHeader className="text-center">
                     <div className="flex items-center justify-center gap-2 mb-4">
                        <CreditCard className="h-10 w-10 text-muted-foreground" />
                    </div>
                    <CardTitle className="text-2xl font-bold">Pagamento PIX</CardTitle>
                    <CardDescription>Valor da cobrança: <span className="font-bold text-foreground">{valueInReais}</span></CardDescription>
                </CardHeader>
                <CardContent className="min-h-[420px] flex items-center justify-center">
                    {renderContent()}
                </CardContent>
            </Card>
        </div>
    );
}