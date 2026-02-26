'use client';

import { useState, useEffect, useRef } from 'react';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError } from '@/firebase/errors';
import { useToast } from '@/hooks/use-toast';

/**
 * Escuta erros de permissão e cota do Firestore e exibe como toasts amigáveis.
 * Implementa um throttle para não sobrecarregar a tela em caso de erros repetidos.
 */
export function FirebaseErrorListener() {
  const { toast } = useToast();
  const lastToastTimeRef = useRef<number>(0);
  const TOAST_THROTTLE_MS = 10000; // Mostra no máximo um aviso a cada 10 segundos

  useEffect(() => {
    const handleError = (error: FirestorePermissionError) => {
      const now = Date.now();
      if (now - lastToastTimeRef.current < TOAST_THROTTLE_MS) return;

      const message = error.message.toLowerCase();
      const isQuotaError = message.includes('quota exceeded') || 
                           message.includes('resource exhausted') ||
                           message.includes('resource_exhausted');

      if (isQuotaError) {
        toast({
          variant: 'destructive',
          title: 'Limite Diário Atingido',
          description: 'A cota gratuita do banco de dados acabou. As funções de salvamento e automações serão retomadas automaticamente após o reset diário.',
        });
        lastToastTimeRef.current = now;
      } else {
        // Erro de permissão padrão (Security Rules)
        toast({
          variant: 'destructive',
          title: 'Erro de Acesso',
          description: 'Você não tem permissão para realizar esta ação.',
        });
        lastToastTimeRef.current = now;
      }
      
      console.error('Firestore Error intercepted:', error);
    };

    errorEmitter.on('permission-error', handleError);

    return () => {
      errorEmitter.off('permission-error', handleError);
    };
  }, [toast]);

  return null;
}
