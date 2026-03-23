'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useFirebase, useUser, useDoc, useMemoFirebase } from '@/firebase';
import { doc } from 'firebase/firestore';
import type { Settings } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';
import { Badge } from "@/components/ui/badge";
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Loader2, QrCode, Zap } from 'lucide-react';
import Image from 'next/image';
import { PageHeader } from '@/components/page-header';

type LiveStatus = {
  status: 'disconnected' | 'connecting' | 'connected';
  profileName?: string;
  profilePicUrl?: string;
};

export default function ZapVendasConnectionPage() {
    const { firestore, effectiveUserId, isUserLoading } = useFirebase();
    const { user } = useUser();
    const { toast } = useToast();
    
    const [connectionStatus, setConnectionStatus] = useState<'disconnected' | 'connecting' | 'qr_code' | 'error'>('disconnected');
    const [qrCode, setQrCode] = useState<string | null>(null);
    const [liveStatus, setLiveStatus] = useState<LiveStatus | null>(null);
    const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);
    const [isDisconnecting, setIsDisconnecting] = useState(false);

    const settingsDocRef = useMemoFirebase(() => {
        if (!effectiveUserId) return null;
        return doc(firestore, 'users', effectiveUserId, 'settings', 'config');
    }, [firestore, effectiveUserId]);

    const { data: settings, isLoading: isLoadingSettings } = useDoc<Settings>(settingsDocRef);

    const fetchStatus = React.useCallback(async () => {
        if (isLoadingSettings || !settings?.zapVendasToken) {
            setLiveStatus({ status: 'disconnected' });
            return;
        }
        try {
            const response = await fetch('/api/status', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ token: settings.zapVendasToken }),
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
        if (settings?.zapVendasToken) {
            fetchStatus();
            const intervalId = setInterval(fetchStatus, 10000);
            return () => clearInterval(intervalId);
        }
    }, [settings?.zapVendasToken, fetchStatus]);

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

    const handleConnect = async () => {
        if (!settings?.zapVendasToken) {
            toast({
                variant: 'destructive',
                title: 'Token não encontrado',
                description: 'Seu token do Zap Vendas não foi configurado. Acesse a aba Configurações.',
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
                body: JSON.stringify({ token: settings.zapVendasToken }),
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
        if (!settings?.zapVendasToken) return;
        setIsDisconnecting(true);
        try {
            await fetch('https://n8nbeta.typeflow.app.br/webhook/2ac86d63-f7fc-4221-bbaf-efeecec33127', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ token: settings.zapVendasToken }),
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
                <p className="text-sm text-muted-foreground">Clique em 'Conectar' para parear este WhatsApp.</p>
                <div className="w-40 h-40 bg-muted/20 rounded-lg flex items-center justify-center my-4"><Zap className="h-20 w-20 text-muted-foreground/20" /></div>
            </div>
        );
    };

    if (isUserLoading) return <Loader2 className="animate-spin h-8 w-8 m-auto mt-20" />;

    return (
        <div className="flex flex-col h-full">
            <PageHeader title="ZAP VENDAS" description="Conexão isolada do WhatsApp exclusiva para o módulo de vendas." />
            <main className="flex-1 overflow-auto p-4 md:p-6 space-y-6 max-w-4xl mx-auto w-full">
                <Card className="max-w-md mx-auto">
                    <CardHeader className="text-center">
                        <CardTitle className="text-2xl flex items-center justify-center gap-2"><Zap className="text-primary" /> Conexão Zap Vendas</CardTitle>
                        <CardDescription>Escaneie o QR Code abaixo para conectar o WhatsApp de vendas.</CardDescription>
                    </CardHeader>
                    {renderContent()}
                    <CardFooter className="p-6 border-t bg-muted/50">
                        {liveStatus?.status !== 'connected' && connectionStatus !== 'qr_code' && (
                            <Button className="w-full" size="lg" onClick={handleConnect} disabled={connectionStatus === 'connecting'}>
                                <Zap className="mr-2 h-4 w-4" />Conectar WhatsApp
                            </Button>
                        )}
                    </CardFooter>
                </Card>
            </main>
        </div>
    );
}
