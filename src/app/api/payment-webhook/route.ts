import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    // In a real application, you would process the webhook here to confirm payment
    // and update the user's status in the database.
    console.log("Webhook received:", body);
    
    // You should also verify the webhook signature if PushinPay provides one.

    return NextResponse.json({ success: true, message: "Webhook received" });
  } catch (error: any) {
    console.error('Webhook error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function GET(request: Request) {
    return NextResponse.json({ message: "Webhook endpoint is active. Use POST to send data." });
}
