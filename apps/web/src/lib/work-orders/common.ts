import type { TransitionRole } from '@propertypro/shared';
import { getEffectiveFeatures } from '@propertypro/shared';
import type { CommunityMembership } from '@/lib/api/community-membership';
import { ForbiddenError } from '@/lib/api/errors';
import { requirePermission } from '@/lib/db/access-control';
import { resolvePlanIdWithTelemetry } from '@/lib/telemetry/plan-resolution';

// Re-export from canonical source (M1 deduplication)
export { getActorUnitIds, requireActorUnitId } from '@/lib/units/actor-units';

export function requireWorkOrdersEnabled(membership: CommunityMembership): void {
  const features = getEffectiveFeatures(
    membership.communityType,
    resolvePlanIdWithTelemetry(membership.subscriptionPlan, {
      site: 'work-orders:requireWorkOrdersEnabled',
      communityId: membership.communityId,
    }),
  );
  if (!features.hasWorkOrders) {
    throw new ForbiddenError('Work orders are not enabled for this community or plan');
  }
}

export function requireAmenitiesEnabled(membership: CommunityMembership): void {
  const features = getEffectiveFeatures(
    membership.communityType,
    resolvePlanIdWithTelemetry(membership.subscriptionPlan, {
      site: 'work-orders:requireAmenitiesEnabled',
      communityId: membership.communityId,
    }),
  );
  if (!features.hasAmenities) {
    throw new ForbiddenError('Amenities are not enabled for this community or plan');
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

export function isResidentRole(role: TransitionRole): boolean {
  return role === 'resident';
}

