import { describe, expect, it, vi, beforeEach } from 'vitest';

const { retrieveMock, dbLimitMock } = vi.hoisted(() => ({
  retrieveMock: vi.fn(),
  dbLimitMock: vi.fn(),
}));

vi.mock('@propertypro/db/unsafe', () => ({
  createUnscopedClient: () => ({
    select: () => ({ from: () => ({ where: () => ({ limit: dbLimitMock }) }) }),
  }),
}));
vi.mock('@propertypro/db', () => ({
  stripePrices: { planId: 'p', communityType: 'c', billingInterval: 'i', stripePriceId: 's' },
  pendingSignups: {},
}));
vi.mock('@propertypro/db/filters', () => ({
  eq: (a: unknown, b: unknown) => ({ _eq: [a, b] }),
  and: (...xs: unknown[]) => ({ _and: xs }),
}));

vi.mock('stripe', () => ({
  default: vi.fn().mockImplementation(() => ({ prices: { retrieve: retrieveMock } })),
}));

import { resolveStripePrice } from '@/lib/services/stripe-service';

describe('resolveStripePrice — mode assertion', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.STRIPE_SECRET_KEY = 'sk_test_dummy';
    dbLimitMock.mockResolvedValue([{ stripePriceId: 'price_live_123' }]);
  });

  it('throws STRIPE_MODE_MISMATCH when the price is not retrievable with the configured key', async () => {
    retrieveMock.mockRejectedValue(
      Object.assign(new Error('No such price'), { code: 'resource_missing' }),
    );
    await expect(resolveStripePrice('essentials', 'condo_718', 'month')).rejects.toMatchObject({
      code: 'STRIPE_MODE_MISMATCH',
      statusCode: 500,
    });
  });

  it('returns the price id when it retrieves cleanly', async () => {
    retrieveMock.mockResolvedValue({ id: 'price_live_123', active: true });
    await expect(resolveStripePrice('essentials', 'condo_718', 'month')).resolves.toBe('price_live_123');
    expect(retrieveMock).toHaveBeenCalledWith('price_live_123');
  });

  it('rethrows a non-resource_missing Stripe error unchanged (not masked as a mode mismatch)', async () => {
    retrieveMock.mockRejectedValue(Object.assign(new Error('rate limited'), { code: 'rate_limit' }));
    await expect(resolveStripePrice('essentials', 'condo_718', 'month')).rejects.toThrow('rate limited');
  });
});
