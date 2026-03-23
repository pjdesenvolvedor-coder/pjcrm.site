'use client';

import { useState, useEffect } from 'react';
import { useFirebase, useUser, useDoc, useMemoFirebase, setDocumentNonBlocking } from '@/firebase';
import { doc } from 'firebase/firestore';
import { PageHeader } from '@/components/page-header';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import type { Settings } from '@/lib/types';
import { Loader2, Package, Copy } from 'lucide-react';

export default function ZapVendasSettingsPage() {
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
        if (settings?.zapVendasToken) {
            setTokenInput(settings.zapVendasToken);
        }
    }, [settings]);

    const handleSaveToken = () => {
        if (!user || !tokenInput.trim()) {
            toast({ variant: 'destructive', title: 'Token inválido', description: 'O token não pode estar vazio.' });
            return;
        }
        setIsSaving(true);
        const settingsRef = doc(firestore, 'users', user.uid, 'settings', 'config');
        
        setDocumentNonBlocking(settingsRef, { zapVendasToken: tokenInput.trim() }, { merge: true });
        
        toast({ title: 'Token Salvo!', description: 'O token do Zap Vendas foi definido para sua conta.' });
        setIsSaving(false);
    };
    
    return (
        <div className="flex flex-col h-full">
            <PageHeader title="Configurações Zap Vendas" description="Gerencie as configurações exclusivas do módulo de vendas." />
            <main className="flex-1 overflow-auto p-4 md:p-6 space-y-6 max-w-4xl mx-auto w-full">
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2"><Package/> Token de Conexão</CardTitle>
                        <CardDescription>Defina ou atualize o token da Evolution API que será usado APENAS para o Zap Vendas.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-2">
                        <Label htmlFor="vendas-token">Token Zap Vendas</Label>
                        <div className="flex items-center gap-2">
                            <Input
                                id="vendas-token"
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
                            {isLoading ? 'Carregando...' : isSaving ? 'Salvando...' : 'Salvar Token'}
                        </Button>
                    </CardFooter>
                </Card>
            </main>
        </div>
    );
}
