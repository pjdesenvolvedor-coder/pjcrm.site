import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(request: Request) {
  const disconnected = NextResponse.json({ status: 'disconnected', nomeperfil: '', fotoperfil: '' });

  let token = '';

  try {
    const body = await request.json();
    token = body?.token ?? '';
  } catch {
    return disconnected;
  }

  if (!token) {
    return disconnected;
  }

  try {
    // AbortController para garantir timeout de 8s e não deixar o Vercel cancelar a request
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);

    let uazapiRes: Response;
    try {
      uazapiRes = await fetch('https://pjcontas.uazapi.com/instance/status', {
        method: 'GET',
        headers: {
          'token': token,
          'Accept': 'application/json',
        },
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeoutId);
    }

    if (!uazapiRes.ok) {
      return disconnected;
    }

    let data: any = null;
    try {
      data = await uazapiRes.json();
    } catch {
      return disconnected;
    }

    if (!data || typeof data !== 'object') {
      return disconnected;
    }

    // Payload real da UAZAPI:
    // { "instance": { "status": "connected", "profileName": "...", "profilePicUrl": "..." },
    //   "status": { "connected": true, "loggedIn": true } }
    const inst = data.instance && typeof data.instance === 'object' ? data.instance : {};
    const statusObj = data.status && typeof data.status === 'object' ? data.status : {};

    let status: 'connected' | 'connecting' | 'disconnected' = 'disconnected';

    if (statusObj.connected === true || statusObj.loggedIn === true) {
      status = 'connected';
    } else {
      const rawStatus = String(inst.status || '').toLowerCase().trim();
      if (['connected', 'open', 'inchat', 'authenticated'].includes(rawStatus)) {
        status = 'connected';
      } else if (['connecting', 'pair', 'qrcode', 'opening'].includes(rawStatus)) {
        status = 'connecting';
      }
    }

    const nomeperfil = String(inst.profileName || inst.name || inst.pushname || '');
    const fotoperfil = String(inst.profilePicUrl || inst.profilePic || '');

    return NextResponse.json({ status, nomeperfil, fotoperfil });

  } catch (e: any) {
    // AbortError = timeout, outros = falha de rede
    console.error('[api/status] error:', e?.name, e?.message);
    return disconnected;
  }
}
