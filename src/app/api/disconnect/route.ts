import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const token = body?.token;

    if (!token) {
      return NextResponse.json({ error: 'Token é obrigatório.' }, { status: 400 });
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    let uazapiRes: Response;
    try {
      uazapiRes = await fetch('https://travelflow.uazapi.com/instance/disconnect', {
        method: 'POST',
        headers: {
          'token': token,
          'apikey': token,
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify({}),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeoutId);
    }

    if (!uazapiRes.ok) {
      const errText = await uazapiRes.text().catch(() => '');
      return NextResponse.json(
        { error: `Falha ao desconectar (${uazapiRes.status}): ${errText || 'Erro desconhecido'}` },
        { status: uazapiRes.status }
      );
    }

    const data = await uazapiRes.json().catch(() => ({}));

    return NextResponse.json({
      success: true,
      status: 'disconnected',
      data,
    });

  } catch (error: any) {
    console.error('[api/disconnect] Error:', error);
    return NextResponse.json(
      { error: error?.message || 'Erro ao desconectar instância.' },
      { status: 500 }
    );
  }
}
