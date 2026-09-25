import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const token = body?.token;
    const phone = body?.phone;

    if (!token) {
      return NextResponse.json({ error: 'Token é obrigatório.' }, { status: 400 });
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 12000);

    const payload: any = {};
    if (phone) {
      payload.phone = String(phone).replace(/\D/g, '');
    }

    let uazapiRes: Response;
    try {
      uazapiRes = await fetch('https://travelflow.uazapi.com/instance/connect', {
        method: 'POST',
        headers: {
          'token': token,
          'apikey': token,
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeoutId);
    }

    if (!uazapiRes.ok) {
      const errText = await uazapiRes.text().catch(() => '');
      return NextResponse.json(
        { error: `Falha na API UAZAPI (${uazapiRes.status}): ${errText || 'Erro desconhecido'}` },
        { status: uazapiRes.status }
      );
    }

    const data = await uazapiRes.json().catch(() => null);
    if (!data) {
      return NextResponse.json({ error: 'Resposta vazia da API UAZAPI.' }, { status: 500 });
    }

    // A UAZAPI retorna: { instance: { qrcode: "data:image/png;base64,...", status: "connecting", paircode: "..." } }
    const inst = data.instance || {};
    const qrCodeValue = inst.qrcode || data.qrcode || inst.qr || data.qr || '';
    const pairCode = inst.paircode || data.paircode || '';

    return NextResponse.json({
      success: true,
      qrcode: qrCodeValue,
      paircode: pairCode,
      status: inst.status || data.status || 'connecting',
      raw: data,
    });

  } catch (error: any) {
    console.error('[api/connect] Error:', error);
    return NextResponse.json(
      { error: error?.message || 'Erro ao conectar à instância do WhatsApp.' },
      { status: 500 }
    );
  }
}
