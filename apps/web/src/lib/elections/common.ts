import { getFeaturesForCommunity } from '@propertypro/shared';
import type { CommunityMembership } from '@/lib/api/community-membership';
import { ForbiddenError } from '@/lib/api/errors';

// RBAC permission checks ('elections' resource, read/write) are performed via
// requirePermission() from @/lib/db/access-control directly at call sites.
// The helpers below cover non-RBAC concerns: feature flags, attorney review,
// and the isAdmin role flag — none of which belong in the RBAC matrix.

export function requireElectionsEnabled(membership: CommunityMembership): void {
  const features = getFeaturesForCommunity(membership.communityType);
  if (!features.hasVoting) {
    throw new ForbiddenError('Elections are not enabled for this community type');
  }

  if (!membership.electionsAttorneyReviewed) {
    throw new ForbiddenError('Elections are not available until attorney review is complete');
  }
}

export function requireElectionsAdminRole(membership: CommunityMembership): void {
  if (!membership.isAdmin) {
    throw new ForbiddenError('Only community leaders can manage elections');
  }
}
