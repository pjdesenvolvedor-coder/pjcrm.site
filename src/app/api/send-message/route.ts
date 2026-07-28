import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { message, phoneNumber, token } = body;

    if (!message || !phoneNumber || !token) {
      return NextResponse.json({ error: 'Message, phoneNumber, and token are required' }, { status: 400 });
    }

    // Ensure the phone number contains only digits.
    const formattedPhoneNumber = phoneNumber.replace(/\D/g, '');

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
