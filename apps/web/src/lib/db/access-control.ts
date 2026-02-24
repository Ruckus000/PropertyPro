/**
 * RBAC enforcement utilities for API route handlers.
 *
 * checkPermission() is a pure policy query from @propertypro/shared.
 * requirePermission() wraps it as a throwing guard for use in route handlers.
 *
 * Usage in a route handler:
 *   const membership = await requireCommunityMembership(communityId, userId);
 *   requirePermission(membership.role, membership.communityType, 'meetings', 'write');
 *
 * Note: this file does NOT import from @propertypro/db — it is a pure
 * authorization layer. The path apps/web/src/lib/db/ is the spec-required
 * location; the file itself has no database access.
 */
import type { CommunityRole, CommunityType } from '@propertypro/shared';
import {
  checkPermission,
  type RbacResource,
  type RbacAction,
} from '@propertypro/shared';
import { ForbiddenError } from '@/lib/api/errors';

export {
  checkPermission,
  RBAC_MATRIX,
  RBAC_RESOURCES,
  RBAC_ACTIONS,
  type RbacResource,
  type RbacAction,
} from '@propertypro/shared';

/**
 * Throws ForbiddenError (403) if the role is not permitted to perform
 * the action on the resource within the given community type.
 *
 * Replaces scattered local ADMIN_ROLES set checks in individual route files.
 */
export function requirePermission(
  role: CommunityRole,
  communityType: CommunityType,
  resource: RbacResource,
  action: RbacAction,
): void {
  if (!checkPermission(role, communityType, resource, action)) {
    throw new ForbiddenError(
      `Role '${role}' is not permitted to ${action} ${resource}`,
    );
  }
}
