import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function formatPhoneWith55(phone: string): string {
  if (!phone) return '';
  let digits = phone.replace(/\D/g, '');
  if (!digits) return '';
  if (!digits.startsWith('55') && (digits.length === 10 || digits.length === 11)) {
    digits = '55' + digits;
  }
  return digits;
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const { name, number, token } = body;

    if (!name || !number || !token) {
      return NextResponse.json(
        { error: 'Nome, número e token são obrigatórios.' },
        { status: 400 }
      );
    }

    const formattedNumber = formatPhoneWith55(number);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    let uazapiRes: Response;
    try {
      uazapiRes = await fetch('https://travelflow.uazapi.com/contact/add', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'token': token,
          'apikey': token,
        },
        body: JSON.stringify({
          number: formattedNumber,
          name: String(name).trim(),
        }),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeoutId);
    }

    const text = await uazapiRes.text().catch(() => '');
    let data: any = {};
    try {
      data = JSON.parse(text);
    } catch {
      data = { raw: text };
    }

    if (!uazapiRes.ok) {
      console.error(`[api/contact/add] UAZAPI failed (${uazapiRes.status}):`, text);
      return NextResponse.json(
        { error: 'Falha ao adicionar contato na UAZAPI.', details: data },
        { status: uazapiRes.status }
      );
    }

    return NextResponse.json({ success: true, data });

  } catch (error: any) {
    console.error('[api/contact/add] Error:', error);
    return NextResponse.json(
      { error: error?.message || 'Erro ao adicionar contato.' },
      { status: 500 }
    );
  }
}
