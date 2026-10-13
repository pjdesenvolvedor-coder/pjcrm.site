/**
 * Integração Oficial PJ Pay Gateway para PIX e Renovação Automática
 */

export interface CreatePjPayPixParams {
  amountInCents: number;
  payerName: string;
  description?: string;
  webhookUrl?: string;
  apiToken?: string;
}

export interface PjPayPixResponse {
  id: string;
  qr_code: string;
  qr_code_base64: string;
  value: number;
  status: string;
}

export const DEFAULT_PJPAY_TOKEN = "pj_live_W9IMRIG1GFW48ND7YIUEX5sELQB4tDLD";
const PJPAY_BASE_URL = "https://www.pjgateway.com/api/v1";

/**
 * Cria uma cobrança PIX via PJ Pay Gateway
 */
export async function createPjPayPix({
  amountInCents,
  payerName,
  description = "Renovacao Assinatura",
  webhookUrl,
  apiToken,
}: CreatePjPayPixParams): Promise<PjPayPixResponse> {
  const token = apiToken?.trim() || DEFAULT_PJPAY_TOKEN;
  const cleanPayerName = String(payerName || "").trim() || "Cliente";

  const payload: any = {
    amount: amountInCents,
    payer: {
      name: cleanPayerName,
    },
  };

  if (description) {
    payload.description = description;
  }
  if (webhookUrl) {
    payload.webhook_url = webhookUrl;
  }

  console.log("[PJPay] Criando cobrança PIX /api/v1/payments:", {
    amount: amountInCents,
    payer: payload.payer,
    webhook_url: webhookUrl,
  });

  const res = await fetch(`${PJPAY_BASE_URL}/payments`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(payload),
    cache: "no-store",
  });

  if (!res.ok) {
    const errorText = await res.text().catch(() => "");
    console.error(`[PJPay] Erro ${res.status}:`, errorText);
    throw new Error(`Falha na PJ Pay Gateway (${res.status}): ${errorText.slice(0, 200)}`);
  }

  const data = await res.json();
  const qrCode = data.pix?.qr_code || data.qr_code || data.pix?.code || "";
  const qrCodeBase64 = data.pix?.qr_code_base64 || data.qr_code_base64 || "";
  const paymentId = data.id || data.payment_id || `pjpay_${Date.now()}`;

  return {
    id: String(paymentId),
    qr_code: qrCode,
    qr_code_base64: qrCodeBase64,
    value: data.amount || amountInCents,
    status: data.status || "pending",
  };
}

/**
 * Consulta o status de um pagamento na PJ Pay Gateway
 */
export async function checkPjPayTransaction(
  transactionId: string,
  apiToken?: string
): Promise<{ paid: boolean; status: string; rawStatus: string }> {
  const token = apiToken?.trim() || DEFAULT_PJPAY_TOKEN;

  const res = await fetch(`${PJPAY_BASE_URL}/payments/${transactionId}`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
    },
    cache: "no-store",
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    console.error(`[PJPay] Erro ao consultar transação ${transactionId}:`, errText);
    throw new Error(`Erro PJ Pay Gateway (${res.status}): ${errText}`);
  }

  const txData = await res.json();
  const rawStatus = String(txData.status || "").toLowerCase();

  const isPaid = [
    "paid",
    "completed",
    "completo",
    "pago",
    "aprovado",
    "approved",
  ].includes(rawStatus);

  return {
    paid: isPaid,
    status: isPaid ? "paid" : rawStatus,
    rawStatus,
  };
}
