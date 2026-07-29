'use client';

import { useEffect } from 'react';

/**
 * Upsell2MessageHandler
 * 
 * Safely triggers server-side /api/cron/run every 30 seconds in the background.
 * Atomic transactions on /api/cron/run guarantee zero duplicate messages across tabs or attendants.
 */
export function Upsell2MessageHandler() {
    useEffect(() => {
        const triggerCron = () => {
            fetch('/api/cron/run').catch(() => {});
        };

        // Fire once immediately on load
        triggerCron();

        // Fire every 30 seconds
        const interval = setInterval(triggerCron, 30000);
        return () => clearInterval(interval);
    }, []);

    return null;
}
