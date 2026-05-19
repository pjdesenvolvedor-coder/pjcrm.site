'use client';

import { useState, useMemo } from 'react';
import { KeyRound, Copy, Check, Edit3, Plus, Trash2, Loader2, Sparkles, AlertCircle } from 'lucide-react';
import { collection, query, orderBy, doc, serverTimestamp } from 'firebase/firestore';
import { useFirebase, useCollection, useMemoFirebase, addDocumentNonBlocking, deleteDocumentNonBlocking } from '@/firebase';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

const STREAMING_SERVICES = [
  "Netflix",
  "Apple",
  "Max",
  "Prime Video",
  "Disney",
  "Globo",
  "Globo + Premiere",
  "Globo + Telecine",
  "Globo Completa"
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

interface LoginItem {
  id: string;
  email: string;
  password?: string;
  tag: string;
  createdAt: any;
}

export default function LoginsPage() {
  const { firestore, effectiveUserId } = useFirebase();
  const { toast } = useToast();

  const [activeDialogService, setActiveDialogService] = useState<string | null>(null);
  const [newLoginsText, setNewLoginsText] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Read logins from Firestore
  const loginsQuery = useMemoFirebase(() => {
    if (!effectiveUserId) return null;
    return query(collection(firestore, 'users', effectiveUserId, 'claro_logins'), orderBy('createdAt', 'desc'));
  }, [firestore, effectiveUserId]);

  const { data: logins, isLoading } = useCollection<LoginItem>(loginsQuery);

  // Group logins by service tag
  const groupedLogins = useMemo(() => {
    const groups: Record<string, LoginItem[]> = {};
    STREAMING_SERVICES.forEach(service => {
      groups[service] = [];
    });
    if (logins) {
      logins.forEach(login => {
        if (groups[login.tag]) {
          groups[login.tag].push(login);
        }
      });
    }
    return groups;
  }, [logins]);

  // Handle "Retirar" action: copies and deletes the login
  const handleRetirar = async (login: LoginItem) => {
    if (!effectiveUserId) return;
    const credentialString = `${login.email}:${login.password || ''}`;
    
    try {
      await navigator.clipboard.writeText(credentialString);
      setCopiedId(login.id);
      
      // Delete document from Firestore
      const docRef = doc(firestore, 'users', effectiveUserId, 'claro_logins', login.id);
      deleteDocumentNonBlocking(docRef);

      toast({
        title: "Retirado e Copiado!",
        description: "As credenciais foram copiadas e removidas do estoque.",
        className: "bg-emerald-600 text-white border-none"
      });

      setTimeout(() => setCopiedId(null), 2000);
    } catch (err) {
      console.error(err);
      toast({
        variant: "destructive",
        title: "Erro ao copiar",
        description: "Não foi possível copiar para a área de transferência."
      });
    }
  };

  // Open edit dialog for a specific service tag
  const handleOpenEdit = (service: string) => {
    setActiveDialogService(service);
    setNewLoginsText('');
  };

  // Save new logins from the dialog textarea
  const handleAddLogins = () => {
    if (!effectiveUserId || !activeDialogService || !newLoginsText.trim()) return;

    const lines = newLoginsText.split('\n');
    let addedCount = 0;

    lines.forEach(line => {
      const trimmed = line.trim();
      if (!trimmed) return;

      // Split email and password (supports either email:password or just email)
      const colonIndex = trimmed.indexOf(':');
      let email = trimmed;
      let password = '';

      if (colonIndex !== -1) {
        email = trimmed.substring(0, colonIndex).trim();
        password = trimmed.substring(colonIndex + 1).trim();
      }

      if (email) {
        addDocumentNonBlocking(collection(firestore, 'users', effectiveUserId, 'claro_logins'), {
          email,
          password,
          tag: activeDialogService,
          createdAt: serverTimestamp()
        });
        addedCount++;
      }
    });

    if (addedCount > 0) {
      toast({
        title: `${addedCount} login(s) adicionado(s)!`,
        description: `Adicionados com sucesso à tag ${activeDialogService}.`
      });
    }

    setNewLoginsText('');
    setActiveDialogService(null);
  };

  // Manually delete a login from the edit dialog
  const handleDeleteLogin = (id: string) => {
    if (!effectiveUserId) return;
    const docRef = doc(firestore, 'users', effectiveUserId, 'claro_logins', id);
    deleteDocumentNonBlocking(docRef);
    toast({
      title: "Login Removido",
      description: "O login foi excluído do sistema."
    });
  };

  // Filter logins currently inside the active dialog service tag
  const dialogLoginsList = useMemo(() => {
    if (!activeDialogService) return [];
    return groupedLogins[activeDialogService] || [];
  }, [activeDialogService, groupedLogins]);

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title="Links Claro: Logins"
        description="Visualize e gerencie os logins agrupados por serviços. A retirada copia as credenciais e remove o item."
      />

      <main className="flex-1 overflow-auto p-4 md:p-6 space-y-6">
        {isLoading ? (
          <div className="flex items-center justify-center h-64">
            <Loader2 className="h-8 w-8 text-primary animate-spin" />
            <span className="ml-2 text-muted-foreground">Carregando estoque de logins...</span>
          </div>
        ) : (
          <div className="grid gap-6 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
            {STREAMING_SERVICES.map(service => {
              const serviceLogins = groupedLogins[service] || [];
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
                    <div className="flex justify-between items-center">
                      <CardTitle className={cn("text-base font-bold flex items-center gap-1.5", style.text)}>
                        <Sparkles className="h-4 w-4 shrink-0" />
                        {service}
                      </CardTitle>
                      <Badge className={cn("font-bold text-xs py-0.5 px-2.5", style.badgeBg)} variant="secondary">
                        {serviceLogins.length} {serviceLogins.length === 1 ? 'disponível' : 'disponíveis'}
                      </Badge>
                    </div>
                  </CardHeader>

                  <CardContent className="flex-1 pt-4 pb-2 max-h-[220px] overflow-y-auto">
                    {serviceLogins.length > 0 ? (
                      <div className="space-y-2">
                        {serviceLogins.map(login => (
                          <div 
                            key={login.id} 
                            className="flex items-center justify-between p-2 rounded-lg bg-background border hover:bg-muted/30 transition-colors text-xs"
                          >
                            <div className="flex flex-col min-w-0 pr-2">
                              <span className="font-semibold truncate">{login.email}</span>
                              {login.password && (
                                <span className="text-muted-foreground font-mono truncate">{login.password}</span>
                              )}
                            </div>
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-8 gap-1 border-emerald-500/30 text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/20 hover:text-emerald-700 font-medium shrink-0"
                              onClick={() => handleRetirar(login)}
                            >
                              {copiedId === login.id ? (
                                <Check className="h-3.5 w-3.5" />
                              ) : (
                                <Copy className="h-3.5 w-3.5" />
                              )}
                              <span>Retirar</span>
                            </Button>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="flex flex-col items-center justify-center h-28 text-muted-foreground text-center">
                        <AlertCircle className="h-6 w-6 mb-2 opacity-40" />
                        <span className="text-xs">Estoque vazio</span>
                      </div>
                    )}
                  </CardContent>

                  <CardFooter className="pt-2 pb-4 border-t bg-muted/5 flex justify-end">
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      className="text-xs gap-1.5 hover:bg-primary/10 hover:text-primary"
                      onClick={() => handleOpenEdit(service)}
                    >
                      <Edit3 className="h-3.5 w-3.5" />
                      Adicionar / Remover
                    </Button>
                  </CardFooter>
                </Card>
              );
            })}
          </div>
        )}
      </main>

      {/* Edit Logins Dialog */}
      <Dialog open={!!activeDialogService} onOpenChange={(open) => !open && setActiveDialogService(null)}>
        <DialogContent className="sm:max-w-lg max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-1.5 text-lg font-bold">
              <KeyRound className="h-5 w-5 text-primary" />
              Editar Logins: {activeDialogService}
            </DialogTitle>
            <DialogDescription>
              Adicione múltiplos logins ou gerencie as credenciais existentes para esta tag.
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto space-y-4 py-4 pr-1">
            <div className="space-y-2">
              <span className="text-xs font-bold text-muted-foreground uppercase">Adicionar Novos (1 por linha)</span>
              <Textarea
                placeholder="exemplo1@email.com:senha123&#10;exemplo2@email.com:senha456"
                value={newLoginsText}
                onChange={(e) => setNewLoginsText(e.target.value)}
                className="font-mono text-xs min-h-[120px]"
              />
              <span className="text-[10px] text-muted-foreground leading-relaxed block">
                Insira as credenciais no formato <strong>email:senha</strong>. Linhas vazias ou sem senha válida serão filtradas.
              </span>
            </div>

            <div className="border-t pt-4 space-y-2">
              <span className="text-xs font-bold text-muted-foreground uppercase block mb-2">
                Logins em Estoque ({dialogLoginsList.length})
              </span>
              {dialogLoginsList.length > 0 ? (
                <div className="space-y-2 max-h-[200px] overflow-y-auto pr-1">
                  {dialogLoginsList.map(login => (
                    <div 
                      key={login.id} 
                      className="flex items-center justify-between p-2.5 rounded-lg border bg-muted/10 text-xs"
                    >
                      <div className="flex flex-col min-w-0 pr-2">
                        <span className="font-semibold truncate">{login.email}</span>
                        {login.password && (
                          <span className="text-muted-foreground font-mono truncate">{login.password}</span>
                        )}
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive hover:bg-destructive/10 hover:text-destructive shrink-0"
                        onClick={() => handleDeleteLogin(login.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              ) : (
                <span className="text-xs text-muted-foreground block text-center py-4">Nenhum login cadastrado para esta tag.</span>
              )}
            </div>
          </div>

          <DialogFooter className="pt-2 border-t flex items-center justify-between">
            <Button variant="ghost" onClick={() => setActiveDialogService(null)}>
              Fechar
            </Button>
            <Button 
              disabled={!newLoginsText.trim()}
              onClick={handleAddLogins}
              className="gap-1.5"
            >
              <Plus className="h-4 w-4" />
              Adicionar ao Estoque
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
