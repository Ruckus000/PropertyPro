/**
 * Unit tests for email-first signup (`lib/auth/signup-email-first.ts`).
 *
 * The properties worth pinning:
 * - step 1 answers identically for every address (no account enumeration) and
 *   caps link emails per address;
 * - step 3 takes the email from the SESSION, never the body, and refuses an
 *   unconfirmed session;
 * - step 3 never touches a paid signup, never reuses an expired row's id, and
 *   closes an open Checkout session before changing the answers it was priced on.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ForbiddenError,
  SignupEmailDeliveryError,
  ValidationError,
} from '../../src/lib/api/errors';

const h = vi.hoisted(() => ({
  createUnscopedClientMock: vi.fn(),
  sendEmailMock: vi.fn(),
  generateLinkMock: vi.fn(),
  updateUserByIdMock: vi.fn(),
  enforceMinMock: vi.fn(),
  checkSubdomainMock: vi.fn(),
  closeCheckoutSessionMock: vi.fn(),
  pendingSignupsTable: {
    signupRequestId: 'pending_signups.signup_request_id',
    status: 'pending_signups.status',
    expiresAt: 'pending_signups.expires_at',
    payload: 'pending_signups.payload',
    emailNormalized: 'pending_signups.email_normalized',
    candidateSlug: 'pending_signups.candidate_slug',
  },
}));

vi.mock('@propertypro/db/unsafe', () => ({ createUnscopedClient: h.createUnscopedClientMock }));
vi.mock('@propertypro/db', () => ({ pendingSignups: h.pendingSignupsTable }));
vi.mock('@propertypro/db/filters', () => ({
  eq: (col: unknown, value: unknown) => ({ _type: 'eq', col, value }),
  notInArray: (col: unknown, values: unknown) => ({ _type: 'notInArray', col, values }),
}));
vi.mock('@propertypro/db/supabase/admin', () => ({
  createAdminClient: () => ({ auth: { admin: { generateLink: h.generateLinkMock, updateUserById: h.updateUserByIdMock } } }),
}));
vi.mock('../../src/lib/services/stripe-service', () => ({
  closeCheckoutSession: h.closeCheckoutSessionMock,
}));
// Redis unconfigured: the in-memory limiter is the one exercised.
vi.mock('../../src/lib/middleware/distributed-rate-limiter', () => ({
  checkDistributedRateLimit: vi.fn().mockResolvedValue(null),
}));
vi.mock('../../src/lib/auth/signup', async (importOriginal) => {
  const real = await importOriginal<typeof import('../../src/lib/auth/signup')>();
  return {
    POST_PAYMENT_SIGNUP_STATUSES: real.POST_PAYMENT_SIGNUP_STATUSES,
    buildPendingSignupPayload: real.buildPendingSignupPayload,
    checkSignupSubdomainAvailability: h.checkSubdomainMock,
    enforceMinSignupResponseTime: h.enforceMinMock,
    sendSignupVerificationEmail: h.sendEmailMock,
  };
});

import { resetGlobalRateLimiter } from '../../src/lib/middleware/rate-limiter';
import {
  START_SIGNUP_MESSAGE,
  _testInternals,
  startEmailFirstSignup,
  submitSignupDetails,
} from '../../src/lib/auth/signup-email-first';

interface ExistingRow {
  signupRequestId: string;
  status: string;
  expiresAt: Date | null;
  payload: Record<string, unknown>;
}

function mockDb(existing: ExistingRow | null, returned?: Array<Record<string, string>>) {
  const values = vi.fn();
  const onConflictDoUpdate = vi.fn();
  const db = {
    select: () => ({
      from: () => ({
        where: () => ({ limit: async () => (existing ? [existing] : []) }),
      }),
    }),
    insert: () => ({
      values: (v: Record<string, unknown>) => {
        values(v);
        return {
          onConflictDoUpdate: (config: Record<string, unknown>) => {
            onConflictDoUpdate(config);
            return {
              returning: async () =>
                returned ?? [{ signupRequestId: String(v.signupRequestId), candidateSlug: String(v.candidateSlug) }],
            };
          },
        };
      },
    }),
  };
  h.createUnscopedClientMock.mockReturnValue(db);
  return { values, onConflictDoUpdate };
}

const CONFIRMED_USER = {
  id: '00000000-0000-4000-8000-000000000001',
  email: 'Founder@Example.com',
  email_confirmed_at: '2026-10-06T12:00:00Z',
};

const DETAILS = {
  primaryContactName: 'Ana Reyes',
  communityName: 'Bayview Towers',
  addressLine1: '1200 Brickell Bay Dr',
  city: 'Miami',
  state: 'FL',
  zipCode: '33131',
  county: 'Miami-Dade',
  unitCount: 48,
  communityType: 'condo_718',
  planKey: 'essentials',
  candidateSlug: 'bayview-towers',
  termsAccepted: true,
};

beforeEach(() => {
  vi.clearAllMocks();
  resetGlobalRateLimiter();
  h.sendEmailMock.mockResolvedValue('email_1');
  h.enforceMinMock.mockResolvedValue(undefined);
  h.updateUserByIdMock.mockResolvedValue({ data: {}, error: null });
  h.generateLinkMock.mockResolvedValue({
    data: { user: { id: 'auth-1', email_confirmed_at: '2026-01-01T00:00:00Z' }, properties: { hashed_token: 'hashed-1', verification_type: 'signup' } },
    error: null,
  });
  h.checkSubdomainMock.mockResolvedValue({
    normalizedSubdomain: 'bayview-towers',
    available: true,
    reason: 'available',
    message: 'Subdomain is available.',
  });
  h.closeCheckoutSessionMock.mockResolvedValue('closed');
});

const BINDING = 'a'.repeat(64);

describe('startEmailFirstSignup', () => {
  const IP = '203.0.113.7';

  it('requires a well-formed browser binding', async () => {
    await expect(startEmailFirstSignup({ email: 'a@example.com' }, IP)).rejects.toBeInstanceOf(ValidationError);
    await expect(startEmailFirstSignup({ email: 'a@example.com', binding: 'not-hex' }, IP)).rejects.toBeInstanceOf(ValidationError);
    expect(h.generateLinkMock).not.toHaveBeenCalled();
  });

  it('binds the emailed link to the requesting browser', async () => {
    await startEmailFirstSignup({ email: 'a@example.com', binding: BINDING }, IP);
    expect(new URL(h.sendEmailMock.mock.calls[0]?.[3] as string).searchParams.get('b')).toBe(BINDING);
  });

  it('rejects a malformed email without creating anything', async () => {
    await expect(startEmailFirstSignup({ email: 'not-an-email', binding: BINDING }, IP)).rejects.toBeInstanceOf(ValidationError);
    expect(h.generateLinkMock).not.toHaveBeenCalled();
    expect(h.sendEmailMock).not.toHaveBeenCalled();
  });

  it('makes ONE magiclink call, sets no password or metadata, and emails the link to that address', async () => {
    const result = await startEmailFirstSignup({ email: '  Founder@Example.com ', binding: BINDING }, IP);

    expect(result).toEqual({ message: START_SIGNUP_MESSAGE });
    expect(h.generateLinkMock).toHaveBeenCalledTimes(1);
    const call = h.generateLinkMock.mock.calls[0]?.[0] as Record<string, unknown> & { options: Record<string, unknown> };
    expect(call.type).toBe('magiclink');
    expect(call.email).toBe('founder@example.com');
    expect(call).not.toHaveProperty('password');
    expect(call.options).not.toHaveProperty('data');
    const redirect = new URL(String(call.options.redirectTo));
    expect(redirect.pathname).toBe('/signup');
    expect(redirect.searchParams.get('verified')).toBe('1');

    const [name, community, to, link] = h.sendEmailMock.mock.calls[0] as [unknown, unknown, string, string];
    expect([name, community, to]).toEqual([undefined, undefined, 'founder@example.com']);
    const url = new URL(link);
    expect(url.pathname).toBe('/auth/verify-signup');
    expect(url.searchParams.get('token_hash')).toBe('hashed-1');
    expect(url.searchParams.get('signupRequestId')).toBeNull();
  });

  it('links with the type GoTrue reports, since the token is bound to it', async () => {
    // GoTrue turns a magiclink for an unknown address into a signup.
    await startEmailFirstSignup({ email: 'new@example.com', binding: BINDING }, IP);
    expect(new URL(h.sendEmailMock.mock.calls[0]?.[3] as string).searchParams.get('type')).toBe('signup');

    h.generateLinkMock.mockResolvedValueOnce({
      data: { user: { id: 'auth-2' }, properties: { hashed_token: 'h2', verification_type: 'magiclink' } },
      error: null,
    });
    await startEmailFirstSignup({ email: 'existing@example.com', binding: BINDING }, IP);
    expect(new URL(h.sendEmailMock.mock.calls[1]?.[3] as string).searchParams.get('type')).toBe('magiclink');
  });

  it('caps sends per address+IP, but another caller of the same address is not silenced', async () => {
    const cap = _testInternals.START_EMAILS_PER_CALLER;
    for (let i = 0; i < cap; i += 1) {
      await startEmailFirstSignup({ email: 'cap@example.com', binding: BINDING }, IP);
    }
    const throttled = await startEmailFirstSignup({ email: 'CAP@example.com', binding: BINDING }, IP);

    expect(throttled).toEqual({ message: START_SIGNUP_MESSAGE });
    expect(h.sendEmailMock).toHaveBeenCalledTimes(cap);

    await startEmailFirstSignup({ email: 'cap@example.com', binding: BINDING }, '198.51.100.9');
    expect(h.sendEmailMock).toHaveBeenCalledTimes(cap + 1);
  });

  it('bounds the total sent to one address across callers', async () => {
    const ceiling = _testInternals.START_EMAILS_PER_ADDRESS;
    for (let i = 0; i < ceiling + 2; i += 1) {
      await startEmailFirstSignup({ email: 'inbox@example.com', binding: BINDING }, `198.51.100.${i}`);
    }
    expect(h.sendEmailMock).toHaveBeenCalledTimes(ceiling);
  });

  it('replaces a password planted on an unconfirmed account before sending the link', async () => {
    // The form flow lets anyone create an unconfirmed user with a password of
    // their choosing; confirming it through this link must not keep that password.
    h.generateLinkMock.mockResolvedValueOnce({
      data: { user: { id: 'auth-u', email_confirmed_at: null }, properties: { hashed_token: 'hu', verification_type: 'magiclink' } },
      error: null,
    });
    await startEmailFirstSignup({ email: 'victim@example.com', binding: BINDING }, IP);
    expect(h.updateUserByIdMock).toHaveBeenCalledWith('auth-u', { password: expect.any(String) });
    expect(h.sendEmailMock).toHaveBeenCalledTimes(1);
  });

  it('leaves a confirmed account\'s password alone', async () => {
    await startEmailFirstSignup({ email: 'owner@example.com', binding: BINDING }, IP);
    expect(h.updateUserByIdMock).not.toHaveBeenCalled();
  });

  it('sends nothing when the rotation fails', async () => {
    h.generateLinkMock.mockResolvedValueOnce({
      data: { user: { id: 'auth-u', email_confirmed_at: null }, properties: { hashed_token: 'hu', verification_type: 'magiclink' } },
      error: null,
    });
    h.updateUserByIdMock.mockResolvedValueOnce({ data: null, error: { message: 'boom' } });
    await expect(startEmailFirstSignup({ email: 'victim@example.com', binding: BINDING }, IP)).resolves.toEqual({ message: START_SIGNUP_MESSAGE });
    expect(h.sendEmailMock).not.toHaveBeenCalled();
  });

  it('answers a GoTrue refusal generically, without sending', async () => {
    h.generateLinkMock.mockResolvedValueOnce({ data: null, error: { message: 'User is banned' } });
    await expect(startEmailFirstSignup({ email: 'banned@example.com', binding: BINDING }, IP)).resolves.toEqual({
      message: START_SIGNUP_MESSAGE,
    });
    expect(h.sendEmailMock).not.toHaveBeenCalled();
  });

  it('reports a delivery failure, still padded to the response floor', async () => {
    h.sendEmailMock.mockRejectedValueOnce(new Error('resend down'));
    await expect(startEmailFirstSignup({ email: 'a@example.com', binding: BINDING }, IP)).rejects.toBeInstanceOf(SignupEmailDeliveryError);
    expect(h.enforceMinMock).toHaveBeenCalledWith(expect.any(Number), _testInternals.MIN_START_RESPONSE_MS);
  });
});

describe('submitSignupDetails', () => {
  it('refuses a session whose email is not confirmed', async () => {
    mockDb(null);
    await expect(
      submitSignupDetails({ ...CONFIRMED_USER, email_confirmed_at: null }, DETAILS),
    ).rejects.toBeInstanceOf(ForbiddenError);
    expect(h.createUnscopedClientMock).not.toHaveBeenCalled();
  });

  it('writes an email_verified row owned by the session user, using the session email', async () => {
    const { values } = mockDb(null);

    const result = await submitSignupDetails(CONFIRMED_USER, {
      ...DETAILS,
      // A body email must be ignored: the session's verified address is the authority.
      email: 'victim@example.com',
    });

    const row = values.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(row.email).toBe('founder@example.com');
    expect(row.emailNormalized).toBe('founder@example.com');
    expect(row.authUserId).toBe(CONFIRMED_USER.id);
    expect(row.status).toBe('email_verified');
    expect(row.candidateSlug).toBe('bayview-towers');
    expect(row.termsVersion).toBeTruthy();
    expect(result.signupRequestId).toBe(row.signupRequestId);
    expect(result.subdomain).toBe('bayview-towers');
  });

  it('requires terms acceptance', async () => {
    mockDb(null);
    await expect(
      submitSignupDetails(CONFIRMED_USER, { ...DETAILS, termsAccepted: false }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('keeps the id of a live row this session wrote', async () => {
    const { values } = mockDb({
      signupRequestId: 'live-id',
      status: 'email_verified',
      expiresAt: new Date(Date.now() + 60_000),
      payload: { flow: 'email_first', authUserId: CONFIRMED_USER.id },
    });
    const result = await submitSignupDetails(CONFIRMED_USER, DETAILS);
    expect((values.mock.calls[0]?.[0] as Record<string, unknown>).signupRequestId).toBe('live-id');
    expect(result.signupRequestId).toBe('live-id');
  });

  it('mints a fresh id over an expired row', async () => {
    const { values } = mockDb({
      signupRequestId: 'old-disclosed-id',
      status: 'pending_verification',
      expiresAt: new Date(Date.now() - 60_000),
      payload: {},
    });
    await submitSignupDetails(CONFIRMED_USER, DETAILS);
    const id = (values.mock.calls[0]?.[0] as Record<string, unknown>).signupRequestId;
    expect(id).not.toBe('old-disclosed-id');
  });

  it.each(['payment_completed', 'provisioning', 'completed'])(
    'never overwrites a %s signup',
    async (status) => {
      const { values } = mockDb({ signupRequestId: 'paid', status, expiresAt: null, payload: {} });
      await expect(submitSignupDetails(CONFIRMED_USER, DETAILS)).rejects.toBeInstanceOf(ValidationError);
      expect(values).not.toHaveBeenCalled();
    },
  );

  it('guards the upsert itself against a payment landing mid-request', async () => {
    const { onConflictDoUpdate } = mockDb(null, []);
    await expect(submitSignupDetails(CONFIRMED_USER, DETAILS)).rejects.toBeInstanceOf(ValidationError);
    const config = onConflictDoUpdate.mock.calls[0]?.[0] as { setWhere: { values: string[] } };
    expect(config.setWhere.values).toEqual(['payment_completed', 'provisioning', 'completed']);
  });

  it('never adopts the id of a live row someone else created for this address', async () => {
    // The form flow lets anyone create a pending_verification row for any
    // address, with an id of their choosing. Adopting it would hand them the
    // bearer id of the victim's paid signup (provisioning-status login token).
    const { values } = mockDb({
      signupRequestId: 'attacker-chosen-id',
      status: 'pending_verification',
      expiresAt: new Date(Date.now() + 60_000),
      payload: {},
    });
    const result = await submitSignupDetails(CONFIRMED_USER, DETAILS);
    expect((values.mock.calls[0]?.[0] as Record<string, unknown>).signupRequestId).not.toBe('attacker-chosen-id');
    expect(result.signupRequestId).not.toBe('attacker-chosen-id');
  });

  it('does not adopt an email-first row written by a different auth user', async () => {
    const { values } = mockDb({
      signupRequestId: 'other-users-id',
      status: 'email_verified',
      expiresAt: new Date(Date.now() + 60_000),
      payload: { flow: 'email_first', authUserId: 'someone-else' },
    });
    await submitSignupDetails(CONFIRMED_USER, DETAILS);
    expect((values.mock.calls[0]?.[0] as Record<string, unknown>).signupRequestId).not.toBe('other-users-id');
  });

  it('marks the row it writes as this session\'s', async () => {
    const { values } = mockDb(null);
    await submitSignupDetails(CONFIRMED_USER, DETAILS);
    const row = values.mock.calls[0]?.[0] as { payload: Record<string, unknown> };
    expect(row.payload).toMatchObject({ flow: 'email_first', authUserId: CONFIRMED_USER.id });
  });

  it('closes a stored Checkout session even when the row it belongs to has expired', async () => {
    mockDb({
      signupRequestId: 'old-id',
      status: 'checkout_started',
      expiresAt: new Date(Date.now() - 60_000),
      payload: { flow: 'email_first', authUserId: CONFIRMED_USER.id, stripeCheckoutSessionId: 'cs_old' },
    });
    await submitSignupDetails(CONFIRMED_USER, DETAILS);
    expect(h.closeCheckoutSessionMock).toHaveBeenCalledWith('cs_old');
  });

  it('closes an open Checkout session before changing the answers it was priced on', async () => {
    const { values } = mockDb({
      signupRequestId: 'live-id',
      status: 'checkout_started',
      expiresAt: new Date(Date.now() + 60_000),
      payload: { flow: 'email_first', authUserId: CONFIRMED_USER.id, stripeCheckoutSessionId: 'cs_test_1' },
    });
    await submitSignupDetails(CONFIRMED_USER, DETAILS);
    expect(h.closeCheckoutSessionMock).toHaveBeenCalledWith('cs_test_1');
    const row = values.mock.calls[0]?.[0] as { payload: Record<string, unknown> };
    expect(row.payload.stripeCheckoutSessionId).toBeUndefined();
  });

  it('refuses to edit when that Checkout session was already paid', async () => {
    h.closeCheckoutSessionMock.mockResolvedValueOnce('complete');
    const { values } = mockDb({
      signupRequestId: 'live-id',
      status: 'checkout_started',
      expiresAt: new Date(Date.now() + 60_000),
      payload: { flow: 'email_first', authUserId: CONFIRMED_USER.id, stripeCheckoutSessionId: 'cs_test_1' },
    });
    await expect(submitSignupDetails(CONFIRMED_USER, DETAILS)).rejects.toBeInstanceOf(ValidationError);
    expect(values).not.toHaveBeenCalled();
  });

  it('refuses an unavailable subdomain', async () => {
    h.checkSubdomainMock.mockResolvedValueOnce({
      normalizedSubdomain: 'taken',
      available: false,
      reason: 'taken',
      message: 'That subdomain is already taken.',
    });
    const { values } = mockDb(null);
    await expect(submitSignupDetails(CONFIRMED_USER, DETAILS)).rejects.toThrow('already taken');
    expect(values).not.toHaveBeenCalled();
  });
});
