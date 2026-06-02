/**
 * Route contract for `GET /api/v1/admin/join-requests`.
 *
 * Plan A1 drain #172. Lists pending join requests for the caller's active
 * community (header-tenant resolution).
 *
 * Auth surface (preserved verbatim):
 *   requireAuthenticatedUserId
 *     → resolveEffectiveCommunityId(req, null)
 *     → requireCommunityMembership
 *     → requirePermission(membership, 'residents', 'write')
 *     → listPendingJoinRequestsForCommunity(communityId)
 *
 * No `communityId` in the contract — tenant comes from the `x-community-id`
 * header via `resolveEffectiveCommunityId(req, null)` (#107 / #146 precedent).
 *
 * Response: loose `z.array(z.unknown())` because
 * `PendingJoinRequestRow` carries `Date` fields (`createdAt`, `updatedAt`,
 * `reviewedAt`) plus an index signature; tightening would `safeParse`-fail
 * before JSON serialization (drain #14/#123 precedent).
 *
 * `permission: { resource: 'residents', action: 'write' }` matches the runtime
 * `requirePermission(membership, 'residents', 'write')` call. `residents` IS
 * in `RBAC_RESOURCES`.
 *
 * Consumer: `useAdminJoinRequests` uses `requestJson<PendingRequest[]>` — the
 * runner's `{ data: rows }` envelope is already canonical.
 */
import { defineRoute, z } from '@propertypro/api-contract';

export const adminJoinRequestsListContract = defineRoute({
  method: 'GET',
  path: '/api/v1/admin/join-requests',
  request: {},
  response: z.array(z.unknown()),
  permission: { resource: 'residents', action: 'write' },
});
