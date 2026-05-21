# Help Docs Modal — Design Spec

**Date:** 2026-05-20
**Status:** Draft for plan
**Supersedes part of:** [2026-04-13-help-center-design.md](./2026-04-13-help-center-design.md) (drawer-mode help widget UI)
**Related memory:** `project_help_center_already_exists.md`

## Problem

PropertyPro already has a substantial help center built across PRs #98 → #219 (workstreams WS1a → WS6): ~50 MDX articles, role-aware filtering, feature gating, view tracking, feedback, contextual matching by route. But discoverability and in-flow reading are weak:

1. **Trigger is non-discoverable.** The only on-screen help affordance is a `CircleHelp` icon in the top bar at [app-top-bar.tsx:50](../../apps/web/src/components/layout/app-top-bar.tsx#L50) — no label, only the `?` keyboard shortcut hints at it.
2. **Article reading interrupts the user's flow.** Clicking a contextual match navigates away to `/help/<category>/<slug>`. The user loses the screen they were trying to learn about.
3. **Drawer is a search/list UI, not a documentation reader.** The existing [help-widget.tsx](../../apps/web/src/components/help/help-widget.tsx) shows a search box and a list of cards — it's not styled like a docs page (no sticky TOC, no typography hierarchy for long-form reading).

## Goal

Make every authenticated screen have a discoverable help affordance that opens a **shadcn-docs-style modal** showing the contextual help article inline, without navigating away. Reuse all existing MDX content, services, hooks, and APIs.

## Non-goals

- Building a new content-management system. MDX in repo stays the source of truth (a prior `help_articles` DB table was explicitly dropped in [migration 0002](../../packages/db/migrations/0002_reconcile_help_articles_user_search.sql)).
- Adding a second per-page help button beyond the existing top-bar one — that would create redundant affordances.
- Replacing the `/help/<category>/<slug>` route. It remains for deep-linking, SEO, and external sharing.
- Per-community help customization. Articles stay platform-global.
- Rich-text WYSIWYG authoring. Devs author MDX in PRs.

## Architecture

**One trigger, one experience.** The existing top-bar `CircleHelp` button (and `?` keyboard shortcut) opens a new `<HelpDocsModal/>`. The current `<HelpWidget/>` drawer is replaced — not augmented. Behind a feature flag during rollout; old widget deleted at cleanup.

```
HelpWidgetProvider (existing client context, extended w/ selectedArticle state)
├─ AppTopBar — CircleHelp button → toggleHelp() (existing wiring)
├─ [authenticated pages, untouched]
└─ HelpDocsModal (NEW, lazy-loaded via next/dynamic)
   ├─ if HELP_DOCS_MODAL_ENABLED → render
   ├─ on open: useContextualHelp(pathname, communityId) → 0..3 articles
   │   ├─ ≥1 match → open to first article; left rail = TOC + "More for this page"
   │   └─ 0 match → open to search-and-browse panel
   └─ <HelpArticleBody/> (NEW shared component, extracted from /help/[cat]/[slug]/page.tsx)
       ├─ <MDXRemote {...source} components={helpMdxComponents}/>
       ├─ <TableOfContents items={tocItems}/>  (existing)
       ├─ <ArticleFeedback/>  (existing)
       └─ <ArticleViewTracker/>  (existing)
```

### Why reuse instead of rebuild

| Existing capability | Where it lives | Reuse decision |
|---|---|---|
| ~50 MDX articles across 18 categories | `apps/web/src/content/help/<category>/<slug>.mdx` | Keep as-is |
| Frontmatter Zod schema, CI guard | `apps/web/src/lib/help/frontmatter-schema.ts`, `pnpm guard:help-content` | Keep as-is |
| Role-aware visibility | `isArticleVisibleToRole()` in `help-article-service.ts` | Reuse |
| Feature-flag visibility | `filterArticlesByFeatures()` in `help-article-service.ts` | Reuse |
| Contextual matching by route | `getContextualArticles(pathname, role, limit=3)` + frontmatter `contextPaths` | Reuse |
| MDX components (callouts, code, images) | `helpMdxComponents` in `mdx-components.tsx` | Reuse |
| TOC extraction | `extractTableOfContents(rawMdx)` in `lib/help/toc.ts` | Reuse |
| Search API | `GET /api/v1/help/search` | Reuse |
| Contextual API | `GET /api/v1/help/contextual` | Reuse |
| View tracking | `<ArticleViewTracker/>` + `POST /api/v1/help/view` | Reuse |
| Feedback | `<ArticleFeedback/>` + `/api/v1/help/feedback` | Reuse |
| Global help context | `HelpWidgetProvider` + `?` keyboard shortcut | Reuse, extend |
| Top-bar trigger | `CircleHelp` button in `app-top-bar.tsx` | Reuse |

## Component breakdown + data shapes

### `<HelpDocsModal/>` (NEW)
**File:** `apps/web/src/components/help/help-docs-modal.tsx` (client)

- Reads `useHelpWidget()` for `isOpen`, `close`, and the new `selectedArticle` value.
- Reads `usePathname()` + `useContextualHelp(pathname, communityId)` to pick the default article when no `selectedArticle` is set.
- Uses `<Dialog/>` from `apps/web/src/components/ui/dialog.tsx` (Radix) on `>=768px`; `<Sheet side="bottom"/>` from `apps/web/src/components/ui/sheet.tsx` on `<768px`, gated by `useMediaQuery`.
- Width: custom `max-w-[960px]` — above the design system's lg modal token (720px). Called out for design-system PR review; will land alongside this work as a one-off override or as a new `xl` modal token, depending on review.
- Layout: 2-column grid on desktop — `[280px_minmax(0,1fr)]`. Left rail = sticky TOC (or category list in browse mode). Right pane = article body.
- Header: modal title (= article title), role badges, "min read" + "Updated" metadata. Parity with the article route page.
- Footer: "Browse all help articles →" link to `/help?communityId=...`.
- `Esc` closes; focus returns to top-bar trigger (Radix Dialog default).

### `<HelpArticleBody/>` (NEW shared component)
**File:** `apps/web/src/components/help/help-article-body.tsx` (client)

Extracted from the inline JSX currently at [help/[category]/[slug]/page.tsx](../../apps/web/src/app/(authenticated)/help/[category]/[slug]/page.tsx) lines 91–186.

```ts
interface HelpArticleBodyProps {
  source: MDXRemoteSerializeResult;   // serialized MDX from next-mdx-remote
  toc: TocItem[];
  metadata: HelpArticleMetadata;
  related: HelpArticleMetadata[];
  communityId: number;
  displayMode: 'route' | 'modal';     // tweaks chrome
}
```

- `displayMode === 'route'`: preserves the current `PageHeader + Breadcrumbs` wrapper. Used by `/help/[cat]/[slug]/page.tsx`.
- `displayMode === 'modal'`: skips the page-level chrome (modal provides its own header) and applies `max-h-[calc(80vh-7rem)] overflow-y-auto` to the article column (7rem ≈ modal header + footer height).
- Uses `<MDXRemote {...source} components={helpMdxComponents}/>` for body. Reuses `<TableOfContents/>`, `<ArticleFeedback/>`, `<ArticleViewTracker/>`.

### `useHelpArticle(category, slug, communityId)` (NEW hook)
**File:** `apps/web/src/hooks/use-help.ts` (new export)

```ts
export function useHelpArticle(
  category: string | null,
  slug: string | null,
  communityId: number,
): UseQueryResult<HelpArticleResponse>;

export interface HelpArticleResponse {
  source: MDXRemoteSerializeResult;
  toc: TocItem[];
  metadata: HelpArticleMetadata;
  related: HelpArticleMetadata[];
}
```

- Disabled when `category` or `slug` is null.
- Query key: `HELP_KEYS.article(category, slug, communityId)`.
- `staleTime: 5 * 60_000`, `gcTime: 60 * 60_000` — articles are effectively static at runtime.

### `GET /api/v1/help/article` (NEW endpoint)
**File:** `apps/web/src/app/api/v1/help/article/route.ts`

Mirrors [/api/v1/help/contextual/route.ts](../../apps/web/src/app/api/v1/help/contextual/route.ts) for auth + role logic.

```ts
const querySchema = z.object({
  category: z.string().regex(/^[a-z0-9-]+$/).min(1).max(64),
  slug:     z.string().regex(/^[a-z0-9-]+$/).min(1).max(128),
  communityId: z.coerce.number().int().positive(),
});

export const GET = withErrorHandler(async (req: NextRequest) => {
  const { searchParams } = new URL(req.url);
  const parsed = querySchema.safeParse({
    category: searchParams.get('category') || undefined,
    slug:     searchParams.get('slug')     || undefined,
    communityId: searchParams.get('communityId') || undefined,
  });
  if (!parsed.success) {
    throw new ValidationError('Invalid help article parameters');
  }

  const communityId = resolveEffectiveCommunityId(req, parsed.data.communityId);
  const userId = await requireAuthenticatedUserId();
  const membership = await requireCommunityMembership(communityId, userId);
  const features = getFeaturesForCommunity(membership.communityType);
  const effectiveRole = membership.presetKey ?? membership.role;

  const article = getArticle(parsed.data.category, parsed.data.slug);
  if (
    !article ||
    !isArticleVisibleToRole(article.metadata, effectiveRole) ||
    filterArticlesByFeatures([article.metadata], (gate) => features[gate] === true).length === 0
  ) {
    // 404, NOT 403 — don't leak existence of role-gated articles
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const compiled = await getCompiledArticle(article);          // see below
  const related  = getRelatedArticles(article, effectiveRole); // see below

  return NextResponse.json({
    data: {
      source:   compiled.source,
      toc:      compiled.toc,
      metadata: article.metadata,
      related,
    },
  });
});

/**
 * Wraps next-mdx-remote/serialize + extractTableOfContents in unstable_cache,
 * keyed on (category, slug, contentHash). Sub-ms hits after warmup; new
 * deploy = new contentHash = automatic cache invalidation.
 */
async function getCompiledArticle(article: HelpArticleSource): Promise<{
  source: MDXRemoteSerializeResult;
  toc: TocItem[];
}> {
  const key = `${article.metadata.category}:${article.metadata.slug}:${article.metadata.contentHash}`;
  return unstable_cache(
    async () => ({
      source: await serialize(article.rawContent, { parseFrontmatter: true }),
      toc:    extractTableOfContents(article.rawContent),
    }),
    [key],
    { tags: ['help-article', key] },
  )();
}

/**
 * Resolves frontmatter `relatedArticles` slugs to full metadata, filtered by
 * the viewer's role. Mirrors the existing logic at
 * /help/[category]/[slug]/page.tsx lines 57–62.
 */
function getRelatedArticles(
  article: HelpArticleSource,
  effectiveRole: string,
): HelpArticleMetadata[] {
  return article.metadata.relatedArticles
    .map((slug) => getAllArticles().find((a) => a.slug === slug))
    .filter((a): a is HelpArticleMetadata => !!a && isArticleVisibleToRole(a, effectiveRole));
}
```

**Why 404, not 403:** revealing "this article exists but you can't see it" leaks information about role-gated content. Articles invisible to a role are treated as nonexistent.

**Why `serialize` + `<MDXRemote/>` instead of HTML + `dangerouslySetInnerHTML`:**
- MDX articles use rich React components (callouts, `next/image`, code blocks). Flattening to HTML loses them.
- `dangerouslySetInnerHTML` is an XSS footgun if any untrusted content ever lands in a body. Frontmatter Zod validates frontmatter only — not the body.
- `next-mdx-remote@6`'s `serialize` runs server-side, producing a `MDXRemoteSerializeResult` (JSON blob of compiled-but-not-executed MDX). `<MDXRemote/>` renders client-side using only the explicit `components` map. No arbitrary JSX evaluation.
- Bundle cost: ~10KB gzipped client runtime. Loaded only when `<HelpDocsModal/>` opens, via `next/dynamic`.

### `HelpWidgetProvider` extension (MODIFIED)
**File:** `apps/web/src/components/help/help-widget-provider.tsx`

```ts
interface HelpWidgetContextValue {
  isOpen: boolean;
  open: () => void;
  close: () => void;
  toggle: () => void;
  selectedArticle: { category: string; slug: string } | null;  // NEW
  openArticle: (category: string, slug: string) => void;       // NEW
}
```

- `close()` clears `selectedArticle`.
- `openArticle(category, slug)` sets `selectedArticle` and `isOpen=true`. Enables `<HelpTooltip/>`'s "Read full guide" to open the modal instead of navigating (follow-up PR — not in initial scope).
- Existing consumers of `useHelpWidget()` get backward-compatible behavior; `selectedArticle` defaults to `null`.

## Article-fetching flow

1. User clicks `CircleHelp` (or presses `?`). `HelpWidgetProvider.toggle()` flips `isOpen=true`.
2. `<HelpDocsModal/>` is always mounted in `app-shell.tsx` via `next/dynamic` (no chunk loaded until first render). The modal short-circuits to `null` if `HELP_DOCS_MODAL_ENABLED !== 'true'`. The top-bar button similarly checks the flag and calls either `useHelpWidget().toggle()` (new modal path) or the legacy widget toggle.
3. Modal reads `pathname` + `selectedArticle`:
   - If `selectedArticle` is set (e.g., from `?help=cat/slug` deep link or future `<HelpTooltip/>` action): fire `useHelpArticle(...)` directly.
   - Else: fire `useContextualHelp(pathname, communityId)`. Pick the first article from the response → fire `useHelpArticle(...)` for it.
4. While `useHelpArticle` is loading: skeleton TOC (5 lines) + skeleton paragraphs (4 blocks).
5. On success: `<MDXRemote {...source} components={helpMdxComponents}/>` renders the body. `<TableOfContents/>` renders the left rail. `<ArticleViewTracker/>` fires the POST to `/api/v1/help/view`.
6. On 0 contextual matches AND no `selectedArticle`: render the search-and-browse panel directly. No article fetch.
7. On error or 1500ms timeout: `<AlertBanner variant="danger">` with retry button.

## UX states

| State | Treatment |
|---|---|
| Loading article body | Skeleton TOC (5 lines) + 4 skeleton paragraph blocks |
| Contextual match (success) | Modal opens to first article from `useContextualHelp` (max 3 results from `getContextualArticles`). Left rail = TOC + a "More for this page" section listing the other 1–2 contextual results as links that call `openArticle(category, slug)` to switch the modal's content without closing. |
| No contextual match (success) | Modal opens to search-and-browse. Left rail = category list. Right pane = search input + featured-for-role articles (reuse `getFeaturedForRole`). Headline: "Browse help articles." |
| No articles for the role (truly empty) | EmptyState — "Help articles for your role haven't been written yet" + link to `/help/contact` |
| 404 (article deleted or role-gated) | AlertBanner info — "This help article isn't available for your role" + "Browse all articles →" |
| Network error | AlertBanner danger — "We couldn't load this article. Try again." + retry button |
| Article fetch timeout | Falls through to browse panel after 1500ms (matches existing `CONTEXTUAL_TIMEOUT_MS`) |
| Mobile (<768px) | Bottom sheet, full height. TOC collapses to `<details>` disclosure above body — matches existing pattern in `/help/[cat]/[slug]/page.tsx:138` |
| Reduced motion | Honored via `prefers-reduced-motion` — no slide-in/fade animation |
| Keyboard: open | `?` toggle (existing shortcut from `HelpWidgetProvider`) |
| Keyboard: close | `Esc` (Radix Dialog default) |
| Keyboard: tab cycle | Confined inside modal (Radix focus trap) |
| Deep link | `?help=<category>/<slug>` query param on any route opens modal to that article on mount |

## Accessibility

- `role="dialog" aria-modal="true" aria-labelledby` pointing to the article title h2.
- All icons `aria-hidden="true"`.
- Interactive buttons have visible labels or `aria-label`.
- `:focus-visible` ring never suppressed.
- TOC uses `<nav aria-label="On this page">` (existing `<TableOfContents/>` already does this).
- Body text minimum `base` (16px) per design rules.
- Colors via semantic CSS vars only — no raw hex.

## Performance

- `<HelpDocsModal/>` is `next/dynamic` — zero cost until first help-open.
- `<MDXRemote/>` client runtime ~10KB gzipped — only loaded with the modal.
- API endpoint wraps `serialize` + `extractTableOfContents` in `unstable_cache` keyed on `(category, slug, contentHash)` — sub-ms cache hits after warmup. `contentHash` already lives on `HelpArticleMetadata` (sha256 prefix of raw content). Deploy with new content = new hash = new cache entry. No manual invalidation.
- React Query: `staleTime: 5min`, `gcTime: 1hr`. Articles are static; we don't need fresh fetches.
- TOC scroll-spy via `IntersectionObserver`, only active when modal is open.
- Images in articles already use `next/image` (existing `helpMdxComponents`).

## Security (OWASP touchpoints)

| Category | Mitigation |
|---|---|
| XSS (A03) | `next-mdx-remote/serialize` + `<MDXRemote/>` with explicit components map. No `dangerouslySetInnerHTML`. |
| Broken access control (A01) | API endpoint requires authenticated user + community membership + role visibility + feature gate. 404 (not 403) on role-gated/feature-gated articles. |
| Path traversal | Structurally impossible: `getArticle()` is an in-memory lookup against pre-loaded articles, never concatenates user input into a filesystem path. Zod regex (`^[a-z0-9-]+$`) is defense-in-depth. |
| CSRF | New endpoint is `GET`, idempotent. No CSRF concern. |
| Open redirect | Modal doesn't redirect. |
| Clickjacking | Radix Dialog uses `aria-modal` + focus trap; site-wide frame headers handled at the platform layer. |
| Security misconfiguration (A05) | Feature flag defaults `false` in production; only `true` in preview env until verified. |
| Logging | View-tracking goes to existing `help_article_views` table (already audit-clean). New endpoint's request logs contain category+slug only — no PII. |

## Files changed

### New
- `apps/web/src/components/help/help-docs-modal.tsx`
- `apps/web/src/components/help/help-article-body.tsx`
- `apps/web/src/components/help/help-docs-modal-search-panel.tsx` (extracted from current widget's search UI)
- `apps/web/src/app/api/v1/help/article/route.ts`
- `apps/web/src/app/api/v1/help/article/__tests__/route.test.ts`
- `apps/web/src/components/help/__tests__/help-docs-modal.test.tsx`
- `apps/web/src/components/help/__tests__/help-article-body.test.tsx`
- `apps/web/__tests__/integration/help-docs-modal.integration.test.tsx`

### Modified
- `apps/web/src/app/(authenticated)/help/[category]/[slug]/page.tsx` (consume `<HelpArticleBody/>`)
- `apps/web/src/components/help/help-widget-provider.tsx` (add `selectedArticle`, `openArticle`)
- `apps/web/src/components/layout/app-shell.tsx` (mount new modal under flag)
- `apps/web/src/components/layout/app-top-bar.tsx` (button reads flag; on `?help=...` URL param, calls `openArticle`)
- `apps/web/src/hooks/use-help.ts` (add `HELP_KEYS.article` + `useHelpArticle`)
- `.env.example` (add `NEXT_PUBLIC_HELP_DOCS_MODAL_ENABLED=false`)

### Deleted (Phase C cleanup)
- `apps/web/src/components/help/help-widget.tsx`
- `apps/web/src/components/help/help-search-results.tsx` (if no other consumer remains)
- Flag entry in `.env.example` and any Vercel env

## Rollout plan

**Phase A — Build behind flag (single PR):**
1. Add `GET /api/v1/help/article` + tests.
2. Add `useHelpArticle` hook + tests.
3. Extract `<HelpArticleBody/>`; refactor `/help/[category]/[slug]/page.tsx` to use it (no visible UX change to route).
4. Build `<HelpDocsModal/>` + search-and-browse panel + tests.
5. Extend `HelpWidgetProvider` with `selectedArticle` + `openArticle`.
6. Mount `<HelpDocsModal/>` in `app-shell.tsx` behind `NEXT_PUBLIC_HELP_DOCS_MODAL_ENABLED`. Top-bar button toggles either old widget or new modal based on flag.
7. Add `NEXT_PUBLIC_HELP_DOCS_MODAL_ENABLED=false` to `.env.example`. Set `true` in the Vercel preview environment variables UI (no `.env.preview` file used — Vercel env config is the source).
8. Verify in Vercel preview: 5 routes × 2 roles spot-check.

**Phase B — Production rollout (ops action, no PR):**
1. Set `NEXT_PUBLIC_HELP_DOCS_MODAL_ENABLED=true` in the Vercel production environment variables UI.
2. Redeploy production to pick up the change.
3. Soak 1 week. Watch view-tracking metrics in `help_article_views` + Sentry for help-related errors. Rollback = set flag back to `false` and redeploy.

**Phase C — Cleanup (separate PR, after Phase B soak):**
1. Delete `<HelpWidget/>`, possibly `<HelpSearchResults/>`.
2. Remove flag check from `app-top-bar.tsx` and `app-shell.tsx`.
3. Remove flag from `.env.example` and Vercel env in both preview and production.

## Testing

### Unit
- **`/api/v1/help/article` route** — happy path; invalid params (400); unauthenticated (401); missing community membership (404); article not found (404); article role-gated (404, not 403); article feature-gated (404); cache hit produces identical output; response envelope shape.
- **`useHelpArticle` hook** — cache hit, loading state, error state, disabled when category/slug null.
- **`<HelpDocsModal/>`** — opens when `isOpen=true`; closes on Esc; fires `useContextualHelp` with current path; shows article on contextual match; shows search-and-browse on zero matches; shows error banner on fetch failure; renders mobile sheet under viewport breakpoint; respects `prefers-reduced-motion`.
- **`<HelpArticleBody/>`** — renders MDX via `<MDXRemote/>`; shows TOC; renders related articles; fires `<ArticleViewTracker/>` on mount in modal mode; preserves chrome in route mode.

### Integration (Vitest integration suite)
- Modal opens via top-bar button click.
- Modal opens via `?` keyboard shortcut.
- Modal opens via `?help=category/slug` URL param.
- Modal closes via Esc; focus returns to trigger.
- Mobile viewport renders as bottom sheet.

### Manual / preview verification
- 5 different routes (`/dashboard`, `/documents`, `/compliance`, `/meetings`, `/pm`) × 2 roles (`owner`, `board_president`) = 10 spot-checks.
- Reduced-motion preference toggled in OS settings.
- Slow-network throttle to verify loading skeleton.

## Risks & mitigations

| Risk | Mitigation |
|---|---|
| `<MDXRemote/>` client bundle pulls in too much | Validated ~10KB gzipped; `next/dynamic` so only on first help-open |
| Dual-mount during rollout creates state confusion | Both components read `isOpen` from same provider; only one renders its outer element, gated on flag |
| Frontmatter `contextPaths` coverage sparse → many pages "no contextual match" | Acceptable; modal degrades gracefully to search-and-browse. Content team adds `contextPaths` to articles incrementally; no code change needed |
| `unstable_cache` key invalidation on article content change | Keyed on `contentHash`; deploy = new hash = new cache entry. No manual invalidation |
| `next-mdx-remote@6` major upgrade later | Acceptable; same dep already used by `/help/[cat]/[slug]/page.tsx`; coordinated upgrade |
| Visual mismatch between modal and `/help/[cat]/[slug]` | Both consume `<HelpArticleBody/>` + `helpMdxComponents` — structural parity guaranteed |
| 80vh modal too short for long articles | Article column scrolls independently; TOC stays sticky |
| 960px modal width exceeds the design system's modal tokens (max lg=720px) | Either land as one-off `max-w-[960px]` override with code comment, OR introduce new `xl` modal token in `packages/ui`. Decide in design-system review on the PR. |

## Open questions for plan owner

1. **Modal width 960px:** one-off override or new `xl` modal token? (Recommend: one-off with comment; revisit if a second xl modal lands.)
2. **`<HelpTooltip/>` "Read full guide" links:** open modal via `openArticle` action instead of navigating? Defer to a follow-up PR after Phase B soak.
3. **Search panel UX:** reuse the existing widget's search list as a sub-component, or write fresh? Recommend reuse — minimize rework + Phase C deletes the wrapper, not the search list itself.

## References

- Memory: `~/.claude/projects/.../memory/project_help_center_already_exists.md`
- Existing widget: [help-widget.tsx](../../apps/web/src/components/help/help-widget.tsx)
- Article route: [help/[category]/[slug]/page.tsx](../../apps/web/src/app/(authenticated)/help/[category]/[slug]/page.tsx)
- Contextual API: [/api/v1/help/contextual/route.ts](../../apps/web/src/app/api/v1/help/contextual/route.ts)
- Service layer: [help-article-service.ts](../../apps/web/src/lib/services/help-article-service.ts)
- API rules: [.claude/rules/api-patterns.md](../../.claude/rules/api-patterns.md)
- Design rules: [.claude/rules/design.md](../../.claude/rules/design.md)
- Prior help center spec: [2026-04-13-help-center-design.md](./2026-04-13-help-center-design.md)
