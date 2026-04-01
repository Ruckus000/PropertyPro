# Pre-Launch Audit Remediation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix all audit findings from sad-hertz and main branches, merge the notification system, remove legal DRAFT banners, add transparency marketing page, and clean up stale branches.

**Architecture:** Work is split into two phases — Phase A operates in the sad-hertz worktree (Tasks 1-4), Phase B operates on main after squash-merge (Tasks 5-9). Tasks within each phase are independent except where noted.

**Tech Stack:** Next.js 15 (App Router), React 19, Tailwind CSS, shadcn/ui, PostgreSQL (Supabase), Drizzle ORM

---

## Phase A: sad-hertz Worktree Fixes

> All Phase A tasks run in `/Users/jphilistin/Documents/Coding/PropertyPro/.claude/worktrees/sad-hertz/`

### Task 1: Fix dedup unique index

**Files:**
- Modify: `packages/db/migrations/0129_create_notifications_table.sql`

- [ ] **Step 1: Edit the dedup index to add partial filter**

In `packages/db/migrations/0129_create_notifications_table.sql`, find:
```sql
CREATE UNIQUE INDEX IF NOT EXISTS "notifications_dedup_unique"
  ON "notifications" ("community_id", "user_id", "source_type", "source_id");
```

Replace with:
```sql
CREATE UNIQUE INDEX IF NOT EXISTS "notifications_dedup_unique"
  ON "notifications" ("community_id", "user_id", "source_type", "source_id")
  WHERE "deleted_at" IS NULL;
```

- [ ] **Step 2: Commit**

```bash
cd /Users/jphilistin/Documents/Coding/PropertyPro/.claude/worktrees/sad-hertz
git add packages/db/migrations/0129_create_notifications_table.sql
git commit -m "fix(db): add partial filter to notifications dedup index

Exclude soft-deleted rows so re-creation of the same event
after deletion is not silently dropped by onConflictDoNothing()."
```

---

### Task 2: Notification dropdown — error, loading, and empty states

**Files:**
- Modify: `apps/web/src/components/notifications/notification-dropdown.tsx`

- [ ] **Step 1: Add imports for design system components**

In `notification-dropdown.tsx`, replace the existing imports block:
```typescript
'use client';

import Link from 'next/link';
import { useEffect, useRef } from 'react';
import { useNotifications, useMarkRead } from '@/hooks/use-notifications';
import { NotificationListItem } from './notification-list-item';
```

With:
```typescript
'use client';

import Link from 'next/link';
import { useEffect, useRef } from 'react';
import { useNotifications, useMarkRead } from '@/hooks/use-notifications';
import { NotificationListItem } from './notification-list-item';
import { AlertBanner } from '@/components/shared/alert-banner';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/shared/empty-state';
```

- [ ] **Step 2: Destructure isError from the query**

Find:
```typescript
  const { data, isLoading } = useNotifications(communityId, { limit: 10 });
```

Replace with:
```typescript
  const { data, isLoading, isError } = useNotifications(communityId, { limit: 10 });
```

- [ ] **Step 3: Replace inline loading/empty/error states**

Find the entire `<div className="max-h-80 overflow-y-auto">` block:
```typescript
      <div className="max-h-80 overflow-y-auto">
        {isLoading ? (
          <div className="space-y-px p-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-14 animate-pulse rounded-[var(--radius-sm)] bg-[var(--surface-muted)]" />
            ))}
          </div>
        ) : items.length === 0 ? (
          <div className="px-4 py-8 text-center">
            <p className="text-sm text-[var(--text-tertiary)]">You're all caught up</p>
          </div>
        ) : (
          <div role="list">
            {items.map((n) => (
              <NotificationListItem key={n.id} notification={n} communityId={communityId} onNavigate={onClose} />
            ))}
          </div>
        )}
      </div>
```

Replace with:
```typescript
      <div className="max-h-80 overflow-y-auto">
        {isError ? (
          <div className="p-3">
            <AlertBanner
              status="danger"
              title="Couldn't load notifications"
              description="Please try again later."
              variant="subtle"
            />
          </div>
        ) : isLoading ? (
          <div className="space-y-px p-2">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-14 rounded-[var(--radius-sm)]" />
            ))}
          </div>
        ) : items.length === 0 ? (
          <EmptyState
            icon="bell"
            title="You're all caught up"
            description="New activity will appear here as it happens."
            size="sm"
          />
        ) : (
          <div role="list">
            {items.map((n) => (
              <NotificationListItem key={n.id} notification={n} communityId={communityId} onNavigate={onClose} />
            ))}
          </div>
        )}
      </div>
```

- [ ] **Step 4: Verify types compile**

```bash
cd /Users/jphilistin/Documents/Coding/PropertyPro/.claude/worktrees/sad-hertz
pnpm typecheck
```

Expected: No errors in `notification-dropdown.tsx`.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/notifications/notification-dropdown.tsx
git commit -m "fix(notifications): use design system components in dropdown

Replace inline skeleton/empty divs with Skeleton, EmptyState, and
AlertBanner components for consistent error/loading/empty handling."
```

---

### Task 3: Notifications page — error, loading, empty states + a11y

**Files:**
- Modify: `apps/web/src/app/(authenticated)/notifications/notifications-page-client.tsx`

- [ ] **Step 1: Add imports for design system components**

In `notifications-page-client.tsx`, after the existing imports:
```typescript
import { NotificationListItem } from '@/components/notifications/notification-list-item';
```

Add:
```typescript
import { AlertBanner } from '@/components/shared/alert-banner';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/shared/empty-state';
```

- [ ] **Step 2: Destructure isError from the query**

Find:
```typescript
  const { data, isLoading, isFetching } = useNotifications(communityId, filters);
```

Replace with:
```typescript
  const { data, isLoading, isError, isFetching } = useNotifications(communityId, filters);
```

- [ ] **Step 3: Add aria-pressed to category filter buttons**

Find the category button rendering:
```typescript
            <button
              key={c.value}
              type="button"
              onClick={() => { setCategory(c.value); resetPagination(); }}
              className={
                category === c.value
                  ? 'rounded-[var(--radius-sm)] bg-[var(--interactive-primary)] px-3 py-1.5 text-xs font-medium text-white'
                  : 'rounded-[var(--radius-sm)] px-3 py-1.5 text-xs font-medium text-[var(--text-secondary)] hover:bg-[var(--surface-muted)]'
              }
            >
```

Replace with:
```typescript
            <button
              key={c.value}
              type="button"
              aria-pressed={category === c.value}
              onClick={() => { setCategory(c.value); resetPagination(); }}
              className={
                category === c.value
                  ? 'rounded-[var(--radius-sm)] bg-[var(--interactive-primary)] px-3 py-1.5 text-xs font-medium text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus'
                  : 'rounded-[var(--radius-sm)] px-3 py-1.5 text-xs font-medium text-[var(--text-secondary)] hover:bg-[var(--surface-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus'
              }
            >
```

- [ ] **Step 4: Replace inline loading/empty states and add error state**

Find the content container:
```typescript
      <div className="overflow-hidden rounded-[var(--radius-md)] border border-[var(--border-default)] bg-[var(--surface-card)]">
        {isLoading ? (
          <div className="space-y-px p-2">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="h-14 animate-pulse rounded-[var(--radius-sm)] bg-[var(--surface-muted)]" />
            ))}
          </div>
        ) : allItems.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <p className="text-sm font-medium text-[var(--text-primary)]">You're all caught up</p>
            <p className="mt-1 text-xs text-[var(--text-tertiary)]">
              New activity will appear here as it happens.
            </p>
          </div>
        ) : (
          <div role="list">
            {allItems.map((n) => (
              <NotificationListItem key={n.id} notification={n} communityId={communityId} />
            ))}
          </div>
        )}
      </div>
```

Replace with:
```typescript
      <div className="overflow-hidden rounded-[var(--radius-md)] border border-[var(--border-default)] bg-[var(--surface-card)]">
        {isError ? (
          <div className="p-4">
            <AlertBanner
              status="danger"
              title="Couldn't load notifications"
              description="We had trouble fetching your notifications. Please try again."
              variant="subtle"
            />
          </div>
        ) : isLoading ? (
          <div className="space-y-px p-2">
            {[1, 2, 3, 4, 5].map((i) => (
              <Skeleton key={i} className="h-14 rounded-[var(--radius-sm)]" />
            ))}
          </div>
        ) : allItems.length === 0 ? (
          <EmptyState
            icon="bell"
            title="You're all caught up"
            description="New activity will appear here as it happens."
            size="md"
          />
        ) : (
          <div role="list">
            {allItems.map((n) => (
              <NotificationListItem key={n.id} notification={n} communityId={communityId} />
            ))}
          </div>
        )}
      </div>
```

- [ ] **Step 5: Verify types compile**

```bash
cd /Users/jphilistin/Documents/Coding/PropertyPro/.claude/worktrees/sad-hertz
pnpm typecheck
```

Expected: No errors.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/app/\(authenticated\)/notifications/notifications-page-client.tsx
git commit -m "fix(notifications): design system components + a11y on notifications page

Replace inline skeletons/empty states with Skeleton, EmptyState, and
AlertBanner. Add aria-pressed to category filter buttons and focus rings."
```

---

### Task 4: Notification list item a11y + commit uncommitted files

**Files:**
- Modify: `apps/web/src/components/notifications/notification-list-item.tsx`
- Stage: `apps/web/src/app/mobile/notifications/page.tsx` (already modified, uncommitted)
- Stage: `apps/web/src/lib/services/notification-service.ts` (already modified, uncommitted)

- [ ] **Step 1: Add aria-label to notification list item button**

In `notification-list-item.tsx`, find the button opening tag:
```typescript
    <button
      type="button"
      onClick={handleClick}
      className={cn(
```

Replace with:
```typescript
    <button
      type="button"
      aria-label={`View: ${notification.title}`}
      onClick={handleClick}
      className={cn(
```

- [ ] **Step 2: Verify types compile**

```bash
cd /Users/jphilistin/Documents/Coding/PropertyPro/.claude/worktrees/sad-hertz
pnpm typecheck
```

- [ ] **Step 3: Commit the a11y fix**

```bash
git add apps/web/src/components/notifications/notification-list-item.tsx
git commit -m "fix(a11y): add aria-label to notification list item button"
```

- [ ] **Step 4: Commit the two previously uncommitted files**

```bash
git add apps/web/src/app/mobile/notifications/page.tsx
git add apps/web/src/lib/services/notification-service.ts
git commit -m "fix(notifications): mobile page validation + in-app preference decoupling

Mobile notifications page now validates communityId and redirects to
/select-community on invalid input. Notification service decouples
in-app recipient resolution from email preferences."
```

---

## Phase B: Main Branch Work

> All Phase B tasks run in `/Users/jphilistin/Documents/Coding/PropertyPro/` (main branch)

### Task 5: Squash-merge sad-hertz to main

**Dependencies:** Tasks 1-4 must be complete.

- [ ] **Step 1: Ensure on main branch**

```bash
cd /Users/jphilistin/Documents/Coding/PropertyPro
git checkout main
```

- [ ] **Step 2: Squash-merge the branch**

```bash
git merge --squash claude/sad-hertz
```

- [ ] **Step 3: Commit the squash merge**

```bash
git commit -m "feat: add in-app notification system

Complete notification system with:
- DB migrations (0129-0130): notifications table with RLS + in-app muting columns
- Notification service with dual-channel delivery (email + in-app)
- 4 API routes: list, unread-count, read, archive
- NotificationBell, dropdown, and list-item UI components
- Full notifications page (desktop + mobile)
- TanStack Query hooks + Supabase Realtime subscription
- Wired into 5 event flows: meetings, maintenance, documents, announcements, violations"
```

- [ ] **Step 4: Run full verification suite**

```bash
pnpm typecheck && pnpm lint && pnpm test && pnpm build
```

Expected: All pass. If `lint` fails on DB access guard, check that notification files import from `@propertypro/db` (not Drizzle directly). If `build` fails, read the error and fix before proceeding.

- [ ] **Step 5: Fix any issues found in Step 4 and recommit if needed**

If all passes, skip this step. Otherwise, fix the issue, `git add` the affected files, and create a new commit:
```bash
git commit -m "fix: resolve post-merge issues from notification system"
```

---

### Task 6: Remove DRAFT banners from legal pages

**Files:**
- Modify: `apps/web/src/app/legal/terms/page.tsx`
- Modify: `apps/web/src/app/legal/privacy/page.tsx`

- [ ] **Step 1: Remove DRAFT banner from terms page**

In `apps/web/src/app/legal/terms/page.tsx`, find and delete the entire DRAFT banner div (the 5-line block between `<article>` and the content div):
```typescript
      <div className="mb-6 rounded-md border border-status-warning-border bg-status-warning-bg px-4 py-3">
        <p className="text-sm font-medium text-status-warning">
          DRAFT DOCUMENT — This document is a placeholder and will be reviewed by legal counsel
          before launch. It does not constitute legal advice.
        </p>
      </div>
```

The file should now read:
```typescript
export default function TermsPage() {
  const html = getTermsContent();

  return (
    <article>
      <div dangerouslySetInnerHTML={{ __html: html }} />
    </article>
  );
}
```

- [ ] **Step 2: Remove DRAFT banner from privacy page**

In `apps/web/src/app/legal/privacy/page.tsx`, find and delete the identical DRAFT banner div:
```typescript
      <div className="mb-6 rounded-md border border-status-warning-border bg-status-warning-bg px-4 py-3">
        <p className="text-sm font-medium text-status-warning">
          DRAFT DOCUMENT — This document is a placeholder and will be reviewed by legal counsel
          before launch. It does not constitute legal advice.
        </p>
      </div>
```

- [ ] **Step 3: Verify build**

```bash
pnpm typecheck
```

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/legal/terms/page.tsx apps/web/src/app/legal/privacy/page.tsx
git commit -m "fix(legal): remove DRAFT banners from terms and privacy pages

Launch blocker — these pages are publicly accessible and should not
display DRAFT warnings. Placeholder legal text is retained as-is."
```

---

### Task 7: Create transparency marketing page

**Files:**
- Create: `apps/web/src/app/(marketing)/transparency/page.tsx`

- [ ] **Step 1: Create the transparency page**

Create `apps/web/src/app/(marketing)/transparency/page.tsx`:

```typescript
import type { Metadata } from 'next';
import Link from 'next/link';
import { MarketingFooter } from '@/components/marketing/footer';

export const metadata: Metadata = {
  title: 'Community Transparency | PropertyPro Florida',
  description:
    'Every PropertyPro community maintains a public transparency page with documents, meeting records, and compliance status.',
};

export default function TransparencyPage() {
  return (
    <div className="min-h-screen bg-surface-card">
      <MarketingNav />
      <main id="main-content" className="mx-auto max-w-3xl px-6 py-16">
        <h1 className="text-3xl font-bold tracking-tight text-content sm:text-4xl">
          Community Transparency
        </h1>
        <p className="mt-4 text-lg leading-relaxed text-content-secondary">
          Florida law requires condominium associations to make key documents
          available to owners and the public. PropertyPro makes this easy —
          every community on our platform has a dedicated transparency page
          with documents, meeting records, and compliance status.
        </p>

        <div className="mt-8 rounded-[var(--radius-md)] border border-edge bg-surface-raised p-6">
          <h2 className="text-lg font-semibold text-content">
            Find your community
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-content-secondary">
            Each community&apos;s transparency page is available at their
            unique subdomain:
          </p>
          <p className="mt-3 rounded-[var(--radius-sm)] bg-surface-muted px-4 py-3 font-mono text-sm text-content">
            [your-community].getpropertypro.com/transparency
          </p>
          <p className="mt-3 text-sm text-content-tertiary">
            Ask your association manager for your community&apos;s subdomain,
            or check your welcome email.
          </p>
        </div>

        <div className="mt-6">
          <p className="text-sm text-content-secondary">
            See an example:{' '}
            <Link
              href="https://sunset-condos.getpropertypro.com/transparency"
              className="font-medium text-content-link hover:underline"
            >
              Sunset Condos transparency page
            </Link>
          </p>
        </div>
      </main>
      <MarketingFooter />
    </div>
  );
}

function MarketingNav() {
  return (
    <nav className="sticky top-0 z-50 border-b border-edge bg-surface-card/95 backdrop-blur-sm">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
        <a href="/" className="text-lg font-semibold text-content">
          PropertyPro<span className="text-content-link"> Florida</span>
        </a>
        <div className="hidden items-center gap-8 sm:flex">
          <a
            href="/#features"
            className="text-sm font-medium text-content-secondary transition-colors hover:text-content"
          >
            Features
          </a>
          <a
            href="/#compliance"
            className="text-sm font-medium text-content-secondary transition-colors hover:text-content"
          >
            Compliance
          </a>
          <a
            href="/#pricing"
            className="text-sm font-medium text-content-secondary transition-colors hover:text-content"
          >
            Pricing
          </a>
          <a
            href="/auth/login"
            className="text-sm font-medium text-content-secondary transition-colors hover:text-content"
          >
            Log In
          </a>
          <a
            href="/signup"
            className="inline-flex items-center rounded-md bg-interactive px-4 py-2 text-sm font-medium text-content-inverse transition-colors hover:bg-interactive-hover"
          >
            Get Started
          </a>
        </div>
        <div className="flex items-center gap-4 sm:hidden">
          <a
            href="/signup"
            className="inline-flex items-center rounded-md bg-interactive px-3 py-2 text-sm font-medium text-content-inverse transition-colors hover:bg-interactive-hover"
          >
            Get Started
          </a>
        </div>
      </div>
    </nav>
  );
}
```

- [ ] **Step 2: Verify build**

```bash
pnpm typecheck
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/\(marketing\)/transparency/page.tsx
git commit -m "feat(marketing): add community transparency info page

Static page at /transparency explaining how to find a community's
public transparency page via their subdomain. Links to the Sunset
Condos demo as an example."
```

---

### Task 8: Add transparency link to marketing footer

**Files:**
- Modify: `apps/web/src/components/marketing/footer.tsx`

- [ ] **Step 1: Add the link to the Legal section**

In `apps/web/src/components/marketing/footer.tsx`, find the Privacy Policy list item in the Legal section:
```typescript
              <li>
                <a
                  href="/legal/privacy"
                  className="text-sm text-content-disabled transition-colors hover:text-content-inverse"
                >
                  Privacy Policy
                </a>
              </li>
            </ul>
```

Replace with (adding a third list item after Privacy Policy):
```typescript
              <li>
                <a
                  href="/legal/privacy"
                  className="text-sm text-content-disabled transition-colors hover:text-content-inverse"
                >
                  Privacy Policy
                </a>
              </li>
              <li>
                <a
                  href="/transparency"
                  className="text-sm text-content-disabled transition-colors hover:text-content-inverse"
                >
                  Community Transparency
                </a>
              </li>
            </ul>
```

- [ ] **Step 2: Verify build**

```bash
pnpm typecheck
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/marketing/footer.tsx
git commit -m "feat(marketing): add community transparency link to footer

Links to /transparency page from the Legal section of the
marketing footer, after Privacy Policy."
```

---

### Task 9: Final verification and branch cleanup

- [ ] **Step 1: Run full CI-equivalent verification**

```bash
pnpm typecheck && pnpm lint && pnpm test && pnpm build
```

All must pass. If any fail, fix before proceeding.

- [ ] **Step 2: Manual verification (if dev server available)**

Start dev server and verify:
- `/legal/terms` and `/legal/privacy` — no DRAFT banner visible
- `/transparency` — info page renders with heading, instructions, and demo link
- Footer on marketing pages — "Community Transparency" link appears in Legal section

- [ ] **Step 3: Delete inspiring-chebyshev worktree and branch**

```bash
cd /Users/jphilistin/Documents/Coding/PropertyPro
rm -rf .claude/worktrees/inspiring-chebyshev
git branch -D claude/inspiring-chebyshev
```

- [ ] **Step 4: Delete sad-hertz worktree and branch**

```bash
rm -rf .claude/worktrees/sad-hertz
git branch -D claude/sad-hertz
```

- [ ] **Step 5: Verify clean state**

```bash
git branch | grep claude/
git worktree list
```

Expected: No `claude/*` branches remain. Only the main worktree listed.
