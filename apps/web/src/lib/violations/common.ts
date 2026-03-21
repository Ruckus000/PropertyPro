import type { NewCommunityRole } from '@propertypro/shared';
import { getFeaturesForCommunity } from '@propertypro/shared';
import type { CommunityMembership } from '@/lib/api/community-membership';
import { ForbiddenError } from '@/lib/api/errors';
import { requirePermission } from '@/lib/db/access-control';
import { requirePlanFeature } from '@/lib/middleware/plan-guard';

// Re-export from canonical source (M1 deduplication)
export { getActorUnitIds, requireActorUnitId } from '@/lib/units/actor-units';

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

export function requireViolationsReadPermission(membership: CommunityMembership): void {
  requirePermission(membership, 'violations', 'read');
}

export function requireViolationsWritePermission(membership: CommunityMembership): void {
  requirePermission(membership, 'violations', 'write');
}

export function requireViolationAdminWrite(membership: CommunityMembership): void {
  if (!membership.isAdmin) {
    throw new ForbiddenError('Only violation administrators can perform this action');
  }
}

export function requireArcReadPermission(membership: CommunityMembership): void {
  requirePermission(membership, 'arc_submissions', 'read');
}

export function requireArcWritePermission(membership: CommunityMembership): void {
  requirePermission(membership, 'arc_submissions', 'write');
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

export function isResidentRole(role: NewCommunityRole): boolean {
  return role === 'resident';
}

