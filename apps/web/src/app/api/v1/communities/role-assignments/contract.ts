/**
 * Route contracts for `POST /api/v1/communities/role-assignments` and
 * `DELETE /api/v1/communities/role-assignments` (role-v3 Phase 2c).
 *
 * The root_manager assigns or revokes the property_manager role within their
 * community. Authorization is the explicit root-identity check in the handler.
 *
 * NO `permission` field: 'roles' is NOT in RBAC_RESOURCES until Phase 3
 * (declaring `roles:write` fails the contract suite). The runtime gate is the
 * explicit root-identity check in the handler.
 *
 * NOTE: DELETE uses `tenantScope: { in: 'body' }` — the runner correctly
 * passes the JSON body for DELETE requests so communityId resolves from body.
 * The route test confirms this by sending a DELETE with a JSON body and
 * asserting that communityId + userId resolve correctly.
 */
import { defineRoute, z } from '@propertypro/api-contract';

const bodySchema = z.object({
  communityId: z.number().int().positive(),
  userId: z.string().uuid(),
});

export const assignRoleContract = defineRoute({
  method: 'POST',
  path: '/api/v1/communities/role-assignments',
  request: { body: bodySchema },
  response: z.unknown(),
  tenantScope: { in: 'body' },
});

export const revokeRoleContract = defineRoute({
  method: 'DELETE',
  path: '/api/v1/communities/role-assignments',
  request: { body: bodySchema },
  response: z.unknown(),
  tenantScope: { in: 'body' },
});
