import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');

  if (!id) {
    return NextResponse.json({ error: 'ID da transação é obrigatório' }, { status: 400 });
  }
  
  const token = process.env.PUSHINPAY_TOKEN;
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
    const response = await fetch(url, { headers, next: { revalidate: 0 } }); // Disable caching

    if (!response.ok) {
        const errorData = await response.text();
        console.error("PushInPay Status Check API Error:", errorData);
        return NextResponse.json({ error: 'Erro ao verificar status do PIX', details: errorData }, { status: response.status });
    }

    const data = await response.json();
    return NextResponse.json({ status: data.status });

  } catch (error) {
    console.error("Internal Server Error:", error);
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
  }
}
