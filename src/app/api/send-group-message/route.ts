import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { jid, message, token, imageUrl } = body;

    if (!jid || !message || !token) {
      return NextResponse.json({ error: 'jid, message, and token are required' }, { status: 400 });
    }

    const webhookUrl = 'https://n8nbeta.typeflow.app.br/webhook/6b70ac73-9025-4ace-b7c9-24db23376c4c';

    const webhookPayload: {
        jid: string;
        message: string;
        token: string;
        imageUrl?: string;
    } = {
        jid,
        message,
        token,
    };

    if (imageUrl) {
        webhookPayload.imageUrl = imageUrl;
    }

    const webhookResponse = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(webhookPayload),
    });

    if (!webhookResponse.ok) {
      const errorText = await webhookResponse.text();
      console.error(`Group message webhook failed with status ${webhookResponse.status}: ${errorText}`);
      return NextResponse.json({ error: 'Failed to send group message via webhook.', details: errorText }, { status: webhookResponse.status });
    }

    const responseData = await webhookResponse.json();
    return NextResponse.json({ success: true, data: responseData });

  } catch (error: any) {
    console.error('API route /api/send-group-message error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
