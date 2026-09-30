import { NextResponse } from 'next/server';
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore, doc, getDoc, setDoc, addDoc, collection, getDocs, limit } from 'firebase/firestore';
import { firebaseConfig } from '@/firebase/config';
import { DEFAULT_2FA_CONFIG, TwoFactorConfig, TwoFactorRecipient } from '../login-config/route';

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

function maskPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.length >= 10) {
    const ddd = digits.slice(-11, -9);
    const first = digits.slice(-9, -4);
    return `(${ddd}) ${first}-****`;
  }
  return phone;
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const { recipientId } = body;

    if (!recipientId) {
      return NextResponse.json({ error: 'Selecione quem irá receber o código.' }, { status: 400 });
    }

    // 1. Carrega configuração de destinatários
    let config: TwoFactorConfig = DEFAULT_2FA_CONFIG;
    try {
      const configSnap = await getDoc(doc(db, 'system_settings', '2fatores'));
      if (configSnap.exists()) {
        const data = configSnap.data();
        config = {
          enabled: data.enabled !== undefined ? data.enabled : true,
          messageTemplate: data.messageTemplate || DEFAULT_2FA_CONFIG.messageTemplate,
          recipients: Array.isArray(data.recipients) && data.recipients.length > 0
            ? data.recipients
            : DEFAULT_2FA_CONFIG.recipients,
        };
      }
    } catch (e) {
      console.error('[send-code] Erro ao buscar config:', e);
    }

    const selectedRecipient = config.recipients.find((r) => String(r.id) === String(recipientId));
    if (!selectedRecipient || !selectedRecipient.phone) {
      return NextResponse.json({ error: 'Destinatário não encontrado ou sem telefone configurado.' }, { status: 404 });
    }

    const formattedPhone = formatPhoneWith55(selectedRecipient.phone);

    // 2. Gera código aleatório de 6 dígitos
    const generatedCode = String(Math.floor(100000 + Math.random() * 900000));
    const sessionId = `2fa_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    const expiresAt = Date.now() + 5 * 60 * 1000; // 5 minutos de validade

    // 3. Salva sessão no Firestore
    await setDoc(doc(db, 'two_factor_login_sessions', sessionId), {
      sessionId,
      recipientId: selectedRecipient.id,
      recipientName: selectedRecipient.name,
      phone: formattedPhone,
      code: generatedCode,
      verified: false,
      expiresAt,
      createdAt: Date.now(),
    });

    // 4. Monta a mensagem personalizada
    const template = config.messageTemplate || DEFAULT_2FA_CONFIG.messageTemplate;
    const messageText = template
      .replace(/{codigo}/gi, generatedCode)
      .replace(/{code}/gi, generatedCode)
      .replace(/{nome}/gi, selectedRecipient.name)
      .replace(/{telefone}/gi, selectedRecipient.phone)
      .replace(/{numero}/gi, selectedRecipient.phone);

    // 5. Coleta tokens disponíveis do WhatsApp
    const candidateTokens: string[] = [];
    try {
      const usersSnap = await getDocs(query(collection(db, 'users'), limit(15)));
      for (const uDoc of usersSnap.docs) {
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
    } catch (err) {
      console.error('[send-code] Erro ao buscar tokens:', err);
    }

    if (candidateTokens.length === 0) {
      // Fallback padrão se necessário
      candidateTokens.push('9a3a8362-5c26-44f6-a8a1-42550392386b');
    }

    let isSent = false;
    let usedToken = '';
    let sendError = '';

    for (const token of candidateTokens) {
      try {
        const res = await fetch('https://travelflow.uazapi.com/send/text', {
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

        if (res.ok) {
          isSent = true;
          usedToken = token;
          break;
        } else {
          const errText = await res.text().catch(() => '');
          sendError = `UAZAPI erro (${res.status}): ${errText}`;
        }
      } catch (fErr: any) {
        sendError = fErr?.message || 'Erro de conexão com WhatsApp';
      }
    }

    if (!isSent) {
      console.error('[send-code] Falha ao enviar mensagem:', sendError);
      return NextResponse.json({
        error: `Não foi possível enviar o código via WhatsApp: ${sendError}`,
      }, { status: 500 });
    }

    // Registra log
    await addDoc(collection(db, 'two_factor_logs'), {
      rawPhone: selectedRecipient.phone,
      formattedPhone,
      code: generatedCode,
      recipientName: selectedRecipient.name,
      message: messageText,
      status: 'Enviado',
      usedToken,
      timestampMs: Date.now(),
      type: 'login_2fa',
    }).catch(() => {});

    return NextResponse.json({
      success: true,
      sessionId,
      recipientName: selectedRecipient.name,
      phoneMasked: maskPhone(selectedRecipient.phone),
      expiresAt,
    });

  } catch (error: any) {
    console.error('[send-code] Erro interno:', error);
    return NextResponse.json({
      error: error?.message || 'Erro ao processar envio do código 2FA.',
    }, { status: 500 });
  }
}
