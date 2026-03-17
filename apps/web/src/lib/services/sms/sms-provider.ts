/**
 * SMS provider interface — provider-agnostic abstraction.
 *
 * Implementations (e.g. TwilioProvider) handle vendor-specific details.
 * The interface is intentionally minimal to support easy provider swapping.
 */

import type { SmsSendRequest, SmsSendResult } from './sms-types';

export interface SmsProvider {
  /**
   * Send a single SMS message.
   * All phone numbers must be in E.164 format.
   */
  sendSms(request: SmsSendRequest): Promise<SmsSendResult>;

  /**
   * Validate an incoming webhook signature from the provider.
   * Returns true if the signature is valid.
   *
   * @param signature - The signature header value from the webhook request
   * @param url - The full webhook URL
   * @param body - The raw request body (form-encoded or JSON)
   */
  validateWebhookSignature(signature: string, url: string, body: Record<string, string>): boolean;
}
