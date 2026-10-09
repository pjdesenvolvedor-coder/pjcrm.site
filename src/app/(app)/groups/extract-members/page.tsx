'use client';

import { useState, useEffect, useMemo, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { collection, query, orderBy, doc } from 'firebase/firestore';
import { useFirebase, useUser, useDoc, useMemoFirebase, addDocumentNonBlocking, useCollection, deleteDocumentNonBlocking } from '@/firebase';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Users, RefreshCw, Copy, Trash2, Download, CheckCircle2, ChevronRight, Search, X } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import type { Settings, ExtractedGroup } from '@/lib/types';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';

interface ExtractionResult {
  groupName: string;
  participantCount: string;
  adminPhones: string[];
  memberPhones: string[];
  groupJid?: string;
}

interface ListedGroup {
  jid: string;
  name: string;
  participantCount: number;
}

function ExtractMembersContent() {
  const { toast } = useToast();
  const searchParams = useSearchParams();
  const initialJid = searchParams.get('jid') || '';

  const { firestore, user, effectiveUserId } = useFirebase();
  const targetUserId = effectiveUserId || user?.uid || '';
  const [jid, setJid] = useState(initialJid);
  const [isSending, setIsSending] = useState(false);
  const [currentExtraction, setCurrentExtraction] = useState<ExtractionResult | null>(null);

  const [isLoadingMyGroups, setIsLoadingMyGroups] = useState(false);
  const [myGroups, setMyGroups] = useState<ListedGroup[] | null>(null);
  const [groupSearchQuery, setGroupSearchQuery] = useState('');

  useEffect(() => {
    if (initialJid && !jid) {
      setJid(initialJid);
    }
  }, [initialJid, jid]);

  const settingsDocRef = useMemoFirebase(() => {
    if (!targetUserId) return null;
    return doc(firestore, 'users', targetUserId, 'settings', 'config');
  }, [firestore, targetUserId]);

  const { data: settings } = useDoc<Settings>(settingsDocRef);
  
  const savedGroupsQuery = useMemoFirebase(() => {
    if (!targetUserId) return null;
    return query(collection(firestore, 'users', targetUserId, 'extracted_groups'), orderBy('groupName'));
  }, [firestore, targetUserId]);

  const { data: savedGroups, isLoading: isLoadingGroups } = useCollection<ExtractedGroup>(savedGroupsQuery);

  const handleExtractMembers = async (targetJid?: string) => {
    const inputJid = (targetJid || jid).trim();

    if (!inputJid) {
      toast({ variant: 'destructive', title: 'JID Inválido', description: 'Por favor, insira o JID ou link do grupo.' });
      return;
    }

    if (!settings?.webhookToken) {
      toast({ variant: 'destructive', title: 'Token não configurado', description: 'Por favor, conecte seu WhatsApp nas Configurações.' });
      return;
    }

    setIsSending(true);

    try {
      const response = await fetch('/api/groups/extract-members', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jid: inputJid,
          token: settings.webhookToken,
        }),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Falha ao extrair membros na UazAPI.');
      }
      
      const adminPhones: string[] = Array.isArray(data.adminPhones)
        ? data.adminPhones
        : (data.telefoneadmns ? data.telefoneadmns.split(',').map((p: string) => p.trim()).filter(Boolean) : []);

      const memberPhones: string[] = Array.isArray(data.memberPhones)
        ? data.memberPhones
        : (data.telefones ? data.telefones.split(',').map((p: string) => p.trim()).filter(Boolean) : []);

      if (data.nomegrupo) {
        setCurrentExtraction({
          groupName: data.nomegrupo,
          participantCount: String(data.quantidadedeparticipantes || (adminPhones.length + memberPhones.length)),
          adminPhones,
          memberPhones,
          groupJid: data.groupJid || inputJid,
        });
        toast({
          title: 'Extração Concluída!',
          description: `${data.nomegrupo}: ${data.quantidadedeparticipantes} participantes extraídos com sucesso.`,
        });
      } else {
        throw new Error('A resposta da UazAPI não continha os dados esperados.');
      }
    } catch (error: any) {
      console.error('Extract members error:', error);
      toast({ variant: 'destructive', title: 'Erro na Extração', description: error.message || 'Não foi possível extrair os membros via UazAPI.' });
    } finally {
      setIsSending(false);
    }
  };

  const handleFetchMyGroups = async () => {
    if (!settings?.webhookToken) {
      toast({
        variant: 'destructive',
        title: 'WhatsApp não conectado',
        description: 'Conecte seu WhatsApp para listar os grupos da sua conta.',
      });
      return;
    }

    setIsLoadingMyGroups(true);
    try {
      const response = await fetch('/api/groups/list', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: settings.webhookToken }),
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Falha ao buscar grupos conectados.');
      }

      setMyGroups(data.groups || []);
      toast({
        title: 'Grupos Carregados',
        description: `${data.groups?.length || 0} grupos encontrados no WhatsApp conectado.`,
      });
    } catch (err: any) {
      console.error('Error fetching groups list:', err);
      toast({
        variant: 'destructive',
        title: 'Erro ao listar grupos',
        description: err.message || 'Não foi possível carregar os grupos.',
      });
    } finally {
      setIsLoadingMyGroups(false);
    }
  };

  const filteredMyGroups = useMemo(() => {
    if (!myGroups) return [];
    if (!groupSearchQuery.trim()) return myGroups;
    const term = groupSearchQuery.toLowerCase().trim();
    return myGroups.filter(g => 
      g.name.toLowerCase().includes(term) || 
      g.jid.toLowerCase().includes(term)
    );
  }, [myGroups, groupSearchQuery]);
  
  const handleSaveExtraction = () => {
    if (!currentExtraction || !targetUserId) return;
    addDocumentNonBlocking(collection(firestore, 'users', targetUserId, 'extracted_groups'), {
      userId: targetUserId,
      ...currentExtraction,
    });
    toast({ title: 'Grupo Salvo!', description: `${currentExtraction.groupName} foi salvo na sua lista de grupos.` });
  };
  
  const handleDeleteSavedGroup = (groupId: string) => {
    if (!targetUserId) return;
    const docRef = doc(firestore, 'users', targetUserId, 'extracted_groups', groupId);
    deleteDocumentNonBlocking(docRef);
    toast({ title: 'Grupo Removido', description: 'O grupo foi removido da sua lista.' });
  };

  const handleCopyAll = (phones: string[], label = 'números') => {
    if (!phones || phones.length === 0) {
      toast({ variant: 'destructive', title: 'Nenhum contato', description: 'Não há contatos nesta lista para copiar.' });
      return;
    }
    const textToCopy = phones.map(p => p.replace('@s.whatsapp.net', '').replace(/\D/g, '')).filter(Boolean).join('\n');
    navigator.clipboard.writeText(textToCopy);
    toast({ title: 'Copiado!', description: `${phones.length} ${label} copiados para a área de transferência.` });
  };

  const handleDownloadTxt = (phones: string[], filename: string) => {
    if (!phones || phones.length === 0) return;
    const text = phones.map(p => p.replace('@s.whatsapp.net', '').replace(/\D/g, '')).filter(Boolean).join('\n');
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${filename}.txt`;
    link.click();
    URL.revokeObjectURL(url);
    toast({ title: 'Download Concluído', description: `Arquivo ${filename}.txt gerado com sucesso.` });
  };

  const handleReset = () => {
    setCurrentExtraction(null);
    setJid('');
  };

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title="Extrair Membros do Grupo (Leads)"
        description="Extraia administradores e membros participantes de qualquer grupo do WhatsApp diretamente pela UazAPI."
      />
      <main className="flex-1 overflow-auto p-4 md:p-6 space-y-6">
        <div className="w-full max-w-4xl mx-auto space-y-6">
          {!currentExtraction ? (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Users className="h-5 w-5 text-primary" />
                  Iniciar Extração de Membros
                </CardTitle>
                <CardDescription>
                  Insira o JID do grupo (ex: 120363153742561022@g.us) ou cole o link de convite.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="group-jid">JID ou Link de Convite do Grupo</Label>
                  <Input
                    id="group-jid"
                    placeholder="Cole o JID ou link do grupo aqui..."
                    value={jid}
                    onChange={(e) => setJid(e.target.value)}
                    disabled={isSending}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleExtractMembers();
                      }
                    }}
                  />
                </div>

                {/* Seletor rápido de grupos da conta com pesquisa */}
                <div className="pt-2">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-semibold text-muted-foreground uppercase">
                      Ou escolha um grupo da sua conta conectada:
                    </span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={handleFetchMyGroups}
                      disabled={isLoadingMyGroups}
                      className="text-xs h-7 gap-1"
                    >
                      <RefreshCw className={`h-3 w-3 ${isLoadingMyGroups ? 'animate-spin' : ''}`} />
                      {myGroups ? 'Atualizar Lista' : 'Carregar Grupos Conectados'}
                    </Button>
                  </div>

                  {myGroups && (
                    <div className="space-y-2 border rounded-md p-2.5 bg-muted/20">
                      {/* Campo de Busca Rápida de Grupos */}
                      <div className="relative">
                        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
                        <Input
                          placeholder="Pesquisar grupo por nome ou JID..."
                          value={groupSearchQuery}
                          onChange={(e) => setGroupSearchQuery(e.target.value)}
                          className="h-8 pl-8 pr-7 text-xs bg-card"
                        />
                        {groupSearchQuery && (
                          <button
                            type="button"
                            onClick={() => setGroupSearchQuery('')}
                            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>

                      {filteredMyGroups.length > 0 && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-48 overflow-y-auto pt-1">
                          {filteredMyGroups.map((g) => (
                            <button
                              key={g.jid}
                              type="button"
                              onClick={() => {
                                setJid(g.jid);
                                handleExtractMembers(g.jid);
                              }}
                              className="flex items-center justify-between p-2 rounded text-left border bg-card hover:bg-muted/80 transition-colors text-xs"
                            >
                              <div className="min-w-0 flex-1 pr-2">
                                <div className="font-semibold truncate">{g.name}</div>
                                <div className="text-[10px] text-muted-foreground font-mono truncate">{g.jid}</div>
                              </div>
                              <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                            </button>
                          ))}
                        </div>
                      )}

                      {filteredMyGroups.length === 0 && myGroups.length > 0 && (
                        <p className="text-xs text-muted-foreground text-center py-3 italic">
                          Nenhum grupo encontrado com o termo "{groupSearchQuery}".
                        </p>
                      )}
                    </div>
                  )}
                </div>
              </CardContent>
              <CardFooter>
                <Button onClick={() => handleExtractMembers()} disabled={isSending} className="w-full sm:w-auto">
                  {isSending ? (
                    <>
                      <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                      Extraindo contatos na UazAPI...
                    </>
                  ) : (
                    <>
                      <Users className="mr-2 h-4 w-4" />
                      Extrair Membros
                    </>
                  )}
                </Button>
              </CardFooter>
            </Card>
          ) : (
            <Card className="border-primary/30">
              <CardHeader className="bg-primary/5 pb-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <CardTitle className="text-lg flex items-center gap-2">
                      <CheckCircle2 className="h-5 w-5 text-green-600" />
                      {currentExtraction.groupName}
                    </CardTitle>
                    <CardDescription className="text-xs font-mono mt-1">
                      {currentExtraction.groupJid || jid}
                    </CardDescription>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-xs bg-card">
                      {currentExtraction.participantCount} Participantes
                    </Badge>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="grid md:grid-cols-2 gap-4 pt-4">
                {/* Administradores */}
                <div className="border rounded-lg p-3 bg-card">
                  <div className="flex justify-between items-center mb-2 pb-2 border-b">
                    <div>
                      <h3 className="font-semibold text-sm">Administradores</h3>
                      <p className="text-xs text-muted-foreground">({currentExtraction.adminPhones.length} encontrados)</p>
                    </div>
                    <div className="flex gap-1">
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 px-2 text-xs"
                        onClick={() => handleCopyAll(currentExtraction.adminPhones, 'administradores')}
                      >
                        <Copy className="mr-1 h-3.5 w-3.5" />
                        Copiar
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 px-2 text-xs"
                        onClick={() => handleDownloadTxt(currentExtraction.adminPhones, `admins_${currentExtraction.groupName}`)}
                        title="Baixar TXT"
                      >
                        <Download className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                  <ScrollArea className="h-52 w-full rounded-md border bg-muted/10">
                    <div className="p-3 text-xs font-mono space-y-1">
                      {currentExtraction.adminPhones.map((p, i) => (
                        <p key={i} className="p-1 hover:bg-muted/40 rounded">{p}</p>
                      ))}
                      {currentExtraction.adminPhones.length === 0 && (
                        <p className="text-muted-foreground italic text-center py-4">Nenhum administrador listado.</p>
                      )}
                    </div>
                  </ScrollArea>
                </div>

                {/* Membros */}
                <div className="border rounded-lg p-3 bg-card">
                  <div className="flex justify-between items-center mb-2 pb-2 border-b">
                    <div>
                      <h3 className="font-semibold text-sm">Membros / Participantes</h3>
                      <p className="text-xs text-muted-foreground">({currentExtraction.memberPhones.length} encontrados)</p>
                    </div>
                    <div className="flex gap-1">
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 px-2 text-xs"
                        onClick={() => handleCopyAll(currentExtraction.memberPhones, 'membros')}
                      >
                        <Copy className="mr-1 h-3.5 w-3.5" />
                        Copiar
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 px-2 text-xs"
                        onClick={() => handleDownloadTxt(currentExtraction.memberPhones, `membros_${currentExtraction.groupName}`)}
                        title="Baixar TXT"
                      >
                        <Download className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                  <ScrollArea className="h-52 w-full rounded-md border bg-muted/10">
                    <div className="p-3 text-xs font-mono space-y-1">
                      {currentExtraction.memberPhones.map((p, i) => (
                        <p key={i} className="p-1 hover:bg-muted/40 rounded">{p}</p>
                      ))}
                      {currentExtraction.memberPhones.length === 0 && (
                        <p className="text-muted-foreground italic text-center py-4">Nenhum participante extraído.</p>
                      )}
                    </div>
                  </ScrollArea>
                </div>
              </CardContent>
              <CardFooter className="flex flex-wrap items-center justify-between gap-2 border-t pt-4 bg-muted/10">
                <Button variant="outline" size="sm" onClick={handleReset}>
                  <RefreshCw className="mr-2 h-4 w-4" />
                  Nova Extração
                </Button>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleCopyAll([...currentExtraction.adminPhones, ...currentExtraction.memberPhones], 'todos os contatos')}
                  >
                    <Copy className="mr-2 h-4 w-4" />
                    Copiar Todos ({currentExtraction.adminPhones.length + currentExtraction.memberPhones.length})
                  </Button>
                  <Button size="sm" onClick={handleSaveExtraction}>
                    Salvar na Lista
                  </Button>
                </div>
              </CardFooter>
            </Card>
          )}

          {/* Grupos Salvos */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Grupos Extraídos Salvos</CardTitle>
              <CardDescription className="text-xs">
                Histórico de grupos que você já extraiu e salvou no sistema.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {isLoadingGroups ? (
                <div className="flex items-center justify-center py-8 text-muted-foreground text-sm">
                  <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                  Carregando grupos salvos...
                </div>
              ) : (
                <Accordion type="single" collapsible className="w-full">
                  {savedGroups?.map((group) => (
                    <AccordionItem value={group.id} key={group.id}>
                      <AccordionTrigger className="hover:no-underline py-3">
                        <div className="flex justify-between items-center w-full pr-4 text-left">
                          <div>
                            <p className="font-semibold text-sm">{group.groupName}</p>
                            <p className="text-xs text-muted-foreground">{group.participantCount} participantes</p>
                          </div>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-destructive"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Remover grupo salvo?</AlertDialogTitle>
                                <AlertDialogDescription>
                                  Esta ação removerá este grupo da sua lista de salvos.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                <AlertDialogAction onClick={() => handleDeleteSavedGroup(group.id)}>
                                  Excluir
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
                      </AccordionTrigger>
                      <AccordionContent>
                        <div className="grid md:grid-cols-2 gap-4 pt-2">
                          <div>
                            <div className="flex justify-between items-center mb-2">
                              <h4 className="font-semibold text-xs">Admins ({group.adminPhones?.length || 0})</h4>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 text-xs px-2"
                                onClick={() => handleCopyAll(group.adminPhones, 'administradores')}
                              >
                                <Copy className="mr-1 h-3 w-3" />
                                Copiar
                              </Button>
                            </div>
                            <ScrollArea className="h-40 w-full rounded-md border">
                              <div className="p-3 text-xs font-mono space-y-1">
                                {group.adminPhones?.map((p, i) => (
                                  <p key={i} className="p-0.5">{p.replace('@s.whatsapp.net', '')}</p>
                                ))}
                              </div>
                            </ScrollArea>
                          </div>
                          <div>
                            <div className="flex justify-between items-center mb-2">
                              <h4 className="font-semibold text-xs">Membros ({group.memberPhones?.length || 0})</h4>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 text-xs px-2"
                                onClick={() => handleCopyAll(group.memberPhones, 'membros')}
                              >
                                <Copy className="mr-1 h-3 w-3" />
                                Copiar
                              </Button>
                            </div>
                            <ScrollArea className="h-40 w-full rounded-md border">
                              <div className="p-3 text-xs font-mono space-y-1">
                                {group.memberPhones?.map((p, i) => (
                                  <p key={i} className="p-0.5">{p.replace('@s.whatsapp.net', '')}</p>
                                ))}
                              </div>
                            </ScrollArea>
                          </div>
                        </div>
                      </AccordionContent>
                    </AccordionItem>
                  ))}
                  {savedGroups?.length === 0 && (
                    <p className="text-center text-muted-foreground py-6 text-sm">
                      Nenhum grupo salvo ainda. Realize uma extração acima e clique em "Salvar na Lista".
                    </p>
                  )}
                </Accordion>
              )}
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}

export default function ExtractMembersPage() {
  return (
    <Suspense fallback={<div className="p-6 text-muted-foreground">Carregando extração de membros...</div>}>
      <ExtractMembersContent />
    </Suspense>
  );
}
