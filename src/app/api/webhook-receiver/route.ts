import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

// In-memory store for received webhooks (resets on server restart)
const webhookLog: Array<{
  id: string;
  timestamp: string;
  method: string;
  headers: Record<string, string>;
  body: unknown;
  ip: string;
}> = [];

// SSE clients waiting for updates
const clients = new Set<ReadableStreamDefaultController>();

function broadcast(data: string) {
  for (const controller of clients) {
    try {
      controller.enqueue(`data: ${data}\n\n`);
    } catch {
      clients.delete(controller);
    }
  }
}

// POST — receives the webhook
export async function POST(req: NextRequest) {
  let body: unknown;
  const contentType = req.headers.get('content-type') || '';

  try {
    if (contentType.includes('application/json')) {
      body = await req.json();
    } else if (contentType.includes('application/x-www-form-urlencoded')) {
      const text = await req.text();
      body = Object.fromEntries(new URLSearchParams(text));
    } else {
      body = await req.text();
    }
  } catch {
    body = null;
  }

  const headers: Record<string, string> = {};
  req.headers.forEach((value, key) => {
    if (!['cookie', 'authorization'].includes(key.toLowerCase())) {
      headers[key] = value;
    }
  });

  const entry = {
    id: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    method: req.method,
    headers,
    body,
    ip: req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || 'unknown',
  };

  webhookLog.unshift(entry);
  // Keep only the last 100 entries
  if (webhookLog.length > 100) webhookLog.pop();

  broadcast(JSON.stringify(entry));

  return NextResponse.json({ received: true, id: entry.id }, { status: 200 });
}

// GET — either returns all logs (normal) or opens SSE stream
export async function GET(req: NextRequest) {
  const accept = req.headers.get('accept') || '';

  // SSE stream for real-time updates
  if (accept.includes('text/event-stream')) {
    const stream = new ReadableStream({
      start(controller) {
        clients.add(controller);
        // Send existing logs on connect
        controller.enqueue(`data: ${JSON.stringify({ type: 'init', logs: webhookLog })}\n\n`);
        req.signal.addEventListener('abort', () => {
          clients.delete(controller);
          controller.close();
        });
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
      },
    });
  }

  // Normal GET: return JSON logs
  return NextResponse.json(webhookLog);
}

// DELETE — clear all logs
export async function DELETE() {
  webhookLog.splice(0, webhookLog.length);
  broadcast(JSON.stringify({ type: 'clear' }));
  return NextResponse.json({ cleared: true });
}
