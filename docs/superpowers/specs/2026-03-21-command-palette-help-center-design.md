# Command Palette V2 & Help Center — Design Spec

**Date:** 2026-03-21
**Status:** Approved
**Scope:** Command palette upgrade (search + discovery), unified search API, desktop + mobile help center

---

## 1. Problem Statement

PropertyPro's command palette has only 2 quick actions and no data search. Desktop users have no help center. New users — particularly non-technical board members, volunteer treasurers, and elderly unit owners — must navigate the sidebar to discover features, with no guided path and no search across their data. The platform needs a "cheat code" that flattens the learning curve from day one.

## 2. Goals

1. **Feature discovery** — typing natural language ("broken", "budget", "insurance") instantly surfaces relevant actions and pages
2. **Data search** — find specific documents, residents, meetings, maintenance requests, announcements, and violations by name
3. **Role-aware** — admins see create/manage actions, residents see view/submit actions; no one sees items they can't access
4. **Help center** — comprehensive, searchable help for all features, with audience-appropriate language for residents vs. admins
5. **Mobile parity** — dedicated search screen on mobile, help center on mobile

## 3. Non-Goals

- Portfolio-wide search for property managers across multiple communities (future feature)
- Feature tours or interactive onboarding walkthroughs (future feature)
- AI-powered search or natural language understanding (out of scope)
- Help center content management admin UI for platform articles (deferred — seed script for launch, noted as technical debt)

---

## 4. Architecture Overview

### Three Systems, Shared ID Namespace

| System | Purpose | Data source |
|--------|---------|-------------|
| **Feature Registry** | Command palette page/action discovery | Static TypeScript array, client-side |
| **Search API** | Data search across entities | 6 API endpoints, server-side |
| **Help Center** | In-app documentation | Database (help_articles table) |

The feature registry and help articles share an ID namespace via `registryItemId` for cross-referencing (e.g., empty states link to relevant help articles). They are separate systems — the registry stays lean for search, help articles have full instructional content.

---

## 5. Feature Registry

### Location

`apps/web/src/lib/constants/feature-registry.ts`

### Type Definition

```typescript
type RegistryItem = {
  id: string
  label: string
  keywords: string[]
  description: string
  icon: LucideIcon
  href?: string
  action?: () => void
  roles: Role[] | 'all'
  audience: 'resident' | 'admin' | 'all'
  category: 'page' | 'action' | 'setting'
  group: string
  featureFlag?: string
}
```

### Selection Behavior

- Items with `href` only: navigate to the page and close the palette
- Items with `action` only (no `href`): execute the action inline (e.g., open upload dialog) and close the palette
- Items with both `href` and `action`: navigate (`href` takes precedence)

### Keyword Strategy

Each item gets generous keyword arrays mapping natural language to formal feature names:

| Item | Keywords |
|------|----------|
| Upload Document | upload, file, pdf, add, attach, post, new document |
| Submit Maintenance Request | maintenance, repair, fix, broken, work order, help, issue, problem, leak, damage |
| View Compliance Score | compliance, score, status, health, audit, 718 |
| Schedule Meeting | meeting, schedule, calendar, board meeting, annual, notice, agenda |
| Report a Violation | violation, report, complaint, rule, noise, parking, pet, trash |
| Notification Preferences | notifications, email, alerts, preferences, unsubscribe, frequency |

The full registry ships with ~50 items covering every route and action in the platform.

### Deduplication

Each item has a unique `id`. The registry is defined once in a single file — no dynamic generation. Data results from the API are keyed by `entityType:entityId` to prevent overlap with static items.

### Role Filtering

The registry is filtered at render time based on the user's current role and the community's feature flags. Residents see ~15-20 items focused on their unit. Admins see 40+ items including management actions.

---

## 6. Unified Search API

### Architecture: Client-Side Parallel Requests

Six lightweight endpoints the client calls in parallel:

```
GET /api/v1/search/documents?q=sunset&limit=3
GET /api/v1/search/residents?q=sunset&limit=3      (admins only)
GET /api/v1/search/announcements?q=sunset&limit=3
GET /api/v1/search/meetings?q=sunset&limit=3
GET /api/v1/search/maintenance?q=sunset&limit=3
GET /api/v1/search/violations?q=sunset&limit=3
```

Residents fire 5 calls (no resident search — privacy). Admins fire 6.

**Why parallel endpoints over a single unified endpoint:**
- Progressive rendering — fast endpoints display results while slow ones load
- Independent error boundaries — one failure doesn't block the others
- No single-endpoint bottleneck on the slowest query
- HTTP/2 multiplexing makes overhead negligible

### Response Shape (Per-Entity)

```typescript
// Discriminated union for type-safe entity metadata
type EntityMeta =
  | { entityType: 'document'; category: string; fileType: string }
  | { entityType: 'resident'; role: string; unitNumber: string | null }
  | { entityType: 'announcement'; audience: string; publishedAt: string }
  | { entityType: 'meeting'; meetingType: string; startsAt: string }
  | { entityType: 'maintenance'; status: string; priority: string }
  | { entityType: 'violation'; status: string; severity: string }

type SearchResult = EntityMeta & {
  id: string | number
  title: string
  subtitle: string
  href: string
  relevance: number
}

// Per-endpoint response
{
  results: SearchResult[]
  totalCount: number
  status: 'ok' | 'error'
  error?: string
}
```

### Search Strategy: `pg_trgm` with `word_similarity()`

All entities use `pg_trgm` with the `%>` operator for index-aware queries:

```sql
-- Generic template (entity-specific WHERE clauses below)
SET LOCAL pg_trgm.word_similarity_threshold = 0.3;

SELECT id, title,
  word_similarity($1, title) AS relevance
FROM documents
WHERE community_id = $2
  AND deleted_at IS NULL
  AND title %> $1
ORDER BY relevance DESC
LIMIT $3;
```

- `%>` triggers the GIN trigram index for candidate selection
- B-tree on `community_id` combines via bitmap AND
- `word_similarity()` in SELECT computes scores only on surviving rows
- `deleted_at IS NULL` — every search query MUST exclude soft-deleted rows
- Every query runs inside a transaction (`BEGIN...COMMIT`) for `SET LOCAL` to take effect with PgBouncer

**Per-entity WHERE clauses (security-critical):**

Each endpoint MUST apply the role-based filters from the Permission Scoping table below. The generic template above shows the base case. Entity-specific additions:

```sql
-- Announcements (residents): only published, audience-filtered
AND archived_at IS NULL
AND (audience = 'all' OR audience = $role_audience)  -- e.g., tenants don't see 'owners_only'

-- Maintenance (residents): own requests only
AND submitted_by_id = $user_id

-- Violations (residents): own unit only
AND unit_id IN (SELECT unit_id FROM user_roles WHERE user_id = $user_id AND community_id = $community_id)
```

**Why `word_similarity()` over `similarity()`:** Finds the best matching contiguous substring, so short queries ("pool") score well against long titles ("Pool Maintenance Request"). `strict_word_similarity()` is too restrictive for partial word matching.

**Threshold (0.3):** Tuned during implementation against seed data. Set via `SET LOCAL pg_trgm.word_similarity_threshold`.

### Index Migration

```sql
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- B-tree for tenant filtering (verify these exist, add if missing)
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

-- Resident search indexes (admins only)
-- NOTE: auth.users is owned by supabase_auth_admin. These indexes cannot be
-- created via a standard Drizzle migration. Options:
-- (a) Create a public.user_profiles materialized view synced via trigger (recommended)
-- (b) Apply via Supabase SQL Editor with elevated privileges (manual step)
-- For launch, we use option (a): a public.user_search_index table that syncs
-- fullName and email from auth.users via a trigger on auth.users changes.

CREATE TABLE public.user_search_index (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name text,
  email text NOT NULL
);

-- Populate from existing users
INSERT INTO public.user_search_index (user_id, full_name, email)
SELECT id, raw_user_meta_data->>'fullName', email FROM auth.users;

-- Trigger to keep in sync
CREATE OR REPLACE FUNCTION sync_user_search_index() RETURNS trigger AS $$
BEGIN
  INSERT INTO public.user_search_index (user_id, full_name, email)
  VALUES (NEW.id, NEW.raw_user_meta_data->>'fullName', NEW.email)
  ON CONFLICT (user_id) DO UPDATE SET
    full_name = EXCLUDED.full_name,
    email = EXCLUDED.email;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_sync_user_search_index
  AFTER INSERT OR UPDATE ON auth.users
  FOR EACH ROW EXECUTE FUNCTION sync_user_search_index();

-- Now index the public table (no auth schema permission issues)
CREATE INDEX idx_user_search_fullname_trgm ON public.user_search_index
  USING gin (full_name gin_trgm_ops);
CREATE INDEX idx_user_search_email_trgm ON public.user_search_index
  USING gin (email gin_trgm_ops);
CREATE INDEX idx_units_number_btree ON units (unit_number);
```

All `CREATE INDEX` statements validated against the dev database with `EXPLAIN ANALYZE` before the migration ships.

### Resident Search: Hybrid Strategy

Admins only. Three different match strategies for three field types:

```sql
SET LOCAL pg_trgm.word_similarity_threshold = 0.3;

SELECT usi.user_id AS id, usi.email,
  usi.full_name,
  un.unit_number,
  ur.role,
  CASE
    WHEN un.unit_number LIKE $sanitized_input || '%' THEN 0.9
    ELSE GREATEST(
      word_similarity($1, usi.full_name),
      word_similarity($1, usi.email)
    )
  END AS relevance
FROM user_roles ur
JOIN public.user_search_index usi ON usi.user_id = ur.user_id
LEFT JOIN units un ON un.id = ur.unit_id
WHERE ur.community_id = $2
  AND ur.deleted_at IS NULL
  AND (
    usi.full_name %> $1
    OR usi.email %> $1
    OR un.unit_number LIKE $sanitized_input || '%'
  )
ORDER BY relevance DESC
LIMIT $3;
```

- Queries `public.user_search_index` (not `auth.users`) — GIN trigram indexes are on this table
- `%>` on name/email uses GIN trigram indexes
- `LIKE 'prefix%'` on unit_number uses B-tree — no trigram weirdness on short strings
- Unit prefix match gets fixed 0.9 relevance (typing "308" means unit 308)
- `$sanitized_input` is the query with LIKE special characters escaped via TypeScript utility:

```typescript
// apps/web/src/lib/utils/escape-like.ts
export function escapeLikePattern(input: string): string {
  return input.replace(/[%_\\]/g, '\\$&')
}
```

### Document Content Search: Title-First with Tsvector Fallback

Command palette searches document titles via `%>`. If title matches return fewer than `limit` results, falls back to existing tsvector FTS on document content:

```typescript
async function searchDocuments(communityId, query, limit) {
  const titleResults = await titleSearch(communityId, query, limit)
  if (titleResults.length >= limit) return titleResults

  const remaining = limit - titleResults.length
  const titleIds = titleResults.map(r => r.id)
  const contentResults = await contentSearch(communityId, query, remaining, titleIds)

  return [...titleResults, ...contentResults]
}
```

Title results always appear as the first block, content results as the second block. No fake unified relevance score — each block is sorted internally by its own native scoring. The UI can label them "Title matches" vs "Mentioned in content."

The "View all" link on documents goes to the documents list page with `?q=` param. That page uses the same `searchDocuments()` function for consistent results.

### Permission Scoping

- `communityId` is always derived from the authenticated session (middleware), never accepted as a client parameter
- Property managers: scoped to the currently-selected community, not their portfolio
- Row-level filtering by role:

| Entity | Resident filter | Admin filter |
|--------|----------------|--------------|
| Documents | All community docs | All community docs |
| Residents | Not searchable | All community residents |
| Announcements | `archived_at IS NULL` + audience filter (tenants don't see `owners_only`, non-board don't see `board_only`) | `archived_at IS NULL` (includes all audiences) |
| Meetings | All community meetings | All community meetings |
| Maintenance | Own requests only (`submitted_by_id = user.id`) | All community requests |
| Violations | Own unit only (`unit_id IN user_units`) | All community violations |

### Minimum Query Length

| Input type | Minimum | Rationale |
|------------|---------|-----------|
| Numeric (`/^\d+$/`) | 1 character | Unit "4", "7" are valid searches |
| Alpha text | 2 characters | Avoid noisy single-letter matches |
| Static registry | 1 character | Client-side, instant, no API cost |

### Request Cancellation

```typescript
const controllerRef = useRef<AbortController>()

function onQueryChange(q: string) {
  controllerRef.current?.abort()

  if (q.trim() === '') {
    setDataResults(null) // Clear stale results, return to empty state
    return
  }

  controllerRef.current = new AbortController()
  debouncedSearch(q, controllerRef.current.signal) // 300ms debounce
}
```

Each `fetch()` passes `{ signal }`. Previous requests are aborted on new input. Clearing input aborts and resets to empty state.

### "View All" Links

Show `View all ->` without a count. Avoids consistency mismatches between palette counts and destination page results. Links to the entity's list page with `?q=` parameter, using the same query function for consistent results.

---

## 7. Command Palette — Interaction Design

### Trigger & Layout

- **Desktop:** `Cmd+K` / `Ctrl+K`, or click the search bar in the top nav
- **Mobile:** Search icon in the mobile top nav bar (persistent), opens a full-screen search page
- **Desktop layout:** Centered modal overlay, max-width 640px, max-height 70vh, semi-transparent backdrop
- **Mobile layout:** Full-screen page, input at top, single-column results below

### Result Rendering Order

```
┌─────────────────────────────────────┐
│  Search PropertyPro...          ⌘K  │
├─────────────────────────────────────┤
│                                     │
│  Pages & Actions          (instant) │
│  ├─ Upload Document                 │
│  ├─ Compliance Dashboard            │
│  └─ Submit Maintenance Request      │
│                                     │
│  Maintenance             (from API) │
│  ├─ Pool pump leak          Urgent  │
│  └─ View all →                      │
│                                     │
│  Documents               (from API) │
│  ├─ 2026 Annual Budget        PDF   │
│  ├─ Insurance Certificate     PDF   │
│  └─ View all →                      │
│                                     │
│  (other entity groups...)           │
│                                     │
└─────────────────────────────────────┘
```

**Rendering rules:**
- Static registry results (Pages & Actions) always first — instant, highest-intent
- Data groups render as they arrive, **order locks at first paint**
- Late-arriving groups append below existing groups — never re-sort after initial render
- Groups with zero results are hidden
- Each group shows a loading skeleton while its API call is in-flight
- If ALL groups return zero results AND static registry has zero matches: "No results found" with suggestion to try different keywords

### Result Item Display

| Element | Static registry | Data result |
|---------|----------------|-------------|
| Icon | Lucide icon from registry | Entity-type icon |
| Primary text | `label` | Title / name |
| Secondary text | `description` | Status badge, date, category, unit number |
| Type badge | Category pill (Page / Action / Setting) | Entity type label |

### Empty Query State

**Users with history (3+ recent pages):**
- Recent pages (from client-side history)
- Role-suggested quick actions

**First-time users (no history):**
- "Getting Started" section replaces recent pages:
  - Residents: "View Your Documents", "Submit Maintenance Request", "Set Notification Preferences"
  - Admins: "Upload Your First Document", "Add Residents to Your Community", "Schedule a Board Meeting"
- Transitions to recent pages automatically after 3+ history entries

**Suggested actions:** Static default order per audience. Interface designed for future frequency-based sorting from history — swapping in is a one-line change, not a refactor.

### Input Behavior

| State | Behavior |
|-------|----------|
| Empty (just opened) | Recent pages + suggested actions. No API calls. |
| Typing (< min length) | Filter static registry only. No API calls. |
| Typing (>= min length, alpha) | Static registry instantly + 5-6 API calls after 300ms debounce |
| Typing (>= 1 char, numeric) | Same, numeric minimum is 1 character |
| Cleared input | Abort in-flight requests, clear data results, return to empty state |
| Escape | Close palette |

**API call count:** Residents fire 5 calls. Admins fire 6 (includes residents endpoint).

### Keyboard Navigation

- `Up` / `Down` — linear navigation across all visible items including "View all" links. No group-skipping.
- `Enter` — navigate to highlighted item or execute action
- `Escape` — close palette
- Wrap-around: `Down` on last item returns to input. `Up` from input goes to last item.
- Focus stays in input — arrow keys control highlight, not cursor position

### Accessibility

- `role="dialog"` with `aria-label="Search PropertyPro"`
- Input: `role="combobox"` with `aria-expanded`, `aria-controls`, `aria-activedescendant`
- Result list: `role="listbox"`, each item `role="option"`
- Groups: `role="group"` with `aria-label`
- Loading states: `aria-live="polite"` region
- Focus trap within modal while open
- All interactive elements respect `:focus-visible`
- Secondary text and status indicators: 4.5:1 contrast ratio minimum
- Skeleton placeholders: 3:1 contrast against background, visible pulse animation, static fallback for `prefers-reduced-motion`

---

## 8. Help Center Page

### Route & Access

- **Desktop:** `/help` — new sidebar link, visible to all roles, positioned at bottom of main nav group (above Settings)
- **Mobile:** Enhanced `/mobile/help` route, replaces current implementation

### Content Storage: Database-Backed

Help articles live in the database, not TypeScript files:

```sql
CREATE TABLE help_articles (
  id bigserial PRIMARY KEY,
  community_id bigint REFERENCES communities(id) ON DELETE CASCADE,  -- null = platform-wide
  source text NOT NULL CHECK (source IN ('platform', 'community')),
  is_system boolean NOT NULL DEFAULT false,  -- true = not editable by community admins
  title text NOT NULL,
  summary text NOT NULL,
  body text NOT NULL,                        -- Markdown format (rendered with react-markdown)
  keywords text[] NOT NULL DEFAULT '{}',
  audience text NOT NULL CHECK (audience IN ('resident', 'admin', 'all')),
  category text NOT NULL,
  compliance_note text,
  registry_item_id text,  -- cross-reference to feature registry
  sort_order integer NOT NULL DEFAULT 0,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

-- Partial unique index: one help article per registry item for cross-referencing
CREATE UNIQUE INDEX idx_help_articles_registry_item
  ON help_articles (registry_item_id) WHERE registry_item_id IS NOT NULL AND deleted_at IS NULL;
```

**Body format:** Markdown. Stored as Markdown in the database, rendered client-side with `react-markdown`. No raw HTML allowed — Markdown is sanitized by default via react-markdown's AST parser (no `dangerouslySetInnerHTML`).

### Access Control (RLS)

The `help_articles` table uses a **non-standard RLS pattern** because `community_id` is nullable for platform-wide articles:

```sql
-- Read: authenticated users can read platform articles (community_id IS NULL)
-- and articles for their own community
ALTER TABLE help_articles ENABLE ROW LEVEL SECURITY;
ALTER TABLE help_articles FORCE ROW LEVEL SECURITY;

CREATE POLICY help_articles_read ON help_articles
  FOR SELECT USING (
    community_id IS NULL  -- platform articles visible to all authenticated users
    OR community_id = current_setting('app.community_id')::bigint  -- community articles scoped
  );

-- Write: platform articles are seed-script only (no RLS write for source='platform').
-- Community articles: admin roles can insert/update/delete for their own community.
CREATE POLICY help_articles_community_write ON help_articles
  FOR ALL USING (
    source = 'community'
    AND community_id = current_setting('app.community_id')::bigint
  );
```

**Query approach:** `createScopedClient(communityId)` sets `app.community_id`. The RLS policy's `OR community_id IS NULL` clause automatically includes platform articles. No custom query helper needed — the standard scoped client works.

### API Endpoint

```
GET /api/v1/help/articles?audience=resident|admin
```

Returns all articles for the community (platform + community FAQs), filtered by audience and role. Articles are fetched once on page mount and cached client-side via TanStack Query with `staleTime: 5 * 60 * 1000` (5 minutes). Help center search is performed client-side on the cached array.

**Seeding with version guard:**

```sql
INSERT INTO help_articles (id, title, summary, body, keywords, version, ...)
VALUES (...)
ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title,
  summary = EXCLUDED.summary,
  body = EXCLUDED.body,
  keywords = EXCLUDED.keywords,
  version = EXCLUDED.version,
  updated_at = now()
WHERE help_articles.version <= EXCLUDED.version;
```

Seed script bumps version when content changes. Manual edits via future admin UI bump version, protecting them from seed overwrites.

**Technical debt (acknowledged):** Platform article editing requires the seed script for launch. Internal admin UI for editing without deploys is deferred. The schema supports it from day one.

### Page Layout

**Browsing (no search query):** Two-section layout.

Section A — Platform Guide: Role-filtered articles grouped by category, with category chips for navigation.

Section B — Community FAQs: Admin-managed, community-specific content in accordion format.

**Searching (query entered):** Sections merge into a single ranked list. Each result has a subtle source tag ("Platform Guide" or "Community FAQ") but they're interleaved by relevance tier, not separated by source.

### Audience Filtering

**Resident view:**
- Categories: "Your Unit", "Documents & Notices", "Maintenance & Repairs", "Meetings & Events", "Payments & Dues", "Account & Settings"
- Language: simple, first-person ("How to view your documents")
- Admin-only articles hidden entirely

**Admin view:**
- Categories: "Document Management", "Compliance & Statutes", "Meetings & Notices", "Violations & Hearings", "Residents & Units", "Finance & Assessments", "E-Sign & Contracts", "System & Settings"
- Language: operational ("Posting documents for compliance")
- Includes compliance notes where relevant

### Search: Keywords + Tiered Matching

Every article has a `keywords` array with natural language synonyms. Community FAQ admin interface includes an optional "Search keywords" field.

**Tiered matching (no scoring algorithm):**

| Tier | Match rule | Example: query "pipe" |
|------|-----------|----------------------|
| Tier 1 | Query matches a keyword array element exactly (case-insensitive) | keywords includes "pipe" |
| Tier 2 | Query is a prefix of any keyword, OR appears as a whole word in the title | keyword "pipeline" starts with "pipe", or title contains word "pipe" |
| Tier 3 | Query appears as a substring anywhere in title, summary, body, or any keyword | body contains "...leaking pipe under..." |

Results display in tier order. Within a tier, preserve `sortOrder` from database. Platform and community articles interleave within tiers.

```typescript
function searchHelpArticles(query: string, articles: HelpArticle[]): HelpArticle[] {
  const q = query.toLowerCase().trim()
  const tier1: HelpArticle[] = []
  const tier2: HelpArticle[] = []
  const tier3: HelpArticle[] = []

  for (const article of articles) {
    const keywords = article.keywords.map(k => k.toLowerCase())
    const titleWords = article.title.toLowerCase().split(/\s+/)

    if (keywords.includes(q)) {
      tier1.push(article)
    } else if (keywords.some(k => k.startsWith(q)) || titleWords.includes(q)) {
      tier2.push(article)
    } else if (
      article.title.toLowerCase().includes(q) ||
      article.summary.toLowerCase().includes(q) ||
      article.body.toLowerCase().includes(q) ||
      keywords.some(k => k.includes(q))
    ) {
      tier3.push(article)
    }
  }

  const bySortOrder = (a: HelpArticle, b: HelpArticle) => a.sortOrder - b.sortOrder
  return [...tier1.sort(bySortOrder), ...tier2.sort(bySortOrder), ...tier3.sort(bySortOrder)]
}
```

### Empty Community FAQ Handling

| User role | Community has FAQs? | Behavior |
|-----------|-------------------|----------|
| Admin | No | Show empty section with CTA and explanation of what community FAQs are for |
| Admin | Yes | Show FAQs + "Manage FAQs" link |
| Resident | No | Hide section entirely |
| Resident | Yes | Show FAQs in accordion |

### Mobile Help Center

Same content, same audience filtering, same search with keywords. Mobile-specific layout:

- Single-column layout — categories as vertical expandable sections (not chip grid)
- Search bar at top — same keyword-aware tiered filtering, unified results during search
- Accordion-style article expansion (matching existing mobile FAQ UI pattern)
- Same two-section browse / unified search behavior as desktop
- Entry point: existing "Help Center" link in mobile "More" tab
- Same API endpoint, same role filtering

Replaces the current `/mobile/help` implementation. The existing mobile FAQ admin interface (`/mobile/help/manage`) continues to work for community FAQ CRUD.

### Integration Points

- **Command palette -> Help center:** Registry includes "Help Center" page item. Individual articles are NOT searchable from the command palette — palette finds features, help center explains them.
- **Empty states -> Help center:** Empty state components link to relevant help articles via `registryItemId`.
- **Sidebar -> Help center:** New "Help" item in sidebar, bottom of main nav group, visible to all roles.

---

## 9. Command Palette — Migration from cmdk

The existing command palette uses the `cmdk` library. The upgraded palette requires custom behavior beyond cmdk's capabilities (progressive async result rendering, per-group skeletons, group-order locking, data result sections).

**Approach:** Replace `cmdk` with a custom combobox built on Radix UI's `Dialog` + custom listbox. Radix provides the accessible dialog overlay, focus trap, and keyboard event handling. The result list, grouping, skeleton states, and progressive rendering are custom components.

**Why not extend cmdk:** cmdk's `Command.List` expects synchronous items. The async progressive rendering with per-group loading states and order locking would require fighting cmdk's internals rather than working with them.

---

## 10. Migration & Data Requirements

### Migration Range

Migrations for this feature use range **0109-0112** (verify against all branches before creation):
- `0109_add_pg_trgm_and_search_indexes.sql` — extension + entity GIN indexes
- `0110_add_user_search_index.sql` — user_search_index table, trigger, GIN indexes
- `0111_add_help_articles.sql` — help_articles table, RLS policies, partial unique index
- `0112_add_units_number_index.sql` — B-tree on units.unit_number

### Database Migration

1. `pg_trgm` extension + GIN trigram indexes on all searchable entity title fields
2. `public.user_search_index` table synced from `auth.users` via trigger (avoids auth schema permission issues)
3. GIN trigram indexes on `user_search_index.full_name` and `email`
4. B-tree index on `units.unit_number`
5. `help_articles` table with version, source, audience, keywords fields, RLS policies
6. All indexes validated with `EXPLAIN ANALYZE` against seed data before shipping

### Seed Data

- ~50 platform help articles covering all features from the help center audit
- Version-guarded upsert script (`pnpm seed:help-articles`)
- Each article includes keywords array with natural language synonyms

### Feature Registry

- ~50 registry items covering all pages, actions, and settings
- Keyword arrays for natural language discovery
- Role and feature-flag filtering

---

## 11. Open Questions & Future Work

| Item | Status | Notes |
|------|--------|-------|
| Portfolio-wide search for PMs | Future | Requires separate security model, different scale assumptions |
| Help article admin UI (no-deploy editing) | Deferred | Schema supports it, building UI deferred to post-launch |
| Frequency-based suggested actions | Future | Interface supports it, v1 uses static defaults |
| Feature tours / interactive onboarding | Future | Separate design needed |
| Search analytics (track queries) | Future | Inform content gaps and keyword improvements |
| Search result highlighting | Deferred | Bold matching substrings in results — improves scanability |
| Search-specific rate limiting | Note | Existing middleware rate limiter covers search endpoints; monitor for abuse |
