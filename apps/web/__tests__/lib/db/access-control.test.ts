import { describe, expect, it } from 'vitest';
import { requireBoardDesignation } from '../../../src/lib/db/access-control';
import { ForbiddenError } from '../../../src/lib/api/errors';
import type { CommunityMembership } from '../../../src/lib/api/community-membership';

// Minimal membership factory — only the fields requireBoardDesignation reads.
function membership(overrides: Partial<CommunityMembership>): CommunityMembership {
  return {
    userId: 'u', communityId: 1, communityName: '', role: 'resident',
    communityType: 'condo_718', subscriptionPlan: null, subscriptionStatus: null,
    freeAccessExpiresAt: null, timezone: 'America/New_York', isUnitOwner: false,
    isAdmin: false, displayTitle: '', designation: null, city: null, state: null,
    isDemo: false, trialEndsAt: null, demoExpiresAt: null, electionsAttorneyReviewed: false,
    ...overrides,
  };
}

describe('requireBoardDesignation', () => {
  it('passes for a management-tier actor (isAdmin)', () => {
    expect(() => requireBoardDesignation(membership({ role: 'property_manager', isAdmin: true }))).not.toThrow();
  });
  it('passes for a resident holding a board designation', () => {
    expect(() => requireBoardDesignation(membership({ role: 'resident', isAdmin: false, designation: 'board_member' }))).not.toThrow();
  });
  it('throws ForbiddenError for a plain resident with no designation', () => {
    expect(() => requireBoardDesignation(membership({ role: 'resident', isAdmin: false, designation: null }))).toThrow(ForbiddenError);
  });
});
