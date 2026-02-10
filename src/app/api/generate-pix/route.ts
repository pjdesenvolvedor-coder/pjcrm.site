import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  const { value } = await request.json();

  if (!value || typeof value !== 'number' || value <= 0) {
    return NextResponse.json({ error: 'Valor inválido' }, { status: 400 });
  }

  const token = process.env.PUSHINPAY_TOKEN;
  if (!token) {
    return NextResponse.json({ error: 'API token não configurado no servidor' }, { status: 500 });
  }
  
  const host = request.headers.get('host');
  const protocol = host?.includes('localhost') ? 'http' : 'https';
  const webhookUrl = `${protocol}://${host}/api/payment-webhook`;


  const headers = {
    "Authorization": `Bearer ${token}`,
    "Accept": "application/json",
    "Content-Type": "application/json"
  };

  const payload = {
    "value": value, // in cents
    "webhook_url": webhookUrl
  };

  try {
    const response = await fetch("https://api.pushinpay.com.br/api/pix/cashIn", {
      method: 'POST',
      headers,
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const errorData = await response.text();
      console.error("PushInPay API Error:", errorData);
      return NextResponse.json({ error: 'Erro ao gerar cobrança PIX', details: errorData }, { status: response.status });
    }

    const data = await response.json();
    
    const pixData = {
        id: data.id,
        qr_code: data.qr_code,
        qr_code_base64: data.qr_code_base64
    }

    return NextResponse.json(pixData);

  } catch (error) {
    console.error("Internal Server Error:", error);
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
  }
}
