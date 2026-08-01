'use client';

import { useEffect } from 'react';

const LAST_CRON_KEY = 'pjcrm_cron_last_run';

/**
 * Upsell2MessageHandler
 * 
 * Dispara o /api/cron/run no servidor em segundo plano.
 * Possui trava no localStorage para que somente 1 aba execute a cada 25 segundos,
 * evitando duplicações mesmo com múltiplos navegadores/abas abertas.
 */
export function Upsell2MessageHandler() {
    useEffect(() => {
        const triggerCron = () => {
            const now = Date.now();
            const lastRunStr = localStorage.getItem(LAST_CRON_KEY);
            const lastRun = lastRunStr ? parseInt(lastRunStr, 10) : 0;

            // Trava de 25s entre abas para evitar disparo simultâneo
            if (now - lastRun < 25000) {
                return;
            }

            localStorage.setItem(LAST_CRON_KEY, now.toString());
            fetch('/api/cron/run').catch(() => {});
        };

        // Dispara uma vez ao carregar
        triggerCron();

        // Dispara a cada 30 segundos (somente a aba que respeitar o intervalo de 25s executará)
        const interval = setInterval(triggerCron, 30000);
        return () => clearInterval(interval);
    }, []);

    return null;
}
