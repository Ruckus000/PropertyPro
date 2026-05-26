/**
 * Route contract for `POST /api/v1/elections/[id]/proxies/[proxyId]/revoke`.
 *
 * Plan A1 drain #49. Two-param route (same shape as drains #47/#48 approve/
 * reject) with `id` (election id) and `proxyId` (proxy id) both Zod-coerced
 * from URL path segments via `z.coerce.number().int().positive()`.
 *
 * Sibling precedents:
 *  - drain #47 (`POST /api/v1/elections/[id]/proxies/[proxyId]/approve`,
 *    PR #451) — same two-param shape and same `elections.write` permission.
 *  - drain #48 (`POST /api/v1/elections/[id]/proxies/[proxyId]/reject`).
 *
 * **Divergence from drains #47/#48**: this route has NO admin role gate
 * (`requireElectionsAdminRole` is NOT called). Non-admins can revoke
 * their own proxy. Instead, `revokeElectionProxyForCommunity` takes a
 * 6th arg `actorIsAdmin: boolean` derived from `membership.isAdmin`
 * and applies the appropriate ownership-vs-admin logic internally.
 *
 * Auth surface (preserved verbatim from pre-migration handler):
 *   requireAuthenticatedUserId
 *     → resolveEffectiveCommunityId(req, body.communityId)
 *     → assertNotDemoGrace
 *     → requireCommunityMembership
 *     → requireElectionsEnabled (sync — NOT awaited)
 *     → requirePermission('elections', 'write')
 *     → revokeElectionProxyForCommunity(
 *         communityId, electionId, proxyId, actorUserId,
 *         membership.isAdmin, x-request-id,
 *       )
 *
 * `parseCommunityIdFromBody(req, parsed.data.communityId)` (which validated
 * then delegated to `resolveEffectiveCommunityId`) is now expressed as Zod
 * body validation + an explicit `resolveEffectiveCommunityId(req, body.communityId)`
 * call inside the handler. Both `parsePositiveInt(...)` calls for `id` and
 * `proxyId` are now expressed via Zod params coercion.
 *
 * Response intentionally typed `z.unknown()` (loose) because
 * `revokeElectionProxyForCommunity` returns a service value that may carry
 * `Date` fields; a tight `z.object({...})` schema would `safeParse`-fail
 * against real Date instances before `NextResponse.json` ISO-serializes them
 * (drain #14/#18/#20/#32/#42/#47 precedent).
 *
 * `permission: { resource: 'elections', action: 'write' }` matches the
 * runtime `requirePermission(membership, 'elections', 'write')` call.
 * `elections` IS in `RBAC_RESOURCES` (`packages/shared/src/rbac-matrix.ts`).
 *
 * Behavior change vs. pre-migration: 400 body for invalid `[id]`/`[proxyId]`
 * and body validation failures (`ValidationError('Invalid proxy revoke
 * payload')`) shifts to the canonical `VALIDATION_ERROR` envelope. Status
 * code unchanged at 400.
 */
import { defineRoute, z } from '@propertypro/api-contract';

export const electionsProxiesRevokeContract = defineRoute({
  method: 'POST',
  path: '/api/v1/elections/[id]/proxies/[proxyId]/revoke',
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
