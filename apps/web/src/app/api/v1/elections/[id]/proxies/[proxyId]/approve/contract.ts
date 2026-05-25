/**
 * Route contract for `POST /api/v1/elections/[id]/proxies/[proxyId]/approve`.
 *
 * Plan A1 drain #47. **FIRST two-param route in the contract corpus** —
 * both `id` (election id) and `proxyId` (proxy id) are Zod-coerced from
 * URL path segments via `z.coerce.number().int().positive()`.
 *
 * Sibling precedents:
 *  - drain #42 (`POST /api/v1/elections/[id]/open`, PR #446) — single-param
 *    version with the same 7-gate auth chain and `elections.write` permission.
 *  - Move 5 sibling drains (#42-44) — same auth gates and same body shape.
 *
 * Auth surface (preserved verbatim from pre-migration handler):
 *   requireAuthenticatedUserId
 *     → resolveEffectiveCommunityId(req, body.communityId)
 *     → assertNotDemoGrace
 *     → requireCommunityMembership
 *     → requireElectionsEnabled (sync — NOT awaited)
 *     → requirePermission('elections', 'write')
 *     → requireElectionsAdminRole
 *     → approveElectionProxyForCommunity(
 *         communityId, electionId, proxyId, actorUserId, x-request-id,
 *       )
 *
 * `parseCommunityIdFromBody(req, parsed.data.communityId)` (which validated
 * then delegated to `resolveEffectiveCommunityId`) is now expressed as Zod
 * body validation + an explicit `resolveEffectiveCommunityId(req, body.communityId)`
 * call inside the handler. Both `parsePositiveInt(...)` calls for `id` and
 * `proxyId` are now expressed via Zod params coercion.
 *
 * Response intentionally typed `z.unknown()` (loose) because
 * `approveElectionProxyForCommunity` returns a service value that may carry
 * `Date` fields; a tight `z.object({...})` schema would `safeParse`-fail
 * against real Date instances before `NextResponse.json` ISO-serializes them
 * (drain #14/#18/#20/#32/#42 precedent).
 *
 * `permission: { resource: 'elections', action: 'write' }` matches the
 * runtime `requirePermission(membership, 'elections', 'write')` call.
 * `elections` IS in `RBAC_RESOURCES` (`packages/shared/src/rbac-matrix.ts`).
 *
 * Behavior change vs. pre-migration: 400 body for invalid `[id]`/`[proxyId]`
 * and body validation failures (`ValidationError('Invalid proxy approval
 * payload')`) shifts to the canonical `VALIDATION_ERROR` envelope. Status
 * code unchanged at 400.
 */
import { defineRoute, z } from '@propertypro/api-contract';

export const electionsProxiesApproveContract = defineRoute({
  method: 'POST',
  path: '/api/v1/elections/[id]/proxies/[proxyId]/approve',
  request: {
    params: z.object({
      id: z.coerce.number().int().positive(),
      proxyId: z.coerce.number().int().positive(),
    }),
    body: z.object({
      communityId: z.number().int().positive(),
    }),
  },
  response: z.unknown(),
  permission: { resource: 'elections', action: 'write' },
});
