/**
 * Route contract for `GET /api/v1/search` — aggregated command-palette search.
 *
 * Plan A1 auto-drain. Fans a single query out across every search group the
 * caller can access (`searchAccessibleGroups`) and returns one aggregated
 * envelope.
 *
 * Auth chain preserved verbatim from the pre-migration handler:
 *   requireAuthenticatedUserId
 *     → resolveEffectiveCommunityId(req, query.communityId ?? null)
 *     → requireCommunityMembership
 *     → searchAccessibleGroups(communityId, membership, query, limit)
 *
 * This route has NO `requirePermission` gate — per-group access is enforced
 * inside `searchAccessibleGroups` (each group checks its own resource read
 * permission + feature flag + admin-only flag). The route only requires
 * authenticated community membership. `permission` metadata is therefore
 * intentionally omitted (it is optional on the contract).
 *
 * Query schema mirrors the drained sibling search routes
 * (`/api/v1/search/residents`, `/meetings`, etc.):
 *   - `q`: optional string (trimmed in-handler; empty → '')
 *   - `limit`: optional coerced int, range-validated to [1, 20] by the schema
 *     (default 3 applied in-handler)
 *   - `communityId`: optional coerced positive int; `?? null` in-handler so
 *     `resolveEffectiveCommunityId` falls back to the header tenant.
 *
 * Behavior change vs. pre-migration: the old handler used
 * `Number(searchParams.get('communityId')) || null`, which silently coerced a
 * non-numeric / zero / negative `communityId` to `null` (header fallback).
 * The Zod `z.coerce.number().int().positive().optional()` now rejects a
 * malformed non-empty `communityId` with a 400 `VALIDATION_ERROR`. An absent
 * or empty `communityId` still collapses to `undefined` (the runner maps
 * empty-string query params to `undefined`) → `?? null` → header fallback,
 * matching the prior behavior. The old in-handler `limit` clamp
 * (`Math.min(Math.max(..., 1), 20)`) is dropped in favor of the schema's
 * `min(1).max(20)`: out-of-range values now 400 the same way the sibling
 * routes do, and the handler only applies the default of 3.
 *
 * Response intentionally typed `z.unknown()` (loose). The aggregated payload
 * embeds per-group `results` rows whose shape is `{ [key: string]: unknown }`
 * and may carry `Date`-valued service fields; a tight `z.object({...})` schema
 * would `safeParse`-fail against real `Date` instances before
 * `NextResponse.json` ISO-serializes them (drain #14/#18/#58 precedent).
 *
 * Envelope migration: the pre-migration handler returned the bare
 * `AggregatedSearchResponse` object (`{ requestId, communityId, partial,
 * groups }`). The runner wraps it as `{ data: { ... } }`. The consumer hook
 * `use-data-search` is updated to unwrap `.data` manually.
 */
import { defineRoute, z } from '@propertypro/api-contract';

export const aggregatedSearchContract = defineRoute({
  method: 'GET',
  path: '/api/v1/search',
  request: {
    query: z.object({
      q: z.string().optional(),
      limit: z.coerce.number().int().min(1).max(20).optional(),
      communityId: z.coerce.number().int().positive().optional(),
    }),
  },
  response: z.unknown(),
});
