'use client';

import { useState, useMemo, useEffect, useRef } from 'react';
import { PageHeader } from '@/components/page-header';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { useFirebase, useCollection, setDocumentNonBlocking, useDoc, useMemoFirebase } from '@/firebase';
import { collection, doc } from 'firebase/firestore';
import type { Client, Settings } from '@/lib/types';
import { Loader2, Play, CheckCircle2, AlertTriangle, SaveAll } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { ScrollArea } from '@/components/ui/scroll-area';

export default function SaveContactsPage() {
    const { firestore, effectiveUserId } = useFirebase();
    const { toast } = useToast();

    const clientsQuery = useMemoFirebase(() => (effectiveUserId ? collection(firestore, 'users', effectiveUserId, 'clients') : null), [firestore, effectiveUserId]);
    const { data: clients, isLoading: isLoadingClients } = useCollection<Client>(clientsQuery);

    const settingsDocRef = useMemoFirebase(() => (effectiveUserId ? doc(firestore, 'users', effectiveUserId, 'settings', 'config') : null), [firestore, effectiveUserId]);
    const { data: settings, isLoading: isLoadingSettings } = useDoc<Settings>(settingsDocRef);

    const [delaySeconds, setDelaySeconds] = useState('3');
    const [isExporting, setIsExporting] = useState(false);
    const [progress, setProgress] = useState(0);
    const [logs, setLogs] = useState<{message: string, type: 'info'|'success'|'error', time: string}[]>([]);
    
    // Create unique groups by name and phone
    const pendingGroups = useMemo(() => {
        if (!clients) return [];
        const pending = clients.filter(c => !c.n8nExported);
        
        const groups = new Map<string, Client[]>();
        pending.forEach(c => {
            const nameKey = (c.name || '').trim().toLowerCase();
            const phoneKey = (c.phone || '').trim();
            const key = `${nameKey}|${phoneKey}`;
            
            if (!groups.has(key)) {
                groups.set(key, []);
            }
            groups.get(key)!.push(c);
        });
        
        return Array.from(groups.values());
    }, [clients]);

    const addLog = (message: string, type: 'info'|'success'|'error' = 'info') => {
        setLogs(prev => [{
            message,
            type,
            time: new Date().toLocaleTimeString()
        }, ...prev]);
    };

    const isCancelledRef = useRef(false);

    const startExport = async () => {
        if (!settings?.webhookToken) {
            toast({
                variant: 'destructive',
                title: 'Erro',
                description: 'Token de webhook não configurado nas configurações gerais.',
            });
            return;
        }

        const delayMs = parseFloat(delaySeconds) * 1000;
        if (isNaN(delayMs) || delayMs < 0) {
            toast({
                variant: 'destructive',
                title: 'Erro',
                description: 'Intervalo inválido. Defina um número válido de segundos.',
            });
            return;
        }

        if (pendingGroups.length === 0) {
            toast({
                title: 'Atenção',
                description: 'Não há contatos pendentes para enviar.',
            });
            return;
        }

        setIsExporting(true);
        isCancelledRef.current = false;
        setProgress(0);
        setLogs([]);
        addLog(`Iniciando envio de ${pendingGroups.length} contatos únicos...`);

        const totalItems = pendingGroups.length;

        for (let i = 0; i < totalItems; i++) {
            if (isCancelledRef.current) {
                addLog('Envio cancelado pelo usuário.', 'info');
                break;
            }

            const group = pendingGroups[i];
            const primaryClient = group[0];
            
            // Increment progress slightly before starting the request
            setProgress(Math.round(((i) / totalItems) * 100));
            addLog(`Enviando ${primaryClient.name} (${primaryClient.phone})...`);

            try {
                const response = await fetch('https://n8nbeta.typeflow.app.br/webhook/9719b2d6-7167-4615-8515-3cd67da869e7', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        nome: primaryClient.name,
                        numero: primaryClient.phone,
                        token: settings.webhookToken
                    })
                });

                if (response.ok) {
                    // Update all clients in this group as exported
                    for (const cl of group) {
                        const ref = doc(firestore, 'users', effectiveUserId!, 'clients', cl.id);
                        setDocumentNonBlocking(ref, { n8nExported: true }, { merge: true });
                    }
                    addLog(`Sucesso: ${primaryClient.name}`, 'success');
                } else {
                    addLog(`Falha na resposta: ${primaryClient.name} (Status: ${response.status})`, 'error');
                }
            } catch (error: any) {
                addLog(`Erro ao enviar ${primaryClient.name}: ${error.message}`, 'error');
            }

            setProgress(Math.round(((i + 1) / totalItems) * 100));

            // Apply delay if this is not the last item and wasn't cancelled
            if (i < totalItems - 1 && !isCancelledRef.current) {
                await new Promise(r => setTimeout(r, delayMs));
            }
        }

        if (!isCancelledRef.current) {
            setProgress(100);
            addLog('Exportação concluída com sucesso!', 'success');
        }
        setIsExporting(false);
    };

    const cancelExport = () => {
        isCancelledRef.current = true;
    };

    if (isLoadingClients || isLoadingSettings) {
        return (
            <div className="flex h-screen w-full items-center justify-center space-x-2">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
                <span className="text-muted-foreground font-medium">Carregando dados...</span>
            </div>
        );
    }

    return (
        <div className="flex-1 space-y-4 p-4 md:p-8 pt-6">
            <PageHeader title="Salvar Contatos" description="Exporte em lote os seus clientes para o webhook do n8n." />

            <div className="grid gap-4 md:grid-cols-2">
                <Card>
                    <CardHeader>
                        <CardTitle className="text-xl flex items-center gap-2">
                            <SaveAll className="h-5 w-5 text-primary" /> Configurador de Envio
                        </CardTitle>
                        <CardDescription>
                            Configure e inicie a importação dos seus contatos pendentes.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-6">
                        <div className="space-y-2">
                            <label className="text-sm font-medium">Intervalo de envio (Segundos)</label>
                            <Input 
                                type="number" 
                                min="0"
                                step="any"
                                value={delaySeconds} 
                                onChange={e => setDelaySeconds(e.target.value)} 
                                disabled={isExporting}
                            />
                            <p className="text-xs text-muted-foreground">Recomendamos pelo menos 3 segundos para evitar bloqueios ou sobrecarga (rate limits).</p>
                        </div>

                        <div className="p-4 bg-muted/50 rounded-lg border border-border flex items-start gap-3">
                            <AlertTriangle className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
                            <div className="text-sm">
                                <p className="font-semibold text-foreground">Deduplicação Inteligente</p>
                                <p className="text-muted-foreground mt-1">
                                    Encontramos <strong>{pendingGroups.length}</strong> contatos únicos aguardando envio (clientes com o mesmo nome e número contam apenas como 1 envio).
                                </p>
                            </div>
                        </div>

                        <div className="pt-2">
                            {isExporting ? (
                                <div className="space-y-4">
                                     <div className="flex items-center justify-between text-sm">
                                        <span className="font-medium text-muted-foreground">Progresso</span>
                                        <span className="font-bold">{progress}%</span>
                                    </div>
                                    <Progress value={progress} className="h-3" />
                                    <Button variant="destructive" className="w-full" onClick={cancelExport}>
                                        Cancelar Envio
                                    </Button>
                                </div>
                            ) : (
                                <Button className="w-full" size="lg" onClick={startExport} disabled={pendingGroups.length === 0}>
                                    <Play className="h-4 w-4 mr-2" /> Iniciar Envio
                                </Button>
                            )}
                        </div>
                    </CardContent>
                </Card>

                <Card className="flex flex-col">
                    <CardHeader className="pb-3 border-b border-border/50">
                        <CardTitle className="text-lg">Logs de Execução</CardTitle>
                    </CardHeader>
                    <CardContent className="p-0 flex-1">
                        <ScrollArea className="h-[400px] w-full border-b-0 rounded-b-xl overflow-hidden bg-muted/20">
                            <div className="p-4 space-y-3">
                                {logs.length === 0 ? (
                                    <p className="text-sm text-center text-muted-foreground italic py-8">Nenhum log registrado ainda.</p>
                                ) : (
                                    logs.map((log, index) => (
                                        <div key={index} className="flex gap-2 text-sm items-start">
                                            <span className="text-xs text-muted-foreground mt-0.5 whitespace-nowrap">[{log.time}]</span>
                                            {log.type === 'info' && <span className="text-blue-500 font-medium">{log.message}</span>}
                                            {log.type === 'success' && <div className="flex items-start gap-1 text-emerald-600"><CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0" /> <span className="font-medium">{log.message}</span></div>}
                                            {log.type === 'error' && <div className="flex items-start gap-1 text-destructive"><AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" /> <span className="font-medium">{log.message}</span></div>}
                                        </div>
                                    ))
                                )}
                            </div>
                        </ScrollArea>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
