/**
 * RBAC enforcement utilities for API route handlers.
 *
 * checkPermissionV2() is the new policy query supporting the hybrid 4-role model.
 * requirePermission() wraps it as a throwing guard for use in route handlers.
 *
 * Usage in a route handler:
 *   const membership = await requireCommunityMembership(communityId, userId);
 *   requirePermission(membership, 'meetings', 'write');
 *
 * Note: this file does NOT import from @propertypro/db — it is a pure
 * authorization layer. The path apps/web/src/lib/db/ is the spec-required
 * location; the file itself has no database access.
 */
import { hasBoardDesignation, type CommunityRole, type CommunityType } from '@propertypro/shared';
import { RBAC_RESOURCES, type RbacResource, type RbacAction } from '@propertypro/shared';
import { ForbiddenError } from '@/lib/api/errors';
import type { CommunityMembership } from '@/lib/api/community-membership';

// Re-export for consumers
export {
  RBAC_MATRIX,
  RBAC_RESOURCES,
  RBAC_ACTIONS,
  type RbacResource,
  type RbacAction,
} from '@propertypro/shared';

// ---------------------------------------------------------------------------
// Static policies (extracted from RBAC_MATRIX for resident + property_manager)
// ---------------------------------------------------------------------------

import { RBAC_MATRIX } from '@propertypro/shared';

/**
 * Check permission for the v3 role model.
 *
 * - property_manager / root_manager: uniform full-operational — both resolve
 *   the manager row from the static RBAC matrix
 * - resident + isUnitOwner: uses the owner row from the static RBAC matrix
 * - resident + !isUnitOwner: uses the tenant row from the static RBAC matrix
 */
export function checkPermissionV2(
  role: CommunityRole,
  communityType: CommunityType,
  resource: RbacResource,
  action: RbacAction,
  opts?: { isUnitOwner?: boolean },
): boolean {
  if (role === 'resident') {
    const legacyRole = opts?.isUnitOwner ? 'owner' : 'tenant';
    return RBAC_MATRIX[communityType][legacyRole][resource][action];
  }
  // property_manager + root_manager: uniform full-operational
  return RBAC_MATRIX[communityType]['manager'][resource][action];
}

/**
 * Throws ForbiddenError (403) if the membership is not permitted to perform
 * the action on the resource.
 *
 * Accepts a CommunityMembership object (from requireCommunityMembership).
 */
export function requirePermission(
  membership: CommunityMembership,
  resource: RbacResource,
  action: RbacAction,
): void {
  const allowed = checkPermissionV2(
    membership.role,
    membership.communityType,
    resource,
    action,
    {
      isUnitOwner: membership.isUnitOwner,
    },
  );
  if (!allowed) {
    throw new ForbiddenError(
      `Role '${membership.role}' is not permitted to ${action} ${resource}`,
    );
  }
}

/**
 * Statutory board-action gate (role-v3 §3.2). Passes for management-tier callers
 * (property_manager / root_manager == membership.isAdmin) OR any holder of a board
 * designation. Apply as a SECOND gate AFTER requirePermission(resource, action) on
 * statutory routes only — general permissions still come from the role.
 *
 * Who passes, per route family (matrix in packages/shared/src/rbac-matrix.ts):
 *   - meetings: residents lack `meetings:write`, so requirePermission already
 *     filters to the management tier and the designation arm never fires here.
 *   - elections / violations (via requireElectionsAdminRole /
 *     requireViolationAdminWrite): owners AND tenants hold `write`, so the
 *     designation arm IS live — any board-designated resident passes, including
 *     a non-owner. That is deliberate: setDesignation requires an explicit
 *     `acknowledgeNonOwner` to seat a non-owner (role-management-service.ts),
 *     and apps/web/__tests__/lib/statutory-gates.test.ts pins it.
 * Managers lose their designation on promotion, so in practice the arm admits
 * resident board members only.
 */
export function requireBoardDesignation(membership: CommunityMembership): void {
  if (!canActAsBoard(membership)) {
    throw new ForbiddenError('This action is restricted to the board.');
  }
}

/**
 * The predicate behind requireBoardDesignation, for pages that show the
 * matching controls (ADR-006 §2a) — one rule, so the UI never offers an action
 * the API refuses, or hides one it allows.
 */
export function canActAsBoard(membership: Pick<CommunityMembership, 'isAdmin' | 'designation'>): boolean {
  return membership.isAdmin || hasBoardDesignation(membership.designation);
}

export type ResourceAccessMap = Record<RbacResource, Record<RbacAction, boolean>>;

export function getMembershipResourceAccess(
  membership: CommunityMembership,
): ResourceAccessMap {
  return RBAC_RESOURCES.reduce<ResourceAccessMap>((acc, resource) => {
    acc[resource] = {
      read: checkPermissionV2(
        membership.role,
        membership.communityType,
        resource,
        'read',
        {
          isUnitOwner: membership.isUnitOwner,
        },
      ),
      write: checkPermissionV2(
        membership.role,
        membership.communityType,
        resource,
        'write',
        {
          isUnitOwner: membership.isUnitOwner,
        },
      ),
    };
    return acc;
  }, {} as ResourceAccessMap);
}
