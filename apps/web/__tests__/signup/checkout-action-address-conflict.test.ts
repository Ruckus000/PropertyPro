/**
 * `createCheckoutSession`, the last gate before payment:
 * - it refuses an address that already has a community, even after the
 *   details step passed (another signup for it may have paid since);
 * - it serves only the signed-in founder's own row, since the
 *   `signupRequestId` it is called with is not a secret.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  createUnscopedClientMock: vi.fn(),
  createEmbeddedMock: vi.fn(),
  retrieveMock: vi.fn(),
  checkAddressMock: vi.fn(),
  closeMock: vi.fn(),
  getUserMock: vi.fn(),
}));

vi.mock('@propertypro/db/supabase/server', () => ({
  createServerClient: async () => ({ auth: { getUser: h.getUserMock } }),
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
  return { ...real, hasConflictingCommunity: h.checkAddressMock };
});

import { createCheckoutSession } from '../../src/lib/actions/checkout';
import { COMMUNITY_EXISTS_MESSAGE } from '../../src/lib/auth/community-address-conflict';

const FOUNDER = { id: '00000000-0000-4000-8000-000000000001', email: 'founder@example.com', email_confirmed_at: '2026-10-09T12:00:00Z' };

const SIGNUP = {
  signupRequestId: 'req-1',
  authUserId: FOUNDER.id,
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
const updateMock = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  row = SIGNUP;
  h.getUserMock.mockResolvedValue({ data: { user: FOUNDER }, error: null });
  h.createUnscopedClientMock.mockReturnValue({
    select: () => ({ from: () => ({ where: () => ({ limit: async () => [row] }) }) }),
    update: () => {
      updateMock();
      return { set: () => ({ where: async () => undefined }) };
    },
  });
  h.createEmbeddedMock.mockResolvedValue({ clientSecret: 'cs_secret', sessionId: 'cs_1' });
  h.checkAddressMock.mockResolvedValue(false);
  h.closeMock.mockResolvedValue('closed');
});

describe('createCheckoutSession — duplicate address', () => {
  it('refuses before opening a Stripe session, naming the field to fix', async () => {
    h.checkAddressMock.mockResolvedValueOnce(true);
    await expect(createCheckoutSession('req-1')).resolves.toEqual({
      ok: false,
      error: COMMUNITY_EXISTS_MESSAGE,
      field: 'communityExists',
    });
    expect(h.createEmbeddedMock).not.toHaveBeenCalled();
    expect(h.checkAddressMock).toHaveBeenCalledWith({
      addressLine1: '1200 Brickell Bay Dr',
      zipCode: '33131',
      excludeSignupRequestId: 'req-1',
    });
  });

  it('closes the session this row already opened, so it can no longer be paid', async () => {
    row = { ...SIGNUP, status: 'checkout_started', payload: { stripeCheckoutSessionId: 'cs_open' } };
    h.checkAddressMock.mockResolvedValueOnce(true);
    await expect(createCheckoutSession('req-1')).resolves.toMatchObject({ ok: false, field: 'communityExists' });
    expect(h.closeMock).toHaveBeenCalledWith('cs_open');
    expect(h.retrieveMock).not.toHaveBeenCalled();
  });

  it('is not metered, so refreshing an open checkout can never lock its founder out', async () => {
    for (let i = 0; i < 40; i += 1) {
      await expect(createCheckoutSession('req-1')).resolves.toMatchObject({ ok: true });
    }
  });

  it('opens the session for a row the details step marked as a separate association', async () => {
    row = { ...SIGNUP, payload: { sharedAddress: true } };
    h.checkAddressMock.mockResolvedValueOnce(true);
    await expect(createCheckoutSession('req-1')).resolves.toMatchObject({ ok: true, sessionId: 'cs_1' });
  });

  it('opens the session when the address is free', async () => {
    await expect(createCheckoutSession('req-1')).resolves.toMatchObject({ ok: true, sessionId: 'cs_1' });
    expect(h.createEmbeddedMock).toHaveBeenCalledTimes(1);
  });
});

describe('createCheckoutSession — owner binding', () => {
  function expectNothingOpened() {
    expect(h.createEmbeddedMock).not.toHaveBeenCalled();
    expect(h.retrieveMock).not.toHaveBeenCalled();
    expect(updateMock).not.toHaveBeenCalled();
  }

  it('refuses a caller with no session, before reading the row', async () => {
    h.getUserMock.mockResolvedValueOnce({ data: { user: null }, error: null });
    await expect(createCheckoutSession('req-1')).resolves.toEqual({
      ok: false,
      error: 'Please sign in to continue your signup.',
    });
    expect(h.createUnscopedClientMock).not.toHaveBeenCalled();
    expectNothingOpened();
  });

  it('refuses a session whose email is not confirmed', async () => {
    h.getUserMock.mockResolvedValueOnce({ data: { user: { ...FOUNDER, email_confirmed_at: null } }, error: null });
    await expect(createCheckoutSession('req-1')).resolves.toMatchObject({ ok: false });
    expectNothingOpened();
  });

  // Holding someone else's id (it is in their Stripe return URL) must not
  // open, refresh or re-price their checkout, nor confirm the id exists.
  it("answers another founder's row exactly like a missing one", async () => {
    row = { ...SIGNUP, authUserId: '00000000-0000-4000-8000-000000000002', status: 'checkout_started', payload: { stripeCheckoutSessionId: 'cs_open' } };
    await expect(createCheckoutSession('req-1')).resolves.toEqual({
      ok: false,
      error: 'Signup not found. Please start a new signup.',
    });
    expectNothingOpened();
  });

  it('refuses a row with no owner (written by the retired form flow)', async () => {
    row = { ...SIGNUP, authUserId: null };
    await expect(createCheckoutSession('req-1')).resolves.toEqual({
      ok: false,
      error: 'Signup not found. Please start a new signup.',
    });
    expectNothingOpened();
  });

  it("opens checkout for the founder's own row", async () => {
    await expect(createCheckoutSession('req-1')).resolves.toMatchObject({ ok: true, sessionId: 'cs_1' });
    expect(h.createEmbeddedMock).toHaveBeenCalledTimes(1);
  });
});
