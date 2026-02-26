'use client';

import { useState, useEffect, useRef } from 'react';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError } from '@/firebase/errors';
import { useToast } from '@/hooks/use-toast';

/**
 * Escuta erros de permissão e cota do Firestore e exibe como toasts amigáveis.
 * Implementa um throttle agressivo para erros de cota.
 */
export function FirebaseErrorListener() {
  const { toast } = useToast();
  const lastToastTimeRef = useRef<number>(0);
  const lastQuotaErrorTimeRef = useRef<number>(0);
  
  const TOAST_THROTTLE_MS = 10000; 
  const QUOTA_THROTTLE_MS = 300000; // 5 minutos para erros de cota

  useEffect(() => {
    const handleError = (error: FirestorePermissionError) => {
      const now = Date.now();
      const message = error.message.toLowerCase();
      const isQuotaError = message.includes('quota exceeded') || 
                           message.includes('resource exhausted') ||
                           message.includes('resource_exhausted');

      if (isQuotaError) {
        // Se for erro de cota, só avisa a cada 5 minutos
        if (now - lastQuotaErrorTimeRef.current < QUOTA_THROTTLE_MS) return;
        
        toast({
          variant: 'destructive',
          title: 'Limite Diário Atingido',
          description: 'Seu plano gratuito do Firebase atingiu o limite. As automações voltarão a funcionar após o reset diário ou ao fazer upgrade para o plano Blaze.',
        });
        lastQuotaErrorTimeRef.current = now;
      } else {
        // Erro de permissão padrão (Security Rules) - a cada 10s
        if (now - lastToastTimeRef.current < TOAST_THROTTLE_MS) return;
        
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
