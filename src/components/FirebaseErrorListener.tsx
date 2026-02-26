'use client';

import { useState, useEffect, useRef } from 'react';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError } from '@/firebase/errors';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { AlertTriangle, Clock } from 'lucide-react';

/**
 * Escuta erros de permissão e cota do Firestore.
 * Quando o limite de cota é atingido, exibe uma tela de bloqueio (frosted overlay)
 * para evitar que o usuário insira dados que não seriam salvos.
 */
export function FirebaseErrorListener() {
  const { toast } = useToast();
  const [isQuotaExceeded, setIsQuotaExceeded] = useState(false);
  const lastToastTimeRef = useRef<number>(0);
  
  const TOAST_THROTTLE_MS = 10000; 

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
        // Ativa o bloqueio total do sistema
        setIsQuotaExceeded(true);
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

  // Se a cota não foi excedida, não renderiza nada
  if (!isQuotaExceeded) return null;

  // Tela de bloqueio "frosted" (fosca) que impede qualquer interação
  return (
    <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-background/60 backdrop-blur-md p-4 animate-in fade-in duration-500">
      <Card className="max-w-md w-full shadow-2xl border-2 border-destructive/50 overflow-hidden">
        <div className="h-2 bg-destructive animate-pulse" />
        <CardHeader className="text-center pb-2 pt-8">
          <div className="flex justify-center mb-4">
            <div className="bg-destructive/10 p-4 rounded-full">
              <AlertTriangle className="h-12 w-12 text-destructive animate-bounce" />
            </div>
          </div>
          <CardTitle className="text-2xl font-bold tracking-tight text-foreground">
            Atualização do Sistema
          </CardTitle>
        </CardHeader>
        <CardContent className="text-center space-y-6 px-8 pb-10">
          <div className="space-y-2">
            <p className="text-muted-foreground text-lg">
              Limite diário de processamento atingido.
            </p>
            <div className="inline-flex items-center gap-2 px-4 py-2 bg-muted rounded-full text-primary font-bold">
              <Clock className="h-5 w-5" />
              <span>Aguarde até 00:01</span>
            </div>
          </div>
          
          <div className="text-sm text-muted-foreground leading-relaxed bg-accent/50 p-4 rounded-lg border border-border">
            <p>
              Para garantir a segurança dos seus dados e evitar perda de informações, o acesso foi pausado temporariamente até o reset automático da cota diária.
            </p>
          </div>

          <p className="text-[10px] uppercase tracking-widest text-muted-foreground/50 font-semibold">
            Status: Quota Exceeded (Spark Plan)
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
