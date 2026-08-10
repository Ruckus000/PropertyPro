/**
 * Tests for stripe-service helpers.
 *
 * Covers `resolvePlanIdFromStripePriceId` — the inverse of `resolveStripePrice`.
 * Used by the `customer.subscription.updated` webhook to map a Stripe Price ID
 * back to a canonical PlanId when `price.lookup_key` is missing.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Hoisted mocks — must exist before the module under test is imported.
// ---------------------------------------------------------------------------
const {
  createUnscopedClientMock,
  stripePricesTable,
  eqMock,
  andMock,
} = vi.hoisted(() => ({
  createUnscopedClientMock: vi.fn(),
  stripePricesTable: {
    stripePriceId: 'stripe_prices.stripe_price_id',
    planId: 'stripe_prices.plan_id',
    communityType: 'stripe_prices.community_type',
    billingInterval: 'stripe_prices.billing_interval',
  },
  eqMock: vi.fn((col: unknown, val: unknown) => ({ _eq: [col, val] })),
  andMock: vi.fn((...args: unknown[]) => ({ _and: args })),
}));

vi.mock('@propertypro/db/unsafe', () => ({
  createUnscopedClient: createUnscopedClientMock,
}));

vi.mock('@propertypro/db/filters', () => ({
  eq: eqMock,
  and: andMock,
}));

vi.mock('@propertypro/db', () => ({
  stripePrices: stripePricesTable,
  pendingSignups: { signupRequestId: 'pending_signups.signup_request_id' },
}));

// Import after mocks
import { getExpectedLivemode, resolvePlanIdFromStripePriceId } from '../stripe-service';
import { AppError } from '@/lib/api/errors/AppError';

/** Build a chainable select builder that terminates with the given rows. */
function stubSelectChain(rows: Array<{ planId: string }>) {
  const limit = vi.fn().mockResolvedValue(rows);
  const where = vi.fn(() => ({ limit }));
  const from = vi.fn(() => ({ where }));
  const select = vi.fn(() => ({ from }));
  createUnscopedClientMock.mockReturnValue({ select });
  return { select, from, where, limit };
}

describe('resolvePlanIdFromStripePriceId', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns the canonical PlanId when the price is registered in stripe_prices', async () => {
    stubSelectChain([{ planId: 'essentials' }]);

    const result = await resolvePlanIdFromStripePriceId('price_1THjwBK4289h3aRcMUun7mqB');

    expect(result).toBe('essentials');
  });

  it('returns professional for a professional-tier price', async () => {
    stubSelectChain([{ planId: 'professional' }]);

    const result = await resolvePlanIdFromStripePriceId('price_prof_001');

    expect(result).toBe('professional');
  });

  it('returns operations_plus for an apartment-tier price', async () => {
    stubSelectChain([{ planId: 'operations_plus' }]);

    const result = await resolvePlanIdFromStripePriceId('price_apt_001');

    expect(result).toBe('operations_plus');
  });

  it('queries stripe_prices using eq on the stripe_price_id column', async () => {
    const { where } = stubSelectChain([{ planId: 'essentials' }]);
    await resolvePlanIdFromStripePriceId('price_xyz');

    expect(eqMock).toHaveBeenCalledWith(stripePricesTable.stripePriceId, 'price_xyz');
    expect(where).toHaveBeenCalledTimes(1);
  });

  it('throws STRIPE_PRICE_CONFIG_MISSING when the price is not in stripe_prices', async () => {
    stubSelectChain([]);

    await expect(resolvePlanIdFromStripePriceId('price_unknown_999')).rejects.toMatchObject({
      code: 'STRIPE_PRICE_CONFIG_MISSING',
      statusCode: 500,
    });
  });

  it('throws an AppError instance (not a generic Error)', async () => {
    stubSelectChain([]);

    await expect(resolvePlanIdFromStripePriceId('price_missing')).rejects.toBeInstanceOf(AppError);
  });

  it('mentions the priceId in the error message for debuggability', async () => {
    stubSelectChain([]);

    await expect(resolvePlanIdFromStripePriceId('price_ghost')).rejects.toThrow(/price_ghost/);
  });
});

// ---------------------------------------------------------------------------
// getExpectedLivemode — which Stripe mode this deployment's key belongs to.
// ---------------------------------------------------------------------------

describe('getExpectedLivemode', () => {
  const originalKey = process.env.STRIPE_SECRET_KEY;

  afterEach(() => {
    if (originalKey === undefined) delete process.env.STRIPE_SECRET_KEY;
    else process.env.STRIPE_SECRET_KEY = originalKey;
  });

  it.each([
    ['sk_live_abc123', true],
    ['rk_live_abc123', true],
    ['sk_test_abc123', false],
    ['rk_test_abc123', false],
  ])('maps %s to livemode=%s', (key, expected) => {
    process.env.STRIPE_SECRET_KEY = key;
    expect(getExpectedLivemode()).toBe(expected);
  });

  // null means "do not gate". Every case below must stay null: the webhook's
  // mode guard keys off this, and returning a boolean by mistake would start
  // dropping real payment events.
  it('returns null when the key is unset', () => {
    delete process.env.STRIPE_SECRET_KEY;
    expect(getExpectedLivemode()).toBeNull();
  });

  it('returns null for an empty key rather than treating it as test mode', () => {
    process.env.STRIPE_SECRET_KEY = '';
    expect(getExpectedLivemode()).toBeNull();
  });

  it.each(['pk_live_abc', 'sk_LIVE_abc', 'live_abc', 'whsec_abc', 'sk_live', 'garbage'])(
    'returns null for the unrecognised prefix %s',
    (key) => {
      process.env.STRIPE_SECRET_KEY = key;
      expect(getExpectedLivemode()).toBeNull();
    },
  );
});
