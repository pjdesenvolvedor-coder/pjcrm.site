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
    if (isLoading) {
      return; // Wait until loading is complete
    }

    if (alertData && alertData.isActive) {
      const dismissedAlertId = localStorage.getItem('dismissedAlertId');
      if (alertData.instanceId !== dismissedAlertId) {
        setIsOpen(true);
      } else {
        setIsOpen(false); // Ensure it's closed if ID matches
      }
    } else {
      setIsOpen(false); // Ensure it's closed if alert is inactive or doesn't exist
    }
  }, [alertData, isLoading]);

  const handleDismissPermanently = () => {
    if (alertData) {
      localStorage.setItem('dismissedAlertId', alertData.instanceId);
    }
    setIsOpen(false);
  };

  if (isLoading) {
    return null; // Don't render anything while loading to prevent flashes
  }

  return (
    <AlertDialog open={isOpen} onOpenChange={setIsOpen}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-6 w-6 text-yellow-500" />
            Aviso Importante
          </AlertDialogTitle>
          {alertData?.message && (
            <AlertDialogDescription className="pt-4 text-base text-foreground whitespace-pre-wrap">
              {alertData.message}
            </AlertDialogDescription>
          )}
        </AlertDialogHeader>
        <AlertDialogFooter>
          <Button variant="outline" onClick={handleDismissPermanently}>
            Não exibir novamente
          </Button>
          <Button onClick={() => setIsOpen(false)}>Fechar</Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
