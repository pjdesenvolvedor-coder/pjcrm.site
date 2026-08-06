import { NextResponse } from 'next/server';
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore, collection, addDoc, getDocs, doc, getDoc, query, limit, orderBy } from 'firebase/firestore';
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
    let bodyRaw = '';
    let bodyJson: any = {};
    let combined: Record<string, any> = {};

    try {
        bodyRaw = await request.text();
        if (bodyRaw) {
            try {
                bodyJson = JSON.parse(bodyRaw);
            } catch {
                try {
                    const params = new URLSearchParams(bodyRaw);
                    bodyJson = Object.fromEntries(params.entries());
                } catch {
                    bodyJson = { raw: bodyRaw };
                }
            }
        }
    } catch (e: any) {
        console.error('Erro ao ler body da requisição:', e);
    }

    try {
        const url = new URL(request.url);
        const queryParams = Object.fromEntries(url.searchParams.entries());
        combined = { ...queryParams, ...(typeof bodyJson === 'object' && bodyJson ? bodyJson : {}) };
    } catch {
        combined = typeof bodyJson === 'object' && bodyJson ? bodyJson : {};
    }

    // Helper flexível para extrair valores por chaves (case-insensitive)
    const getFlexValue = (possibleKeys: string[]): string => {
        if (!combined || typeof combined !== 'object') return '';
        for (const key of Object.keys(combined)) {
            const kLower = key.toLowerCase().trim();
            for (const pk of possibleKeys) {
                if (kLower === pk.toLowerCase() || kLower.includes(pk.toLowerCase())) {
                    const val = combined[key];
                    if (val !== undefined && val !== null && String(val).trim()) {
                        return String(val).trim();
                    }
                }
            }
        }
        return '';
    };

    let rawPhone = getFlexValue(['numero', 'phone', 'telefone', 'number', 'celular', 'num', 'whatsapp', 'client', 'mobile', 'numerocliente']);
    let code = getFlexValue(['codigo', 'code', 'codigofa', 'token', 'passcode', 'otp', 'pin', 'senha']);

    // Fallback: Tenta extrair com Regex se o payload veio em texto puro ou chaves incomuns
    if (!rawPhone && bodyRaw) {
        const phoneMatch = bodyRaw.match(/(?:55)?\d{10,11}/);
        if (phoneMatch) rawPhone = phoneMatch[0];
    }
    if (!code && bodyRaw) {
        const codeMatch = bodyRaw.match(/\b\d{4,8}\b/);
        if (codeMatch && codeMatch[0] !== rawPhone) code = codeMatch[0];
    }

    const formattedPhone = formatPhoneWith55(String(rawPhone));

    // Busca o Token do Zap de Cobranças nos usuários
    let billingToken = '';
    let targetUserId = '';

    try {
        const usersSnap = await getDocs(query(collection(db, 'users'), limit(10)));
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
    } catch (dbErr) {
        console.error('Erro ao buscar token do Zap de Cobranças:', dbErr);
    }

    let isSuccess = false;
    let uazapiStatus = 0;
    let errorDetail = '';
    let messageText = '';

    if (formattedPhone && billingToken) {
        messageText = `Ola,\nSeu codigo de acesso para o Aplicativo PJ Assinaturas;\n\nCodigo: ${code || 'N/A'}`;

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
    } else {
        if (!formattedPhone) errorDetail = 'Telefone não identificado no payload';
        else if (!billingToken) errorDetail = 'Token do Zap de Cobranças não configurado';
    }

    // Grava SEMPRE a requisição no Firestore, independente de sucesso ou falha
    const logData = {
        rawPhone: String(rawPhone || 'Não especificado'),
        formattedPhone: formattedPhone || 'N/A',
        code: String(code || 'N/A'),
        message: messageText || 'N/A',
        status: isSuccess ? 'Enviado' : (formattedPhone ? 'Erro' : 'Recebido'),
        uazapiStatus,
        errorDetail,
        bodyRaw: bodyRaw ? (bodyRaw.length > 500 ? bodyRaw.slice(0, 500) + '...' : bodyRaw) : JSON.stringify(combined),
        timestampMs: Date.now(),
    };

    try {
        await addDoc(collection(db, 'two_factor_logs'), logData);
        if (targetUserId) {
            await addDoc(collection(db, 'users', targetUserId, 'two_factor_logs'), logData).catch(() => {});
        }
    } catch (logErr) {
        console.error('Erro ao registrar log no Firestore:', logErr);
    }

    return NextResponse.json({
        success: true,
        receivedPayload: combined,
        extractedPhone: formattedPhone,
        extractedCode: code,
        messageSent: isSuccess,
        errorDetail: errorDetail || null,
    }, { status: 200 });
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
