import { NextResponse } from 'next/server';
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore, collection, addDoc, getDocs, doc, getDoc, query, limit, orderBy, serverTimestamp } from 'firebase/firestore';
import { firebaseConfig } from '@/firebase/config';

export const dynamic = 'force-dynamic';

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
const db = getFirestore(app);

function formatPhoneWith55(phone: string): string {
    if (!phone) return '';
    let digits = phone.replace(/\D/g, '');
    if (!digits) return '';
    if (!digits.startsWith('55') && (digits.length === 10 || digits.length === 11)) {
        digits = '55' + digits;
    }
    return digits;
}

export async function POST(request: Request) {
    try {
        const body = await request.json().catch(() => ({}));

        // Suporta Numero, numero, number, phone, etc
        const rawPhone = body.Numero || body.numero || body.number || body.phone || body.NumeroCliente || '';
        const code = body.Codigo || body.codigo || body.code || body.codigofa || '';

        if (!rawPhone || !code) {
            return NextResponse.json(
                { error: 'Payload deve conter "Numero" e "Codigo". Exemplo: { "Numero": "5511999999999", "Codigo": "123456" }' },
                { status: 400 }
            );
        }

        const formattedPhone = formatPhoneWith55(String(rawPhone));

        // Busca o Token do Zap de Cobranças
        const usersSnap = await getDocs(query(collection(db, 'users'), limit(10)));
        let billingToken = '';
        let targetUserId = '';

        for (const uDoc of usersSnap.docs) {
            targetUserId = targetUserId || uDoc.id;
            const configSnap = await getDoc(doc(db, 'users', uDoc.id, 'settings', 'config'));
            if (configSnap.exists()) {
                const s = configSnap.data();
                const resolvedToken = (s.useSeparateBillingZap && s.billingWebhookToken)
                    ? s.billingWebhookToken
                    : (s.billingWebhookToken || s.webhookToken || '');
                if (resolvedToken) {
                    billingToken = resolvedToken;
                    targetUserId = uDoc.id;
                    break;
                }
            }
        }

        if (!billingToken) {
            return NextResponse.json(
                { error: 'Token do Zap de Cobranças não configurado no sistema.' },
                { status: 500 }
            );
        }

        // Mensagem exata solicitada
        const messageText = `Ola,\nSeu codigo de acesso para o Aplicativo PJ Assinaturas;\n\nCodigo: ${code}`;

        // Envia mensagem via UAZAPI usando Zap de Cobranças
        let uazapiStatus = 0;
        let isSuccess = false;
        let errorDetail = '';

        try {
            const uazapiRes = await fetch('https://pjcontas.uazapi.com/send/text', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'token': billingToken,
                    'apikey': billingToken,
                },
                body: JSON.stringify({
                    number: formattedPhone,
                    text: messageText,
                }),
            });

            uazapiStatus = uazapiRes.status;
            isSuccess = uazapiRes.ok;

            if (!uazapiRes.ok) {
                errorDetail = await uazapiRes.text().catch(() => `HTTP ${uazapiRes.status}`);
            }
        } catch (fetchErr: any) {
            errorDetail = fetchErr.message || 'Erro ao conectar com UAZAPI';
        }

        // Grava o log da requisição recebida
        const logData = {
            rawPhone: String(rawPhone),
            formattedPhone: formattedPhone,
            code: String(code),
            message: messageText,
            status: isSuccess ? 'Enviado' : 'Erro',
            uazapiStatus,
            errorDetail,
            createdAt: serverTimestamp(),
            timestampMs: Date.now(),
        };

        try {
            await addDoc(collection(db, 'two_factor_logs'), logData);
            if (targetUserId) {
                await addDoc(collection(db, 'users', targetUserId, 'two_factor_logs'), logData).catch(() => {});
            }
        } catch (dbErr) {
            console.error('Erro ao salvar log no Firestore:', dbErr);
        }

        if (isSuccess) {
            return NextResponse.json({
                success: true,
                message: 'Código 2FA enviado com sucesso via Zap de Cobranças!',
                phone: formattedPhone,
                code: code,
            });
        } else {
            return NextResponse.json(
                { success: false, error: 'Falha ao enviar mensagem pelo UAZAPI', details: errorDetail },
                { status: 500 }
            );
        }
    } catch (err: any) {
        console.error('Erro no webhook 2FA:', err);
        return NextResponse.json({ error: 'Erro interno no servidor', details: err.message }, { status: 500 });
    }
}

export async function GET() {
    try {
        const logsSnap = await getDocs(query(collection(db, 'two_factor_logs'), orderBy('timestampMs', 'desc'), limit(50)));
        const logs = logsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        return NextResponse.json({ success: true, logs });
    } catch (e: any) {
        return NextResponse.json({ success: false, error: e.message }, { status: 500 });
    }
}
