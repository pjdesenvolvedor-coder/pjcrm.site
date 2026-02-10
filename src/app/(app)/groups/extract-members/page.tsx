'use client';

import { useState } from 'react';
import { collection, query, orderBy, doc } from 'firebase/firestore';
import { useFirebase, useUser, useDoc, useMemoFirebase, addDocumentNonBlocking, useCollection, deleteDocumentNonBlocking } from '@/firebase';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Users, RefreshCw, Copy, Trash2, ChevronDown, ChevronUp } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import type { Settings, ExtractedGroup } from '@/lib/types';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';


interface ExtractionResult {
  groupName: string;
  participantCount: string;
  adminPhones: string[];
  memberPhones: string[];
}

export default function ExtractMembersPage() {
  const { toast } = useToast();
  const { firestore, user } = useFirebase();
  const [jid, setJid] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [currentExtraction, setCurrentExtraction] = useState<ExtractionResult | null>(null);

  const settingsDocRef = useMemoFirebase(() => {
    if (!user) return null;
    return doc(firestore, 'users', user.uid, 'settings', 'config');
  }, [firestore, user]);

  const { data: settings } = useDoc<Settings>(settingsDocRef);
  
  const savedGroupsQuery = useMemoFirebase(() => {
    if (!user) return null;
    return query(collection(firestore, 'users', user.uid, 'extracted_groups'), orderBy('groupName'));
  }, [firestore, user]);

  const { data: savedGroups, isLoading: isLoadingGroups } = useCollection<ExtractedGroup>(savedGroupsQuery);

  const handleExtractMembers = async () => {
    if (!jid.trim()) {
      toast({ variant: 'destructive', title: 'JID Inválido', description: 'Por favor, insira o JID do grupo.' });
      return;
    }

    if (!settings?.webhookToken) {
      toast({ variant: 'destructive', title: 'Token não configurado', description: 'Por favor, configure seu token de webhook na página de Configurações.' });
      return;
    }

    setIsSending(true);

    try {
      const response = await fetch('https://n8nbeta.typeflow.app.br/webhook/2cf1d5c0-d83a-4374-9205-d3259cf6cc10', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jid: jid, token: settings.webhookToken }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Falha no webhook: ${errorText}`);
      }
      
      const data = await response.json();
      
      const adminPhones = data.telefoneadmns ? data.telefoneadmns.split(',').map((p: string) => p.trim()).filter(Boolean) : [];
      const memberPhones = data.telefones ? data.telefones.split(',').map((p: string) => p.trim()).filter(Boolean) : [];

      if (data.nomegrupo && data.quantidadedeparticipantes) {
        setCurrentExtraction({
            groupName: data.nomegrupo,
            participantCount: data.quantidadedeparticipantes,
            adminPhones,
            memberPhones,
        });
        toast({ title: 'Extração Concluída!', description: `Encontrados ${data.quantidadedeparticipantes} participantes.` });
        setJid('');
      } else {
        throw new Error('A resposta do webhook não continha os dados esperados.');
      }

    } catch (error: any) {
      console.error('Webhook error:', error);
      toast({ variant: 'destructive', title: 'Erro no Envio', description: error.message || 'Não foi possível se comunicar com o webhook.' });
    } finally {
      setIsSending(false);
    }
  };
  
  const handleSaveExtraction = () => {
    if (!currentExtraction || !user) return;
    addDocumentNonBlocking(collection(firestore, 'users', user.uid, 'extracted_groups'), {
      userId: user.uid,
      ...currentExtraction,
    });
    toast({ title: 'Grupo Salvo!', description: `${currentExtraction.groupName} foi salvo na sua lista.` });
    setCurrentExtraction(null);
  };
  
  const handleDeleteSavedGroup = (groupId: string) => {
    if (!user) return;
    const docRef = doc(firestore, 'users', user.uid, 'extracted_groups', groupId);
    deleteDocumentNonBlocking(docRef);
    toast({ title: 'Grupo Removido', description: 'O grupo foi removido da sua lista.' });
  };

  const handleCopyAll = (phones: string[]) => {
    if (!phones || phones.length === 0) return;
    const textToCopy = phones.map(p => p.replace('@s.whatsapp.net', '')).join('\n');
    navigator.clipboard.writeText(textToCopy);
    toast({ title: 'Copiado!', description: 'Os números foram copiados para a área de transferência.' });
  };

  const handleReset = () => {
    setCurrentExtraction(null);
    setJid('');
  };

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title="Extrair Membros do Grupo"
        description="Receba uma lista com todos os membros de um grupo do WhatsApp."
      />
      <main className="flex-1 overflow-auto p-4 md:p-6 space-y-6">
        <div className="w-full max-w-4xl mx-auto">
            {!currentExtraction ? (
                <Card>
                  <CardHeader>
                    <CardTitle>Extrair Membros</CardTitle>
                    <CardDescription>
                      Insira o JID do grupo para iniciar a extração. O resultado será exibido abaixo.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="group-jid">JID do Grupo</Label>
                      <Input id="group-jid" placeholder="Cole o JID do grupo aqui..." value={jid} onChange={(e) => setJid(e.target.value)} disabled={isSending} />
                    </div>
                  </CardContent>
                  <CardFooter>
                    <Button onClick={handleExtractMembers} disabled={isSending}>
                       {isSending ? <><RefreshCw className="mr-2 h-4 w-4 animate-spin" />Extraindo...</> : <><Users className="mr-2 h-4 w-4" />Extrair Membros</>}
                    </Button>
                  </CardFooter>
                </Card>
            ) : (
                <Card>
                    <CardHeader>
                        <CardTitle>Resultados da Extração: {currentExtraction.groupName}</CardTitle>
                        <CardDescription>
                            Total de {currentExtraction.participantCount} participantes encontrados.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="grid md:grid-cols-2 gap-4">
                        <div>
                            <div className="flex justify-between items-center mb-2">
                                <h3 className="font-semibold">Administradores ({currentExtraction.adminPhones.length})</h3>
                                <Button variant="ghost" size="sm" onClick={() => handleCopyAll(currentExtraction.adminPhones)}><Copy className="mr-2 h-4 w-4" />Copiar</Button>
                            </div>
                            <ScrollArea className="h-48 w-full rounded-md border">
                                <div className="p-4 text-sm font-mono">{currentExtraction.adminPhones.map((p, i) => <p key={i} className="p-1">{p.replace('@s.whatsapp.net', '')}</p>)}</div>
                            </ScrollArea>
                        </div>
                        <div>
                            <div className="flex justify-between items-center mb-2">
                                <h3 className="font-semibold">Membros ({currentExtraction.memberPhones.length})</h3>
                                <Button variant="ghost" size="sm" onClick={() => handleCopyAll(currentExtraction.memberPhones)}><Copy className="mr-2 h-4 w-4" />Copiar</Button>
                            </div>
                            <ScrollArea className="h-48 w-full rounded-md border">
                                <div className="p-4 text-sm font-mono">{currentExtraction.memberPhones.map((p, i) => <p key={i} className="p-1">{p.replace('@s.whatsapp.net', '')}</p>)}</div>
                            </ScrollArea>
                        </div>
                    </CardContent>
                    <CardFooter className="justify-between">
                        <Button variant="outline" onClick={handleReset}><RefreshCw className="mr-2 h-4 w-4" />Nova Extração</Button>
                        <Button onClick={handleSaveExtraction}>Salvar Grupo</Button>
                    </CardFooter>
                </Card>
            )}
        </div>
        <div className="w-full max-w-4xl mx-auto">
            <Card>
                <CardHeader>
                    <CardTitle>Grupos Salvos</CardTitle>
                    <CardDescription>Lista de grupos que você já extraiu e salvou.</CardDescription>
                </CardHeader>
                <CardContent>
                    {isLoadingGroups ? <p>Carregando grupos salvos...</p> : (
                        <Accordion type="single" collapsible className="w-full">
                            {savedGroups?.map(group => (
                                <AccordionItem value={group.id} key={group.id}>
                                    <AccordionTrigger className="hover:no-underline">
                                        <div className="flex justify-between items-center w-full pr-4">
                                            <div className='text-left'>
                                                <p className="font-semibold">{group.groupName}</p>
                                                <p className="text-sm text-muted-foreground">{group.participantCount} participantes</p>
                                            </div>
                                            <AlertDialog>
                                                <AlertDialogTrigger asChild>
                                                    <Button variant="ghost" size="icon" onClick={(e) => e.stopPropagation()}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                                                </AlertDialogTrigger>
                                                <AlertDialogContent>
                                                    <AlertDialogHeader>
                                                        <AlertDialogTitle>Tem certeza?</AlertDialogTitle>
                                                        <AlertDialogDescription>Esta ação removerá o grupo da sua lista de salvos. Não pode ser desfeito.</AlertDialogDescription>
                                                    </AlertDialogHeader>
                                                    <AlertDialogFooter>
                                                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                                        <AlertDialogAction onClick={() => handleDeleteSavedGroup(group.id)}>Excluir</AlertDialogAction>
                                                    </AlertDialogFooter>
                                                </AlertDialogContent>
                                            </AlertDialog>
                                        </div>
                                    </AccordionTrigger>
                                    <AccordionContent>
                                        <div className="grid md:grid-cols-2 gap-4 pt-2">
                                            <div>
                                                <h3 className="font-semibold mb-2">Administradores ({group.adminPhones.length})</h3>
                                                <ScrollArea className="h-40 w-full rounded-md border"><div className="p-4 text-sm font-mono">{group.adminPhones.map((p, i) => <p key={i} className="p-1">{p.replace('@s.whatsapp.net', '')}</p>)}</div></ScrollArea>
                                            </div>
                                            <div>
                                                <h3 className="font-semibold mb-2">Membros ({group.memberPhones.length})</h3>
                                                <ScrollArea className="h-40 w-full rounded-md border"><div className="p-4 text-sm font-mono">{group.memberPhones.map((p, i) => <p key={i} className="p-1">{p.replace('@s.whatsapp.net', '')}</p>)}</div></ScrollArea>
                                            </div>
                                        </div>
                                    </AccordionContent>
                                </AccordionItem>
                            ))}
                             {savedGroups?.length === 0 && <p className="text-center text-muted-foreground py-4">Nenhum grupo salvo ainda.</p>}
                        </Accordion>
                    )}
                </CardContent>
            </Card>
        </div>
      </main>
    </div>
  );
}
