'use client';

import { useState, useEffect } from 'react';
import { doc } from 'firebase/firestore';
import { useFirebase, useDoc, useMemoFirebase } from '@/firebase';
import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import type { SystemAlert as SystemAlertType } from '@/lib/types';

export function SystemAlert() {
  const { firestore } = useFirebase();
  const [isOpen, setIsOpen] = useState(false);

  const alertDocRef = useMemoFirebase(() => {
    if (!firestore) return null;
    return doc(firestore, 'system_alerts', 'current');
  }, [firestore]);

  const { data: alertData, isLoading } = useDoc<SystemAlertType>(alertDocRef);

  useEffect(() => {
    if (isLoading || !alertData || !alertData.isActive) {
      setIsOpen(false);
      return;
    }

    const dismissedAlertId = localStorage.getItem('dismissedAlertId');

    if (alertData.instanceId !== dismissedAlertId) {
      setIsOpen(true);
    }
    
  }, [alertData, isLoading]);

  const handleClose = () => {
    setIsOpen(false);
  };

  const handleDismissPermanently = () => {
    if (alertData) {
      localStorage.setItem('dismissedAlertId', alertData.instanceId);
    }
    setIsOpen(false);
  };

  if (!isOpen || !alertData) {
    return null;
  }

  return (
    <AlertDialog open={isOpen} onOpenChange={setIsOpen}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-6 w-6 text-yellow-500" />
            Aviso Importante
          </AlertDialogTitle>
          <AlertDialogDescription className="pt-4 text-base text-foreground whitespace-pre-wrap">
            {alertData.message}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <Button variant="outline" onClick={handleDismissPermanently}>
            Não exibir novamente
          </Button>
          <Button onClick={handleClose}>Fechar</Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
