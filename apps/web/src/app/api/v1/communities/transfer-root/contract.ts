/**
 * Route contract for `POST /api/v1/communities/transfer-root` (role-v3 Phase
 * 2b). The current root transfers root to another property_manager of the
 * community. UI lands in Plan 2c.
 *
 * NO `permission` field: 'roles' is NOT in RBAC_RESOURCES until Phase 3
 * (declaring `roles:write` fails the contract suite). The runtime gate is the
 * explicit root-identity check in the handler.
 */
import { defineRoute, z } from '@propertypro/api-contract';

const transferRootBodySchema = z.object({
  communityId: z.number().int().positive(),
  toUserId: z.string().uuid(),
});

export const transferRootContract = defineRoute({
  method: 'POST',
  path: '/api/v1/communities/transfer-root',
  request: {
    body: transferRootBodySchema,
  },
  response: z.unknown(),
  tenantScope: { in: 'body' },
});
