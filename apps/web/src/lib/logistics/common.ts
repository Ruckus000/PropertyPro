import { userRoles, type ScopedClient } from '@propertypro/db';
import { eq } from '@propertypro/db/filters';
import type { NewCommunityRole } from '@propertypro/shared';
import { getFeaturesForCommunity } from '@propertypro/shared';
import type { CommunityMembership } from '@/lib/api/community-membership';
import { ForbiddenError } from '@/lib/api/errors';
import { requirePermission } from '@/lib/db/access-control';

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

export async function getActorUnitIds(
  scopedClient: ScopedClient,
  actorUserId: string,
): Promise<number[]> {
  const membershipRows = await scopedClient.selectFrom<{ unitId: number | null }>(
    userRoles,
    { unitId: userRoles.unitId },
    eq(userRoles.userId, actorUserId),
  );

  return membershipRows
    .map((row) => row.unitId)
    .filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
}

export async function requireActorUnitIds(
  scopedClient: ScopedClient,
  actorUserId: string,
): Promise<number[]> {
  const unitIds = await getActorUnitIds(scopedClient, actorUserId);
  if (unitIds.length === 0) {
    throw new ForbiddenError('No unit association found for this user in the selected community');
  }
  return unitIds;
}
