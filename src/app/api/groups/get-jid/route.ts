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
    const { groupCode, token, serverUrl } = body;

    if (!groupCode || !token) {
      return NextResponse.json(
        { error: 'Código de convite/JID e token são obrigatórios.' },
        { status: 400 }
      );
    }

    const trimmedInput = String(groupCode).trim();
    const baseUrl = cleanServerUrl(serverUrl);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);

    let uazapiRes: Response;

    try {
      // Se já for um JID de grupo (terminando com @g.us), consulta diretamente pelo /group/info
      if (trimmedInput.endsWith('@g.us')) {
        uazapiRes = await fetch(`${baseUrl}/group/info`, {
          method: 'POST',
          headers: {
            'token': token,
            'apikey': token,
            'Content-Type': 'application/json',
            'Accept': 'application/json',
          },
          body: JSON.stringify({ groupjid: trimmedInput }),
          signal: controller.signal,
        });
      } else {
        // Caso contrário, trata como link ou código de convite via /group/inviteInfo
        let inviteCode = trimmedInput;
        // Se vier como link do WhatsApp, extrai o código ou passa completo (a API aceita ambos)
        if (inviteCode.includes('chat.whatsapp.com/')) {
          const parts = inviteCode.split('chat.whatsapp.com/');
          if (parts[1]) {
            inviteCode = parts[1].split('?')[0].split('/')[0].trim();
          }
        }

        uazapiRes = await fetch(`${baseUrl}/group/inviteInfo`, {
          method: 'POST',
          headers: {
            'token': token,
            'apikey': token,
            'Content-Type': 'application/json',
            'Accept': 'application/json',
          },
          body: JSON.stringify({ invitecode: inviteCode }),
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

    const group = data.group || data;
    const jid = group.JID || group.jid || group.id || '';

    if (!jid) {
      return NextResponse.json(
        { error: 'A UAZAPI não retornou um JID válido para o convite fornecido.', details: data },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      jid: jid,
      name: group.Name || group.name || '',
      topic: group.Topic || group.topic || '',
      participantCount: Array.isArray(group.Participants) ? group.Participants.length : (group.participantCount || 0),
      group: group,
    });
  } catch (error: any) {
    console.error('API route /api/groups/get-jid error:', error);
    return NextResponse.json(
      { error: error?.message || 'Erro interno ao consultar JID na UAZAPI.' },
      { status: 500 }
    );
  }
}
