'use client';

import { useState, useEffect } from 'react';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError } from '@/firebase/errors';
import { useToast } from '@/hooks/use-toast';

/**
 * Escuta erros de permissão e cota do Firestore e exibe como toasts amigáveis
 * em vez de travar a aplicação inteira.
 */
export function FirebaseErrorListener() {
  const { toast } = useToast();

  useEffect(() => {
    const handleError = (error: FirestorePermissionError) => {
      // Verificamos se o erro é de cota excedida
      const isQuotaError = error.message.toLowerCase().includes('quota exceeded') || 
                           error.message.toLowerCase().includes('resource exhausted');

      if (isQuotaError) {
        toast({
          variant: 'destructive',
          title: 'Cota de Uso Excedida',
          description: 'O limite do plano gratuito do banco de dados foi atingido. Algumas funções podem não funcionar até o reset diário.',
        });
      } else {
        // Erro de permissão padrão (Security Rules)
        toast({
          variant: 'destructive',
          title: 'Erro de Acesso',
          description: 'Você não tem permissão para realizar esta ação.',
        });
      }
      
      // Opcional: registrar no console para debug do desenvolvedor
      console.error('Firestore Error intercepted:', error);
    };

    errorEmitter.on('permission-error', handleError);

    return () => {
      errorEmitter.off('permission-error', handleError);
    };
  }, [toast]);

  return null;
}
