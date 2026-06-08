import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const token = body.token;

    if (!token) {
      return NextResponse.json({ error: 'Token is required' }, { status: 400 });
    }

    const webhookUrl = 'https://n8nbeta.typeflow.app.br/webhook/58da289a-e20c-460a-8e35-d01c9b567dad';

    const webhookResponse = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'token': token,
      },
      body: JSON.stringify({ token: token }),
    });

    if (!webhookResponse.ok) {
      const errorText = await webhookResponse.text();
      console.error(`Webhook failed with status ${webhookResponse.status}: ${errorText}`);
      return NextResponse.json({ status: 'disconnected', nomeperfil: '', fotoperfil: '' });
    }

    const rawText = await webhookResponse.text();
    if (!rawText || rawText.trim() === '') {
      return NextResponse.json({ status: 'disconnected', nomeperfil: '', fotoperfil: '' });
    }

    try {
      const data = JSON.parse(rawText);
      return NextResponse.json(data);
    } catch (parseError) {
      console.error('Failed to parse status response as JSON:', rawText, parseError);
      return NextResponse.json({ status: 'disconnected', nomeperfil: '', fotoperfil: '' });
    }

  } catch (error: any) {
    console.error('API route error:', error);
    return NextResponse.json({ status: 'disconnected', nomeperfil: '', fotoperfil: '', error: 'Internal Server Error' });
  }
}
