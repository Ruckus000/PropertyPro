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
import type { NewCommunityRole, CommunityType, ManagerPermissions } from '@propertypro/shared';
import type { RbacResource, RbacAction } from '@propertypro/shared';
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
 * Check permission for the hybrid 4-role model.
 *
 * - pm_admin: uses the property_manager_admin row from the static RBAC matrix
 * - resident + isUnitOwner: uses the owner row from the static RBAC matrix
 * - resident + !isUnitOwner: uses the tenant row from the static RBAC matrix
 * - manager: uses the JSONB permissions
 */
export function checkPermissionV2(
  role: NewCommunityRole,
  communityType: CommunityType,
  resource: RbacResource,
  action: RbacAction,
  opts?: { isUnitOwner?: boolean; permissions?: ManagerPermissions },
): boolean {
  if (role === 'pm_admin') {
    return RBAC_MATRIX[communityType]['property_manager_admin'][resource][action];
  }
  if (role === 'resident') {
    const legacyRole = opts?.isUnitOwner ? 'owner' : 'tenant';
    return RBAC_MATRIX[communityType][legacyRole][resource][action];
  }
  if (role === 'manager') {
    if (!opts?.permissions) return false;
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
