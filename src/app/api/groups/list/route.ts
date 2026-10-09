import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function cleanServerUrl(url?: string): string {
  let cleaned = (url || '').trim();
  if (!cleaned) cleaned = 'https://travelflow.uazapi.com';
  if (!cleaned.startsWith('http://') && !cleaned.startsWith('https://')) {
    cleaned = `https://${cleaned}`;
  }
  if (cleaned.endsWith('/')) {
    cleaned = cleaned.slice(0, -1);
  }
  return cleaned;
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const { token, serverUrl, force } = body;

    if (!token) {
      return NextResponse.json({ error: 'Token é obrigatório.' }, { status: 400 });
    }

    const baseUrl = cleanServerUrl(serverUrl);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);

    let uazapiRes: Response;
    try {
      uazapiRes = await fetch(`${baseUrl}/group/list?noParticipants=true${force ? '&force=true' : ''}`, {
        method: 'POST',
        headers: {
          'token': token,
          'apikey': token,
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify({ noParticipants: true, force: Boolean(force) }),
        signal: controller.signal,
      });

      // Se POST retornar 404/405, tenta GET de fallback
      if (!uazapiRes.ok && (uazapiRes.status === 404 || uazapiRes.status === 405)) {
        uazapiRes = await fetch(`${baseUrl}/group/list?noParticipants=true`, {
          method: 'GET',
          headers: {
            'token': token,
            'apikey': token,
            'Accept': 'application/json',
          },
          signal: controller.signal,
        });
      }
    } finally {
      clearTimeout(timeoutId);
    }

    const resText = await uazapiRes.text().catch(() => '');
    let data: any = {};
    try {
      data = JSON.parse(resText);
    } catch {
      data = { raw: resText };
    }

    if (!uazapiRes.ok) {
      const errorMsg = data.error || data.message || `Falha na UAZAPI (${uazapiRes.status}): ${resText}`;
      return NextResponse.json({ error: errorMsg, details: data }, { status: uazapiRes.status });
    }

    const groupsList: any[] = Array.isArray(data.groups)
      ? data.groups
      : Array.isArray(data)
      ? data
      : [];

    const formattedGroups = groupsList.map((g: any) => ({
      jid: g.JID || g.jid || g.id || '',
      name: g.Name || g.name || 'Grupo sem nome',
      topic: g.Topic || g.topic || '',
      participantCount: Array.isArray(g.Participants) ? g.Participants.length : (g.participantCount || 0),
    })).filter((g: any) => g.jid);

    return NextResponse.json({
      success: true,
      groups: formattedGroups,
    });
  } catch (error: any) {
    console.error('API route /api/groups/list error:', error);
    return NextResponse.json(
      { error: error?.message || 'Erro interno ao listar grupos via UAZAPI.' },
      { status: 500 }
    );
  }
}
