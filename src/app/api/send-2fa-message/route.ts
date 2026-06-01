// src/app/api/send-2fa-message/route.ts
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { getFirestore, doc, getDoc } from 'firebase/firestore';
import { initializeFirebase } from '@/firebase';

// This endpoint expects a JSON body with:
// {
//   "message": "Your 2FA code is {codigo}",
//   "phoneNumber": "5511999999999",
//   "userId": "<firebase uid>"
// }
// It will load the user's settings, pick the `twoFactorZapId` token (or fallback to `selectedZapId`),
// and forward the request to the existing webhook.

export async function POST(request: Request) {
  // Authenticate request (must be an authenticated admin/session)
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });
  }

  const body = await request.json();
  const { message, phoneNumber, userId } = body;

  if (!message || !phoneNumber || !userId) {
    return NextResponse.json({ error: 'message, phoneNumber, and userId are required' }, { status: 400 });
  }

  // Load user settings to get the twoFactorZapId (or fallback to selectedZapId)
  const { initializeFirebase: init } = await import('@/firebase');
  const { firestore } = init();
  const settingsDoc = doc(firestore, 'users', userId, 'settings', 'config');
  const settingsSnap = await getDoc(settingsDoc);
  const settings = settingsSnap.exists() ? (settingsSnap.data() as any) : {};
  const token = settings.twoFactorZapId ?? settings.selectedZapId;
  if (!token) {
    return NextResponse.json({ error: 'No Zap token configured for 2FA' }, { status: 400 });
  }

  // Ensure phone number starts with +55
  const formattedPhoneNumber = `+55${phoneNumber.replace(/\D/g, '')}`;
  const formattedMessage = message.replace(/\n/g, '\\n');

  const webhookUrl = 'https://n8nbeta.typeflow.app.br/webhook/235c79d0-71ed-4a43-aa3c-5c0cf1de2580';

  const webhookResponse = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      text: formattedMessage,
      number: formattedPhoneNumber,
      token,
    }),
  });

  if (!webhookResponse.ok) {
    const errorText = await webhookResponse.text();
    console.error(`2FA webhook failed: ${webhookResponse.status} - ${errorText}`);
    return NextResponse.json({ error: 'Failed to send 2FA message', details: errorText }, { status: webhookResponse.status });
  }

  const responseData = await webhookResponse.json();
  return NextResponse.json({ success: true, data: responseData });
}
