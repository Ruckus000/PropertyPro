import { describe, it, expect } from 'vitest';
import {
  determineTier,
  tierToCouponId,
  tierToPercentOff,
  type VolumeTier,
} from '@/lib/billing/tier-calculator';

describe('determineTier', () => {
  it.each([
    [0, 'none'],
    [1, 'none'],
    [2, 'none'],
    [3, 'tier_10'],
    [4, 'tier_10'],
    [5, 'tier_10'],
    [6, 'tier_15'],
    [7, 'tier_15'],
    [10, 'tier_15'],
    [11, 'tier_20'],
    [50, 'tier_20'],
  ])('count=%i returns tier %s', (count, expected) => {
    expect(determineTier(count)).toBe(expected);
  });
});

describe('tierToCouponId', () => {
  it.each([
    ['none', null],
    ['tier_10', 'volume_10pct'],
    ['tier_15', 'volume_15pct'],
    ['tier_20', 'volume_20pct'],
  ] as [VolumeTier, string | null][])('tier=%s returns %s', (tier, expected) => {
    expect(tierToCouponId(tier)).toBe(expected);
  });
});

describe('tierToPercentOff', () => {
  it('returns correct percentages', () => {
    expect(tierToPercentOff('none')).toBe(0);
    expect(tierToPercentOff('tier_10')).toBe(10);
    expect(tierToPercentOff('tier_15')).toBe(15);
    expect(tierToPercentOff('tier_20')).toBe(20);
  });
});
