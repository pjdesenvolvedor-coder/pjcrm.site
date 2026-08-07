import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const token = body.token;

    if (!token) {
      return NextResponse.json({ error: 'Token is required' }, { status: 400 });
    }

    // Consulta direta na UAZAPI GET /instance/status
    // Retorno real da API:
    // {
    //   "instance": { "status": "connected", "profileName": "...", "profilePicUrl": "...", ... },
    //   "status": { "connected": true, "loggedIn": true, ... }
    // }
    try {
      const uazapiRes = await fetch('https://pjcontas.uazapi.com/instance/status', {
        method: 'GET',
        headers: {
          'token': token,
          'Accept': 'application/json',
        },
      });

      if (uazapiRes.ok) {
        const data = await uazapiRes.json().catch(() => null);
        if (data) {
          const inst = data.instance || {};
          const statusObj = data.status || {};

          // Prioriza o booleano "connected" do objeto status.connected
          // Fallback para inst.status string
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

          const nomeperfil = inst.profileName || inst.name || inst.pushname || inst.owner || '';
          const fotoperfil = inst.profilePicUrl || inst.profilePic || inst.picture || '';

          return NextResponse.json({ status, nomeperfil, fotoperfil });
        }
      }

      // Se a UAZAPI retornar erro (ex: 401, 404), instância desconectada ou token inválido
      return NextResponse.json({ status: 'disconnected', nomeperfil: '', fotoperfil: '' });

    } catch (e: any) {
      console.error('[api/status] UAZAPI fetch failed:', e?.message);
      return NextResponse.json({ status: 'disconnected', nomeperfil: '', fotoperfil: '' });
    }

  } catch (error: any) {
    console.error('[api/status] Route handler error:', error);
    return NextResponse.json({ status: 'disconnected', nomeperfil: '', fotoperfil: '' });
  }
}
