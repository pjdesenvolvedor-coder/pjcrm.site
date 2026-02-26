
'use client';

import { doc } from 'firebase/firestore';
import { useFirebase, useDoc, useMemoFirebase } from '@/firebase';
import { Megaphone, X } from 'lucide-react';
import type { SystemAlert } from '@/lib/types';
import { useState, useEffect } from 'react';

export function SystemNotification() {
  const { firestore } = useFirebase();
  const [isDismissed, setIsDismissed] = useState(false);

  const alertDocRef = useMemoFirebase(() => {
    if (!firestore) return null;
    return doc(firestore, 'system_alerts', 'current');
  }, [firestore]);

  const { data: alertData } = useDoc<SystemAlert>(alertDocRef);

  // Reset dismissal when message changes
  useEffect(() => {
    setIsDismissed(false);
  }, [alertData?.instanceId]);

  if (!alertData?.isActive || isDismissed) {
    return null;
  }

  return (
    <div className="bg-primary text-primary-foreground py-2 px-4 flex items-center justify-between shadow-md animate-in slide-in-from-top duration-300">
      <div className="flex items-center gap-3 mx-auto">
        <Megaphone className="h-4 w-4 animate-bounce" />
        <p className="text-sm font-medium">{alertData.message}</p>
      </div>
      <button 
        onClick={() => setIsDismissed(true)}
        className="p-1 hover:bg-white/20 rounded-full transition-colors"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
