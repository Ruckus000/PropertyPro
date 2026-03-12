import { userRoles, type ScopedClient } from '@propertypro/db';
import { eq } from '@propertypro/db/filters';
import { getFeaturesForCommunity, type CommunityRole } from '@propertypro/shared';
import type { CommunityMembership } from '@/lib/api/community-membership';
import { ForbiddenError } from '@/lib/api/errors';
import { requirePermission } from '@/lib/db/access-control';

const RESIDENT_ROLES = new Set<CommunityRole>(['owner', 'tenant']);
const STAFF_ROLES = new Set<CommunityRole>([
  'board_president',
  'cam',
  'site_manager',
  'property_manager_admin',
]);

export function isResidentRole(role: CommunityRole): boolean {
  return RESIDENT_ROLES.has(role);
}

export function requireStaffOperator(membership: CommunityMembership): void {
  if (!STAFF_ROLES.has(membership.role)) {
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
  requirePermission(membership.role, membership.communityType, 'packages', 'read');
}

export function requirePackagesWritePermission(membership: CommunityMembership): void {
  requirePermission(membership.role, membership.communityType, 'packages', 'write');
}

export function requireVisitorsReadPermission(membership: CommunityMembership): void {
  requirePermission(membership.role, membership.communityType, 'visitors', 'read');
}

export function requireVisitorsWritePermission(membership: CommunityMembership): void {
  requirePermission(membership.role, membership.communityType, 'visitors', 'write');
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
