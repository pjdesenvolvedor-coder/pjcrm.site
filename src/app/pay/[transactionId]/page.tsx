import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import Image from 'next/image';
import { notFound } from 'next/navigation';
import { CopyButton } from './copy-button';
import { AlertTriangle, CheckCircle } from 'lucide-react';

interface PixDetails {
    qr_code: string;
    qr_code_base64: string;
    value: number; // in cents
    status: 'pending' | 'paid' | 'expired' | 'error';
}

async function getPixDetails(transactionId: string): Promise<PixDetails | null> {
    const apiHost = process.env.NEXT_PUBLIC_API_HOST || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:9002');
    try {
        const res = await fetch(`${apiHost}/api/get-pix-details?id=${transactionId}`, {
            cache: 'no-store', // Always fetch latest status
        });

        if (!res.ok) {
            return null;
        }
        const data = await res.json();
        return data;
    } catch (error) {
        console.error("Failed to fetch PIX details:", error);
        return null;
    }
}


export default async function PublicPaymentPage({ params }: { params: { transactionId: string } }) {
    const pixDetails = await getPixDetails(params.transactionId);

    if (!pixDetails) {
        return notFound();
    }
    
    const valueInReais = (pixDetails.value / 100).toLocaleString('pt-BR', {
        style: 'currency',
        currency: 'BRL',
    });

    const renderContent = () => {
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

    return (
        <div className="flex min-h-screen items-center justify-center bg-muted/40 p-4">
            <Card className="w-full max-w-md shadow-lg">
                <CardHeader className="text-center">
                     <div className="flex items-center justify-center gap-2 mb-4">
                        <Image
                            src="https://i.imgur.com/sgoiuiz.png"
                            alt="EMPREENDIMENTOS Logo"
                            width={40}
                            height={40}
                            className="h-10 w-10"
                            data-ai-hint="logo"
                        />
                    </div>
                    <CardTitle className="text-2xl font-bold">Pagamento PIX</CardTitle>
                    <CardDescription>Valor da cobrança: <span className="font-bold text-foreground">{valueInReais}</span></CardDescription>
                </CardHeader>
                <CardContent>
                    {renderContent()}
                </CardContent>
            </Card>
        </div>
    );
}
