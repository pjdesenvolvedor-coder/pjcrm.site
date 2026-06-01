// src/lib/zapToken.ts

import type { Settings } from '@/lib/types';

/**
 * Returns the appropriate WhatsApp token based on the user's settings.
 * If the user has configured a separate Zap for billing, use that token;
 * otherwise fall back to the main hub token.
 */
export function getZapToken(settings: Settings | undefined): string {
  if (!settings) return '';
  // When using a separate Zap for billing (or 2FA), the token is stored in billingWebhookToken.
  if (settings.useSeparateBillingZap && settings.billingWebhookToken) {
    return settings.billingWebhookToken;
  }
  // Default to the main hub token.
  return settings.webhookToken ?? '';
}
