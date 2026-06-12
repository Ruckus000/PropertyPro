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
import type { TransitionRole, CommunityType, ManagerPermissions } from '@propertypro/shared';
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
// Static policies (extracted from RBAC_MATRIX for resident + pm_admin)
// ---------------------------------------------------------------------------

// For residents and pm_admin, we use the static RBAC matrix.
// For managers, we use the JSONB permissions.
import { RBAC_MATRIX } from '@propertypro/shared';

/**
 * Check permission for the hybrid role model (v2 + v3 transition window).
 *
 * - pm_admin / root_manager: uses the property_manager_admin row from the
 *   static RBAC matrix (the two v3 PM-tier values map onto pm_admin behavior)
 * - resident + isUnitOwner: uses the owner row from the static RBAC matrix
 * - resident + !isUnitOwner: uses the tenant row from the static RBAC matrix
 * - manager / property_manager: uses the JSONB permissions (the v3
 *   property_manager value maps onto manager behavior)
 */
export function checkPermissionV2(
  role: TransitionRole,
  communityType: CommunityType,
  resource: RbacResource,
  action: RbacAction,
  opts?: { isUnitOwner?: boolean; permissions?: ManagerPermissions },
): boolean {
  // BILINGUAL (role-v3): drop the v3 alternative at Phase 4 cleanup
  if (role === 'pm_admin' || role === 'root_manager') {
    return RBAC_MATRIX[communityType]['property_manager_admin'][resource][action];
  }
  if (role === 'resident') {
    const legacyRole = opts?.isUnitOwner ? 'owner' : 'tenant';
    return RBAC_MATRIX[communityType][legacyRole][resource][action];
  }
  // BILINGUAL (role-v3): drop the v3 alternative at Phase 4 cleanup
  if (role === 'manager' || role === 'property_manager') {
    if (!opts?.permissions) {
      // ex-pm_admin rows backfilled to property_manager carry no JSONB permissions;
      // resolve them to the uniform full-operational set (property_manager_admin matrix).
      // manager always carries permissions (chk_manager_has_permissions), so this
      // fallback only affects property_manager. Phase 4 makes this the sole path.
      return role === 'property_manager'
        ? RBAC_MATRIX[communityType]['property_manager_admin'][resource][action]
        : false;
    }
    const perm = opts.permissions.resources[resource];
    return action === 'read' ? perm.read : perm.write;
  }
  return false;
}

/** @deprecated Use checkPermissionV2. Kept for backward compatibility during migration. */
export { checkPermission } from '@propertypro/shared';

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
      permissions: membership.permissions,
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
 * NOTE: the designation arm is currently unreachable on the statutory routes,
 * because requirePermission(..., 'write') already filters to management-tier
 * (residents lack write on meetings/elections/violations). It is intentional
 * forward-looking scaffolding for a future resident-held board seat; today this
 * helper is equivalent to the isAdmin check it replaces (behavior-neutral).
 */
export function requireBoardDesignation(membership: CommunityMembership): void {
  if (!(membership.isAdmin || membership.designation != null)) {
    throw new ForbiddenError('This action is restricted to the board.');
  }
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
          permissions: membership.permissions,
        },
      ),
      write: checkPermissionV2(
        membership.role,
        membership.communityType,
        resource,
        'write',
        {
          isUnitOwner: membership.isUnitOwner,
          permissions: membership.permissions,
        },
      ),
    };
    return acc;
  }, {} as ResourceAccessMap);
}
