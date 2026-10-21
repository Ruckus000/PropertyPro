/**
 * Route contract for `POST /api/v1/elections/[id]/open`.
 *
 * Auth surface:
 *   requireAuthenticatedUserId
 *     → resolveEffectiveCommunityId(req, body.communityId)
 *     → assertNotDemoGrace
 *     → requireCommunityMembership
 *     → requireElectionsEnabled (awaited: type, attorney review, plan)
 *     → requirePermission('elections', 'write')
 *     → requireElectionsAdminRole
 *     → openElectionForCommunity(communityId, electionId, actorUserId, x-request-id)
 *
 * Response intentionally typed `z.unknown()` (loose) because
 * `openElectionForCommunity` returns a service value that may carry `Date`
 * fields; a tight `z.object({...})` schema would `safeParse`-fail against
 * real Date instances before `NextResponse.json` ISO-serializes them.
 *
 * `permission: { resource: 'elections', action: 'write' }` matches the
 * runtime `requirePermission(membership, 'elections', 'write')` call.
 * `elections` IS in `RBAC_RESOURCES` (`packages/shared/src/rbac-matrix.ts`).
 */
import { defineRoute, z } from '@propertypro/api-contract';

export const electionsOpenContract = defineRoute({
  method: 'POST',
  path: '/api/v1/elections/[id]/open',
  request: {
    params: z.object({
      id: z.coerce.number().int().positive(),
    }),
    body: z.object({
      communityId: z.number().int().positive(),
    }),
  },
  response: z.unknown(),
  permission: { resource: 'elections', action: 'write' },
});
