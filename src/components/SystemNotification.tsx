
'use client';

import { doc } from 'firebase/firestore';
import { useFirebase, useDoc, useMemoFirebase } from '@/firebase';
import { Megaphone, Bell } from 'lucide-react';
import type { SystemAlert } from '@/lib/types';
import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';

/**
 * Componente de Notificação Global (Alertas).
 * Exibe um popup (Dialog) com a mensagem configurada pelo administrador.
 * Possui lógica de "Não exibir novamente" baseada no instanceId do alerta.
 */
export function SystemNotification() {
  const { firestore } = useFirebase();
  const [isOpen, setIsOpen] = useState(false);
  const [dontShowAgain, setDontShowAgain] = useState(false);

  const alertDocRef = useMemoFirebase(() => {
    if (!firestore) return null;
    return doc(firestore, 'system_alerts', 'current');
  }, [firestore]);

  const { data: alertData } = useDoc<SystemAlert>(alertDocRef);

  // Verifica se o alerta deve ser exibido ao carregar ou quando o alerta mudar no banco
  useEffect(() => {
    if (alertData?.isActive && alertData.instanceId) {
      const dismissedId = localStorage.getItem('dismissed_alert_id');
      
      // Só abre o popup se o ID do alerta atual for diferente do último que o usuário mandou esconder
      if (dismissedId !== alertData.instanceId) {
        setIsOpen(true);
        setDontShowAgain(false); // Reseta o checkbox para cada novo alerta
      }
    } else {
      setIsOpen(false);
    }
  }, [alertData]);

  const handleClose = () => {
    if (dontShowAgain && alertData?.instanceId) {
      // Salva o ID deste alerta específico no navegador do usuário
      localStorage.setItem('dismissed_alert_id', alertData.instanceId);
    }
    setIsOpen(false);
  };

  // Se não houver alerta ativo, não renderiza nada
  if (!alertData?.isActive) {
    return null;
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-primary text-xl">
            <Megaphone className="h-5 w-5 animate-bounce" />
            Aviso do Sistema
          </DialogTitle>
          <DialogDescription>
            Informação importante da administração para todos os usuários.
          </DialogDescription>
        </DialogHeader>
        
        <div className="py-4">
          <div className="bg-muted p-5 rounded-lg border border-border/50 shadow-inner">
            <p className="text-sm whitespace-pre-wrap leading-relaxed text-foreground/90 font-medium">
              {alertData.message}
            </p>
          </div>
        </div>

        <DialogFooter className="flex flex-col sm:flex-col gap-4 border-t pt-4">
          <div className="flex items-center space-x-2 w-full">
            <Checkbox 
              id="dont-show-alert" 
              checked={dontShowAgain} 
              onCheckedChange={(checked) => setDontShowAgain(!!checked)} 
            />
            <Label 
              htmlFor="dont-show-alert" 
              className="text-xs text-muted-foreground cursor-pointer font-normal hover:text-foreground transition-colors"
            >
              Não exibir esta mensagem novamente
            </Label>
          </div>
          <Button onClick={handleClose} className="w-full font-bold py-6">
            Entendido
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
