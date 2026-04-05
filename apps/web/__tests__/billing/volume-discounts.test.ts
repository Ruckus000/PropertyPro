import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockListSubs = vi.fn();
const mockUpdateSub = vi.fn();
const mockDeleteDiscount = vi.fn();

vi.mock('stripe', () => ({
  default: vi.fn(() => ({
    subscriptions: {
      list: mockListSubs,
      update: mockUpdateSub,
      deleteDiscount: mockDeleteDiscount,
    },
  })),
}));

import { applyVolumeDiscountToSubscriptions } from '@/lib/billing/volume-discounts';

/**
 * Build a fake Stripe list-result that behaves like the SDK's async
 * iterator (used by `for await (const sub of stripe.subscriptions.list(...))`).
 */
function fakeList<T>(items: T[]): AsyncIterable<T> & { data: T[] } {
  return {
    data: items,
    [Symbol.asyncIterator]: async function* () {
      for (const item of items) yield item;
    },
  };
}

beforeEach(() => {
  process.env.STRIPE_SECRET_KEY = 'sk_test_fake';
  mockListSubs.mockReset();
  mockUpdateSub.mockReset();
  mockDeleteDiscount.mockReset();
});

describe('applyVolumeDiscountToSubscriptions', () => {
  it('applies new coupon when no existing volume discount', async () => {
    mockListSubs.mockReturnValue(fakeList([{ id: 'sub_1', discounts: [] }]));
    mockUpdateSub.mockResolvedValue({ id: 'sub_1' });

    await applyVolumeDiscountToSubscriptions('cus_123', 'tier_10');

    expect(mockDeleteDiscount).not.toHaveBeenCalled();
    expect(mockUpdateSub).toHaveBeenCalledWith('sub_1', {
      discounts: [{ coupon: 'volume_10pct' }],
    });
  });

  it('removes existing volume discount before applying new one', async () => {
    mockListSubs.mockReturnValue(fakeList([{
      id: 'sub_1',
      discounts: [{
        id: 'di_abc',
        coupon: { id: 'volume_10pct', metadata: { origin: 'volume_discount' } },
      }],
    }]));
    mockUpdateSub.mockResolvedValue({ id: 'sub_1' });
    mockDeleteDiscount.mockResolvedValue({ deleted: true });

    await applyVolumeDiscountToSubscriptions('cus_123', 'tier_15');

    expect(mockDeleteDiscount).toHaveBeenCalledWith('sub_1', 'di_abc');
    expect(mockUpdateSub).toHaveBeenCalledWith('sub_1', {
      discounts: [{ coupon: 'volume_15pct' }],
    });
  });

  it('removes volume discount when tier becomes none', async () => {
    mockListSubs.mockReturnValue(fakeList([{
      id: 'sub_1',
      discounts: [{
        id: 'di_abc',
        coupon: { id: 'volume_10pct', metadata: { origin: 'volume_discount' } },
      }],
    }]));
    mockDeleteDiscount.mockResolvedValue({ deleted: true });
    mockUpdateSub.mockResolvedValue({ id: 'sub_1' });

    await applyVolumeDiscountToSubscriptions('cus_123', 'none');

    expect(mockDeleteDiscount).toHaveBeenCalledWith('sub_1', 'di_abc');
    // With tier=none there is no new volume coupon, so discounts is just
    // the preserved (empty) set of non-volume coupons.
    expect(mockUpdateSub).toHaveBeenCalledWith('sub_1', { discounts: [] });
  });

  it('preserves non-volume discounts when applying a new volume coupon', async () => {
    mockListSubs.mockReturnValue(fakeList([{
      id: 'sub_1',
      discounts: [{
        id: 'di_promo',
        coupon: { id: 'PROMO50', metadata: { origin: 'marketing' } },
      }],
    }]));
    mockUpdateSub.mockResolvedValue({ id: 'sub_1' });

    await applyVolumeDiscountToSubscriptions('cus_123', 'tier_10');

    expect(mockDeleteDiscount).not.toHaveBeenCalled();
    expect(mockUpdateSub).toHaveBeenCalledWith('sub_1', {
      discounts: [{ coupon: 'PROMO50' }, { coupon: 'volume_10pct' }],
    });
  });
});
