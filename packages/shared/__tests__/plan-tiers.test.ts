import { describe, expect, it } from 'vitest';
import { comparePlanTiers, isUpgrade } from '../src/features/plan-features';

describe('comparePlanTiers', () => {
  it('treats essentials → professional as an upgrade on the condo/HOA ladder', () => {
    expect(comparePlanTiers('essentials', 'professional')).toBeLessThan(0);
    expect(comparePlanTiers('professional', 'essentials')).toBeGreaterThan(0);
  });

  it('returns 0 for the same plan', () => {
    expect(comparePlanTiers('essentials', 'essentials')).toBe(0);
    expect(comparePlanTiers('operations_plus', 'operations_plus')).toBe(0);
  });

  it('returns null when plans are on different ladders (apartment vs condo/HOA)', () => {
    expect(comparePlanTiers('essentials', 'operations_plus')).toBeNull();
    expect(comparePlanTiers('operations_plus', 'professional')).toBeNull();
  });
});

describe('isUpgrade', () => {
  it('is true only for strictly higher tiers on the same ladder', () => {
    expect(isUpgrade('essentials', 'professional')).toBe(true);
    expect(isUpgrade('professional', 'essentials')).toBe(false);
    expect(isUpgrade('essentials', 'essentials')).toBe(false);
  });

  it('is false across different ladders', () => {
    expect(isUpgrade('essentials', 'operations_plus')).toBe(false);
    expect(isUpgrade('operations_plus', 'professional')).toBe(false);
  });
});
