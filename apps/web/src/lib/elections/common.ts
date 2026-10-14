import { getFeaturesForCommunity } from '@propertypro/shared';
import type { CommunityMembership } from '@/lib/api/community-membership';
import { ForbiddenError } from '@/lib/api/errors';
import { requireBoardDesignation } from '@/lib/db/access-control';
import { requirePlanFeature } from '@/lib/middleware/plan-guard';

// RBAC permission checks ('elections' resource, read/write) are performed via
// requirePermission() from @/lib/db/access-control directly at call sites.
// The helpers below cover non-RBAC concerns: feature flags, attorney review,
// and the isAdmin role flag — none of which belong in the RBAC matrix.

/**
 * The whole elections gate: community type, attorney review, then the plan
 * (`hasVoting` is Professional-only). Async because the plan is read from the
 * database, so every caller MUST await it: an unawaited call fails OPEN, and
 * `__tests__/elections/elections-gate-awaited.test.ts` enforces that.
 */
export async function requireElectionsEnabled(membership: CommunityMembership): Promise<void> {
  const features = getFeaturesForCommunity(membership.communityType);
  if (!features.hasVoting) {
    throw new ForbiddenError('Elections are not enabled for this community type');
  }

  if (!membership.electionsAttorneyReviewed) {
    throw new ForbiddenError('Elections are not available until attorney review is complete');
  }

  await requirePlanFeature(membership.communityId, 'hasVoting');
}

export function requireElectionsAdminRole(membership: CommunityMembership): void {
  requireBoardDesignation(membership);
}
