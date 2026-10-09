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

function cleanSiteUrl(url: string): string {
  let clean = url.trim();
  if (!clean.startsWith('http://') && !clean.startsWith('https://')) {
    clean = `https://${clean}`;
  }
  return clean;
}

function formatSupportUrl(support: string): string {
  const raw = support.trim();
  if (raw.startsWith('http://') || raw.startsWith('https://')) {
    return raw;
  }
  const digits = formatPhoneWith55(raw);
  return `https://wa.me/${digits}`;
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const { jid, message, token, imageUrl, buttons, supportNumber, siteLink, serverUrl } = body;

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

    const finalMessage = String(message).trim();

    // Monta os botões interativos (choices) para /send/menu
    const choices: string[] = [];
    const fallbackLinks: { label: string; url: string }[] = [];

    if (Array.isArray(buttons) && buttons.length > 0) {
      for (const btn of buttons) {
        const label = (btn.label || '').trim();
        const val = (btn.value || '').trim();
        if (!label || !val) continue;

        if (btn.type === 'contact') {
          const supportUrl = formatSupportUrl(val);
          choices.push(`${label}|${supportUrl}`);
          fallbackLinks.push({ label, url: supportUrl });
        } else {
          const siteUrl = cleanSiteUrl(val);
          choices.push(`${label}|${siteUrl}`);
          fallbackLinks.push({ label, url: siteUrl });
        }
      }
    } else {
      // Suporte legado a siteLink e supportNumber
      if (siteLink && String(siteLink).trim()) {
        const siteUrl = cleanSiteUrl(String(siteLink));
        choices.push(`Comprar Agora|${siteUrl}`);
        fallbackLinks.push({ label: 'Comprar Agora', url: siteUrl });
      }

      if (supportNumber && String(supportNumber).trim()) {
        const supportUrl = formatSupportUrl(String(supportNumber));
        choices.push(`Preciso de Suporte|${supportUrl}`);
        fallbackLinks.push({ label: 'Preciso de Suporte', url: supportUrl });
      }
    }

    const hasButtons = choices.length > 0;
    let uazapiRes: Response;

    try {
      if (hasButtons) {
        // Envio com Botões Interativos via /send/menu
        const menuPayload: any = {
          number: destinationJid,
          type: 'button',
          text: finalMessage,
          choices,
        };

        if (imageUrl && String(imageUrl).trim()) {
          menuPayload.imageButton = String(imageUrl).trim();
        }

        uazapiRes = await fetch(`${baseUrl}/send/menu`, {
          method: 'POST',
          headers: {
            'token': token,
            'apikey': token,
            'Content-Type': 'application/json',
            'Accept': 'application/json',
          },
          body: JSON.stringify(menuPayload),
          signal: controller.signal,
        });

        // Se /send/menu falhar na instância, tenta fallback com links no texto
        if (!uazapiRes.ok) {
          console.warn(`[send-group-message] /send/menu falhou (${uazapiRes.status}), tentando fallback...`);
          let fallbackMessage = finalMessage;
          for (const item of fallbackLinks) {
            fallbackMessage += `\n\n🔗 ${item.label}: ${item.url}`;
          }

          if (imageUrl && String(imageUrl).trim()) {
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
                text: fallbackMessage,
              }),
              signal: controller.signal,
            });
          } else {
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
                text: fallbackMessage,
              }),
              signal: controller.signal,
            });
          }
        }
      } else if (imageUrl && String(imageUrl).trim()) {
        // Envio com Imagem via /send/media (sem botões)
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
        // Envio de Texto via /send/text (sem botões)
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

    return NextResponse.json({ success: true, data: responseData });

  } catch (error: any) {
    console.error('API route /api/send-group-message error:', error);
    return NextResponse.json(
      { error: error?.message || 'Erro interno ao disparar mensagem para grupo.' },
      { status: 500 }
    );
  }
}
