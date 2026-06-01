// src/app/(app)/send-message/page.tsx
'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function SendMessagePage() {
  const router = useRouter();
  useEffect(() => {
    // Redirect to 2FA settings where cobrança Zap token is used
    router.replace('/app/(app)/settings/2fa');
  }, [router]);
  return null;
}
