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

    const apiUrl = 'https://travelflow.uazapi.com/send/text';

    let apiResponse = await fetch(apiUrl, {
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

    // Se o token principal falhar com 401 (Inválido) ou 403 e tiver fallbackToken, tenta o fallback
    if (!apiResponse.ok && (apiResponse.status === 401 || apiResponse.status === 403) && body.fallbackToken && body.fallbackToken !== token) {
      console.log(`[send-message] Token principal retornou ${apiResponse.status}. Tentando fallbackToken...`);
      apiResponse = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'token': body.fallbackToken,
          'apikey': body.fallbackToken,
        },
        body: JSON.stringify({
          number: formattedPhoneNumber,
          text: message,
        }),
      });
    }

    let responseData: any;
    const responseText = await apiResponse.text();
    try {
      responseData = JSON.parse(responseText);
    } catch {
      responseData = { message: responseText };
    }

    if (!apiResponse.ok) {
      console.error(`UAZAPI failed with status ${apiResponse.status}: ${responseText}`);
      return NextResponse.json(
        { 
          success: false,
          error: responseData?.message || responseData?.error || 'Falha ao enviar mensagem via UAZAPI.', 
          details: responseData,
          httpStatus: apiResponse.status,
          formattedPhoneNumber,
          endpoint: apiUrl,
          timestamp: new Date().toISOString(),
        },
        { status: apiResponse.status }
      );
    }

    return NextResponse.json({ 
      success: true, 
      httpStatus: apiResponse.status,
      formattedPhoneNumber,
      endpoint: apiUrl,
      tokenUsed: `${token.slice(0, 8)}••••••••${token.slice(-4)}`,
      data: responseData,
      rawResponse: responseData,
      timestamp: new Date().toISOString(),
    });

  } catch (error: any) {
    console.error('API route /api/send-message error:', error);
    return NextResponse.json({ 
      success: false,
      error: 'Internal Server Error', 
      details: error?.message || String(error),
      httpStatus: 500,
      timestamp: new Date().toISOString(),
    }, { status: 500 });
  }
}

