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
  checkAddressMock: vi.fn(),
  closeMock: vi.fn(),
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
  closeCheckoutSession: h.closeMock,
  createEmbeddedCheckoutSession: h.createEmbeddedMock,
  retrieveCheckoutSession: h.retrieveMock,
}));
vi.mock('../../src/lib/auth/community-address-conflict', async (importOriginal) => {
  const real = await importOriginal<typeof import('../../src/lib/auth/community-address-conflict')>();
  return { ...real, checkSignupAddress: h.checkAddressMock };
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

let row: Record<string, unknown> = SIGNUP;

beforeEach(() => {
  vi.clearAllMocks();
  row = SIGNUP;
  h.createUnscopedClientMock.mockReturnValue({
    select: () => ({ from: () => ({ where: () => ({ limit: async () => [row] }) }) }),
    update: () => ({ set: () => ({ where: async () => undefined }) }),
  });
  h.createEmbeddedMock.mockResolvedValue({ clientSecret: 'cs_secret', sessionId: 'cs_1' });
  h.checkAddressMock.mockResolvedValue('available');
  h.closeMock.mockResolvedValue('closed');
});

describe('createCheckoutSession — duplicate address', () => {
  it('refuses before opening a Stripe session, naming the field to fix', async () => {
    h.checkAddressMock.mockResolvedValueOnce('taken');
    await expect(createCheckoutSession('req-1')).resolves.toEqual({
      ok: false,
      error: COMMUNITY_EXISTS_MESSAGE,
      field: 'communityExists',
    });
    expect(h.createEmbeddedMock).not.toHaveBeenCalled();
    expect(h.checkAddressMock).toHaveBeenCalledWith({
      email: 'founder@example.com',
      addressLine1: '1200 Brickell Bay Dr',
      zipCode: '33131',
      excludeSignupRequestId: 'req-1',
    });
  });

  it('closes the session this row already opened, so it can no longer be paid', async () => {
    row = { ...SIGNUP, status: 'checkout_started', payload: { stripeCheckoutSessionId: 'cs_open' } };
    h.checkAddressMock.mockResolvedValueOnce('taken');
    await expect(createCheckoutSession('req-1')).resolves.toMatchObject({ ok: false, field: 'communityExists' });
    expect(h.closeMock).toHaveBeenCalledWith('cs_open');
    expect(h.retrieveMock).not.toHaveBeenCalled();
  });

  it('refuses without answering when the check budget is spent', async () => {
    h.checkAddressMock.mockResolvedValueOnce('rate_limited');
    const result = await createCheckoutSession('req-1');
    expect(result).toMatchObject({ ok: false });
    expect(result).not.toHaveProperty('field');
    expect(h.createEmbeddedMock).not.toHaveBeenCalled();
  });

  it('opens the session for a row the details step marked as a separate association', async () => {
    row = { ...SIGNUP, payload: { sharedAddress: true } };
    h.checkAddressMock.mockResolvedValueOnce('taken');
    await expect(createCheckoutSession('req-1')).resolves.toMatchObject({ ok: true, sessionId: 'cs_1' });
  });

  it('opens the session when the address is free', async () => {
    await expect(createCheckoutSession('req-1')).resolves.toMatchObject({ ok: true, sessionId: 'cs_1' });
    expect(h.createEmbeddedMock).toHaveBeenCalledTimes(1);
  });
});
