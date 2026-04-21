# Breadcrumb Standardization Design Spec

**Date:** 2026-04-20
**Status:** Draft
**Author:** Claude (brainstorming session)

---

## Problem

Users land on detail pages (e.g., `/announcements/[id]`) with no way to navigate to the parent list. The PM-only "Portfolio / Community" strip in `AppShell` is hard-coded and never reflects the current page. The sidebar nav exists but is collapsible and not always discoverable from a deep page.

**Concrete repro:** After publishing a new announcement, the user lands on `/announcements/[id]?communityId=X`. The page renders a bare `<article>` with no header, no back link, no breadcrumb. The only way out is the sidebar (if expanded) or the browser back button.

**Root cause is systemic, not local.** A survey of `apps/web/src/app/(authenticated)/` finds:

- `PageHeader` ([apps/web/src/components/shared/page-header.tsx](apps/web/src/components/shared/page-header.tsx)) exposes a `breadcrumb` ReactNode prop. **Three** files in the entire app pass it.
- `ArticleBreadcrumbs` ([apps/web/src/components/help/article-breadcrumbs.tsx](apps/web/src/components/help/article-breadcrumbs.tsx)) is a one-off breadcrumb implementation for the help center (full trail, current item with `aria-current="page"`).
- At least eight other detail/new/edit pages and components implement ad-hoc back-link affordances with inconsistent labels, glyphs, and placement (`← Back`, `← Back to Templates`, `<ChevronLeft/> Back to Templates`, `<ArrowLeft/>` button, etc.).
- Several detail pages (`announcements/[id]`, `esign/submissions/[id]`) implement nothing at all.

The convention exists. Nothing enforces it. Different contributors invented different patterns over time.

---

## Goals & Non-Goals

**Goals**
- Every authenticated detail / new / edit page provides a breadcrumb to its parent list (and, where applicable, intermediate parents).
- One component, one visual style, one set of a11y semantics, sitewide.
- A CI guard that prevents the regression from recurring on new pages.

**Non-Goals**
- List pages (`announcements/page.tsx`, etc.). They are the destination; the active sidebar item already marks them.
- Mobile routes (`/mobile/*`). Separate layout idioms; out of scope for this PR.
- The `apps/admin` app. Different shell, separate concern.
- The `(public)/` and `(onboarding)/` route groups. Not authenticated; not under the same chrome.
- Replacing the AppShell PM-only `Portfolio / Community` strip ([app-shell.tsx:209-222](apps/web/src/components/layout/app-shell.tsx:209)). It serves a different purpose (community-context for PM admins) and lives at a different DOM level. Pages render breadcrumbs *below* it.
- Browser-history-aware "back" navigation (`router.back()`). Static parent links chosen for predictability and bookmarkability — the user always knows where the link goes, and refreshing the page doesn't break it.

---

## Architecture

```
apps/web/src/components/shared/
  breadcrumbs.tsx                    NEW   (~50 LoC component)

apps/web/src/components/help/
  article-breadcrumbs.tsx            DELETE (callers migrated)

apps/web/src/app/(authenticated)/**/
  {[id]/page.tsx,new/page.tsx,[id]/edit/page.tsx}  EDIT
  (page files matching this glob — see Migration Inventory)

apps/web/src/components/**/
  forum-thread-detail.tsx            EDIT (replace ad-hoc back link)
  residents/import-residents-client.tsx  EDIT
  esign/new-submission-form.tsx      EDIT
  esign/submission-detail.tsx        EDIT
  violations/ViolationDetailView.tsx EDIT
  esign/templates/[id]/template-detail-client.tsx     EDIT (page-side)
  esign/templates/new/template-builder-client.tsx     EDIT (page-side)

scripts/
  verify-page-breadcrumbs.ts         NEW   (CI guard)

package.json                         EDIT  (wire `pnpm guard:breadcrumbs` into `lint`)
.claude/rules/design.md              EDIT  (~5 line addendum)
```

**Why `apps/web/src/components/shared/`, not `packages/ui/`:**
`packages/ui/src/components/` contains five cross-app primitives (`Badge`, `Button`, `Card`, `NavRail`, `PhoneFrame`). `PageHeader` itself lives in `apps/web/src/components/shared/`. `Breadcrumbs` couples to `next/link` and the `?communityId=` URL convention — both `apps/web` concerns. Co-locating with `PageHeader` is honest about scope.

---

## Component API

```tsx
// apps/web/src/components/shared/breadcrumbs.tsx

import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface BreadcrumbLink {
  label: string;
  href: string;
}

export interface BreadcrumbsProps {
  /** Linked parent crumbs, in order from root to immediate parent. */
  items?: BreadcrumbLink[];
  /** Current page label. Unlinked, marked with aria-current="page". */
  currentLabel: string;
  className?: string;
}

export function Breadcrumbs({ items = [], currentLabel, className }: BreadcrumbsProps) {
  // ... see Rendering below
}
```

**Why two props instead of a single `items` array with the last entry treated as current:**
Explicit `currentLabel` is harder to misuse than "remember to omit `href` on the last item." The page already knows its current title (it lives in the `<h1>`), so passing it twice is acceptable cost for compile-time clarity.

**Why `currentLabel` is required:**
Every in-scope page (detail, new, edit) has a current page label. There is no valid use case for a breadcrumb without a current label. If a future page needs only a back link with no current crumb, it is not a breadcrumb — use a different affordance.

**Why `items` is optional:**
A page directly under a section can pass `currentLabel` only — the breadcrumb renders just `currentLabel` with `aria-current="page"`, which still satisfies a11y and locates the user.

---

## Rendering

```html
<!-- inside PageHeader's <nav aria-label="Breadcrumb"> wrapper -->
<ol class="flex flex-wrap items-center gap-1.5 text-sm">
  <li>
    <a
      href="/announcements?communityId=123"
      class="text-content-secondary hover:text-content focus-visible:outline-none
             focus-visible:ring-2 focus-visible:ring-focus rounded-sm"
    >
      Announcements
    </a>
  </li>
  <li aria-hidden="true" class="text-content-tertiary">
    <ChevronRight size={14} />
  </li>
  <li class="min-w-0">
    <span
      aria-current="page"
      class="font-medium text-content-secondary truncate block max-w-full sm:max-w-[40ch]"
    >
      Testing 1
    </span>
  </li>
</ol>
```

**Rules:**
- **No `<nav>` element.** `PageHeader` already wraps the `breadcrumb` slot in `<nav aria-label="Breadcrumb">` ([page-header.tsx:36-40](apps/web/src/components/shared/page-header.tsx:36)). Nesting another `<nav>` creates a duplicate landmark; screen readers announce it twice. The existing `ArticleBreadcrumbs` documents this exact constraint.
- **`<ol>` with `<li>` per crumb and per separator.** Separator `<li>` carries `aria-hidden="true"` so it doesn't pollute the assistive-tech reading. (Alternative: separators outside list items via CSS `::before`. Rejected for being harder to maintain than explicit DOM.)
- **Tokens only.** `text-content-secondary`, `text-content`, `ring-focus`, etc. No raw hex (per [.claude/rules/design.md](.claude/rules/design.md)).
- **Current item gets `aria-current="page"`.** WAI-ARIA breadcrumb pattern. Visually rendered in `text-content-secondary font-medium` — same color as parent crumbs but heavier, no underline, no link.
- **Truncation on the current item only.** `truncate block max-w-full sm:max-w-[40ch]` on the span, plus `min-w-0` on the enclosing `<li>` so the flex parent permits shrinkage. Long announcement titles ("Notice of Special Assessment Hearing for Roof Replacement Project — March 2026") would otherwise wrap awkwardly. The `max-w-full` floor prevents horizontal overflow on viewports narrower than 40ch (~320px). Parent crumbs are short, controlled section names ("Announcements", "Documents"); no truncation needed.
- **Single-crumb case** (no `items`, only `currentLabel`): renders just the `<li><span aria-current="page">…` — no separator, no error, no warning. Layout is identical, just one item.
- **No `align-middle` class** on the current-label span. Historically included in drafts; `align-middle` has no effect inside a flex parent with `items-center` (it governs inline baseline alignment). Dropped as dead styling.

---

## Label Conventions

Determines what `items[].label` and `currentLabel` should say across sections. Documented as a table in `.claude/rules/design.md` so future contributors don't reinvent.

| Page type | `items` | `currentLabel` |
|---|---|---|
| Section detail (`/announcements/[id]`) | `[{ label: 'Announcements', href: '/announcements?communityId=X' }]` | entity title (e.g., announcement title) |
| Section new (`/announcements/new`) | `[{ label: 'Announcements', href: '/announcements?communityId=X' }]` | `'New announcement'` (verb-first, sentence case) |
| Section edit (`/announcements/[id]/edit`) | `[{ label: 'Announcements', href: ... }, { label: <fetched entity title>, href: '/announcements/[id]?communityId=X' }]` | `'Edit'` |
| Sub-section detail (`/communities/[id]/board/forum/[threadId]`) | `[{ label: 'Board', href: '/communities/[id]/board/polls' }, { label: 'Forum', href: '/communities/[id]/board/forum' }]` | thread title |
| Help article (`/help/[category]/[slug]`) | `[{ label: 'Help Center', href: ... }, { label: <Title Case categoryLabel>, href: ... }]` | article title |
| Help category list (`/help/[category]`) | `[{ label: 'Help Center', href: '/help?communityId=X' }]` | `<Title Case categoryLabel>` |

**Rules:**
- Section labels in breadcrumbs match the sidebar nav label (`apps/web/src/components/layout/nav-config.ts`) when one exists. Canonical sidebar-label mappings: `'Announcements'`, `'Board'`, `'E-Sign'`, `'Violations Inbox'`, `'Residents'`, `'Communities'` (the PM sidebar uses `'Communities'`, not `'Portfolio'`).
- **Section-appropriate labels are allowed when the parent section has no sidebar entry.** Several legitimate parent routes (e.g., `/emergency`, `/esign/templates`, `/esign/submissions`) are not top-level sidebar items. In those cases use the human-readable section name (`'Emergency'`, `'Templates'`, `'Submissions'`) and keep the value consistent across every breadcrumb that links to that section.
- Dynamic parent labels (e.g., parent entity title in an edit-page crumb) are sourced from the entity already fetched by the page — no extra DB queries to populate the breadcrumb. If the page does not already fetch the parent entity, the breadcrumb either omits that crumb or the page fetches it (cost: one extra query).
- New/edit page `currentLabel` follows the existing app convention: `'New <entity>'` (e.g., `'New announcement'`) and `'Edit'` (the entity context is already provided by the parent-detail crumb).
- Help category labels are passed through `article.metadata.category.replace(/-/g, ' ')` and then Title-Cased at the call site (or rendered with the `capitalize` Tailwind class inside the span) so breadcrumb casing matches the category-listing page's `<h1 className="capitalize">`.
- **Nested `/communities/[id]/...` routes omit the `?communityId=` query param** — the `[id]` path segment is the authoritative tenant identifier. Breadcrumb hrefs for these routes follow the existing back-link pattern (`/communities/${communityId}/board/forum`, not `.../forum?communityId=${communityId}`).

---

## Page-File Migration Strategy: Two Modes

A page either renders `<PageHeader>` directly in its server component, or it delegates to a client component that renders the chrome. The CI guard distinguishes these and accepts both.

**Mode A — Direct (page file owns the chrome):**
The page file itself contains `<PageHeader breadcrumb={<Breadcrumbs ... />}>`. The CI guard verifies the prop is present.

**Mode B — Delegated (client component owns the chrome):**
The page file is a thin server component that delegates to a client component. The page file gets a top-of-file comment:
```tsx
// breadcrumbs:exempt — delegated to apps/web/src/components/path/to/Component.tsx
```
The CI guard reads the named file and verifies it contains `<PageHeader` AND `breadcrumb=`. Two-hop verification, no AST work.

**Why both modes:** Many existing pages already follow Mode B (`violations/[id]`, `esign/templates/[id]`, `esign/submissions/[id]`, `communities/[id]/board/forum/[threadId]`). Forcing them to Mode A means refactoring server/client boundaries — a bigger change than the breadcrumb work warrants. Mode B keeps the migration focused on adding chrome where it's missing.

**Mode B side effects on client components:** Several Mode B components currently render their own ad-hoc page header (e.g., `ViolationDetailView` renders `<h1>Violation #N</h1>` inside a custom card). Migration replaces that ad-hoc chrome with `<PageHeader title=... breadcrumb={<Breadcrumbs .../>}>`. The visual change is documented in Risks.

---

## Migration Inventory

Files to edit. Counts checked against current `main` (commit `4d1a9d66`) via the `find` command in the implementation plan.

### CI-guarded pages (must contain `<PageHeader breadcrumb=` OR `breadcrumbs:exempt` comment)

In-scope glob:
```
apps/web/src/app/(authenticated)/**/[<param>]/page.tsx
apps/web/src/app/(authenticated)/**/new/page.tsx
apps/web/src/app/(authenticated)/**/[<param>]/edit/page.tsx
```

Where `[<param>]/page.tsx` means the parent directory name is bracketed (i.e., the page is the deepest dynamic segment — an entity detail page). This rule excludes `communities/[id]/<section>/page.tsx` files, which are list pages under a community-context dynamic segment, not entity details.

**Detail pages — Mode A (rewrite to use `<PageHeader>`):**
1. `apps/web/src/app/(authenticated)/announcements/[id]/page.tsx` — currently bare `<article>`. Wrap in `<PageHeader title={announcement.title} breadcrumb={<Breadcrumbs items={[{label: 'Announcements', href: ...}]} currentLabel={announcement.title} />} />`.
2. `apps/web/src/app/(authenticated)/emergency/[id]/page.tsx` — currently has inline `← Back` link. Replace with PageHeader + Breadcrumbs; remove the inline link. **Note:** file is `"use client"`; early-return branches for missing params / loading / error render `<p>` only and do not get a breadcrumb. This preserves existing behavior (initial server-rendered HTML shows the loading state without chrome) and is documented, not a regression.
3. `apps/web/src/app/(authenticated)/help/[category]/[slug]/page.tsx` — already uses PageHeader; replace `<ArticleBreadcrumbs>` with `<Breadcrumbs>`.
4. `apps/web/src/app/(authenticated)/help/[category]/page.tsx` — **added in first-pass review (previously missed from inventory).** Parent dir `[category]` is bracketed, so the CI guard will match this file. Currently renders its own inline `<nav aria-label="Breadcrumb">` at line 37 without `<PageHeader>`. Migrate to `<PageHeader title={categoryLabel} breadcrumb={<Breadcrumbs items={[{label: 'Help Center', href: '/help?communityId=X'}]} currentLabel={categoryLabel} />} />`; delete the inline `<nav>` block (prevents double-landmark).

(Originally listed `pm/dashboard/[community_id]/page.tsx` here — verified that file is redirect-only and moved to the exemption list below.)

**Detail pages — Mode B (page file gets exemption comment; chrome migrated in client component):**
5. `apps/web/src/app/(authenticated)/violations/[id]/page.tsx` — delegates to `ViolationDetailView`. Page gets `// breadcrumbs:exempt — delegated to apps/web/src/components/violations/ViolationDetailView.tsx`.
6. `apps/web/src/app/(authenticated)/esign/submissions/[id]/page.tsx` — delegates to `SubmissionDetail`.
7. `apps/web/src/app/(authenticated)/esign/templates/[id]/page.tsx` — delegates to `TemplateDetailClient`. **Note:** this page also renders an inline error JSX block when `communityId` / `templateId` is missing (lines 33-44). That branch does not delegate and does not render the breadcrumb. Pre-existing behavior; not fixed by this PR.
8. `apps/web/src/app/(authenticated)/communities/[id]/board/forum/[threadId]/page.tsx` — delegates to `ForumThreadDetail`.

**New pages — Mode A:**
9. `apps/web/src/app/(authenticated)/announcements/new/page.tsx` — already has PageHeader; add `breadcrumb` prop; **remove the `Back to announcements` outline button from `actions` slot** (see Risks #4 — this is an explicit visual change).
10. `apps/web/src/app/(authenticated)/emergency/new/page.tsx` — verify shape; add PageHeader + Breadcrumbs.

(Originally listed `pm/dashboard/communities/new/page.tsx` here — verified in first-pass review that the file is a 9-line `redirect('/pm/dashboard/communities')` with no rendered output. Moved to the exemption list below.)

**New pages — Mode B:**
11. `apps/web/src/app/(authenticated)/esign/submissions/new/page.tsx` — delegates to `NewSubmissionForm`.
12. `apps/web/src/app/(authenticated)/esign/templates/new/page.tsx` — delegates to `TemplateBuilderClient`. Same inline-error-branch caveat as #7.

**Edit pages — Mode A:**
13. `apps/web/src/app/(authenticated)/announcements/[id]/edit/page.tsx` — pass parent list crumb + parent detail crumb. The page already fetches the announcement (it must, to populate the form); use that fetched title as the parent-detail crumb label and `'Edit'` as `currentLabel`.

### Mode B client components (chrome migration target for the exempted pages above)

14. `apps/web/src/components/violations/ViolationDetailView.tsx` — replace ad-hoc back link + custom header card with `<PageHeader title="Violation #{id}" breadcrumb={<Breadcrumbs items={[{label: isAdmin ? 'Violations Inbox' : 'Your Reports', href: ...}]} currentLabel={`Violation #${violation.id}`} />}>`. Visual diff: card-style title becomes standard PageHeader title.
15. `apps/web/src/components/board/forum/forum-thread-detail.tsx` — replace `← Back to Forum`. **Note:** the existing back-link href is `/communities/${communityId}/board/forum` (no query param). Breadcrumb hrefs for crumbs linking into nested `/communities/[id]/...` routes MUST follow this same convention — no `?communityId=` — matching the sibling sub-page navigation already in the codebase. Also the loading/error/not-found early-return branches (lines 60-82) do not render `<PageHeader>`; the breadcrumb only appears in the loaded branch. Documented, not a regression.
16. `apps/web/src/components/esign/new-submission-form.tsx` — replace `<ArrowLeft>` back button. **Breadcrumb parent href change:** existing back-link goes to `/esign?communityId=…`; breadcrumb parent goes to `/esign/submissions?communityId=…` (the list page that actually exists at that route). This is a deliberate navigation change; reviewer should confirm via screenshot.
17. `apps/web/src/components/esign/submission-detail.tsx` — replace `<ArrowLeft>` back button. Same parent-href change as #16. **Error branch (lines 157-174) renders its own standalone back-link inside a Card**; this branch also gets a PageHeader + Breadcrumbs OR the standalone back-link stays — pick one explicitly and document.
18. `apps/web/src/app/(authenticated)/esign/templates/new/template-builder-client.tsx` — replace the Phase-1 `<ChevronLeft>` back-to-templates link (line 372). The Phase-2 `<ArrowLeft>` "Setup" button (line 583) is **phase navigation, not back-to-templates** — leave it unchanged.
19. `apps/web/src/app/(authenticated)/esign/templates/[id]/template-detail-client.tsx` — replace `<ChevronLeft>` back buttons. **This file has THREE render branches, not two**: loading (lines 176-182, no back-link today), error (lines 184-199, standalone back-link), loaded (lines 204+, back-link + full page). Choose an explicit strategy before migrating:
    - (a) Render `<PageHeader>` once at the top of the function body with a conditional `currentLabel` (`template?.name ?? 'Loading template…'` — handle the undefined case), OR
    - (b) Render `<PageHeader>` in the loaded branch only; leave the error branch's standalone back-link in place so users with a failed fetch still have a way out.

### Non-guarded pages migrated for consistency (in scope per Q1=B + critique #5)

These pages are not in the CI guard's glob (they are list/static pages, not detail/new/edit), but they currently use ad-hoc breadcrumb patterns. Migrating them in this PR removes the inconsistency.

20. `apps/web/src/app/(authenticated)/help/manage/page.tsx` — replace inline `<Link>` in breadcrumb slot with `<Breadcrumbs items={[{label:'Help Center', href: '/help?communityId=X'}]} currentLabel="Manage FAQs" />`.
21. `apps/web/src/app/(authenticated)/help/contact/page.tsx` — same shape as #20, currentLabel `"Management Contact"`.
22. `apps/web/src/components/residents/import-residents-client.tsx` — replace `<ArrowLeft>` back button. Rendered from `apps/web/src/app/(authenticated)/dashboard/import-residents/page.tsx` (a static page, not in the guard's glob). **Parent href:** the existing back-link goes to `/dashboard/residents?communityId=${communityId}` (matches the Residents sidebar item in `nav-config.ts:178`). Use that exact href — do NOT change to `/dashboard`.

### Files to delete

23. `apps/web/src/components/help/article-breadcrumbs.tsx` — replaced by the new generic `Breadcrumbs`.

### Pages exempted with reason

- `apps/web/src/app/(authenticated)/pm/dashboard/[community_id]/page.tsx` — `// breadcrumbs:exempt — redirect-only page`. 35-line server component that resolves a target via `resolvePmDashboardTarget(userId, communityId)` and `redirect()`s to it.
- `apps/web/src/app/(authenticated)/pm/dashboard/communities/new/page.tsx` — `// breadcrumbs:exempt — redirect-only page`. **Added in first-pass review.** 9-line file with a single `redirect('/pm/dashboard/communities')`. The standalone Add Community wizard was replaced by the `AddCommunityModal` on the PM dashboard; this file only survives to preserve old links.
- `apps/web/src/app/(authenticated)/communities/[id]/announcements/page.tsx` — **NOT in the CI guard glob** (parent dir is `announcements`, not bracketed/new/edit). No exemption comment required. Left out of inventory to avoid misleading future readers into thinking the CI guard enforces anything on this path.

**Total: 15 in-scope CI-guarded pages (4 Mode A detail + 4 Mode B detail + 2 Mode A new + 2 Mode B new + 1 Mode A edit + 2 redirect-only exempt) + 6 Mode B client components + 3 non-guarded migrations + 1 file deleted + 1 new component + 1 new script + 2 config edits = 29 files.**

---

## CI Guard

```ts
// scripts/verify-page-breadcrumbs.ts
//
// Walks apps/web/src/app/(authenticated) and finds files matching the
// in-scope glob:
//   - **/[<param>]/page.tsx  (parent dir name is bracketed → entity detail page)
//   - **/new/page.tsx        (parent dir name is `new`)
//   - **/[<param>]/edit/page.tsx
//
// For each match:
//   1. Read the file as a single string.
//   2. If the file contains `// breadcrumbs:exempt`, parse the reason. If the
//      reason is "delegated to <path>", read <path> and verify it contains
//      `<PageHeader` and `breadcrumb=` (multi-line regex). Other exemption
//      reasons (e.g., "redirect-only page") pass without further checks but
//      are logged.
//   3. Otherwise, assert the file contains `<PageHeader\b[^>]*\sbreadcrumb=`
//      (multi-line regex matching the same JSX element).
//
// Exit non-zero if any in-scope file has neither <PageHeader breadcrumb=...>
// nor a valid exemption.
```

**Wired into existing lint job** via root `package.json`:

```json
"guard:breadcrumbs": "tsx scripts/verify-page-breadcrumbs.ts",
"lint": "turbo run lint && pnpm guard:db-access && pnpm guard:token-freshness && pnpm guard:breadcrumbs"
```

No new CI parallel job. Mirrors `guard:db-access` and `guard:token-freshness`.

**Known false-negative classes (documented inline in the script header):**
- `breadcrumb={someExpression}` where the expression evaluates to `null` at runtime. The guard cannot type-check.
- A `<PageHeader>` rendered conditionally where one branch passes `breadcrumb=` and another doesn't. The guard sees the prop in the source and passes.
- A delegated component that *itself* delegates further (two-hop only). Acceptable; flag in code review.
- **Prop ordering:** `<PageHeader>` with a JSX-valued prop containing `>` (e.g., `actions={<Button>Cancel</Button>}`) placed *before* `breadcrumb=`. The `[^>]*` in the regex halts at the first `>` inside `<Button>`, so `\sbreadcrumb=` never matches even though the prop is present. **Mitigation (required for this PR):** every migrated file places `breadcrumb=` before any JSX-valued prop. The implementation plan's code samples follow this convention; reviewers must keep it. An alternative regex `/<PageHeader\b(?:[^>]|<[^>]*>)*\sbreadcrumb=/s` would accept nested `<...>` in prop values but increases matching cost and complexity — deferred.

These are acceptable. The guard prevents the common case (a new `[id]/page.tsx` ships with no breadcrumb at all). It is not a type checker.

**Why not AST parsing:** A grep-based guard is ~80 lines (more than the original ~50 estimate due to the two-hop verification), runs in milliseconds, has zero new dependencies. The repo does have `typescript` as a dev dependency (used by `verify-scoped-db-access.ts` for import analysis), so AST parsing IS available — but the existing guard's RLS check already uses regex, and the breadcrumb rule's semantic (presence of a prop on a JSX element) is simple enough that AST overhead isn't justified here. Mixing approaches across guards is acceptable precedent.

---

## Documentation

`.claude/rules/design.md` — append under the existing "## State Handling" section:

```markdown
## Page Navigation & Breadcrumbs

- Every detail/new/edit page under `apps/web/src/app/(authenticated)/` MUST render
  `<PageHeader breadcrumb={<Breadcrumbs items={[...]} currentLabel="..." />}>`.
- Breadcrumb labels for parent crumbs match the sidebar nav label
  (`apps/web/src/components/layout/nav-config.ts`) when a sidebar entry exists
  for that route. When the parent section has no sidebar entry (e.g., Emergency,
  Templates, Submissions), use a human-readable section name and keep it
  consistent across every breadcrumb that links to that section.
- Breadcrumb hrefs to nested `/communities/[id]/...` routes must NOT append
  `?communityId=...` — the `[id]` path segment is the authoritative tenant id
  for those routes. Hrefs to top-level routes keep the `?communityId=` query
  param as today.
- Current page label matches the page's `<h1>` title.
- Pages that legitimately render no `<PageHeader>` (e.g., redirect-only pages)
  must include a `// breadcrumbs:exempt — <reason>` comment at the top of the
  file. The CI guard (`pnpm guard:breadcrumbs`) enforces this.
- **On any page that renders `<PageHeader breadcrumb=…>`, the breadcrumb is the
  only back affordance.** Do not also place a back-link in `actions` or
  inline above the header. List/static pages that do not render a breadcrumb
  may still use ad-hoc back affordances when appropriate.
- **Within `<PageHeader>`, place `breadcrumb` *before* any JSX-valued prop
  (e.g., `actions={<Button>...</Button>}`).** The CI guard regex halts at the
  first `>` between `<PageHeader` and `breadcrumb=`; prop ordering keeps the
  check valid.
```

---

## Edge Cases & Open Questions

**Browser back vs static parent link.**
A user landing on `/announcements/123` from a dashboard widget gets teleported to `/announcements?communityId=…` by the breadcrumb, not back to the dashboard. We chose static for predictability (the link target is visible in the URL, identical for every visitor, bookmarkable). Browser back still works for users who want history navigation.

**Long titles.**
`currentLabel` is `truncate block max-w-full sm:max-w-[40ch]` on the span, with `min-w-0` on the enclosing `<li>`. Browsers render the truncated form; the full title is in the `<h1>` directly below. If a user wants the full title, it's the next element on the page. On viewports narrower than `sm` (640px), the max width defers to the parent width and flex wrap handles multi-line breadcrumbs gracefully.

**Client-component pages.**
`emergency/[id]/page.tsx` and several Mode B client components (e.g., `TemplateDetailClient`, `SubmissionDetail`, `ForumThreadDetail`) render loading / error / not-found states via early returns *before* the main render branch. The breadcrumb only renders once the fetch resolves — initial server-rendered HTML shows the loading state without chrome. This is existing behavior, not a regression. Each migration inventory item calls out which branches render the breadcrumb.

**i18n / RTL.**
Not configured in this app. `>` separator is LTR-coded. If i18n ships later, the separator becomes a token-driven directional glyph. Out of scope for this PR.

**Missing `?communityId=` in `href`.**
`BreadcrumbLink.href` is typed as `string`. Forgetting the query param produces a broken parent page (resolveCommunityContext fails). The component cannot prevent this; it is a footgun shared with every other `<Link>` in the codebase. Out of scope; not a regression.

**`(communities)/[id]/...` route group.**
Some legacy detail pages live under `apps/web/src/app/(authenticated)/communities/[id]/...` (e.g., `board/forum/[threadId]`). The migration inventory includes them. The `(communities)/[id]/announcements/page.tsx` file is a `redirect()` and nothing else; it gets a `// breadcrumbs:exempt` comment.

**Empty `items` array.**
Rendering is well-defined: just the `currentLabel` with `aria-current="page"`. No separator, no error.

---

## Testing Strategy

- **Component unit tests** at `apps/web/src/components/shared/__tests__/breadcrumbs.test.tsx`:
  - Renders `currentLabel` only when `items` is empty.
  - Renders `items` + separator + `currentLabel` correctly when `items` has 1 entry.
  - Renders `items` + 2 separators + `currentLabel` when `items` has 2 entries.
  - Each parent renders as `<a href>`. Current label renders as `<span aria-current="page">`.
  - **`getByRole('navigation')` returns 0 elements when `<Breadcrumbs>` is rendered standalone** (regression guard for the double-`<nav>` bug — `Breadcrumbs` must not introduce a landmark, since `PageHeader` provides one).
  - Separator `<li>` has `aria-hidden="true"`.
  - Class composition works through `cn()` (smoke test that `className` prop merges).

- **Integration test** at `apps/web/src/components/shared/__tests__/breadcrumbs.integration.test.tsx`:
  - Renders `<PageHeader breadcrumb={<Breadcrumbs ... />}>` and asserts `getAllByRole('navigation')` returns exactly 1 element. This is the end-to-end regression guard for the original a11y bug.

- **CI guard self-test:** A unit test for `scripts/verify-page-breadcrumbs.ts` that runs the guard against synthetic fixtures and asserts the right outcomes for each case:
  - A passing page (has `<PageHeader breadcrumb=…>`) → `ok: true`.
  - A failing page (has `<PageHeader>` but no `breadcrumb` prop) → `ok: false`, reason mentions "no breadcrumb".
  - A delegated page whose target has `<PageHeader breadcrumb=…>` → `ok: true`.
  - **A delegated page whose target file does NOT exist** → `ok: false`, reason mentions "delegated target not found". This case requires its own `delegated-missing-target.tsx` fixture; do not ship as an empty placeholder test.
  - A delegated page whose target exists but lacks `<PageHeader breadcrumb=…>` → `ok: false`, reason names the delegated target file.
  - A redirect-only exempt page (`// breadcrumbs:exempt — redirect-only page`) → `ok: true`.

- **Manual verification** (not automated, but required before merge):
  - Load `/announcements/[id]?communityId=…` as a `pm_admin`. Confirm the new breadcrumb appears below the `Portfolio / Community` strip and the parent link navigates correctly.
  - Load the same as a `board_member` (no PM strip). Confirm the breadcrumb is the only nav above the title.
  - Tab to the parent link with the keyboard. Confirm `:focus-visible` ring renders.

No e2e tests added — the existing test surface for these pages doesn't include navigation, and adding e2e coverage for a chrome element would be over-investment.

---

## Risks

**1. ArticleBreadcrumbs has subtly different visuals than the new generic.** Migration loses the Home glyph and the inline category-label rewriting (`/-/g, ' '`). The category rewriting moves into the help page calling site (a 1-line `category.replace(/-/g, ' ')` before passing to `Breadcrumbs`). The Home glyph is dropped — the "Help Center" text label is sufficient. Acceptable visual diff; document in PR.

**2. Migration touches 28 files across pages and components; merge conflicts likely against in-flight work.** Land in one tight PR rather than splitting. `git log` shows no current in-flight work on these files (recent commits are all help-center work, already merged).

**3. The CI guard's false-negative classes (documented above) mean a determined contributor can still ship a non-breadcrumbed page.** Accepted risk. The guard catches the common accidental case; design review catches the intentional case.

**4. Removing back buttons from `actions` slot is a UX change, not just nav cleanup.** Currently `announcements/new` shows a "Back to announcements" outline button in the top-right via the PageHeader `actions` slot. Migration removes that button (the breadcrumb in the top-left is the new back affordance). This is a deliberate, visible change. Reviewer must approve via screenshot diff. Same change applies to any other new/edit page that today carries a back-button in `actions` (enumerated during implementation: at minimum `announcements/new`; verify `emergency/new`, `pm/dashboard/communities/new`, and the Mode B client components).

**5. Mode B client components (`ViolationDetailView`, `SubmissionDetail`, etc.) currently render their own ad-hoc page chrome (custom title cards, etc.). Migration replaces that ad-hoc chrome with a standard `<PageHeader>`.** This is a visible visual change for those pages — the title-in-card pattern goes away in favor of the standard PageHeader title. Reviewer must approve via screenshot diff. Pages affected: `violations/[id]`, `esign/submissions/[id]`, `esign/templates/[id]`, `communities/[id]/board/forum/[threadId]`.

**6. Two-hop CI guard verification depends on the exemption comment naming a real file.** A typo in the path passes the guard if the named file happens to contain `<PageHeader breadcrumb=` for some other reason. Mitigation: the guard fails if the named file does not exist (path is resolved against the repo root before reading).

**7. Mode B components with multi-branch renders (loading / error / loaded) are ambiguous migration targets.** `template-detail-client.tsx` (3 branches), `submission-detail.tsx` (2 branches, both with independent back-links), and `forum-thread-detail.tsx` (4 branches) each render PageHeader only in the loaded branch by default — which means error branches can LOSE their existing standalone back-link if the migration removes it without a replacement. Mitigation: every multi-branch migration in the inventory calls out the strategy explicitly (either render PageHeader in every branch with a conditional `currentLabel`, OR keep the error/not-found branches' standalone back-links).

**8. Breadcrumb label ↔ sidebar label mismatch.** Several parent routes have no sidebar entry (`/emergency`, `/esign/templates`, `/esign/submissions`). The spec's original "match the sidebar exactly" rule is unimplementable for these, and early drafts invented labels like `'Portfolio'` that didn't match the PM sidebar (`'Communities'`). Mitigation: the Label Conventions section now lists explicit canonical mappings and permits section-appropriate labels when no sidebar entry exists — reviewer must keep these labels consistent across sibling breadcrumbs.

**9. Breadcrumb parent href differs from existing back-link target (e-sign).** `submission-detail.tsx` and `new-submission-form.tsx` today navigate to `/esign?communityId=…`; the breadcrumb parent crumb goes to `/esign/submissions?communityId=…` (the real list page). This is a deliberate, visible behavior change. Reviewer must screenshot-diff both pages and confirm the new target is intended.

---

## Acceptance Criteria

- [ ] `Breadcrumbs` component exists at `apps/web/src/components/shared/breadcrumbs.tsx` with the API specified above.
- [ ] All 15 in-scope CI-guarded pages (13 active migrations + 2 redirect-only exempt) and 6 Mode B client components render `<PageHeader breadcrumb={<Breadcrumbs ... />}>` (or carry the `breadcrumbs:exempt` comment with a delegated path) with correct `items`/`currentLabel`.
- [ ] `help/[category]/page.tsx` is migrated (this file was missed in the first-pass inventory; running the CI guard on an unmigrated version fails lint).
- [ ] `pm/dashboard/communities/new/page.tsx` carries a `breadcrumbs:exempt — redirect-only page` comment (NOT a PageHeader; the file has no rendered output).
- [ ] The 3 non-guarded migrations (help/manage, help/contact, residents/import-residents-client) use `<Breadcrumbs>` instead of inline patterns; `import-residents-client.tsx` uses `/dashboard/residents?communityId=…` as the parent href.
- [ ] Multi-branch client components (`template-detail-client.tsx`, `submission-detail.tsx`, `forum-thread-detail.tsx`) ship with an explicit, documented strategy for their error / loading / not-found branches (either PageHeader in every branch OR standalone back-link preserved in non-loaded branches) — chosen approach recorded in the PR description.
- [ ] Every migrated `<PageHeader>` places `breadcrumb=` before any JSX-valued prop (required for the CI guard regex to match).
- [ ] `apps/web/src/components/help/article-breadcrumbs.tsx` deleted; help pages migrated.
- [ ] `scripts/verify-page-breadcrumbs.ts` exists and exits non-zero when an in-scope page lacks a breadcrumb.
- [ ] CI guard self-test covers all six cases listed in Testing Strategy (including the non-empty "delegated target not found" case).
- [ ] `pnpm guard:breadcrumbs` wired into root `lint` script and passes on the migrated codebase.
- [ ] `.claude/rules/design.md` documents the convention (including the prop-ordering rule and the scoped "no ad-hoc back links" rule).
- [ ] `pnpm typecheck` passes.
- [ ] `pnpm lint` passes.
- [ ] `pnpm test` passes (including new `Breadcrumbs` unit tests).
- [ ] Manual verification of `/announcements/[id]` confirms the original repro is resolved.
- [ ] PR description includes screenshot diffs for Risks #4, #5, and #9 (the e-sign parent-href change).
