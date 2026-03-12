
'use client';

import { useState } from 'react';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { FileText, Copy, Save, Database, History, X, RefreshCw } from 'lucide-react';
import { useFirebase, useUser, addDocumentNonBlocking, useCollection, useMemoFirebase, deleteDocumentNonBlocking } from '@/firebase';
import { collection, query, orderBy, serverTimestamp, doc } from 'firebase/firestore';
import type { SavedCleanedDb } from '@/lib/types';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { format } from 'date-fns';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';

export default function ReturnsCleanerPage() {
  const { toast } = useToast();
  const { firestore, user } = useFirebase();
  
  const [inputList, setInputList] = useState('');
  const [outputList, setOutputList] = useState('');
  const [stats, setStats] = useState({ total: 0, extracted: 0, errors: 0 });
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [saveName, setSaveName] = useState('');

  // Firestore Data
  const savedDbsQuery = useMemoFirebase(() => {
    if (!user) return null;
    return query(collection(firestore, 'users', user.uid, 'cleaned_dbs'), orderBy('createdAt', 'desc'));
  }, [firestore, user]);

  const { data: savedDbs, isLoading: isLoadingSaved } = useCollection<SavedCleanedDb>(savedDbsQuery);

  const handleExtractDb = () => {
    const text = inputList.trim();
    if (!text) {
      toast({ variant: 'destructive', title: 'Aviso', description: 'Cole a DB primeiro no campo de entrada.' });
      return;
    }

    const lines = text.split(/\r?\n/);
    const results: string[] = [];
    let errorCount = 0;

    for (let line of lines) {
      const trimmedLine = line.trim();
      if (!trimmedLine) continue;

      try {
        // Formato esperado: Aprovada | 19858798830 | Amigo@10 | ...
        const parts = trimmedLine.split('|').map(p => p.trim());

        if (parts.length >= 3) {
          const field1 = parts[1]; // CPF/Email
          const field2 = parts[2]; // Senha
          results.push(`${field1}:${field2}`);
        } else {
          errorCount++;
        }
      } catch (err) {
        errorCount++;
      }
    }

    const result = results.join('\n');
    setOutputList(result);
    setStats({
      total: lines.length,
      extracted: results.length,
      errors: errorCount
    });

    toast({ title: 'Extração Concluída!', description: `Extraídas ${results.length} linhas com sucesso.` });
  };

  const handleCopy = (text: string) => {
    if (!text) {
      toast({ variant: 'destructive', title: 'Aviso', description: 'Não há resultado para copiar.' });
      return;
    }
    navigator.clipboard.writeText(text);
    toast({ title: 'Copiado!', description: 'O resultado foi copiado para a área de transferência.' });
  };

  const handleClearAll = () => {
    setInputList('');
    setOutputList('');
    setStats({ total: 0, extracted: 0, errors: 0 });
  };

  const handleSaveResult = () => {
    if (!outputList) {
      toast({ variant: 'destructive', title: 'Aviso', description: 'Extraia uma lista primeiro antes de salvar.' });
      return;
    }
    setSaveDialogOpen(true);
  };

  const confirmSave = () => {
    if (!saveName.trim() || !user) return;

    const data = {
      userId: user.uid,
      name: saveName.trim(),
      content: outputList,
      createdAt: serverTimestamp(),
    };

    addDocumentNonBlocking(collection(firestore, 'users', user.uid, 'cleaned_dbs'), data);
    
    toast({ title: 'Lista Salva!', description: `A lista "${saveName}" foi armazenada com sucesso.` });
    setSaveName('');
    setSaveDialogOpen(false);
  };

  const handleDeleteSaved = (id: string) => {
    if (!user) return;
    deleteDocumentNonBlocking(doc(firestore, 'users', user.uid, 'cleaned_dbs', id));
    toast({ title: 'Lista Excluída' });
  };

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title="Limpador de Retorno"
        description="Converte linhas de retornos (logs) para o formato usuário:senha."
      />
      <main className="flex-1 overflow-auto p-4 md:p-6 space-y-6">
        <div className="grid lg:grid-cols-2 gap-6 items-start">
          <Card className="shadow-lg">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Database className="h-5 w-5 text-primary" />
                Entrada Bruta (Logs)
              </CardTitle>
              <CardDescription>Cole aqui os retornos separados por barras (|).</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Textarea
                placeholder="Aprovada | 19858798830 | Amigo@10 | ..."
                className="min-h-[300px] font-mono text-sm"
                value={inputList}
                onChange={(e) => setInputList(e.target.value)}
              />
              <div className="flex flex-wrap gap-2">
                <Button onClick={handleExtractDb} className="gap-2">
                  <RefreshCw className="h-4 w-4" />
                  Extrair DB
                </Button>
                <Button variant="outline" onClick={handleClearAll} className="gap-2">
                  <X className="h-4 w-4" />
                  Limpar Tudo
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card className="shadow-lg">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5 text-green-500" />
                Resultado (Extraído)
              </CardTitle>
              <CardDescription>
                {stats.total > 0 ? (
                  <span className="font-semibold text-primary">
                    Total: {stats.total} | Extraídas: {stats.extracted} | Erros: {stats.errors}
                  </span>
                ) : (
                  "As linhas extraídas aparecerão aqui."
                )}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Textarea
                readOnly
                placeholder="O resultado no formato usuario:senha será exibido aqui..."
                className="min-h-[300px] font-mono text-sm bg-muted/30"
                value={outputList}
              />
              <div className="flex flex-wrap gap-2">
                <Button variant="secondary" onClick={() => handleCopy(outputList)} disabled={!outputList} className="gap-2">
                  <Copy className="h-4 w-4" />
                  Copiar Saída
                </Button>
                <Button variant="default" onClick={handleSaveResult} disabled={!outputList} className="gap-2 bg-green-600 hover:bg-green-700">
                  <Save className="h-4 w-4" />
                  Salvar Lista
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>

        <Card className="shadow-lg">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <History className="h-5 w-5 text-primary" />
              Histórico de Listas
            </CardTitle>
            <CardDescription>Acesse rapidamente suas listas salvas anteriormente.</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoadingSaved ? (
              <div className="text-center py-8 text-muted-foreground animate-pulse">Carregando histórico...</div>
            ) : savedDbs && savedDbs.length > 0 ? (
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {savedDbs.map((db) => (
                  <Card key={db.id} className="border-l-4 border-l-primary hover:shadow-md transition-shadow">
                    <CardHeader className="p-4 pb-2">
                      <div className="flex justify-between items-start">
                        <div>
                          <CardTitle className="text-sm font-bold truncate max-w-[180px]">{db.name}</CardTitle>
                          <CardDescription className="text-[10px]">
                            {db.createdAt ? format(db.createdAt.toDate(), 'dd/MM/yyyy HH:mm') : '-'}
                          </CardDescription>
                        </div>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:bg-destructive/10">
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Excluir salvamento?</AlertDialogTitle>
                              <AlertDialogDescription>Esta ação não pode ser desfeita.</AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancelar</AlertDialogCancel>
                              <AlertDialogAction onClick={() => handleDeleteSaved(db.id)}>Confirmar</AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </CardHeader>
                    <CardFooter className="p-4 pt-0 gap-2">
                      <Button variant="outline" size="sm" className="w-full text-xs gap-1" onClick={() => handleCopy(db.content)}>
                        <Copy className="h-3 w-3" />
                        Copiar Conteúdo
                      </Button>
                    </CardFooter>
                  </Card>
                ))}
              </div>
            ) : (
              <div className="text-center py-12 border-2 border-dashed rounded-lg text-muted-foreground">
                Nenhuma lista salva ainda.
              </div>
            )}
          </CardContent>
        </Card>
      </main>

      <Dialog open={saveDialogOpen} onOpenChange={setSaveDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Salvar Lista Extraída</DialogTitle>
            <DialogDescription>
              Dê um nome para identificar este retorno futuramente.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="save-name">Nome da Lista</Label>
              <Input
                id="save-name"
                placeholder="Ex: Retorno Check 01/01"
                value={saveName}
                onChange={(e) => setSaveName(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setSaveDialogOpen(false)}>Cancelar</Button>
            <Button onClick={confirmSave} disabled={!saveName.trim()}>Confirmar e Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
