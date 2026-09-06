/**
 * Inbound support mail — the ingress for support@ / privacy@ / contact@.
 *
 * Forward Email receives the message and POSTs it here. Constraints, each of
 * which is load-bearing:
 *
 *   - MUST NOT use withErrorHandler. It converts a throw into a 500 with a
 *     generic envelope, which is nearly right, but the status codes below are
 *     chosen for a mail provider's retry semantics and must be explicit.
 *   - MUST read the raw body with req.text() BEFORE anything else. Signature
 *     verification needs the exact bytes; re-serializing parsed JSON changes
 *     key order and whitespace and will never match.
 *   - MUST verify the signature before touching the payload. The webhook URL
 *     lives in a world-readable DNS TXT record, so the HMAC is the only access
 *     control this endpoint has or can have.
 *   - MUST NOT send anything. No auto-acknowledgement, no vacation responder,
 *     no bounce-on-spam. Auto-replying to inbound mail from a published address
 *     is how a domain gets blocklisted. The admin reply route is the only path
 *     that calls sendEmail, and its first statement is requirePlatformAdmin().
 *
 * ── THE 5xx INVARIANT ──
 *
 * On failure this returns 5xx, NEVER 200. That inverts the house pattern: the
 * Stripe and Twilio webhooks always return 200 because those providers retry
 * forever and a poison message would loop.
 *
 * Here the non-2xx IS the durability mechanism. Forward Email retries twice,
 * then temp-fails the SMTP session with a 421 (helpers/get-error-code.js), at
 * which point the SENDER's mail server queues the message and retries for
 * 24-72 hours. So a 5xx means "held, try again"; a 200 over a failed write
 * means the message is gone and the sender believes it arrived. There is no
 * fallback mailbox precisely because this holds.
 */
import { NextResponse, type NextRequest } from 'next/server';

import { normalizeForwardEmailPayload } from '@/lib/services/support-inbox/normalize';
import { verifyForwardEmailWebhookToken } from '@/lib/services/support-inbox/signature';
import {
  persistInboundEmail,
  quarantineInboundPayload,
} from '@/lib/services/support-inbox/inbound-email-service';
import {
  InboundEmailShapeError,
  InboundEmailSignatureError,
} from '@/lib/services/support-inbox/types';

/** A ~4 MB JSON parse plus a transaction. Cheap insurance against a cold start. */
export const maxDuration = 30;

type Outcome = 'success' | 'duplicate' | 'quarantined' | 'rejected' | 'failure';

type ErrorCode =
  | 'SECRET_NOT_CONFIGURED'
  | 'SIGNATURE_INVALID'
  | 'BODY_UNPARSEABLE'
  | 'SHAPE_UNRECOGNIZED'
  | 'PERSIST_FAILED';

/**
 * Structured logging, mirroring logStripeWebhookEvent.
 *
 * Deliberately never logs the body or any part of it: this is a third party's
 * email. When a payload cannot be read it goes to `raw_payload` in the
 * database, where it is behind the same RLS lockdown as the messages.
 */
function logInboundEmailEvent(
  level: 'info' | 'warn' | 'error',
  message: string,
  context: { outcome: Outcome; errorCode?: ErrorCode; mailbox?: string; threadId?: number },
): void {
  const line = JSON.stringify({
    component: 'inbound-email-webhook',
    message,
    ...context,
  });
  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.info(line);
}

export const POST = async (req: NextRequest): Promise<NextResponse> => {
  // Raw bytes first — everything below depends on them being untouched.
  const rawBody = await req.text();

  try {
    verifyForwardEmailWebhookToken(rawBody, req.headers);
  } catch (error) {
    if (error instanceof InboundEmailSignatureError && error.kind === 'unconfigured') {
      // OUR fault. 500 so it is loud and so the provider retries once fixed —
      // the sender's server is holding the message either way.
      logInboundEmailEvent('error', 'inbound email webhook secret is not configured', {
        outcome: 'failure',
        errorCode: 'SECRET_NOT_CONFIGURED',
      });
      return NextResponse.json({ error: 'not configured' }, { status: 500 });
    }

    logInboundEmailEvent('warn', 'inbound email signature rejected', {
      outcome: 'rejected',
      errorCode: 'SIGNATURE_INVALID',
    });
    return NextResponse.json({ error: 'invalid signature' }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    // Signature-valid but not JSON means the provider changed something. Keep
    // the bytes rather than dropping them, and 200 so it is not retried into
    // the same failure.
    await quarantineInboundPayload(rawBody, 'body was not valid JSON');
    logInboundEmailEvent('error', 'inbound email body was not JSON', {
      outcome: 'quarantined',
      errorCode: 'BODY_UNPARSEABLE',
    });
    return NextResponse.json({ received: true, quarantined: true });
  }

  let email;
  try {
    email = normalizeForwardEmailPayload(payload);
  } catch (error) {
    if (!(error instanceof InboundEmailShapeError)) throw error;

    // The payload shape is read from Forward Email's source, not a spec, so it
    // can drift. Quarantining keeps the message AND turns the drift into a row
    // an operator can read and freeze as a test fixture — which is why there is
    // no separate capture flag. 200, because a retry would fail identically.
    await quarantineInboundPayload(payload, error.message);
    logInboundEmailEvent('error', 'inbound email payload could not be normalized', {
      outcome: 'quarantined',
      errorCode: 'SHAPE_UNRECOGNIZED',
    });
    return NextResponse.json({ received: true, quarantined: true });
  }

  try {
    const result = await persistInboundEmail(email);

    logInboundEmailEvent('info', 'inbound email stored', {
      outcome: result.duplicate ? 'duplicate' : 'success',
      mailbox: email.mailbox,
      threadId: result.threadId,
    });

    return NextResponse.json({ received: true, duplicate: result.duplicate });
  } catch (error) {
    // THE DURABILITY INVARIANT. Do not turn this into a 200. Nothing was
    // written (the whole persist runs in one transaction), so a 5xx makes
    // Forward Email temp-fail the SMTP session and the sender's own server
    // holds and retries for 24-72 hours. A 200 here loses the message silently
    // while telling the sender it arrived.
    logInboundEmailEvent('error', 'failed to store inbound email', {
      outcome: 'failure',
      errorCode: 'PERSIST_FAILED',
      mailbox: email.mailbox,
    });
    console.error('[inbound-email-webhook] persist error', error);
    return NextResponse.json({ error: 'failed to store message' }, { status: 500 });
  }
};
