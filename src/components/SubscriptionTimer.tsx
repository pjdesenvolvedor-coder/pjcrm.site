'use client';

import { useState, useEffect } from 'react';
import { useUser, useFirebase, useDoc, useMemoFirebase } from '@/firebase';
import { doc, Timestamp } from 'firebase/firestore';
import type { UserProfile } from '@/lib/types';
import { differenceInSeconds } from 'date-fns';
import { Clock } from 'lucide-react';

function formatDuration(seconds: number) {
    if (seconds < 0) return "Expirado";

    const days = Math.floor(seconds / 86400);
    seconds %= 86400;
    const hours = Math.floor(seconds / 3600);
    seconds %= 3600;
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.floor(seconds % 60);

    if (days > 0) {
        return `${days}d ${hours}h`;
    }
    if (hours > 0) {
        return `${hours}h ${minutes}m`;
    }
    if (minutes > 0) {
        return `${minutes}m ${remainingSeconds}s`;
    }
    return `${remainingSeconds}s`;
}


export function SubscriptionTimer() {
    const { user } = useUser();
    const { firestore } = useFirebase();
    const [remainingTime, setRemainingTime] = useState<string | null>(null);

    const userDocRef = useMemoFirebase(() => {
        if (!user) return null;
        return doc(firestore, 'users', user.uid);
    }, [firestore, user]);

    const { data: userProfile } = useDoc<UserProfile>(userDocRef);

    useEffect(() => {
        if (userProfile?.role === 'Admin' || !userProfile?.subscriptionPlan || !userProfile?.subscriptionEndDate) {
            setRemainingTime(null);
            return;
        }

        const subscriptionEndDate = userProfile.subscriptionEndDate.toDate();

        const intervalId = setInterval(() => {
            const now = new Date();
            const totalSeconds = differenceInSeconds(subscriptionEndDate, now);
            
            if (totalSeconds < 0) {
                setRemainingTime("Expirado");
                clearInterval(intervalId);
            } else {
                setRemainingTime(formatDuration(totalSeconds));
            }
        }, 1000);

        return () => clearInterval(intervalId);

    }, [userProfile]);

    if (!remainingTime) {
        return null;
    }

    return (
        <div className="fixed bottom-4 right-4 z-50">
            <div className="flex items-center gap-2 rounded-full bg-background border shadow-lg px-4 py-2 text-sm font-medium">
                <Clock className="h-4 w-4 animate-spin-slow" />
                <span>Assinatura: {remainingTime}</span>
            </div>
        </div>
    );
}
