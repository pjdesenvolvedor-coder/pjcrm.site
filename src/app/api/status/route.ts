import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const token = body.token;

    if (!token) {
      return NextResponse.json({ error: 'Token is required' }, { status: 400 });
    }

    const webhookUrl = 'https://pjempreendimentos.n8nready.com.br/webhook/c8389fdb-5074-41aa-a452-42b3a99ebf1f';

    const webhookResponse = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'token': token,
      },
      body: JSON.stringify({ token: token }),
    });

    if (webhookResponse.ok) {
      const rawText = await webhookResponse.text();
      if (rawText && rawText.trim() !== '') {
        try {
          const data = JSON.parse(rawText);
          return NextResponse.json(data);
        } catch (parseError) {
          console.error('Failed to parse webhook response as JSON:', rawText, parseError);
        }
      }
    }

    // Fallback caso o webhook falhe: tenta consultar a UAZAPI direta
    try {
      const uazapiRes = await fetch('https://pjcontas.uazapi.com/instance/status', {
        method: 'GET',
        headers: { 'token': token, 'apikey': token },
      });
      if (uazapiRes.ok) {
        const json = await uazapiRes.json().catch(() => null);
        if (json) {
          const inst = json.instance || json;
          const rawStatus = inst.status || inst.state || 'disconnected';
          const status = (rawStatus === 'connected' || rawStatus === 'connecting') ? rawStatus : 'disconnected';
          const nomeperfil = inst.profileName || inst.nomeperfil || inst.name || inst.pushname || '';
          const fotoperfil = inst.profilePicUrl || inst.fotoperfil || inst.profilePictureUrl || inst.profilePic || '';
          return NextResponse.json({ status, nomeperfil, fotoperfil });
        }
      }
    } catch (e) {
      console.error('Fallback UAZAPI status error:', e);
    }

    return NextResponse.json({ status: 'disconnected', nomeperfil: '', fotoperfil: '' });
  } catch (error: any) {
    console.error('API route error:', error);
    return NextResponse.json({ status: 'disconnected', nomeperfil: '', fotoperfil: '', error: 'Internal Server Error' });
  }
}
