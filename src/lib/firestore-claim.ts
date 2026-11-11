import { firebaseConfig } from '@/firebase/config';

/**
 * Trava ATÔMICA "uma única vez" usando a API REST do Firestore.
 * Cria o documento `claims/{key}` com a regra "só cria se não existir".
 * Se duas instâncias/abas tentarem ao mesmo tempo, apenas UMA recebe sucesso (a outra recebe 409 ALREADY_EXISTS).
 *
 * Retorna true  -> esta chamada ganhou a trava (pode enviar a mensagem).
 * Retorna false -> outra chamada já ganhou (NÃO enviar, evita duplicidade).
 * Em caso de falha inesperada (rede/regras), retorna `fallback` para não travar o fluxo.
 */
export async function claimOnce(key: string, fallback = true): Promise<boolean> {
  const safeKey = key.replace(/[^a-zA-Z0-9_\-]/g, '_').slice(0, 480);
  const url =
    `https://firestore.googleapis.com/v1/projects/${firebaseConfig.projectId}` +
    `/databases/(default)/documents/claims?documentId=${encodeURIComponent(safeKey)}` +
    `&key=${firebaseConfig.apiKey}`;

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fields: {
          key: { stringValue: safeKey },
          createdAtMs: { integerValue: String(Date.now()) },
        },
      }),
      cache: 'no-store',
    });

    if (res.ok) return true;
    if (res.status === 409) return false;

    console.warn(`[claimOnce] Resposta inesperada ${res.status} para ${safeKey}`);
    return fallback;
  } catch (err: any) {
    console.warn('[claimOnce] Erro de rede ao criar trava:', err?.message);
    return fallback;
  }
}
