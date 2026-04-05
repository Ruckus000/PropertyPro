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

beforeEach(() => {
  process.env.STRIPE_SECRET_KEY = 'sk_test_fake';
  mockListSubs.mockReset();
  mockUpdateSub.mockReset();
  mockDeleteDiscount.mockReset();
});

describe('applyVolumeDiscountToSubscriptions', () => {
  it('applies new coupon when no existing volume discount', async () => {
    mockListSubs.mockResolvedValue({
      data: [{ id: 'sub_1', discounts: [] }],
    });
    mockUpdateSub.mockResolvedValue({ id: 'sub_1' });

    await applyVolumeDiscountToSubscriptions('cus_123', 'tier_10');

    expect(mockDeleteDiscount).not.toHaveBeenCalled();
    expect(mockUpdateSub).toHaveBeenCalledWith('sub_1', {
      discounts: [{ coupon: 'volume_10pct' }],
    });
  });

  it('removes existing volume discount before applying new one', async () => {
    mockListSubs.mockResolvedValue({
      data: [{
        id: 'sub_1',
        discounts: [{
          id: 'di_abc',
          coupon: { id: 'volume_10pct', metadata: { origin: 'volume_discount' } },
        }],
      }],
    });
    mockUpdateSub.mockResolvedValue({ id: 'sub_1' });
    mockDeleteDiscount.mockResolvedValue({ deleted: true });

    await applyVolumeDiscountToSubscriptions('cus_123', 'tier_15');

    expect(mockDeleteDiscount).toHaveBeenCalledWith('sub_1', 'di_abc');
    expect(mockUpdateSub).toHaveBeenCalledWith('sub_1', {
      discounts: [{ coupon: 'volume_15pct' }],
    });
  });

  it('removes volume discount when tier becomes none', async () => {
    mockListSubs.mockResolvedValue({
      data: [{
        id: 'sub_1',
        discounts: [{
          id: 'di_abc',
          coupon: { id: 'volume_10pct', metadata: { origin: 'volume_discount' } },
        }],
      }],
    });
    mockDeleteDiscount.mockResolvedValue({ deleted: true });

    await applyVolumeDiscountToSubscriptions('cus_123', 'none');

    expect(mockDeleteDiscount).toHaveBeenCalledWith('sub_1', 'di_abc');
    expect(mockUpdateSub).not.toHaveBeenCalled();
  });

  it('ignores non-volume discounts (promo codes)', async () => {
    mockListSubs.mockResolvedValue({
      data: [{
        id: 'sub_1',
        discounts: [{
          id: 'di_promo',
          coupon: { id: 'PROMO50', metadata: { origin: 'marketing' } },
        }],
      }],
    });
    mockUpdateSub.mockResolvedValue({ id: 'sub_1' });

    await applyVolumeDiscountToSubscriptions('cus_123', 'tier_10');

    expect(mockDeleteDiscount).not.toHaveBeenCalled();
    expect(mockUpdateSub).toHaveBeenCalledWith('sub_1', {
      discounts: [{ coupon: 'volume_10pct' }],
    });
  });
});
