/**
 * SMS service — public API for sending emergency SMS.
 *
 * Wraps the provider interface with bulk sending, error isolation,
 * and logging. SMS failures are isolated per-recipient and never
 * block email delivery.
 */

import type { SmsProvider } from './sms-provider';
import type {
  SmsBulkSendRequest,
  SmsBulkSendResult,
  SmsSendResult,
  SmsRecipient,
} from './sms-types';
import { TwilioProvider } from './twilio-provider';
import { chunk } from '@/lib/utils/chunk';
import { isValidE164 } from '@/lib/utils/phone';

// ── Singleton provider ──────────────────────────────────────────────────────

let providerInstance: SmsProvider | null = null;

function getProvider(): SmsProvider {
  if (!providerInstance) {
    providerInstance = new TwilioProvider();
  }
  return providerInstance;
}

/** Override the provider (for testing). */
export function setSmsProvider(provider: SmsProvider): void {
  providerInstance = provider;
}

/** Reset to default provider (for testing cleanup). */
export function resetSmsProvider(): void {
  providerInstance = null;
}

// ── Public API ──────────────────────────────────────────────────────────────

/**
 * Send a single emergency SMS.
 *
 * Returns the provider result. Throws only for invalid input.
 */
export async function sendEmergencySms(
  to: string,
  body: string,
  statusCallbackUrl?: string,
): Promise<SmsSendResult> {
  if (!isValidE164(to)) {
    throw new Error(`Invalid phone number: ${to}`);
  }

  const provider = getProvider();
  return provider.sendSms({ to, body, statusCallbackUrl });
}

/**
 * Send emergency SMS to multiple recipients in parallel.
 *
 * Each recipient is sent independently — one failure does not block others.
 * Results are keyed by userId for easy matching to broadcast recipient rows.
 *
 * Uses a concurrency limit to avoid overwhelming the provider API.
 */
export async function sendBulkEmergencySms(
  request: SmsBulkSendRequest,
): Promise<SmsBulkSendResult> {
  const provider = getProvider();
  const results = new Map<string, SmsSendResult>();
  let successCount = 0;
  let failureCount = 0;

  // Process in batches of 20 to control concurrency
  const BATCH_SIZE = 20;
  const batches = chunk(request.recipients, BATCH_SIZE);

  for (const batch of batches) {
    const batchResults = await Promise.all(
      batch.map(async (recipient) => {
        const result = await provider.sendSms({
          to: recipient.phone,
          body: request.body,
          statusCallbackUrl: request.statusCallbackUrl,
        });
        return { userId: recipient.userId, result };
      }),
    );

    for (const { userId, result } of batchResults) {
      results.set(userId, result);
      if (result.success) {
        successCount++;
      } else {
        failureCount++;
      }
    }
  }

  return { results, successCount, failureCount };
}

/**
 * Validate an incoming Twilio webhook signature.
 */
export function validateSmsWebhookSignature(
  signature: string,
  url: string,
  body: Record<string, string>,
): boolean {
  const provider = getProvider();
  return provider.validateWebhookSignature(signature, url, body);
}
