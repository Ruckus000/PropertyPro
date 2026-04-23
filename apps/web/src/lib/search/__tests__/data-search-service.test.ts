import { describe, expect, it } from 'vitest';
import { getEffectiveFeatures, resolvePlanId } from '@propertypro/shared';

// The concern: when a community has hasWorkOrders at the TYPE level but
// its PLAN excludes it, the command palette must NOT surface the
// page-work-orders entry. Before this swap, search used type-only features
// and the entry leaked.

describe('data-search-service feature filtering', () => {
  it('plan-excluded hasWorkOrders → features.hasWorkOrders is false', () => {
    // condo_718 + essentials: type has WO, plan excludes.
    const features = getEffectiveFeatures('condo_718', resolvePlanId('essentials'));
    expect(features.hasWorkOrders).toBe(false);
  });

  it('professional plan grants hasWorkOrders on condo_718', () => {
    const features = getEffectiveFeatures('condo_718', resolvePlanId('professional'));
    expect(features.hasWorkOrders).toBe(true);
  });
});
