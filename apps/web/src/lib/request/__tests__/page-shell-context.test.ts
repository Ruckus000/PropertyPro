import { describe, expect, it } from 'vitest';
import { getEffectiveFeatures, resolvePlanId } from '@propertypro/shared';

// Unit-level check: verify the composition we're about to wire matches
// expected behavior. The shell context currently uses getFeaturesForCommunity
// (type-only). After the swap, it must use getEffectiveFeatures with the
// membership's resolved plan.

describe('effective features composition (shell context input)', () => {
  it('condo_718 + essentials composes hasEsign to false', () => {
    const result = getEffectiveFeatures('condo_718', resolvePlanId('essentials'));
    expect(result.hasEsign).toBe(false); // essentials excludes it
  });

  it('condo_718 + null plan falls through to type features (fail-open)', () => {
    const result = getEffectiveFeatures('condo_718', null);
    expect(result.hasMaintenanceRequests).toBe(true);
  });

  it('unknown legacy plan resolves to null and fails open', () => {
    const planId = resolvePlanId('legacy-unknown-plan');
    expect(planId).toBeNull();
    const result = getEffectiveFeatures('condo_718', planId);
    expect(result.hasMaintenanceRequests).toBe(true); // type-only fallback
  });
});
