import { NextRequest, NextResponse } from 'next/server';
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore, doc, getDoc, setDoc } from 'firebase/firestore';
import { firebaseConfig } from '@/firebase/config';
import type { FlowDefinition, UazapiConnectionConfig, Settings } from '@/lib/types';
import { executeFlowNode, FlowRunnerContext } from '@/lib/flow-runner';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
const db = getFirestore(app);

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { userId, flowId, phoneNumber } = body;

        if (!userId || !flowId || !phoneNumber) {
            return NextResponse.json(
                { error: 'Campos userId, flowId e phoneNumber são obrigatórios.' },
                { status: 400 }
            );
        }

        // Buscar conexão UazAPI do usuário
        let serverUrl = 'https://travelflow.uazapi.com';
        let instanceToken = '';

        const connRef = doc(db, 'users', userId, 'settings', 'uazapi_flow');
        const connSnap = await getDoc(connRef);
        if (connSnap.exists()) {
            const data = connSnap.data() as UazapiConnectionConfig;
            serverUrl = data.serverUrl || serverUrl;
            instanceToken = data.instanceToken;
        }

        // Se não tiver na config de fluxo, tenta o token do sistema
        if (!instanceToken) {
            const mainConfigRef = doc(db, 'users', userId, 'settings', 'config');
            const mainSnap = await getDoc(mainConfigRef);
            if (mainSnap.exists()) {
                const mainData = mainSnap.data() as Settings;
                instanceToken = mainData.webhookToken || '';
            }
        }

        if (!instanceToken) {
            return NextResponse.json(
                { error: 'Instância do WhatsApp não configurada. Configure o token em "Conectar WhatsApp".' },
                { status: 400 }
            );
        }

        // Carregar fluxo
        const flowRef = doc(db, 'users', userId, 'flows', flowId);
        const flowSnap = await getDoc(flowRef);
        if (!flowSnap.exists()) {
            return NextResponse.json({ error: 'Fluxo não encontrado.' }, { status: 404 });
        }

        const flow = flowSnap.data() as FlowDefinition;
        const nodes = flow.nodes || [];
        if (nodes.length === 0) {
            return NextResponse.json({ error: 'O fluxo não possui blocos para executar.' }, { status: 400 });
        }

        // Identifica o nó inicial
        const edges = flow.edges || [];
        const targetNodeIds = new Set(edges.map((e: any) => e.target));
        const rootNode = nodes.find((n: any) => !targetNodeIds.has(n.id)) || nodes[0];

        const cleanNumber = phoneNumber.replace(/\D/g, '');

        const runnerCtx: FlowRunnerContext = {
            db,
            userId,
            serverUrl,
            instanceToken,
            phoneNumber: cleanNumber,
            contactName: 'Testador',
        };

        // Salvar início de sessão
        const sessionDocRef = doc(db, 'users', userId, 'flow_sessions', cleanNumber);
        await setDoc(sessionDocRef, {
            userId,
            flowId,
            currentNodeId: rootNode.id,
            status: 'active',
            lastInteractionAt: new Date().toISOString(),
        });

        // Executar o nó inicial
        await executeFlowNode(runnerCtx, flow, rootNode.id);

        return NextResponse.json({ success: true, message: `Fluxo disparado com sucesso para ${cleanNumber}.` });

    } catch (err: any) {
        console.error('[api/flows/test] error:', err);
        return NextResponse.json({ error: err.message || 'Erro ao testar fluxo.' }, { status: 500 });
    }
}
