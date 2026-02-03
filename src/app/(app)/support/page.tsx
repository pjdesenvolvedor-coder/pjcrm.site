'use client';

import { useState, useEffect, useCallback } from 'react';
import { collection, query, where, getDocs, orderBy } from 'firebase/firestore';
import { useFirebase, useUser } from '@/firebase';
import type { Client } from '@/lib/types';
import { PageHeader } from '@/components/page-header';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { format } from 'date-fns';
import { Skeleton } from '@/components/ui/skeleton';

export default function SupportPage() {
  const { firestore } = useFirebase();
  const { user } = useUser();
  const [supportClients, setSupportClients] = useState<Client[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchSupportClients = useCallback(async () => {
    setIsLoading(true);
    if (!user) {
      setIsLoading(false);
      return;
    }

    const clientsRef = collection(firestore, 'users', user.uid, 'clients');
    const q = query(clientsRef, where("needsSupport", "==", true), orderBy("name"));

    try {
      const querySnapshot = await getDocs(q);
      const fetchedClients = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Client));
      setSupportClients(fetchedClients);
    } catch (error) {
      console.error("Error fetching support clients:", error);
    } finally {
      setIsLoading(false);
    }
  }, [user, firestore]);

  useEffect(() => {
    if (user) {
        fetchSupportClients();
    }
  }, [user, fetchSupportClients]);

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title="Clientes em Suporte"
        description="Clientes que necessitam de atendimento."
      />
      <main className="flex-1 overflow-auto p-4 md:p-6">
        {isLoading ? (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {[...Array(3)].map((_, i) => (
              <Card key={i}>
                <CardHeader className="flex flex-row items-center gap-4">
                  <Skeleton className="h-12 w-12 rounded-full" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-3/4" />
                    <Skeleton className="h-3 w-1/2" />
                  </div>
                </CardHeader>
                <CardContent className="space-y-2">
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-2/3" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : supportClients.length > 0 ? (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {supportClients.map((client) => (
              <Card key={client.id}>
                <CardHeader className="flex flex-row items-center gap-4">
                   <Avatar className="h-12 w-12 border">
                    <AvatarImage src={`https://picsum.photos/seed/${client.id}/100/100`} alt={client.name} />
                    <AvatarFallback>{client.name.charAt(0)}</AvatarFallback>
                  </Avatar>
                  <div className="flex-1">
                    <CardTitle>{client.name}</CardTitle>
                    <CardDescription>{client.email}</CardDescription>
                  </div>
                </CardHeader>
                <CardContent className="grid gap-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Telefone:</span>
                    <span>{client.phone}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Status:</span>
                     <Badge variant={client.status === 'Ativo' ? 'default' : 'destructive'} className={client.status === 'Ativo' ? 'bg-green-500/20 text-green-700' : ''}>{client.status}</Badge>
                  </div>
                   <div className="flex justify-between">
                    <span className="text-muted-foreground">Vencimento:</span>
                    <span>{client.dueDate ? format((client.dueDate as any).toDate(), 'dd/MM/yyyy') : '-'}</span>
                  </div>
                  {client.notes && (
                     <div className="pt-2">
                        <p className="text-xs text-muted-foreground border-t pt-2">{client.notes}</p>
                     </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <div className="flex flex-1 items-center justify-center rounded-lg border border-dashed shadow-sm h-full">
            <div className="flex flex-col items-center gap-1 text-center">
              <h3 className="text-2xl font-bold tracking-tight">
                Nenhum cliente em suporte
              </h3>
              <p className="text-sm text-muted-foreground">
                Marque um cliente para suporte na página "Todos os Clientes".
              </p>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
