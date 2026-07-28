import { NextResponse } from 'next/server';

function formatPhoneWith55(phone: string): string {
  if (!phone) return '';
  let digits = phone.replace(/\D/g, '');
  if (!digits) return '';
  // If digits doesn't start with 55 and length is 10 or 11 (Brazilian DDD + number), prepend 55
  if (!digits.startsWith('55') && (digits.length === 10 || digits.length === 11)) {
    digits = '55' + digits;
  }
  return digits;
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { message, phoneNumber, token } = body;

    if (!message || !phoneNumber || !token) {
      return NextResponse.json({ error: 'Message, phoneNumber, and token are required' }, { status: 400 });
    }

    const formattedPhoneNumber = formatPhoneWith55(phoneNumber);

    const apiUrl = 'https://pjcontas.uazapi.com/send/text';

    const apiResponse = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'token': token,
        'apikey': token,
      },
      body: JSON.stringify({
        number: formattedPhoneNumber,
        text: message,
      }),
    });

    let responseData;
    const responseText = await apiResponse.text();
    try {
      responseData = JSON.parse(responseText);
    } catch {
      responseData = { message: responseText };
    }

    if (!apiResponse.ok) {
      console.error(`UAZAPI failed with status ${apiResponse.status}: ${responseText}`);
      return NextResponse.json(
        { error: 'Failed to send message via UAZAPI.', details: responseData },
        { status: apiResponse.status }
      );
    }

    return NextResponse.json({ success: true, data: responseData });

  } catch (error: any) {
    console.error('API route /api/send-message error:', error);
    return NextResponse.json({ error: 'Internal Server Error', details: error?.message || String(error) }, { status: 500 });
  }
}
