'use client';

import { PlusCircle, Trash2, RefreshCw } from 'lucide-react';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useFirebase, useUser, useCollection, useMemoFirebase, addDocumentNonBlocking, deleteDocumentNonBlocking } from '@/firebase';
import { collection, query, orderBy, doc, writeBatch } from 'firebase/firestore';
import type { Token } from '@/lib/types';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { useToast } from '@/hooks/use-toast';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';


const tokenSchema = z.object({
  value: z.string().min(10, 'O token parece ser muito curto.'),
});

export default function TokenStockPage() {
  const { firestore } = useFirebase();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const tokensQuery = useMemoFirebase(() => {
    return query(collection(firestore, 'tokens'), orderBy('status'));
  }, [firestore]);

  const { data: tokens, isLoading } = useCollection<Token>(tokensQuery);

  const form = useForm<z.infer<typeof tokenSchema>>({
    resolver: zodResolver(tokenSchema),
    defaultValues: {
      value: '',
    },
  });

  const onSubmit = async (values: z.infer<typeof tokenSchema>) => {
    setIsSubmitting(true);
    addDocumentNonBlocking(collection(firestore, 'tokens'), {
        value: values.value,
        status: 'available',
    });
    toast({ title: 'Token Adicionado!', description: `O novo token foi adicionado ao estoque.` });
    
    try {
        await fetch('https://n8nbeta.typeflow.app.br/webhook/2ac86d63-f7fc-4221-bbaf-efeecec33127', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token: values.value }),
        });
        toast({
            title: 'Verificação Concluída',
            description: 'Sessão anterior (se existente) foi desconectada para garantir que o token esteja limpo.',
        });
    } catch (error: any) {
        console.error('Falha ao tentar desconectar novo token:', error);
        toast({
            variant: 'destructive',
            title: 'Falha na Verificação',
            description: 'Não foi possível verificar o status do novo token.',
        });
    } finally {
        form.reset();
        setOpen(false);
        setIsSubmitting(false);
    }
  };

  const handleDelete = async (token: Token) => {
    setIsDeleting(true);
    try {
        if (token.status === 'in_use' && token.assignedTo) {
            // 1. Disconnect session for the token.
            await fetch('https://n8nbeta.typeflow.app.br/webhook/2ac86d63-f7fc-4221-bbaf-efeecec33127', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ token: token.value }),
            });

            // 2. Update the user's documents to reflect the change.
            const userDocRef = doc(firestore, 'users', token.assignedTo);
            const userSettingsRef = doc(firestore, 'users', token.assignedTo, 'settings', 'config');
            
            const batch = writeBatch(firestore);
            batch.update(userDocRef, {
                subscriptionPlan: null,
                subscriptionEndDate: null,
                status: 'blocked' // Blocking user as their connection is now severed.
            });
            batch.update(userSettingsRef, {
                webhookToken: null
            });
            await batch.commit();

            toast({
                title: 'Usuário Desvinculado',
                description: `O usuário ${token.assignedEmail} foi desconectado e bloqueado.`
            });
        }
        
        // 3. Delete the token from the 'tokens' collection.
        const tokenDocRef = doc(firestore, 'tokens', token.id);
        deleteDocumentNonBlocking(tokenDocRef); // UI will update via listener.

        toast({
            title: 'Token Removido!',
            description: `O token foi removido do estoque.`
        });
    } catch (error) {
        console.error("Erro ao remover token:", error);
        toast({
            variant: 'destructive',
            title: 'Erro ao Remover Token',
            description: 'Não foi possível concluir a operação. Verifique o console para mais detalhes.'
        });
    } finally {
        setIsDeleting(false);
    }
};

  const getStatusVariant = (status: 'available' | 'in_use') => {
    return status === 'available' ? 'default' : 'secondary';
  }

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title="Estoque de Tokens"
        description="Gerencie os tokens de conexão para os usuários."
      >
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="gap-1">
              <PlusCircle className="h-4 w-4" />
              Adicionar Token
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[425px]">
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)}>
                <DialogHeader>
                  <DialogTitle>Novo Token</DialogTitle>
                  <DialogDescription>
                    Adicione um novo token de conexão ao estoque.
                  </DialogDescription>
                </DialogHeader>
                <fieldset disabled={isSubmitting} className="grid gap-4 py-4">
                  <FormField
                    control={form.control}
                    name="value"
                    render={({ field }) => (
                      <FormItem className="grid grid-cols-4 items-center gap-4">
                        <FormLabel className="text-right">Token</FormLabel>
                        <FormControl>
                          <Input {...field} placeholder="Cole o token aqui" className="col-span-3" />
                        </FormControl>
                        <FormMessage className="col-start-2 col-span-3" />
                      </FormItem>
                    )}
                  />
                </fieldset>
                <DialogFooter>
                  <Button type="submit" disabled={isSubmitting}>
                     {isSubmitting ? (
                        <>
                            <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                            Salvando...
                        </>
                    ) : (
                        'Salvar Token'
                    )}
                  </Button>
                </DialogFooter>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </PageHeader>
      <main className="flex-1 overflow-auto p-4 md:p-6">
        <Card>
          <CardHeader>
            <CardTitle>Tokens de Conexão</CardTitle>
            <CardDescription>
              Lista de todos os tokens disponíveis e em uso.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Token (parcial)</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Usuário Atribuído</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading && (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center">Carregando...</TableCell>
                  </TableRow>
                )}
                {!isLoading && tokens?.map((token) => (
                  <TableRow key={token.id}>
                    <TableCell className="font-medium font-mono">{`...${token.value.slice(-8)}`}</TableCell>
                    <TableCell>
                        <Badge variant={getStatusVariant(token.status)} className={cn(token.status === 'available' ? 'bg-green-500/20 text-green-700' : 'bg-blue-500/20 text-blue-700')}>{token.status === 'available' ? 'Disponível' : 'Em Uso'}</Badge>
                    </TableCell>
                    <TableCell>{token.assignedEmail || '-'}</TableCell>
                    <TableCell className="text-right">
                       <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="ghost" size="icon">
                                <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Você tem certeza?</AlertDialogTitle>
                              <AlertDialogDescription>
                                {token.status === 'in_use'
                                    ? "Este token está em uso. Removê-lo desconectará e bloqueará o usuário associado. Esta ação não pode ser desfeita."
                                    : "Esta ação não pode ser desfeita. Isso removerá permanentemente o token do estoque."
                                }
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel disabled={isDeleting}>Cancelar</AlertDialogCancel>
                              <AlertDialogAction disabled={isDeleting} onClick={() => handleDelete(token)}>
                                {isDeleting ? <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> : null}
                                {isDeleting ? 'Removendo...' : 'Continuar'}
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                    </TableCell>
                  </TableRow>
                ))}
                 {!isLoading && tokens?.length === 0 && (
                    <TableRow>
                        <TableCell colSpan={4} className="text-center">Nenhum token encontrado.</TableCell>
                    </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
