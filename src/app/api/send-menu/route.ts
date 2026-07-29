import { NextResponse } from 'next/server';

export async function POST() {
  return NextResponse.json({ error: 'A lógica de envio de menu/botões foi completamente removida do sistema.' }, { status: 410 });
}
