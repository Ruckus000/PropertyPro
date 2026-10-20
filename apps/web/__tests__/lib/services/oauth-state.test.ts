/**
 * HMAC signing for OAuth `state` parameters (lib/services/oauth-state.ts).
 *
 * Stripe Connect onboarding signs its state with these helpers, so a forged or
 * tampered state must never verify.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';

const TEST_SECRET = 'test-oauth-state-secret-for-unit-tests-32bytes!';

// Set env before importing modules that read it at load time
beforeAll(() => {
  process.env.OAUTH_STATE_SECRET = TEST_SECRET;
});

afterAll(() => {
  delete process.env.OAUTH_STATE_SECRET;
});

describe('OAuth state HMAC signing', () => {
  it('signPayload produces a consistent HMAC for the same input', async () => {
    const { signPayload } = await import('@/lib/services/oauth-state');
    const payload = '{"communityId":1,"userId":"user-1","ts":1700000000000}';
    const sig1 = signPayload(payload);
    const sig2 = signPayload(payload);
    expect(sig1).toBe(sig2);
    expect(sig1.length).toBeGreaterThan(0);
  });

  it('signPayload produces different signatures for different inputs', async () => {
    const { signPayload } = await import('@/lib/services/oauth-state');
    const sig1 = signPayload('payload-a');
    const sig2 = signPayload('payload-b');
    expect(sig1).not.toBe(sig2);
  });

  it('verifySignature returns true for valid signature', async () => {
    const { signPayload, verifySignature } = await import('@/lib/services/oauth-state');
    const payload = 'test-payload';
    const sig = signPayload(payload);
    expect(verifySignature(payload, sig)).toBe(true);
  });

  it('verifySignature returns false for tampered payload', async () => {
    const { signPayload, verifySignature } = await import('@/lib/services/oauth-state');
    const sig = signPayload('original');
    expect(verifySignature('tampered', sig)).toBe(false);
  });

  it('verifySignature returns false for forged signature', async () => {
    const { verifySignature } = await import('@/lib/services/oauth-state');
    // A base64url string of the same length as a real HMAC-SHA256 but wrong
    const fakeSignature = 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA_';
    expect(verifySignature('some-payload', fakeSignature)).toBe(false);
  });
});
