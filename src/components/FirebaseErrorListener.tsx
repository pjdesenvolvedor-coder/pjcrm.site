'use client';

import { useState, useEffect, useRef } from 'react';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError } from '@/firebase/errors';
import { useToast } from '@/hooks/use-toast';

/**
 * Escuta erros de permissão e cota do Firestore e exibe como toasts amigáveis.
 * Implementa um throttle agressivo para evitar que a tela "pisque" com erros repetidos.
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
      const message = error.message?.toLowerCase() || '';
      
      // Identifica se é um erro de cota excedida (limite do plano gratuito)
      const isQuotaError = message.includes('quota exceeded') || 
                           message.includes('resource exhausted') ||
                           message.includes('resource_exhausted') ||
                           message.includes('limit exceeded') ||
                           (error as any).code === 'resource-exhausted';

      if (isQuotaError) {
        // Se for erro de cota, só avisa uma vez a cada 5 minutos para não irritar o usuário
        if (now - lastQuotaErrorTimeRef.current < QUOTA_THROTTLE_MS) return;
        
        toast({
          variant: 'destructive',
          title: 'Limite Diário Atingido',
          description: 'Seu plano gratuito do Firebase atingiu o limite de uso. As automações e salvamento de dados voltarão a funcionar após o reset diário (meia-noite) ou ao fazer upgrade para o plano Blaze no console do Firebase.',
        });
        lastQuotaErrorTimeRef.current = now;
      } else {
        // Erro de permissão padrão (Security Rules) - avisa a cada 10s no máximo
        if (now - lastToastTimeRef.current < TOAST_THROTTLE_MS) return;
        
        toast({
          variant: 'destructive',
          title: 'Erro de Acesso',
          description: 'Houve um problema de permissão ou conexão com o banco de dados.',
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
