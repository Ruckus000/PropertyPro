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
import { buildPasswordZodSchema } from '@propertypro/shared';
import {
  ForbiddenError,
  SignupEmailDeliveryError,
  ValidationError,
} from '../../src/lib/api/errors';

const h = vi.hoisted(() => ({
  createUnscopedClientMock: vi.fn(),
  sendEmailMock: vi.fn(),
  generateSignupAuthLinkMock: vi.fn(),
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
vi.mock('@propertypro/email', () => ({
  sendEmail: h.sendEmailMock,
  SignupVerificationEmail: () => null,
}));
vi.mock('../../src/lib/services/stripe-service', () => ({
  closeCheckoutSession: h.closeCheckoutSessionMock,
}));
// Redis unconfigured: the in-memory limiter is the one exercised.
vi.mock('../../src/lib/middleware/distributed-rate-limiter', () => ({
  checkDistributedRateLimit: vi.fn().mockResolvedValue(null),
}));
vi.mock('../../src/lib/auth/signup', () => ({
  POST_PAYMENT_SIGNUP_STATUSES: ['payment_completed', 'provisioning', 'completed'],
  checkSignupSubdomainAvailability: h.checkSubdomainMock,
  enforceMinSignupResponseTime: vi.fn().mockResolvedValue(undefined),
  generateSignupAuthLink: h.generateSignupAuthLinkMock,
}));

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
  h.sendEmailMock.mockResolvedValue({ id: 'email_1' });
  h.generateSignupAuthLinkMock.mockResolvedValue({
    authUserId: 'auth-1',
    verificationLink: 'https://www.getpropertypro.com/auth/verify-signup?token_hash=t&type=signup',
  });
  h.checkSubdomainMock.mockResolvedValue({
    normalizedSubdomain: 'bayview-towers',
    available: true,
    reason: 'available',
    message: 'Subdomain is available.',
  });
  h.closeCheckoutSessionMock.mockResolvedValue('closed');
});

describe('startEmailFirstSignup', () => {
  it('rejects a malformed email without creating anything', async () => {
    await expect(startEmailFirstSignup({ email: 'not-an-email' })).rejects.toBeInstanceOf(ValidationError);
    expect(h.generateSignupAuthLinkMock).not.toHaveBeenCalled();
    expect(h.sendEmailMock).not.toHaveBeenCalled();
  });

  it('creates the auth user passwordlessly and emails the link to that address', async () => {
    const result = await startEmailFirstSignup({ email: '  Founder@Example.com ' });

    expect(result).toEqual({ message: START_SIGNUP_MESSAGE });
    const call = h.generateSignupAuthLinkMock.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(call.email).toBe('founder@example.com');
    // No metadata: on an existing account GoTrue would write it over theirs.
    expect(call.metadata).toBeUndefined();
    expect(call.signupRequestId).toBeUndefined();
    const redirect = new URL(String(call.redirectTo));
    expect(redirect.pathname).toBe('/signup');
    expect(redirect.searchParams.get('verified')).toBe('1');
    expect(h.sendEmailMock).toHaveBeenCalledWith(expect.objectContaining({ to: 'founder@example.com' }));
  });

  it('uses a password that satisfies the policy every time', () => {
    const schema = buildPasswordZodSchema();
    for (let i = 0; i < 50; i += 1) {
      expect(schema.safeParse(_testInternals.unusablePassword()).success).toBe(true);
    }
  });

  it('stops sending after the per-address cap but answers exactly the same', async () => {
    const cap = _testInternals.START_EMAILS_PER_WINDOW;
    for (let i = 0; i < cap; i += 1) {
      await startEmailFirstSignup({ email: 'cap@example.com' });
    }
    const throttled = await startEmailFirstSignup({ email: 'CAP@example.com' });

    expect(throttled).toEqual({ message: START_SIGNUP_MESSAGE });
    expect(h.sendEmailMock).toHaveBeenCalledTimes(cap);
    expect(h.generateSignupAuthLinkMock).toHaveBeenCalledTimes(cap);

    // A different address is unaffected.
    await startEmailFirstSignup({ email: 'other@example.com' });
    expect(h.sendEmailMock).toHaveBeenCalledTimes(cap + 1);
  });

  it('reports a delivery failure as such', async () => {
    h.sendEmailMock.mockRejectedValueOnce(new Error('resend down'));
    await expect(startEmailFirstSignup({ email: 'a@example.com' })).rejects.toBeInstanceOf(SignupEmailDeliveryError);
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

  it('keeps the id of the caller\'s own live row', async () => {
    const { values } = mockDb({
      signupRequestId: 'live-id',
      status: 'email_verified',
      expiresAt: new Date(Date.now() + 60_000),
      payload: {},
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

  it('closes an open Checkout session before changing the answers it was priced on', async () => {
    const { values } = mockDb({
      signupRequestId: 'live-id',
      status: 'checkout_started',
      expiresAt: new Date(Date.now() + 60_000),
      payload: { stripeCheckoutSessionId: 'cs_test_1' },
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
      payload: { stripeCheckoutSessionId: 'cs_test_1' },
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
