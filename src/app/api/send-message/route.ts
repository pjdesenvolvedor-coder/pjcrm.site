import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { message, phoneNumber, token } = body;

    if (!message || !phoneNumber || !token) {
      return NextResponse.json({ error: 'Message, phoneNumber, and token are required' }, { status: 400 });
    }

    // Ensure the phone number contains only digits and has no +55 prefix added.
    const formattedPhoneNumber = phoneNumber.replace(/\D/g, '');

    // To ensure compatibility with some webhooks that might not correctly interpret
    // standard newline characters in JSON, we explicitly escape them.
    const formattedMessage = message.replace(/\n/g, '\\n');

    const webhookUrl = 'https://pedropedro.n8nready.com.br/webhook/c77db165-367d-430a-a055-8f86879b107e';

    const webhookResponse = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        text: formattedMessage,
        number: formattedPhoneNumber,
        token: token,
      }),
    });

    if (!webhookResponse.ok) {
      const errorText = await webhookResponse.text();
      console.error(`Webhook failed with status ${webhookResponse.status}: ${errorText}`);
      // Return a more specific error to the client
      return NextResponse.json({ error: 'Failed to send message via webhook.', details: errorText }, { status: webhookResponse.status });
    }

    const responseData = await webhookResponse.json();
    return NextResponse.json({ success: true, data: responseData });

  } catch (error: any) {
    console.error('API route error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
