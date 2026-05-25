/**
 * Route contract for `POST /api/v1/elections/[id]/close`.
 *
 * Plan A1 drain #43. Mechanically identical to sibling drain #42
 * (elections/[id]/open) — same body schema, same 7-gate auth chain,
 * different service function (`closeElectionForCommunity`).
 *
 * Closest precedents:
 *   - Drain #32 (#442) sibling GET at
 *     `apps/web/src/app/api/v1/elections/[id]/{contract.ts,route.ts}`
 *   - Drain #39 (#443) body+params POST at
 *     `apps/web/src/app/api/v1/access-requests/[id]/approve/`
 *
 * Response intentionally typed `z.unknown()` (loose) because
 * `closeElectionForCommunity` returns an object that may include `Date`
 * fields; a tight `z.object({...})` schema would `safeParse`-fail against
 * real Date instances before `NextResponse.json` ISO-serializes them
 * (drain #14/#18/#20/#32 precedent).
 *
 * `permission: { resource: 'elections', action: 'write' }` matches the
 * runtime `requirePermission(membership, 'elections', 'write')` call.
 * `elections` IS in `RBAC_RESOURCES` (`packages/shared/src/rbac-matrix.ts`).
 *
 * Behavior change vs. pre-migration: 400 body for invalid `[id]` /
 * missing or non-numeric body `communityId` shifts to the canonical
 * `VALIDATION_ERROR` envelope. Status code unchanged at 400. Success wire
 * shape `{ data: result }` byte-identical.
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
