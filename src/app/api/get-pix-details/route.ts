import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');

  // We use the environment variable token here for security on a public-facing page
  const token = process.env.PUSHINPAY_TOKEN;

  if (!id) {
    return NextResponse.json({ error: 'ID da transação é obrigatório' }, { status: 400 });
  }
  
  if (!token) {
    return NextResponse.json({ error: 'API token não configurado no servidor' }, { status: 500 });
  }

  const url = `https://api.pushinpay.com.br/api/transactions/${id}`;
  const headers = {
    "Authorization": `Bearer ${token}`,
    "Accept": "application/json",
    "Content-Type": "application/json"
  };

  try {
    const response = await fetch(url, { headers, cache: 'no-store' });

    if (!response.ok) {
        const errorData = await response.text();
        console.error("PushInPay Details Fetch API Error:", errorData);
        return NextResponse.json({ error: 'Erro ao buscar detalhes do PIX', details: errorData }, { status: response.status });
    }

    const data = await response.json();

    // Only return the necessary public fields
    const pixDetails = {
        qr_code: data.qr_code,
        qr_code_base64: data.qr_code_base64,
        value: data.value,
        status: data.status,
    };

    return NextResponse.json(pixDetails);

  } catch (error) {
    console.error("Internal Server Error fetching PIX details:", error);
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
  }
}
