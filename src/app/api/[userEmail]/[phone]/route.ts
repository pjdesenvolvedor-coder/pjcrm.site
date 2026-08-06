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
    props: { params: Promise<{ userEmail: string; phone: string }> }
) {
    let rawEmail = '';
    let rawPhone = '';

    try {
        const params = await props.params;
        rawEmail = decodeURIComponent(params.userEmail || '').trim().toLowerCase();
        rawPhone = decodeURIComponent(params.phone || '').trim();

        if (!rawEmail || !rawPhone) {
            return new NextResponse('Email do usuário e número de telefone são obrigatórios.', { status: 400 });
        }

        let targetUserId = '';
        let targetUserEmail = '';

        // 1. Tenta query direta por campo email
        try {
            const q = query(collection(db, 'users'), where('email', '==', rawEmail));
            const qSnap = await getDocs(q);
            if (!qSnap.empty) {
                targetUserId = qSnap.docs[0].id;
                targetUserEmail = qSnap.docs[0].data()?.email || rawEmail;
            }
        } catch (e) {
            console.error('Erro na query por email:', e);
        }

        // 2. Se não achou com where, percorre os usuários (case-insensitive)
        if (!targetUserId) {
            try {
                const usersSnapshot = await getDocs(collection(db, 'users'));
                for (const userDoc of usersSnapshot.docs) {
                    const uData = userDoc.data();
                    const emailInDoc = (uData.email || '').trim().toLowerCase();
                    const docIdLower = userDoc.id.trim().toLowerCase();
                    if (emailInDoc === rawEmail || docIdLower === rawEmail) {
                        targetUserId = userDoc.id;
                        targetUserEmail = uData.email || userDoc.id;
                        break;
                    }
                }
            } catch (e) {
                console.error('Erro ao percorrer users:', e);
            }
        }

        // 3. Fallback: tenta buscar o doc direto usando o rawEmail como ID
        if (!targetUserId) {
            try {
                const docSnap = await getDoc(doc(db, 'users', rawEmail));
                if (docSnap.exists()) {
                    targetUserId = docSnap.id;
                    targetUserEmail = docSnap.data()?.email || rawEmail;
                }
            } catch (e) {
                console.error('Erro ao buscar doc direto:', e);
            }
        }

        const userClients: Client[] = [];

        if (targetUserId) {
            try {
                const clientsSnap = await getDocs(collection(db, 'users', targetUserId, 'clients'));
                clientsSnap.docs.forEach((docSnap) => {
                    userClients.push({ id: docSnap.id, ...docSnap.data() } as Client);
                });
            } catch (e) {
                console.error(`Erro ao carregar clientes do usuário ${targetUserId}:`, e);
            }
        }

        const searchCanonical = getCanonicalPhone(rawPhone);
        const searchDigits = rawPhone.replace(/\D/g, '');

        // Filtra clientes do usuário pelo telefone
        const matchedClients = userClients.filter((c) => {
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

        const clientName = matchedClients.find((c) => c.name?.trim())?.name?.trim() || 'N/A';
        const activeClients = matchedClients.filter((c) => c.status === 'Ativo');
        const overdueClients = matchedClients.filter((c) => c.status !== 'Ativo');

        let responseText = `NomeCliente: ${clientName}\n`;
        responseText += `Assinaturas Ativas: ${activeClients.length}\n`;
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
                userEmail: targetUserEmail || rawEmail,
                userId: targetUserId || null,
                clientName: clientName,
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
        console.error('Erro na API de consulta por usuário e telefone:', e);

        const fallbackText = [
            `NomeCliente: N/A`,
            `Assinaturas Ativas: 0`,
            `Assinaturas Vencidas: 0`,
            ``,
            `Assinaturas Ativas{`,
            ``,
            `}`,
            ``,
            ``,
            `Assinaturas Vencidas{`,
            ``,
            `}`,
        ].join('\n');

        return new NextResponse(fallbackText, {
            status: 200,
            headers: {
                'Content-Type': 'text/plain; charset=utf-8',
            },
        });
    }
}
