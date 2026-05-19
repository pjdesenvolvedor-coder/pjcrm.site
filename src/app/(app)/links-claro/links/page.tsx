'use client';

import { useState, useMemo } from 'react';
import { Link2, Copy, Check, Edit3, Plus, Trash2, Loader2, Sparkles, Clock, ListPlus, ExternalLink } from 'lucide-react';
import { collection, query, orderBy, doc, serverTimestamp, Timestamp } from 'firebase/firestore';
import { useFirebase, useCollection, useMemoFirebase, addDocumentNonBlocking, deleteDocumentNonBlocking, setDocumentNonBlocking } from '@/firebase';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';

const STREAMING_SERVICES = [
  "Netflix",
  "Apple",
  "Max",
  "Prime Video",
  "Disney"
];

// Aesthetic mapping for card styling
const SERVICE_STYLES: Record<string, { bg: string, border: string, text: string, badgeBg: string }> = {
  "Netflix": { bg: "from-red-500/10 to-transparent", border: "hover:border-red-500/50", text: "text-red-600 dark:text-red-400", badgeBg: "bg-red-500/20 text-red-700 dark:text-red-300" },
  "Apple": { bg: "from-zinc-500/10 to-transparent", border: "hover:border-zinc-500/50", text: "text-zinc-700 dark:text-zinc-300", badgeBg: "bg-zinc-500/20 text-zinc-800 dark:text-zinc-200" },
  "Max": { bg: "from-blue-600/10 to-transparent", border: "hover:border-blue-600/50", text: "text-blue-600 dark:text-blue-400", badgeBg: "bg-blue-600/20 text-blue-700 dark:text-blue-300" },
  "Prime Video": { bg: "from-cyan-500/10 to-transparent", border: "hover:border-cyan-500/50", text: "text-cyan-600 dark:text-cyan-400", badgeBg: "bg-cyan-500/20 text-cyan-700 dark:text-cyan-300" },
  "Disney": { bg: "from-indigo-600/10 to-transparent", border: "hover:border-indigo-600/50", text: "text-indigo-600 dark:text-indigo-400", badgeBg: "bg-indigo-600/20 text-indigo-700 dark:text-indigo-300" },
  "Globo": { bg: "from-orange-500/10 to-transparent", border: "hover:border-orange-500/50", text: "text-orange-600 dark:text-orange-400", badgeBg: "bg-orange-500/20 text-orange-700 dark:text-orange-300" },
  "Globo + Premiere": { bg: "from-green-600/10 to-transparent", border: "hover:border-green-600/50", text: "text-green-600 dark:text-green-400", badgeBg: "bg-green-600/20 text-green-700 dark:text-green-300" },
  "Globo + Telecine": { bg: "from-pink-600/10 to-transparent", border: "hover:border-pink-600/50", text: "text-pink-600 dark:text-pink-400", badgeBg: "bg-pink-600/20 text-pink-700 dark:text-pink-300" },
  "Globo Completa": { bg: "from-purple-600/10 to-transparent", border: "hover:border-purple-600/50", text: "text-purple-600 dark:text-purple-400", badgeBg: "bg-purple-600/20 text-purple-700 dark:text-purple-300" }
};

interface LinkItem {
  id: string;
  link: string;
  tag: string;
  createdAt: any;
}

function getDuplicatesInfo(items: { id: string; key: string }[]) {
  const seen = new Set<string>();
  const duplicateIds: string[] = [];
  
  items.forEach(item => {
    const normKey = item.key.toLowerCase().trim();
    if (seen.has(normKey)) {
      duplicateIds.push(item.id);
    } else {
      seen.add(normKey);
    }
  });
  
  return {
    count: duplicateIds.length,
    idsToRemove: duplicateIds
  };
}

export default function LinksPage() {
  const { firestore, effectiveUserId } = useFirebase();
  const { toast } = useToast();

  const [selectedTag, setSelectedTag] = useState<string>('Netflix');
  const [linksText, setLinksText] = useState('');
  const [editingLink, setEditingLink] = useState<LinkItem | null>(null);
  const [editedLinkValue, setEditedLinkValue] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Read links from Firestore
  const linksQuery = useMemoFirebase(() => {
    if (!effectiveUserId) return null;
    return query(collection(firestore, 'users', effectiveUserId, 'claro_links'), orderBy('createdAt', 'desc'));
  }, [firestore, effectiveUserId]);

  const { data: links, isLoading } = useCollection<LinkItem>(linksQuery);

  // Group links by service tag
  const groupedLinks = useMemo(() => {
    const groups: Record<string, LinkItem[]> = {};
    STREAMING_SERVICES.forEach(service => {
      groups[service] = [];
    });
    if (links) {
      links.forEach(link => {
        if (groups[link.tag]) {
          groups[link.tag].push(link);
        }
      });
    }
    return groups;
  }, [links]);

  // Add multiple links
  const handleAddLinks = (e: React.FormEvent) => {
    e.preventDefault();
    if (!effectiveUserId || !linksText.trim()) return;

    const lines = linksText.split('\n');
    let addedCount = 0;

    lines.forEach(line => {
      const trimmed = line.trim();
      if (!trimmed) return;

      addDocumentNonBlocking(collection(firestore, 'users', effectiveUserId, 'claro_links'), {
        link: trimmed,
        tag: selectedTag,
        createdAt: serverTimestamp()
      });
      addedCount++;
    });

    if (addedCount > 0) {
      toast({
        title: `${addedCount} link(s) adicionado(s)!`,
        description: `Adicionados com sucesso à tag ${selectedTag}.`
      });
    }

    setLinksText('');
  };

  // Handle "Pegar Link" action: copies and deletes the link
  const handlePegarLink = async (linkItem: LinkItem) => {
    if (!effectiveUserId) return;

    try {
      await navigator.clipboard.writeText(linkItem.link);
      setCopiedId(linkItem.id);

      // Delete from Firestore
      const docRef = doc(firestore, 'users', effectiveUserId, 'claro_links', linkItem.id);
      deleteDocumentNonBlocking(docRef);

      toast({
        title: "Link Copiado!",
        description: "O link foi copiado para a área de transferência e removido do estoque.",
        className: "bg-emerald-600 text-white border-none"
      });

      setTimeout(() => setCopiedId(null), 2000);
    } catch (err) {
      console.error(err);
      toast({
        variant: "destructive",
        title: "Erro ao copiar",
        description: "Não foi possível copiar o link."
      });
    }
  };

  // Open Edit Modal
  const handleOpenEdit = (linkItem: LinkItem) => {
    setEditingLink(linkItem);
    setEditedLinkValue(linkItem.link);
  };

  // Save Edited Link
  const handleSaveEdit = () => {
    if (!effectiveUserId || !editingLink || !editedLinkValue.trim()) return;

    const docRef = doc(firestore, 'users', effectiveUserId, 'claro_links', editingLink.id);
    setDocumentNonBlocking(docRef, { link: editedLinkValue.trim() }, { merge: true });

    toast({
      title: "Link Atualizado!",
      description: "As alterações foram salvas com sucesso."
    });

    setEditingLink(null);
  };

  // Delete Link
  const handleDeleteLink = (id: string) => {
    if (!effectiveUserId) return;
    const docRef = doc(firestore, 'users', effectiveUserId, 'claro_links', id);
    deleteDocumentNonBlocking(docRef);
    toast({
      title: "Link Excluído",
      description: "O link foi removido definitivamente."
    });
  };

  // Remove duplicates helper
  const handleRemoveDuplicates = (ids: string[], service: string) => {
    if (!effectiveUserId || ids.length === 0) return;

    ids.forEach(id => {
      const docRef = doc(firestore, 'users', effectiveUserId, 'claro_links', id);
      deleteDocumentNonBlocking(docRef);
    });

    toast({
      title: `${ids.length} duplicado(s) removido(s)!`,
      description: `Limpeza concluída para a tag ${service}.`,
      className: "bg-amber-600 text-white border-none"
    });
  };

  // Format creation date, hour and minute (ex: 19/05 às 11:36)
  const formatTimestamp = (timestamp?: any) => {
    if (!timestamp) return 'Agora mesmo';
    try {
      const date = timestamp instanceof Timestamp ? timestamp.toDate() : new Date(timestamp);
      return format(date, "dd/MM 'às' HH:mm");
    } catch (e) {
      return '-';
    }
  };

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title="Links Claro: Links de Acesso"
        description="Gerencie os links temporários de acesso. Insira vários por linha e retire-os rapidamente."
      />

      <main className="flex-1 overflow-auto p-4 md:p-6 space-y-6">
        {/* Form to add links */}
        <Card className="border-2 shadow-md">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-bold flex items-center gap-1.5 uppercase tracking-wide text-muted-foreground">
              <ListPlus className="h-4 w-4 text-primary" />
              Adicionar Novos Links
            </CardTitle>
            <CardDescription>
              Cole os links no campo abaixo e selecione a respectiva tag de streaming.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleAddLinks} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-start">
                <div className="space-y-2 md:col-span-1">
                  <Label htmlFor="tag-selector" className="text-xs font-bold uppercase text-muted-foreground">Tag / Serviço</Label>
                  <Select value={selectedTag} onValueChange={setSelectedTag}>
                    <SelectTrigger id="tag-selector" className="w-full">
                      <SelectValue placeholder="Selecione o serviço" />
                    </SelectTrigger>
                    <SelectContent>
                      {STREAMING_SERVICES.map(service => (
                        <SelectItem key={service} value={service}>
                          {service}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2 md:col-span-3">
                  <Label htmlFor="links-input" className="text-xs font-bold uppercase text-muted-foreground">Links (1 por linha)</Label>
                  <Textarea
                    id="links-input"
                    placeholder="https://exemplo.com/claro-acesso-1&#10;https://exemplo.com/claro-acesso-2"
                    value={linksText}
                    onChange={(e) => setLinksText(e.target.value)}
                    className="min-h-[80px] font-mono text-xs"
                    required
                  />
                </div>
              </div>
              <div className="flex justify-end pt-2">
                <Button type="submit" className="gap-1.5" disabled={!linksText.trim()}>
                  <Plus className="h-4 w-4" />
                  Salvar Links no Estoque
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        {/* Display grids */}
        {isLoading ? (
          <div className="flex items-center justify-center h-64">
            <Loader2 className="h-8 w-8 text-primary animate-spin" />
            <span className="ml-2 text-muted-foreground">Carregando estoque de links...</span>
          </div>
        ) : (
          <div className="grid gap-6 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
            {STREAMING_SERVICES.map(service => {
              const serviceLinks = groupedLinks[service] || [];
              const duplicatesInfo = getDuplicatesInfo(
                serviceLinks.map(l => ({ id: l.id, key: l.link }))
              );
              const style = SERVICE_STYLES[service] || { bg: "", border: "hover:border-primary/50", text: "text-primary", badgeBg: "bg-primary/20" };

              return (
                <Card 
                  key={service} 
                  className={cn(
                    "flex flex-col relative overflow-hidden border-2 transition-all duration-300 bg-gradient-to-br",
                    style.bg,
                    style.border,
                    "hover:shadow-lg hover:-translate-y-0.5"
                  )}
                >
                  <CardHeader className="pb-3 border-b bg-muted/20">
                    <div className="flex justify-between items-center gap-2">
                      <CardTitle className={cn("text-base font-bold flex items-center gap-1.5", style.text)}>
                        <Sparkles className="h-4 w-4 shrink-0" />
                        {service}
                      </CardTitle>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {duplicatesInfo.count > 0 && (
                          <div className="flex items-center gap-1">
                            <Badge className="bg-amber-500/20 text-amber-700 dark:text-amber-300 border-none font-bold text-xs py-0.5 px-2 animate-pulse shrink-0">
                              {duplicatesInfo.count} {duplicatesInfo.count === 1 ? 'duplicado' : 'duplicados'}
                            </Badge>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-amber-600 dark:text-amber-400 hover:bg-amber-500/10 hover:text-amber-700 shrink-0"
                              title="Remover duplicados"
                              onClick={() => handleRemoveDuplicates(duplicatesInfo.idsToRemove, service)}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        )}
                        <Badge className={cn("font-bold text-xs py-0.5 px-2.5 shrink-0", style.badgeBg)} variant="secondary">
                          {serviceLinks.length} {serviceLinks.length === 1 ? 'disponível' : 'disponíveis'}
                        </Badge>
                      </div>
                    </div>
                  </CardHeader>

                  <CardContent className="flex-1 pt-4 pb-2 max-h-[250px] overflow-y-auto">
                    {serviceLinks.length > 0 ? (
                      <div className="space-y-3">
                        {serviceLinks.map(linkItem => (
                          <div 
                            key={linkItem.id} 
                            className="p-2.5 rounded-lg bg-background border hover:bg-muted/30 transition-colors space-y-2 text-xs"
                          >
                            <div className="flex items-center gap-1.5 text-muted-foreground text-[10px]">
                              <Clock className="h-3 w-3 shrink-0" />
                              <span>{formatTimestamp(linkItem.createdAt)}</span>
                            </div>
                            <div className="font-medium font-mono truncate text-[11px] text-blue-600 dark:text-blue-400 flex items-center gap-1">
                              <ExternalLink className="h-3.5 w-3.5 shrink-0 opacity-70" />
                              <span className="truncate flex-1">{linkItem.link}</span>
                            </div>
                            <div className="flex items-center gap-1.5 justify-end pt-1">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 text-muted-foreground hover:bg-muted hover:text-foreground shrink-0"
                                onClick={() => handleOpenEdit(linkItem)}
                              >
                                <Edit3 className="h-3.5 w-3.5" />
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-7 text-xs gap-1 border-emerald-500/30 text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/20 hover:text-emerald-700 font-medium shrink-0"
                                onClick={() => handlePegarLink(linkItem)}
                              >
                                {copiedId === linkItem.id ? (
                                  <Check className="h-3 w-3" />
                                ) : (
                                  <Copy className="h-3 w-3" />
                                )}
                                <span>Pegar Link</span>
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="flex flex-col items-center justify-center h-28 text-muted-foreground text-center">
                        <Link2 className="h-6 w-6 mb-2 opacity-40" />
                        <span className="text-xs">Nenhum link ativo</span>
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </main>

      {/* Edit Link Dialog */}
      <Dialog open={!!editingLink} onOpenChange={(open) => !open && setEditingLink(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-1.5 text-lg font-bold">
              <Edit3 className="h-5 w-5 text-primary" />
              Editar Link ({editingLink?.tag})
            </DialogTitle>
            <DialogDescription>
              Modifique a URL do link cadastrado.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="edit-link-url" className="text-xs font-bold uppercase text-muted-foreground">URL do Link</Label>
              <Input
                id="edit-link-url"
                type="url"
                value={editedLinkValue}
                onChange={(e) => setEditedLinkValue(e.target.value)}
                className="font-mono text-xs"
                placeholder="https://exemplo.com/acesso"
                required
              />
            </div>
          </div>

          <DialogFooter className="flex items-center justify-between">
            <Button
              variant="ghost"
              className="text-destructive hover:bg-destructive/10 hover:text-destructive gap-1.5"
              onClick={() => {
                if (editingLink) {
                  handleDeleteLink(editingLink.id);
                  setEditingLink(null);
                }
              }}
            >
              <Trash2 className="h-4 w-4" />
              Excluir
            </Button>
            <div className="flex gap-2">
              <Button variant="ghost" onClick={() => setEditingLink(null)}>
                Cancelar
              </Button>
              <Button onClick={handleSaveEdit} disabled={!editedLinkValue.trim()}>
                Salvar Alterações
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
