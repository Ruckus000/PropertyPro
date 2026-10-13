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

/** An expanded Discount as the 2026-01-28.clover API returns it: the coupon is
 *  under `source.coupon`, and there is no top-level `coupon`. */
function discount(id: string, couponId: string) {
  return { id, object: 'discount', source: { type: 'coupon', coupon: couponId } };
}

describe('applyVolumeDiscountToSubscriptions', () => {
  it('lists subscriptions with discounts expanded (unexpanded they are bare di_ ids)', async () => {
    mockListSubs.mockReturnValue(fakeList([]));

    await applyVolumeDiscountToSubscriptions('cus_123', 'tier_10');

    expect(mockListSubs).toHaveBeenCalledWith(
      expect.objectContaining({ customer: 'cus_123', expand: ['data.discounts'] }),
    );
  });

  it('applies new coupon when no existing volume discount', async () => {
    mockListSubs.mockReturnValue(fakeList([{ id: 'sub_1', discounts: [] }]));
    mockUpdateSub.mockResolvedValue({ id: 'sub_1' });

    await applyVolumeDiscountToSubscriptions('cus_123', 'tier_10');

    expect(mockUpdateSub).toHaveBeenCalledWith('sub_1', {
      discounts: [{ coupon: 'volume_10pct' }],
    });
  });

  it('replaces the previous volume tier', async () => {
    mockListSubs.mockReturnValue(fakeList([{ id: 'sub_1', discounts: [discount('di_abc', 'volume_10pct')] }]));
    mockUpdateSub.mockResolvedValue({ id: 'sub_1' });

    await applyVolumeDiscountToSubscriptions('cus_123', 'tier_15');

    expect(mockDeleteDiscount).not.toHaveBeenCalled();
    expect(mockUpdateSub).toHaveBeenCalledWith('sub_1', {
      discounts: [{ coupon: 'volume_15pct' }],
    });
  });

  it('removes the volume discount when tier becomes none', async () => {
    mockListSubs.mockReturnValue(fakeList([{ id: 'sub_1', discounts: [discount('di_abc', 'volume_10pct')] }]));
    mockUpdateSub.mockResolvedValue({ id: 'sub_1' });

    await applyVolumeDiscountToSubscriptions('cus_123', 'none');

    expect(mockUpdateSub).toHaveBeenCalledWith('sub_1', { discounts: [] });
  });

  it('keeps every non-volume discount, by its existing discount id', async () => {
    mockListSubs.mockReturnValue(fakeList([{
      id: 'sub_1',
      discounts: [discount('di_promo', 'PROMO50'), discount('di_vol', 'volume_10pct'), discount('di_admin', 'SUMMER')],
    }]));
    mockUpdateSub.mockResolvedValue({ id: 'sub_1' });

    await applyVolumeDiscountToSubscriptions('cus_123', 'tier_20');

    expect(mockUpdateSub).toHaveBeenCalledWith('sub_1', {
      discounts: [{ discount: 'di_promo' }, { discount: 'di_admin' }, { coupon: 'volume_20pct' }],
    });
  });

  it('reuses the volume discount already at the target tier rather than re-creating it', async () => {
    mockListSubs.mockReturnValue(fakeList([{
      id: 'sub_1',
      discounts: [discount('di_vol', 'volume_10pct'), discount('di_promo', 'PROMO50')],
    }]));
    mockUpdateSub.mockResolvedValue({ id: 'sub_1' });

    await applyVolumeDiscountToSubscriptions('cus_123', 'tier_10');

    expect(mockUpdateSub).toHaveBeenCalledWith('sub_1', {
      discounts: [{ discount: 'di_vol' }, { discount: 'di_promo' }],
    });
  });

  it('refuses to write when discounts come back unexpanded', async () => {
    mockListSubs.mockReturnValue(fakeList([{ id: 'sub_1', discounts: ['di_promo'] }]));

    await expect(applyVolumeDiscountToSubscriptions('cus_123', 'tier_10')).rejects.toThrow(/not expanded/);
    expect(mockUpdateSub).not.toHaveBeenCalled();
  });
});
