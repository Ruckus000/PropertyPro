import { createHmac } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  INBOUND_EMAIL_SIGNATURE_HEADER,
  verifyForwardEmailWebhookToken,
} from '@/lib/services/support-inbox/signature';
import { InboundEmailSignatureError } from '@/lib/services/support-inbox/types';

/**
 * This HMAC is not defence in depth — it is the ENTIRE access control on the
 * inbound webhook. Forward Email routes an alias to a URL through a
 * world-readable DNS TXT record, so the endpoint address is public by
 * construction and there is no secret path or basic-auth available on the free
 * plan.
 */
const SECRET = 'x'.repeat(48);
const BODY = '{"from":{"value":[{"address":"jane@example.com"}]}}';

function sign(body: string, secret = SECRET): string {
  return createHmac('sha256', secret).update(body).digest('hex');
}

function headers(signature: string | null): Headers {
  const h = new Headers();
  if (signature !== null) h.set(INBOUND_EMAIL_SIGNATURE_HEADER, signature);
  return h;
}

describe('verifyForwardEmailWebhookToken', () => {
  const original = process.env.INBOUND_EMAIL_WEBHOOK_SECRET;

  beforeEach(() => {
    process.env.INBOUND_EMAIL_WEBHOOK_SECRET = SECRET;
  });

  afterEach(() => {
    if (original === undefined) delete process.env.INBOUND_EMAIL_WEBHOOK_SECRET;
    else process.env.INBOUND_EMAIL_WEBHOOK_SECRET = original;
  });

  it('accepts a correctly signed body', () => {
    expect(() => verifyForwardEmailWebhookToken(BODY, headers(sign(BODY)))).not.toThrow();
  });

  it('rejects a body with one byte changed', () => {
    const tampered = BODY.replace('jane', 'mallory');
    expect(() => verifyForwardEmailWebhookToken(tampered, headers(sign(BODY)))).toThrow(
      InboundEmailSignatureError,
    );
  });

  it('rejects a signature made with a different secret', () => {
    expect(() =>
      verifyForwardEmailWebhookToken(BODY, headers(sign(BODY, 'y'.repeat(48)))),
    ).toThrow(InboundEmailSignatureError);
  });

  it('rejects a missing signature header', () => {
    expect(() => verifyForwardEmailWebhookToken(BODY, headers(null))).toThrow(
      /no signature header/,
    );
  });

  it('rejects a signature of the wrong length without throwing a TypeError', () => {
    // timingSafeEqual THROWS on unequal-length buffers rather than returning
    // false. Without the length pre-check that surfaces as a 500 instead of a
    // 401, which also tells an attacker their guess was the wrong shape.
    let thrown: unknown;
    try {
      verifyForwardEmailWebhookToken(BODY, headers('abc'));
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(InboundEmailSignatureError);
    expect(thrown).not.toBeInstanceOf(TypeError);
  });

  it('fails CLOSED when the secret is unset', () => {
    // The opposite posture to community-email-unsubscribe-token.ts, which
    // returns null so a config gap cannot take down every association's bulk
    // mail. Here an unauthenticated write path would let anyone insert threads
    // into the operator console, and failing closed is cheap: Forward Email
    // temp-fails the SMTP session, so the sender's server holds and retries.
    delete process.env.INBOUND_EMAIL_WEBHOOK_SECRET;
    // Assert `kind`, not the message text: `kind` is what the route branches on
    // to choose 500-over-401, so a message reword must not be able to redden
    // this while a changed discriminator slips through.
    expect(() => verifyForwardEmailWebhookToken(BODY, headers(sign(BODY)))).toThrow(
      expect.objectContaining({ kind: 'unconfigured' }),
    );
  });

  it('fails CLOSED when the secret is too short to be meaningful', () => {
    process.env.INBOUND_EMAIL_WEBHOOK_SECRET = 'short';
    expect(() => verifyForwardEmailWebhookToken(BODY, headers(sign(BODY, 'short')))).toThrow(
      expect.objectContaining({ kind: 'unconfigured' }),
    );
  });

  it('marks a bad signature as `rejected`, not `unconfigured`', () => {
    // The route maps unconfigured -> 500 (our fault, loud) and rejected -> 401.
    // Collapsing the two would hide a missing secret behind a caller error.
    expect(() => verifyForwardEmailWebhookToken(BODY, headers('deadbeef'))).toThrow(
      expect.objectContaining({ kind: 'rejected' }),
    );
  });

  it('never echoes the secret into the error message', () => {
    delete process.env.INBOUND_EMAIL_WEBHOOK_SECRET;
    try {
      verifyForwardEmailWebhookToken(BODY, headers(sign(BODY)));
    } catch (error) {
      expect((error as Error).message).not.toContain(SECRET);
    }
  });
});
