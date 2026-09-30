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

    let rawPhone = getFlexValue([
        'numerocliente',
        'numero_cliente',
        'numero',
        'phone',
        'telefone',
        'number',
        'celular',
        'num',
        'whatsapp',
        'client',
        'mobile',
        'contato'
    ]);

    let code = getFlexValue([
        'codigofa',
        'codigo_fa',
        'codigo2fa',
        'codigodeacesso',
        'codigo',
        'code',
        'token',
        'passcode',
        'otp',
        'pin',
        'senha'
    ]);

    // Fallbacks inteligentes por Regex caso venha em texto puro
    if (!rawPhone && bodyRaw) {
        const phoneMatch = bodyRaw.match(/(?:55)?\d{10,11}/);
        if (phoneMatch) rawPhone = phoneMatch[0];
    }
    if (!code && bodyRaw) {
        // Aceita códigos numéricos ou alfanuméricos (ex: GKEAEY, 5893, etc)
        const codeMatch = bodyRaw.match(/["']?(?:codigofa|codigo|code|token|otp)["']?\s*[:=]\s*["']?([A-Za-z0-9]{4,10})["']?/i);
        if (codeMatch && codeMatch[1]) {
            code = codeMatch[1];
        } else {
            const genericMatch = bodyRaw.match(/\b(?![0-9]{10,14}\b)[A-Za-z0-9]{4,8}\b/);
            if (genericMatch && genericMatch[0] !== rawPhone) code = genericMatch[0];
        }
    }

    const formattedPhone = formatPhoneWith55(String(rawPhone));

    // Coleta todos os tokens disponíveis dos usuários cadastrados
    const candidateTokens: string[] = [];
    let customTemplate = '';
    let targetUserId = '';

    // Se o webhook passou um token explícito
    const explicitToken = getFlexValue(['token', 'apikey', 'webhooktoken']);
    if (explicitToken && !candidateTokens.includes(explicitToken)) {
        candidateTokens.push(explicitToken);
    }

    try {
        const usersSnap = await getDocs(query(collection(db, 'users'), limit(15)));
        for (const uDoc of usersSnap.docs) {
            targetUserId = targetUserId || uDoc.id;

            // Template de 2FA configurado
            if (!customTemplate) {
                const settings2faSnap = await getDoc(doc(db, 'users', uDoc.id, 'settings', '2fatores'));
                if (settings2faSnap.exists() && settings2faSnap.data()?.messageTemplate) {
                    customTemplate = settings2faSnap.data()?.messageTemplate;
                }
            }

            const configSnap = await getDoc(doc(db, 'users', uDoc.id, 'settings', 'config'));
            if (configSnap.exists()) {
                const s = configSnap.data();
                if (s.billingWebhookToken && !candidateTokens.includes(s.billingWebhookToken)) {
                    candidateTokens.push(s.billingWebhookToken);
                }
                if (s.webhookToken && !candidateTokens.includes(s.webhookToken)) {
                    candidateTokens.push(s.webhookToken);
                }
            }
        }
    } catch (dbErr) {
        console.error('Erro ao buscar configurações no Firestore:', dbErr);
    }

    // Modelo padrão se nenhum for configurado
    const defaultTemplate = `🔐 Olá!\n\nSeu *código de acesso* para o Aplicativo PJ Assinaturas:\n\n📲 Código: *{codigo}*\n\n⚠️ *Este código é pessoal e intransferível.*`;
    const templateToUse = customTemplate?.trim() || defaultTemplate;

    // Substitui variáveis {codigo} e {numero}
    const messageText = templateToUse
        .replace(/{codigo}/gi, code || 'N/A')
        .replace(/{code}/gi, code || 'N/A')
        .replace(/{numero}/gi, rawPhone || formattedPhone || 'N/A')
        .replace(/{telefone}/gi, rawPhone || formattedPhone || 'N/A');

    let isSuccess = false;
    let uazapiStatus = 0;
    let errorDetail = '';
    let usedToken = '';

    if (formattedPhone && candidateTokens.length > 0) {
        for (const token of candidateTokens) {
            try {
                const uazapiRes = await fetch('https://travelflow.uazapi.com/send/text', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'token': token,
                        'apikey': token,
                    },
                    body: JSON.stringify({
                        number: formattedPhone,
                        text: messageText,
                    }),
                });

                uazapiStatus = uazapiRes.status;
                if (uazapiRes.ok) {
                    isSuccess = true;
                    usedToken = token;
                    errorDetail = '';
                    break;
                } else {
                    const errText = await uazapiRes.text().catch(() => '');
                    errorDetail = `Token ${token.slice(0, 8)}... falhou (${uazapiRes.status}): ${errText}`;
                    console.warn(`[2-fatores] ${errorDetail}`);
                }
            } catch (fetchErr: any) {
                errorDetail = fetchErr?.message || 'Erro ao conectar com UAZAPI';
                console.error(`[2-fatores] Erro de rede:`, fetchErr);
            }
        }
    } else {
        if (!formattedPhone) errorDetail = 'Telefone não identificado no payload';
        else if (candidateTokens.length === 0) errorDetail = 'Nenhum token do WhatsApp configurado no CRM';
    }

    // Grava SEMPRE o log no Firestore
    const logData = {
        rawPhone: String(rawPhone || 'Não especificado'),
        formattedPhone: formattedPhone || 'N/A',
        code: String(code || 'N/A'),
        message: messageText || 'N/A',
        status: isSuccess ? 'Enviado' : (formattedPhone ? 'Erro' : 'Recebido'),
        uazapiStatus,
        errorDetail,
        usedToken: usedToken || null,
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
        success: isSuccess,
        receivedPayload: combined,
        extractedPhone: formattedPhone,
        extractedCode: code,
        messageText,
        messageSent: isSuccess,
        usedToken: usedToken || null,
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
