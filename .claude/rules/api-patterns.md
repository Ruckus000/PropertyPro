<important if="creating or modifying API routes">

# API Route Patterns

## Route Structure

All API routes live under `apps/web/src/app/api/v1/`. Tenant scoping is handled by middleware (not URL params).

## Required Patterns

Every API route handler must:
1. Wrap in `withErrorHandler` for consistent error responses
2. Call `requirePermission(resource, action)` for authorization
3. Validate request bodies with Zod schemas
4. Use `createScopedClient(communityId)` for all DB access
5. Log mutations via `logAuditEvent()` for compliance trail

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
GET      /api/v1/calendar/events, /meetings.ics, /my-meetings.ics

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

# Move checklists, packages, visitors — under /api/v1/
# Auth & onboarding — /api/v1/auth/signup, /onboarding/condo, /onboarding/apartment
# Webhooks — /api/v1/webhooks/stripe
```

</important>
