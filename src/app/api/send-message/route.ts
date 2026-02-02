import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { message, phoneNumber, token } = body;

    if (!message || !phoneNumber || !token) {
      return NextResponse.json({ error: 'Message, phoneNumber, and token are required' }, { status: 400 });
    }

    // Ensure the phone number starts with +55 and contains only digits after that.
    const formattedPhoneNumber = `+55${phoneNumber.replace(/\D/g, '')}`;

    const webhookUrl = 'https://n8nbeta.typeflow.app.br/webhook/235c79d0-71ed-4a43-aa3c-5c0cf1de2580';

    const webhookResponse = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        text: message,
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
