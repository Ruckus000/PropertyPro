/**
 * Twilio SMS provider implementation.
 *
 * Uses Twilio Messaging Service for throughput (pooled phone numbers).
 * Falls back gracefully — SMS failure never blocks email delivery.
 *
 * Required env vars:
 *   TWILIO_ACCOUNT_SID
 *   TWILIO_AUTH_TOKEN
 *   TWILIO_MESSAGING_SERVICE_SID
 */

import { createHmac, timingSafeEqual } from 'crypto';
import type { SmsProvider } from './sms-provider';
import type { SmsSendRequest, SmsSendResult, SmsDeliveryStatus } from './sms-types';

// ── Env validation ──────────────────────────────────────────────────────────

function getRequiredEnv(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

// ── Twilio status mapping ───────────────────────────────────────────────────

/** Map Twilio's status strings to our normalized SmsDeliveryStatus */
function mapTwilioStatus(twilioStatus: string): SmsDeliveryStatus {
  switch (twilioStatus) {
    case 'accepted':
    case 'queued':
    case 'sending':
      return 'queued';
    case 'sent':
      return 'sent';
    case 'delivered':
      return 'delivered';
    case 'failed':
      return 'failed';
    case 'undelivered':
      return 'undelivered';
    default:
      return 'pending';
  }
}

// ── Provider implementation ─────────────────────────────────────────────────

export class TwilioProvider implements SmsProvider {
  private accountSid: string;
  private authToken: string;
  private messagingServiceSid: string;
  private baseUrl: string;

  constructor() {
    this.accountSid = getRequiredEnv('TWILIO_ACCOUNT_SID');
    this.authToken = getRequiredEnv('TWILIO_AUTH_TOKEN');
    this.messagingServiceSid = getRequiredEnv('TWILIO_MESSAGING_SERVICE_SID');
    this.baseUrl = `https://api.twilio.com/2010-04-01/Accounts/${this.accountSid}`;
  }

  async sendSms(request: SmsSendRequest): Promise<SmsSendResult> {
    const params = new URLSearchParams({
      To: request.to,
      MessagingServiceSid: this.messagingServiceSid,
      Body: request.body,
    });

    if (request.statusCallbackUrl) {
      params.set('StatusCallback', request.statusCallbackUrl);
    }

    try {
      const response = await fetch(`${this.baseUrl}/Messages.json`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Authorization: `Basic ${btoa(`${this.accountSid}:${this.authToken}`)}`,
        },
        body: params.toString(),
      });

      if (!response.ok) {
        const errorBody = await response.json().catch(() => ({}));
        return {
          success: false,
          providerMessageId: null,
          status: 'failed',
          errorCode: String(errorBody.code ?? response.status),
          errorMessage: errorBody.message ?? `HTTP ${response.status}`,
        };
      }

      const data = await response.json().catch(() => null);
      if (!data?.sid) {
        return {
          success: false,
          providerMessageId: null,
          status: 'failed' as const,
          errorCode: 'PARSE_ERROR',
          errorMessage: 'Invalid JSON response from Twilio',
        };
      }

      return {
        success: true,
        providerMessageId: data.sid,
        status: mapTwilioStatus(data.status),
        errorCode: null,
        errorMessage: null,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown SMS send error';
      return {
        success: false,
        providerMessageId: null,
        status: 'failed',
        errorCode: 'NETWORK_ERROR',
        errorMessage: message,
      };
    }
  }

  validateWebhookSignature(
    signature: string,
    url: string,
    body: Record<string, string>,
  ): boolean {
    // Twilio signature validation per https://www.twilio.com/docs/usage/security
    // signature = HMAC-SHA1(authToken, url + sorted(params))
    try {
      // Build the data string: URL + sorted param key/values
      const sortedKeys = Object.keys(body).sort();
      let dataString = url;
      for (const key of sortedKeys) {
        dataString += key + body[key];
      }

      const computed = createHmac('sha1', this.authToken)
        .update(dataString, 'utf-8')
        .digest('base64');

      // Timing-safe comparison
      const sigBuffer = Buffer.from(signature);
      const computedBuffer = Buffer.from(computed);

      if (sigBuffer.length !== computedBuffer.length) {
        return false;
      }

      return timingSafeEqual(sigBuffer, computedBuffer);
    } catch {
      return false;
    }
  }
}

/**
 * Map a Twilio webhook status string to our normalized delivery status.
 * Exported for use by the webhook handler.
 */
export { mapTwilioStatus };
