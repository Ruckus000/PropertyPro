# Help Modal Redesign — "Showcase" Design Spec

**Date:** 2026-06-10
**Status:** Design approved in session; amendments from verification pass folded in.
**Direction:** C — "Showcase" (media-led article presentation on a single-pane reader shell with in-modal navigation).

## 1. Goal

Redesign the contextual help modal into a media-led, navigable experience: articles open with a hero walkthrough clip or screenshot, procedures show numbered steps with per-step screenshots, navigation stays inside the modal, and search is always reachable. Build the media capability end-to-end (components, asset pipeline, capture tooling) and seed media for the ~10 highest-value articles.

## 2. Background (verified findings)

**Coverage audit** (workflow, 2026-06-10): 127 pages, 59 articles, all articles carry `contextPaths`. 67/75 eligible pages covered (89%). 8 gaps (board hub, document/minutes authoring routes, `/payments/success`, 3 PM website pages). Matcher is exact-segment (`*` = exactly one segment). The contextual API truncates at a hardcoded `limit = 3` with no intentional ranking — `/documents` matches 6 articles; which 3 surface is file-order luck.

**Design review** (agent, 2026-06-10): the modal (`apps/web/src/components/help/help-docs-modal.tsx`, flag `NEXT_PUBLIC_HELP_DOCS_MODAL_ENABLED`) is a navigational dead end — no back stack; related-guide cards and statute pills are `<Link>`s that navigate the whole app away (`help-article-body.tsx:89-97,142-152`). Search is only reachable when no contextual article matches, and the modal search panel drops FAQ results the API already returns. `StepByStep` is visually broken: the step-number circle is an empty div (`mdx-components.tsx:103-106`) and the rail uses `bg-border-default`, which is not a generated class (the Tailwind color alias is `edge`). Zero of 59 articles use any media. Off-token colors (raw `bg-blue-50` callouts, purple statute pills, emerald/red feedback), emoji icons, radius drift (`rounded-2xl` vs the md rule), and a card-within-modal double chrome.

**Render pipeline** (verified in code): the modal fetches server-rendered static HTML — `serialize()` → `MDXRemote` → `renderToStaticMarkup` → `sanitizeHelpHtml()` → `dangerouslySetInnerHTML` (`apps/web/src/app/api/v1/help/article/route.ts:86-104`, `help-article-body.tsx:119`). Route pages (`/help/[category]/[slug]`) compile MDX to live React separately. Compiled HTML is cached in `unstable_cache` keyed on `category:slug:contentHash` only.

## 3. Scope

**In scope**
- Modal experience: shell, navigation stack, search/browse panel, footer, mobile-sheet parity.
- Shared article components: MediaFrame, StepByStep fix/upgrade, Callout tokenization, metadata chips.
- Media pipeline: frontmatter additions, asset convention, CI asset guard, capture tooling.
- Contextual API cap raise; small `contextPaths` additions where exact articles already exist.
- Seeding media for ~10 top articles.

**Out of scope**
- `/help` route page layouts (they inherit the upgraded article components, nothing else).
- Legacy drawer (`help-widget.tsx`) — untouched flag-off fallback; removal condition in §10.
- New articles for the uncovered PM website pages (separate content effort).
- Mobile-only surfaces beyond the modal's own bottom sheet; the orphaned `MobileHelpContent.tsx`.
- Category illustrations/art; algorithmic "up next" ranking.

## 4. UX design

### 4.1 Shell & navigation

Dialog stays xl (960px), E3, radius-lg, `p-0`, three zones (pinned header / scrollable body / pinned footer).

**Header (slim, pinned):** back chevron (rendered only when stack depth > 1) · category chip (lucide icon + category accent tint) · compact always-visible search input · "open as full page" icon linking to `/help/[category]/[slug]` · close X.

**Navigation model:** `HelpWidgetProvider`'s `selectedArticle: SelectedArticle | null` becomes a stack `articleStack: SelectedArticle[]`. `openArticle()` pushes, `back()` pops, `close()` clears. Related-guide cards, "Up next", search results, and "Help for this page" entries all push in-modal — nothing inside the modal navigates the app away.

**Statute chips:** open `/help/statutes/[ref]` in a new tab (`target="_blank" rel="noopener"`). Function preserved, page context kept, no in-modal statute view built.

**URL sync (decision):** pushes do **not** touch the URL. Only a `?help=category/slug` deep link seeds the stack (depth 1); closing strips `?help=` through the existing `HelpDeepLinkHandler` + `markCloseAsNavigation` machinery (`help-widget-provider.tsx:22-31`), which is preserved as-is. Rationale: per-push `router.replace` re-opens the navigation race that machinery already patched once.

### 4.2 Article presentation

- Flat content directly on the dialog surface — the inner `rounded-2xl border … shadow-sm` card is removed in modal mode. Single column; the 240px TOC rail is route-page-only.
- Order: `h1` title → metadata chips (read time · roles · updated · statute chips) → optional hero media (MediaFrame) → body → feedback card → related-guides grid (pushes in-modal).
- **Pinned footer:** one slim row — "Up next: *title* →" (pushes in-modal) and "Browse all help articles" (real navigation, uses `markCloseAsNavigation`).
- **Up-next ranking (decision):** optional `upNext` frontmatter slug → else first *unread* related article → else hidden. No recommender.

### 4.3 Search / browse panel

- Reachable always via the header search input, not only on no-match.
- Sections: **search results** (articles, then community FAQ hits — the search API already returns `{ articles, faqs }` (`api/v1/help/search/route.ts:115`); the modal panel currently drops `faqs`, a client-only fix) → **"Help for this page"** listing *all* contextual matches for the current route with read-state checkmarks, "show more" past 4.

### 4.4 Mobile sheet

Same component family at <768px: pinned header (back / category / search / close), pinned slim footer, flat body, 44px touch targets on list rows. No separate mobile design.

## 5. MediaFrame

`apps/web/src/components/help/media-frame.tsx` — the single renderer for hero media, step media, and authored images.

- **Replaces `Screenshot` (zero usages — delete it) and `Step`'s inline `next/image`.** One renderer, no parallel media components.
- **Plain `<img>` / `<video>` only — no `next/image` in help content.** Rationale (verified): the modal path renders through `renderToStaticMarkup` outside Next's pipeline; `next/image` there is an unexercised path (zero current usages anywhere) that would bake `/_next/image?url=…&w=…` URLs into long-lived cached HTML. Assets are pre-optimized at capture time instead; a manual 1x/2x `srcset` is emitted (attribute survives the sanitizer defaults).
- **Kind by extension:** `.webp/.png/.jpg` → `<img loading="lazy">`; `.mp4/.webm` → `<video muted loop playsinline preload="metadata" poster=…>` with **no `autoplay` attribute in markup** (see §6.2).
- **Frame:** `--surface-muted` top bar with three dots and a "GIF" tag for motion clips; `border-edge`; `radius-md`; figcaption in `text-sm text-content-tertiary`.
- **Layout stability:** `width`/`height` are required props (the capture manifest records them); the frame reserves the aspect-ratio box — zero layout shift in the modal.
- **Enhancer hooks:** emits `data-zoomable` and `data-media-kind` attributes (`data-*` survives DOMPurify's default `ALLOW_DATA_ATTR`).
- **Markdown `![...]` images:** mapped to a framed plain `<img>` without aspect reservation (markdown carries no dimensions). The authoring doc directs writers to `<MediaFrame>` for real media; bare markdown images are a styled fallback, not the convention.
- MediaFrame stays hook-light: its server-rendered markup is complete and inert; all interactivity comes from hooks (route pages) or the delegation enhancer (modal). A test pins the static output.

## 6. Render pipeline changes

### 6.1 Cache key versioning (required, ships first)

`getCompiledArticle` caches per `category:slug:contentHash` (`route.ts:87`). The key encodes content, not renderer — and Vercel's data cache persists across deployments, so shipping new component markup would serve stale HTML for every unchanged article. Fix: a `RENDER_VERSION` constant in the MDX render module, folded into the cache key (`…:v${RENDER_VERSION}`), bumped on any markup-affecting component change.

### 6.2 Client enhancer (modal path)

The modal injects sanitized static HTML; one delegation enhancer in the `HelpArticleBody` client wrapper provides all interactivity:

- Click on `[data-zoomable]` → lightbox.
- **Video playback:** IntersectionObserver plays/pauses clips entering/leaving the viewport, only when `prefers-reduced-motion` is not set. Reduced motion: poster + explicit play button (also delegated). Because `autoplay` is never in the markup, there is no pre-enhancer motion flash; the enhancer is guaranteed present since modal HTML only ever renders through this client component.
- **Anchors:** same-document anchor clicks are intercepted and scrolled within the modal's own scroll container; `location.hash` is never mutated (avoids the `scroll-mt-24` offset bug and keeps `HelpDeepLinkHandler` the sole URL owner).

Route pages render MediaFrame as a live client component with identical behavior via hooks.

### 6.3 Lightbox

Nested Radix Dialog in a portal. While open, the help modal's `onPointerDownOutside` and `onEscapeKeyDown` are suppressed so backdrop-click/ESC dismiss the lightbox first, the modal second. Verified risk: without this, clicking the lightbox backdrop registers as outside the parent `DialogContent` and closes the whole modal. Dedicated test required.

### 6.4 Sanitizer — no config changes

Verified: `sanitize-help-html.ts` uses DOMPurify defaults + `FORBID_TAGS` (deny-based). DOMPurify 3.3.1 defaults already allow `video`, `source`, `autoplay`, `muted`, `loop`, `playsinline`, `poster`, `controls`, and `data-*`. **No allowlist changes.** Add a regression test pinning that video markup and `data-*` attributes survive sanitization. Optional ride-along (only with the pinning test in place): drop the redundant `ADD_ATTR` entries that are default-allowed and the no-op `FORBID_ATTR: ['on*']`.

## 7. Content schema & assets

### 7.1 Frontmatter (`frontmatter-schema.ts`)

- `heroMedia?: { src: string; alt: string; caption?: string; width: number; height: number }`
- `upNext?: string` (article slug)

### 7.2 Asset convention

- Location: `apps/web/public/help/<category>/<slug>/<name>.{webp,mp4}` (+ `.webp` poster per clip). CSP verified: `default-src 'self'` covers repo-hosted MP4 (no `media-src` directive exists; the fallback applies). **Constraint:** if media ever moves to Supabase Storage, a `media-src` directive must be added to `security-headers.ts`.
- **Budgets (hard, CI-enforced):** image ≤ 250KB · clip ≤ 1.5MB · poster ≤ 100KB. Long flows split into multiple short clips rather than one big one.
- **Asset guard** (vitest, unit suite): walks all MDX, asserts every `heroMedia`/`MediaFrame` src resolves to an existing file under `public/help/` and is within budget. No 404 media, no silent repo bloat.

### 7.3 Capture pipeline (`scripts/help-capture/`)

- Playwright (already a devDependency with e2e configs) drives the dev server, authenticating via `/dev/agent-login?as=<role>` (verified dev-only, 404 in prod) against seeded Sunset Condos data.
- Per-article JSON manifest: route, role, viewport (1440×900 @2x), scripted actions, crop, output names + dimensions. Recapture after UI changes is one command, not archaeology.
- Stills exported as sized WebP; flows recorded as video and trimmed to H.264 MP4 (ffmpeg) at fixed dimensions within budget.
- Local-only tooling; never runs in CI.
- Authoring conventions doc at `apps/web/src/content/help/AUTHORING.md`: demo data only, no PII, viewport, naming, budgets, when to use stills vs clips.

## 8. API & content rides

- **Contextual cap:** `getContextualArticles(path, role, 3)` → return all matches capped at 8 (wire shape unchanged). The panel shows up to 4 with "show more"; legacy drawer renders a longer list harmlessly.
- **`contextPaths` additions** (existing articles, exact topical match):
  - `/communities/*/meetings/*/minutes/author` → `posting-meeting-minutes`
  - `/communities/*/documents/author/new` and `/communities/*/documents/author/*` → `uploading-documents`, `organizing-the-document-library`
  - `/communities/*/board` → `using-the-board-forum`
  - `/payments/success` → `paying-dues-and-assessments`
- PM website articles (onboarding wizard, custom domain, portfolio templates) are **not** written here — follow-up content effort.

## 9. Tokenization & component fixes

- **StepByStep/Step:** numbers via CSS counters (`counter-increment` on the container); rail `bg-edge`; `role="listitem"`; `image=` renders MediaFrame.
- **Callout:** `--status-*` tokens + lucide icons (`Info`, `TriangleAlert`, `Lightbulb`, `Scale` for florida-statute). No emoji.
- **Statute pills and feedback states:** status tokens, not raw purple/emerald/red.
- **Cards touched by this redesign** (modal, article body, search panel): normalize to `radius-md` + E0; eliminate `shadow-sm`/`rounded-2xl` drift. The `/help` hub pages are out of scope.
- **Caption-size content:** `text-xs` promoted to `text-sm` where it is primary content (descriptions, FAQ answers in the panel); `text-xs` remains for true metadata.
- **Category accents:** one config module (`apps/web/src/lib/help/category-meta.ts`) mapping each help category → lucide icon + semantic-token tint, consumed by the header chip and panel rows. Tints come from existing tokens (status/brand tints), no new raw palette values. This is the full extent of "category art."

## 10. Rollout

- Ships behind the existing `NEXT_PUBLIC_HELP_DOCS_MODAL_ENABLED` flag. The flag's production value is **unverified** — check it before assuming user visibility; flipping it (if off) is a deliberate post-merge step.
- Legacy drawer untouched. **Removal condition (recorded so it doesn't live forever):** flag enabled in production + 2 weeks bake + no Sentry regressions → delete `help-widget.tsx` and the flag in a follow-up.
- `RENDER_VERSION` bump ships with the first component-markup change.

## 11. Seeding plan (~10 articles)

Query production `help_article_views` (table verified: `packages/db/src/schema/help-article-feedback.ts:30`) for actual top articles. If data is sparse (flag may be off in prod; views may come from route pages only), fall back to support-relevance picks: `submitting-a-maintenance-request`, `paying-dues-and-assessments`, `reviewing-the-compliance-dashboard`, `uploading-documents`, `creating-meeting-notices`, `creating-and-publishing-announcements`, `joining-your-community`, `understanding-your-dashboard`, `fixing-compliance-gaps`, `logging-visitors`. Each seeded article gets a hero (clip or still) and step screenshots where it uses StepByStep. Content refresh ride-along: fix stale drawer wording in `welcome-to-propertypro.mdx`.

## 12. Testing

- **Unit:** MediaFrame static output per kind (img / video-with-poster / no autoplay attr); sanitizer pinning test (video attrs + `data-*` survive); provider stack (push/pop/clear/deep-link seed); lightbox dismissal ordering; contextual cap; asset guard (existence + budgets).
- **Updated:** existing help component tests (`help-article-body.render.test.tsx` etc.) for new markup; grep `vi.mock` factories for any new module exports per repo convention.
- **Integration:** `help/article` route returns sanitized HTML containing framed media for a fixture article.
- **Live verification:** preview tools — open the modal as `owner` and `cam` on seeded pages, exercise back stack/search/lightbox/reduced-motion emulation, screenshot evidence.

## 13. Risks

- `renderToStaticMarkup` of hook-using client components: safe for `useState`/`useMemo` (effects are skipped), but MediaFrame's *base markup* must be complete without effects — pinned by test (§12).
- Asset budgets may be tight for long flows — split into multiple clips; budgets are a guard, not a target.
- Stack + deep-link interplay has existing race-workaround machinery — preserved verbatim; any URL behavior change must go through `HelpDeepLinkHandler` only.
