import { describe, it, expect } from 'vitest';
import { calculatePricingImpact } from '@/lib/billing/pricing-preview';

describe('calculatePricingImpact', () => {
  it('computes discounted price with no discount (1 community)', () => {
    const result = calculatePricingImpact({
      basePricesUsd: [349],
      currentGroupSize: 0,
      changeType: 'add',
    });
    expect(result.newTier).toBe('none');
    expect(result.previousTier).toBe('none');
    expect(result.perCommunityBreakdown).toEqual([
      { basePriceUsd: 349, discountedPriceUsd: 349, discountPercent: 0 },
    ]);
    expect(result.portfolioMonthlyDeltaUsd).toBe(0);
  });

  it('crosses from tier_none to tier_10 on 3rd add', () => {
    const result = calculatePricingImpact({
      basePricesUsd: [349, 349, 199],
      currentGroupSize: 2,
      changeType: 'add',
    });
    expect(result.previousTier).toBe('none');
    expect(result.newTier).toBe('tier_10');
    expect(result.perCommunityBreakdown[0].discountedPriceUsd).toBeCloseTo(314.10);
    expect(result.perCommunityBreakdown[1].discountedPriceUsd).toBeCloseTo(314.10);
    expect(result.perCommunityBreakdown[2].discountedPriceUsd).toBeCloseTo(179.10);
  });

  it('computes downgrade impact when removing drops 6→5', () => {
    const result = calculatePricingImpact({
      basePricesUsd: [349, 349, 349, 349, 349],
      currentGroupSize: 6,
      changeType: 'remove',
    });
    expect(result.previousTier).toBe('tier_15');
    expect(result.newTier).toBe('tier_10');
    expect(result.portfolioMonthlyDeltaUsd).toBeCloseTo(5 * 17.45, 1);
  });

  it('no tier change returns zero delta', () => {
    const result = calculatePricingImpact({
      basePricesUsd: [349, 349, 349, 349],
      currentGroupSize: 5,
      changeType: 'remove',
    });
    expect(result.previousTier).toBe('tier_10');
    expect(result.newTier).toBe('tier_10');
    expect(result.portfolioMonthlyDeltaUsd).toBe(0);
  });
});
