import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const token = body.token;

    if (!token) {
      return NextResponse.json({ error: 'Token is required' }, { status: 400 });
    }

    const apiUrl = 'https://pjcontas.uazapi.com/instance/status';

    const apiResponse = await fetch(apiUrl, {
      method: 'GET',
      headers: {
        'token': token,
        'apikey': token,
      },
    });

    if (!apiResponse.ok) {
      const errorText = await apiResponse.text().catch(() => '');
      console.error(`UAZAPI /instance/status failed with status ${apiResponse.status}: ${errorText}`);
      return NextResponse.json({ status: 'disconnected', nomeperfil: '', fotoperfil: '' });
    }

    const data = await apiResponse.json().catch(() => null);

    if (!data) {
      return NextResponse.json({ status: 'disconnected', nomeperfil: '', fotoperfil: '' });
    }

    // Extrai os campos do objeto `instance` retornado pela UAZAPI
    const inst = data.instance || data;

    const rawStatus = inst.status || inst.state || 'disconnected';
    const status = (rawStatus === 'connected' || rawStatus === 'connecting') ? rawStatus : 'disconnected';
    const nomeperfil = inst.profileName || inst.nomeperfil || inst.name || inst.pushname || '';
    const fotoperfil = inst.profilePicUrl || inst.fotoperfil || inst.profilePictureUrl || inst.profilePic || '';

    // Retorna exatamente a estrutura esperada pelo sistema
    return NextResponse.json({
      status,
      nomeperfil,
      fotoperfil,
    });

  } catch (error: any) {
    console.error('API /api/status error:', error);
    return NextResponse.json({ status: 'disconnected', nomeperfil: '', fotoperfil: '', error: 'Internal Server Error' });
  }
}
