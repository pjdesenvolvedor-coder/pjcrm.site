/**
 * Integração Oficial LinkinPay para PIX e Renovação Automática
 */

export interface CreatePixParams {
  amountInCents: number;
  payerName?: string;
  payerDocument?: string;
  description?: string;
  webhookUrl?: string;
  apiToken?: string;
}

export interface LinkinPayPixResponse {
  id: string;
  qr_code: string;
  qr_code_base64: string;
  value: number;
  status: string;
}

export const DEFAULT_LINKINPAY_TOKEN = "45|Wm3x05BU8cHADDBfE18GkX0dItk4o8hKemzTcaB665c52a41";
const BASE_URL = "https://api.linkinpay.com.br/api";

export async function createLinkinPayPix({
  amountInCents,
  payerName = "Cliente",
  payerDocument,
  description = "Renovacao Assinatura",
  webhookUrl,
  apiToken,
}: CreatePixParams): Promise<LinkinPayPixResponse> {
  const token = apiToken?.trim() || DEFAULT_LINKINPAY_TOKEN;
  const cleanDoc = String(payerDocument || "").replace(/\D/g, "") || "02756661236";

  const payload: any = {
    value: amountInCents,
    payer_name: payerName.trim() || "Cliente",
    payer_document: cleanDoc,
    payer_question: description.trim() || "Renovacao PIX",
  };

  if (webhookUrl) {
    payload.webhook_url = webhookUrl;
  }

  console.log("[LinkinPay] Criando PIX /api/pix/cashIn:", {
    value: amountInCents,
    payer_name: payload.payer_name,
    webhook_url: webhookUrl,
  });

  const res = await fetch(`${BASE_URL}/pix/cashIn`, {
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
    console.error(`[LinkinPay] Erro ${res.status}:`, errorText);
    throw new Error(`Falha na LinkinPay (${res.status}): ${errorText.slice(0, 200)}`);
  }

  const data = await res.json();
  const txId = data.id || data.transactionId || `linkin_${Date.now()}`;

  return {
    id: String(txId),
    qr_code: data.qr_code || "",
    qr_code_base64: data.qr_code_base64 || "",
    value: data.value || amountInCents,
    status: data.status || "pending",
  };
}

export async function checkLinkinPayTransaction(
  transactionId: string,
  apiToken?: string
): Promise<{ paid: boolean; status: string; rawStatus: string }> {
  const token = apiToken?.trim() || DEFAULT_LINKINPAY_TOKEN;

  const res = await fetch(`${BASE_URL}/transactions/${transactionId}`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
    },
    cache: "no-store",
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    console.error(`[LinkinPay] Erro ao consultar transacao ${transactionId}:`, errText);
    throw new Error(`Erro LinkinPay (${res.status}): ${errText}`);
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
