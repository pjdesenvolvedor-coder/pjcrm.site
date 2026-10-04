'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useFirebase, useDoc, useMemoFirebase } from '@/firebase';
import { doc, setDoc } from 'firebase/firestore';
import type { Settings, UazapiConnectionConfig } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';
import { Badge } from "@/components/ui/badge";
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Loader2, QrCode, Zap, RefreshCcw, CheckCircle2, Globe, Key, Webhook, Copy, ArrowRight } from 'lucide-react';
import Image from 'next/image';
import { PageHeader } from '@/components/page-header';

export default function FlowConnectionPage() {
    const { firestore, effectiveUserId, isUserLoading } = useFirebase();
    const { toast } = useToast();

    const [serverUrl, setServerUrl] = useState('https://travelflow.uazapi.com');
    const [instanceToken, setInstanceToken] = useState('');
    const [isSaving, setIsSaving] = useState(false);

    const [connectionStatus, setConnectionStatus] = useState<'disconnected' | 'connecting' | 'qr_code' | 'connected' | 'error'>('disconnected');
    const [qrCode, setQrCode] = useState<string | null>(null);
    const [profileName, setProfileName] = useState('');
    const [profilePicUrl, setProfilePicUrl] = useState('');
    const [isCheckingStatus, setIsCheckingStatus] = useState(false);
    const [isDisconnecting, setIsDisconnecting] = useState(false);
    const [isRegisteringWebhook, setIsRegisteringWebhook] = useState(false);

    const webhookUrl = typeof window !== 'undefined' 
        ? `${window.location.origin}/api/flows/webhook${effectiveUserId ? `?userId=${effectiveUserId}` : ''}` 
        : `https://www.pjcrm.site/api/flows/webhook${effectiveUserId ? `?userId=${effectiveUserId}` : ''}`;

    // Settings do Hub Principal (caso queira importar o token)
    const settingsDocRef = useMemoFirebase(() => {
        if (!effectiveUserId) return null;
        return doc(firestore, 'users', effectiveUserId, 'settings', 'config');
    }, [firestore, effectiveUserId]);
    const { data: mainSettings } = useDoc<Settings>(settingsDocRef);

    // Documento específico da conexão do Fluxo
    const flowConnectionDocRef = useMemoFirebase(() => {
        if (!effectiveUserId) return null;
        return doc(firestore, 'users', effectiveUserId, 'settings', 'uazapi_flow');
    }, [firestore, effectiveUserId]);
    const { data: flowConfig, isLoading: isLoadingConfig } = useDoc<UazapiConnectionConfig>(flowConnectionDocRef);

    // Carregar config salva
    useEffect(() => {
        if (flowConfig) {
            if (flowConfig.serverUrl) setServerUrl(flowConfig.serverUrl);
            if (flowConfig.instanceToken) setInstanceToken(flowConfig.instanceToken);
        } else if (mainSettings?.webhookToken && !instanceToken) {
            // Sugere por padrão o token já configurado no sistema caso ainda não exista config do fluxo
            setInstanceToken(mainSettings.webhookToken);
        }
    }, [flowConfig, mainSettings]);

    // Função de verificação de status
    const checkStatus = React.useCallback(async (tokenToUse?: string, urlToUse?: string) => {
        const token = tokenToUse || instanceToken;
        const url = urlToUse || serverUrl;
        if (!token) return;

        setIsCheckingStatus(true);
        try {
            const res = await fetch('/api/flows/uazapi', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'status',
                    serverUrl: url,
                    instanceToken: token,
                }),
            });

            const data = await res.json();
            if (res.ok && data.status) {
                if (data.status === 'connected') {
                    setConnectionStatus('connected');
                    setProfileName(data.instanceName || '');
                    setProfilePicUrl(data.profilePicUrl || '');
                    setQrCode(null);
                } else if (data.status === 'connecting') {
                    setConnectionStatus('connecting');
                } else {
                    setConnectionStatus('disconnected');
                }
            } else {
                setConnectionStatus('disconnected');
            }
        } catch (err) {
            console.error('Erro ao verificar status:', err);
            setConnectionStatus('disconnected');
        } finally {
            setIsCheckingStatus(false);
        }
    }, [instanceToken, serverUrl]);

    // Checa status assim que o token estiver disponível
    useEffect(() => {
        if (instanceToken) {
            checkStatus(instanceToken, serverUrl);
        }
    }, [instanceToken, checkStatus, serverUrl]);

    // Polling caso esteja aguardando leitura de QR Code
    useEffect(() => {
        if (connectionStatus !== 'qr_code' && connectionStatus !== 'connecting') return;
        
        const interval = setInterval(() => {
            checkStatus();
        }, 4000);

        return () => clearInterval(interval);
    }, [connectionStatus, checkStatus]);

    // Salvar configurações
    const handleSaveConfig = async () => {
        if (!effectiveUserId) return;
        if (!instanceToken.trim()) {
            toast({ variant: 'destructive', title: 'Token obrigatório', description: 'Por favor, insira o Instance Token da UazAPI.' });
            return;
        }

        setIsSaving(true);
        try {
            await setDoc(flowConnectionDocRef!, {
                serverUrl: serverUrl.trim(),
                instanceToken: instanceToken.trim(),
                status: connectionStatus === 'connected' ? 'connected' : 'disconnected',
                updatedAt: new Date().toISOString(),
            }, { merge: true });

            // Registra automaticamente o webhook na UazAPI
            try {
                await fetch('/api/flows/uazapi', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        action: 'set_webhook',
                        serverUrl: serverUrl.trim(),
                        instanceToken: instanceToken.trim(),
                        webhookUrl: webhookUrl,
                    }),
                });
            } catch (wErr) {
                console.warn('Registro automático de webhook falhou:', wErr);
            }

            toast({ title: 'Configurações salvas e Webhook registrado!', description: 'Conexão e Webhook do WhatsApp configurados com sucesso.' });
            checkStatus(instanceToken.trim(), serverUrl.trim());
        } catch (err: any) {
            toast({ variant: 'destructive', title: 'Erro ao salvar', description: err.message });
        } finally {
            setIsSaving(false);
        }
    };

    // Conectar / Gerar QR Code
    const handleConnect = async () => {
        if (!instanceToken.trim()) {
            toast({ variant: 'destructive', title: 'Token não informado', description: 'Insira o token da instância antes de conectar.' });
            return;
        }

        setConnectionStatus('connecting');
        setQrCode(null);

        try {
            const res = await fetch('/api/flows/uazapi', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'connect',
                    serverUrl: serverUrl.trim(),
                    instanceToken: instanceToken.trim(),
                }),
            });

            const data = await res.json();
            if (data.qrcode) {
                setQrCode(data.qrcode);
                setConnectionStatus('qr_code');
                toast({ title: 'QR Code gerado!', description: 'Abra seu WhatsApp e escaneie o código na tela.' });
            } else if (data.data?.status?.connected || data.data?.response === 'Connected') {
                setConnectionStatus('connected');
                toast({ title: 'WhatsApp Conectado!' });
                // Registra automaticamente o webhook
                fetch('/api/flows/uazapi', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        action: 'set_webhook',
                        serverUrl: serverUrl.trim(),
                        instanceToken: instanceToken.trim(),
                        webhookUrl: webhookUrl,
                    }),
                }).catch(() => {});
                checkStatus();
            } else {
                setConnectionStatus('connecting');
                toast({ title: 'Solicitação enviada', description: 'Aguardando inicialização da sessão...' });
            }
        } catch (err: any) {
            setConnectionStatus('error');
            toast({ variant: 'destructive', title: 'Falha na conexão', description: err.message });
        }
    };

    // Desconectar
    const handleDisconnect = async () => {
        if (!instanceToken) return;
        setIsDisconnecting(true);
        try {
            await fetch('/api/flows/uazapi', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'disconnect',
                    serverUrl: serverUrl.trim(),
                    instanceToken: instanceToken.trim(),
                }),
            });

            setConnectionStatus('disconnected');
            setQrCode(null);
            setProfileName('');
            setProfilePicUrl('');
            toast({ title: 'Instância desconectada com sucesso.' });
        } catch (err: any) {
            toast({ variant: 'destructive', title: 'Erro ao desconectar' });
        } finally {
            setIsDisconnecting(false);
        }
    };

    // Registrar Webhook com 1 clique
    const handleRegisterWebhook = async () => {
        if (!instanceToken.trim()) {
            toast({ variant: 'destructive', title: 'Token necessário', description: 'Configure o token da instância antes de registrar o webhook.' });
            return;
        }

        setIsRegisteringWebhook(true);
        try {
            const res = await fetch('/api/flows/uazapi', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'set_webhook',
                    serverUrl: serverUrl.trim(),
                    instanceToken: instanceToken.trim(),
                    webhookUrl: webhookUrl,
                }),
            });

            const data = await res.json();
            if (res.ok && data.success) {
                toast({
                    title: 'Webhook registrado na UazAPI!',
                    description: `Eventos de mensagens serão direcionados para: ${webhookUrl}`,
                });
            } else {
                toast({
                    variant: 'destructive',
                    title: 'Falha ao registrar webhook',
                    description: data.error || 'A UazAPI não aceitou o registro do webhook.',
                });
            }
        } catch (err: any) {
            toast({ variant: 'destructive', title: 'Erro de comunicação', description: err.message });
        } finally {
            setIsRegisteringWebhook(false);
        }
    };

    const copyWebhookUrl = () => {
        navigator.clipboard.writeText(webhookUrl);
        toast({ title: 'URL copiada para a área de transferência!' });
    };

    const importMainHubToken = () => {
        if (mainSettings?.webhookToken) {
            setInstanceToken(mainSettings.webhookToken);
            toast({ title: 'Token do Hub Principal importado com sucesso!' });
        } else {
            toast({ variant: 'destructive', title: 'Nenhum token encontrado no Hub Principal.' });
        }
    };

    return (
        <div className="flex-1 space-y-6 p-4 md:p-8 pt-6">
            <PageHeader
                title="Conectar WhatsApp (UazAPI)"
                description="Conecte sua instância da UazAPI para acionar e responder fluxos automáticos de conversa."
            />

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* COLUNA ESQUERDA: CREDENCIAIS */}
                <div className="lg:col-span-2 space-y-6">
                    <Card className="border shadow-sm">
                        <CardHeader>
                            <div className="flex items-center justify-between">
                                <CardTitle className="flex items-center gap-2 text-lg">
                                    <Globe className="h-5 w-5 text-indigo-600" />
                                    Credenciais da Instância
                                </CardTitle>
                                {mainSettings?.webhookToken && (
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={importMainHubToken}
                                        className="text-xs gap-1 border-indigo-200 text-indigo-700 hover:bg-indigo-50"
                                    >
                                        <Zap className="h-3.5 w-3.5" />
                                        Usar Token do Hub Principal
                                    </Button>
                                )}
                            </div>
                            <CardDescription>
                                Informe os dados da sua API UazAPI (ou use a URL padrão da sua instalação).
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="space-y-2">
                                <Label htmlFor="serverUrl" className="text-sm font-semibold">
                                    Server URL da API
                                </Label>
                                <div className="relative">
                                    <Input
                                        id="serverUrl"
                                        value={serverUrl}
                                        onChange={(e) => setServerUrl(e.target.value)}
                                        placeholder="https://travelflow.uazapi.com"
                                        className="pl-3"
                                    />
                                </div>
                                <p className="text-xs text-muted-foreground">
                                    Exemplo padrão: <code className="bg-muted px-1 rounded">https://travelflow.uazapi.com</code>
                                </p>
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="instanceToken" className="text-sm font-semibold">
                                    Token da Instância (Instance Token)
                                </Label>
                                <div className="relative">
                                    <Input
                                        id="instanceToken"
                                        type="password"
                                        value={instanceToken}
                                        onChange={(e) => setInstanceToken(e.target.value)}
                                        placeholder="Ex: uaz_live_abc123..."
                                        className="font-mono text-sm"
                                    />
                                </div>
                                <p className="text-xs text-muted-foreground">
                                    Token de autenticação retornado na criação da instância ou aba Tokens na UazAPI.
                                </p>
                            </div>
                        </CardContent>
                        <CardFooter className="flex justify-between border-t pt-4">
                            <Button
                                variant="outline"
                                onClick={() => checkStatus()}
                                disabled={isCheckingStatus || !instanceToken}
                                className="gap-2"
                            >
                                <RefreshCcw className={`h-4 w-4 ${isCheckingStatus ? 'animate-spin' : ''}`} />
                                Testar Status
                            </Button>
                            <Button
                                onClick={handleSaveConfig}
                                disabled={isSaving || !instanceToken}
                                className="bg-indigo-600 hover:bg-indigo-700 text-white gap-2"
                            >
                                {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                                Salvar Credenciais
                            </Button>
                        </CardFooter>
                    </Card>

                    {/* CARD WEBHOOK */}
                    <Card className="border shadow-sm">
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2 text-lg">
                                <Webhook className="h-5 w-5 text-indigo-600" />
                                Configuração de Webhook da UazAPI
                            </CardTitle>
                            <CardDescription>
                                Para que os fluxos respondam às mensagens recebidas no WhatsApp, a UazAPI precisa enviar os eventos para o CRM.
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="space-y-2">
                                <Label className="text-sm font-semibold">URL de Webhook do CRM</Label>
                                <div className="flex gap-2">
                                    <Input
                                        readOnly
                                        value={webhookUrl}
                                        className="font-mono text-xs bg-muted"
                                    />
                                    <Button variant="outline" size="icon" onClick={copyWebhookUrl} title="Copiar URL">
                                        <Copy className="h-4 w-4" />
                                    </Button>
                                </div>
                                <p className="text-xs text-muted-foreground">
                                    Essa URL receberá o evento <code className="bg-muted px-1 rounded">messages</code> filtrando mensagens automáticas para evitar loops.
                                </p>
                            </div>
                        </CardContent>
                        <CardFooter className="border-t pt-4">
                            <Button
                                onClick={handleRegisterWebhook}
                                disabled={isRegisteringWebhook || !instanceToken}
                                className="w-full bg-emerald-600 hover:bg-emerald-700 text-white gap-2"
                            >
                                {isRegisteringWebhook ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                    <Zap className="h-4 w-4" />
                                )}
                                Registrar Webhook Automaticamente na UazAPI (1 Clique)
                            </Button>
                        </CardFooter>
                    </Card>
                </div>

                {/* COLUNA DIREITA: STATUS E QR CODE */}
                <div className="space-y-6">
                    <Card className="border shadow-sm text-center">
                        <CardHeader>
                            <CardTitle className="text-lg">Estado da Sessão</CardTitle>
                            <CardDescription>Status da conexão com o WhatsApp</CardDescription>
                        </CardHeader>
                        <CardContent className="flex flex-col items-center justify-center p-6 min-h-[320px]">
                            {connectionStatus === 'connected' ? (
                                <div className="flex flex-col items-center gap-4">
                                    <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100 py-1 px-4 text-sm font-semibold">
                                        🟢 Conectado
                                    </Badge>
                                    {profilePicUrl ? (
                                        <Image
                                            src={profilePicUrl}
                                            alt="Foto Perfil"
                                            width={88}
                                            height={88}
                                            className="rounded-full shadow-md border-2 border-emerald-500"
                                        />
                                    ) : (
                                        <div className="w-20 h-20 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-600 shadow-md">
                                            <Zap className="h-10 w-10" />
                                        </div>
                                    )}
                                    <div>
                                        <p className="font-bold text-base">{profileName || 'WhatsApp Ativo'}</p>
                                        <p className="text-xs text-muted-foreground">Pronto para rodar fluxos</p>
                                    </div>
                                    <Button
                                        variant="destructive"
                                        size="sm"
                                        onClick={handleDisconnect}
                                        disabled={isDisconnecting}
                                        className="mt-2 w-full"
                                    >
                                        {isDisconnecting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                                        Desconectar Sessão
                                    </Button>
                                </div>
                            ) : connectionStatus === 'qr_code' && qrCode ? (
                                <div className="flex flex-col items-center gap-3">
                                    <Badge className="bg-blue-100 text-blue-800 hover:bg-blue-100 py-1 px-3">
                                        <QrCode className="h-4 w-4 mr-1 inline" /> Escaneie o QR Code
                                    </Badge>
                                    <div className="bg-white p-2 rounded-xl shadow-lg border border-slate-200">
                                        <Image src={qrCode} alt="QR Code WhatsApp" width={220} height={220} />
                                    </div>
                                    <p className="text-xs text-muted-foreground animate-pulse">
                                        Aguardando pareamento no celular...
                                    </p>
                                </div>
                            ) : connectionStatus === 'connecting' ? (
                                <div className="flex flex-col items-center gap-4 py-8">
                                    <Loader2 className="h-12 w-12 text-indigo-600 animate-spin" />
                                    <p className="text-sm font-medium text-muted-foreground">Iniciando sessão na UazAPI...</p>
                                </div>
                            ) : (
                                <div className="flex flex-col items-center gap-4 py-6">
                                    <div className="w-20 h-20 rounded-full bg-slate-100 flex items-center justify-center text-slate-400">
                                        <Zap className="h-10 w-10" />
                                    </div>
                                    <div>
                                        <Badge variant="outline" className="text-slate-600 mb-2">Desconectado</Badge>
                                        <p className="text-xs text-muted-foreground">
                                            Clique no botão abaixo para gerar o QR code e parear seu aparelho.
                                        </p>
                                    </div>
                                    <Button
                                        onClick={handleConnect}
                                        disabled={!instanceToken}
                                        className="bg-indigo-600 hover:bg-indigo-700 text-white gap-2 w-full mt-2"
                                    >
                                        <QrCode className="h-4 w-4" />
                                        Conectar / Gerar QR Code
                                    </Button>
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </div>
            </div>
        </div>
    );
}
