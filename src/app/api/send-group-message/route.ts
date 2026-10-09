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
    const { jid, message, token, imageUrl, supportNumber, siteLink, serverUrl } = body;

    if (!jid || !message || !token) {
      return NextResponse.json(
        { error: 'jid, message e token são obrigatórios.' },
        { status: 400 }
      );
    }

    const destinationJid = String(jid).trim();
    const baseUrl = cleanServerUrl(serverUrl);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 20000);

    let finalMessage = String(message).trim();
    if (siteLink && !finalMessage.includes(siteLink.trim())) {
      finalMessage = `${finalMessage}\n\n${siteLink.trim()}`;
    }

    let uazapiRes: Response;

    try {
      if (imageUrl && String(imageUrl).trim()) {
        // Envio com Imagem via /send/media
        uazapiRes = await fetch(`${baseUrl}/send/media`, {
          method: 'POST',
          headers: {
            'token': token,
            'apikey': token,
            'Content-Type': 'application/json',
            'Accept': 'application/json',
          },
          body: JSON.stringify({
            number: destinationJid,
            type: 'image',
            file: String(imageUrl).trim(),
            text: finalMessage,
          }),
          signal: controller.signal,
        });
      } else {
        // Envio de Texto via /send/text
        uazapiRes = await fetch(`${baseUrl}/send/text`, {
          method: 'POST',
          headers: {
            'token': token,
            'apikey': token,
            'Content-Type': 'application/json',
            'Accept': 'application/json',
          },
          body: JSON.stringify({
            number: destinationJid,
            text: finalMessage,
          }),
          signal: controller.signal,
        });
      }
    } finally {
      clearTimeout(timeoutId);
    }

    const resText = await uazapiRes.text().catch(() => '');
    let responseData: any = {};
    try {
      responseData = JSON.parse(resText);
    } catch {
      responseData = { message: resText };
    }

    if (!uazapiRes.ok) {
      console.error(`UAZAPI group send failed with status ${uazapiRes.status}: ${resText}`);
      return NextResponse.json(
        { error: responseData.error || responseData.message || 'Falha ao enviar mensagem para o grupo via UAZAPI.', details: responseData },
        { status: uazapiRes.status }
      );
    }

    // Se houver número de suporte informado, envia o cartão de contato via /send/contact
    if (supportNumber && String(supportNumber).trim()) {
      try {
        const formattedSupport = formatPhoneWith55(String(supportNumber).trim());
        await fetch(`${baseUrl}/send/contact`, {
          method: 'POST',
          headers: {
            'token': token,
            'apikey': token,
            'Content-Type': 'application/json',
            'Accept': 'application/json',
          },
          body: JSON.stringify({
            number: destinationJid,
            fullName: 'Suporte',
            phoneNumber: formattedSupport,
          }),
        }).catch(err => console.error('Erro ao enviar contato de suporte no grupo:', err));
      } catch (err) {
        console.error('Erro ao processar contato de suporte:', err);
      }
    }

    return NextResponse.json({ success: true, data: responseData });

  } catch (error: any) {
    console.error('API route /api/send-group-message error:', error);
    return NextResponse.json(
      { error: error?.message || 'Erro interno ao disparar mensagem para grupo.' },
      { status: 500 }
    );
  }
}
