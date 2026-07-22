import { describe, expect, it } from 'vitest';
import {
  getSignupPlansForCommunityType,
  isPlanAvailableForCommunityType,
} from '../../src/lib/auth/signup-schema';

describe('signup plan options', () => {
  it('returns condo/hoa compliance plans and apartment operational plans', () => {
    const condoPlans = getSignupPlansForCommunityType('condo_718').map(
      (plan) => plan.id,
    );
    const hoaPlans = getSignupPlansForCommunityType('hoa_720').map(
      (plan) => plan.id,
    );
    const apartmentPlans = getSignupPlansForCommunityType('apartment').map(
      (plan) => plan.id,
    );

    expect(condoPlans).toContain('essentials');
    expect(condoPlans).toContain('professional');
    expect(hoaPlans).toContain('essentials');
    expect(hoaPlans).toContain('professional');
    expect(apartmentPlans).toContain('operations_plus');
    expect(apartmentPlans).not.toContain('essentials');
  });

  it('pins the exact customer-facing plan options (labels, prices, order)', () => {
    // SIGNUP_PLAN_OPTIONS is now DERIVED from PLANS_BY_COMMUNITY_TYPE +
    // PLAN_FEATURES rather than written out literally. Nothing else in the
    // suite asserts labels, prices, descriptions or ordering — so without
    // this, a drift in either source would silently change the prices shown
    // on the public signup page and still pass CI.
    expect(getSignupPlansForCommunityType('condo_718')).toEqual([
      {
        id: 'essentials',
        label: 'Essentials',
        monthlyPriceUsd: 199,
        description:
          'Website, statutory document posting, owner portal, and announcements.',
      },
      {
        id: 'professional',
        label: 'Professional',
        monthlyPriceUsd: 349,
        description: 'Full platform with e-sign, violations, ARC, finance, and more.',
      },
    ]);

    expect(getSignupPlansForCommunityType('hoa_720')).toEqual(
      getSignupPlansForCommunityType('condo_718'),
    );

    expect(getSignupPlansForCommunityType('apartment')).toEqual([
      {
        id: 'operations_plus',
        label: 'Operations Plus',
        monthlyPriceUsd: 499,
        description:
          'Full apartment operations with lease tracking, packages, and visitors.',
      },
    ]);
  });

  it('enforces plan availability by selected community type', () => {
    expect(isPlanAvailableForCommunityType('condo_718', 'essentials')).toBe(
      true,
    );
    expect(
      isPlanAvailableForCommunityType('apartment', 'essentials'),
    ).toBe(false);
    expect(
      isPlanAvailableForCommunityType('apartment', 'operations_plus'),
    ).toBe(true);
  });
});
