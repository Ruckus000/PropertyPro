/**
 * Route contract for `GET /api/v1/communities/my-rootless` (role-v3 Phase 2b).
 *
 * The single read source behind the claim-root banner (count > 0) and the
 * aggregated claim screen: the communities where the caller holds
 * `property_manager` and no `root_manager` exists yet.
 *
 * NO `permission` field: 'roles' is NOT in RBAC_RESOURCES until Phase 3, and the
 * contract suite asserts every declared permission is in the matrix — declaring
 * `roles:read` would FAIL CI. The runtime gate is `requireAuthenticatedUserId`;
 * the result is self-scoped to the caller's own property_manager memberships.
 *
 * NO `tenantScope`: cross-community by the caller's userId — there is no single
 * authoritative tenant id. `guard:tenant-scope` tolerates a tenantScope-less
 * route (api-patterns.md).
 */
import { defineRoute, z } from '@propertypro/api-contract';

export const myRootlessContract = defineRoute({
  method: 'GET',
  path: '/api/v1/communities/my-rootless',
  request: {},
  response: z.unknown(),
});
