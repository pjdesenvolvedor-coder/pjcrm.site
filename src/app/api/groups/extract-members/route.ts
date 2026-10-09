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

function cleanPhone(raw: string): string {
  if (!raw) return '';
  const withoutDomain = raw.split('@')[0];
  const withoutDevice = withoutDomain.split(':')[0];
  return withoutDevice.replace(/\D/g, '');
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const { jid, token, serverUrl } = body;

    if (!jid || !token) {
      return NextResponse.json(
        { error: 'JID ou Link do grupo e token são obrigatórios.' },
        { status: 400 }
      );
    }

    const trimmedInput = String(jid).trim();
    const baseUrl = cleanServerUrl(serverUrl);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 20000);

    let uazapiRes: Response;

    try {
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
        let inviteCode = trimmedInput;
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
    const groupName = group.Name || group.name || 'Grupo Sem Nome';
    const participantsList: any[] = Array.isArray(group.Participants)
      ? group.Participants
      : Array.isArray(group.participants)
      ? group.participants
      : [];

    const adminPhones: string[] = [];
    const memberPhones: string[] = [];

    for (const p of participantsList) {
      const rawJid = p.JID || p.jid || p.PhoneNumber || p.phoneNumber || (typeof p === 'string' ? p : '');
      const phone = cleanPhone(rawJid);
      if (!phone) continue;

      const isAdmin = Boolean(
        p.IsAdmin ||
        p.IsSuperAdmin ||
        p.isAdmin ||
        p.admin ||
        p.isSuperAdmin ||
        p.role === 'admin' ||
        p.role === 'superadmin'
      );

      if (isAdmin) {
        if (!adminPhones.includes(phone)) adminPhones.push(phone);
      } else {
        if (!memberPhones.includes(phone)) memberPhones.push(phone);
      }
    }

    const totalCount = participantsList.length || (adminPhones.length + memberPhones.length);

    return NextResponse.json({
      success: true,
      nomegrupo: groupName,
      quantidadedeparticipantes: String(totalCount),
      telefoneadmns: adminPhones.join(','),
      telefones: memberPhones.join(','),
      adminPhones,
      memberPhones,
      groupJid: group.JID || group.jid || (trimmedInput.endsWith('@g.us') ? trimmedInput : ''),
    });
  } catch (error: any) {
    console.error('API route /api/groups/extract-members error:', error);
    return NextResponse.json(
      { error: error?.message || 'Erro interno ao extrair membros via UAZAPI.' },
      { status: 500 }
    );
  }
}
