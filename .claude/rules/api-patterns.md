<important if="creating or modifying API routes">

# API Route Patterns

## Route Structure

All API routes live under `apps/web/src/app/api/v1/`. Tenant scoping is handled by middleware (not URL params).

## Required Patterns

Every API route handler must:
1. Wrap in `withErrorHandler` for consistent error responses
2. Call `requirePermission(resource, action)` for authorization —
   **except the four root-exclusive powers** (role assignment, billing/
   subscription, community deletion, root transfer), which MUST use
   `requireRootManager` from `@/lib/api/role-guard`. `requirePermission(...,
   'settings', 'write')` cannot express root-exclusivity: the RBAC matrix
   collapses `property_manager` and `root_manager` onto one `manager` row, so
   it silently admits every property manager. See ADR-006 §2 and
   `apps/web/__tests__/api/root-exclusive-routes.test.ts`, which fails the
   build if one of those routes reverts to `settings:write`.
3. Validate request bodies with Zod schemas
4. Use `createScopedClient(communityId)` for all DB access
5. Log mutations via `logAuditEvent()` for compliance trail

**New routes should ALSO be written through `runRoute()` from
`@propertypro/api-contract`** — see "Route Contracts" below. The
`pnpm guard:contracts` CI ratchet enforces this for new files (existing files
are grandfathered in `KNOWN_UNCONTRACTED_ROUTES` at
`scripts/verify-contracts.ts`). `pnpm new:resource <plural>` scaffolds the
canonical shape.

## Route Contracts (`runRoute()` from `@propertypro/api-contract`)

Plan A1 lane. **233 routes contracted; 40 grandfathered files remain** on the
allowlist, drainable opportunistically (measured via `pnpm guard:contracts`,
2026-08-09 — re-run it rather than trusting this number).

### Canonical contract + route shape

`./contract.ts` next to the route file:
```ts
import { defineRoute, z } from '@propertypro/api-contract';

export const myResourceContract = defineRoute({
  method: 'GET',
  path: '/api/v1/my-resource',
  request: {
    params: z.object({ id: z.coerce.number().int().positive() }).optional(),
    query: z.object({ communityId: z.coerce.number().int().positive() }).optional(),
    body: z.object({ /* ... */ }).optional(),
  },
  response: z.object({ /* ... */ }),
  permission: { resource: 'documents', action: 'read' }, // metadata only; runner does NOT enforce
});
```

`./route.ts`:
```ts
import { runRoute } from '@propertypro/api-contract';
import { withErrorHandler } from '@/lib/api/error-handler';
import { myResourceContract } from './contract';

export const GET = withErrorHandler(
  runRoute(myResourceContract, async ({ params, query, body, req }) => {
    // auth + business logic
    return /* the inner payload, NOT { data: payload } — runner wraps */;
  }),
);
```

> **Import source depends on `tenantScope`.** The bare import above is correct
> only for routes that do NOT declare `tenantScope`. If you declare a
> `query`/`body` scope, import `runRoute` from `@/lib/api/run-route` instead —
> see the next section. `guard:tenant-scope` enforces it.

The runner:
- Parses + validates `params`/`query`/`body` against the contract's schemas before the handler runs (throws `ContractValidationError` → 400 `VALIDATION_ERROR` envelope).
- Validates the handler's return against the response schema (throws → 500 `INTERNAL_ERROR` + Sentry tag `contract_violation: response`).
- Wraps the result: non-paginated → `{ data: payload }`, paginated → `{ data: { data: items, pagination } }`.
- Pre-`NextResponse.json` `safeParse` — so `Date` values must be converted in the handler (`.toISOString()`) if the response schema is `z.string()`.

### Known constraints (avoid when contracting)

The runner cannot handle these without changes — leave on allowlist or wait for runner extension:
- **201/202/204 responses** — runner hardcodes 200 (POST handlers returning 201 are blocked).
- **Non-canonical envelopes** — flat `{ ok: true }` or top-level `meta` field next to `data` (e.g. `{ data: [...], meta: {...} }`) won't round-trip through the runner's single-wrap.
- **Non-JSON content-type** — CSV, binary, redirects.
- **`/internal/*` routes** — token-authenticated bypass not yet integrated.
- **Stripe webhook routes** — body signature verification needs raw body, not Zod-parsed.

### Established shape conventions

Historical precedent from the drained corpus **as of 2026-05-23**, when 16
drains existed. The drain numbers are of their time; the shapes are what
matters, and later drains have followed them.

| Shape | Precedent | Notes |
|---|---|---|
| No-input session-anchored | drain #1 `me/communities`, #6 `billing-groups/mine`, #8 `overview` | `request: {}` |
| Query-only tenant-scoped | drain #2 `users/names`, #5 `notifications/unread-count` | Use `resolveEffectiveCommunityId(req, query.communityId)` |
| Params + query | drain #3 `ledger/balance/[unitId]`, #11 `polls/[id]/my-vote`, #14 `polls/[id]/results` | Runner awaits Next.js 15's `Promise<params>` shape |
| Body PATCH with audit log | drain #4 `community/contact`, #13 `payments/fee-policy` | Two contracts in one file; preserve audit log payload byte-identical |
| Body with discriminated union | drain #7 `notifications/read` | Use `z.union(...)` not `z.discriminatedUnion(...)` when branches don't share a literal-typed discriminator key |
| Body session-anchored with side effect | drain #9 `account/profile` | Date→ISO in handler, not schema |
| Query rich-filter + PM-only | drain #12 `pm/dashboard/summary` | `// AUTHZ:` comment on `@propertypro/db/unsafe` imports |
| Cross-community single-wrap with hand-rolled cursor | drain #15 `notifications/all` | `paginated: false` (NOT `paginated: true` — that's for `paginate()` helper) |
| Feature-gated GET+PATCH with conditional business rules | drain #16 `transparency/settings` | `.strict()` body, audit log with `vi.useFakeTimers()` to lock ISO conversion |

### Response schema modeling: tight vs loose

- **Tight `z.object({...})` per-field**: use when the service returns a strict TypeScript type with no projection in the route AND no `Date` fields AND no `[key: string]: unknown` index signature. The runner's response validation acts as a canary — schema breakage fires a 500 with Sentry tag `contract_violation: response`. Examples: drain #11 `PollMyVote` (2 keys), drain #4/#13 (3-key contact + 1-key policy).
- **Loose `z.unknown()` / `z.array(z.unknown())`**: use for cross-community aggregates with consumer-side type discipline, OR when the service returns rows with `Date` fields / open index signatures. Tightening risks 500s on additive DB column additions or `safeParse` failures on Date values (runner validates BEFORE `NextResponse.json` serializes). Examples: drain #8 `overview`, drain #12 `pm/dashboard/summary`, drain #14 `polls/results`. ALWAYS document the tradeoff in the contract docblock.

### Header-mismatch behavior change — verify before claiming

`resolveEffectiveCommunityId(req, query.communityId)` throws `NotFoundError` → 404 when `x-community-id` header disagrees with the query/body value. BUT: many pre-migration routes already used this (directly or via `parseCommunityIdFromQuery`, which itself delegates). To claim a "400→404 migration delta" in docblocks, verify the pre-migration code actually ignored the header. Drain #10 lesson — `parseCommunityIdFromQuery` at `apps/web/src/lib/finance/request.ts:17` already delegates. Only drain #13 (`payments/fee-policy`) actually introduced a real 404 behavior change in the corpus (pre-migration used `parseResult.data.communityId` directly).

### Auth-chain ordering for PATCH with `assertNotDemoGrace`

Convention: `requireAuthenticatedUserId → resolveEffectiveCommunityId → assertNotDemoGrace → requireCommunityMembership → ...`. The demo-grace check fires BEFORE the membership check; test via `requireCommunityMembership.not.toHaveBeenCalled()` in the demo-grace test case (drain #4/#13/#16 precedent).

### Permission field

`permission: { resource, action }` is **metadata only** — runner does not enforce. Real RBAC gating happens via route-level `requirePermission(membership, resource, action)` calls. Use a real `RBAC_RESOURCES` member if one fits (`packages/shared/src/rbac-matrix.ts`); otherwise pick the closest semantic placeholder and document.

### Test file conventions

- Place at `apps/web/__tests__/<domain>/<route-leaf>-route.test.ts` (sibling-folder/domain convention — dominant across drains #2-#16). Drain #1 used nested `__tests__/api/...` and is the outlier.
- Mock the runner-touching imports plus all auth gates + service calls. Use `vi.hoisted(() => ({...Mock: vi.fn()}))` for top-level mock factories.
- For routes that stamp `new Date()` into an audit-log payload, use `vi.useFakeTimers() + vi.setSystemTime(fakeNow)` to assert the exact ISO conversion in `oldValues`/`newValues` — drain #16 pattern.
- When extending an existing test file, preserve every pre-existing test case verbatim — don't reorganize.
- Cover at minimum: happy path with call-arg assertions, 401, every 403 gate, every 400 validation path, 404 header/query mismatch (when applicable).

### Allowlist drain workflow

1. Pick a route from `KNOWN_UNCONTRACTED_ROUTES` in `scripts/verify-contracts.ts` that fits the "Known constraints" guidance above.
2. Create `./contract.ts` next to the route, rewrite the route through `runRoute(contract, handler)`.
3. Write/extend a unit test.
4. Delete the route's entry from `KNOWN_UNCONTRACTED_ROUTES`.
5. Verify: `pnpm typecheck && pnpm lint && pnpm guard:contracts` (Contracted count increments; allowlist decrements).

**For batches, use `/drain-loop`** (`.claude/skills/drain-loop.md`, driving
`drain-loop.workflow.js` → `drain-one-batch.workflow.js`) rather than
hand-driving it. That tooling automates what this rule used to describe as a
manual seven-step choreography — pick 3 routes with disjoint hooks and services,
worktree each, implement in parallel, dual review, then **sequential** PR
creation and merge with a rebase between each. Two constraints survive from that
manual era and still bite: `gh pr create` writes local git state, so concurrent
calls race; and batched routes must have **disjoint file sets**, or the rebases
conflict.

**Hook migrations are out of scope** for an allowlist drain — keep consumer hooks byte-identical. The runner produces `{ data: payload }` exactly as the pre-migration handler did; consumers using `requestJson<T>` keep working.

## Tenant scoping — `tenantScope` (Plan B2)

`communityId` is resolved from the middleware `x-community-id` header
(authoritative); any `communityId` in the query/body is a cross-checked
redundant value via `resolveEffectiveCommunityId(req, explicit)`.

**Recommended for new single-tenant routes:** declare `tenantScope` on the
contract and let the runner resolve + inject `communityId` instead of calling
`resolveEffectiveCommunityId` by hand. Canonical location by intent:

- `tenantScope: { in: 'query' }` — top-level reads (GET): `?communityId=…`
- `tenantScope: { in: 'body' }` — top-level mutations carrying the id in the body
  (POST/PATCH/PUT). `in: 'query'` is also valid for bodyless DELETE/PATCH.
- `tenantScope: { in: 'path', field: 'id' }` — nested `/communities/[id]/…`
  routes; the path segment is authoritative.

When you declare a `query`/`body` `tenantScope`, the handler receives
`communityId` in its input and you **must import `runRoute` from
`@/lib/api/run-route`** (the app-bound wrapper that injects the resolver), not
from `@propertypro/api-contract`. `guard:tenant-scope` enforces well-formedness
and the import. Routes that resolve tenancy differently (PM cross-community,
token-auth, header-only) should NOT declare `tenantScope`.

## List Endpoints — Pagination Contract (ADR-003 / Plan A2 / Plan B3)

Any handler that returns an array of rows MUST paginate via the canonical
helper. Do not return unbounded arrays; do not roll your own offset-based
paginator.

### Canonical route shape

```ts
import { createScopedClient, paginate, announcements } from '@propertypro/db';
import { eq } from '@propertypro/db/filters';
import { ValidationError } from '@/lib/api/errors';
import { z } from 'zod';

const listQuerySchema = z.object({
  cursor: z.string().min(1).max(256).optional(),
  pageSize: z.coerce.number().int().positive().optional(),
});

// In the handler:
// Use `||` not `??` so empty-string query params (`?cursor=`, `?pageSize=`)
// are treated as missing rather than passed to Zod, which would 400 on the
// `min(1)` / `positive()` constraints.
const parsedQuery = listQuerySchema.safeParse({
  cursor: searchParams.get('cursor') || undefined,
  pageSize: searchParams.get('pageSize') || undefined,
});
if (!parsedQuery.success) {
  throw new ValidationError('Invalid query parameters');
}

const scoped = createScopedClient(communityId);
const result = await paginate(
  scoped,
  announcements,
  { cursor: parsedQuery.data.cursor, pageSize: parsedQuery.data.pageSize },
  { where: someFilter },  // optional — see "Filter pushdown" below
);

// CANONICAL DOUBLE-WRAP: route handlers MUST wrap paginate's output in the
// outer `{ data: ... }` envelope. `requestJson<{data, pagination}>` then
// unwraps the outer `.data` — the consumer sees `{ data: T[], pagination }`.
return NextResponse.json({
  data: {
    data: result.data,
    pagination: result.pagination,
  },
});
```

### Notes

- Cursor-based keyset pagination on `id`. Stable under concurrent inserts/deletes.
- `pageSize` silently clamped to `[1, 100]`; 50 is the default.
- The cursor format is **opaque** — never construct one client-side; always
  echo back the `nextCursor` you received.
- Optional 4th arg `{ where?: SQL, direction?: 'asc' | 'desc' }` for filtering
  and sort direction (defaults to `desc`, i.e. newest first).

### Hard-tier warning: non-id sort orders

Do not migrate an endpoint to the id-only `paginate()` helper when the
user-visible order is not equivalent to `id desc` / `id asc`. These endpoints
need a sort-preserving keyset design first:

- pinned/newest feeds: `isPinned desc, publishedAt/createdAt desc, id desc`
- curated lists: `sortOrder asc, id asc`
- calendar/reservation lists: `startTime/expectedArrival` order
- directories: `name asc` or `isActive desc, name asc`
- merged feeds or joined/aggregate rows

For these hard-tier endpoints, push every visibility filter into SQL, append
`id` as the final deterministic tiebreaker, and encode all sort keys in an
opaque cursor. See
`docs/audits/b3-hard-tier-pagination-design-2026-05-11.md` before changing
announcements, FAQs, reservations, visitors, vendors, assessments, amenities,
forum threads, calendar events, elections, or leases.

### Filter pushdown

Push every filter into the SQL `where` predicate. Don't post-fetch in JS:

```ts
const filterClauses = [];
if (status !== undefined) filterClauses.push(eq(table.status, status));
if (unitId !== undefined) filterClauses.push(eq(table.unitId, unitId));
if (allowedUnitIds && allowedUnitIds.length > 0) {
  filterClauses.push(inArray(table.unitId, allowedUnitIds));
}
const where =
  filterClauses.length === 0
    ? undefined
    : filterClauses.length === 1
      ? filterClauses[0]
      : and(...filterClauses);
```

**Resident-with-zero-units short-circuit**: drizzle forbids `inArray(col, [])`.
If a resident has zero allowed units, return an empty paginated envelope
before reaching paginate:

```ts
if (allowedUnitIds && allowedUnitIds.length === 0) {
  return NextResponse.json({
    data: {
      data: [],
      pagination: { nextCursor: null, hasMore: false, pageSize: parsedQuery.data.pageSize ?? 50 },
    },
  });
}
```

### Client-side consumers

Two helpers in `apps/web/src/lib/api/walk-paginated.ts`:

- **`walkPaginated<T>(url, baseParams, { signal? })`** — walks all pages until
  `hasMore=false`, returns `T[]`. Use when the consumer needs the full list
  (no UI pagination).
- **`walkAndSlice<T>(url, baseParams, { page?, limit?, signal? })`** — walks
  all pages, then JS-slices to the requested `page+limit` window. Returns
  `{ data: T[], meta: { total, page, limit } }`. Use when preserving an
  existing offset-style UI contract.

Both cap at `MAX_PAGES * pageSize = 2000` rows. `meta.total` undercounts past
that.

### Enum query params: safeParse + ValidationError (NOT `.parse`)

Validate enum query params with `safeParse + throw new ValidationError`, NOT
`.parse()` directly. `withErrorHandler` only special-cases `AppError` —
ZodError falls through to a 500 + Sentry path:

```ts
const listStatusSchema = z.enum(['open', 'closed']);
const rawStatus = searchParams.get('status');
let status: 'open' | 'closed' | undefined;
if (rawStatus) {
  const parsed = listStatusSchema.safeParse(rawStatus);
  if (!parsed.success) {
    throw new ValidationError('Invalid status filter', {
      fields: [{
        field: 'status',
        message: `status must be one of: ${listStatusSchema.options.join(', ')}`,
      }],
    });
  }
  status = parsed.data;
}
```

### Test mocks

Route unit tests should mock `paginate()` directly with identity-ish
operator stubs (don't try to mock the chainable selectFrom builder):

```ts
vi.mock('@propertypro/db/filters', () => ({
  eq: (col: unknown, val: unknown) => ({ __eq: { col, val } }),
  inArray: (col: unknown, vals: unknown) => ({ __inArray: { col, vals } }),
  and: (...clauses: unknown[]) => ({ __and: clauses }),
}));
vi.mock('@propertypro/db', () => ({
  createScopedClient: createScopedClientMock,
  paginate: paginateMock,
  myTable: myTableMock,  // table reference imported by the route
}));
```

When migrating an existing route to use a new `@propertypro/db` export
(e.g. `paginate`, `buildAccessibleDocumentsFilter`), grep
`vi\.mock\(['"]@propertypro/db['"]` across `apps/web/__tests__/` first —
EVERY existing mock factory needs the new export added or the route's
import will throw at module load and 500 every test in the file.

### Integration test sweep when changing response shape

When a route's response envelope changes (flat → double-wrap, etc.), grep
`apps/web/__tests__/integration/` for BOTH patterns:

- URL substrings: `apiUrl\\(['"\`]/api/v1/<route>` or `'/api/v1/<route>'`
- Route-module calls: `<routeName>\\.GET\\(` or `appRoutes\\.<routeName>\\.GET\\(`

The URL-substring grep alone misses tests that import the route module and
call `routeModule.GET(req)` directly.

## Middleware

`apps/web/src/middleware.ts` handles: Supabase session refresh, tenant resolution, auth redirects, email verification checks, request tracing (`X-Request-ID`), rate limiting, and header sanitization.

- Protected paths: `/dashboard`, `/settings`, `/documents`, `/maintenance`, `/api/v1`, etc.
- Token-authenticated routes (no session): `/api/v1/invitations`, `/api/v1/auth/signup`, `/api/v1/webhooks/stripe`, cron endpoints

## Route Catalog

```
# Core resources
GET/POST /api/v1/documents, /meetings, /announcements, /leases, /residents
GET      /api/v1/compliance

# E-Sign
GET/POST /api/v1/esign/templates, /submissions
POST     /api/v1/esign/sign/[submissionExternalId]/[slug]  (unauthenticated)

# Calendar
GET      /api/v1/calendar/events
#        Google Calendar integration: /calendar/google/{connect,callback,disconnect,sync}
#        (No .ics export route exists — the meetings UI tells users to copy details manually.)

# PM dashboard
GET      /api/v1/pm/communities, /dashboard/summary, /reports/[reportType]
POST     /api/v1/pm/bulk/announcements, /bulk/documents

# Account lifecycle
GET/POST /api/v1/admin/access-plans          (admin: list/grant free access)
DELETE   /api/v1/admin/access-plans/[id]     (admin: revoke)
POST     /api/v1/admin/access-plans/[id]/extend (admin: extend)
GET      /api/v1/admin/deletion-requests     (admin: list deletion requests)
POST     /api/v1/admin/deletion-requests/[id]/intervene, /recover
POST     /api/v1/account/delete              (user: request own deletion)
DELETE   /api/v1/account/delete              (user: cancel own deletion)
POST     /api/v1/communities/delete          (admin: request community deletion)
DELETE   /api/v1/communities/delete          (admin: cancel community deletion)
POST     /api/v1/subscribe                   (user: Stripe checkout for subscription)
POST     /api/v1/internal/account-lifecycle  (cron: daily lifecycle processing)

# Finance & billing — /api/v1/finance, /accounting, /ledger, /payments, /billing,
#                      /billing-groups, /assessments, /delinquency, /stripe
# Governance — /api/v1/elections, /polls, /violations, /arc
# Operations — /api/v1/work-orders, /maintenance-requests, /amenities, /reservations,
#              /vendors, /contracts, /move-checklists, /packages, /visitors, /units
# Engagement — /api/v1/forum, /emergency-broadcasts, /notifications,
#              /notification-preferences, /help, /faqs, /search
# Residents & access — /api/v1/access-requests, /import-residents, /invitations,
#                       /transparency, /me, /user, /users
# Auth & onboarding — /api/v1/auth/signup, /onboarding/condo, /onboarding/apartment
# Webhooks — /api/v1/webhooks/stripe, /webhooks/twilio
```

> This catalog is **representative, not exhaustive** (~60 top-level groups exist).
> The authoritative source is the route tree itself: `apps/web/src/app/api/v1/`.

</important>
