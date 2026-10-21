/**
 * Route contract for `POST /api/v1/elections/[id]/close`.
 *
 * Mechanically identical to its sibling `elections/[id]/open` — same body
 * schema, same 7-gate auth chain, different service function
 * (`closeElectionForCommunity`).
 *
 * Response intentionally typed `z.unknown()` (loose) because
 * `closeElectionForCommunity` returns an object that may include `Date`
 * fields; a tight `z.object({...})` schema would `safeParse`-fail against
 * real Date instances before `NextResponse.json` ISO-serializes them.
 *
 * `permission: { resource: 'elections', action: 'write' }` matches the
 * runtime `requirePermission(membership, 'elections', 'write')` call.
 * `elections` IS in `RBAC_RESOURCES` (`packages/shared/src/rbac-matrix.ts`).
 */
import { defineRoute, z } from '@propertypro/api-contract';

const paramsSchema = z.object({
  id: z.coerce.number().int().positive(),
});

const bodySchema = z.object({
  communityId: z.number().int().positive(),
});

export const electionsCloseContract = defineRoute({
  method: 'POST',
  path: '/api/v1/elections/[id]/close',
  request: { params: paramsSchema, body: bodySchema },
  response: z.unknown(),
  permission: { resource: 'elections', action: 'write' },
});
