/**
 * Twilio SMS delivery status webhook.
 *
 * POST /api/v1/webhooks/twilio — Delivery status callback
 *
 * Uses Twilio HMAC signature validation (NOT bearer token).
 * Updates per-recipient SMS delivery status idempotently.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { validateSmsWebhookSignature } from '@/lib/services/sms/sms-service';
import { mapTwilioStatus } from '@/lib/services/sms/twilio-provider';
import { updateRecipientSmsStatusByIds } from '@/lib/services/emergency-broadcast-service';
import { findRecipientByTwilioSid } from '@/lib/services/twilio-webhook-service';

/**
 * Parse form-encoded body from Twilio webhook.
 */
async function parseFormBody(req: NextRequest): Promise<Record<string, string>> {
  const text = await req.text();
  const params = new URLSearchParams(text);
  const body: Record<string, string> = {};
  for (const [key, value] of params.entries()) {
    body[key] = value;
  }
  return body;
}

export async function POST(req: NextRequest) {
  try {
    // Parse form body
    const body = await parseFormBody(req);

    // Validate Twilio signature
    const signature = req.headers.get('X-Twilio-Signature');
    if (!signature) {
      return NextResponse.json({ error: 'Missing X-Twilio-Signature header' }, { status: 401 });
    }

    const reqUrl = new URL(req.url);
    const url = `${reqUrl.origin}${reqUrl.pathname}`;
    if (!validateSmsWebhookSignature(signature, url, body)) {
      return NextResponse.json({ error: 'Invalid webhook signature' }, { status: 403 });
    }

    // Extract status update fields
    const messageSid = body['MessageSid'];
    const messageStatus = body['MessageStatus'];
    const errorCode = body['ErrorCode'];
    const errorMessage = body['ErrorMessage'];

    if (!messageSid || !messageStatus) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const normalizedStatus = mapTwilioStatus(messageStatus);

    // Cross-tenant SID lookup — we don't know community_id from the webhook.
    const recipient = await findRecipientByTwilioSid(messageSid);
    if (!recipient) {
      console.warn('[twilio-webhook] Received status callback for unknown MessageSid:', {
        messageSid,
        messageStatus,
      });
      return NextResponse.json({ received: true });
    }

    await updateRecipientSmsStatusByIds(
      Number(recipient.communityId),
      Number(recipient.broadcastId),
      recipient.userId,
      normalizedStatus,
      errorCode,
      errorMessage,
    );

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error('[twilio-webhook] Error processing webhook:', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
