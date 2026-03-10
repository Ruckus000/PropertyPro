import { userRoles, type ScopedClient } from '@propertypro/db';
import { eq } from '@propertypro/db/filters';
import type { CommunityRole } from '@propertypro/shared';
import { getFeaturesForCommunity } from '@propertypro/shared';
import type { CommunityMembership } from '@/lib/api/community-membership';
import { ForbiddenError } from '@/lib/api/errors';
import { requirePermission } from '@/lib/db/access-control';

const WORK_ORDER_ADMIN_ROLES = new Set<CommunityRole>([
  'board_president',
  'cam',
  'site_manager',
  'property_manager_admin',
]);

const AMENITY_ADMIN_ROLES = new Set<CommunityRole>([
  'board_president',
  'cam',
  'site_manager',
  'property_manager_admin',
]);

const RESERVATION_ALLOWED_ROLES = new Set<CommunityRole>([
  'owner',
  'tenant',
  'board_president',
  'cam',
  'site_manager',
  'property_manager_admin',
]);

const RESIDENT_ROLES = new Set<CommunityRole>(['owner', 'tenant']);

export function requireWorkOrdersEnabled(membership: CommunityMembership): void {
  const features = getFeaturesForCommunity(membership.communityType);
  if (!features.hasWorkOrders) {
    throw new ForbiddenError('Work orders are not enabled for this community type');
  }
}

export function requireAmenitiesEnabled(membership: CommunityMembership): void {
  const features = getFeaturesForCommunity(membership.communityType);
  if (!features.hasAmenities) {
    throw new ForbiddenError('Amenities are not enabled for this community type');
  }
}

export function requireWorkOrdersReadPermission(membership: CommunityMembership): void {
  requirePermission(membership.role, membership.communityType, 'work_orders', 'read');
}

export function requireWorkOrdersWritePermission(membership: CommunityMembership): void {
  requirePermission(membership.role, membership.communityType, 'work_orders', 'write');
}

export function requireWorkOrderAdminWrite(membership: CommunityMembership): void {
  if (!WORK_ORDER_ADMIN_ROLES.has(membership.role)) {
    throw new ForbiddenError('Only work order administrators can perform this action');
  }
}

export function requireAmenitiesReadPermission(membership: CommunityMembership): void {
  requirePermission(membership.role, membership.communityType, 'amenities', 'read');
}

export function requireAmenitiesWritePermission(membership: CommunityMembership): void {
  requirePermission(membership.role, membership.communityType, 'amenities', 'write');
}

export function requireAmenityAdminWrite(membership: CommunityMembership): void {
  if (!AMENITY_ADMIN_ROLES.has(membership.role)) {
    throw new ForbiddenError('Only amenity administrators can perform this action');
  }
}

export function requireReservationPermission(membership: CommunityMembership): void {
  if (!RESERVATION_ALLOWED_ROLES.has(membership.role)) {
    throw new ForbiddenError('This role cannot create amenity reservations');
  }
}

export function isResidentRole(role: CommunityRole): boolean {
  return RESIDENT_ROLES.has(role);
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

export async function requireActorUnitId(
  scopedClient: ScopedClient,
  actorUserId: string,
): Promise<number> {
  const unitIds = await getActorUnitIds(scopedClient, actorUserId);
  const firstUnitId = unitIds[0];
  if (firstUnitId === undefined) {
    throw new ForbiddenError('No unit association found for this user in the selected community');
  }
  return firstUnitId;
}
