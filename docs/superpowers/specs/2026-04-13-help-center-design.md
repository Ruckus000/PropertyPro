# Help Center Design Spec

**Date:** 2026-04-13
**Status:** Draft
**Author:** Claude (brainstorming session)

---

## Overview

A comprehensive, role-aware help center for PropertyPro that combines a curated platform knowledge base (MDX articles in the repo) with community-specific content (FAQs and pinned articles in the DB). The help center is accessible via dedicated pages, an embedded widget on every authenticated page, and contextual links within features.

**Design goals:**
- World-class documentation quality (Vercel/Notion-tier, not property-management-tier)
- Role-aware personalization that surfaces relevant content first without hiding anything
- Three-layer access: full help center pages, embedded widget, and contextual feature links
- Platform content authored as MDX by the PropertyPro team; community content managed by admins via UI

## Architecture Decision: In-App Routes + Static Content Layer

Help routes live in `apps/web/` under the `(authenticated)` route group. MDX articles are compiled on demand by `next-mdx-remote` in server components. No ISR, no `generateStaticParams`, no separate docs app.

**Why this approach:**
- Matches the app's existing fully-dynamic server rendering model (zero use of static generation in the codebase)
- Single deployment — no cross-app auth or widget embedding complexity
- Content pages are effectively free (read file + compile MDX is fast for <100 articles)
- Widget component lives in the app shell, direct access to user context

**Rejected alternatives:**
- Separate `apps/help/` docs app — cross-app auth complexity, duplicated layout, two deployments
- ISR + `generateStaticParams` — architecturally alien (zero precedent in codebase), Vercel cache gotchas, no meaningful performance gain for this content volume

---

## Section 1: Content Architecture & MDX Pipeline

### Directory Structure

```
apps/web/src/content/help/
  getting-started/
    welcome-to-propertypro.mdx
    understanding-your-dashboard.mdx
  compliance/
    compliance-scoring-explained.mdx
    document-posting-requirements.mdx
  documents/
    uploading-documents.mdx
  maintenance/
    submitting-a-request.mdx
  meetings/
    meeting-notices-explained.mdx

public/help/
  images/         # Hand-crafted screenshots, per-article
  diagrams/       # SVG illustrations (role hierarchy, compliance flow)
```

Content lives inside `apps/web/src/content/help/` — naturally part of the web app's file tree, tracked by Turbo without config changes. Images served from `public/help/` via Next.js static file serving.

### MDX Frontmatter Schema (7 fields)

```yaml
title: "Understanding Your Compliance Score"
description: "How PropertyPro calculates your community's compliance score and what actions improve it."
category: "compliance"
slug: "compliance-scoring-explained"
roles: ["board_member", "board_president", "cam", "property_manager_admin"]
keywords: ["compliance", "score", "percentage", "documents", "posting"]
relatedArticles: ["document-posting-requirements", "meeting-notice-rules"]
```

**Derived at render time, not stored:**
- **Read time:** word count / 200, computed by the article service
- **Last updated:** derived from `git log` on the file (or file mtime as fallback)

Fields like `difficulty`, `coverImage`, and `communityTypes` can be added to the schema when articles actually need them — the frontmatter parser ignores unknown fields, so this is backwards-compatible.

### Optional frontmatter: `contextPaths` (8th field, not required)

Articles that are relevant as contextual help for specific routes declare:

```yaml
contextPaths: ["/compliance", "/communities/*/compliance"]
```

The article service builds a reverse index (route -> articles) from this field at cache time. Glob matching uses a simple custom function (split on `/`, match `*` as any single segment) — no `minimatch` dependency needed for this limited pattern set. Only `*` (single path segment wildcard) is supported, not `**` or brace expansion.

### MDX Rendering

`next-mdx-remote` compiles MDX on demand in server components. No build-time compilation, no `@next/mdx` config, no changes to `next.config.ts`. MDX files are data, not modules.

```
Request -> Server component reads .mdx file -> next-mdx-remote compiles -> React tree -> HTML
```

### MDX Components (3 for v1)

| Component | Purpose |
|---|---|
| `Callout` | `type: "info" / "warning" / "tip" / "florida-statute"`. Styled container with icon, title, body. The `florida-statute` variant links to statute references. |
| `StepByStep` | Numbered procedural walkthrough. Each step has title, description, optional image slot. |
| `Screenshot` | Image with alt text, optional caption, optional highlighted region overlay (CSS-based). Wraps `next/image`. |

Additional components (`RoleBadge`, `VideoEmbed`, `CommunityTypeNote`, etc.) get built when article content demands them. `RelatedArticles` renders automatically from frontmatter at the bottom of every article — it's a page-level concern, not an MDX component.

### Article Service (`help-article-service.ts`)

A cached server function following the existing service pattern (mirrors `faq-service.ts`):

```
getAllArticles()        -> cached fs.readdir + gray-matter parse -> article metadata[]
getArticle(slug)        -> read single .mdx + next-mdx-remote compile -> rendered content
getArticlesByRole(role) -> getAllArticles() filtered by role
searchArticles(query)   -> getAllArticles() filtered by full-text match on title + description + keywords
getCategoryTree()       -> getAllArticles() grouped by category
getContextualArticles(path) -> reverse index lookup by route path
getArticleUrl(slug)     -> returns URL if article exists, null if not (for HelpLink validation)
```

**Cache strategy:** Module-level singleton (`let articlesCache: ArticleMetadata[] | null = null`) with lazy initialization. In development mode (`NODE_ENV === 'development'`), bypass cache and re-read from disk on every request. On Vercel, module variables persist per serverless instance — effective without risk of long-lived staleness (new deploy = new instances = fresh cache).

### Visual Guide Strategy

**v1: Hand-crafted images.** Screenshots stored in `public/help/images/`, diagrams as SVG in `public/help/diagrams/`. Referenced in MDX via the `Screenshot` component.

**v2 (future): Programmatic screenshots.** Playwright-based captures of authenticated UI states, triggered in CI after UI-affecting PRs, with diff detection to flag stale screenshots. Deferred until article count exceeds ~30 and screenshot maintenance becomes a pain point.

### New Dependencies

| Package | Purpose | Size |
|---|---|---|
| `next-mdx-remote` | Server-side MDX compilation | ~15KB |
| `gray-matter` | YAML frontmatter parsing | ~7KB |

Not adding: `remark-gfm` (GFM features deferred), `rehype-highlight` (no code blocks in property management help), `rehype-slug` (TOC anchors can use a simple plugin later).

---

## Section 2: Routes, Pages, Navigation & Help Widget

### Route Structure

```
apps/web/src/app/(authenticated)/help/
  page.tsx                          # Help hub — personalized landing
  search/page.tsx                   # Search results
  [category]/page.tsx               # Category listing
  [category]/[slug]/page.tsx        # Article page
  manage/page.tsx                   # Admin: community FAQ management (desktop port)
```

`/help` added to `PROTECTED_PATH_PREFIXES` in `middleware.ts`. Help requires authentication because role-aware personalization requires knowing who the user is.

PM dashboard users at `/pm/*` access the same `/help` routes — the `(authenticated)` layout is shared, and PM-specific articles surface through role-based personalization (`roles: ["property_manager_admin"]`).

### Page Designs

#### Help Hub (`/help`)

Not a wall of categories. Personalized by role.

- **Search bar** — Prominent, top of page. Placeholder adapts by role.
- **Quick links** — 3-4 role-relevant article cards. Driven by `ROLE_QUICK_LINKS: Record<CommunityRole, string[]>` config mapping roles to article slugs.
- **Platform articles by category** — Grouped, role-relevant categories sort first. Each category card shows article count and description.
- **Pinned articles** — If the community admin has pinned platform articles, a "Recommended by your management" section appears between platform articles and community FAQs.
- **Community FAQs** — Community's custom FAQs (from DB). Admin "Manage FAQs" link if user has admin role.

#### Article Page (`/help/[category]/[slug]`)

- MDX rendered via `next-mdx-remote` with custom components
- Sidebar: auto-generated table of contents (from headings) + related articles (from frontmatter)
- Role badges on article header showing primary audience
- "Was this helpful?" feedback at bottom (yes/no, stored in DB)
- Breadcrumb: Help > Category > Article title
- Responsive: sidebar collapses to top-of-page TOC dropdown on mobile viewport

#### Search Results (`/help/search?q=...`)

- Queries article service (platform articles) AND FAQ API (community FAQs) in parallel via `Promise.all`
- Results grouped: "Platform Guides" and "Community FAQs" as separate sections
- Each result: title, description snippet with highlighted match, category badge, role badges
- Empty state with keyword suggestions

#### FAQ Management (`/help/manage`)

Desktop port of existing mobile FAQ management (`/mobile/help/manage`). Admin-only. CRUD for community FAQs with the new `category` and `role_visibility` fields.

### Navigation Integration (3 entry points)

#### 1. Top bar `?` button (primary)

`CircleHelp` icon button next to the profile avatar in `app-top-bar.tsx`. Opens the help widget. Visible on every authenticated page. This is the primary discovery mechanism.

**Rationale:** The sidebar sections (Community, Management, Admin) are feature navigation. Help is a utility — it belongs alongside Settings in the chrome, not alongside Documents and Compliance.

#### 2. Command palette "Help" group

A static `help` page item added to `getCommandItems()` in `command-palette.tsx`:

```typescript
{ id: 'help', label: 'Help Center', icon: CircleHelp, href: '/help', group: 'page', keywords: 'help support faq guide documentation' }
```

One-line addition to the existing `globalItems` array. Async article search in the command palette deferred to v2 — the widget already provides help-specific search.

#### 3. Profile dropdown "Help" link

`Help` menu item in `profile-menu.tsx`, between "Settings" and "Data Export". Links to `/help`. Low-effort, high-discoverability fallback.

### Mobile Considerations

The existing `/mobile/help` page shows community FAQs only. Enhanced to also show:
- "Quick guides" section — 3-4 role-relevant platform article links (cards that navigate to `/help/[category]/[slug]`, which is responsive)
- Existing FAQ accordion, contact card, and admin manage link remain untouched

Desktop article pages (`/help/[category]/[slug]`) are fully responsive — no separate mobile article rendering path.

### Help Widget

Persistent help panel accessible from any page via the `?` button or `?` keyboard shortcut.

**Architecture:**
- **Component:** `apps/web/src/components/help/help-widget.tsx` (client component)
- **State:** `HelpWidgetProvider` context (following existing `useSidebar` pattern). Exposes `isOpen`, `open()`, `close()`, `toggle()`.
- **Mounting:** Rendered in the app shell layout, alongside the sidebar. Always in DOM, visibility toggled.
- **Data:** TanStack Query hooks fetch on widget open, not on page load.

**Widget contents (slide-out drawer, right side):**

1. **Search bar** — Searches platform articles + community FAQs. Results are links to full article pages (widget is for discovery, not reading).
2. **Contextual suggestions** — "Relevant to this page" section, 2-3 articles based on current route. Powered by `contextPaths` frontmatter field.
3. **Recently viewed** — Last 3-5 articles (stored in `localStorage`, same pattern as `useRecentPages` in command palette).
4. **Community FAQs** — Top 3, with "View all" link to `/help`.
5. **Footer** — "Visit Help Center" link to `/help`.

**Keyboard shortcut:** `?` key toggles the widget when no input is focused. Global keydown listener with `event.target` check. Gated behind `matchMedia('(pointer: fine)')` to skip registration on touch devices.

### Contextual Help Links

Reusable `HelpLink` component:

```tsx
<HelpLink article="compliance-scoring-explained" />
// Renders: small CircleHelp icon linking to /help/compliance/compliance-scoring-explained
```

**Validation:** `HelpLink` calls `getArticleUrl(slug)` server-side. Renders nothing if the article doesn't exist — no broken links, graceful absence. A CI script can scan for `HelpLink` references to deleted articles.

**Placement (v1):**
- Compliance dashboard (score explanation)
- Document upload form (category requirements)
- Meeting notice creation (timing rules)
- Violation reporting (process explanation)
- E-sign templates (workflow explanation)

### FAQ Schema Evolution

**New columns on `faqs`:**
- `category: text` (nullable) — Groups FAQs by topic. Null = uncategorized (backwards compatible).
- `role_visibility: text[]` (nullable) — Roles that can see this FAQ. Null = all roles (backwards compatible).

**New table: `community_pinned_articles`:**
- `id: bigserial PK`
- `community_id: bigint FK -> communities (cascade)`
- `article_slug: text NOT NULL`
- `sort_order: integer DEFAULT 0`
- `pinned_by: uuid FK -> auth.users (SET NULL on delete)`
- `created_at: timestamptz NOT NULL DEFAULT now()`
- `deleted_at: timestamptz` (soft delete)
- `UNIQUE(community_id, article_slug) WHERE (deleted_at IS NULL)`

---

## Section 3: Search, Personalization & Data Flow

### Search Architecture

Two data sources, two strategies, one unified response.

**Platform articles (filesystem):**
Article service loads all frontmatter into memory and caches as module singleton. Search is string matching: split query into terms, match against title + description + keywords, score by match density. For <100 articles, this is instant.

**Community FAQs (database):**
Simple `ILIKE` on `question` and `answer` columns, scoped by community via `createScopedClient()`. No trigram/tsvector needed — FAQ volume is <50 per community. Upgrade path to `pg_trgm` is clear from existing `trigram-search.ts` patterns if needed.

**Unified search response:**

```
Promise.all([
  searchPlatformArticles(query, userRole),
  searchCommunityFaqs(query, communityId, userRole),
])
-> { articles: ArticleSearchResult[], faqs: FaqSearchResult[] }
```

Results returned as two separate arrays, rendered in distinct UI sections. No cross-source relevance ranking needed.

### Personalization

Personalization = filtering and sorting by role. Not an "engine."

1. User's role comes from the session (middleware headers -> `requireCommunityMembership()`)
2. Articles have `roles: string[]` in frontmatter (empty = all roles)
3. Role-matched articles sort first; non-matched articles appear below. **Nothing is hidden.**

**Three surfaces:**

| Surface | Behavior |
|---|---|
| Help hub quick links | 3-4 cards from `ROLE_QUICK_LINKS` config (hardcoded, editorial choice). |
| Category listings | All articles shown. Role-matched sort first, then alphabetical. |
| Widget contextual | Articles matching `contextPaths` for current route, filtered to role-relevant. Max 3. |

**Community type awareness:** Handled at category level ("Condo Compliance" vs "HOA Compliance"), not per-article tagging.

### Data Flow

**Server components (help pages):**

```
Request -> Middleware (auth, tenant context) -> Server Component
  +-- reads role from membership lookup
  +-- calls getArticles() (cached filesystem read)
  +-- filters/sorts by role
  +-- renders page (for article pages: next-mdx-remote compile)
```

**Client components (help widget):**

TanStack Query hooks following existing patterns (26 hooks in `apps/web/src/hooks/`):

```typescript
// apps/web/src/hooks/use-help.ts
export const HELP_KEYS = {
  search: (query: string) => ['help', 'search', query] as const,
  contextual: (path: string) => ['help', 'contextual', path] as const,
};

export function useHelpSearch(query: string, communityId: number) {
  return useQuery({
    queryKey: HELP_KEYS.search(query),
    queryFn: () => fetch(`/api/v1/help/search?q=${encodeURIComponent(query)}&communityId=${communityId}`)
      .then(r => r.json()),
    enabled: query.length >= 2,
    staleTime: 60_000,
  });
}

export function useContextualHelp(path: string) {
  return useQuery({
    queryKey: HELP_KEYS.contextual(path),
    queryFn: () => fetch(`/api/v1/help/contextual?path=${encodeURIComponent(path)}`)
      .then(r => r.json()),
    staleTime: 300_000,
  });
}
```

### API Routes

| Route | Method | Auth | Purpose |
|---|---|---|---|
| `/api/v1/help/search` | GET | Required | Unified search across articles + FAQs |
| `/api/v1/help/contextual` | GET | Required | Articles matching a given route path |
| `/api/v1/help/feedback` | POST | Required | "Was this helpful?" signal |
| `/api/v1/help/pinned-articles` | GET | Required | Community's pinned articles |
| `/api/v1/help/pinned-articles` | POST | Required (admin) | Pin/unpin a platform article |

All routes follow existing patterns: `withErrorHandler`, `requireAuthenticatedUserId()`, `requireCommunityMembership()`, Zod validation, `createScopedClient()`, audit logging on mutations.

### Feedback Table

```
help_article_feedback:
  id: bigserial PK
  community_id: bigint FK -> communities (cascade)
  user_id: uuid FK -> auth.users (cascade)
  article_slug: text NOT NULL
  helpful: boolean NOT NULL
  created_at: timestamptz NOT NULL DEFAULT now()
```

No unique constraint — users can vote on the same article multiple times (latest vote is what matters for analytics). Index on `(article_slug, helpful)` for aggregate queries.

### Cache Strategy

| Data source | Cache | Invalidation |
|---|---|---|
| Platform articles (filesystem) | Module-level singleton | Server restart (deploy). Dev mode: no cache. |
| Community FAQs (DB) | None (scoped query per request) | Automatic — writes immediately visible. |
| Pinned articles (DB) | None | Automatic. |
| Search results (TanStack Query) | Client, `staleTime: 60s` | Auto-refetch after stale. |
| Contextual suggestions (TanStack Query) | Client, `staleTime: 5min` | Route change = new query key = new fetch. |

---

## Section 4: Database Migrations, File Manifest & Content Seeding

### Migrations

Next file: `0142`. Next journal index: `143`.

**0142: Enhance FAQs for help center**

```sql
ALTER TABLE faqs ADD COLUMN category text;
ALTER TABLE faqs ADD COLUMN role_visibility text[];
COMMENT ON COLUMN faqs.category IS 'Optional grouping label for help center display';
COMMENT ON COLUMN faqs.role_visibility IS 'Array of community roles that can see this FAQ. NULL = all roles.';
```

**0143: Community pinned articles**

```sql
CREATE TABLE community_pinned_articles (
  id bigserial PRIMARY KEY,
  community_id bigint NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  article_slug text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  pinned_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  UNIQUE(community_id, article_slug) WHERE (deleted_at IS NULL)
);

ALTER TABLE community_pinned_articles ENABLE ROW LEVEL SECURITY;
ALTER TABLE community_pinned_articles FORCE ROW LEVEL SECURITY;

CREATE POLICY "Tenant isolation"
  ON community_pinned_articles
  USING (community_id = current_setting('app.current_community_id')::bigint);

CREATE TRIGGER enforce_community_scope
  BEFORE INSERT OR UPDATE ON community_pinned_articles
  FOR EACH ROW
  EXECUTE FUNCTION enforce_community_write_scope();
```

**0144: Help article feedback**

```sql
CREATE TABLE help_article_feedback (
  id bigserial PRIMARY KEY,
  community_id bigint NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  article_slug text NOT NULL,
  helpful boolean NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE help_article_feedback ENABLE ROW LEVEL SECURITY;
ALTER TABLE help_article_feedback FORCE ROW LEVEL SECURITY;

CREATE POLICY "Tenant isolation"
  ON help_article_feedback
  USING (community_id = current_setting('app.current_community_id')::bigint);

CREATE TRIGGER enforce_community_scope
  BEFORE INSERT OR UPDATE ON help_article_feedback
  FOR EACH ROW
  EXECUTE FUNCTION enforce_community_write_scope();

CREATE INDEX idx_help_feedback_article
  ON help_article_feedback(article_slug, helpful)
  WHERE community_id IS NOT NULL;
```

### Complete File Manifest

**New files (29):**

```
# Content
apps/web/src/content/help/getting-started/welcome-to-propertypro.mdx
apps/web/src/content/help/getting-started/understanding-your-dashboard.mdx
apps/web/src/content/help/compliance/compliance-scoring-explained.mdx
apps/web/src/content/help/compliance/document-posting-requirements.mdx
apps/web/src/content/help/documents/uploading-documents.mdx
apps/web/src/content/help/maintenance/submitting-a-request.mdx
apps/web/src/content/help/meetings/meeting-notices-explained.mdx

# Database
packages/db/migrations/0142_enhance_faqs_for_help_center.sql
packages/db/migrations/0143_community_pinned_articles.sql
packages/db/migrations/0144_help_article_feedback.sql
packages/db/src/schema/community-pinned-articles.ts
packages/db/src/schema/help-article-feedback.ts

# Services
apps/web/src/lib/services/help-article-service.ts

# API routes
apps/web/src/app/api/v1/help/search/route.ts
apps/web/src/app/api/v1/help/contextual/route.ts
apps/web/src/app/api/v1/help/feedback/route.ts
apps/web/src/app/api/v1/help/pinned-articles/route.ts

# Pages
apps/web/src/app/(authenticated)/help/page.tsx
apps/web/src/app/(authenticated)/help/search/page.tsx
apps/web/src/app/(authenticated)/help/[category]/page.tsx
apps/web/src/app/(authenticated)/help/[category]/[slug]/page.tsx
apps/web/src/app/(authenticated)/help/manage/page.tsx

# Components
apps/web/src/components/help/help-widget.tsx
apps/web/src/components/help/help-widget-provider.tsx
apps/web/src/components/help/help-link.tsx
apps/web/src/components/help/help-search-input.tsx
apps/web/src/components/help/article-feedback.tsx
apps/web/src/components/help/mdx-components.tsx

# Hooks
apps/web/src/hooks/use-help.ts
```

**Modified files (12):**

```
apps/web/src/middleware.ts                           # Add /help to PROTECTED_PATH_PREFIXES
apps/web/src/components/layout/nav-config.ts         # Add help to PAGE_TITLES
apps/web/src/components/layout/command-palette.tsx    # Add Help Center to globalItems
apps/web/src/components/layout/app-top-bar.tsx       # Add ? button
apps/web/src/components/layout/profile-menu.tsx      # Add Help link
apps/web/src/app/(authenticated)/layout.tsx          # Mount HelpWidgetProvider + HelpWidget
apps/web/src/components/mobile/MobileHelpContent.tsx # Add platform article quick links
apps/web/src/app/mobile/help/page.tsx                # Fetch platform articles alongside FAQs
packages/shared/src/default-faqs.ts                  # Expand from 5 to ~15 default FAQs
packages/db/src/schema/faqs.ts                       # Add category, roleVisibility columns
packages/db/src/schema/index.ts                      # Add exports for new schema files
apps/web/package.json                                # Add next-mdx-remote, gray-matter
```

### Content Seeding

**Platform articles (7 initial):** MDX files checked into repo. No seeding mechanism — they're source code. Available on deploy.

7 articles across 4 categories is the right starting set. Each article should be thorough. Expand based on feedback signals (zero-result searches, low helpful rates).

**Default FAQs (expand from 5 to ~15):** New entries in `DEFAULT_FAQS` covering violations, e-sign, payments, board polls, emergency broadcasts, move-in/out, community settings, and compliance (brief, linking to platform article).

Each new FAQ gets a `category` value. Existing FAQs get categories retroactively. The `ensureFaqsExist()` lazy-seed only runs when `existing.length === 0`, so existing communities keep their customized FAQs. New communities get the full 15.

**Pinned articles:** No default pins. Each community admin curates their own set. The help hub gracefully handles empty state (section doesn't render).

---

## Design Decisions Log

| Decision | Choice | Rationale |
|---|---|---|
| Content format | MDX in repo (platform) + DB (community) | Editorial quality + community self-service |
| Visual guides | Static images v1, programmatic screenshots v2 | Ship fast, automate when maintenance burden justifies it |
| Role filtering | Personalize (sort), don't gate (hide) | Board presidents need to see tenant docs; CAMs reference owner-facing content |
| Contextual help | Help pages + contextual links + embedded widget | Three-layer access for different user intents |
| Search | Postgres full-text for FAQs, in-memory string match for articles | Right-sized for content volume, no over-engineering |
| Community content | Enhanced FAQs + pinned platform articles | Curation > authoring for community admins |
| MDX rendering | `next-mdx-remote` (on-demand) | Matches app's dynamic rendering model, zero static generation precedent |
| Article caching | Module singleton, not `unstable_cache` | Simpler, no new API, codebase has zero `unstable_cache` usage |
| Help widget location | `apps/web/src/components/help/` not `packages/ui/` | Only one consumer, extract when needed |
| Frontmatter fields | 7 essential, not 11 | Less maintenance per article = more articles written |
| MDX components | 3 for v1, not 8 | Build what articles need, not what might be useful |
| Context mapping | `contextPaths` in frontmatter, not separate config | Articles own their context, reverse index built at cache time |

## Out of Scope (Future)

- **AI-powered search / semantic search** — v2 after content volume justifies embeddings
- **Programmatic screenshot automation** — v2 after 30+ articles
- **Help analytics dashboard** — v2 after meaningful traffic volume
- **Async article search in command palette** — v2, requires refactoring command palette to support async
- **Multilingual support** — Not on roadmap
- **Interactive feature tours / guided walkthroughs** — Separate feature, not part of help center
- **Community admin rich content editor** — Upgrade path from FAQs if demand emerges
