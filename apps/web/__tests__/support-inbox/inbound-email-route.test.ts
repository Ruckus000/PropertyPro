import { createHmac } from 'node:crypto';
import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { INBOUND_EMAIL_SIGNATURE_HEADER } from '@/lib/services/support-inbox/signature';

import forwardEmailFixture from './fixtures/forward-email-webhook.json';

const { persistInboundEmail, quarantineInboundPayload } = vi.hoisted(() => ({
  persistInboundEmail: vi.fn(),
  quarantineInboundPayload: vi.fn(),
}));

vi.mock('@/lib/services/support-inbox/inbound-email-service', () => ({
  persistInboundEmail,
  quarantineInboundPayload,
}));

const { POST } = await import('@/app/api/v1/webhooks/inbound-email/route');

const SECRET = 'x'.repeat(48);

function request(body: string, signature?: string | null): NextRequest {
  const headers = new Headers({ 'content-type': 'application/json' });
  const sig =
    signature === undefined
      ? createHmac('sha256', SECRET).update(body).digest('hex')
      : signature;
  if (sig !== null) headers.set(INBOUND_EMAIL_SIGNATURE_HEADER, sig);

  return new NextRequest('https://www.getpropertypro.com/api/v1/webhooks/inbound-email', {
    method: 'POST',
    headers,
    body,
  });
}

const VALID_BODY = JSON.stringify(forwardEmailFixture);

describe('POST /api/v1/webhooks/inbound-email', () => {
  const original = process.env.INBOUND_EMAIL_WEBHOOK_SECRET;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'info').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    process.env.INBOUND_EMAIL_WEBHOOK_SECRET = SECRET;
    persistInboundEmail.mockResolvedValue({ threadId: 7, messageId: 11, duplicate: false });
    quarantineInboundPayload.mockResolvedValue({ threadId: 9, messageId: 12 });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    if (original === undefined) delete process.env.INBOUND_EMAIL_WEBHOOK_SECRET;
    else process.env.INBOUND_EMAIL_WEBHOOK_SECRET = original;
  });

  it('stores a correctly signed message and returns 200', async () => {
    const response = await POST(request(VALID_BODY));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ received: true, duplicate: false });
    expect(persistInboundEmail).toHaveBeenCalledTimes(1);
    expect(persistInboundEmail.mock.calls[0]?.[0]).toMatchObject({
      mailbox: 'support',
      from: { email: 'jane@example.com' },
      rfcMessageId: 'reply-2@mail.example.com',
    });
  });

  it('reports a redelivery as a duplicate without erroring', async () => {
    persistInboundEmail.mockResolvedValue({ threadId: 7, messageId: 11, duplicate: true });

    const response = await POST(request(VALID_BODY));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ received: true, duplicate: true });
  });

  describe('signature', () => {
    it('rejects a tampered body with 401 and never persists', async () => {
      const signature = createHmac('sha256', SECRET).update(VALID_BODY).digest('hex');
      const tampered = VALID_BODY.replace('jane@example.com', 'mallory@example.com');

      const response = await POST(request(tampered, signature));

      expect(response.status).toBe(401);
      expect(persistInboundEmail).not.toHaveBeenCalled();
      expect(quarantineInboundPayload).not.toHaveBeenCalled();
    });

    it('rejects a missing signature with 401', async () => {
      const response = await POST(request(VALID_BODY, null));
      expect(response.status).toBe(401);
      expect(persistInboundEmail).not.toHaveBeenCalled();
    });

    it('returns 500 — not 401 — when OUR secret is unset, and persists nothing', async () => {
      // Our misconfiguration, not the caller's. 500 is loud and retryable; a
      // 401 would look like the provider's fault and hide the real cause.
      delete process.env.INBOUND_EMAIL_WEBHOOK_SECRET;

      const response = await POST(request(VALID_BODY));

      expect(response.status).toBe(500);
      expect(persistInboundEmail).not.toHaveBeenCalled();
    });
  });

  describe('quarantine', () => {
    it('quarantines an unreadable payload and returns 200', async () => {
      // A retry would fail identically, so holding the message at the sender
      // buys nothing here — keep the bytes and stop the retry loop.
      const body = JSON.stringify({ recipients: ['support@getpropertypro.com'] });

      const response = await POST(request(body));

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual({ received: true, quarantined: true });
      expect(quarantineInboundPayload).toHaveBeenCalledTimes(1);
      expect(persistInboundEmail).not.toHaveBeenCalled();
    });

    it('quarantines a signature-valid body that is not JSON', async () => {
      const response = await POST(request('not json at all'));

      expect(response.status).toBe(200);
      expect(quarantineInboundPayload).toHaveBeenCalledTimes(1);
    });
  });

  describe('the 5xx durability invariant', () => {
    it('returns 5xx — NOT 200 — when the write fails', async () => {
      // This is the single most important assertion in the feature. A 200 over
      // a failed write loses the message silently while telling the sender it
      // arrived. The 5xx makes Forward Email temp-fail the SMTP session, so the
      // SENDER's mail server holds it and retries for 24-72 hours.
      persistInboundEmail.mockRejectedValue(new Error('connection terminated'));

      const response = await POST(request(VALID_BODY));

      expect(response.status).toBeGreaterThanOrEqual(500);
      const body = await response.json();
      expect(body).not.toHaveProperty('received');
    });

    it('does not leak the underlying error into the response body', async () => {
      persistInboundEmail.mockRejectedValue(
        new Error('password authentication failed for user "postgres"'),
      );

      const response = await POST(request(VALID_BODY));
      const body = JSON.stringify(await response.json());

      expect(body).not.toContain('password');
      expect(body).not.toContain('postgres');
    });
  });
});
