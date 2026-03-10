/**
 * Tests HMAC-signed OAuth state parameter for calendar and accounting flows.
 *
 * Verifies that:
 * - State is signed and can be validated end-to-end
 * - Tampered state is rejected with "signature invalid"
 * - Expired state is rejected
 * - Mismatched communityId/userId is rejected
 * - Missing or malformed state is rejected
 */
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';

const TEST_SECRET = 'test-oauth-state-secret-for-unit-tests-32bytes!';

// Mock the DB module to avoid DATABASE_URL requirement in unit tests
vi.mock('@propertypro/db', () => ({
  calendarSyncTokens: {},
  createScopedClient: vi.fn(),
  decryptToken: vi.fn(),
  encryptToken: vi.fn(),
  logAuditEvent: vi.fn(),
  meetings: {},
}));
vi.mock('@propertypro/db/filters', () => ({
  and: vi.fn(),
  asc: vi.fn(),
  eq: vi.fn(),
}));
vi.mock('@/lib/calendar/google-calendar-adapter', () => ({
  deterministicGoogleCalendarAdapter: {},
}));
vi.mock('@/lib/calendar/ics', () => ({
  buildMeetingsIcs: vi.fn(),
}));
vi.mock('@/lib/accounting/adapters', () => ({
  getAccountingAdapter: vi.fn(),
}));

// Set env before importing modules that read it at load time
beforeAll(() => {
  process.env.OAUTH_STATE_SECRET = TEST_SECRET;
});

afterAll(() => {
  delete process.env.OAUTH_STATE_SECRET;
});

describe('OAuth state HMAC signing (calendar)', () => {
  it('signPayload produces a consistent HMAC for the same input', async () => {
    const { signPayload } = await import('@/lib/services/calendar-sync-service');
    const payload = '{"communityId":1,"userId":"user-1","ts":1700000000000}';
    const sig1 = signPayload(payload);
    const sig2 = signPayload(payload);
    expect(sig1).toBe(sig2);
    expect(sig1.length).toBeGreaterThan(0);
  });

  it('signPayload produces different signatures for different inputs', async () => {
    const { signPayload } = await import('@/lib/services/calendar-sync-service');
    const sig1 = signPayload('payload-a');
    const sig2 = signPayload('payload-b');
    expect(sig1).not.toBe(sig2);
  });

  it('verifySignature returns true for valid signature', async () => {
    const { signPayload, verifySignature } = await import('@/lib/services/calendar-sync-service');
    const payload = 'test-payload';
    const sig = signPayload(payload);
    expect(verifySignature(payload, sig)).toBe(true);
  });

  it('verifySignature returns false for tampered payload', async () => {
    const { signPayload, verifySignature } = await import('@/lib/services/calendar-sync-service');
    const sig = signPayload('original');
    expect(verifySignature('tampered', sig)).toBe(false);
  });

  it('verifySignature returns false for forged signature', async () => {
    const { verifySignature } = await import('@/lib/services/calendar-sync-service');
    // A base64url string of the same length as a real HMAC-SHA256 but wrong
    const fakeSignature = 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA_';
    expect(verifySignature('some-payload', fakeSignature)).toBe(false);
  });
});

describe('validateOAuthState (calendar)', () => {
  it('accepts a valid HMAC-signed state with matching communityId and userId', async () => {
    const { signPayload, validateOAuthState } = await import('@/lib/services/calendar-sync-service');

    const communityId = 42;
    const userId = 'user-abc';
    const payload = JSON.stringify({ communityId, userId, ts: Date.now() });
    const sig = signPayload(payload);
    const stateParam = Buffer.from(JSON.stringify({ p: payload, s: sig })).toString('base64url');

    // Should not throw
    expect(() => validateOAuthState(stateParam, communityId, userId)).not.toThrow();
  });

  it('rejects null state parameter', async () => {
    const { validateOAuthState } = await import('@/lib/services/calendar-sync-service');
    expect(() => validateOAuthState(null, 1, 'user-1')).toThrow('Missing OAuth state parameter');
  });

  it('rejects non-base64 garbage state', async () => {
    const { validateOAuthState } = await import('@/lib/services/calendar-sync-service');
    expect(() => validateOAuthState('not-valid-base64!!!', 1, 'user-1')).toThrow('Invalid OAuth state');
  });

  it('rejects tampered state with "signature invalid"', async () => {
    const { signPayload, validateOAuthState } = await import('@/lib/services/calendar-sync-service');

    const payload = JSON.stringify({ communityId: 1, userId: 'user-1', ts: Date.now() });
    const sig = signPayload(payload);

    // Tamper with the payload inside the envelope
    const tamperedPayload = JSON.stringify({ communityId: 999, userId: 'attacker', ts: Date.now() });
    const tamperedState = Buffer.from(JSON.stringify({ p: tamperedPayload, s: sig })).toString('base64url');

    expect(() => validateOAuthState(tamperedState, 999, 'attacker')).toThrow('signature invalid');
  });

  it('rejects state with mismatched communityId', async () => {
    const { signPayload, validateOAuthState } = await import('@/lib/services/calendar-sync-service');

    const payload = JSON.stringify({ communityId: 1, userId: 'user-1', ts: Date.now() });
    const sig = signPayload(payload);
    const stateParam = Buffer.from(JSON.stringify({ p: payload, s: sig })).toString('base64url');

    // Pass different communityId than what's in the state
    expect(() => validateOAuthState(stateParam, 999, 'user-1')).toThrow('state mismatch');
  });

  it('rejects state with mismatched userId', async () => {
    const { signPayload, validateOAuthState } = await import('@/lib/services/calendar-sync-service');

    const payload = JSON.stringify({ communityId: 1, userId: 'user-1', ts: Date.now() });
    const sig = signPayload(payload);
    const stateParam = Buffer.from(JSON.stringify({ p: payload, s: sig })).toString('base64url');

    expect(() => validateOAuthState(stateParam, 1, 'different-user')).toThrow('state mismatch');
  });

  it('rejects expired state (>10 minutes old)', async () => {
    const { signPayload, validateOAuthState } = await import('@/lib/services/calendar-sync-service');

    const elevenMinutesAgo = Date.now() - 11 * 60 * 1000;
    const payload = JSON.stringify({ communityId: 1, userId: 'user-1', ts: elevenMinutesAgo });
    const sig = signPayload(payload);
    const stateParam = Buffer.from(JSON.stringify({ p: payload, s: sig })).toString('base64url');

    expect(() => validateOAuthState(stateParam, 1, 'user-1')).toThrow('state expired');
  });

  it('accepts state just under 10 minutes old', async () => {
    const { signPayload, validateOAuthState } = await import('@/lib/services/calendar-sync-service');

    const nineMinutesAgo = Date.now() - 9 * 60 * 1000;
    const payload = JSON.stringify({ communityId: 1, userId: 'user-1', ts: nineMinutesAgo });
    const sig = signPayload(payload);
    const stateParam = Buffer.from(JSON.stringify({ p: payload, s: sig })).toString('base64url');

    expect(() => validateOAuthState(stateParam, 1, 'user-1')).not.toThrow();
  });
});

describe('validateAccountingOAuthState', () => {
  it('accepts valid signed state with matching provider', async () => {
    const { signPayload } = await import('@/lib/services/calendar-sync-service');
    const { validateAccountingOAuthState } = await import('@/lib/services/accounting-connectors-service');

    const communityId = 10;
    const userId = 'user-qb';
    const provider = 'quickbooks';
    const payload = JSON.stringify({ communityId, userId, provider, ts: Date.now() });
    const sig = signPayload(payload);
    const stateParam = Buffer.from(JSON.stringify({ p: payload, s: sig })).toString('base64url');

    expect(() => validateAccountingOAuthState(stateParam, communityId, userId, provider)).not.toThrow();
  });

  it('rejects tampered accounting state with "signature invalid"', async () => {
    const { signPayload } = await import('@/lib/services/calendar-sync-service');
    const { validateAccountingOAuthState } = await import('@/lib/services/accounting-connectors-service');

    const payload = JSON.stringify({ communityId: 1, userId: 'u', provider: 'quickbooks', ts: Date.now() });
    const sig = signPayload(payload);

    const tampered = JSON.stringify({ communityId: 1, userId: 'u', provider: 'xero', ts: Date.now() });
    const tamperedState = Buffer.from(JSON.stringify({ p: tampered, s: sig })).toString('base64url');

    expect(() => validateAccountingOAuthState(tamperedState, 1, 'u', 'xero')).toThrow('signature invalid');
  });

  it('rejects mismatched provider even with valid signature', async () => {
    const { signPayload } = await import('@/lib/services/calendar-sync-service');
    const { validateAccountingOAuthState } = await import('@/lib/services/accounting-connectors-service');

    const payload = JSON.stringify({ communityId: 1, userId: 'u', provider: 'quickbooks', ts: Date.now() });
    const sig = signPayload(payload);
    const stateParam = Buffer.from(JSON.stringify({ p: payload, s: sig })).toString('base64url');

    // State was signed for quickbooks but callback claims xero
    expect(() => validateAccountingOAuthState(stateParam, 1, 'u', 'xero')).toThrow('provider mismatch');
  });
});
