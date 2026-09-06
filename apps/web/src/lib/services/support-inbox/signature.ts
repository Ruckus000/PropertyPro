import { createHmac, timingSafeEqual } from 'node:crypto';

import { InboundEmailSignatureError } from './types';

/**
 * Verify Forward Email's webhook signature.
 *
 * ── Why this is the only authentication ──
 *
 * Forward Email routes an alias to a webhook through a DNS TXT record
 * (`forward-email=support:https://…`). That record is world-readable — anyone
 * can `dig getpropertypro.com TXT` and read the endpoint URL. The free plan
 * offers no secret path segment and no basic-auth. So this HMAC is not defence
 * in depth; it is the entire access control on a route that writes to the
 * operator console.
 *
 * That is why `getSecret()` THROWS rather than returning null. The repo has
 * both postures deliberately: `community-email-unsubscribe-token.ts` fails
 * OPEN because a missing secret must not take down every association's bulk
 * mail, while `apps/admin/src/lib/support/jwt.ts` fails CLOSED because it gates
 * privileged access. This is the second kind. Failing closed is also cheap
 * here: a rejected delivery makes Forward Email temp-fail the SMTP session, so
 * the sender's own mail server holds the message and retries for 24-72 hours.
 *
 * ── Scheme (read from their source, helpers/on-data-mx.js) ──
 *
 *   X-Webhook-Signature: createHmac('sha256', webhookKey).update(rawBody).digest('hex')
 *
 * The body must be the exact bytes received. Re-serializing parsed JSON changes
 * key order and whitespace and will never match.
 *
 * NOTE: the function name is load-bearing. `scripts/verify-token-auth-routes.ts`
 * identifies token-authenticated routes by matching /\bverify[A-Za-z0-9_]*Token\s*\(/
 * on the handler, so naming it `verify…Token` keeps this route permanently
 * under `pnpm guard:token-auth-routes` — meaning a missing or wrong-verb
 * TOKEN_AUTH_ROUTES entry fails CI instead of being caught by whoever
 * remembers. Stripe's `constructEvent` and Twilio's
 * `validateSmsWebhookSignature` do not match that pattern, and their entries
 * survive on human memory alone. Do not rename this without reading that guard.
 */
export const INBOUND_EMAIL_SIGNATURE_HEADER = 'x-webhook-signature';

/** Minimum viable shared secret. Matches the readiness probe's floor. */
const MIN_SECRET_LENGTH = 32;

function getSecret(): string {
  const secret = process.env.INBOUND_EMAIL_WEBHOOK_SECRET;
  if (!secret || secret.length < MIN_SECRET_LENGTH) {
    // Deliberately does NOT echo the value or its length into the message.
    throw new InboundEmailSignatureError(
      'unconfigured',
      'INBOUND_EMAIL_WEBHOOK_SECRET is unset or shorter than the minimum',
    );
  }
  return secret;
}

/**
 * Throws `InboundEmailSignatureError` unless `rawBody` carries a valid
 * signature. Returns nothing on success — there is no payload to hand back.
 */
export function verifyForwardEmailWebhookToken(rawBody: string, headers: Headers): void {
  const secret = getSecret();

  const provided = headers.get(INBOUND_EMAIL_SIGNATURE_HEADER);
  if (!provided) {
    throw new InboundEmailSignatureError('rejected', 'no signature header');
  }

  const expected = createHmac('sha256', secret).update(rawBody).digest('hex');

  // Length must match BEFORE timingSafeEqual: it throws on unequal-length
  // buffers rather than returning false, which would surface as a 500 instead
  // of a 401 and tell an attacker their guess was the wrong shape.
  if (expected.length !== provided.length) {
    throw new InboundEmailSignatureError('rejected', 'signature mismatch');
  }
  if (!timingSafeEqual(Buffer.from(expected), Buffer.from(provided))) {
    throw new InboundEmailSignatureError('rejected', 'signature mismatch');
  }
}
