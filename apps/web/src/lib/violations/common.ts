import type { TransitionRole } from '@propertypro/shared';
import { getFeaturesForCommunity } from '@propertypro/shared';
import type { CommunityMembership } from '@/lib/api/community-membership';
import { ForbiddenError } from '@/lib/api/errors';
import { requirePlanFeature } from '@/lib/middleware/plan-guard';

// Re-export from canonical source (M1 deduplication)
export { getActorUnitIds, requireActorUnitId } from '@/lib/units/actor-units';

// RBAC permission checks ('violations' / 'arc_submissions', read/write) are
// performed via requirePermission() from @/lib/db/access-control directly at
// call sites. The helpers below cover non-RBAC concerns: feature flags, plan
// gating, the isAdmin role flag, and resident-role checks — none of which
// belong in the RBAC matrix.

export async function requireViolationsEnabled(membership: CommunityMembership): Promise<void> {
  const features = getFeaturesForCommunity(membership.communityType);
  if (!features.hasViolations) {
    throw new ForbiddenError('Violations features are not enabled for this community type');
  }
  await requirePlanFeature(membership.communityId, 'hasViolations');
}

export async function requireArcEnabled(membership: CommunityMembership): Promise<void> {
  const features = getFeaturesForCommunity(membership.communityType);
  if (!features.hasARC) {
    throw new ForbiddenError('ARC features are not enabled for this community type');
  }
  await requirePlanFeature(membership.communityId, 'hasARC');
}

export function requireViolationAdminWrite(membership: CommunityMembership): void {
  if (!membership.isAdmin) {
    throw new ForbiddenError('Only violation administrators can perform this action');
  }
}

export function requireArcReviewPermission(membership: CommunityMembership): void {
  if (!membership.isAdmin) {
    throw new ForbiddenError('Only ARC reviewers can perform this action');
  }
}

export function requireArcSubmitterRole(membership: CommunityMembership): void {
  if (membership.role !== 'resident') {
    throw new ForbiddenError('Only residents can submit ARC applications');
  }
}

export function isResidentRole(role: TransitionRole): boolean {
  return role === 'resident';
}

