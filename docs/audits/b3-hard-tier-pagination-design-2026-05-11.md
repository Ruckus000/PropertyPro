# B3 Hard-Tier Pagination Design

Date: 2026-05-11
Branch: `codex/b3-hard-tier-pagination-design`

Status update: FAQ ordered-keyset rollout has been implemented on
`codex/b3-faqs-ordered-keyset-pagination` as the first hard-tier proof. The
remaining hard-tier focus is announcements; the optional FAQ order index remains
deferred until production row counts justify a migration.

## Summary

The B3 easy tier is exhausted. The remaining list endpoints are not safe
mechanical `paginate()` migrations because their visible order or visibility
filter is part of the product contract.

The canonical id-only `paginate()` helper remains the right tool for endpoints
whose order is equivalent to `id desc`. For hard-tier endpoints, the next step
is a sort-preserving keyset design: push visibility filters into SQL, order by
the existing user-visible sort, append `id` as the final deterministic
tiebreaker, and encode all sort keys in an opaque cursor.

## Non-Goals

- Do not convert endpoints sorted by `startTime`, `sortOrder`, `name`,
  `isPinned`, `isActive`, or joined/aggregate event keys to id-only cursors.
- Do not preserve an offset UI by hiding an unbounded full-table fetch behind
  client-side slicing.
- Do not change response envelopes for unrelated mutation routes.
- Do not weaken tenant isolation. All designs below continue to use
  `createScopedClient()` or scoped-service helpers.

## Current Constraint

`packages/db/src/pagination.ts` implements `paginate()` over one key:

```ts
ORDER BY id <direction>
WHERE id <cursor.id // desc
LIMIT pageSize + 1
```

That is deliberately narrow and has worked for the id-equivalent rollout.
It cannot preserve these existing user-visible sorts:

| Endpoint | Current visible order | Why id-only is unsafe |
| --- | --- | --- |
| `/api/v1/announcements` | `isPinned desc`, `publishedAt desc` | Pinned notices must stay above newer unpinned notices. |
| `/api/v1/faqs` | `sortOrder asc` | Admin-curated order is the feature. |
| `/api/v1/reservations` | `startTime desc` | Calendar chronology is the UI contract. |
| `/api/v1/vendors` | `isActive desc`, `name asc` | Active vendors and alphabetical scan order matter. |
| `/api/v1/assessments` | `isActive desc`, `createdAt desc` | Active assessments must lead historical ones. |
| `/api/v1/amenities` | `name asc` | Directory order is alphabetical. |
| `/api/v1/visitors` | `expectedArrival desc`, `id desc` | Staff workflows are time-oriented. |
| `/api/v1/forum/threads` | `isPinned desc`, `createdAt desc` | Pinned thread semantics mirror announcements. |
| `/api/v1/calendar/events` | merged meeting/assessment chronological sort | Not a single-table list. |
| `/api/v1/elections` | `opensAt desc`, `id desc` | Election timeline order differs from id order. |
| `/api/v1/leases` | no explicit DB sort plus multi-mode filters | `renewal_chain_for` needs graph traversal, not list pagination. |

## Decision

### 1. Keep `paginate()` id-only

`paginate()` should continue to be the sanctioned helper for id-equivalent
list endpoints. Expanding it in-place to accept arbitrary sort keys would make
existing simple routes harder to reason about and could invite accidental
sort-contract regressions.

### 2. Add a separate ordered-keyset path for hard-tier endpoints

Hard-tier routes should use a dedicated ordered keyset helper or domain
service helper with these properties:

- Cursor is opaque base64url JSON, never client-authored.
- Cursor includes every sort key plus `id`.
- `id` is always the final sort key so ordering is total and stable.
- SQL predicate uses lexicographic keyset logic.
- SQL `ORDER BY` exactly matches the cursor key order.
- The route still returns the canonical double-wrapped envelope:
  `{ data: { data: T[], pagination } }`.

Example sort contract for announcements:

```ts
ORDER BY is_pinned DESC, published_at DESC, id DESC

WHERE
  is_pinned < :cursor.isPinned
  OR (
    is_pinned = :cursor.isPinned
    AND (
      published_at < :cursor.publishedAt
      OR (published_at = :cursor.publishedAt AND id < :cursor.id)
    )
  )
```

Example sort contract for FAQs:

```ts
ORDER BY sort_order ASC, id ASC

WHERE
  sort_order > :cursor.sortOrder
  OR (sort_order = :cursor.sortOrder AND id > :cursor.id)
```

### 3. Push visibility into SQL before pagination

Pagination must run after visibility filters, not before them. Otherwise a
page can be short, empty, or report `hasMore` incorrectly after post-fetch
filtering.

Announcements visibility pushdown:

- `includeArchived=false`: `archived_at IS NULL`
- `includeDeleted=false`: active rows only via scoped client soft-delete filter
- non-admin audience:
  - owner resident: `audience IN ('all', 'owners_only')`
  - tenant resident: `audience IN ('all', 'tenants_only')`
  - non-resident/non-admin: `audience = 'all'`
- admin audience: no audience predicate
- query: SQL `ILIKE`/escaped substring over `title` and `body`
- demo provenance: for demo-lineage communities, load seeded announcement ids
  first and add `id NOT IN (...)`; if registry lookup fails or returns no ids,
  return an empty page fail-closed, matching the existing policy.

FAQ visibility pushdown:

- Ensure default FAQs exist before listing, preserving current lazy-seed
  behavior.
- Role visibility predicate:
  - visible to everyone when `role_visibility IS NULL`
  - visible to everyone when `cardinality(role_visibility) = 0`
  - otherwise visible when `:role = ANY(role_visibility)`
- Sort by `sort_order ASC, id ASC`.

### 4. Add explicit scoped-client support before include-deleted pagination

The scoped client currently exposes `queryIncludingDeleted(table)` but not a
dynamic `selectFromIncludingDeleted(...)` builder. Any hard-tier implementation
that needs ordered pagination over soft-deleted rows should first add a scoped
builder option rather than dropping to unscoped DB access.

Recommended scoped-client extension:

```ts
selectFrom(table, columns, additionalWhere, { includeSoftDeleted?: boolean })
buildWhere(table, additionalWhere, { includeSoftDeleted?: boolean })
```

That keeps tenant scoping centralized while allowing ordered admin recovery
views.

## Endpoint Plan

### First PR: FAQs

FAQs are the smallest safe hard-tier proof:

- single table
- small row shape
- no joins
- curated order is explicit (`sortOrder`)
- visibility filter is deterministic SQL
- lazy seed is already isolated in `ensureFaqsExist()`

Implementation status: complete on `codex/b3-faqs-ordered-keyset-pagination`.
The GET route now lazy-seeds after query validation, pushes role visibility into
SQL, keysets by `(sort_order ASC, id ASC)`, emits opaque `{ sortOrder, id }`
cursors, and returns the canonical double-wrapped B3 envelope. FAQ mutation,
reorder, search, and manage paths are intentionally unchanged.

Implementation sketch:

1. Add ordered keyset cursor support, either as a small local helper in
   `apps/web/src/lib/services/faq-service.ts` or as a shared helper if the
   announcements PR is planned immediately after.
2. Replace `listFaqs()` + `filterFaqsForRole()` in the GET route with a
   paginated service helper that returns visible rows only.
3. Keep `filterFaqsForRole()` for server search and existing unit tests until
   search is separately pushed down or capped.
4. Return `{ data: { data, pagination } }` from `/api/v1/faqs`.
5. Add route tests for:
   - `?cursor=` and `?pageSize=` empty-string handling
   - role-visibility SQL predicate cases
   - `sortOrder` tie broken by `id`
   - reorder during pagination restarts from first page on the client

Suggested index:

```sql
CREATE INDEX IF NOT EXISTS faqs_active_order_idx
ON faqs (community_id, sort_order ASC, id ASC)
WHERE deleted_at IS NULL;
```

### Second PR: Announcements

Announcements should follow FAQs only after the ordered-keyset shape is proven:

1. Extract an async `buildVisibleAnnouncementsWhere(...)` helper.
2. Push archive, audience, query, and demo-provenance filters into SQL.
3. Keyset by `(isPinned desc, publishedAt desc, id desc)`.
4. Keep `listVisibleAnnouncements()` as the shared server/API entry point, but
   change it to accept `cursor`/`pageSize` and return pagination metadata.
5. Update server pages or mobile pages deliberately; do not silently change
   direct service consumers that expect a full array.

Suggested index:

```sql
CREATE INDEX IF NOT EXISTS announcements_active_feed_idx
ON announcements (
  community_id,
  is_pinned DESC,
  published_at DESC,
  id DESC
)
WHERE deleted_at IS NULL;
```

### Later PRs

| Endpoint | Recommended approach |
| --- | --- |
| Reservations | Keep native offset/count until UI moves to cursor or load-more; current admin service already limits and counts in SQL. |
| Vendors | Ordered keyset by `(isActive desc, name asc, id asc)` only if list volume justifies migration. |
| Assessments | Ordered keyset by `(isActive desc, createdAt desc, id desc)`; preserve active-first grouping. |
| Amenities | Alphabetical keyset by `(name asc, id asc)`; probably low urgency. |
| Visitors | Ordered keyset by `(expectedArrival desc, id desc)`; must preserve unit-label hydration. |
| Forum threads | Ordered keyset by `(isPinned desc, createdAt desc, id desc)`; should include total/offset UI review. |
| Elections | Ordered keyset by `(opensAt desc, id desc)` if the UI ever needs multiple pages. |
| Calendar events | Not a `paginate()` candidate. It merges multiple sources over a required date range; keep range-bounded. |
| Leases | Split `renewal_chain_for` into a separate endpoint before paginating the normal list path. |

## Consumer Guidance

- Full-list consumers can continue using `walkPaginated()` only when the
  2,000-row cap is acceptable and documented.
- Offset-style UIs should use `walkAndSlice()` only as a temporary bridge.
  For hard-tier endpoints with plausible growth, prefer a visible cursor UI
  (`Load more`) or keep server-side offset/count until the UI changes.
- Any route response-shape change must grep integration tests by both URL
  substring and route-module call pattern, per `.claude/rules/api-patterns.md`.

## Acceptance Criteria

A hard-tier B3 PR is acceptable only when all are true:

- SQL order matches the pre-existing user-visible order, with `id` appended as
  a deterministic final tiebreaker.
- Every visibility filter that affects membership in the result set runs in
  SQL before pagination.
- Cursor payload includes all sort keys needed to resume the exact order.
- The route emits the canonical double-wrapped paginated envelope.
- Existing full-list service consumers are either deliberately migrated or
  deliberately left on a named non-paginated helper.
- Tests cover cursor edge cases, visibility filtering, and response envelope
  changes.
