/**
 * GET /api/v1/help/views — list of viewed help-article slugs for the current
 * caller within the given community.
 *
 * Query: { communityId }. No body. No params.
 *
 * Auth chain (3 gates): requireAuthenticatedUserId → resolveEffectiveCommunityId
 * → requireCommunityMembership → listViewedArticleSlugs(communityId, userId).
 *
 * Response modeling: loose z.unknown(). `listViewedArticleSlugs` returns
 * `string[]`; the wire envelope wraps it as `{ data: { slugs } }`. Modeled
 * loose for forward-compat with future shape additions and to match the
 * bundle's other help routes.
 *
 * `permission` is OMITTED — 'help' is NOT in RBAC_RESOURCES
 * (packages/shared/src/rbac-matrix.ts). The only authz is plain community
 * membership, enforced by `requireCommunityMembership` in the handler.
 *
 * Closest precedent: drain #20 (PR #428) — `/api/v1/esign/my-pending`,
 * query-only GET; drain #25 (Move 1) — `/api/v1/payments/history`,
 * query-only with broader auth chain.
 */
import { defineRoute, z } from '@propertypro/api-contract';

export const helpViewsGetContract = defineRoute({
  method: 'GET',
  path: '/api/v1/help/views',
  request: {
    query: z.object({ communityId: z.coerce.number().int().positive() }),
  },
  response: z.unknown(),
});
