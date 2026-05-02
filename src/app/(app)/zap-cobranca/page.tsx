'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Zap, Loader2, QrCode, DollarSign, CheckCircle2, AlertCircle, Link2Off } from 'lucide-react';
import Image from 'next/image';
import { doc } from 'firebase/firestore';

import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useFirebase, useMemoFirebase, useDoc, setDocumentNonBlocking } from '@/firebase';
import { useToast } from '@/hooks/use-toast';
import type { Settings } from '@/lib/types';
import { cn } from '@/lib/utils';

type LiveStatus = {
  status: 'disconnected' | 'connecting' | 'connected';
  profileName?: string;
  profilePicUrl?: string;
};

type ConnectionState = 'idle' | 'connecting' | 'qr_code' | 'error';

export default function ZapCobrancaPage() {
  const { firestore, effectiveUserId } = useFirebase();
  const { toast } = useToast();

  const settingsDocRef = useMemoFirebase(
    () => (effectiveUserId ? doc(firestore, 'users', effectiveUserId, 'settings', 'config') : null),
    [firestore, effectiveUserId]
  );
  const { data: settings } = useDoc<Settings>(settingsDocRef);

  const [useSeparate, setUseSeparate] = useState<boolean>(false);
  const [tokenInput, setTokenInput] = useState('');
  const [connectionState, setConnectionState] = useState<ConnectionState>('idle');
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [liveStatus, setLiveStatus] = useState<LiveStatus | null>(null);
  const [isDisconnecting, setIsDisconnecting] = useState(false);
  const pollingRef = useRef<NodeJS.Timeout | null>(null);

  // Sync state from Firestore settings
  useEffect(() => {
    if (settings !== undefined) {
      setUseSeparate(settings?.useSeparateBillingZap ?? false);
      setTokenInput(settings?.billingWebhookToken ?? '');
    }
  }, [settings]);

  const activeToken = useSeparate ? tokenInput : settings?.webhookToken ?? '';

  const fetchStatus = useCallback(async () => {
    const token = useSeparate ? (settings?.billingWebhookToken || '') : (settings?.webhookToken || '');
    if (!token) {
      setLiveStatus({ status: 'disconnected' });
      return;
    }
    try {
      const res = await fetch('/api/status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      });
      if (res.ok) {
        const data = await res.json();
        const statusData = Array.isArray(data) ? data[0] : data;
        if (statusData) {
          setLiveStatus({
            status: statusData.status,
            profileName: statusData.nomeperfil,
            profilePicUrl: statusData.fotoperfil,
          });
        } else {
          setLiveStatus({ status: 'disconnected' });
        }
      } else {
        setLiveStatus({ status: 'disconnected' });
      }
    } catch {
      setLiveStatus({ status: 'disconnected' });
    }
  }, [useSeparate, settings?.billingWebhookToken, settings?.webhookToken]);

  useEffect(() => {
    fetchStatus();
    const id = setInterval(fetchStatus, 10000);
    return () => clearInterval(id);
  }, [fetchStatus]);

  // Auto-close QR code flow when connected
  useEffect(() => {
    if (liveStatus?.status === 'connected' && (connectionState === 'qr_code' || connectionState === 'connecting')) {
      setConnectionState('idle');
      setQrCode(null);
      if (pollingRef.current) { clearInterval(pollingRef.current); pollingRef.current = null; }
    }
  }, [liveStatus, connectionState]);

  const handleToggle = (separate: boolean) => {
    setUseSeparate(separate);
    setConnectionState('idle');
    setQrCode(null);
    if (!effectiveUserId) return;
    if (!separate) {
      setDocumentNonBlocking(
        doc(firestore, 'users', effectiveUserId, 'settings', 'config'),
        { useSeparateBillingZap: false },
        { merge: true }
      );
      toast({ title: 'Configurado!', description: 'ZAP Cobrança usará o mesmo Hub Principal.' });
    } else {
      setDocumentNonBlocking(
        doc(firestore, 'users', effectiveUserId, 'settings', 'config'),
        { useSeparateBillingZap: true },
        { merge: true }
      );
    }
  };

  const handleSaveToken = () => {
    if (!effectiveUserId || !tokenInput.trim()) return;
    setDocumentNonBlocking(
      doc(firestore, 'users', effectiveUserId, 'settings', 'config'),
      { billingWebhookToken: tokenInput.trim(), useSeparateBillingZap: true },
      { merge: true }
    );
    toast({ title: 'Token salvo!', description: 'Agora clique em Conectar para gerar o QR Code.' });
  };

  const handleConnect = async () => {
    const token = useSeparate ? tokenInput.trim() : settings?.webhookToken;
    if (!token) {
      toast({ variant: 'destructive', title: 'Token não configurado', description: 'Salve um token antes de conectar.' });
      return;
    }
    setConnectionState('connecting');
    setQrCode(null);

    // Auto-save token if it's a separate ZAP to prevent loss
    if (useSeparate && tokenInput.trim()) {
      setDocumentNonBlocking(
        doc(firestore, 'users', effectiveUserId!, 'settings', 'config'),
        { billingWebhookToken: tokenInput.trim(), useSeparateBillingZap: true },
        { merge: true }
      );
    }
    try {
      const res = await fetch('https://n8nbeta.typeflow.app.br/webhook/aeb30639-baf0-4862-9f5f-a3cc468ab7c5', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      });
      if (!res.ok) throw new Error('Falha na resposta do webhook.');
      const data = await res.json();
      const qrValue = data.qrcode;
      if (qrValue) {
        setQrCode(qrValue.startsWith('data:image') ? qrValue : `data:image/png;base64,${qrValue}`);
        setConnectionState('qr_code');
        toast({ title: 'QR Code Pronto!', description: 'Escaneie com o WhatsApp de Cobrança.' });
      } else {
        throw new Error('QR code inválido.');
      }
    } catch (err: any) {
      setConnectionState('error');
      toast({ variant: 'destructive', title: 'Falha na Conexão', description: err.message });
    }
  };

  const handleDisconnect = async () => {
    const token = useSeparate ? settings?.billingWebhookToken : settings?.webhookToken;
    if (!token) return;
    setIsDisconnecting(true);
    try {
      await fetch('https://n8nbeta.typeflow.app.br/webhook/2ac86d63-f7fc-4221-bbaf-efeecec33127', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      });
      toast({ title: 'Desconectado!' });
      setLiveStatus({ status: 'disconnected' });
    } catch {
      toast({ variant: 'destructive', title: 'Falha ao Desconectar' });
    } finally {
      setIsDisconnecting(false);
    }
  };

  const renderConnectionArea = () => {
    if (connectionState === 'connecting') {
      return (
        <div className="flex flex-col items-center justify-center text-center p-10 gap-4 min-h-[280px]">
          <Loader2 className="h-14 w-14 text-primary animate-spin" />
          <p className="text-sm text-muted-foreground mt-2">Gerando QR Code...</p>
        </div>
      );
    }
    if (connectionState === 'qr_code' && qrCode) {
      return (
        <div className="flex flex-col items-center justify-center text-center p-8 gap-4">
          <Badge variant="default" className="py-1 px-3 bg-blue-100 text-blue-800">
            <QrCode className="h-4 w-4 mr-2" /> Pronto para escanear
          </Badge>
          <div className="w-52 h-52 bg-white rounded-lg flex items-center justify-center my-2 p-2 shadow-lg">
            <Image src={qrCode} alt="QR Code" width={200} height={200} />
          </div>
          <p className="text-base font-semibold text-muted-foreground animate-pulse">Aguardando conexão...</p>
        </div>
      );
    }
    if (liveStatus?.status === 'connected') {
      return (
        <div className="flex flex-col items-center justify-center text-center p-10 gap-3 min-h-[280px]">
          <Badge variant="default" className="py-1 px-3 bg-green-100 text-green-800 text-sm">
            <CheckCircle2 className="h-4 w-4 mr-2" /> Conectado
          </Badge>
          {liveStatus.profilePicUrl && (
            <Image src={liveStatus.profilePicUrl} alt="Foto" width={80} height={80} className="rounded-full my-2 shadow-lg" />
          )}
          <p className="font-semibold text-lg">{liveStatus.profileName}</p>
          <Button variant="destructive" onClick={handleDisconnect} disabled={isDisconnecting} className="mt-2">
            {isDisconnecting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Link2Off className="h-4 w-4 mr-2" />}
            Desconectar
          </Button>
        </div>
      );
    }
    return (
      <div className="flex flex-col items-center justify-center text-center p-10 gap-4 min-h-[280px]">
        <Badge variant="destructive" className="py-1 px-3">Desconectado</Badge>
        <div className="w-32 h-32 bg-muted/20 rounded-full flex items-center justify-center my-2">
          <DollarSign className="h-16 w-16 text-muted-foreground/20" />
        </div>
        <p className="text-sm text-muted-foreground">
          {useSeparate ? 'Salve um token e clique em Conectar.' : 'Clique em Conectar para parear o Hub Principal.'}
        </p>
      </div>
    );
  };

  return (
    <div className="flex flex-col h-full">
      <PageHeader title="ZAP Cobrança">
        <p className="text-sm text-muted-foreground">Configure qual WhatsApp enviará as mensagens de cobrança</p>
      </PageHeader>

      <main className="flex-1 overflow-auto p-4 md:p-6 space-y-6 max-w-2xl mx-auto w-full">

        {/* Toggle Card */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Zap className="h-5 w-5 text-primary" />
              Qual ZAP usar para cobranças?
            </CardTitle>
            <CardDescription>
              Escolha se as mensagens de cobrança (vencimento, remarketing, upsell) serão enviadas pelo ZAP principal ou por um número separado.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex gap-3">
            <Button
              variant={!useSeparate ? 'default' : 'outline'}
              className="flex-1"
              onClick={() => handleToggle(false)}
            >
              <Zap className="h-4 w-4 mr-2" />
              Usar Hub Principal
            </Button>
            <Button
              variant={useSeparate ? 'default' : 'outline'}
              className="flex-1"
              onClick={() => handleToggle(true)}
            >
              <DollarSign className="h-4 w-4 mr-2" />
              Usar ZAP separado
            </Button>
          </CardContent>
        </Card>

        {/* Token input — only when using separate ZAP */}
        {useSeparate && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Token do ZAP de Cobrança</CardTitle>
              <CardDescription>Cole o token da API do número dedicado para cobranças.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex gap-2">
                <Input
                  placeholder="Cole o token aqui..."
                  value={tokenInput}
                  onChange={(e) => setTokenInput(e.target.value)}
                  className="font-mono text-sm"
                />
                <Button onClick={handleSaveToken} disabled={!tokenInput.trim()}>
                  Salvar
                </Button>
              </div>
              {settings?.billingWebhookToken && (
                <p className="text-xs text-muted-foreground">
                  Token salvo: <span className="font-mono">{settings.billingWebhookToken.slice(0, 8)}••••</span>
                </p>
              )}
            </CardContent>
          </Card>
        )}

        {/* Connection Card */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <QrCode className="h-5 w-5" />
              {useSeparate ? 'Conexão — ZAP Cobrança' : 'Conexão — Hub Principal'}
            </CardTitle>
            <CardDescription>
              {useSeparate
                ? 'Conecte o número de cobranças escaneando o QR Code.'
                : 'Usando o mesmo ZAP do Hub Principal para cobranças. O status abaixo é o do Hub Principal.'}
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            {renderConnectionArea()}
          </CardContent>
          {liveStatus?.status !== 'connected' && connectionState !== 'qr_code' && (
            <div className="p-6 border-t bg-muted/30">
              <Button
                className="w-full"
                size="lg"
                onClick={handleConnect}
                disabled={connectionState === 'connecting' || (useSeparate && !tokenInput.trim() && !settings?.billingWebhookToken)}
              >
                <Zap className="mr-2 h-4 w-4" />
                Conectar
              </Button>
            </div>
          )}
        </Card>

        {/* Info box */}
        {!useSeparate && (
          <div className="flex gap-3 p-4 rounded-lg bg-blue-50 border border-blue-200 text-blue-800 text-sm">
            <AlertCircle className="h-5 w-5 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold">Usando Hub Principal</p>
              <p className="text-blue-700 mt-0.5">
                Todas as mensagens de cobrança serão enviadas pelo mesmo número conectado no Hub Principal. Se quiser separar, clique em "Usar ZAP separado".
              </p>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
