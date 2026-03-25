# Header Search Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the page title from AppTopBar and replace it with a prominent, centered search bar that opens the command palette — making search the focal feature of the header.

**Architecture:** The h1 page title moves from AppTopBar into the content area via an updated PageHeader component. AppTopBar becomes a slim utility strip (56px) with: hamburger (mobile) + search bar (center) + user menu (right). The existing command palette remains the search backend — the new search bar is a styled trigger, not an inline search field. On mobile, the search bar sits in a second row below the hamburger + avatar.

**Tech Stack:** React 19, Next.js App Router, Tailwind CSS, Lucide icons, existing cn() utility

---

## File Structure

| Action | File | Responsibility |
|--------|------|---------------|
| Modify | `apps/web/src/components/layout/app-top-bar.tsx` | Remove title, add prominent search bar trigger, slim to 56px |
| Modify | `apps/web/src/components/shared/page-header.tsx` | Add h1 title rendering (was explicitly excluded before) |
| Modify | `apps/web/src/components/layout/nav-config.ts` | Keep `PAGE_TITLES` — still used by PageHeader for content-area titles |
| Modify | `apps/web/src/components/layout/app-shell.tsx` | No changes expected (AppTopBar API stays the same) |
| Modify | `apps/web/src/components/pm/PmDashboardClient.tsx` | Add `title` prop to existing PageHeader usage |
| Modify | 3 pages confirmed missing h1 | Add PageHeader with title to pages without content-area h1 |
| Fix | `apps/web/src/app/(authenticated)/settings/page.tsx` | Fix double-h1 bug (downgrade "Notification Preferences" to h2) |

### Pages Needing h1 Addition (confirmed via audit)

**Already have h1 — NO changes needed:**
- `/dashboard` — `DashboardWelcome` renders h1 "Welcome back, {name}"
- `/dashboard/apartment` — `DashboardWelcome` renders h1
- `/dashboard/residents` — `ResidentsPageClient` renders its own h1 "Residents"
- `/dashboard/import-residents` — `ImportResidentsClient` renders its own h1 "Import Residents"
- `/esign` — `EsignPageShell` renders its own h1 "E-Sign"
- `/maintenance/submit` — page renders its own h1 "Maintenance Requests"

**Confirmed MISSING h1 — need PageHeader added:**
1. `apps/web/src/app/(authenticated)/pm/dashboard/communities/page.tsx` → `PmDashboardClient` — no h1 anywhere
2. `apps/web/src/app/(authenticated)/communities/[id]/compliance/page.tsx` → `ComplianceDashboard` — no h1
3. `apps/web/src/app/(authenticated)/pm/reports/page.tsx` → `PmReportsClient` — no h1

**Existing call site that needs `title` prop added:**
- `apps/web/src/components/pm/PmDashboardClient.tsx` — uses PageHeader today without title (comment says "AppTopBar owns the h1")

---

## Task 1: Redesign AppTopBar — Remove Title, Add Prominent Search Bar

**Files:**
- Modify: `apps/web/src/components/layout/app-top-bar.tsx`

- [ ] **Step 1: Read the current AppTopBar implementation**

File: `apps/web/src/components/layout/app-top-bar.tsx`
Understand the current structure: h1 title on left, search button + user menu on right, 64px height.

- [ ] **Step 2: Rewrite AppTopBar to remove title and add prominent search bar**

Replace the entire component with this structure:
- Height: `h-14` (56px) — slimmer than current 64px
- Layout: `flex items-center gap-4 px-4 lg:px-6`
- Left: hamburger button (mobile only, same as current)
- Center: Search bar trigger — styled as an input-like div that opens the command palette on click
  - `flex-1 max-w-[560px]` — takes available space, caps at 560px
  - `flex items-center gap-2 h-10 px-3.5 rounded-[var(--radius-md)]`
  - `border border-edge bg-surface-page` with hover/focus states
  - Contains: Search icon (16px) + placeholder text + kbd shortcut badge
  - Entire bar is a `<button>` wrapping the visual — clicking opens command palette
  - `aria-label="Search"` + `role="search"` wrapper for accessibility
- Right: `ml-auto` + UserMenu (same as current)
- Mobile: Two-row layout using `flex-col` on `< lg` breakpoints
  - Row 1: hamburger + spacer + user avatar
  - Row 2: full-width search bar with padding

```tsx
'use client';

import { Menu, Search } from 'lucide-react';
import { UserMenu } from './user-menu';
import { useSidebar } from './sidebar-context';

interface AppTopBarProps {
  userName: string | null;
  userEmail: string | null;
  communityId: number | null;
  onSearchOpen?: () => void;
}

export function AppTopBar({ userName, userEmail, communityId, onSearchOpen }: AppTopBarProps) {
  const { setMobileOpen } = useSidebar();

  return (
    <header className="shrink-0 border-b border-edge bg-surface-card">
      {/* Desktop layout */}
      <div className="hidden h-14 items-center gap-4 px-6 lg:flex">
        <div role="search" className="flex flex-1 justify-center">
          <button
            type="button"
            onClick={onSearchOpen}
            className="flex h-10 w-full max-w-[560px] items-center gap-2.5 rounded-[var(--radius-md)] border border-edge bg-surface-page px-3.5 text-sm text-content-placeholder transition-colors duration-quick hover:border-edge-strong hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
            aria-label="Search — press Command K to open"
          >
            <Search size={16} aria-hidden="true" />
            <span className="flex-1 text-left">Search documents, meetings, residents...</span>
            <kbd className="rounded border border-edge bg-surface-card px-1.5 py-0.5 text-xs font-medium text-content-tertiary">
              ⌘K
            </kbd>
          </button>
        </div>
        <UserMenu userName={userName} userEmail={userEmail} communityId={communityId} />
      </div>

      {/* Mobile layout — two rows */}
      <div className="lg:hidden">
        <div className="flex h-12 items-center justify-between px-4">
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            className="flex size-10 items-center justify-center rounded-md text-content-tertiary transition-colors duration-quick hover:bg-surface-muted"
            aria-label="Open navigation"
          >
            <Menu size={20} aria-hidden="true" />
          </button>
          <UserMenu userName={userName} userEmail={userEmail} communityId={communityId} />
        </div>
        <div className="px-4 pb-3" role="search">
          <button
            type="button"
            onClick={onSearchOpen}
            className="flex h-10 w-full items-center gap-2 rounded-[var(--radius-md)] border border-edge bg-surface-page px-3 text-sm text-content-placeholder transition-colors duration-quick hover:border-edge-strong"
            aria-label="Search"
          >
            <Search size={16} aria-hidden="true" />
            <span>Search documents, residents...</span>
          </button>
        </div>
      </div>
    </header>
  );
}
```

Key changes:
- Removed all title/subtitle logic and imports (`usePathname`, `NAV_ITEMS`, `PM_NAV_ITEMS`, `PAGE_TITLES`, `getActiveItemId`, `deriveTitleFromPathname`)
- Search bar is a `<button>` styled as an input (not an actual input) — clicking opens the command palette
- Desktop: single row, search centered with `flex-1 justify-center`, max-width 560px
- Mobile: two rows — top row has hamburger + user menu, bottom row has full-width search bar
- `role="search"` landmark for screen readers
- `aria-label` on search button includes keyboard shortcut hint

- [ ] **Step 3: Verify the component compiles**

Run: `pnpm typecheck`
Expected: No errors in `app-top-bar.tsx`

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/layout/app-top-bar.tsx
git commit -m "refactor(header): remove page title, add prominent centered search bar

Replace the h1 page title with a prominent search bar trigger that opens
the command palette. Header slimmed from 64px to 56px. Mobile uses a
two-row layout with full-width search bar."
```

---

## Task 2: Update PageHeader to Render h1 Title

**Files:**
- Modify: `apps/web/src/components/shared/page-header.tsx`

- [ ] **Step 1: Read the current PageHeader component**

File: `apps/web/src/components/shared/page-header.tsx`
Currently explicitly avoids rendering an h1 (comment says "AppTopBar owns the h1 page title").

- [ ] **Step 2: Add title prop to PageHeader**

Update PageHeader to accept and render an h1 title. This is now the canonical place for page titles since AppTopBar no longer renders one.

```tsx
/**
 * PageHeader — Standardized page header with title, description, and actions.
 *
 * Renders the page-level h1 heading. Used at the top of content areas
 * below AppTopBar to establish page identity and provide actions.
 */

import * as React from "react";
import { cn } from "@/lib/utils";

interface PageHeaderProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Page title — rendered as h1 */
  title: string;
  /** Subtitle or description text */
  description?: React.ReactNode;
  /** Action buttons (right-aligned on desktop) */
  actions?: React.ReactNode;
  /** Optional breadcrumb or context element */
  breadcrumb?: React.ReactNode;
}

export function PageHeader({
  title,
  description,
  actions,
  breadcrumb,
  className,
  children,
  ...props
}: PageHeaderProps) {
  return (
    <div
      className={cn("flex flex-col gap-2 pb-6", className)}
      {...props}
    >
      {breadcrumb && (
        <nav aria-label="Breadcrumb" className="text-sm text-content-tertiary">
          {breadcrumb}
        </nav>
      )}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight text-content">
            {title}
          </h1>
          {description && (
            <p className="text-sm text-content-secondary">{description}</p>
          )}
          {children}
        </div>

        {actions && (
          <div className="flex shrink-0 items-center gap-2">
            {actions}
          </div>
        )}
      </div>
    </div>
  );
}
```

Key changes:
- `title` is now a required prop, rendered as `<h1>`
- Updated JSDoc comment to reflect new role
- h1 styling: `text-2xl font-semibold tracking-tight text-content`
- Description moved below title

- [ ] **Step 3: Update all existing PageHeader call sites to include `title` prop**

Run: `grep -rn "PageHeader" apps/web/src/ --include="*.tsx" | grep -v "import"` to find all call sites.

**Known call site requiring update:**
- `apps/web/src/components/pm/PmDashboardClient.tsx` (~line 43) — currently uses `<PageHeader description="...">` without title. Add `title="Communities"` to match `PAGE_TITLES`.

Each existing usage needs the `title` prop added. The title should match what `PAGE_TITLES` in `nav-config.ts` had for that page. If a page already renders its own standalone h1 AND uses PageHeader, remove the standalone h1 and pass it as the `title` prop instead to avoid double-h1.

- [ ] **Step 4: Verify no TypeScript errors**

Run: `pnpm typecheck`
Expected: No errors — all PageHeader call sites now pass `title`

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/shared/page-header.tsx
git commit -m "feat(page-header): add h1 title rendering to PageHeader component

PageHeader now owns the page-level h1 heading, replacing AppTopBar's
title. Title is a required prop rendered as a styled h1."
```

---

## Task 3: Add Page Titles to Pages Confirmed Missing h1

**Files:**
- Modify: `apps/web/src/components/pm/PmDashboardClient.tsx` (already has PageHeader, just needs title)
- Modify: `apps/web/src/app/(authenticated)/communities/[id]/compliance/page.tsx` or its client component
- Modify: `apps/web/src/components/pm/PmReportsClient.tsx`

- [ ] **Step 1: Add PageHeader with title to pages missing h1**

These 3 pages are confirmed to have NO h1 in their content area:

| Component/Page | Title | Subtitle |
|------|-------|----------|
| `PmDashboardClient` | "Communities" | "Managed portfolio" |
| `ComplianceDashboard` (communities/[id]/compliance) | "Compliance" | "Statutory requirements" |
| `PmReportsClient` | "Reports" | "Portfolio analytics & reports" |

For each, import PageHeader and add at the top of the render:

```tsx
import { PageHeader } from '@/components/shared/page-header';
// ... in render:
<PageHeader title="Title" description="Subtitle" />
```

**Note:** `PmDashboardClient` already imports and uses PageHeader — just add the `title` prop (handled in Task 2 Step 3). The other two need PageHeader added from scratch.

- [ ] **Step 2: Fix settings page double-h1 bug**

File: `apps/web/src/app/(authenticated)/settings/page.tsx`

This page has two `<h1>` tags — one for "Settings" in the error branch (~line 37) and one for "Notification Preferences" in the happy path (~line 66). Fix both branches:
1. **Happy path:** Change `<h1>Notification Preferences</h1>` to `<h2>Notification Preferences</h2>`, then add `<PageHeader title="Settings" />` at the top
2. **Error branch (~line 37):** Replace the bare `<h1 className="mb-4 text-xl font-semibold">Settings</h1>` with `<PageHeader title="Settings" />` to use the same component and styling as all other pages

- [ ] **Step 3: Verify no duplicate h1s**

Run: `pnpm typecheck` to ensure everything compiles.

Spot-check with grep: `grep -rn '<h1' apps/web/src/app/\(authenticated\)/settings/page.tsx` — should show exactly one h1 per render path.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/
git commit -m "fix(a11y): add h1 page titles to pages that relied on AppTopBar

Three pages confirmed missing content-area h1 now use PageHeader.
Fixed double-h1 bug on settings page (downgraded sub-heading to h2).
Ensures every page has exactly one h1 for accessibility."
```

---

## Task 4: Clean Up Unused Imports and Dead Code

**Files:**
- Modify: `apps/web/src/components/layout/app-top-bar.tsx` (verify)
- Modify: `apps/web/src/components/layout/nav-config.ts` (maybe — check if PAGE_TITLES still has consumers)

- [ ] **Step 1: Check if PAGE_TITLES is still referenced**

Run: `grep -rn 'PAGE_TITLES' apps/web/src/ --include="*.ts" --include="*.tsx"`

If PAGE_TITLES is only used by app-top-bar.tsx (which we removed), and no new code references it, it can stay for now — it serves as documentation and could be useful for the PageHeader additions in Task 3.

- [ ] **Step 2: Run full lint and typecheck**

Run: `pnpm lint && pnpm typecheck`
Expected: All pass

- [ ] **Step 3: Remove the prototype HTML file**

```bash
rm prototype-header.html
```

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "chore: clean up unused imports and remove prototype file"
```

---

## Task 5: Visual Verification

- [ ] **Step 1: Start dev server and verify desktop header**

```bash
pnpm dev
```

Navigate to `/dashboard` and verify:
- Header is 56px tall (no page title)
- Search bar is centered with max-width ~560px
- Search bar shows placeholder text + ⌘K badge
- Clicking search bar opens the command palette
- ⌘K keyboard shortcut still works
- User menu is on the right

- [ ] **Step 2: Verify mobile header**

Resize to < 1024px and verify:
- Two-row header: hamburger + avatar on top, full-width search bar below
- Hamburger opens the sidebar drawer
- Tapping search bar opens command palette

- [ ] **Step 3: Verify page titles in content area**

Navigate to several pages and verify each has an h1:
- `/dashboard` — "Welcome back, {name}" (from DashboardWelcome)
- `/documents` (redirects to `/communities/[id]/documents`) — should have h1
- `/esign` — should have h1 "E-Sign"
- `/dashboard/residents` — should have h1 "Residents"
- `/maintenance/inbox` — already had h1 "Maintenance Inbox"

- [ ] **Step 4: Verify accessibility**

- Tab through the header — search bar should be focusable and show focus ring
- Screen reader: header should have `role="search"` landmark
- Each page should have exactly one h1 (check with browser dev tools: `document.querySelectorAll('h1').length === 1`)

---

## Summary of Changes

| Component | Before | After |
|-----------|--------|-------|
| AppTopBar height | 64px | 56px |
| AppTopBar content | h1 title + small search button + user menu | Centered search bar + user menu |
| AppTopBar mobile | Hamburger + title + search icon + avatar | Row 1: hamburger + avatar. Row 2: full-width search |
| PageHeader | No h1 (deferred to AppTopBar) | Renders h1 as required `title` prop |
| Page titles | In AppTopBar header | In content area via PageHeader |
| Command palette trigger | Small button in top-right | Prominent search bar (same palette) |
| Search discoverability | Low (small button, easy to miss) | High (visible input-style trigger, center of header) |
