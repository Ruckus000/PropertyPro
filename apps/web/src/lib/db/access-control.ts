/**
 * App-layer access-control re-exports from @propertypro/shared.
 *
 * Provides a canonical import path for route handlers and tests.
 * The RBAC matrix, role sets, and checker functions are all defined
 * in the shared package; this module re-exports them for convenience.
 */

export {
  RBAC_MATRIX,
  RBAC_RESOURCES,
  ADMIN_ROLES,
  ELEVATED_DOCUMENT_ROLES,
  RESIDENT_ROLES,
  canAccessResource,
  getAccessLevel,
  isRoleValidForCommunity,
} from '@propertypro/shared';

export type {
  RbacResource,
  AccessLevel,
  ResourceAccessMap,
  RoleAccessMap,
  RbacMatrix,
} from '@propertypro/shared';
