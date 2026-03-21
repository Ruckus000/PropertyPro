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
