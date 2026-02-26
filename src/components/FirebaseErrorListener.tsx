'use client';

import { useEffect, useRef } from 'react';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError } from '@/firebase/errors';
import { useToast } from '@/hooks/use-toast';

/**
 * Escuta erros de permissão e cota do Firestore apenas para notificação.
 * A lógica de bloqueio de tela foi movida para o componente SystemAlert,
 * sendo agora controlada manualmente pelo administrador.
 */
export function FirebaseErrorListener() {
  const { toast } = useToast();
  const lastToastTimeRef = useRef<number>(0);
  
  const TOAST_THROTTLE_MS = 10000; 

  useEffect(() => {
    const handleError = (error: FirestorePermissionError) => {
      const now = Date.now();
      const message = error.message?.toLowerCase() || '';
      
      // Identifica se é um erro de cota excedida ou permissão
      const isQuotaError = message.includes('quota exceeded') || 
                           message.includes('resource exhausted') ||
                           message.includes('resource_exhausted') ||
                           message.includes('limit exceeded') ||
                           (error as any).code === 'resource-exhausted';

      // Evita spam de notificações (máximo uma a cada 10s)
      if (now - lastToastTimeRef.current < TOAST_THROTTLE_MS) return;
      
      if (isQuotaError) {
        toast({
          variant: 'destructive',
          title: 'Limite Atingido',
          description: 'A cota diária de processamento do banco de dados foi atingida.',
        });
      } else {
        toast({
          variant: 'destructive',
          title: 'Erro de Acesso',
          description: 'Houve um problema de permissão ou conexão com o banco de dados.',
        });
      }
      
      lastToastTimeRef.current = now;
      console.error('Firestore Error intercepted:', error);
    };

    errorEmitter.on('permission-error', handleError);

    return () => {
      errorEmitter.off('permission-error', handleError);
    };
  }, [toast]);

  return null;
}
