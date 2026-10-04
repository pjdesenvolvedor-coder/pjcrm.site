import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function cleanServerUrl(url: string): string {
  let cleaned = (url || '').trim();
  if (!cleaned) cleaned = 'https://travelflow.uazapi.com';
  if (cleaned.endsWith('/')) {
    cleaned = cleaned.slice(0, -1);
  }
  return cleaned;
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { action, serverUrl, instanceToken, webhookUrl } = body;

    if (!instanceToken) {
      return NextResponse.json({ error: 'Token da instância não informado.' }, { status: 400 });
    }

    const base = cleanServerUrl(serverUrl);
    const headers: Record<string, string> = {
      'token': instanceToken,
      'apikey': instanceToken,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    };

    if (action === 'status') {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 8000);

        const res = await fetch(`${base}/instance/status`, {
          method: 'GET',
          headers,
          signal: controller.signal,
        });
        clearTimeout(timeoutId);

        if (!res.ok) {
          const errText = await res.text();
          return NextResponse.json({
            status: 'disconnected',
            rawStatus: res.status,
            message: errText || 'Instância não respondeu com sucesso.',
          });
        }

        const data = await res.json();
        const inst = data.instance || {};
        const statusObj = data.status || {};

        let status = 'disconnected';
        if (statusObj.connected === true || statusObj.loggedIn === true) {
          status = 'connected';
        } else {
          const raw = String(inst.status || '').toLowerCase().trim();
          if (['connected', 'open', 'inchat', 'authenticated'].includes(raw)) {
            status = 'connected';
          } else if (['connecting', 'pair', 'qrcode', 'opening'].includes(raw)) {
            status = 'connecting';
          }
        }

        return NextResponse.json({
          status,
          instanceName: inst.name || inst.pushname || inst.profileName || '',
          profilePicUrl: inst.profilePicUrl || inst.profilePic || '',
          raw: data,
        });
      } catch (err: any) {
        return NextResponse.json({
          status: 'disconnected',
          error: err.message || 'Timeout ou erro ao consultar status.',
        });
      }
    }

    if (action === 'connect') {
      try {
        const res = await fetch(`${base}/instance/connect`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ browser: 'auto' }),
        });

        const data = await res.json().catch(() => ({}));
        
        let qrcode = data.qrcode || data.qr || data.instance?.qrcode || null;
        if (qrcode && !qrcode.startsWith('data:image') && !qrcode.startsWith('http')) {
          qrcode = `data:image/png;base64,${qrcode}`;
        }

        return NextResponse.json({
          success: res.ok,
          qrcode,
          data,
        });
      } catch (err: any) {
        return NextResponse.json({ error: err.message || 'Falha ao solicitar conexão.' }, { status: 500 });
      }
    }

    if (action === 'disconnect') {
      try {
        const res = await fetch(`${base}/instance/disconnect`, {
          method: 'POST',
          headers,
        });
        const data = await res.json().catch(() => ({}));
        return NextResponse.json({ success: res.ok, data });
      } catch (err: any) {
        return NextResponse.json({ error: err.message || 'Falha ao desconectar.' }, { status: 500 });
      }
    }

    if (action === 'set_webhook') {
      try {
        const targetUrl = webhookUrl || 'https://www.pjcrm.site/api/flows/webhook';
        
        const res = await fetch(`${base}/webhook`, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            enabled: true,
            url: targetUrl,
            events: ['messages'],
            excludeMessages: ['wasSentByApi'],
          }),
        });

        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          return NextResponse.json({
            error: data.error || 'Erro ao registrar webhook na UazAPI.',
            details: data,
          }, { status: res.status });
        }

        return NextResponse.json({
          success: true,
          registeredUrl: targetUrl,
          data,
        });
      } catch (err: any) {
        return NextResponse.json({ error: err.message || 'Falha de conexão com UazAPI ao registrar webhook.' }, { status: 500 });
      }
    }

    return NextResponse.json({ error: 'Ação inválida.' }, { status: 400 });

  } catch (error: any) {
    console.error('[api/flows/uazapi] error:', error);
    return NextResponse.json({ error: error.message || 'Erro interno do servidor.' }, { status: 500 });
  }
}
