/**
 * Route contracts for `GET`, `POST` and `DELETE /api/v1/announcements`.
 *
 * CON-05 (Phase 3.5) drain — the third and last of the legacy action-dispatch
 * CRUD routes. The wire format is pinned by
 * `apps/web/__tests__/announcements/route-contract.test.ts`, which was written
 * and run green (63/63) against the pre-migration handler before this drain;
 * the cases edited afterwards are exactly the ones marked `TENANTSCOPE DELTA`
 * or `DEMO-GRACE ORDER DELTA`, each quoting the legacy behaviour it replaced.
 * Run against that handler today, exactly those nine cases fail (59/68 pass).
 *
 * Success envelopes, status codes (200 on every success path — the legacy
 * handler never returned 201), every permission gate, every validation message
 * and every audit payload are unchanged. The deltas are listed below: GET error
 * paths from declaring `tenantScope`, and POST/DELETE demo-grace ordering.
 *
 * `route.ts` imports `runRoute` from `@/lib/api/run-route` (the app-bound
 * wrapper that injects the resolver), as `guard:tenant-scope` requires.
 *
 * ---------------------------------------------------------------------------
 * GET — list (pinned first, newest first; keyset-paginated in read-visibility)
 * ---------------------------------------------------------------------------
 * Auth surface:
 *   [runner] tenantScope: query → resolveEffectiveCommunityId(req, ?communityId)
 *     → requireAuthenticatedUserId
 *     → ?communityId present (legacy message; header-only requests refused)
 *     → requireCommunityMembership
 *     → requirePermission('announcements', 'read')
 *     → requireEntitledForAdminRead
 *     → cursor/pageSize validation ('Invalid query parameters' + field details)
 *     → listVisibleAnnouncements (audience / archived / published / demo
 *       provenance — unchanged, `lib/announcements/read-visibility.ts`)
 *
 * `tenantScope: { in: 'query' }` — the canonical declaration for a top-level
 * read, and what keeps this route out of the `guard:tenant-scope` backlog
 * (CON-01/02). Measured: with this declaration the census stays at 156; with
 * none, the now-contracted route's hand `resolveEffectiveCommunityId` call
 * counts and the census reads 157 against its pinned ceiling of 156.
 *
 * `communityId` is an optional string TRANSFORMED to a number (NaN for junk)
 * — the maintenance-requests shape, not meetings' map-junk-to-undefined —
 * because this route's legacy refusal of a junk value was already
 * `ValidationError('communityId must be a positive integer')`, which is
 * byte-identical to the resolver's. So the schema never rejects, and a junk
 * value keeps its legacy bytes (only its position relative to auth moves).
 *
 * The other params DOCUMENT the query surface but constrain nothing. The
 * handler re-reads them from `searchParams` exactly as before —
 * `includeArchived === 'true'`, `q` trimmed (an empty `?q=` is `''`),
 * `cursor`/`pageSize` through `|| undefined` — and validates cursor/pageSize
 * after the gates with the legacy message and `formatZodErrors` details, which
 * a runner-level schema would replace with its generic envelope.
 *
 * GET error-path deltas (each pinned by a `TENANTSCOPE DELTA` test):
 *   1. ORDER: tenant resolution now runs before `requireAuthenticatedUserId`
 *      (the runner resolves before the handler — true of every tenantScope
 *      route). An unauthenticated caller with a junk `?communityId=`, a header
 *      mismatch, or a missing `?communityId=` and no header now gets that
 *      400/404 instead of 401. All are pure request-shape checks (no DB read),
 *      so nothing is disclosed.
 *   2. MESSAGE: missing `?communityId=` with no `x-community-id` header now
 *      400s with the resolver's 'Invalid or missing communityId' instead of
 *      'communityId query parameter is required' (same status and code). With
 *      the header present, the handler still refuses a missing param with the
 *      legacy message, after auth, as before.
 *   3. HEADER FIRST: a malformed `x-community-id` header together with a junk
 *      `?communityId=` now 404s ('Community not found'), where the legacy
 *      handler 400'd on the query value. The middleware sets that header, so a
 *      malformed one does not reach here.
 *   Every in-app consumer sends a numeric `?communityId=`, so none of these is
 *   reachable from the UI.
 *
 * Response: loose `z.unknown()`, NOT `paginated: true`. The handler returns
 * `{ data: rows, pagination }` and the runner wraps it once →
 * `{ data: { data, pagination } }`, the double-wrap the legacy handler built by
 * hand. `paginated: true` would be wrong here: `listVisibleAnnouncements`
 * returns NO `pagination` when the community row is missing, which the legacy
 * handler serialised as `{"data":{"data":[]}}` and the paginated runner path
 * would refuse as a 500. The rows also carry `Date` columns, which a tight
 * schema would `safeParse`-fail before `NextResponse.json` serialises them.
 *
 * ---------------------------------------------------------------------------
 * POST — action dispatch: create (default) | update | pin | archive | restore
 * DELETE — soft-delete (author, or a moderator holding announcements:write)
 * ---------------------------------------------------------------------------
 * No `tenantScope` on either: the legacy handlers coerced a body `communityId`
 * with `Number()` (a string "42" is accepted) and refused junk with their own
 * `ValidationError`; the runner's body resolver would take the raw value (so
 * "42" would 400) and turn a malformed-JSON 500 into a 400. One declared scope
 * per route file keeps it out of the backlog, and GET carries it.
 *
 * Auth surface (both verbs):
 *   body parse (malformed JSON → 500; JSON null / array / scalar → {})
 *     → body communityId coerced + checked (400 'communityId must be a
 *       positive integer') → resolveEffectiveCommunityId (404 header
 *       mismatch) — pure parsing plus a header cross-check, pre-auth as before
 *     → requireAuthenticatedUserId
 *     → assertNotDemoGrace (BEFORE membership)
 *     → requireCommunityMembership
 *     → POST only: requirePermission('announcements', 'write')
 *     → requireActiveSubscriptionForMutation
 *     → createAuditContext(req, { userId, communityId })
 *     → per-action safeParse (legacy per-action message + details) → service
 *       → audit
 *   DELETE then re-reads membership and refuses a non-author without
 *   moderation rights (403 'You can only delete your own announcements').
 *
 * POST/DELETE delta (pinned by `DEMO-GRACE ORDER DELTA` tests):
 *   4. DEMO-GRACE ORDER: `assertNotDemoGrace` now runs AFTER authentication.
 *      It does an unscoped primary-key read of `communities` for the
 *      caller-supplied id, and the legacy handlers ran it BEFORE auth, so an
 *      unauthenticated caller could tell a demo-grace community (403
 *      DEMO_GRACE) from any other (401) — an oracle. Now that caller gets 401.
 *      An authenticated caller sees exactly the legacy sequence. This is the
 *      order `.claude/rules/api-patterns.md` documents and the meetings drain
 *      (#1224) adopted for the same reason.
 *
 * Body modeled as `z.unknown()` (handler-parsed): the body is polymorphic on
 * `action`, each branch has its own `VALIDATION_ERROR` message ('Invalid
 * announcement data' / 'Invalid update data' / 'Invalid pin action data' /
 * 'Invalid archive action data' / 'Invalid restore action data' / 'Invalid
 * delete data') with `formatZodErrors` details, and all of it runs after auth.
 * A runner-level schema would collapse those into one generic envelope and move
 * it ahead of the 401. An unknown `action` still falls through to create.
 *
 * Audit: every entry goes through `createAuditContext` (CON-06), the same
 * function `withAuditLog` used, so payloads — key order and the
 * `metadata.requestId` stamp included — are byte-identical. The body is now
 * parsed ONCE, by the runner; the request-keyed `parsedBodyCache` WeakMap that
 * existed only because `withAuditLog`'s extractor and handler each read the
 * body is gone.
 *
 * Response: loose `z.unknown()` — the branches return an announcement row
 * (with `Date` columns), `undefined` when an update/pin/archive matched no row
 * (serialised as `{}`, the legacy bytes: `{ data: undefined }` drops the key),
 * or `{ id, deleted: true }`. The runner wraps each once → `{ data: <payload> }`.
 *
 * `permission` metadata matches the runtime `requirePermission(membership,
 * 'announcements', <action>)` gates; `announcements` IS in `RBAC_RESOURCES`.
 * DELETE's metadata says `write` although its runtime gate is author-or-
 * moderator (no `requirePermission` call) — metadata only; the runner does
 * not enforce it.
 */
import { defineRoute, z } from '@propertypro/api-contract';

export const announcementsListContract = defineRoute({
  method: 'GET',
  path: '/api/v1/announcements',
  request: {
    // Never rejects (see docblock): junk `communityId` becomes NaN and is
    // refused by the resolver with the legacy message; the rest document the
    // query surface and are read + validated in the handler, after auth.
    query: z.object({
      communityId: z
        .string()
        .optional()
        .transform((v) => (v === undefined ? undefined : Number(v))),
      includeArchived: z.string().optional(),
      q: z.string().optional(),
      cursor: z.string().optional(),
      pageSize: z.string().optional(),
    }),
  },
  response: z.unknown(),
  tenantScope: { in: 'query' },
  permission: { resource: 'announcements', action: 'read' },
});

export const announcementsActionContract = defineRoute({
  method: 'POST',
  path: '/api/v1/announcements',
  request: {
    // Polymorphic action-dispatch body, parsed per branch in the handler to
    // keep the per-action messages and the auth-first ordering of validation.
    body: z.unknown(),
  },
  response: z.unknown(),
  permission: { resource: 'announcements', action: 'write' },
});

export const announcementsDeleteContract = defineRoute({
  method: 'DELETE',
  path: '/api/v1/announcements',
  request: {
    // Parsed in the handler for the legacy 'Invalid delete data' message.
    body: z.unknown(),
  },
  response: z.unknown(),
  permission: { resource: 'announcements', action: 'write' },
});
