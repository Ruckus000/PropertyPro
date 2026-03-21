# Command Palette V2 & Help Center — Implementation Plan

**Date:** 2026-03-21
**Source Spec:** `docs/superpowers/specs/2026-03-21-command-palette-help-center-design.md`
**Approach:** Four phases, each independently demo-ready. Full spec scope preserved.

---

## Risk Mitigations

The spec review surfaced five risks. Each one has a concrete containment strategy built into the phasing below.

### Risk 1 — Building search for a product with minimal data

**Mitigation:** Phase 1 ships client-side-only search (feature registry + keyboard navigation). This costs almost nothing to maintain, works with zero database records, and is the single highest-impact piece for demos. Data search (Phase 2) arrives only after the entities it searches already exist and are seeded.

### Risk 2 — Six parallel endpoints assume a stable data model

**Mitigation:** Extract a generic search query builder (`createEntitySearch`) in Phase 2 that encapsulates the `pg_trgm` pattern, community scoping, soft-delete filtering, and permission WHERE clauses. Each entity endpoint becomes a thin wrapper (~15 lines) that passes its table name, searchable columns, role filter, and response mapper. When the data model changes, you update the mapper — not the search infrastructure.

```typescript
// The abstraction that contains schema churn
// Uses Drizzle's sql`` tag — pg_trgm operators (%>, word_similarity) have no
// native Drizzle bindings, so this is a deliberate use of Drizzle's raw SQL
// escape hatch with parameterized placeholders for safety.
const results = await createEntitySearch({
  table: documents,              // Drizzle table reference, not a string
  searchColumns: [documents.title],
  communityId,
  roleFilter: null, // documents: no additional role filter
  limit,
  mapResult: (row) => ({
    id: row.id,
    title: row.title,
    subtitle: row.category_name,
    href: `/documents/${row.id}`,
    entityType: 'document' as const,
    category: row.category_name,
    fileType: row.file_type,
  }),
})(query)
```

If you rename a column or restructure a relationship, the change is isolated to that entity's mapper function. The search infrastructure, progressive rendering, and cancellation logic are untouched.

### Risk 3 — ~50 help articles need to be written

**Mitigation:** Phase 3 starts with 12–15 articles covering the compliance-critical paths (the ones that actually come up in demos and onboarding). The seed script and schema support 50+ from day one, but content ships incrementally. Each article is Markdown — no special tooling needed to write them. A `pnpm seed:help-articles` command makes iteration fast: edit the seed file, run the command, see the result. The version-guard upsert means you never lose manual edits from a future admin UI.

**Content priority tiers:**

| Tier | Count | Covers | Ships in |
|------|-------|--------|----------|
| P0 — Demo-critical | 12–15 | Compliance dashboard, document upload, meeting notices, owner management, maintenance requests | Phase 3 |
| P1 — Onboarding | 10–15 | Account setup, CSV import, notification preferences, mobile app install, renter access | Phase 3 + 1 week |
| P2 — Reference | 15–20 | Edge cases, statute details, contract management, bid tracking, violation workflow | Post-launch, driven by support questions |

### Risk 4 — cmdk migration introduces accessibility regressions

**Mitigation:** Phase 1 builds the custom combobox as a new component (`CommandPalette`) alongside the existing cmdk palette. The old palette stays mounted behind a feature flag until the new one passes accessibility testing. The switchover is a single flag flip, not a big-bang replacement.

**Accessibility testing checklist (must pass before flag flip):**

- [ ] VoiceOver (macOS Safari): navigate all items, hear group labels, hear "X of Y" position
- [ ] NVDA (Windows Chrome): same as above
- [ ] Keyboard-only: Tab into palette, arrow through all items including "View all," Enter to select, Escape to close, wrap-around works
- [ ] Focus trap: Tab does not escape the dialog while open
- [ ] `aria-activedescendant` updates on every arrow key press
- [ ] Reduced motion: skeleton pulse animation replaced with static placeholder

### Risk 5 — Keyword arrays are speculative

**Mitigation:** The keyword arrays are treated as configuration, not code. They live in a single file (`feature-registry.ts`) and the help article seed script. Updating a keyword requires zero architectural changes — it's a string in an array. Phase 4 adds lightweight search analytics (log queries that return zero results) so you can see exactly which terms real users try and fail to find. This turns the keyword arrays from guesswork into a data-informed feedback loop.

---

## Phase 1 — Foundation & Client-Side Palette

**Goal:** Feature registry search + custom combobox + keyboard navigation. No API calls, no database changes. Demo-ready on its own.

**Effort estimate:** 3–4 days

### Tasks

#### 1.1 — Feature registry file

Create `apps/web/src/lib/constants/feature-registry.ts` with all ~50 registry items. Each item has `id`, `label`, `keywords[]`, `description`, `icon`, `href`/`action`, `roles`, `audience`, `category`, `group`, and optional `featureFlag`.

**Approach:**

- Audit every route in `apps/web/src/app/` to generate the item list
- Write keyword arrays using the spec's examples as a starting point
- Mark items that depend on feature flags (e-voting, violations, payments)
- Export a `useFilteredRegistry(role, featureFlags)` hook that returns the subset visible to the current user

**Output:** Single TypeScript file, no runtime dependencies beyond Lucide icons.

**Acceptance criteria:**

- Resident role sees 15–20 items. Admin role sees 40+.
- Items gated by disabled feature flags are excluded.
- File has zero database or API dependencies.

#### 1.2 — Custom combobox component (Radix Dialog + custom listbox)

Build `apps/web/src/components/command-palette/CommandPalette.tsx` and supporting sub-components.

**Component tree:**

```
CommandPalette (Radix Dialog)
├── CommandInput (controlled input, combobox role)
├── CommandEmpty (no results message)
├── CommandLoading (per-group skeleton, per-group error)
├── CommandGroup (role="group", aria-label)
│   └── CommandItem (role="option", aria-selected)
└── CommandFooter (keyboard shortcut hints)
```

**Why not keep cmdk and extend it:** The spec is clear that cmdk's `Command.List` expects synchronous items, and the Phase 2 progressive rendering with per-group loading states would require fighting cmdk's internals. Building on Radix Dialog gives us the accessible overlay, focus trap, and keyboard event handling for free. The custom listbox is ~200 lines of code — manageable, and fully under our control.

**Keyboard behavior:**

- Up/Down: linear navigation across all visible items (including "View all" links when they exist in Phase 2)
- Enter: navigate to `href` or execute `action`
- Escape: close
- Wrap-around: Down on last item → input. Up from input → last item.
- Focus stays in input. Arrow keys control `aria-activedescendant`, not cursor.

Build this behind a feature flag (`commandPaletteV2`). The existing cmdk palette stays active until Phase 1 passes accessibility testing.

**Acceptance criteria:**

- Opens via `Cmd+K` / `Ctrl+K` and top-nav search bar click
- Typing filters registry items instantly (client-side string matching on label + keywords)
- Keyboard navigation works per spec (up/down/enter/escape/wrap)
- Passes VoiceOver and keyboard-only testing checklist from Risk 4 mitigation
- Feature flag controls old vs new palette

#### 1.3 — Empty query state

Implement the two empty-state modes from the spec:

**Users with 3+ recent pages:**

- Store recent page visits in `localStorage` (just the registry id + timestamp, max 20 entries)
- Display "Recent" section + role-suggested quick actions

**First-time users (< 3 history entries):**

- Display "Getting Started" section with role-appropriate starter items
- Residents: "View Your Documents", "Submit Maintenance Request", "Set Notification Preferences"
- Admins: "Upload Your First Document", "Add Residents", "Schedule a Board Meeting"

**Acceptance criteria:**

- Fresh user sees "Getting Started" with 3 contextual items
- After visiting 3+ pages, sees "Recent" section instead
- Recent history persists across sessions (localStorage)

#### 1.4 — Mobile search screen

Create the full-screen mobile search page triggered by the search icon in the mobile top nav.

**Layout:** Input at top, single-column results below. Same registry filtering logic as desktop. Same empty state behavior.

**Acceptance criteria:**

- Search icon in mobile nav opens full-screen search
- Registry search works identically to desktop
- Back button / swipe closes search

### Phase 1 Definition of Done

- [ ] Feature flag `commandPaletteV2` controls old/new palette
- [ ] Desktop: `Cmd+K` opens centered modal with registry search
- [ ] Mobile: search icon opens full-screen search page
- [ ] Typing filters ~50 registry items by label + keywords instantly
- [ ] Keyboard navigation passes full accessibility checklist
- [ ] Empty state shows "Getting Started" or "Recent" based on history
- [ ] Old cmdk palette still accessible via flag for rollback
- [ ] No database migrations, no API endpoints, no server-side changes

---

## Phase 2 — Database Migrations & Data Search

**Goal:** `pg_trgm` indexes, search API endpoints, progressive rendering in the palette. The palette now searches real data.

**Effort estimate:** 4–5 days

**Prerequisite:** The entities being searched (documents, meetings, announcements, maintenance requests, violations, residents) must exist in the database with seed data. If any entity table doesn't exist yet, skip its search endpoint and add it later — the progressive rendering architecture handles missing groups gracefully.

### Tasks

#### 2.1 — Database migrations (0109–0112)

Four migrations per the spec. Run in sequence.

**Migration 0109** — `pg_trgm` extension + entity GIN indexes:

```sql
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- B-tree for tenant filtering (verify existence first)
CREATE INDEX IF NOT EXISTS idx_documents_community ON documents (community_id);
CREATE INDEX IF NOT EXISTS idx_announcements_community ON announcements (community_id);
CREATE INDEX IF NOT EXISTS idx_meetings_community ON meetings (community_id);
CREATE INDEX IF NOT EXISTS idx_maintenance_community ON maintenance_requests (community_id);
CREATE INDEX IF NOT EXISTS idx_violations_community ON violations (community_id);

-- GIN trigram for text search
CREATE INDEX idx_documents_title_trgm ON documents USING gin (title gin_trgm_ops);
CREATE INDEX idx_announcements_title_trgm ON announcements USING gin (title gin_trgm_ops);
CREATE INDEX idx_meetings_title_trgm ON meetings USING gin (title gin_trgm_ops);
CREATE INDEX idx_maintenance_title_trgm ON maintenance_requests USING gin (title gin_trgm_ops);
CREATE INDEX idx_violations_desc_trgm ON violations USING gin (description gin_trgm_ops);
```

**Migration 0110** — `user_search_index` table + sync trigger:

Per spec: `public.user_search_index` table synced from `auth.users` via `SECURITY DEFINER` trigger. Includes initial population `INSERT...SELECT` and GIN trigram indexes on `full_name` and `email`.

**Migration 0111** — `help_articles` table:

Per spec: table, RLS policies (read for all authenticated, community write for admins), partial unique index on `registry_item_id`, service role bypass policy.

**Migration 0112** — `units.unit_number` B-tree index:

```sql
CREATE INDEX idx_units_number_btree ON units (unit_number);
```

**Validation step:** After each migration, run `EXPLAIN ANALYZE` against seed data for every new index to confirm the planner uses them. Document the output in a `docs/superpowers/index-validation/` directory.

**Acceptance criteria:**

- All four migrations apply cleanly to dev database
- `EXPLAIN ANALYZE` confirms index usage for each trigram query pattern
- `user_search_index` trigger fires on new user creation and updates
- RLS policies on `help_articles` work for both platform and community scoped articles

#### 2.2 — Generic search query builder

Create `apps/web/src/lib/search/create-entity-search.ts`.

This is the key abstraction that contains Risk 2. It encapsulates:

- `SET LOCAL pg_trgm.word_similarity_threshold = 0.3` inside a transaction
- `WHERE community_id = $communityId AND deleted_at IS NULL AND title %> $query`
- `ORDER BY word_similarity($query, title) DESC LIMIT $limit`
- The response shape mapping via a caller-provided `mapResult` function

**Drizzle ORM integration note:** The codebase uses Drizzle ORM. The `pg_trgm` operators (`%>`, `word_similarity()`) have no native Drizzle bindings. This builder uses Drizzle's `sql` template tag as a deliberate escape hatch — all user input is parameterized via `sql.placeholder()` or template interpolation (which Drizzle auto-parameterizes). This is not raw string concatenation. The approach is consistent with Drizzle's documented pattern for custom operators.

```typescript
import { sql } from 'drizzle-orm'
import type { PgTable } from 'drizzle-orm/pg-core'

type EntitySearchConfig<TRow, TResult extends SearchResult> = {
  table: PgTable                    // Drizzle table reference
  searchColumns: PgColumn[]         // Drizzle column references to apply %> against
  softDelete: boolean               // true = add deleted_at IS NULL
  additionalWhere?: SQL             // Drizzle sql`` fragment for role-based filters
  mapResult: (row: TRow) => TResult
}

export function createEntitySearch<TRow, TResult extends SearchResult>(
  config: EntitySearchConfig<TRow, TResult>
) {
  return async (
    communityId: string,
    query: string,
    limit: number
  ): Promise<{ results: TResult[]; totalCount: number }> => {
    // Uses db.transaction() to scope SET LOCAL for PgBouncer compatibility
    return await db.transaction(async (tx) => {
      await tx.execute(sql`SET LOCAL pg_trgm.word_similarity_threshold = 0.3`)

      // Build WHERE: community_id + soft delete + trigram match + role filter
      // All via sql`` tag — Drizzle parameterizes template interpolations
      const rows = await tx.execute(sql`
        SELECT *, word_similarity(${query}, ${config.searchColumns[0]}) AS relevance
        FROM ${config.table}
        WHERE community_id = ${communityId}
          AND ${config.softDelete ? sql`deleted_at IS NULL AND` : sql``}
          ${config.searchColumns[0]} %> ${query}
          ${config.additionalWhere ?? sql``}
        ORDER BY relevance DESC
        LIMIT ${limit}
      `)

      return {
        results: rows.map(config.mapResult),
        totalCount: rows.length,
      }
    })
  }
}
```

**Why `sql\`\`` and not raw strings:** Drizzle's `sql` tag auto-parameterizes all interpolated values (`${query}`, `${communityId}`, `${limit}`). The `%>` operator and `word_similarity()` function are written as literal SQL — they're Postgres builtins, not user input. This gives us the safety of parameterized queries while accessing `pg_trgm` features that Drizzle doesn't wrap natively.

**Why this matters:** When the data model changes, you update the `mapResult` function for that entity. The search infrastructure (trigram matching, transaction management, community scoping, progressive rendering) is untouched. Adding a new searchable entity is ~15 lines of config.

**Acceptance criteria:**

- Single function handles all entity search patterns
- All user input parameterized via Drizzle's `sql` tag (no string interpolation)
- Transaction wrapping for `SET LOCAL` compatibility with PgBouncer
- Soft-delete exclusion is automatic when `softDelete: true`

#### 2.3 — Search API endpoints (6 endpoints)

Create one endpoint per entity using the generic builder from 2.2.

```
GET /api/v1/search/documents?q=&limit=3
GET /api/v1/search/residents?q=&limit=3
GET /api/v1/search/announcements?q=&limit=3
GET /api/v1/search/meetings?q=&limit=3
GET /api/v1/search/maintenance?q=&limit=3
GET /api/v1/search/violations?q=&limit=3
```

**Per-endpoint specifics:**

| Endpoint | Role restriction | Additional WHERE | Search columns | Notes |
|----------|-----------------|------------------|----------------|-------|
| documents | None | `deleted_at IS NULL` | title | Falls back to tsvector content search if title matches < limit (spec §6) |
| residents | Admin only | Join through `user_roles`, `user_search_index`, `units` | full_name, email, unit_number (LIKE prefix) | Hybrid strategy per spec |
| announcements | None | Residents: `archived_at IS NULL AND (audience = 'all' OR audience = $role_audience)`. Admins: `archived_at IS NULL` | title | |
| meetings | None | None beyond community scope | title | |
| maintenance | Residents: own only | Residents: `submitted_by_id = $userId`. Admins: none | title | |
| violations | Residents: own unit | Residents: `unit_id IN (SELECT unit_id FROM user_roles WHERE user_id = $userId AND community_id = $communityId)`. Admins: none | description | |

**Build order:** documents → announcements → meetings → maintenance → violations → residents. This order follows decreasing simplicity. Residents is last because of the hybrid search strategy (trigram + LIKE prefix on unit numbers).

**Minimum query length enforcement:** Numeric input (`/^\d+$/`) → 1 char minimum. Alpha input → 2 char minimum. Enforced server-side (return empty results below threshold, don't error).

**Acceptance criteria:**

- Each endpoint returns the `{ results, totalCount, status }` shape from the spec
- Permission filters prevent residents from seeing other users' maintenance requests or violations
- Residents cannot call `/search/residents` (403)
- Queries below minimum length return `{ results: [], totalCount: 0, status: 'ok' }`
- `communityId` is derived from session middleware, never accepted as a client param

#### 2.4 — Progressive rendering in the palette

Update `CommandPalette` to fire parallel API calls on query input and render results progressively.

**Client-side logic:**

```typescript
// apps/web/src/components/command-palette/useDataSearch.ts

const ENTITY_ENDPOINTS = [
  { key: 'documents', path: '/api/v1/search/documents', adminOnly: false },
  { key: 'announcements', path: '/api/v1/search/announcements', adminOnly: false },
  { key: 'meetings', path: '/api/v1/search/meetings', adminOnly: false },
  { key: 'maintenance', path: '/api/v1/search/maintenance', adminOnly: false },
  { key: 'violations', path: '/api/v1/search/violations', adminOnly: false },
  { key: 'residents', path: '/api/v1/search/residents', adminOnly: true },
]

// State per group: 'idle' | 'loading' | 'loaded' | 'error'
// Groups render as they resolve. Order locks at first paint.
// AbortController cancels all in-flight requests on new input.
```

**Rendering rules (from spec §7):**

- Static registry results always first (instant)
- Data groups render as they arrive, order locks at first paint
- Late-arriving groups append below — never re-sort
- Groups with zero results are hidden
- Each group shows skeleton while loading
- "View all →" links without counts

**Request cancellation:** Each keystroke (after 300ms debounce) aborts the previous `AbortController` and creates a new one. Clearing input aborts and resets to empty state.

**Acceptance criteria:**

- Typing "pool" shows registry matches instantly, then data results stream in as endpoints resolve
- A fast endpoint (documents) renders before a slow one (residents) without waiting
- Rapidly typing and deleting does not produce stale results (cancellation works)
- Groups never re-sort after initial paint
- Empty groups are hidden, not shown as empty
- Skeleton loading states visible per-group while API call is in-flight

#### 2.5 — "View all" links + entity list page search support

Each data group shows "View all →" linking to the entity's list page with `?q=` parameter.

**Implicit route modifications:** The existing entity list pages (documents, announcements, meetings, maintenance, violations, residents) need to be updated to read `?q=` from the URL and pass it to the shared search function. This ensures "View all →" from the palette produces consistent results on the destination page. Start with documents (highest usage), then extend to the others.

**Per-page change:** Each list page's data-fetching hook gains an optional `q` parameter. When present, it calls the same `searchDocuments()` / `searchMeetings()` / etc. function used by the search endpoint. When absent, the page behaves as before (unfiltered list).

**Acceptance criteria:**

- Clicking "View all →" on documents navigates to `/documents?q=pool`
- The documents list page reads `?q=` and runs the same `searchDocuments()` function for consistent results
- "View all →" is keyboard-navigable (included in arrow-key traversal)
- Same pattern works for all entity list pages that have "View all" links

#### 2.6 — `escapeLikePattern` utility

Create `apps/web/src/lib/utils/escape-like.ts` per spec:

```typescript
export function escapeLikePattern(input: string): string {
  return input.replace(/[%_\\]/g, '\\$&')
}
```

Used only by the resident search endpoint for unit number prefix matching.

### Phase 2 Definition of Done

- [ ] Four migrations apply cleanly; all indexes validated with `EXPLAIN ANALYZE`
- [ ] Six search endpoints return correct results with proper permission scoping
- [ ] Resident search uses hybrid strategy (trigram name/email + LIKE prefix on unit number)
- [ ] Command palette shows data results progressively alongside registry results
- [ ] Request cancellation prevents stale results on rapid typing
- [ ] "View all →" links navigate to entity list pages with query param
- [ ] All queries exclude soft-deleted rows
- [ ] `communityId` derived from session, never from client

---

## Phase 3 — Help Center

**Goal:** Help center page (desktop + mobile), seed articles, cross-linking from command palette and empty states.

**Effort estimate:** 4–5 days (2–3 days engineering, 2 days writing P0 articles)

### Tasks

#### 3.1 — Help center page (desktop)

Create `/help` route with sidebar link.

**Browsing mode (no search):**

- Section A: Platform Guide — role-filtered articles grouped by category, category chips for navigation
- Section B: Community FAQs — accordion format, admin-managed

**Search mode (query entered):**

- Sections merge into single ranked list with source tags ("Platform Guide" / "Community FAQ")
- Uses the tiered keyword matching algorithm from spec §8

**Category chips (resident):** "Your Unit", "Documents & Notices", "Maintenance & Repairs", "Meetings & Events", "Payments & Dues", "Account & Settings"

**Category chips (admin):** "Document Management", "Compliance & Statutes", "Meetings & Notices", "Violations & Hearings", "Residents & Units", "Finance & Assessments", "E-Sign & Contracts", "System & Settings"

**Data fetching:** Single API call on mount → TanStack Query with `staleTime: 5 * 60 * 1000`. Client-side search on cached array (the tiered matching function from spec §8).

**Article rendering:** Markdown body rendered with `react-markdown`. No `dangerouslySetInnerHTML`.

**Empty community FAQ handling:**

- Admin + no FAQs: show empty section with CTA
- Admin + has FAQs: show FAQs + "Manage FAQs" link
- Resident + no FAQs: hide section entirely
- Resident + has FAQs: show accordion

**Acceptance criteria:**

- `/help` renders two-section layout for browsing, merged list for searching
- Category chips filter articles in real-time
- Tiered search matches keyword exact → prefix → substring
- Markdown renders cleanly (headings, lists, code blocks, links)
- Community FAQ section behaves per role/existence matrix above

#### 3.2 — Help center API endpoint

```
GET /api/v1/help/articles?audience=resident|admin
```

Returns all articles for the community (platform + community FAQs). RLS handles scoping — `community_id IS NULL` articles (platform) are visible to all authenticated users, community articles are scoped by `current_setting('app.community_id')`.

**Acceptance criteria:**

- Returns platform articles + community-specific articles
- Filters by audience parameter
- Excludes soft-deleted articles
- Response cached client-side (TanStack Query, 5 min stale time)

#### 3.3 — Help article seed script

Create `scripts/seed-help-articles.ts` with P0 articles (12–15).

**P0 article list:**

| # | Title | Audience | Category |
|---|-------|----------|----------|
| 1 | Understanding Your Compliance Dashboard | admin | Compliance & Statutes |
| 2 | Uploading Documents for Compliance | admin | Document Management |
| 3 | Meeting Notice Deadlines Explained | admin | Meetings & Notices |
| 4 | Adding and Managing Residents | admin | Residents & Units |
| 5 | Managing Maintenance Requests | admin | Meetings & Notices |
| 6 | Posting Public Meeting Notices | admin | Compliance & Statutes |
| 7 | Understanding the 30-Day Posting Rule | admin | Compliance & Statutes |
| 8 | Sending Announcements & Push Notifications | admin | Document Management |
| 9 | Viewing Your Community Documents | resident | Documents & Notices |
| 10 | Submitting a Maintenance Request | resident | Maintenance & Repairs |
| 11 | Understanding Meeting Notices | resident | Meetings & Events |
| 12 | Setting Your Notification Preferences | resident | Account & Settings |
| 13 | Getting Started as a Board Member | admin | System & Settings |
| 14 | What Renters Can Access | all | Documents & Notices |
| 15 | How Compliance Scoring Works | admin | Compliance & Statutes |

Each article includes: title, summary (1–2 sentences), body (Markdown, 200–500 words), `keywords[]` (5–10 natural language terms), `registry_item_id` (cross-reference to feature registry), audience, category, `sort_order`, version.

**Seed command:** `pnpm seed:help-articles` — uses version-guarded upsert (`ON CONFLICT DO UPDATE WHERE version <= EXCLUDED.version`).

**Acceptance criteria:**

- 12–15 articles seed successfully
- Re-running seed does not overwrite manually edited articles (version guard works)
- Each article has a keywords array with natural language synonyms
- Articles render correctly in the help center page

#### 3.4 — Help center (mobile)

Replace current `/mobile/help` with enhanced version.

**Layout:**

- Single-column, categories as vertical expandable sections (not chip grid)
- Search bar at top
- Accordion-style article expansion
- Same API endpoint, same role filtering, same tiered search

**Acceptance criteria:**

- Mobile help center matches desktop content
- Search works identically
- Existing mobile FAQ admin interface (`/mobile/help/manage`) still works for community FAQ CRUD

#### 3.5 — Cross-linking: empty states → help center

Update empty state components across the platform to link to relevant help articles via `registryItemId`.

**Pattern:**

```tsx
// Generic empty state component enhancement
<EmptyState
  title="No documents uploaded yet"
  description="Upload your governing documents to get started with compliance tracking."
  action={{ label: "Upload Document", href: "/documents/upload" }}
  helpArticleId="upload-documents"  // matches registry_item_id in help_articles
/>
```

The component looks up the help article by `registryItemId` and renders a "Learn more" link to `/help#article-{id}`.

**Acceptance criteria:**

- Empty states for documents, meetings, maintenance, announcements link to relevant help articles
- Links navigate to help center with the article scrolled into view
- Missing help articles (no match for `registryItemId`) gracefully hide the "Learn more" link

#### 3.6 — Command palette → help center link

Add "Help Center" as a registry item in the feature registry. Opens `/help`.

Individual help articles are NOT searchable from the command palette — per spec, the palette finds features, the help center explains them.

**Acceptance criteria:**

- Typing "help" in the command palette shows the "Help Center" page item
- Selecting it navigates to `/help`

### Phase 3 Definition of Done

- [ ] Desktop `/help` page renders with two-section browse layout and unified search
- [ ] Mobile `/mobile/help` upgraded with same content and search
- [ ] 12–15 P0 articles seeded with version-guarded upsert
- [ ] Tiered keyword search works client-side on cached article array
- [ ] Community FAQ section shows/hides based on role and existence
- [ ] Empty states link to relevant help articles
- [ ] "Help Center" item in command palette registry
- [ ] Sidebar shows "Help" link for all roles

---

## Phase 4 — Polish, Analytics & Flag Flip

**Goal:** Accessibility audit, cmdk removal, search analytics, keyword refinement. The feature flag flips to default-on.

**Effort estimate:** 2–3 days

### Tasks

#### 4.1 — Accessibility audit

Run the full accessibility testing checklist from Risk 4 mitigation:

- VoiceOver (macOS Safari)
- NVDA (Windows Chrome) — can use a VM or BrowserStack
- Keyboard-only navigation
- Focus trap verification
- `aria-activedescendant` tracking
- Reduced motion handling for skeletons
- 4.5:1 contrast on secondary text and status indicators
- 3:1 contrast on skeleton placeholders

Fix any issues found.

**Acceptance criteria:**

- All items on the accessibility checklist pass
- No focus escapes from the dialog while open
- Screen reader announces group labels and item positions

#### 4.2 — Remove cmdk dependency

Once accessibility audit passes:

1. Flip `commandPaletteV2` feature flag to default-on
2. Monitor for 1 week (if you have users) or validate thoroughly in demo
3. Remove the old cmdk-based component
4. Remove `cmdk` from `package.json`

**Acceptance criteria:**

- Old palette component deleted
- `cmdk` removed from dependencies
- No regressions in palette behavior

#### 4.3 — Search analytics (lightweight)

Log zero-result queries to identify keyword gaps.

```typescript
// Log when a search returns zero results across all groups
if (allGroupsEmpty && query.length >= 2) {
  await logSearchMiss({
    query,
    role: user.role,
    communityId,
    timestamp: new Date(),
  })
}
```

Store in a `search_analytics` table (or append to existing analytics pipeline if one exists). No PII — just the query string, role, and community.

**Weekly review process:** Check the top 20 zero-result queries. For each one:

- If it maps to an existing feature → add it as a keyword to the registry item
- If it maps to existing data → check if the trigram threshold is too aggressive
- If it maps to nothing → note it as a feature request signal

**Acceptance criteria:**

- Zero-result queries logged with role and community context
- No PII in analytics records
- Query takes < 5ms (non-blocking, fire-and-forget)

#### 4.4 — Keyword refinement pass

Using analytics from 4.3 (or from demo observations if pre-launch), do a first refinement pass on:

- Feature registry keyword arrays (add missed terms)
- Help article keyword arrays (add missed terms)
- Trigram threshold tuning (if 0.3 is too loose or too tight based on real queries)

**Acceptance criteria:**

- Registry and help article keywords updated based on observed search patterns
- Threshold confirmed or adjusted with documented rationale

### Phase 4 Definition of Done

- [ ] Accessibility audit complete, all issues resolved
- [ ] Feature flag flipped to default-on
- [ ] `cmdk` dependency removed
- [ ] Search analytics logging zero-result queries
- [ ] First keyword refinement pass complete

---

## Implementation Sequence Summary

```
Phase 1 (3–4 days)     Phase 2 (4–5 days)     Phase 3 (4–5 days)     Phase 4 (2–3 days)
─────────────────      ─────────────────      ─────────────────      ─────────────────
Feature registry       DB migrations          Help center page       A11y audit
Custom combobox        Search query builder   Help API endpoint      cmdk removal
Empty state UX         6 search endpoints     Seed 12–15 articles    Search analytics
Mobile search          Progressive render     Mobile help center     Keyword refinement
                       "View all" links       Empty state links
                       escapeLikePattern      Palette → help link
```

**Total estimate:** 13–17 days of focused development.

**Each phase is independently demo-ready:**

- **After Phase 1:** "Type 'compliance' and jump straight to the dashboard" — instant feature discovery
- **After Phase 2:** "Type 'pool' and find the maintenance request, the pool rules document, and the pool closure announcement" — data search across the platform
- **After Phase 3:** "Click Help and get step-by-step guides written for your role" — built-in training
- **After Phase 4:** Production-grade accessibility, clean dependencies, data-driven keyword improvement

---

## Files Created / Modified

### New Files

| File | Phase | Purpose |
|------|-------|---------|
| `apps/web/src/lib/constants/feature-registry.ts` | 1 | ~50 registry items with keywords |
| `apps/web/src/components/command-palette/CommandPalette.tsx` | 1 | Custom combobox (Radix Dialog shell) |
| `apps/web/src/components/command-palette/CommandInput.tsx` | 1 | Controlled input with combobox role |
| `apps/web/src/components/command-palette/CommandGroup.tsx` | 1 | Group wrapper with aria-label |
| `apps/web/src/components/command-palette/CommandItem.tsx` | 1 | Option item with aria-selected |
| `apps/web/src/components/command-palette/CommandEmpty.tsx` | 1 | No results state |
| `apps/web/src/components/command-palette/CommandLoading.tsx` | 1 | Per-group skeleton |
| `apps/web/src/components/command-palette/useDataSearch.ts` | 2 | Parallel fetch + progressive state |
| `apps/web/src/lib/search/create-entity-search.ts` | 2 | Generic search query builder |
| `apps/web/src/lib/utils/escape-like.ts` | 2 | LIKE pattern escaping |
| `apps/web/src/app/(portal)/help/page.tsx` | 3 | Desktop help center page |
| `apps/web/src/lib/search/search-help-articles.ts` | 3 | Tiered keyword matching function |
| `scripts/seed-help-articles.ts` | 3 | Version-guarded article seeder |
| `packages/db/migrations/0109_add_pg_trgm_and_search_indexes.sql` | 2 | Extension + GIN indexes |
| `packages/db/migrations/0110_add_user_search_index.sql` | 2 | Sync table + trigger |
| `packages/db/migrations/0111_add_help_articles.sql` | 2 | Help articles table + RLS |
| `packages/db/migrations/0112_add_units_number_index.sql` | 2 | B-tree on unit_number |

### Modified Files

| File | Phase | Change |
|------|-------|--------|
| Sidebar component | 3 | Add "Help" nav item |
| Top nav component | 1 | Wire up search bar click to new palette |
| Mobile nav component | 1 | Add search icon trigger |
| Entity list pages (documents, announcements, meetings, maintenance, violations, residents) | 2 | Read `?q=` param, call shared search function when present |
| Empty state components | 3 | Add `helpArticleId` prop + "Learn more" link |
| Mobile help page | 3 | Replace with enhanced implementation |
| `package.json` | 4 | Remove `cmdk` dependency |

---

## Testing Strategy

### Unit Tests

| Test | Phase | What it covers |
|------|-------|----------------|
| Feature registry filtering | 1 | Role filtering, feature flag exclusion, audience filtering |
| Tiered keyword matching | 3 | All three tiers, edge cases (empty query, single char, special chars) |
| `escapeLikePattern` | 2 | `%`, `_`, `\` escaping |
| `createEntitySearch` | 2 | SQL generation, parameter binding, soft-delete filtering |

### Integration Tests

| Test | Phase | What it covers |
|------|-------|----------------|
| Search endpoint permissions | 2 | Resident can't call `/search/residents`, resident maintenance scoped to own requests, resident violations scoped to own unit, announcement audience filtering |
| Help articles API | 3 | Platform articles visible to all, community articles scoped, audience filtering |
| Trigram search quality | 2 | "pool" matches "Pool Maintenance Request", "insur" matches "Insurance Certificate" |
| Multi-tenant isolation | 2 | Search results from community A never appear for community B user |

### E2E Tests (Playwright)

| Test | Phase | What it covers |
|------|-------|----------------|
| `Cmd+K` → type "compliance" → Enter → lands on compliance dashboard | 1 | Full palette flow |
| Type "pool" → see maintenance request → click → lands on request detail | 2 | Data search flow |
| Open `/help` → click category → see articles → search → see results | 3 | Help center flow |
| Rapid typing + deleting → no stale results | 2 | Cancellation |

---

## Rollback Plan

Each phase has an independent rollback path:

- **Phase 1:** Flip `commandPaletteV2` flag off → old cmdk palette activates. Zero data risk.
- **Phase 2:** Migrations are additive (new indexes, new tables). Rolling back = removing the 6 API route files and reverting the palette to Phase 1 behavior (registry-only). Indexes and tables can stay — they're inert without the endpoints.
- **Phase 3:** Help center is a new page. Rolling back = removing the `/help` route and sidebar link. Seed data stays in the table — harmless.
- **Phase 4:** cmdk removal is the only destructive step. Don't delete the old component files until you're confident (keep them for 2 weeks post-flip).
