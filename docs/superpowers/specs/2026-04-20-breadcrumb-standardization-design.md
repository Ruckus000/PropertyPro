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
  <li>
    <span
      aria-current="page"
      class="font-medium text-content-secondary truncate max-w-[40ch]"
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
- **Truncation on the current item only.** `truncate max-w-[40ch]`. Long announcement titles ("Notice of Special Assessment Hearing for Roof Replacement Project — March 2026") would otherwise wrap awkwardly. Parent crumbs are short, controlled section names ("Announcements", "Documents"); no truncation needed.
- **Single-crumb case** (no `items`, only `currentLabel`): renders just the `<li><span aria-current="page">…` — no separator, no error, no warning. Layout is identical, just one item.

---

## Label Conventions

Determines what `items[].label` and `currentLabel` should say across sections. Documented as a table in `.claude/rules/design.md` so future contributors don't reinvent.

| Page type | `items` | `currentLabel` |
|---|---|---|
| Section detail (`/announcements/[id]`) | `[{ label: 'Announcements', href: '/announcements?communityId=X' }]` | entity title (e.g., announcement title) |
| Section new (`/announcements/new`) | `[{ label: 'Announcements', href: '/announcements?communityId=X' }]` | `'New announcement'` (verb-first, sentence case) |
| Section edit (`/announcements/[id]/edit`) | `[{ label: 'Announcements', href: ... }, { label: <fetched entity title>, href: '/announcements/[id]?communityId=X' }]` | `'Edit'` |
| Sub-section detail (`/communities/[id]/board/forum/[threadId]`) | `[{ label: 'Board', href: ... }, { label: 'Forum', href: ... }]` | thread title |
| Help article (`/help/[category]/[slug]`) | `[{ label: 'Help Center', href: ... }, { label: categoryLabel, href: ... }]` | article title |

**Rules:**
- Section labels in breadcrumbs match the sidebar nav label exactly (`nav-config.ts`). Single source of truth for naming.
- Dynamic parent labels (e.g., parent entity title in an edit-page crumb) are sourced from the entity already fetched by the page — no extra DB queries to populate the breadcrumb. If the page does not already fetch the parent entity, the breadcrumb either omits that crumb or the page fetches it (cost: one extra query).
- New/edit page `currentLabel` follows the existing app convention: `'New <entity>'` (e.g., `'New announcement'`) and `'Edit'` (the entity context is already provided by the parent-detail crumb).

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
2. `apps/web/src/app/(authenticated)/emergency/[id]/page.tsx` — currently has inline `← Back` link. Replace with PageHeader + Breadcrumbs; remove the inline link.
3. `apps/web/src/app/(authenticated)/help/[category]/[slug]/page.tsx` — already uses PageHeader; replace `<ArticleBreadcrumbs>` with `<Breadcrumbs>`.

(Originally listed `pm/dashboard/[community_id]/page.tsx` here — verified that file is redirect-only and moved to the exemption list below.)

**Detail pages — Mode B (page file gets exemption comment; chrome migrated in client component):**
5. `apps/web/src/app/(authenticated)/violations/[id]/page.tsx` — delegates to `ViolationDetailView`. Page gets `// breadcrumbs:exempt — delegated to apps/web/src/components/violations/ViolationDetailView.tsx`.
6. `apps/web/src/app/(authenticated)/esign/submissions/[id]/page.tsx` — delegates to `SubmissionDetail`.
7. `apps/web/src/app/(authenticated)/esign/templates/[id]/page.tsx` — delegates to `TemplateDetailClient`.
8. `apps/web/src/app/(authenticated)/communities/[id]/board/forum/[threadId]/page.tsx` — delegates to `ForumThreadDetail`.

**New pages — Mode A:**
9. `apps/web/src/app/(authenticated)/announcements/new/page.tsx` — already has PageHeader; add `breadcrumb` prop; **remove the `Back to announcements` outline button from `actions` slot** (see Risks #4 — this is an explicit visual change).
10. `apps/web/src/app/(authenticated)/emergency/new/page.tsx` — verify shape; add PageHeader + Breadcrumbs.
11. `apps/web/src/app/(authenticated)/pm/dashboard/communities/new/page.tsx` — verify shape; add PageHeader + Breadcrumbs.

**New pages — Mode B:**
12. `apps/web/src/app/(authenticated)/esign/submissions/new/page.tsx` — delegates to `NewSubmissionForm`.
13. `apps/web/src/app/(authenticated)/esign/templates/new/page.tsx` — delegates to `TemplateBuilderClient`.

**Edit pages — Mode A:**
14. `apps/web/src/app/(authenticated)/announcements/[id]/edit/page.tsx` — pass parent list crumb + parent detail crumb. The page already fetches the announcement (it must, to populate the form); use that fetched title as the parent-detail crumb label and `'Edit'` as `currentLabel`.

### Mode B client components (chrome migration target for the exempted pages above)

15. `apps/web/src/components/violations/ViolationDetailView.tsx` — replace ad-hoc back link + custom header card with `<PageHeader title="Violation #{id}" breadcrumb={<Breadcrumbs items={[{label: isAdmin ? 'Violations Inbox' : 'Your Reports', href: ...}]} currentLabel={`Violation #${violation.id}`} />}>`. Visual diff: card-style title becomes standard PageHeader title.
16. `apps/web/src/components/board/forum/forum-thread-detail.tsx` — replace `← Back to Forum`.
17. `apps/web/src/components/esign/new-submission-form.tsx` — replace `<ArrowLeft>` back button.
18. `apps/web/src/components/esign/submission-detail.tsx` — replace `<ArrowLeft>` back button.
19. `apps/web/src/app/(authenticated)/esign/templates/new/template-builder-client.tsx` — replace `<ChevronLeft>` and `<ArrowLeft>` back buttons (lines 372, 583).
20. `apps/web/src/app/(authenticated)/esign/templates/[id]/template-detail-client.tsx` — replace `<ChevronLeft>` back buttons (lines 194, 211).

### Non-guarded pages migrated for consistency (in scope per Q1=B + critique #5)

These pages are not in the CI guard's glob (they are list/static pages, not detail/new/edit), but they currently use ad-hoc breadcrumb patterns. Migrating them in this PR removes the inconsistency.

21. `apps/web/src/app/(authenticated)/help/manage/page.tsx` — replace inline `<Link>` in breadcrumb slot with `<Breadcrumbs items={[]} currentLabel="Manage FAQs" />`. Wait — it's a sub-page of Help Center, so `items={[{label:'Help Center', href:...}]}, currentLabel="Manage FAQs"`.
22. `apps/web/src/app/(authenticated)/help/contact/page.tsx` — same shape as #21, currentLabel `"Management Contact"`.
23. `apps/web/src/components/residents/import-residents-client.tsx` — replace `<ArrowLeft>` back button. Rendered from `apps/web/src/app/(authenticated)/dashboard/import-residents/page.tsx` (a static page, not in the guard's glob).

### Files to delete

24. `apps/web/src/components/help/article-breadcrumbs.tsx` — replaced by the new generic `Breadcrumbs`.

### Pages exempted with reason

- `apps/web/src/app/(authenticated)/communities/[id]/announcements/page.tsx` — `breadcrumbs:exempt — redirect-only page`. 10-line `redirect()` to `/announcements?communityId=…`.
- `apps/web/src/app/(authenticated)/pm/dashboard/[community_id]/page.tsx` — `breadcrumbs:exempt — redirect-only page`. 35-line server component that resolves a target via `resolvePmDashboardTarget(userId, communityId)` and `redirect()`s to it.

**Total: 14 in-scope CI-guarded pages (4 Mode A detail + 4 Mode B detail + 3 Mode A new + 2 Mode B new + 1 edit) + 6 client components + 3 non-guarded migrations + 1 file deleted + 1 new component + 1 new script + 2 config edits = 28 files.**

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

These are acceptable. The guard prevents the common case (a new `[id]/page.tsx` ships with no breadcrumb at all). It is not a type checker.

**Why not AST parsing:** A grep-based guard is ~80 lines (more than the original ~50 estimate due to the two-hop verification), runs in milliseconds, has zero new dependencies. The repo has no AST tooling today (`@typescript-eslint/parser` and `ts-morph` are not in any `package.json`); introducing one for a single rule is over-investment. `verify-scoped-db-access.ts` sets the precedent for string parsing.

---

## Documentation

`.claude/rules/design.md` — append under the existing "## State Handling" section:

```markdown
## Page Navigation & Breadcrumbs

- Every detail/new/edit page under `apps/web/src/app/(authenticated)/` MUST render
  `<PageHeader breadcrumb={<Breadcrumbs items={[...]} currentLabel="..." />}>`.
- Breadcrumb labels for parent crumbs match the sidebar nav label exactly.
- Current page label matches the page's `<h1>` title.
- Pages that legitimately render no `<PageHeader>` (e.g., redirect-only pages)
  must include a `// breadcrumbs:exempt — <reason>` comment at the top of the
  file. The CI guard (`pnpm guard:breadcrumbs`) enforces this.
- Do not add ad-hoc `← Back` links elsewhere on a page. The breadcrumb is the
  back affordance.
```

---

## Edge Cases & Open Questions

**Browser back vs static parent link.**
A user landing on `/announcements/123` from a dashboard widget gets teleported to `/announcements?communityId=…` by the breadcrumb, not back to the dashboard. We chose static for predictability (the link target is visible in the URL, identical for every visitor, bookmarkable). Browser back still works for users who want history navigation.

**Long titles.**
`currentLabel` is `truncate max-w-[40ch]`. Browsers render the truncated form; the full title is in the `<h1>` directly below. If a user wants the full title, it's the next element on the page.

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

- **CI guard self-test:** A unit test for `scripts/verify-page-breadcrumbs.ts` that runs the guard against synthetic fixtures (one passing, one failing, one exempted) and asserts the right exit codes.

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

---

## Acceptance Criteria

- [ ] `Breadcrumbs` component exists at `apps/web/src/components/shared/breadcrumbs.tsx` with the API specified above.
- [ ] All 14 in-scope CI-guarded pages and 6 Mode B client components render `<PageHeader breadcrumb={<Breadcrumbs ... />}>` (or carry the `breadcrumbs:exempt` comment with a delegated path) with correct `items`/`currentLabel`.
- [ ] The 3 non-guarded migrations (help/manage, help/contact, residents/import-residents-client) use `<Breadcrumbs>` instead of inline patterns.
- [ ] `apps/web/src/components/help/article-breadcrumbs.tsx` deleted; help pages migrated.
- [ ] `scripts/verify-page-breadcrumbs.ts` exists and exits non-zero when an in-scope page lacks a breadcrumb.
- [ ] `pnpm guard:breadcrumbs` wired into root `lint` script and passes on the migrated codebase.
- [ ] `.claude/rules/design.md` documents the convention.
- [ ] `pnpm typecheck` passes.
- [ ] `pnpm lint` passes.
- [ ] `pnpm test` passes (including new `Breadcrumbs` unit tests).
- [ ] Manual verification of `/announcements/[id]` confirms the original repro is resolved.
