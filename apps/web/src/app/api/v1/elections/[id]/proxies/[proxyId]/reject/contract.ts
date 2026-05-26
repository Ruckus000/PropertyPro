/**
 * Route contract for `POST /api/v1/elections/[id]/proxies/[proxyId]/reject`.
 *
 * Plan A1 drain #48. **EXACT MIRROR of drain #47** (proxies/[proxyId]/approve,
 * PR #451) — two-param route, 7-gate auth + admin role, body `{communityId}`,
 * 5-arg service. Only difference: service is `rejectElectionProxyForCommunity`
 * instead of `approveElectionProxyForCommunity`.
 *
 * Both `id` (election id) and `proxyId` (proxy id) are Zod-coerced from URL
 * path segments via `z.coerce.number().int().positive()`.
 *
 * Auth surface (preserved verbatim from pre-migration handler):
 *   requireAuthenticatedUserId
 *     → resolveEffectiveCommunityId(req, body.communityId)
 *     → assertNotDemoGrace
 *     → requireCommunityMembership
 *     → requireElectionsEnabled (sync — NOT awaited)
 *     → requirePermission('elections', 'write')
 *     → requireElectionsAdminRole
 *     → rejectElectionProxyForCommunity(
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
 * `rejectElectionProxyForCommunity` returns a service value that may carry
 * `Date` fields; a tight `z.object({...})` schema would `safeParse`-fail
 * against real Date instances before `NextResponse.json` ISO-serializes them
 * (drain #14/#18/#20/#32/#42/#47 precedent).
 *
 * `permission: { resource: 'elections', action: 'write' }` matches the
 * runtime `requirePermission(membership, 'elections', 'write')` call.
 * `elections` IS in `RBAC_RESOURCES` (`packages/shared/src/rbac-matrix.ts`).
 *
 * Behavior change vs. pre-migration: 400 body for invalid `[id]`/`[proxyId]`
 * and body validation failures (`ValidationError('Invalid proxy rejection
 * payload')`) shifts to the canonical `VALIDATION_ERROR` envelope. Status
 * code unchanged at 400.
 */
import { defineRoute, z } from '@propertypro/api-contract';

export const electionsProxiesRejectContract = defineRoute({
  method: 'POST',
  path: '/api/v1/elections/[id]/proxies/[proxyId]/reject',
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
