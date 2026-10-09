'use client';

import { useState, useMemo } from 'react';
import { doc } from 'firebase/firestore';
import { useFirebase, useUser, useDoc, useMemoFirebase } from '@/firebase';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Send, RefreshCw, Copy, Users, Calendar, ArrowRight, MessageSquare, Search, X } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import type { Settings } from '@/lib/types';
import { Badge } from '@/components/ui/badge';
import Link from 'next/link';

interface GroupResult {
  jid: string;
  name?: string;
  topic?: string;
  participantCount?: number;
}

interface ListedGroup {
  jid: string;
  name: string;
  participantCount: number;
}

export default function GetJidPage() {
  const { toast } = useToast();
  const { firestore, user } = useFirebase();
  const [groupCode, setGroupCode] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [result, setResult] = useState<GroupResult | null>(null);

  const [isLoadingMyGroups, setIsLoadingMyGroups] = useState(false);
  const [myGroups, setMyGroups] = useState<ListedGroup[] | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  const settingsDocRef = useMemoFirebase(() => {
    if (!user) return null;
    return doc(firestore, 'users', user.uid, 'settings', 'config');
  }, [firestore, user]);

  const { data: settings } = useDoc<Settings>(settingsDocRef);

  const handleCopyJid = (jidToCopy: string) => {
    if (!jidToCopy) return;
    navigator.clipboard.writeText(jidToCopy).then(() => {
      toast({
        title: 'Copiado!',
        description: 'O JID foi copiado para a área de transferência.',
      });
    }).catch(err => {
      console.error('Failed to copy JID:', err);
      toast({
        variant: 'destructive',
        title: 'Falha ao copiar',
        description: 'Não foi possível copiar o JID.',
      });
    });
  };

  const handleGetGroupCode = async () => {
    if (!groupCode.trim()) {
      toast({
        variant: 'destructive',
        title: 'Código Inválido',
        description: 'Por favor, insira o link ou código de convite do grupo.',
      });
      return;
    }

    if (!settings?.webhookToken) {
      toast({
        variant: 'destructive',
        title: 'Token não configurado',
        description: 'Por favor, conecte seu WhatsApp ou configure seu token nas Configurações.',
      });
      return;
    }

    setIsSending(true);
    setResult(null);

    try {
      const response = await fetch('/api/groups/get-jid', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          groupCode: groupCode.trim(),
          token: settings.webhookToken,
        }),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Falha ao obter JID do grupo na UazAPI.');
      }

      if (data.jid) {
        setResult({
          jid: data.jid,
          name: data.name,
          topic: data.topic,
          participantCount: data.participantCount,
        });
        toast({
          title: 'JID Obtido com Sucesso!',
          description: data.name ? `Grupo: ${data.name}` : `JID: ${data.jid}`,
        });
      } else {
        throw new Error('A UazAPI não retornou um JID válido.');
      }

      setGroupCode('');
    } catch (error: any) {
      console.error('Get JID error:', error);
      toast({
        variant: 'destructive',
        title: 'Erro ao consultar grupo',
        description: error.message || 'Não foi possível consultar as informações do grupo.',
      });
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
        body: JSON.stringify({
          token: settings.webhookToken,
        }),
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
      console.error('Error fetching my groups:', err);
      toast({
        variant: 'destructive',
        title: 'Erro ao carregar grupos',
        description: err.message || 'Não foi possível listar os grupos da sua conta.',
      });
    } finally {
      setIsLoadingMyGroups(false);
    }
  };

  const filteredMyGroups = useMemo(() => {
    if (!myGroups) return [];
    if (!searchTerm.trim()) return myGroups;
    const term = searchTerm.toLowerCase().trim();
    return myGroups.filter(g => 
      g.name.toLowerCase().includes(term) || 
      g.jid.toLowerCase().includes(term)
    );
  }, [myGroups, searchTerm]);

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title="Obter JID do Grupo"
        description="Consulte o JID de qualquer grupo via link de convite ou liste e pesquise os grupos do seu WhatsApp conectado."
      />
      <main className="flex-1 overflow-auto p-4 md:p-6 space-y-6">
        <div className="w-full max-w-3xl mx-auto space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MessageSquare className="h-5 w-5 text-primary" />
                Consultar JID por Link de Convite
              </CardTitle>
              <CardDescription>
                Cole o link completo de convite (ex: https://chat.whatsapp.com/JIgDbPX9Q4g7Kij2xzlx6R) ou apenas o código.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="group-code">Link de Convite ou Código do Grupo</Label>
                <Input
                  id="group-code"
                  placeholder="https://chat.whatsapp.com/..."
                  value={groupCode}
                  onChange={(e) => setGroupCode(e.target.value)}
                  disabled={isSending}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleGetGroupCode();
                    }
                  }}
                />
              </div>
              <Button onClick={handleGetGroupCode} className="w-full" disabled={isSending}>
                {isSending ? (
                  <>
                    <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                    Consultando na UazAPI...
                  </>
                ) : (
                  <>
                    <Send className="mr-2 h-4 w-4" />
                    Obter JID
                  </>
                )}
              </Button>

              {result && (
                <div className="mt-4 p-4 border rounded-lg bg-card/50 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-sm">
                      {result.name ? result.name : 'Grupo Encontrado'}
                    </span>
                    {result.participantCount !== undefined && (
                      <Badge variant="secondary">
                        {result.participantCount} participantes
                      </Badge>
                    )}
                  </div>

                  {result.topic && (
                    <p className="text-xs text-muted-foreground line-clamp-2">
                      {result.topic}
                    </p>
                  )}

                  <div className="space-y-1">
                    <Label htmlFor="jid-result" className="text-xs">JID Oficial do Grupo</Label>
                    <div className="flex items-center gap-2">
                      <Input id="jid-result" value={result.jid} readOnly className="font-mono text-xs bg-muted" />
                      <Button variant="outline" size="icon" onClick={() => handleCopyJid(result.jid)} title="Copiar JID">
                        <Copy className="h-4 w-4" />
                        <span className="sr-only">Copiar JID</span>
                      </Button>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2 pt-2 border-t">
                    <Button size="sm" variant="outline" asChild className="gap-1 text-xs">
                      <Link href={`/groups/extract-members?jid=${encodeURIComponent(result.jid)}`}>
                        <Users className="h-3.5 w-3.5" />
                        Extrair Membros
                        <ArrowRight className="h-3 w-3 ml-1" />
                      </Link>
                    </Button>
                    <Button size="sm" variant="outline" asChild className="gap-1 text-xs">
                      <Link href={`/groups/schedule-message?jid=${encodeURIComponent(result.jid)}`}>
                        <Calendar className="h-3.5 w-3.5" />
                        Agendar Mensagem
                        <ArrowRight className="h-3 w-3 ml-1" />
                      </Link>
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
              <div>
                <CardTitle className="text-base">Grupos do WhatsApp Conectado</CardTitle>
                <CardDescription className="text-xs">
                  Carregue e pesquise os grupos da sua conta diretamente da UazAPI para pegar seus JIDs.
                </CardDescription>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={handleFetchMyGroups}
                disabled={isLoadingMyGroups}
                className="gap-2"
              >
                {isLoadingMyGroups ? (
                  <RefreshCw className="h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4" />
                )}
                Buscar Meus Grupos
              </Button>
            </CardHeader>
            <CardContent>
              {myGroups && (
                <div className="space-y-3">
                  {/* Campo de Pesquisa em Tempo Real */}
                  <div className="relative">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                    <Input
                      placeholder="Pesquisar grupo por nome ou JID..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="pl-9 pr-8 text-xs bg-muted/20"
                    />
                    {searchTerm && (
                      <button
                        type="button"
                        onClick={() => setSearchTerm('')}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>

                  {filteredMyGroups.length > 0 && (
                    <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
                      {filteredMyGroups.map((g) => (
                        <div
                          key={g.jid}
                          className="flex items-center justify-between p-2.5 rounded-md border text-sm hover:bg-muted/40 transition-colors"
                        >
                          <div className="min-w-0 flex-1 pr-3">
                            <div className="font-medium truncate">{g.name}</div>
                            <div className="text-[11px] font-mono text-muted-foreground truncate">{g.jid}</div>
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleCopyJid(g.jid)}
                              className="h-8 px-2 text-xs"
                              title="Copiar JID"
                            >
                              <Copy className="h-3.5 w-3.5 mr-1" />
                              Copiar
                            </Button>
                            <Button
                              variant="secondary"
                              size="sm"
                              asChild
                              className="h-8 px-2 text-xs"
                            >
                              <Link href={`/groups/extract-members?jid=${encodeURIComponent(g.jid)}`}>
                                Extrair
                              </Link>
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {filteredMyGroups.length === 0 && myGroups.length > 0 && (
                    <p className="text-sm text-center text-muted-foreground py-4">
                      Nenhum grupo encontrado com o termo "{searchTerm}".
                    </p>
                  )}

                  {myGroups.length === 0 && (
                    <p className="text-sm text-center text-muted-foreground py-4">
                      Nenhum grupo encontrado na conta conectada.
                    </p>
                  )}
                </div>
              )}

              {!myGroups && !isLoadingMyGroups && (
                <p className="text-xs text-muted-foreground text-center py-2">
                  Clique no botão acima para listar e pesquisar os grupos do WhatsApp conectado.
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
