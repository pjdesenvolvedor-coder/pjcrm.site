
'use client';

import { useState, useEffect } from 'react';
import { doc } from 'firebase/firestore';
import { useFirebase, useDoc, useMemoFirebase, useUser } from '@/firebase';
import { ShieldAlert, Clock } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { SystemMaintenance, UserProfile } from '@/lib/types';

/**
 * Componente de Bloqueio Total (Modo Manutenção).
 * Administradores NUNCA são bloqueados.
 */
export function SystemAlert() {
  const { firestore } = useFirebase();
  const { user } = useUser();
  const [isVisible, setIsVisible] = useState(false);

  const userDocRef = useMemoFirebase(() => {
    if (!user) return null;
    return doc(firestore, 'users', user.uid);
  }, [firestore, user]);
  
  const { data: userProfile } = useDoc<UserProfile>(userDocRef);

  const maintenanceDocRef = useMemoFirebase(() => {
    if (!firestore) return null;
    return doc(firestore, 'system_maintenance', 'current');
  }, [firestore]);

  const { data: maintenanceData, isLoading } = useDoc<SystemMaintenance>(maintenanceDocRef);

  useEffect(() => {
    if (maintenanceData?.isActive) {
      setIsVisible(true);
    } else {
      setIsVisible(false);
    }
  }, [maintenanceData]);

  if (isLoading || !isVisible || userProfile?.role === 'Admin') {
    return null;
  }

  return (
    <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-background/60 backdrop-blur-md p-4 animate-in fade-in duration-500">
      <Card className="max-w-md w-full shadow-2xl border-2 border-primary/50 overflow-hidden">
        <div className="h-2 bg-primary animate-pulse" />
        <CardHeader className="text-center pb-2 pt-8">
          <div className="flex justify-center mb-4">
            <div className="bg-primary/10 p-4 rounded-full">
              <ShieldAlert className="h-12 w-12 text-primary animate-bounce" />
            </div>
          </div>
          <CardTitle className="text-2xl font-bold tracking-tight text-foreground">
            Pausa para Manutenção
          </CardTitle>
        </CardHeader>
        <CardContent className="text-center space-y-6 px-8 pb-10">
          <div className="space-y-2">
            <p className="text-muted-foreground text-lg whitespace-pre-wrap">
              {maintenanceData?.message || "O sistema está passando por uma manutenção programada."}
            </p>
            <div className="inline-flex items-center gap-2 px-4 py-2 bg-muted rounded-full text-primary font-bold">
              <Clock className="h-5 w-5" />
              <span>Aguarde o retorno</span>
            </div>
          </div>
          <div className="text-sm text-muted-foreground leading-relaxed bg-accent/50 p-4 rounded-lg border border-border">
            Para garantir a segurança dos seus dados, o acesso foi pausado temporariamente pelo administrador.
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
