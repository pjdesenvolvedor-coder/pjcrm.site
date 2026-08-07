import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const token = body.token;

    if (!token) {
      return NextResponse.json({ error: 'Token is required' }, { status: 400 });
    }

    // 1. Tenta consulta direta na UAZAPI (GET /instance/status)
    try {
      const uazapiRes = await fetch('https://pjcontas.uazapi.com/instance/status', {
        method: 'GET',
        headers: {
          'token': token,
          'apikey': token,
          'Accept': 'application/json',
        },
      });

      if (uazapiRes.ok) {
        const data = await uazapiRes.json().catch(() => null);
        if (data) {
          console.log('[api/status] UAZAPI status payload:', JSON.stringify(data));
          const inst = data.instance || data;
          const rawStatus = String(inst.status || inst.state || inst.connectionStatus || '').toLowerCase().trim();

          let status: 'connected' | 'connecting' | 'disconnected' = 'disconnected';
          // UAZAPI / Baileys costuma retornar 'open', 'connected', 'authenticated', 'inChat' quando conectado
          if (['connected', 'open', 'inchat', 'authenticated'].includes(rawStatus)) {
            status = 'connected';
          } else if (['connecting', 'pair', 'qrcode', 'opening'].includes(rawStatus)) {
            status = 'connecting';
          }

          const nomeperfil = inst.profileName || inst.nomeperfil || inst.name || inst.pushname || inst.ownerName || inst.phone || '';
          const fotoperfil = inst.profilePicUrl || inst.fotoperfil || inst.profilePictureUrl || inst.profilePic || inst.picture || '';

          return NextResponse.json({ status, nomeperfil, fotoperfil, rawStatus });
        }
      }
    } catch (e: any) {
      console.error('[api/status] UAZAPI direct fetch failed:', e?.message);
    }

    // 2. Fallback para o Webhook n8n antigo se a UAZAPI direta falhar ou não retornar data
    try {
      const webhookUrl = 'https://pjempreendimentos.n8nready.com.br/webhook/c8389fdb-5074-41aa-a452-42b3a99ebf1f';
      const webhookRes = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'token': token },
        body: JSON.stringify({ token }),
      });

      if (webhookRes.ok) {
        const rawText = await webhookRes.text();
        if (rawText && rawText.trim()) {
          const data = JSON.parse(rawText);
          const statusData = Array.isArray(data) ? data[0] : data;
          if (statusData) {
            const rawS = String(statusData.status || statusData.state || '').toLowerCase().trim();
            const status = (['connected', 'open', 'inchat', 'authenticated'].includes(rawS)) ? 'connected' : (['connecting', 'pair', 'qrcode', 'opening'].includes(rawS) ? 'connecting' : 'disconnected');
            return NextResponse.json({
              status,
              nomeperfil: statusData.nomeperfil || statusData.profileName || '',
              fotoperfil: statusData.fotoperfil || statusData.profilePicUrl || '',
            });
          }
        }
      }
    } catch (e: any) {
      console.error('[api/status] Webhook n8n fallback failed:', e?.message);
    }

    return NextResponse.json({ status: 'disconnected', nomeperfil: '', fotoperfil: '' });
  } catch (error: any) {
    console.error('[api/status] Route handler error:', error);
    return NextResponse.json({ status: 'disconnected', nomeperfil: '', fotoperfil: '' });
  }
}
