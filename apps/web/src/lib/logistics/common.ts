import type { NewCommunityRole } from '@propertypro/shared';
import { getFeaturesForCommunity } from '@propertypro/shared';
import type { CommunityMembership } from '@/lib/api/community-membership';
import { ForbiddenError } from '@/lib/api/errors';
import { requirePermission } from '@/lib/db/access-control';

// Re-export from canonical source (M1 deduplication)
export { getActorUnitIds } from '@/lib/units/actor-units';

export function isResidentRole(role: NewCommunityRole): boolean {
  return role === 'resident';
}

export function requireStaffOperator(membership: CommunityMembership): void {
  if (!membership.isAdmin) {
    throw new ForbiddenError('Only staff users can perform this action');
  }
}

export function requirePackageLoggingEnabled(membership: CommunityMembership): void {
  const features = getFeaturesForCommunity(membership.communityType);
  if (!features.hasPackageLogging) {
    throw new ForbiddenError('Package logging is not enabled for this community type');
  }
}

export function requireVisitorLoggingEnabled(membership: CommunityMembership): void {
  const features = getFeaturesForCommunity(membership.communityType);
  if (!features.hasVisitorLogging) {
    throw new ForbiddenError('Visitor logging is not enabled for this community type');
  }
}

export function requirePackagesReadPermission(membership: CommunityMembership): void {
  requirePermission(membership, 'packages', 'read');
}

export function requirePackagesWritePermission(membership: CommunityMembership): void {
  requirePermission(membership, 'packages', 'write');
}

export function requireVisitorsReadPermission(membership: CommunityMembership): void {
  requirePermission(membership, 'visitors', 'read');
}

export function requireVisitorsWritePermission(membership: CommunityMembership): void {
  requirePermission(membership, 'visitors', 'write');
}

export { requireActorUnitId } from '@/lib/units/actor-units';
import type { ScopedClient } from '@propertypro/db';
import { getActorUnitIds as getIds } from '@/lib/units/actor-units';

/** Variant that returns all unit IDs (not just the first). Throws if none found. */
export async function requireActorUnitIds(
  scopedClient: ScopedClient,
  actorUserId: string,
): Promise<number[]> {
  const unitIds = await getIds(scopedClient, actorUserId);
  if (unitIds.length === 0) {
    throw new ForbiddenError('No unit association found for this user in the selected community');
  }
  return unitIds;
}
