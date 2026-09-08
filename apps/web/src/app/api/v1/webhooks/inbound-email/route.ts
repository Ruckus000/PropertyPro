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
 * ── THE DEFERRAL INVARIANT ──
 *
 * On failure this returns 429, NEVER 200 and NEVER 5xx. It still inverts the
 * house pattern — the Stripe and Twilio webhooks always return 200 because
 * those providers retry forever and a poison message would loop — but the
 * status matters, and this file used to have it backwards.
 *
 * Forward Email maps our HTTP status onto the live SMTP session:
 *
 *   4xx, except 403/404  ->  SMTP 421  ->  the SENDER's server queues the
 *                            message and retries for 24-72 hours
 *   >= 500               ->  returned verbatim  ->  a PERMANENT failure, so
 *                            the sender bounces it immediately
 *
 * So the 500 this route used to return on a failed write did the opposite of
 * what its own comment claimed: it destroyed the message it was trying to
 * protect. 429 defers. It also earns a free in-session HTTP retry, which 401
 * does not (their retryable set is {408, 413, 429, 550}).
 *
 * A 200 over a failed write is still the worst outcome: the message is gone
 * and the sender believes it arrived. There is no fallback mailbox because
 * the sender's own queue is the fallback — but only while we defer.
 *
 * UNVERIFIED AGAINST THE DEPLOYED MX. This mapping was read from
 * forwardemail.net master (helpers/get-error-code.js, is-retryable-error.js
 * and zone-mta's bounce rules); their FAQ describes older behaviour, so one of
 * the two is stale. 429 is the right answer under BOTH readings, because every
 * source agrees on 4xx -> 421. Settling it properly means poisoning one test
 * message and reading the sender's NDR.
 */
import * as Sentry from '@sentry/nextjs';
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
/**
 * 60, not 30, and the number matters.
 *
 * At 30 this tied with postgres.js's `connect_timeout` default and with Forward
 * Email's own HTTP timeout, and the platform's clock starts first — so a DB
 * connect hang produced a Vercel 504 rather than our 429. A 5xx is a PERMANENT
 * failure to Forward Email, so the mail bounced instead of being held: the
 * exact outcome this route exists to prevent, on the exact failure it names.
 *
 * With 60 both of the other clocks fire first. The driver gives up at 10s and
 * we return 429; if something else stalls, Forward Email times out at ~30s,
 * which is their own retryable path. Either beats being killed mid-request.
 *
 * community-export-worker/route.ts already uses 60, so this is a choice rather
 * than a platform ceiling.
 */
export const maxDuration = 60;

type Outcome = 'success' | 'duplicate' | 'quarantined' | 'rejected' | 'failure';

type ErrorCode =
  | 'SECRET_NOT_CONFIGURED'
  | 'SIGNATURE_MISSING'
  | 'SIGNATURE_MISMATCH'
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

/**
 * U+0000, which Postgres cannot store in `text` (SQLSTATE 22021) or `jsonb`
 * (22P05).
 *
 * This is stripped HERE, at the boundary, rather than in `readString` or
 * `normalizeMessageId`, because those two cover only the normalized columns.
 * The quarantine path writes the whole provider payload into `raw_payload`,
 * a `jsonb` column, and neither reader runs on that route.
 *
 * Why it matters more than a cosmetic scrub: a NUL makes the INSERT fail with
 * a code that is not 23505, so `persistInboundEmail` rethrows and this route
 * takes the deferral branch. Every retry then fails identically until the
 * sender gives up, so one control character turns "held, try again" into
 * "held, retried for three days, then lost".
 */
const NUL_RE = /\u0000/g;

export const POST = async (req: NextRequest): Promise<NextResponse> => {
  /**
   * Everything is inside one try/catch because this route deliberately does
   * NOT use withErrorHandler (see the header). Without this, three paths threw
   * straight past every deferral above and Next answered with a framework 500
   * — a PERMANENT failure: `req.text()`, both `quarantineInboundPayload`
   * awaits, and the non-shape rethrow.
   *
   * The asymmetry that created was the whole bug. With Postgres unreachable an
   * ORDINARY message deferred and was held at the sender, while a
   * shape-drifted or non-JSON one bounced and was gone — and that is precisely
   * the payload that exists nowhere else, the one quarantine exists to keep.
   */
  try {
    return await handleInboundEmail(req);
  } catch (error) {
    /**
     * Report BEFORE anything else in this block.
     *
     * Catching here removed the only alerting these paths had. Sentry reports
     * this route two ways and both fire only on an UNCAUGHT error: the
     * @sentry/nextjs route wrapper, and `onRequestError` in instrumentation.ts.
     * Nothing here turns a console line into an alert — sentry.server.config.ts
     * calls Sentry.init with no `integrations`, so there is no
     * captureConsoleIntegration, and logInboundEmailEvent is itself a
     * console.error.
     *
     * Without this line the deferral buys nothing: Forward Email would retry a
     * broken deploy against the sender's 24-72h window while no one is told,
     * and the first sign of trouble would be an NDR after the window is spent.
     */
    Sentry.captureException(error, { tags: { component: 'inbound-email-webhook' } });
    console.error('[inbound-email-webhook] unhandled', error);
    logInboundEmailEvent('error', 'inbound email handler threw', {
      outcome: 'failure',
      errorCode: 'PERSIST_FAILED',
    });
    return NextResponse.json({ error: 'failed to store message' }, { status: 429 });
  }
};

const handleInboundEmail = async (req: NextRequest): Promise<NextResponse> => {
  // Raw bytes first — everything below depends on them being untouched.
  const rawBody = await req.text();

  try {
    verifyForwardEmailWebhookToken(rawBody, req.headers);
  } catch (error) {
    if (error instanceof InboundEmailSignatureError && error.kind === 'unconfigured') {
      // OUR fault, not the caller's — but it must still DEFER. A 500 here is
      // returned verbatim as a permanent failure and every message bounces
      // while the secret is being fixed, which is the opposite of loud: it is
      // silent and lossy. 429 makes the sender hold. Not 401 either, which
      // defers but reads as the provider's fault in their logs and forfeits
      // the in-session retry.
      // Reported, like the other two failure branches. Without this the branch
      // is SILENT: readiness does check the secret but is not among the crons
      // in vercel.json, and a missing secret yields `degraded`, which returns
      // HTTP 200 — so a status-code monitor sees green while every message to
      // every address is held, and then bounces together 24-72h later. That is
      // the 2026-08 cron incident repeated, where seventeen jobs returned 401
      // for months behind a green dashboard and produced zero events.
      Sentry.captureException(error, { tags: { component: 'inbound-email-webhook' } });
      logInboundEmailEvent('error', 'inbound email webhook secret is not configured', {
        outcome: 'failure',
        errorCode: 'SECRET_NOT_CONFIGURED',
      });
      return NextResponse.json({ error: 'not configured' }, { status: 429 });
    }

    // Distinguish the two, because they call for opposite responses and
    // collapsing them into one code made a live incident far harder to read:
    // a MISMATCH means rotate the secret; a MISSING header means the caller
    // does not sign at all and no secret change will help.
    const missing =
      error instanceof InboundEmailSignatureError && error.kind === 'missing_header';

    logInboundEmailEvent('warn', 'inbound email signature rejected', {
      outcome: 'rejected',
      errorCode: missing ? 'SIGNATURE_MISSING' : 'SIGNATURE_MISMATCH',
    });
    return NextResponse.json(
      { error: missing ? 'missing signature' : 'invalid signature' },
      { status: 401 },
    );
  }

  // Only AFTER the signature check: the HMAC is computed over the bytes as
  // sent, so scrubbing before verification would reject every honest caller.
  //
  // Two passes, because a NUL reaches us two different ways. A raw 0x00 byte
  // in the body is caught here; a `\u0000` ESCAPE is six ordinary characters
  // that this replace cannot see, and only becomes a NUL once JSON.parse
  // decodes it — which is what the reviver below is for.
  const safeBody = rawBody.replace(NUL_RE, '');

  let payload: unknown;
  try {
    payload = JSON.parse(safeBody, (_key, value) =>
      typeof value === 'string' ? value.replace(NUL_RE, '') : value,
    );
  } catch {
    // Signature-valid but not JSON means the provider changed something. Keep
    // the bytes rather than dropping them, and 200 so it is not retried into
    // the same failure.
    await quarantineInboundPayload(safeBody, 'body was not valid JSON');
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
    // THE DEFERRAL INVARIANT. Do not turn this into a 200, and do not turn it
    // back into a 500. Nothing was written (the whole persist runs in one
    // transaction), so a 429 makes Forward Email temp-fail the SMTP session
    // and the sender's own server holds and retries for 24-72 hours. A 500
    // here is returned verbatim as a PERMANENT failure and the message bounces
    // on the spot; a 200 loses it silently while telling the sender it
    // arrived. Both destroy mail. Only the 4xx defers.
    // Same reasoning as the wrapper above, and it applies harder here: this is
    // the ordinary database-unreachable path, the one the deferral window
    // exists for. It has never reported to Sentry — it was always caught — so
    // this is a pre-existing gap rather than a regression, but leaving it open
    // means the window nobody knows about expires unused.
    Sentry.captureException(error, { tags: { component: 'inbound-email-webhook' } });
    logInboundEmailEvent('error', 'failed to store inbound email', {
      outcome: 'failure',
      errorCode: 'PERSIST_FAILED',
      mailbox: email.mailbox,
    });
    console.error('[inbound-email-webhook] persist error', error);
    return NextResponse.json({ error: 'failed to store message' }, { status: 429 });
  }
};
