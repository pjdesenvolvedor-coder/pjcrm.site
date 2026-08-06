import { NextResponse } from 'next/server';
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore, collection, getDocs, collectionGroup } from 'firebase/firestore';
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
    if (local.length === 10) {
        return '55' + local;
    }
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
        const hours = date.getHours();
        const minutes = date.getMinutes();
        if (hours === 0 && minutes === 0) {
            return format(date, 'dd/MM/yyyy');
        }
        return format(date, 'dd/MM/yyyy HH:mm');
    } catch {
        return 'N/A';
    }
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
    const nomeProduto = c.subscription || c.name || 'N/A';
    const valorPago = c.amountPaid || '0,00';
    const compra = formatDate(c.createdAt);
    const vencimento = formatDate(c.dueDate);
    const email = formatEmail(c.email);
    const senha = c.password || 'N/A';
    const perfil = c.screen || 'N/A';
    const senhaPerfil = c.pinScreen || 'N/A';
    const status = c.status || 'Ativo';

    return [
        `NomeProduto: ${nomeProduto}`,
        `Valor Pago: ${valorPago}`,
        `Compra: ${compra}`,
        `Vencimento: ${vencimento}`,
        `Email: ${email}`,
        `Senha: ${senha}`,
        `Perfil: ${perfil}`,
        `SenhaPerfil: ${senhaPerfil}`,
        `Status: ${status}`,
    ].join('\n');
}

export async function GET(
    request: Request,
    props: { params: Promise<{ phone: string }> }
) {
    try {
        const params = await props.params;
        const rawPhone = decodeURIComponent(params.phone || '');

        if (!rawPhone || !rawPhone.trim()) {
            return new NextResponse('Número de telefone inválido.', { status: 400 });
        }

        const searchCanonical = getCanonicalPhone(rawPhone);
        const searchDigits = rawPhone.replace(/\D/g, '');

        const allClients: Client[] = [];

        try {
            const cgSnapshot = await getDocs(collectionGroup(db, 'clients'));
            cgSnapshot.docs.forEach((docSnap) => {
                allClients.push({ id: docSnap.id, ...docSnap.data() } as Client);
            });
        } catch {
            const usersSnapshot = await getDocs(collection(db, 'users'));
            for (const userDoc of usersSnapshot.docs) {
                const clientsSnap = await getDocs(collection(db, 'users', userDoc.id, 'clients'));
                clientsSnap.docs.forEach((docSnap) => {
                    allClients.push({ id: docSnap.id, ...docSnap.data() } as Client);
                });
            }
        }

        const matchedClients = allClients.filter((c) => {
            if (!c.phone) return false;
            const clientCanonical = getCanonicalPhone(c.phone);

            if (clientCanonical && searchCanonical && clientCanonical === searchCanonical) {
                return true;
            }

            const cDigits = c.phone.replace(/\D/g, '');
            if (cDigits && searchDigits) {
                if (cDigits === searchDigits) return true;
                if (searchDigits.length >= 8 && cDigits.endsWith(searchDigits)) return true;
                if (cDigits.length >= 8 && searchDigits.endsWith(cDigits)) return true;
            }

            return false;
        });

        const activeClients = matchedClients.filter((c) => c.status === 'Ativo');
        const overdueClients = matchedClients.filter((c) => c.status !== 'Ativo');

        let responseText = `Assinaturas Ativas: ${activeClients.length}\n`;
        responseText += `Assinaturas Vencidas: ${overdueClients.length}\n\n`;

        responseText += `Assinaturas Ativas{\n\n`;
        if (activeClients.length > 0) {
            responseText += activeClients.map(buildClientBlock).join('\n\n\n');
            responseText += `\n`;
        }
        responseText += `}\n\n\n`;

        responseText += `Assinaturas Vencidas{\n\n`;
        if (overdueClients.length > 0) {
            responseText += overdueClients.map(buildClientBlock).join('\n\n\n');
            responseText += `\n`;
        }
        responseText += `}`;

        const url = new URL(request.url);
        const formatParam = url.searchParams.get('format');
        const acceptHeader = request.headers.get('accept') || '';

        if (formatParam === 'json' || acceptHeader.includes('application/json')) {
            return NextResponse.json({
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
            headers: {
                'Content-Type': 'text/plain; charset=utf-8',
            },
        });
    } catch (e: any) {
        console.error('Erro na API de consulta por telefone:', e);
        return new NextResponse(`Erro ao consultar assinaturas: ${e.message}`, { status: 500 });
    }
}
