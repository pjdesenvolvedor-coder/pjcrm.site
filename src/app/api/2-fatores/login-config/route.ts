import { NextResponse } from 'next/server';
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore, doc, getDoc, setDoc, collection, getDocs, limit } from 'firebase/firestore';
import { firebaseConfig } from '@/firebase/config';

export const dynamic = 'force-dynamic';

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
const db = getFirestore(app);

export interface TwoFactorRecipient {
  id: string;
  name: string;
  phone: string;
}

export interface TwoFactorConfig {
  enabled: boolean;
  messageTemplate: string;
  recipients: TwoFactorRecipient[];
}

export const DEFAULT_2FA_CONFIG: TwoFactorConfig = {
  enabled: true,
  messageTemplate: `🔐 Olá {nome}!\n\nSeu código de acesso para o Painel ADM:\n\n📲 Código: *{codigo}*\n\n⚠️ Este código é pessoal e expira em 5 minutos.`,
  recipients: [
    { id: '1', name: 'Jivago', phone: '77998413534' },
    { id: '2', name: 'May', phone: '87991791807' },
  ],
};

// GET: Retorna a configuração pública do 2FA para o login
export async function GET() {
  try {
    const configSnap = await getDoc(doc(db, 'system_settings', '2fatores'));
    let config: TwoFactorConfig = DEFAULT_2FA_CONFIG;

    if (configSnap.exists()) {
      const data = configSnap.data();
      config = {
        enabled: data.enabled !== undefined ? data.enabled : true,
        messageTemplate: data.messageTemplate || DEFAULT_2FA_CONFIG.messageTemplate,
        recipients: Array.isArray(data.recipients) && data.recipients.length > 0
          ? data.recipients
          : DEFAULT_2FA_CONFIG.recipients,
      };
    } else {
      // Cria configuração inicial padrão se não existir
      await setDoc(doc(db, 'system_settings', '2fatores'), DEFAULT_2FA_CONFIG, { merge: true });
    }

    return NextResponse.json({
      success: true,
      enabled: config.enabled,
      messageTemplate: config.messageTemplate,
      recipients: config.recipients, // Envia lista de botões configurados
    });
  } catch (error: any) {
    console.error('[2fa/login-config] Erro ao buscar config:', error);
    return NextResponse.json({
      success: true,
      ...DEFAULT_2FA_CONFIG,
    });
  }
}

// POST: Salva a configuração de 2FA
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { enabled, messageTemplate, recipients } = body;

    const newConfig: TwoFactorConfig = {
      enabled: enabled !== undefined ? Boolean(enabled) : true,
      messageTemplate: messageTemplate ? String(messageTemplate).trim() : DEFAULT_2FA_CONFIG.messageTemplate,
      recipients: Array.isArray(recipients) && recipients.length > 0
        ? recipients.map((r: any, idx: number) => ({
            id: String(r.id || idx + 1),
            name: String(r.name || `Admin ${idx + 1}`).trim(),
            phone: String(r.phone || '').replace(/\D/g, ''),
          }))
        : DEFAULT_2FA_CONFIG.recipients,
    };

    await setDoc(doc(db, 'system_settings', '2fatores'), newConfig, { merge: true });

    return NextResponse.json({
      success: true,
      config: newConfig,
    });
  } catch (error: any) {
    console.error('[2fa/login-config] Erro ao salvar config:', error);
    return NextResponse.json({ success: false, error: error?.message || 'Erro ao salvar configurações' }, { status: 500 });
  }
}
