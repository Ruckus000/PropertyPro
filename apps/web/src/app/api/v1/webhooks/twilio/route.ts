/**
 * Twilio SMS webhook — delivery status AND inbound messages.
 *
 * POST /api/v1/webhooks/twilio
 *
 * Uses Twilio HMAC signature validation (NOT bearer token). One route, two
 * payload shapes, branched on the presence of a `Body` field:
 *
 *   - **Status callback** (`MessageSid` + `MessageStatus`, no `Body`) — updates
 *     the per-recipient delivery status idempotently.
 *   - **Inbound message** (`Body` + `From`) — TCPA keyword handling. STOP
 *     revokes SMS consent for that phone number across every community;
 *     START clears the revocation; HELP is acknowledged and changes nothing.
 *
 * ── Why one route rather than two ──
 *
 * The signature validation, the form parsing and the error posture are
 * identical, and Twilio's console lets a number's inbound handler and its
 * status callback point at the same URL. A second route would be a copy of this
 * one with four lines different, and the copy that drifts is always the one
 * nobody is looking at.
 *
 * See docs/audits/2026-08-09-legal-risk-audit.md F-10.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { validateSmsWebhookSignature } from '@/lib/services/sms/sms-service';
import { mapTwilioStatus } from '@/lib/services/sms/twilio-provider';
import { updateRecipientSmsStatusByIds } from '@/lib/services/emergency-broadcast-service';
import { findRecipientByTwilioSid } from '@/lib/services/twilio-webhook-service';
import { classifyInboundSms } from '@/lib/services/sms/sms-keyword';
import {
  restoreSmsConsentByPhone,
  revokeSmsConsentByPhone,
} from '@/lib/services/sms/sms-consent-service';

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

    // ── Inbound message branch (TCPA keywords) ─────────────────────────────
    //
    // Checked BEFORE the status-callback fields. An inbound message carries a
    // `MessageSid` too, so ordering these the other way round would send every
    // STOP down the delivery-status path and silently drop the opt-out.
    const inboundBody = body['Body'];
    if (typeof inboundBody === 'string') {
      const from = body['From'];
      const keyword = classifyInboundSms(inboundBody);

      // `help` and unrecognised text change no consent state. Twilio's own
      // Advanced Opt-Out answers HELP at the carrier layer; replying again from
      // here would double-message someone who asked one question.
      if (keyword === 'stop' && from) {
        const change = await revokeSmsConsentByPhone(from);
        console.info('[twilio-webhook] SMS consent revoked by keyword', {
          matchedUser: change.userId !== null,
          communitiesUpdated: change.rowsUpdated,
        });
      } else if (keyword === 'start' && from) {
        const change = await restoreSmsConsentByPhone(from);
        console.info('[twilio-webhook] SMS opt-out cleared by keyword', {
          matchedUser: change.userId !== null,
          communitiesUpdated: change.rowsUpdated,
        });
      }

      // Always 200: Twilio retries non-2xx, and there is nothing to retry for
      // an unknown number or an unrecognised word.
      return NextResponse.json({ received: true });
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
