/**
 * Route contracts for `GET` and `POST /api/v1/maintenance-requests`.
 *
 * CON-05 (Phase 3.5) drain — the first of the three legacy action-dispatch
 * CRUD routes. Unlike announcements / meetings, this route has no
 * envelope-sibling: both verbs already emitted the canonical envelopes, so the
 * runner reproduces them byte-for-byte. The wire format is pinned by
 * `apps/web/__tests__/maintenance/route-contract.test.ts`, which was written
 * and run green against the pre-migration handler before this drain; run
 * against that handler today, exactly its two `TENANTSCOPE DELTA` cases fail.
 *
 * Success envelopes, status codes, every auth/permission gate and every audit
 * payload are unchanged. The ONLY deltas are on GET error paths, and they come
 * from declaring `tenantScope` (below) — see "GET error-path deltas".
 *
 * `route.ts` imports `runRoute` from `@/lib/api/run-route` (the app-bound
 * wrapper that injects the resolver), as `guard:tenant-scope` requires.
 *
 * ---------------------------------------------------------------------------
 * GET — paginated list (Plan B3)
 * ---------------------------------------------------------------------------
 * Auth surface:
 *   [runner] tenantScope: query → resolveEffectiveCommunityId(req, ?communityId)
 *     → requireAuthenticatedUserId
 *     → ?communityId present (legacy message; header-only requests refused)
 *     → requireCommunityMembership
 *     → getFeaturesForCommunity(...).hasMaintenanceRequests (403)
 *     → requirePlanFeature('hasMaintenanceRequests')
 *     → requirePermission('maintenance', 'read')
 *     → requireEntitledForAdminRead
 *     → cursor/pageSize validation ('Invalid query parameters', no details)
 *     → paginateMaintenanceRequestsForCommunity + per-page comments
 *
 * `tenantScope: { in: 'query' }` — the canonical declaration for a top-level
 * read, and what keeps this route out of the `guard:tenant-scope` backlog
 * (CON-01/02). `communityId` is modeled as an optional string TRANSFORMED to a
 * number (NaN for junk) rather than `z.coerce.number().int().positive()`, so
 * the schema itself never rejects: a bad value reaches
 * `resolveEffectiveCommunityId`, whose `ValidationError('communityId must be a
 * positive integer')` is byte-identical to the legacy handler's own check.
 *
 * The other params DOCUMENT the query surface but constrain nothing (optional
 * strings). cursor/pageSize validation stays in the handler, after auth, with
 * the legacy `'Invalid query parameters'` message and no `details` block, which
 * the runner's generic `VALIDATION_ERROR` envelope would change. The runner's
 * query parse gives the same first-wins, empty-string→undefined semantics the
 * handler got from `searchParams.get(...) || undefined`; the filters are
 * re-read with `searchParams.get` so an empty `?status=` still reaches the
 * service as `''` exactly as before.
 *
 * GET error-path deltas (pinned in route-contract.test.ts):
 *   1. ORDER: tenant resolution now runs before `requireAuthenticatedUserId`
 *      (the runner resolves before the handler — true of every tenantScope
 *      route). An unauthenticated caller with an invalid `?communityId=` or a
 *      header mismatch now gets that 400/404 instead of 401. Both checks are
 *      pure request-shape comparisons (no DB read), so nothing is disclosed.
 *   2. MESSAGE: missing `?communityId=` with no `x-community-id` header now
 *      400s with the resolver's `'Invalid or missing communityId'` instead of
 *      `'communityId query parameter is required'` (same status and code, also
 *      pre-auth). With the header present, the handler still refuses a
 *      missing param with the legacy message, after auth, as before.
 *   3. HEADER FIRST: a malformed `x-community-id` header together with an
 *      invalid `?communityId=` now 404s ('Community not found') before auth,
 *      where the legacy handler 400'd on the query value after auth. The
 *      middleware sets that header, so a malformed one does not reach here.
 *   Every in-app consumer (`listMyRequests` / `listAllRequests` via
 *   `walkAndSlice`) always sends `?communityId=`, so none of these deltas is
 *   reachable from the UI.
 *
 * Response: `paginated: true` (runner emits `{ data: { data, pagination } }`,
 * the same double-wrap the handler hand-built) with a loose per-item
 * `z.unknown()`: `formatRequest` projects DB rows whose `createdAt` /
 * `updatedAt` / `resolutionDate` and comment `createdAt` are `Date`s, and whose
 * key set differs by caller (`internalNotes` / comment `isInternal` are
 * omitted for residents). A tight schema would `safeParse`-fail on the Dates
 * before `NextResponse.json` serializes them.
 *
 * ---------------------------------------------------------------------------
 * POST — action dispatch: create | add_comment | request_upload_url
 * ---------------------------------------------------------------------------
 * No `tenantScope`: the body is polymorphic and parsed per action AFTER auth;
 * a body tenantScope would resolve `communityId` before auth AND before the
 * per-action schema, changing the per-action 400s, and would turn the
 * malformed-JSON 500 into a resolver 400. So POST keeps hand-resolving.
 *
 * Auth surface for every branch (preserved verbatim):
 *   requireAuthenticatedUserId
 *     → per-action safeParse (per-action message + formatZodErrors details)
 *     → resolveEffectiveCommunityId(req, body.communityId)
 *     → assertNotDemoGrace (BEFORE membership)
 *     → requireCommunityMembership
 *     → hasMaintenanceRequests type gate (403)
 *     → requirePlanFeature('hasMaintenanceRequests')
 *     → requirePermission('maintenance', 'write')
 *     → branch ownership checks (resident: own request only) → service → audit
 *
 * Body modeled as `z.unknown()` (handler-parsed) — the `contracts` /
 * `auth/signup` pattern. The body is polymorphic on `action`, each branch has
 * a distinct validation message (`'Invalid request payload'` /
 * `'Invalid comment payload'` / `'Invalid upload URL request'`) plus the
 * unknown-action message, and all of it runs after auth. A runner-level union
 * would collapse those into one generic envelope and move it ahead of the 401.
 * A malformed JSON body still yields the legacy 500 (the handler reads
 * `action` off an undefined body, as it read it off the thrown `req.json()`).
 *
 * Response: loose `z.unknown()` — the three branches return different shapes
 * (`create` and `add_comment` return inserted rows carrying `Date` columns;
 * `request_upload_url` returns `{ uploadUrl, storagePath }`). The runner wraps
 * each once → `{ data: <payload> }`, as the handler did. Status stays 200 on
 * every branch (the legacy handler never returned 201).
 *
 * `permission` metadata matches the runtime `requirePermission(membership,
 * 'maintenance', <action>)` gates; `maintenance` IS in `RBAC_RESOURCES`.
 */
import { defineRoute, z } from '@propertypro/api-contract';

export const maintenanceRequestsListContract = defineRoute({
  method: 'GET',
  path: '/api/v1/maintenance-requests',
  request: {
    // Never rejects (see docblock): junk `communityId` becomes NaN and is
    // refused by the resolver with the legacy message; the rest document the
    // query surface and are validated in the handler, after auth.
    query: z.object({
      communityId: z
        .string()
        .optional()
        .transform((v) => (v === undefined ? undefined : Number(v))),
      status: z.string().optional(),
      category: z.string().optional(),
      priority: z.string().optional(),
      assignedToId: z.string().optional(),
      cursor: z.string().optional(),
      pageSize: z.string().optional(),
    }),
  },
  response: z.unknown(),
  paginated: true,
  tenantScope: { in: 'query' },
  permission: { resource: 'maintenance', action: 'read' },
});

export const maintenanceRequestsActionContract = defineRoute({
  method: 'POST',
  path: '/api/v1/maintenance-requests',
  request: {
    // Polymorphic action-dispatch body, parsed per branch in the handler to
    // preserve the per-action validation messages and auth-first ordering.
    body: z.unknown(),
  },
  response: z.unknown(),
  permission: { resource: 'maintenance', action: 'write' },
});
