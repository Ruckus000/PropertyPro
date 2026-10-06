/**
 * `createCheckoutSession` refuses an address that already has a community.
 *
 * It is the last gate before payment and the only one the form-flow signup
 * passes through, so it is pinned separately from the email-first details step.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  createUnscopedClientMock: vi.fn(),
  createEmbeddedMock: vi.fn(),
  retrieveMock: vi.fn(),
  hasConflictMock: vi.fn(),
}));

vi.mock('@propertypro/db/unsafe', () => ({ createUnscopedClient: h.createUnscopedClientMock }));
vi.mock('@propertypro/db', () => ({
  pendingSignups: { signupRequestId: 'pending_signups.signup_request_id' },
}));
vi.mock('@propertypro/db/filters', () => ({
  eq: (col: unknown, value: unknown) => ({ col, value }),
}));
vi.mock('next/headers', () => ({
  headers: async () => new Headers({ host: 'getpropertypro.com' }),
}));
vi.mock('../../src/lib/services/stripe-service', () => ({
  createEmbeddedCheckoutSession: h.createEmbeddedMock,
  retrieveCheckoutSession: h.retrieveMock,
}));
vi.mock('../../src/lib/auth/community-address-conflict', async (importOriginal) => {
  const real = await importOriginal<typeof import('../../src/lib/auth/community-address-conflict')>();
  return { ...real, hasConflictingCommunity: h.hasConflictMock };
});

import { createCheckoutSession } from '../../src/lib/actions/checkout';
import { COMMUNITY_EXISTS_MESSAGE } from '../../src/lib/auth/community-address-conflict';

const SIGNUP = {
  signupRequestId: 'req-1',
  status: 'email_verified',
  addressLine1: '1200 Brickell Bay Dr',
  zipCode: '33131',
  planKey: 'essentials',
  communityType: 'condo_718',
  candidateSlug: 'bayview-towers',
  email: 'founder@example.com',
  payload: {},
};

beforeEach(() => {
  vi.clearAllMocks();
  h.createUnscopedClientMock.mockReturnValue({
    select: () => ({ from: () => ({ where: () => ({ limit: async () => [SIGNUP] }) }) }),
    update: () => ({ set: () => ({ where: async () => undefined }) }),
  });
  h.createEmbeddedMock.mockResolvedValue({ clientSecret: 'cs_secret', sessionId: 'cs_1' });
  h.hasConflictMock.mockResolvedValue(false);
});

describe('createCheckoutSession — duplicate address', () => {
  it('refuses before opening a Stripe session', async () => {
    h.hasConflictMock.mockResolvedValueOnce(true);
    await expect(createCheckoutSession('req-1')).resolves.toEqual({
      ok: false,
      error: COMMUNITY_EXISTS_MESSAGE,
    });
    expect(h.createEmbeddedMock).not.toHaveBeenCalled();
    expect(h.hasConflictMock).toHaveBeenCalledWith({
      addressLine1: '1200 Brickell Bay Dr',
      zipCode: '33131',
      excludeSignupRequestId: 'req-1',
    });
  });

  it('opens the session when the address is free', async () => {
    await expect(createCheckoutSession('req-1')).resolves.toMatchObject({ ok: true, sessionId: 'cs_1' });
    expect(h.createEmbeddedMock).toHaveBeenCalledTimes(1);
  });
});
