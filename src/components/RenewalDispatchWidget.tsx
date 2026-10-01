'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  GripHorizontal,
  X,
  Minus,
  Maximize2,
  Play,
  Pause,
  CheckCircle2,
  AlertCircle,
  Clock,
  Sparkles,
  Send,
  Loader2,
  ExternalLink,
} from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

export interface DispatchQueueItem {
  clientIds: string[];
  name: string;
  phone: string;
  subNames: string;
  status: 'pending' | 'sending' | 'sent' | 'error';
  error?: string;
  tokenUsed?: string;
}

export interface RenewalJobState {
  id: string;
  userId: string;
  isSimulation: boolean;
  status: 'running' | 'paused' | 'completed' | 'cancelled';
  currentIndex: number;
  total: number;
  delaySeconds: number;
  items: DispatchQueueItem[];
  startedAt: number;
  updatedAt: number;
}

const STORAGE_KEY_JOB = 'crm_renewal_dispatch_job';
const STORAGE_KEY_POS = 'crm_renewal_widget_pos';
const STORAGE_KEY_LEADER = 'crm_renewal_dispatch_leader';
const BROADCAST_CHANNEL_NAME = 'crm_renewal_dispatch_channel';

// Gera ID único por aba
const THIS_TAB_ID = typeof window !== 'undefined'
  ? 'tab_' + Math.random().toString(36).substring(2, 9)
  : 'server';

export function RenewalDispatchWidget() {
  const [job, setJob] = useState<RenewalJobState | null>(null);
  const [isMinimized, setIsMinimized] = useState(false);
  const [delayCountdown, setDelayCountdown] = useState<number>(0);
  const [isDragging, setIsDragging] = useState(false);
  const [isLeader, setIsLeader] = useState(false);

  // Posição flutuante (default: bottom-6, left-6)
  const [pos, setPos] = useState<{ x: number; y: number }>(() => {
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem(STORAGE_KEY_POS);
        if (saved) return JSON.parse(saved);
      } catch {}
      return { x: 24, y: window.innerHeight - 320 };
    }
    return { x: 24, y: 500 };
  });

  const widgetRef = useRef<HTMLDivElement>(null);
  const dragStartRef = useRef<{ mouseX: number; mouseY: number; initialX: number; initialY: number }>({
    mouseX: 0,
    mouseY: 0,
    initialX: 0,
    initialY: 0,
  });

  const channelRef = useRef<BroadcastChannel | null>(null);

  // Sincroniza estado com localStorage e BroadcastChannel
  const saveJobState = useCallback((newJob: RenewalJobState | null) => {
    setJob(newJob);
    if (typeof window !== 'undefined') {
      if (newJob) {
        localStorage.setItem(STORAGE_KEY_JOB, JSON.stringify(newJob));
        try {
          channelRef.current?.postMessage({ type: 'JOB_UPDATED', job: newJob });
        } catch {}
      } else {
        localStorage.removeItem(STORAGE_KEY_JOB);
        try {
          channelRef.current?.postMessage({ type: 'JOB_CLEARED' });
        } catch {}
      }
    }
  }, []);

  // 1. Carrega trabalho existente no localStorage ao montar
  useEffect(() => {
    if (typeof window === 'undefined') return;

    try {
      const savedJobStr = localStorage.getItem(STORAGE_KEY_JOB);
      if (savedJobStr) {
        const parsed = JSON.parse(savedJobStr) as RenewalJobState;
        setJob(parsed);
      }
    } catch {}

    // Canal entre abas
    try {
      channelRef.current = new BroadcastChannel(BROADCAST_CHANNEL_NAME);
      channelRef.current.onmessage = (event) => {
        if (event.data?.type === 'JOB_UPDATED' && event.data.job) {
          setJob(event.data.job);
        } else if (event.data?.type === 'JOB_CLEARED') {
          setJob(null);
        }
      };
    } catch {}

    // Evento de storage nativo
    const handleStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY_JOB) {
        if (e.newValue) {
          try {
            setJob(JSON.parse(e.newValue));
          } catch {}
        } else {
          setJob(null);
        }
      }
    };
    window.addEventListener('storage', handleStorage);

    // Ouvinte para novo job disparado via CustomEvent
    const handleStartEvent = (e: any) => {
      if (e.detail?.job) {
        const newJob = e.detail.job as RenewalJobState;
        saveJobState(newJob);
        setIsMinimized(false);
      }
    };
    window.addEventListener('START_RENEWAL_DISPATCH', handleStartEvent);

    return () => {
      window.removeEventListener('storage', handleStorage);
      window.removeEventListener('START_RENEWAL_DISPATCH', handleStartEvent);
      channelRef.current?.close();
    };
  }, [saveJobState]);

  // 2. Leader Election: Apenas uma aba executa o loop de fetch e timers
  useEffect(() => {
    if (!job || job.status !== 'running') return;

    const interval = setInterval(() => {
      try {
        const leaderStr = localStorage.getItem(STORAGE_KEY_LEADER);
        const now = Date.now();
        let currentLeader: { tabId: string; heartbeat: number } | null = null;
        if (leaderStr) {
          currentLeader = JSON.parse(leaderStr);
        }

        const isCurrentLeaderDead = !currentLeader || now - currentLeader.heartbeat > 3500;
        const amILeader = currentLeader?.tabId === THIS_TAB_ID;

        if (amILeader || isCurrentLeaderDead) {
          // Assume ou renova liderança
          localStorage.setItem(
            STORAGE_KEY_LEADER,
            JSON.stringify({ tabId: THIS_TAB_ID, heartbeat: now })
          );
          setIsLeader(true);
        } else {
          setIsLeader(false);
        }
      } catch {}
    }, 1000);

    return () => clearInterval(interval);
  }, [job]);

  // 3. Loop de Execução da Fila (apenas na aba líder!)
  useEffect(() => {
    if (!job || job.status !== 'running' || !isLeader) return;

    let isCancelled = false;

    const runNextItem = async () => {
      const idx = job.currentIndex;
      if (idx >= job.items.length) {
        // Concluído
        saveJobState({
          ...job,
          status: 'completed',
          updatedAt: Date.now(),
        });
        return;
      }

      // Marca item atual como 'sending'
      const updatedItems = [...job.items];
      updatedItems[idx] = { ...updatedItems[idx], status: 'sending' };
      const sendingJob: RenewalJobState = {
        ...job,
        items: updatedItems,
        updatedAt: Date.now(),
      };
      saveJobState(sendingJob);

      const currentItem = updatedItems[idx];

      // Dispara envio
      try {
        if (job.isSimulation) {
          // Simulação: espera 2.5s para demonstrar
          await new Promise((r) => setTimeout(r, 2500));
          if (isCancelled) return;
          updatedItems[idx] = { ...updatedItems[idx], status: 'sent' };
        } else {
          // Envio real via API
          const originUrl = typeof window !== 'undefined' ? window.location.origin : 'https://pjcrm.site';
          const res = await fetch('/api/renewal/dispatch-single', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              userId: job.userId,
              clientIds: currentItem.clientIds,
              originUrl,
            }),
          });

          const data = await res.json();
          if (isCancelled) return;

          if (res.ok && data.success) {
            updatedItems[idx] = { ...updatedItems[idx], status: 'sent', tokenUsed: data.tokenUsed };
          } else {
            updatedItems[idx] = { ...updatedItems[idx], status: 'error', error: data.error || 'Erro no envio' };
          }
        }
      } catch (err: any) {
        if (isCancelled) return;
        updatedItems[idx] = { ...updatedItems[idx], status: 'error', error: err.message || 'Falha de rede' };
      }

      const nextIndex = idx + 1;
      const isFinished = nextIndex >= updatedItems.length;

      const progressJob: RenewalJobState = {
        ...job,
        currentIndex: nextIndex,
        items: updatedItems,
        status: isFinished ? 'completed' : 'running',
        updatedAt: Date.now(),
      };
      saveJobState(progressJob);

      // Se ainda houver itens, aplica o delay anti-ban
      if (!isFinished && !isCancelled) {
        const delay = job.delaySeconds || 15;
        let remaining = delay;
        setDelayCountdown(remaining);

        while (remaining > 0 && !isCancelled) {
          await new Promise((r) => setTimeout(r, 1000));
          remaining -= 1;
          setDelayCountdown(remaining);
        }
        setDelayCountdown(0);
      }
    };

    runNextItem();

    return () => {
      isCancelled = true;
    };
  }, [job, isLeader, saveJobState]);

  // 4. Arraste (Drag & Drop via Pointer Events)
  const handlePointerDown = (e: React.PointerEvent) => {
    // Ignora se clicou em um botão
    if ((e.target as HTMLElement).closest('button')) return;

    setIsDragging(true);
    dragStartRef.current = {
      mouseX: e.clientX,
      mouseY: e.clientY,
      initialX: pos.x,
      initialY: pos.y,
    };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDragging) return;

    const deltaX = e.clientX - dragStartRef.current.mouseX;
    const deltaY = e.clientY - dragStartRef.current.mouseY;

    let newX = dragStartRef.current.initialX + deltaX;
    let newY = dragStartRef.current.initialY + deltaY;

    // Limites da janela
    const widgetWidth = isMinimized ? 280 : 360;
    const widgetHeight = isMinimized ? 52 : 300;
    const maxX = Math.max(10, window.innerWidth - widgetWidth - 10);
    const maxY = Math.max(10, window.innerHeight - widgetHeight - 10);

    newX = Math.max(10, Math.min(newX, maxX));
    newY = Math.max(10, Math.min(newY, maxY));

    setPos({ x: newX, y: newY });
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (!isDragging) return;
    setIsDragging(false);
    try {
      (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {}

    if (typeof window !== 'undefined') {
      localStorage.setItem(STORAGE_KEY_POS, JSON.stringify(pos));
    }
  };

  // Se não houver trabalho ativo, não renderiza nada
  if (!job) return null;

  const currentItem = job.items[job.currentIndex] || job.items[job.items.length - 1];
  const percent = job.total > 0 ? Math.round((job.currentIndex / job.total) * 100) : 0;
  const sentCount = job.items.filter((i) => i.status === 'sent').length;
  const errorCount = job.items.filter((i) => i.status === 'error').length;

  // Pausar / Continuar
  const togglePause = () => {
    if (!job) return;
    const nextStatus = job.status === 'running' ? 'paused' : 'running';
    saveJobState({ ...job, status: nextStatus, updatedAt: Date.now() });
  };

  // Cancelar / Fechar
  const handleClose = () => {
    if (job.status === 'running' && !job.isSimulation) {
      if (!confirm('Deseja realmente cancelar os disparos restantes de hoje?')) {
        return;
      }
    }
    saveJobState(null);
  };

  return (
    <div
      ref={widgetRef}
      style={{
        transform: `translate3d(${pos.x}px, ${pos.y}px, 0)`,
        position: 'fixed',
        left: 0,
        top: 0,
      }}
      className={cn(
        'z-[9999] select-none transition-shadow',
        isDragging ? 'cursor-grabbing opacity-95' : 'cursor-grab'
      )}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
    >
      {/* MODO MINIMIZADO (PILL ELEGANTE) */}
      {isMinimized ? (
        <div className="flex items-center gap-2.5 px-3.5 py-2 rounded-2xl bg-zinc-900/95 dark:bg-zinc-900/95 backdrop-blur-md text-white border border-zinc-700/80 shadow-2xl text-xs font-semibold">
          <GripHorizontal className="w-3.5 h-3.5 text-zinc-400 cursor-grab shrink-0" />
          <div className="flex items-center gap-1.5">
            <span
              className={cn(
                'w-2 h-2 rounded-full shrink-0',
                job.status === 'running' ? 'bg-emerald-500 animate-pulse' : 'bg-amber-400'
              )}
            />
            <span>
              {job.isSimulation ? 'Simulação:' : 'Cobranças:'} {job.currentIndex}/{job.total} ({percent}%)
            </span>
          </div>

          {delayCountdown > 0 && (
            <Badge variant="outline" className="h-5 px-1.5 bg-amber-500/20 text-amber-300 border-amber-500/40 text-[10px]">
              ⏳ {delayCountdown}s
            </Badge>
          )}

          <div className="flex items-center gap-1 ml-1">
            <button
              type="button"
              onClick={() => setIsMinimized(false)}
              className="p-1 rounded-lg hover:bg-zinc-800 text-zinc-300 hover:text-white transition-colors"
              title="Expandir painel"
            >
              <Maximize2 className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={handleClose}
              className="p-1 rounded-lg hover:bg-red-500/20 text-zinc-400 hover:text-red-400 transition-colors"
              title="Fechar"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      ) : (
        /* MODO EXPANDIDO (CARD COMPLETO) */
        <div className="w-[360px] rounded-3xl bg-white/95 dark:bg-zinc-900/95 backdrop-blur-md border border-zinc-200 dark:border-zinc-800 shadow-2xl overflow-hidden p-4 space-y-3.5 text-zinc-900 dark:text-zinc-100 animate-in fade-in zoom-in-95 duration-150">
          {/* TOPO COM ALÇA DE ARRASTE E CONTROLES */}
          <div className="flex items-center justify-between border-b border-zinc-100 dark:border-zinc-800/80 pb-2.5">
            <div className="flex items-center gap-2 cursor-grab">
              <GripHorizontal className="w-4 h-4 text-zinc-400 shrink-0" />
              <div className="flex items-center gap-1.5">
                <span
                  className={cn(
                    'w-2.5 h-2.5 rounded-full shrink-0',
                    job.status === 'running'
                      ? 'bg-emerald-500 animate-pulse'
                      : job.status === 'completed'
                      ? 'bg-blue-500'
                      : 'bg-amber-400'
                  )}
                />
                <span className="font-extrabold text-xs tracking-tight">
                  {job.isSimulation ? 'Demonstração de Disparo' : 'Disparo de Cobranças'}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setIsMinimized(true)}
                className="p-1.5 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-500 hover:text-zinc-900 dark:hover:text-white transition-colors"
                title="Minimizar para cantinho"
              >
                <Minus className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={handleClose}
                className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-950/40 text-zinc-400 hover:text-red-600 transition-colors"
                title="Fechar e cancelar"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* BADGE DE MODO */}
          {job.isSimulation && (
            <div className="flex items-center justify-between bg-purple-50 dark:bg-purple-950/40 border border-purple-200 dark:border-purple-800/50 rounded-xl px-2.5 py-1 text-[11px] text-purple-700 dark:text-purple-300 font-semibold">
              <span className="flex items-center gap-1">
                <Sparkles className="w-3 h-3 text-purple-600" /> Modo Simulação
              </span>
              <span className="text-[10px] text-purple-500">Nenhuma mensagem real enviada</span>
            </div>
          )}

          {/* BARRA DE PROGRESSO */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs font-bold">
              <span className="text-zinc-600 dark:text-zinc-400">Progresso dos Envios:</span>
              <span className="text-emerald-600 dark:text-emerald-400 font-mono">
                {job.currentIndex} / {job.total} ({percent}%)
              </span>
            </div>
            <Progress value={percent} className="h-2.5 bg-zinc-100 dark:bg-zinc-800" />
          </div>

          {/* STATS RÁPIDOS */}
          <div className="grid grid-cols-2 gap-2 text-[11px] font-semibold">
            <div className="bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/40 rounded-xl p-2 flex items-center justify-between text-emerald-700 dark:text-emerald-400">
              <span className="flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> Sucessos
              </span>
              <span className="font-mono font-bold">{sentCount}</span>
            </div>
            <div className="bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-700/50 rounded-xl p-2 flex items-center justify-between text-zinc-600 dark:text-zinc-300">
              <span className="flex items-center gap-1">
                <AlertCircle className="w-3.5 h-3.5 text-zinc-400" /> Falhas
              </span>
              <span className="font-mono font-bold">{errorCount}</span>
            </div>
          </div>

          {/* CLIENTE ATUAL OU STATUS DO INTERVALO */}
          <div className="p-3 rounded-2xl bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-200/70 dark:border-zinc-700/60 space-y-1 text-xs">
            {job.status === 'completed' ? (
              <div className="text-center py-1 text-emerald-600 dark:text-emerald-400 font-bold flex items-center justify-center gap-1.5">
                <CheckCircle2 className="w-4 h-4" />
                <span>Disparos finalizados com sucesso!</span>
              </div>
            ) : job.status === 'paused' ? (
              <div className="text-center py-1 text-amber-600 dark:text-amber-400 font-semibold flex items-center justify-center gap-1.5">
                <Pause className="w-3.5 h-3.5" />
                <span>Disparo pausado. Clique em Continuar.</span>
              </div>
            ) : delayCountdown > 0 ? (
              <div className="space-y-1">
                <div className="flex items-center justify-between text-[11px] font-semibold text-amber-600 dark:text-amber-400">
                  <span className="flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5 animate-spin" /> Intervalo anti-banimento
                  </span>
                  <span className="font-mono font-bold">{delayCountdown}s</span>
                </div>
                <div className="text-[11px] text-zinc-500 truncate">
                  Próximo: <strong>{job.items[job.currentIndex]?.name || 'Próximo cliente'}</strong>
                </div>
              </div>
            ) : currentItem ? (
              <div>
                <div className="text-[10px] uppercase font-bold text-muted-foreground flex items-center gap-1">
                  <Send className="w-3 h-3 text-emerald-600" /> Enviando agora:
                </div>
                <div className="font-bold text-zinc-900 dark:text-zinc-100 truncate">
                  {currentItem.name}
                </div>
                <div className="text-[11px] text-zinc-500 dark:text-zinc-400 truncate">
                  {currentItem.subNames || currentItem.phone}
                </div>
              </div>
            ) : null}
          </div>

          {/* BOTÕES DE CONTROLE */}
          <div className="flex items-center gap-2 pt-1">
            {job.status !== 'completed' ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={togglePause}
                className="flex-1 h-8 text-xs font-bold gap-1.5 rounded-xl cursor-pointer"
              >
                {job.status === 'running' ? (
                  <>
                    <Pause className="w-3.5 h-3.5 text-amber-600" /> Pausar
                  </>
                ) : (
                  <>
                    <Play className="w-3.5 h-3.5 text-emerald-600" /> Continuar
                  </>
                )}
              </Button>
            ) : (
              <Button
                type="button"
                variant="default"
                size="sm"
                onClick={handleClose}
                className="flex-1 h-8 text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl cursor-pointer"
              >
                Concluir e Fechar
              </Button>
            )}

            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleClose}
              className="h-8 text-xs text-zinc-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 rounded-xl cursor-pointer"
            >
              Cancelar
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
