/**
 * Route contract for `POST /api/v1/elections/[id]/open`.
 *
 * Plan A1 drain #42. Sibling precedents:
 *  - drain #32 (`GET /api/v1/elections/[id]`, PR #442) — same `elections`
 *    resource + `requireElectionsEnabled` (sync) gate; this drain swaps
 *    `read` for `write` and adds the demo-grace + admin-role gates.
 *  - drain #39 (`POST /api/v1/access-requests/[id]/approve`, PR #443) —
 *    canonical body+params POST shape used here.
 *
 * Auth surface (preserved verbatim from pre-migration handler):
 *   requireAuthenticatedUserId
 *     → resolveEffectiveCommunityId(req, body.communityId)
 *     → assertNotDemoGrace
 *     → requireCommunityMembership
 *     → requireElectionsEnabled (sync — NOT awaited)
 *     → requirePermission('elections', 'write')
 *     → requireElectionsAdminRole
 *     → openElectionForCommunity(communityId, electionId, actorUserId, x-request-id)
 *
 * `parseCommunityIdFromBody(req, parsed.data.communityId)` (which validated
 * then delegated to `resolveEffectiveCommunityId`) is now expressed as Zod
 * body validation + an explicit `resolveEffectiveCommunityId(req, body.communityId)`
 * call inside the handler. `parsePositiveInt('election id')` is now expressed
 * via Zod params coercion (`z.coerce.number().int().positive()`).
 *
 * Response intentionally typed `z.unknown()` (loose) because
 * `openElectionForCommunity` returns a service value that may carry `Date`
 * fields; a tight `z.object({...})` schema would `safeParse`-fail against
 * real Date instances before `NextResponse.json` ISO-serializes them
 * (drain #14/#18/#20/#32 precedent).
 *
 * `permission: { resource: 'elections', action: 'write' }` matches the
 * runtime `requirePermission(membership, 'elections', 'write')` call.
 * `elections` IS in `RBAC_RESOURCES` (`packages/shared/src/rbac-matrix.ts`).
 *
 * Behavior change vs. pre-migration: 400 body for invalid `[id]` and body
 * validation failures (`ValidationError('Invalid election open payload')`)
 * shifts to the canonical `VALIDATION_ERROR` envelope. Status code
 * unchanged at 400.
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
