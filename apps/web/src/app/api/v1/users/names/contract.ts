/**
 * Route contract for `GET /api/v1/users/names`.
 *
 * Bulk display-name resolver. Used by board/forum and elections UX to
 * render names for a batch of `userId`s without an N+1 fetch.
 *
 * Plan A1 drain (post-pilot drain #2). The non-paginated response is a
 * `Record<userId, displayName>` map, declared via `z.record(...)` rather
 * than `z.array(...)` — the runner wraps it as `{ data: { uuid: name } }`
 * (single-wrap, not double-wrap).
 *
 * Authorization: requires community membership (`requireCommunityMembership`
 * in `./route.ts`). Not gated by the RBAC matrix — any member can resolve
 * any other member's display name within their own community. Placeholder
 * `permission: { resource: 'residents', action: 'read' }` records the
 * closest semantic match in `RBAC_RESOURCES`; the contract runner does NOT
 * enforce this today (Plan A1 metadata only).
 */
import { defineRoute, z } from '@propertypro/api-contract';

/**
 * Query shape. `ids` arrives as a comma-separated list of UUIDs in a
 * single query string param (e.g. `?ids=a,b,c`); Zod's `transform()` +
 * `pipe()` split / trim / drop-empty / validate-as-UUID, then constrain
 * the resulting array to 1-50 entries. The schema does NOT deduplicate
 * — duplicates count against the `.max(50)` cap, and the
 * `resolveUserDisplayNames` service deduplicates internally before
 * hitting the DB. The hard cap matches the prior implementation.
 */
const userNamesQuerySchema = z.object({
  communityId: z.coerce.number().int().positive(),
  ids: z
    .string()
    .trim()
    .min(1)
    .transform((value) =>
      value
        .split(',')
        .map((entry) => entry.trim())
        .filter(Boolean),
    )
    .pipe(z.array(z.string().uuid()).min(1).max(50)),
});

/**
 * Response shape: `{ <uuid>: <display-name>, ... }`. Keys are typed as
 * `z.string()` (not `z.string().uuid()`) so the contract's response
 * validation never rejects a valid Map<string,string> that happens to have
 * a key Zod considers malformed. Validation discipline is on the *route*
 * side via the query schema; the response is a deterministic projection
 * of inputs we already validated.
 */
export const userNamesContract = defineRoute({
  method: 'GET',
  path: '/api/v1/users/names',
  request: {
    query: userNamesQuerySchema,
  },
  response: z.record(z.string(), z.string()),
  permission: { resource: 'residents', action: 'read' },
});
