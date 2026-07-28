import { NextResponse } from 'next/server';

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
    const body = await request.json();
    const { number, phoneNumber, type, text, choices, imageButton, footerText, token } = body;

    const targetPhone = number || phoneNumber;
    if (!targetPhone || !token || !text || !choices || !Array.isArray(choices)) {
      return NextResponse.json({ error: 'Missing required parameters (phoneNumber, token, text, choices)' }, { status: 400 });
    }

    const formattedPhoneNumber = formatPhoneWith55(targetPhone);
    const apiUrl = 'https://pjcontas.uazapi.com/send/menu';

    const payload: any = {
      number: formattedPhoneNumber,
      type: type || 'button',
      text: text,
      choices: choices,
    };

    if (imageButton && typeof imageButton === 'string' && imageButton.trim()) {
      const cleanImg = imageButton.trim();
      if (cleanImg.startsWith('http://') || cleanImg.startsWith('https://')) {
        payload.imageButton = cleanImg;
      } else {
        console.warn('send-menu: Ignored non-HTTP imageButton payload (e.g. data URI) to prevent UAZAPI API 400 error.');
      }
    }

    if (footerText && typeof footerText === 'string' && footerText.trim()) {
      payload.footerText = footerText.trim();
    }

    const apiResponse = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'token': token,
        'apikey': token,
      },
      body: JSON.stringify(payload),
    });

    let responseData;
    const responseText = await apiResponse.text();
    try {
      responseData = JSON.parse(responseText);
    } catch {
      responseData = { message: responseText };
    }

    if (!apiResponse.ok) {
      console.error(`UAZAPI /send/menu failed with status ${apiResponse.status}: ${responseText}`);
      return NextResponse.json(
        { error: 'Failed to send menu via UAZAPI.', details: responseData },
        { status: apiResponse.status }
      );
    }

    return NextResponse.json({ success: true, data: responseData });

  } catch (error: any) {
    console.error('API route /api/send-menu error:', error);
    return NextResponse.json({ error: 'Internal Server Error', details: error?.message || String(error) }, { status: 500 });
  }
}
