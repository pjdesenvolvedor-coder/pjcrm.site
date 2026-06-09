import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { jid, message, token, imageUrl, supportNumber, siteLink } = body;

    if (!jid || !message || !token) {
      return NextResponse.json({ error: 'jid, message, and token are required' }, { status: 400 });
    }

    // To ensure compatibility with some webhooks that might not correctly interpret
    // standard newline characters in JSON, we explicitly escape them.
    const formattedMessage = message.replace(/\n/g, '\\n');

    const webhookUrl = 'https://pedropedro.n8nready.com.br/webhook/ee1b0bd3-9cf0-4074-baa6-4041148df145';

    const webhookPayload: {
        jid: string;
        message: string;
        token: string;
        imageUrl?: string;
        supportNumber?: string;
        siteLink?: string;
    } = {
        jid,
        message: formattedMessage,
        token,
    };

    if (imageUrl) {
        webhookPayload.imageUrl = imageUrl;
    }
    if (supportNumber) {
        webhookPayload.supportNumber = supportNumber;
    }
    if (siteLink) {
        webhookPayload.siteLink = siteLink;
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

    let responseData;
    const responseText = await webhookResponse.text();
    try {
      responseData = JSON.parse(responseText);
    } catch {
      responseData = { message: responseText };
    }
    return NextResponse.json({ success: true, data: responseData });

  } catch (error: any) {
    console.error('API route /api/send-group-message error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
