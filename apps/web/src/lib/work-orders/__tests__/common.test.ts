import { describe, expect, it, vi } from 'vitest';

// common.ts re-exports actor-units which pulls in @propertypro/db (needs DATABASE_URL).
// Stub that transitive dependency so unit tests run without a live DB.
vi.mock('@/lib/units/actor-units', () => ({
  getActorUnitIds: vi.fn(),
  requireActorUnitId: vi.fn(),
}));

import { requireWorkOrdersEnabled, requireAmenitiesEnabled } from '../common';
import type { CommunityMembership } from '@/lib/api/community-membership';

function membership(overrides: Partial<CommunityMembership>): CommunityMembership {
  return {
    userId: 'user-1',
    communityId: 42,
    communityName: 'Test',
    communityType: 'condo_718',
    role: 'cam',
    permissions: {},
    isAdmin: true,
    isUnitOwner: false,
    subscriptionPlan: 'professional',
    subscriptionStatus: 'active',
    freeAccessExpiresAt: null,
    isDemo: false,
    trialEndsAt: null,
    demoExpiresAt: null,
    timezone: 'America/New_York',
    displayTitle: 'Community Association Manager',
    city: null,
    state: null,
    electionsAttorneyReviewed: false,
    ...overrides,
  } as CommunityMembership;
}

describe('requireWorkOrdersEnabled', () => {
  it('allows when type AND plan enable hasWorkOrders', () => {
    // professional plan on condo_718 enables hasWorkOrders
    expect(() => requireWorkOrdersEnabled(membership({}))).not.toThrow();
  });

  it('denies when plan excludes hasWorkOrders even if type enables it', () => {
    // essentials plan omits hasWorkOrders (defaults false), so type=true & plan=false → deny
    expect(() => requireWorkOrdersEnabled(membership({ subscriptionPlan: 'essentials' }))).toThrow();
  });

  it('denies when plan excludes hasWorkOrders for a different community type', () => {
    // apartment type enables hasWorkOrders, but essentials plan omits it → deny
    expect(() =>
      requireWorkOrdersEnabled(membership({ communityType: 'apartment', subscriptionPlan: 'essentials' })),
    ).toThrow();
  });

  it('fails open on null subscriptionPlan (new/unprovisioned community)', () => {
    // Null plan → getEffectiveFeatures falls back to type-only features.
    // condo_718 at type level has hasWorkOrders; should NOT throw.
    expect(() => requireWorkOrdersEnabled(membership({ subscriptionPlan: null }))).not.toThrow();
  });
});

describe('requireAmenitiesEnabled', () => {
  it('allows when type AND plan enable hasAmenities', () => {
    // apartment type + operations_plus plan both enable hasAmenities
    expect(() =>
      requireAmenitiesEnabled(membership({ communityType: 'apartment', subscriptionPlan: 'operations_plus' })),
    ).not.toThrow();
  });

  it('denies on plan-excluded hasAmenities', () => {
    // apartment type enables hasAmenities, essentials plan omits it (defaults false) → deny
    expect(() =>
      requireAmenitiesEnabled(membership({ communityType: 'apartment', subscriptionPlan: 'essentials' })),
    ).toThrow();
  });
});
