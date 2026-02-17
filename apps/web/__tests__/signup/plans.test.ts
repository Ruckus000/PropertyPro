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

    expect(condoPlans).toContain('compliance_basic');
    expect(hoaPlans).toContain('compliance_plus_mobile');
    expect(apartmentPlans).toContain('apartment_operations');
    expect(apartmentPlans).not.toContain('compliance_basic');
  });

  it('enforces plan availability by selected community type', () => {
    expect(isPlanAvailableForCommunityType('condo_718', 'compliance_basic')).toBe(
      true,
    );
    expect(
      isPlanAvailableForCommunityType('apartment', 'compliance_basic'),
    ).toBe(false);
  });
});
