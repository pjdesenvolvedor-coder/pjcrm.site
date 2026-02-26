'use client';

import { useState, useEffect } from 'react';
import { doc } from 'firebase/firestore';
import { useFirebase, useDoc, useMemoFirebase, useUser } from '@/firebase';
import { AlertTriangle, Clock } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { SystemAlert as SystemAlertType, UserProfile } from '@/lib/types';

/**
 * Componente de Alerta e Bloqueio Global.
 * Se o alerta estiver ativo (isActive), exibe uma tela fosca que impede a interação.
 * O Administrador NUNCA vê este bloqueio, garantindo que ele sempre possa gerenciar o sistema.
 */
export function SystemAlert() {
  const { firestore } = useFirebase();
  const { user } = useUser();
  const [isVisible, setIsOpen] = useState(false);

  const userDocRef = useMemoFirebase(() => {
    if (!user) return null;
    return doc(firestore, 'users', user.uid);
  }, [firestore, user]);
  
  const { data: userProfile, isLoading: isProfileLoading } = useDoc<UserProfile>(userDocRef);

  const alertDocRef = useMemoFirebase(() => {
    if (!firestore) return null;
    return doc(firestore, 'system_alerts', 'current');
  }, [firestore]);

  const { data: alertData, isLoading: isAlertLoading } = useDoc<SystemAlertType>(alertDocRef);

  useEffect(() => {
    if (isAlertLoading) return;

    if (alertData && alertData.isActive) {
      setIsOpen(true);
    } else {
      setIsOpen(false);
    }
  }, [alertData, isAlertLoading]);

  // Se ainda estiver carregando ou o alerta não estiver ativo, não mostra nada
  if (isAlertLoading || isProfileLoading || !isVisible) {
    return null;
  }

  // Se o usuário for Administrador, ele ignora o bloqueio
  if (userProfile?.role === 'Admin') {
    return null;
  }

  return (
    <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-background/60 backdrop-blur-md p-4 animate-in fade-in duration-500">
      <Card className="max-w-md w-full shadow-2xl border-2 border-primary/50 overflow-hidden">
        <div className="h-2 bg-primary animate-pulse" />
        <CardHeader className="text-center pb-2 pt-8">
          <div className="flex justify-center mb-4">
            <div className="bg-primary/10 p-4 rounded-full">
              <AlertTriangle className="h-12 w-12 text-primary animate-bounce" />
            </div>
          </div>
          <CardTitle className="text-2xl font-bold tracking-tight text-foreground">
            Atualização do Sistema
          </CardTitle>
        </CardHeader>
        <CardContent className="text-center space-y-6 px-8 pb-10">
          <div className="space-y-2">
            <p className="text-muted-foreground text-lg whitespace-pre-wrap">
              {alertData?.message || "O sistema está passando por uma manutenção programada."}
            </p>
            <div className="inline-flex items-center gap-2 px-4 py-2 bg-muted rounded-full text-primary font-bold">
              <Clock className="h-5 w-5" />
              <span>Aguarde até 00:01</span>
            </div>
          </div>
          
          <div className="text-sm text-muted-foreground leading-relaxed bg-accent/50 p-4 rounded-lg border border-border">
            <p>
              Para garantir a segurança dos seus dados e evitar perda de informações, o acesso foi pausado temporariamente.
            </p>
          </div>

          <p className="text-[10px] uppercase tracking-widest text-muted-foreground/50 font-semibold">
            Status: Manual Maintenance Mode
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
