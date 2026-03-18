import type { NewCommunityRole } from '@propertypro/shared';
import { getFeaturesForCommunity } from '@propertypro/shared';
import type { CommunityMembership } from '@/lib/api/community-membership';
import { ForbiddenError } from '@/lib/api/errors';
import { requirePermission } from '@/lib/db/access-control';

// Re-export from canonical source (M1 deduplication)
export { getActorUnitIds, requireActorUnitId } from '@/lib/units/actor-units';

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
  requirePermission(membership, 'work_orders', 'read');
}

export function requireWorkOrdersWritePermission(membership: CommunityMembership): void {
  requirePermission(membership, 'work_orders', 'write');
}

export function requireWorkOrderAdminWrite(membership: CommunityMembership): void {
  if (!membership.isAdmin) {
    throw new ForbiddenError('Only work order administrators can perform this action');
  }
}

export function requireAmenitiesReadPermission(membership: CommunityMembership): void {
  requirePermission(membership, 'amenities', 'read');
}

export function requireAmenitiesWritePermission(membership: CommunityMembership): void {
  requirePermission(membership, 'amenities', 'write');
}

export function requireAmenityAdminWrite(membership: CommunityMembership): void {
  if (!membership.isAdmin) {
    throw new ForbiddenError('Only amenity administrators can perform this action');
  }
}

export function requireReservationPermission(_membership: CommunityMembership): void {
  // All roles (resident, manager, pm_admin) can make amenity reservations.
  // This guard is retained for call-site compatibility.
}

export function isResidentRole(role: NewCommunityRole): boolean {
  return role === 'resident';
}

