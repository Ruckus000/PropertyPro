/**
 * Route contracts for `GET` and `POST /api/v1/meetings`.
 *
 * CON-05 (Phase 3.5) drain. The wire format is pinned by
 * `apps/web/__tests__/meetings/route-contract.test.ts`, which was written and
 * run green (52/52) against the pre-migration handler before this drain; run
 * against that handler today, exactly its five `TENANTSCOPE DELTA` cases fail
 * (48/53 pass).
 *
 * Success envelopes, status codes (200 on every success path — the legacy
 * handler never returned 201), every auth/permission gate and every audit
 * payload are unchanged. The ONLY deltas are on GET error paths, and they come
 * from declaring `tenantScope` (below) — see "GET error-path deltas". POST has
 * none.
 *
 * `route.ts` imports `runRoute` from `@/lib/api/run-route` (the app-bound
 * wrapper that injects the resolver), as `guard:tenant-scope` requires.
 *
 * ---------------------------------------------------------------------------
 * GET — list (no pagination; the calendar range bounds it)
 * ---------------------------------------------------------------------------
 * Auth surface:
 *   [runner] tenantScope: query → resolveEffectiveCommunityId(req, ?communityId)
 *     → requireAuthenticatedUserId
 *     → ?communityId present + positive integer (legacy BAD_REQUEST messages)
 *     → requireCommunityMembership
 *     → requirePermission('meetings', 'read')
 *     → requireEntitledForAdminRead
 *     → parseOptionalCalendarDateRange (BAD_REQUEST) → listMeetingsForCommunity
 *
 * `tenantScope: { in: 'query' }` — the canonical declaration for a top-level
 * read, and what keeps this route out of the `guard:tenant-scope` backlog
 * (CON-01/02): hand-resolving it would take the census to 157 against its
 * pinned ceiling of 156.
 *
 * `communityId` is an optional string TRANSFORMED to a number only when it is a
 * positive integer, and to `undefined` otherwise, so the schema itself never
 * rejects. That choice is deliberate: when the middleware stamped
 * `x-community-id` (every tenant-host request), a missing or junk
 * `?communityId=` lets the resolver fall back to the header, and the handler
 * then refuses it AFTER auth with the legacy `BadRequestError` code and message
 * — byte-identical to before. Passing junk through as NaN instead (the
 * maintenance-requests shape) would turn those into a pre-auth
 * `VALIDATION_ERROR`, because the legacy check here threw `BadRequestError`
 * (`BAD_REQUEST`), not `ValidationError`.
 *
 * `start` / `end` DOCUMENT the query surface but constrain nothing; the handler
 * still reads them from `searchParams` via `parseOptionalCalendarDateRange`,
 * after auth, with its `BAD_REQUEST` messages.
 *
 * GET error-path deltas (each pinned by a `TENANTSCOPE DELTA` test):
 *   1. NO HEADER, MISSING OR JUNK `?communityId=`: now 400 `VALIDATION_ERROR`
 *      'Invalid or missing communityId' from the resolver, before auth. Legacy
 *      was 400 `BAD_REQUEST` 'communityId query parameter is required' /
 *      'communityId must be a positive integer', after auth — so an
 *      unauthenticated caller now sees that 400 instead of 401.
 *   2. ORDER, HEADER MISMATCH: `?communityId=` disagreeing with
 *      `x-community-id` is still 404 'Community not found' with identical
 *      bytes, but now before auth, so an unauthenticated caller sees 404, not
 *      401. The comparison is pure request shape (no DB read); nothing is
 *      disclosed.
 *   3. ORDER, MALFORMED HEADER: a non-integer `x-community-id` now 404s before
 *      auth whatever the query says; legacy 401'd first, and with a missing or
 *      junk query it 400'd after auth. The middleware sets that header, so a
 *      malformed one does not reach here.
 *   Every in-app consumer (`useMeetings` in `hooks/use-meetings.ts`) always
 *   sends a numeric `?communityId=`, so none of these is reachable from the UI.
 *
 * Response: loose `z.array(z.unknown())`. `serializeMeetingResponse` already
 * emits ISO strings, so a tight schema would parse today — but `z.object`
 * STRIPS undeclared keys, so a field later added to the serializer would vanish
 * from the wire silently rather than fail. The runner wraps once →
 * `{ data: [...] }`, as the handler did. No warnings on a read (see route.ts).
 *
 * ---------------------------------------------------------------------------
 * POST — action dispatch: create (default) | update | delete | post-notice |
 *        attach | detach
 * ---------------------------------------------------------------------------
 * No `tenantScope`. The legacy handler already parsed `communityId` out of the
 * body BEFORE auth (`parseCommunityIdFromBody`), so a body scope would not move
 * it — but it would change its error: the helper coerces with `Number()` (a
 * string "42" is accepted) and refuses with `BadRequestError`, where the
 * runner's resolver takes the raw value and refuses with `ValidationError`, and
 * a malformed JSON body would turn from 500 into a resolver 400. One declared
 * scope per route file is enough to leave the backlog, and GET carries it.
 *
 * Auth surface for every branch (preserved verbatim):
 *   body parse (malformed JSON → 500)
 *     → parseCommunityIdFromBody (BAD_REQUEST / 404 header mismatch, pre-auth)
 *     → requireAuthenticatedUserId
 *     → assertNotDemoGrace (BEFORE membership)
 *     → requireCommunityMembership
 *     → requirePermission('meetings', 'write')
 *     → requireBoardDesignation (only when body.meetingType === 'board')
 *     → requireActiveSubscriptionForMutation
 *     → per-action safeParse → service → audit
 *
 * Body modeled as `z.unknown()` (handler-parsed). Every branch refuses bad
 * input with `UnprocessableEntityError` — **422** `UNPROCESSABLE_ENTITY`, with a
 * per-action message ('Invalid meeting data' / 'Invalid update data' /
 * 'Invalid notice data' / 'Invalid delete data' / 'Invalid attachment data' /
 * 'Invalid detach data') and `formatZodErrors` details — and all of it runs
 * after auth. A runner-level schema would answer **400** `VALIDATION_ERROR`
 * with one generic message and move it ahead of the 401, so none of that
 * validation lives here. The same goes for the endsAt-after-startsAt refusal
 * (also 422). An unknown `action` still falls through to create.
 *
 * Response: loose `z.unknown()` — the branches return different shapes (a
 * serialized meeting, a raw `meeting_documents` row with a `Date`, or
 * `{ success: true }`). The runner wraps each once → `{ data: <payload> }`.
 *
 * Envelope: create and update add a top-level `warnings` sibling when the
 * schedule is already inside its statutory notice window (#932). Declared here
 * (CON-04) and emitted via `withEnvelope`; the handler passes `undefined` when
 * there is no warning, which the runner omits, so a compliant schedule is
 * still a bare `{ data }` and a late one `{ data, warnings: [...] }` — both
 * byte-identical to the legacy splice. post-notice never warns.
 *
 * KEEP `envelope` AT LEAST AS LOOSE AS `NoticeWarning`
 * (`@/lib/compliance/notice-window`). The runner validates siblings AFTER the
 * handler returns — after the meeting row is committed and the notification is
 * queued — so a warning this schema rejected would turn a successful create
 * into a 500 and invite a duplicate on retry. `looseObject` keeps any future
 * extra field on a warning instead of stripping it.
 *
 * `permission` metadata matches the runtime `requirePermission(membership,
 * 'meetings', <action>)` gates; `meetings` IS in `RBAC_RESOURCES`.
 */
import { defineRoute, z } from '@propertypro/api-contract';

export const meetingsListContract = defineRoute({
  method: 'GET',
  path: '/api/v1/meetings',
  request: {
    // Never rejects (see docblock): a missing or junk `communityId` becomes
    // undefined so the resolver can fall back to the header; the handler then
    // refuses it with the legacy message. start/end are parsed in the handler.
    query: z.object({
      communityId: z
        .string()
        .optional()
        .transform((v) => {
          if (v === undefined) return undefined;
          const n = Number(v);
          return Number.isInteger(n) && n > 0 ? n : undefined;
        }),
      start: z.string().optional(),
      end: z.string().optional(),
    }),
  },
  response: z.array(z.unknown()),
  tenantScope: { in: 'query' },
  permission: { resource: 'meetings', action: 'read' },
});

export const meetingsActionContract = defineRoute({
  method: 'POST',
  path: '/api/v1/meetings',
  request: {
    // Polymorphic action-dispatch body, parsed per branch in the handler to
    // keep the per-action 422s and the auth-first ordering of validation.
    body: z.unknown(),
  },
  response: z.unknown(),
  envelope: z.object({
    warnings: z
      .array(z.looseObject({ code: z.string(), message: z.string() }))
      .optional(),
  }),
  permission: { resource: 'meetings', action: 'write' },
});
