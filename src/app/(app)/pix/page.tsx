'use client';

import { useState, useEffect } from 'react';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { Copy, RefreshCw, CreditCard, CheckCircle, AlertTriangle, Link as LinkIcon } from 'lucide-react';
import Image from 'next/image';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

export default function GeneratePixPage() {
  const { toast } = useToast();

  const [amount, setAmount] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [host, setHost] = useState('');

  const [paymentInfo, setPaymentInfo] = useState<{ id: string; qr_code: string; qr_code_base64: string } | null>(null);
  const [paymentStatus, setPaymentStatus] = useState<'pending' | 'paid' | 'error' | null>(null);

  useEffect(() => {
    if (typeof window !== 'undefined') {
        setHost(window.location.origin);
    }
  }, []);

  const handleGeneratePix = async () => {
    const valueNum = parseFloat(amount.replace(',', '.'));
    if (isNaN(valueNum) || valueNum <= 0) {
      toast({ variant: 'destructive', title: 'Valor inválido', description: 'Por favor, insira um valor numérico maior que zero.' });
      return;
    }

    setIsGenerating(true);
    setPaymentInfo(null);
    setPaymentStatus(null);
    const valueInCents = Math.round(valueNum * 100);

    try {
      const response = await fetch('/api/generate-pix', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value: valueInCents }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'O token de pagamento não foi configurado no servidor. Contate o administrador.' }));
        throw new Error(errorData.error);
      }

      const data = await response.json();
      setPaymentInfo(data);
      setPaymentStatus('pending');
      toast({ title: 'PIX Gerado!', description: 'Aguardando pagamento.' });
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Erro ao Gerar PIX', description: error.message });
      setPaymentStatus('error');
    } finally {
      setIsGenerating(false);
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
        } else if (data.status === 'expired' || data.status === 'error') {
          setPaymentStatus('error');
          clearInterval(interval);
        }
      } catch (e) { console.error('Polling error:', e); }
    }, 5000);

    return () => clearInterval(interval);
  }, [paymentStatus, paymentInfo?.id]);

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: 'Copiado!' });
  };

  const handleCopyLink = (transactionId: string) => {
    const link = `${host}/pay/${transactionId}`;
    navigator.clipboard.writeText(link);
    toast({ title: 'Link de Pagamento Copiado!' });
  };

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title="Gerar PIX"
        description="Crie cobranças PIX avulsas aqui."
      />
      <main className="flex-1 overflow-auto p-4 md:p-6 space-y-6">
        <Alert>
          <CreditCard className="h-4 w-4" />
          <AlertTitle>Configuração Centralizada</AlertTitle>
          <AlertDescription>
            O token da API de pagamento é configurado pelo administrador do sistema para garantir o funcionamento dos links públicos de pagamento.
          </AlertDescription>
        </Alert>

        <div className="grid md:grid-cols-2 gap-6 items-start">
            <Card>
                <CardHeader>
                    <CardTitle>Nova Cobrança PIX</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="space-y-2">
                        <Label htmlFor="pix-amount">Valor (R$)</Label>
                        <Input
                            id="pix-amount"
                            placeholder="Ex: 10,50"
                            value={amount}
                            onChange={(e) => setAmount(e.target.value)}
                            disabled={isGenerating}
                        />
                    </div>
                </CardContent>
                <CardFooter>
                    <Button onClick={handleGeneratePix} disabled={isGenerating}>
                        {isGenerating ? <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> : <CreditCard className="mr-2 h-4 w-4" />}
                        Gerar PIX
                    </Button>
                </CardFooter>
            </Card>

            <Card className="min-h-[350px] flex items-center justify-center">
                <CardContent className="p-4 w-full">
                    {!paymentInfo && paymentStatus !== 'error' && (
                        <div className="text-center text-muted-foreground">
                            O QR Code e o código Copia e Cola aparecerão aqui.
                        </div>
                    )}
                    {paymentStatus === 'pending' && paymentInfo && (
                        <div className="flex flex-col items-center justify-center text-center gap-4">
                             <Badge variant="outline" className="border-yellow-400 bg-yellow-50 text-yellow-800">
                                <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                                Aguardando Pagamento...
                            </Badge>
                            <div className="w-48 h-48 bg-white rounded-lg flex items-center justify-center my-2 p-2 shadow-lg">
                                <Image src={paymentInfo.qr_code_base64} alt="PIX QR Code" width={180} height={180} data-ai-hint="qr code"/>
                            </div>
                            <div className="w-full px-4 space-y-2">
                                <div>
                                    <Label htmlFor="pix-code">PIX Copia e Cola</Label>
                                    <div className="relative">
                                        <Input id="pix-code" readOnly value={paymentInfo.qr_code} className="pr-10 bg-muted" />
                                        <Button variant="ghost" size="icon" className="absolute right-1 top-1/2 -translate-y-1/2 h-8 w-8" onClick={() => handleCopy(paymentInfo.qr_code)}>
                                            <Copy className="h-4 w-4" />
                                        </Button>
                                    </div>
                                </div>
                                <div>
                                    <Button variant="outline" className="w-full" onClick={() => handleCopyLink(paymentInfo.id)}>
                                        <LinkIcon className="mr-2 h-4 w-4" />
                                        Compartilhar Link de Pagamento
                                    </Button>
                                </div>
                            </div>
                        </div>
                    )}
                    {paymentStatus === 'paid' && (
                        <div className="flex flex-col items-center justify-center text-center p-8 gap-4">
                            <CheckCircle className="h-16 w-16 text-green-500" />
                            <h3 className="text-xl font-bold">Pagamento Aprovado!</h3>
                        </div>
                    )}
                    {paymentStatus === 'error' && (
                        <div className="flex flex-col items-center justify-center text-center p-8 gap-4">
                            <AlertTriangle className="h-16 w-16 text-destructive" />
                            <h3 className="text-xl font-bold">Erro ou PIX Expirado</h3>
                            <p className="text-muted-foreground">Por favor, gere uma nova cobrança.</p>
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
      </main>
    </div>
  );
}
