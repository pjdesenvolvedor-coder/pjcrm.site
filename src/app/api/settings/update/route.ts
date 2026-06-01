// src/app/api/settings/update/route.ts
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { getFirestore, doc, setDoc } from 'firebase/firestore';
import { initializeFirebase } from '@/firebase';
import { z } from 'zod';

// Validate the incoming payload
const schema = z.object({
  twoFactorTemplate: z.string().optional(),
  zapTokens: z.array(
    z.object({
      id: z.string(),
      token: z.string().min(10),
      name: z.string().optional(),
    })
  ).optional(),
  selectedZapId: z.string().optional(),
});

export async function PATCH(request: Request) {
  // Authenticate user
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });
  }

  const userId = session.user.id as string; // Assuming the session contains user.id
  const body = await request.json();
  const parseResult = schema.safeParse(body);
  if (!parseResult.success) {
    return NextResponse.json({ error: 'Invalid payload', details: parseResult.error.errors }, { status: 400 });
  }

  const { initializeFirebase: init } = await import('@/firebase');
  const { firestore } = init();

  const docRef = doc(firestore, 'users', userId, 'settings', 'config');
  await setDoc(docRef, parseResult.data, { merge: true });

  return NextResponse.json({ message: 'Settings updated' }, { status: 200 });
}
