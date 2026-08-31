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
import { isValidE164 } from '@/lib/utils/phone';
import { isSmsDispatchGloballyEnabled } from '@/lib/sms/dispatch-flag';

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

// ── Global kill switch ──────────────────────────────────────────────────────

/**
 * The result returned for every recipient while SMS dispatch is globally off.
 *
 * Deliberately a SKIPPED RESULT, not a thrown error. Callers already treat SMS
 * failures as per-recipient and isolated (`Promise.allSettled` in
 * emergency-broadcast-service), and emergency broadcasts send email and SMS in
 * parallel — so throwing from here risks taking the EMAIL leg down with it.
 * A resident must still get their hurricane notice by email.
 */
function disabledResult(): SmsSendResult {
  return {
    success: false,
    providerMessageId: null,
    status: 'skipped',
    errorCode: 'SMS_DISABLED',
    errorMessage: 'SMS dispatch is disabled for this deployment',
  };
}

// ── Public API ──────────────────────────────────────────────────────────────

/**
 * Send a single emergency SMS.
 *
 * Returns the provider result. Throws only for invalid input.
 *
 * Gated by the global `SMS_DISPATCH_ENABLED` floor — see @/lib/sms/dispatch-flag
 * and @/lib/sms/common for
 * why the kill switch lives here rather than on the routes. Note the check
 * comes BEFORE provider construction: `TwilioProvider`'s constructor throws on
 * missing credentials, so a deployment with SMS off need not carry Twilio env
 * vars at all.
 */
export async function sendEmergencySms(
  to: string,
  body: string,
  statusCallbackUrl?: string,
): Promise<SmsSendResult> {
  if (!isValidE164(to)) {
    throw new Error(`Invalid phone number: ${to}`);
  }

  if (!isSmsDispatchGloballyEnabled()) {
    return disabledResult();
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
  // Global kill switch. Every recipient comes back 'skipped' rather than
  // 'failed', so delivery reports read as "not attempted" instead of implying a
  // carrier problem — and, as above, the email leg is untouched.
  if (!isSmsDispatchGloballyEnabled()) {
    const skipped = new Map<string, SmsSendResult>();
    for (const recipient of request.recipients) {
      skipped.set(recipient.userId, disabledResult());
    }
    return { results: skipped, successCount: 0, failureCount: 0 };
  }

  const provider = getProvider();
  const results = new Map<string, SmsSendResult>();
  let successCount = 0;
  let failureCount = 0;

  // Use sliding window concurrency to maximize throughput
  const CONCURRENCY = 20;
  let currentIndex = 0;

  const workers = Array(Math.min(CONCURRENCY, request.recipients.length))
    .fill(null)
    .map(async () => {
      while (currentIndex < request.recipients.length) {
        const index = currentIndex++;
        const recipient = request.recipients[index];
        if (!recipient) break;

        const result = await provider.sendSms({
          to: recipient.phone,
          body: request.body,
          statusCallbackUrl: request.statusCallbackUrl,
        });

        results.set(recipient.userId, result);
        if (result.success) {
          successCount++;
        } else {
          failureCount++;
        }
      }
    });

  await Promise.all(workers);

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
