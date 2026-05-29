/**
 * Route contracts for `POST` and `DELETE /api/v1/communities/delete`.
 *
 * Plan A1 drain #158. Community admin requests or cancels community deletion.
 * Tenant from `x-community-id` header via `resolveEffectiveCommunityId(req, null)`.
 *
 * POST response is `z.unknown()` — `requestCommunityDeletion` returns a DB row
 * with Date fields (`coolingEndsAt`, etc.).
 *
 * `permission: { resource: 'settings', action: 'write' }` documents intent;
 * the runner does not enforce it — `requirePermission(membership, 'settings', 'write')`
 * is the real gate.
 */
import { defineRoute, z } from '@propertypro/api-contract';

export const communityDeletePostContract = defineRoute({
  method: 'POST',
  path: '/api/v1/communities/delete',
  request: {},
  response: z.unknown(),
  permission: { resource: 'settings', action: 'write' },
});

export const communityDeleteDeleteContract = defineRoute({
  method: 'DELETE',
  path: '/api/v1/communities/delete',
  request: {},
  response: z.object({
    cancelled: z.literal(true),
  }),
  permission: { resource: 'settings', action: 'write' },
});
