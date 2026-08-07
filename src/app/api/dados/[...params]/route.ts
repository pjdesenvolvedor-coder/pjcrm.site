import { NextResponse } from 'next/server';
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore, collection, getDocs, doc, getDoc, query, where } from 'firebase/firestore';
import { firebaseConfig } from '@/firebase/config';
import { format } from 'date-fns';
import type { Client } from '@/lib/types';

export const dynamic = 'force-dynamic';

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
const db = getFirestore(app);

function getCanonicalPhone(phone: string): string {
    if (!phone) return '';
    const digits = phone.replace(/\D/g, '');
    if (!digits) return '';
    let local = (digits.startsWith('55') && digits.length >= 12) ? digits.slice(2) : digits;
    if (local.length === 11 && local[2] === '9') {
        local = local.slice(0, 2) + local.slice(3);
    }
    if (local.length === 10) return '55' + local;
    return digits;
}

function formatDate(val: any): string {
    if (!val) return 'N/A';
    let date: Date | null = null;
    if (typeof val?.toDate === 'function') date = val.toDate();
    else if (typeof val?.toMillis === 'function') date = new Date(val.toMillis());
    else if (val?.seconds !== undefined) date = new Date(val.seconds * 1000);
    else if (val instanceof Date) date = val;
    else if (typeof val === 'number') date = new Date(val);
    else if (typeof val === 'string') {
        const d = new Date(val);
        if (!isNaN(d.getTime())) date = d;
    }
    if (!date) return 'N/A';
    try {
        return (date.getHours() === 0 && date.getMinutes() === 0)
            ? format(date, 'dd/MM/yyyy')
            : format(date, 'dd/MM/yyyy HH:mm');
    } catch { return 'N/A'; }
}

function formatEmail(val: any): string {
    if (!val) return 'N/A';
    if (Array.isArray(val)) {
        const filtered = val.filter(Boolean);
        return filtered.length > 0 ? filtered.join(', ') : 'N/A';
    }
    return String(val).trim() || 'N/A';
}

function buildClientBlock(c: Client): string {
    return [
        `NomeProduto: ${c.subscription || c.name || 'N/A'}`,
        `Valor Pago: ${c.amountPaid || '0,00'}`,
        `Compra: ${formatDate(c.createdAt)}`,
        `Vencimento: ${formatDate(c.dueDate)}`,
        `Email: ${formatEmail(c.email)}`,
        `Senha: ${c.password || 'N/A'}`,
        `Perfil: ${c.screen || 'N/A'}`,
        `SenhaPerfil: ${c.pinScreen || 'N/A'}`,
        `Status: ${c.status || 'Ativo'}`,
    ].join('\n');
}

// Rota catch-all: /api/dados/[...params]
// Funciona com qualquer URL como /api/dados/email@gmail.com/77998413534
// O catch-all evita o problema do Next.js com pontos (.) em segmentos dinâmicos
export async function GET(
    request: Request,
    props: { params: Promise<{ params: string[] }> }
) {
    try {
        const { params } = await props.params;

        // params[0] = email do usuário, params[1] = telefone
        // Ex: ["pedropedrojivago@gmail.com", "93984007250"]
        const rawEmail = decodeURIComponent(params?.[0] || '').trim().toLowerCase();
        const rawPhone = decodeURIComponent(params?.[1] || '').trim();

        if (!rawEmail || !rawPhone) {
            return new NextResponse(
                'Uso: /api/dados/{email-do-usuario}/{telefone-do-cliente}',
                { status: 400, headers: { 'Content-Type': 'text/plain; charset=utf-8' } }
            );
        }

        let targetUserId = '';
        let targetUserEmail = '';

        // 1. Query direta por campo email
        try {
            const q = query(collection(db, 'users'), where('email', '==', rawEmail));
            const qSnap = await getDocs(q);
            if (!qSnap.empty) {
                targetUserId = qSnap.docs[0].id;
                targetUserEmail = qSnap.docs[0].data()?.email || rawEmail;
            }
        } catch (e) { console.error('Erro na query por email:', e); }

        // 2. Percorre usuários (case-insensitive)
        if (!targetUserId) {
            try {
                const usersSnapshot = await getDocs(collection(db, 'users'));
                for (const userDoc of usersSnapshot.docs) {
                    const uData = userDoc.data();
                    const emailInDoc = (uData.email || '').trim().toLowerCase();
                    if (emailInDoc === rawEmail || userDoc.id.trim().toLowerCase() === rawEmail) {
                        targetUserId = userDoc.id;
                        targetUserEmail = uData.email || userDoc.id;
                        break;
                    }
                }
            } catch (e) { console.error('Erro ao percorrer users:', e); }
        }

        // 3. Fallback: tenta usar rawEmail como ID direto
        if (!targetUserId) {
            try {
                const docSnap = await getDoc(doc(db, 'users', rawEmail));
                if (docSnap.exists()) {
                    targetUserId = docSnap.id;
                    targetUserEmail = docSnap.data()?.email || rawEmail;
                }
            } catch (e) { console.error('Erro ao buscar doc direto:', e); }
        }

        const userClients: Client[] = [];
        if (targetUserId) {
            try {
                const clientsSnap = await getDocs(collection(db, 'users', targetUserId, 'clients'));
                clientsSnap.docs.forEach((d) => {
                    userClients.push({ id: d.id, ...d.data() } as Client);
                });
            } catch (e) { console.error('Erro ao carregar clientes:', e); }
        }

        const searchCanonical = getCanonicalPhone(rawPhone);
        const searchDigits = rawPhone.replace(/\D/g, '');

        const matchedClients = userClients.filter((c) => {
            if (!c.phone) return false;
            const clientCanonical = getCanonicalPhone(c.phone);
            if (clientCanonical && searchCanonical && clientCanonical === searchCanonical) return true;
            const cDigits = c.phone.replace(/\D/g, '');
            if (cDigits && searchDigits) {
                if (cDigits === searchDigits) return true;
                if (searchDigits.length >= 8 && cDigits.endsWith(searchDigits)) return true;
                if (cDigits.length >= 8 && searchDigits.endsWith(cDigits)) return true;
            }
            return false;
        });

        const clientName = matchedClients.find((c) => c.name?.trim())?.name?.trim() || 'N/A';
        const activeClients = matchedClients.filter((c) => c.status === 'Ativo');
        const overdueClients = matchedClients.filter((c) => c.status !== 'Ativo');

        let responseText = `NomeCliente: ${clientName}\n`;
        responseText += `Assinaturas Ativas: ${activeClients.length}\n`;
        responseText += `Assinaturas Vencidas: ${overdueClients.length}\n\n`;
        responseText += `Assinaturas Ativas{\n\n`;
        if (activeClients.length > 0) responseText += activeClients.map(buildClientBlock).join('\n\n\n') + '\n';
        responseText += `}\n\n\n`;
        responseText += `Assinaturas Vencidas{\n\n`;
        if (overdueClients.length > 0) responseText += overdueClients.map(buildClientBlock).join('\n\n\n') + '\n';
        responseText += `}`;

        const url = new URL(request.url);
        const formatParam = url.searchParams.get('format');
        const acceptHeader = request.headers.get('accept') || '';

        if (formatParam === 'json' || acceptHeader.includes('application/json')) {
            return NextResponse.json({
                userEmail: targetUserEmail || rawEmail,
                userId: targetUserId || null,
                clientName,
                searchPhone: rawPhone,
                canonicalPhone: searchCanonical,
                activeCount: activeClients.length,
                overdueCount: overdueClients.length,
                activeSubscriptions: activeClients,
                overdueSubscriptions: overdueClients,
                formattedPayload: responseText,
            });
        }

        return new NextResponse(responseText, {
            status: 200,
            headers: { 'Content-Type': 'text/plain; charset=utf-8' },
        });

    } catch (e: any) {
        console.error('Erro na API /api/dados:', e);
        return new NextResponse(
            'NomeCliente: N/A\nAssinaturas Ativas: 0\nAssinaturas Vencidas: 0\n\nAssinaturas Ativas{\n\n}\n\n\nAssinaturas Vencidas{\n\n}',
            { status: 200, headers: { 'Content-Type': 'text/plain; charset=utf-8' } }
        );
    }
}
