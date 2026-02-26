import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { numbers, message, token, delay } = body;

    if (!numbers || !message || !token) {
      return NextResponse.json({ error: 'Campos obrigatórios ausentes' }, { status: 400 });
    }

    // Webhook de produção atualizado
    const webhookUrl = 'https://n8nbeta.typeflow.app.br/webhook/eaad39ed-3dd9-4b20-a061-c45530b71e87';

    const webhookResponse = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ 
        numbers, 
        message, 
        token, 
        delay 
      }),
    });

    if (!webhookResponse.ok) {
      const errorText = await webhookResponse.text();
      console.error(`Webhook shot failed: ${errorText}`);
      return NextResponse.json({ error: 'Falha no webhook de disparo', details: errorText }, { status: webhookResponse.status });
    }

    const responseData = await webhookResponse.json();
    return NextResponse.json({ success: true, data: responseData });

  } catch (error: any) {
    console.error('API route /api/send-shot error:', error);
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
  }
}
