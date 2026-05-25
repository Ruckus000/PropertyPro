/**
 * GET /api/v1/user/communities — count of communities the authenticated user
 * belongs to. Used by the ProfileMenu community switcher.
 *
 * No params, no query, no body — this is the FIRST drain in the corpus
 * with no community scoping at all. The auth chain is just
 * `requireAuthenticatedUserId → countCommunitiesForUser`; there is no
 * `requireCommunityMembership` because the response is intentionally
 * cross-tenant (a count across every community the user is a member of).
 *
 * Response modeling: TIGHT — `countCommunitiesForUser` returns a plain
 * non-negative integer; no Date fields or index signatures to worry about
 * (drain #9/#14 lesson does not apply).
 *
 * `permission` is OMITTED: there is no RBAC matrix entry that fits
 * cross-tenant user lookups, and no per-community gate runs. The route's
 * sole authz contract is "authenticated user," which the handler enforces
 * directly via `requireAuthenticatedUserId`.
 *
 * Closest precedent: drain #20 (#428) — `/api/v1/esign/my-pending`
 * query-only GET. This drain is simpler still (no query schema).
 */
import { defineRoute, z } from '@propertypro/api-contract';

export const userCommunitiesGetContract = defineRoute({
  method: 'GET',
  path: '/api/v1/user/communities',
  request: {},
  response: z.object({ count: z.number().int().nonnegative() }),
});
