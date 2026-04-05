# Audit Remediation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix 13 actionable findings from the UI/UX/a11y audit — 1 critical, 4 medium UX, 5 medium a11y, 3 lower polish.

**Architecture:** Each fix is isolated to 1-3 files. No schema changes. No new dependencies. All fixes are CSS, JSX, or minor component logic.

**Tech Stack:** Next.js 15 App Router, React 19, Tailwind CSS, Lucide icons, shadcn/ui patterns.

---

## File Map

| Task | Files | Action |
|------|-------|--------|
| 1 | `apps/web/src/components/compliance/compliance-checklist-item.tsx` | Modify: fix stacking context |
| 2 | `apps/web/src/app/(authenticated)/communities/[id]/residents/page.tsx` | Create: redirect page |
| 2 | `apps/web/src/app/(authenticated)/communities/[id]/announcements/page.tsx` | Create: redirect page |
| 2 | `apps/web/src/app/(authenticated)/communities/[id]/board/page.tsx` | Create: redirect page |
| 3 | `apps/web/src/components/announcements/announcement-list.tsx` | Modify: add admin CTA |
| 3 | `apps/web/src/app/(authenticated)/announcements/page.tsx` | Modify: pass role info |
| 4 | `apps/web/src/components/board/board-chrome.tsx` | Modify: fix heading hierarchy |
| 5 | `apps/web/src/components/compliance/compliance-activity-feed.tsx` | Modify: deduplicate entries |
| 6 | `apps/web/src/components/onboarding/onboarding-checklist.tsx` | Modify: fix aria-label |
| 7 | `apps/web/src/app/layout.tsx` | Modify: remove skip link |
| 8 | `apps/web/src/components/compliance/compliance-item-actions.tsx` | Modify: add aria-labels |
| 8 | `apps/web/src/components/compliance/compliance-checklist-item.tsx` | Modify: add aria-label to "What's required?" |
| 8 | `apps/web/src/components/compliance/deadline-ribbon.tsx` | Modify: add title to truncated text |
| 9 | `apps/web/src/components/settings/accessibility-settings.tsx` | Modify: add aria-label to switch |
| 10 | `apps/web/src/components/calendar/month-grid.tsx` | Modify: add date aria-labels |
| 11 | `apps/web/src/components/documents/document-library.tsx` | Modify: fix button label |
| 12 | `apps/web/src/components/compliance/compliance-checklist-item.tsx` | Modify: add title to truncated text |
| 12 | `apps/web/src/components/compliance/compliance-onboarding.tsx` | Modify: add title to truncated text |

---

### Task 1: Fix Compliance "What's required?" Click Interception (Critical)

**Problem:** The expanded detail section inside `ComplianceChecklistItem` uses `overflow-hidden` with `max-h` animation. When a category group's items container also uses `overflow-hidden`, nested interactive elements like "What's required?" can be blocked by adjacent category header buttons due to stacking context issues.

**Root cause:** The `overflow-hidden` on the expanding `<div>` creates a new stacking context. The category header button above it in the DOM is a full-width interactive region. When the expanded content is animating or at certain scroll positions, click events can be captured by the wrong element.

**Fix:** Replace `overflow-hidden` + `max-h` animation with `grid` + `grid-rows` animation pattern, which doesn't create clipping/stacking issues.

**Files:**
- Modify: `apps/web/src/components/compliance/compliance-checklist-item.tsx:146-150`
- Modify: `apps/web/src/components/compliance/compliance-dashboard.tsx:178-182`

- [ ] **Step 1: Fix the CategoryGroup items container in compliance-dashboard.tsx**

In `apps/web/src/components/compliance/compliance-dashboard.tsx`, replace lines 177-183:

```tsx
      {/* Items */}
      <div
        className={`
          overflow-hidden transition-all duration-quick ease-out
          ${open ? "max-h-[5000px] opacity-100" : "max-h-0 opacity-0"}
        `}
      >
```

With:

```tsx
      {/* Items */}
      <div
        className={`
          grid transition-all duration-quick ease-out
          ${open ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"}
        `}
      >
        <div className="overflow-hidden">
```

And add the corresponding closing `</div>` after the inner content div (before the existing `</div>` that closes the items wrapper on what is currently line 193). The inner `<div className="border-t border-edge-subtle">` and its children stay unchanged inside the new `overflow-hidden` div.

The full replacement for lines 177-194:

```tsx
      {/* Items */}
      <div
        className={`
          grid transition-all duration-quick ease-out
          ${open ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"}
        `}
      >
        <div className="overflow-hidden">
          <div className="border-t border-edge-subtle">
            {items.map((item) => (
              <ComplianceChecklistItem
                key={item.id}
                item={item}
                actions={renderActions?.(item)}
              />
            ))}
          </div>
        </div>
      </div>
```

- [ ] **Step 2: Fix the ChecklistItem expanded detail in compliance-checklist-item.tsx**

In `apps/web/src/components/compliance/compliance-checklist-item.tsx`, replace lines 146-151:

```tsx
      <div
        className={`
          overflow-hidden transition-all duration-quick ease-out
          ${expanded ? "max-h-[500px] opacity-100" : "max-h-0 opacity-0"}
        `}
      >
        <div className="px-4 pb-4 pt-1 ml-5">
```

With:

```tsx
      <div
        className={`
          grid transition-all duration-quick ease-out
          ${expanded ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"}
        `}
      >
        <div className="overflow-hidden">
          <div className="px-4 pb-4 pt-1 ml-5">
```

And add a closing `</div>` before the existing closing `</div>` at line 208 (the one that closes the expanded detail wrapper). The structure becomes:

```tsx
          </div>{/* close px-4 pb-4 pt-1 ml-5 */}
        </div>{/* close overflow-hidden */}
      </div>{/* close grid */}
```

- [ ] **Step 3: Verify the fix**

Start the dev server and log in as `cam`. Navigate to `/communities/{id}/compliance`. Expand a category group, expand a checklist item, and click "What's required?". Verify:
1. The button responds on first click
2. The expand/collapse animation still works smoothly
3. No layout shift or visual artifacts

Run: `pnpm typecheck && pnpm lint`

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/compliance/compliance-checklist-item.tsx apps/web/src/components/compliance/compliance-dashboard.tsx
git commit -m "fix: replace overflow-hidden with grid-rows animation on compliance expand/collapse

Prevents stacking context issues that blocked clicks on 'What's required?'
and other interactive elements inside expanded checklist items."
```

---

### Task 2: Add Redirect Pages for 404-Prone Community URLs

**Problem:** `/communities/:id/residents`, `/communities/:id/announcements`, and `/communities/:id/board` return 404. Canonical routes use different URL patterns.

**Files:**
- Create: `apps/web/src/app/(authenticated)/communities/[id]/residents/page.tsx`
- Create: `apps/web/src/app/(authenticated)/communities/[id]/announcements/page.tsx`
- Create: `apps/web/src/app/(authenticated)/communities/[id]/board/page.tsx`

- [ ] **Step 1: Create the residents redirect**

Create `apps/web/src/app/(authenticated)/communities/[id]/residents/page.tsx`:

```tsx
import { redirect } from 'next/navigation';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function ResidentsRedirect({ params }: PageProps) {
  const { id } = await params;
  redirect(`/dashboard/residents?communityId=${id}`);
}
```

- [ ] **Step 2: Create the announcements redirect**

Create `apps/web/src/app/(authenticated)/communities/[id]/announcements/page.tsx`:

```tsx
import { redirect } from 'next/navigation';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function AnnouncementsRedirect({ params }: PageProps) {
  const { id } = await params;
  redirect(`/announcements?communityId=${id}`);
}
```

- [ ] **Step 3: Create the board redirect**

Create `apps/web/src/app/(authenticated)/communities/[id]/board/page.tsx`:

```tsx
import { redirect } from 'next/navigation';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function BoardRedirect({ params }: PageProps) {
  const { id } = await params;
  redirect(`/communities/${id}/board/polls`);
}
```

- [ ] **Step 4: Verify redirects work**

Start the dev server, log in, and navigate to each URL. Verify 302 redirect to the canonical route:
- `/communities/282/residents` → `/dashboard/residents?communityId=282`
- `/communities/282/announcements` → `/announcements?communityId=282`
- `/communities/282/board` → `/communities/282/board/polls`

Run: `pnpm typecheck`

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/\(authenticated\)/communities/\[id\]/residents/page.tsx apps/web/src/app/\(authenticated\)/communities/\[id\]/announcements/page.tsx apps/web/src/app/\(authenticated\)/communities/\[id\]/board/page.tsx
git commit -m "fix: add redirect pages for /communities/:id/residents, announcements, board

Prevents 404s when users bookmark or share URLs using the
/communities/:id/... pattern instead of canonical routes."
```

---

### Task 3: Add "Create Announcement" CTA to Empty State

**Problem:** The announcements empty state has no action button, making it hard for admins to create their first announcement.

**Files:**
- Modify: `apps/web/src/components/announcements/announcement-list.tsx:112-118`
- Modify: `apps/web/src/app/(authenticated)/announcements/page.tsx:56`

- [ ] **Step 1: Add `isAdmin` prop and action to AnnouncementList**

In `apps/web/src/components/announcements/announcement-list.tsx`, update the interface and empty state:

Replace lines 5-6:

```tsx
interface AnnouncementListProps {
  items: Announcement[];
}
```

With:

```tsx
interface AnnouncementListProps {
  items: Announcement[];
  isAdmin?: boolean;
}
```

Replace lines 100-119:

```tsx
export function AnnouncementList({ items }: AnnouncementListProps) {
  const { pinned, unpinned } = items.reduce<{
    pinned: Announcement[];
    unpinned: Announcement[];
  }>(
    (acc, item) => {
      (item.isPinned ? acc.pinned : acc.unpinned).push(item);
      return acc;
    },
    { pinned: [], unpinned: [] },
  );

  if (items.length === 0) {
    return (
      <EmptyState
        title="No announcements yet"
        description="Announcements from your community will appear here."
      />
    );
  }
```

With:

```tsx
export function AnnouncementList({ items, isAdmin }: AnnouncementListProps) {
  const { pinned, unpinned } = items.reduce<{
    pinned: Announcement[];
    unpinned: Announcement[];
  }>(
    (acc, item) => {
      (item.isPinned ? acc.pinned : acc.unpinned).push(item);
      return acc;
    },
    { pinned: [], unpinned: [] },
  );

  if (items.length === 0) {
    return (
      <EmptyState
        icon="bell"
        title="No announcements yet"
        description={
          isAdmin
            ? "Post your first announcement to keep residents informed."
            : "Announcements from your community will appear here."
        }
        action={
          isAdmin ? (
            <a
              href="/dashboard"
              className="inline-flex items-center gap-2 rounded-md bg-interactive px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-interactive-hover"
            >
              Go to Dashboard
            </a>
          ) : undefined
        }
      />
    );
  }
```

- [ ] **Step 2: Pass isAdmin from the announcements page**

In `apps/web/src/app/(authenticated)/announcements/page.tsx`, we need to determine if the user is an admin. Add the role check and pass it through.

After line 45 (`await requireCommunityMembership(context.communityId, userId);`), add:

```tsx
  // Check if user has admin role for this community
  const memberScoped = createScopedClient(context.communityId);
  const ADMIN_ROLES = ['board_member', 'board_president', 'cam', 'site_manager', 'property_manager_admin'];
  const [membership] = await memberScoped
    .selectFrom(
      (await import('@propertypro/db')).communityMembers,
      { columns: { role: true } },
      and(
        sql`${(await import('@propertypro/db')).communityMembers.userId} = ${userId}`,
      ),
    );
  const isAdmin = membership ? ADMIN_ROLES.includes(membership.role) : false;
```

Wait — this is getting complex. Let me check how other pages determine admin status. The page already calls `requireCommunityMembership` which may return membership data.

- [ ] **Step 2 (revised): Check how requireCommunityMembership works and pass isAdmin**

Read `apps/web/src/lib/request/page-community-context.ts` to understand what `requirePageCommunityMembership` returns. The simplest approach: since the announcements page already uses `requireCommunityMembership`, check if it returns the role. If not, query the membership table for the role.

The most reliable minimal approach — check the user's role from the membership record:

In `apps/web/src/app/(authenticated)/announcements/page.tsx`, add an import for `communityMembers`:

```tsx
import { createScopedClient, announcements, communityMembers } from '@propertypro/db';
```

And add `eq` to the filters import:

```tsx
import { and, desc, eq, isNull, sql } from '@propertypro/db/filters';
```

After line 45, add:

```tsx
  const ADMIN_ROLES = ['board_member', 'board_president', 'cam', 'site_manager', 'property_manager_admin'] as const;
  const [membership] = await scoped
    .selectFrom(communityMembers, { columns: { role: true } }, eq(communityMembers.userId, userId));
  const isAdmin = membership ? ADMIN_ROLES.includes(membership.role as typeof ADMIN_ROLES[number]) : false;
```

Then update line 56:

```tsx
  return <AnnouncementList items={items} isAdmin={isAdmin} />;
```

- [ ] **Step 3: Verify**

Log in as `cam` (admin) and navigate to `/announcements`. With no announcements, verify the empty state shows "Post your first announcement" copy and a "Go to Dashboard" link. Log in as `owner` (non-admin) and verify only the default copy appears with no CTA.

Run: `pnpm typecheck && pnpm lint`

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/announcements/announcement-list.tsx apps/web/src/app/\(authenticated\)/announcements/page.tsx
git commit -m "fix: add create-announcement CTA to announcements empty state for admins

Admins now see an actionable empty state directing them to the dashboard
to post their first announcement."
```

---

### Task 4: Fix Board Page Heading Hierarchy

**Problem:** On `/communities/:id/board/polls`, the `<h1>` is the community name. The page identity should be "Community Board" or "Polls", not the community name.

**Files:**
- Modify: `apps/web/src/components/board/board-chrome.tsx:50-59`

- [ ] **Step 1: Update the heading hierarchy**

In `apps/web/src/components/board/board-chrome.tsx`, replace lines 50-59:

```tsx
      <header className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-content-tertiary">
          Community board
        </p>
        <div className="flex flex-col gap-2">
          <h1 className="text-3xl font-semibold text-content">{communityName}</h1>
          <p className="max-w-2xl text-sm text-content-secondary">
            {description}
          </p>
        </div>
      </header>
```

With:

```tsx
      <header className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-content-tertiary">
          {communityName}
        </p>
        <div className="flex flex-col gap-2">
          <h1 className="text-3xl font-semibold text-content">Community Board</h1>
          <p className="max-w-2xl text-sm text-content-secondary">
            {description}
          </p>
        </div>
      </header>
```

- [ ] **Step 2: Verify**

Navigate to `/communities/{id}/board/polls`. Verify:
1. The eyebrow text shows the community name
2. The `<h1>` reads "Community Board"
3. The tabs (Polls, Forum, Elections) remain below as navigation

Run: `pnpm typecheck`

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/board/board-chrome.tsx
git commit -m "fix: swap h1 to 'Community Board', move community name to eyebrow

Improves page identity for scanning, bookmarks, and assistive tech."
```

---

### Task 5: Deduplicate Compliance Recent Activity Entries

**Problem:** The Recent Activity section can show duplicate entries (same action, same resource, same timestamp).

**Files:**
- Modify: `apps/web/src/components/compliance/compliance-activity-feed.tsx:103`

- [ ] **Step 1: Add deduplication by entry ID**

In `apps/web/src/components/compliance/compliance-activity-feed.tsx`, replace line 103:

```tsx
  const entries = data?.data ?? [];
```

With:

```tsx
  const entries = React.useMemo(() => {
    const raw = data?.data ?? [];
    const seen = new Set<number>();
    return raw.filter((entry) => {
      if (seen.has(entry.id)) return false;
      seen.add(entry.id);
      return true;
    });
  }, [data]);
```

- [ ] **Step 2: Verify**

Navigate to the compliance page and check Recent Activity. Verify no duplicate lines appear. If you can't reproduce duplicates, this is still a defensive fix.

Run: `pnpm typecheck`

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/compliance/compliance-activity-feed.tsx
git commit -m "fix: deduplicate compliance activity feed entries by ID

Prevents duplicate audit trail entries from rendering in Recent Activity."
```

---

### Task 6: Fix Onboarding Checklist Aria Label

**Problem:** The checklist `<section>` has a static `aria-label="Setup checklist"` that doesn't include the community name.

**Files:**
- Modify: `apps/web/src/components/onboarding/onboarding-checklist.tsx:72`

- [ ] **Step 1: Update the aria-label to include community name**

In `apps/web/src/components/onboarding/onboarding-checklist.tsx`, the component receives `communityName` as a prop (used in the celebration screen at line 58). Replace line 72:

```tsx
      aria-label="Setup checklist"
```

With:

```tsx
      aria-label={`Setup checklist for ${communityName}`}
```

- [ ] **Step 2: Verify**

Run: `pnpm typecheck`

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/onboarding/onboarding-checklist.tsx
git commit -m "fix: include community name in onboarding checklist aria-label"
```

---

### Task 7: Remove Duplicate Skip Link

**Problem:** Two skip links render — one in `app/layout.tsx` ("Skip to main content") and one in `app-shell.tsx` ("Skip to content"). Only one should exist.

**Files:**
- Modify: `apps/web/src/components/layout/app-shell.tsx:143-146`

- [ ] **Step 1: Remove the skip link from app-shell.tsx**

The root layout (`app/layout.tsx:33-38`) already has a properly styled skip link with sr-only + focus:not-sr-only. The app-shell one is redundant. Remove lines 143-146 from `apps/web/src/components/layout/app-shell.tsx`:

```tsx
      {/* Skip link for keyboard users */}
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
```

Replace with nothing (delete these lines entirely).

- [ ] **Step 2: Verify**

Tab into the app from the address bar. Verify only one "Skip to main content" link appears. Verify it targets `#main-content` and jumps to the correct content area.

Run: `pnpm typecheck`

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/layout/app-shell.tsx
git commit -m "fix: remove duplicate skip link from app-shell

Root layout already provides 'Skip to main content'. Having two confused
keyboard navigation."
```

---

### Task 8: Add Accessible Names to Compliance Action Buttons

**Problem:** Buttons like "Upload", "N/A", "Link Existing", and "What's required?" share generic names across all compliance rows, making them indistinguishable for screen readers.

**Files:**
- Modify: `apps/web/src/components/compliance/compliance-item-actions.tsx:17-70`
- Modify: `apps/web/src/components/compliance/compliance-checklist-item.tsx:183-189`
- Modify: `apps/web/src/components/compliance/compliance-dashboard.tsx` (pass item title through)

- [ ] **Step 1: Add `itemTitle` prop to ComplianceItemActions**

In `apps/web/src/components/compliance/compliance-item-actions.tsx`, add `itemTitle` to the props interface. Replace lines 8-15:

```tsx
interface ComplianceItemActionsProps {
  item: ChecklistItemData;
  onUpload: () => void;
  onLink: () => void;
  onMarkNA: () => void;
  onMarkApplicable: () => void;
  onUnlink: () => void;
}
```

With:

```tsx
interface ComplianceItemActionsProps {
  item: ChecklistItemData;
  itemTitle: string;
  onUpload: () => void;
  onLink: () => void;
  onMarkNA: () => void;
  onMarkApplicable: () => void;
  onUnlink: () => void;
}
```

Update the destructuring on line 17:

```tsx
export function ComplianceItemActions({
  item,
  itemTitle,
  onUpload,
  onLink,
  onMarkNA,
  onMarkApplicable,
  onUnlink,
}: ComplianceItemActionsProps) {
```

- [ ] **Step 2: Add aria-labels to each button**

In the same file, update each button with an `aria-label` that includes `itemTitle`:

Replace lines 27-30 (Mark Applicable button):
```tsx
      <Button variant="secondary" size="sm" onClick={onMarkApplicable}>
        <Undo2 size={14} className="mr-1.5" />
        Mark Applicable
      </Button>
```
With:
```tsx
      <Button variant="secondary" size="sm" onClick={onMarkApplicable} aria-label={`Mark ${itemTitle} as applicable`}>
        <Undo2 size={14} className="mr-1.5" />
        Mark Applicable
      </Button>
```

Replace lines 37-39 (Unlink button):
```tsx
        <Button variant="ghost" size="sm" onClick={onUnlink} className="text-status-danger">
          Unlink
        </Button>
```
With:
```tsx
        <Button variant="ghost" size="sm" onClick={onUnlink} className="text-status-danger" aria-label={`Unlink document from ${itemTitle}`}>
          Unlink
        </Button>
```

Replace lines 57-60 (N/A button):
```tsx
      <Button variant="ghost" size="sm" onClick={onMarkNA}>
        <Ban size={14} className="mr-1.5" />
        N/A
      </Button>
```
With:
```tsx
      <Button variant="ghost" size="sm" onClick={onMarkNA} aria-label={`Mark ${itemTitle} as not applicable`}>
        <Ban size={14} className="mr-1.5" />
        N/A
      </Button>
```

Replace lines 61-64 (Link Existing button):
```tsx
      <Button variant="secondary" size="sm" onClick={onLink}>
        <Link2 size={14} className="mr-1.5" />
        Link Existing
      </Button>
```
With:
```tsx
      <Button variant="secondary" size="sm" onClick={onLink} aria-label={`Link existing document to ${itemTitle}`}>
        <Link2 size={14} className="mr-1.5" />
        Link Existing
      </Button>
```

Replace lines 65-68 (Upload button):
```tsx
      <Button variant="primary" size="sm" onClick={onUpload}>
        <Upload size={14} className="mr-1.5" />
        Upload
      </Button>
```
With:
```tsx
      <Button variant="primary" size="sm" onClick={onUpload} aria-label={`Upload document for ${itemTitle}`}>
        <Upload size={14} className="mr-1.5" />
        Upload
      </Button>
```

- [ ] **Step 3: Pass itemTitle from the dashboard renderActions callback**

In `apps/web/src/components/compliance/compliance-dashboard.tsx`, find where `ComplianceItemActions` is rendered (inside the `renderActions` callback). The `renderActions` prop is a function that receives a `ChecklistItemData` item. Wherever `<ComplianceItemActions item={item} .../>` is rendered, add `itemTitle={item.title}`.

Search for `ComplianceItemActions` usage in the file and add the `itemTitle={item.title}` prop.

- [ ] **Step 4: Add aria-label to "What's required?" button**

In `apps/web/src/components/compliance/compliance-checklist-item.tsx`, replace lines 183-189:

```tsx
              <button
                type="button"
                onClick={() => setShowHelp(!showHelp)}
                className="flex items-center gap-1.5 text-xs text-[var(--status-info)] hover:underline transition-colors"
              >
                <Info size={12} />
                What&apos;s required?
              </button>
```

With:

```tsx
              <button
                type="button"
                onClick={() => setShowHelp(!showHelp)}
                className="flex items-center gap-1.5 text-xs text-[var(--status-info)] hover:underline transition-colors"
                aria-label={`What's required for ${item.title}`}
                aria-expanded={showHelp}
              >
                <Info size={12} aria-hidden="true" />
                What&apos;s required?
              </button>
```

- [ ] **Step 5: Verify**

Run: `pnpm typecheck && pnpm lint`

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/components/compliance/compliance-item-actions.tsx apps/web/src/components/compliance/compliance-checklist-item.tsx apps/web/src/components/compliance/compliance-dashboard.tsx
git commit -m "fix: add unique aria-labels to compliance action buttons

Each Upload, N/A, Link Existing, Unlink, and What's required? button now
includes the checklist item title for screen reader disambiguation."
```

---

### Task 9: Add Accessible Label to Settings Toggle

**Problem:** The Large Text switch in accessibility settings has `role="switch"` and `aria-checked` but no accessible name.

**Files:**
- Modify: `apps/web/src/components/settings/accessibility-settings.tsx:21-28`

- [ ] **Step 1: Add aria-label to the switch**

In `apps/web/src/components/settings/accessibility-settings.tsx`, on the `<button>` element at line 21, add an `aria-label`:

Replace lines 21-24:

```tsx
        <button
          type="button"
          role="switch"
          aria-checked={largeText}
```

With:

```tsx
        <button
          type="button"
          role="switch"
          aria-checked={largeText}
          aria-label="Toggle large text"
```

- [ ] **Step 2: Verify**

Run: `pnpm typecheck`

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/settings/accessibility-settings.tsx
git commit -m "fix: add aria-label to large text toggle switch"
```

---

### Task 10: Add Month Context to Calendar Day Buttons

**Problem:** Calendar day cells are labeled just "1", "29", etc. without month/year context, making them ambiguous for screen readers.

**Files:**
- Modify: `apps/web/src/components/calendar/month-grid.tsx:106-134`

- [ ] **Step 1: Add aria-label with full date to day buttons**

In `apps/web/src/components/calendar/month-grid.tsx`, the `format` function from `date-fns` is already imported. On the `<button>` element at line 106, add an `aria-label`:

After line 108 (`type="button"`), add:

```tsx
                aria-label={format(day, 'MMMM d, yyyy')}
```

So lines 106-109 become:

```tsx
              <button
                key={dateKey}
                type="button"
                aria-label={format(day, 'MMMM d, yyyy')}
                onClick={() => onSelectDate(day)}
```

- [ ] **Step 2: Verify**

Run: `pnpm typecheck`

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/calendar/month-grid.tsx
git commit -m "fix: add full date aria-labels to calendar day buttons

Day cells now announce 'April 3, 2026' instead of just '3'."
```

---

### Task 11: Disambiguate Document Upload Button Label

**Problem:** The Documents page shows "Upload Document" as both a toggle button (line 129) and an `<h2>` heading (line 163) in the document library. The button toggles the upload panel but its label doesn't reflect that.

**Files:**
- Modify: `apps/web/src/components/documents/document-library.tsx:129`

- [ ] **Step 1: Add aria-label and aria-expanded to the toggle button**

In `apps/web/src/components/documents/document-library.tsx`, the button at line ~115-130 toggles the upload panel. Add `aria-expanded` and update the `aria-label` to clarify its role:

Find the button that renders `{showUpload ? 'Cancel' : 'Upload Document'}` and add:

```tsx
              aria-expanded={showUpload}
              aria-label={showUpload ? 'Close upload panel' : 'Open upload panel'}
```

So the button becomes:

```tsx
            <button
              type="button"
              onClick={() => {
                if (showUpload) {
                  setShowUpload(false);
                  return;
                }
                openUploadPanel();
              }}
              aria-expanded={showUpload}
              aria-label={showUpload ? 'Close upload panel' : 'Open upload panel'}
              className={`rounded-md px-3 py-2 text-sm font-medium transition-colors sm:px-4 ${
                showUpload
                  ? 'bg-surface-muted text-content'
                  : 'bg-interactive text-white hover:bg-interactive-hover'
              }`}
            >
              {showUpload ? 'Cancel' : 'Upload Document'}
            </button>
```

- [ ] **Step 2: Verify**

Run: `pnpm typecheck`

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/documents/document-library.tsx
git commit -m "fix: add aria-expanded and unique aria-label to upload toggle button"
```

---

### Task 12: Add Tooltips to Truncated Compliance Text

**Problem:** Compliance checklist item titles, deadline ribbon items, and onboarding items use `truncate` without `title` attributes, so users can't see the full text.

**Files:**
- Modify: `apps/web/src/components/compliance/compliance-checklist-item.tsx:119`
- Modify: `apps/web/src/components/compliance/deadline-ribbon.tsx:60`
- Modify: `apps/web/src/components/compliance/compliance-onboarding.tsx:152,156` (if exists)

- [ ] **Step 1: Add title to checklist item title**

In `apps/web/src/components/compliance/compliance-checklist-item.tsx`, replace line 119:

```tsx
        <span className="flex-1 min-w-0 text-sm font-medium text-content truncate">
          {item.title}
        </span>
```

With:

```tsx
        <span className="flex-1 min-w-0 text-sm font-medium text-content truncate" title={item.title}>
          {item.title}
        </span>
```

- [ ] **Step 2: Add title to deadline ribbon items**

In `apps/web/src/components/compliance/deadline-ribbon.tsx`, replace line 60:

```tsx
              <span className="font-medium text-content truncate max-w-[120px]">
                {item.title}
              </span>
```

With:

```tsx
              <span className="font-medium text-content truncate max-w-[120px]" title={item.title}>
                {item.title}
              </span>
```

- [ ] **Step 3: Add title to onboarding items (if truncated)**

Check `apps/web/src/components/compliance/compliance-onboarding.tsx` for truncated text and add `title` attributes to any `truncate` elements displaying item titles or descriptions.

- [ ] **Step 4: Verify**

Run: `pnpm typecheck`

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/compliance/compliance-checklist-item.tsx apps/web/src/components/compliance/deadline-ribbon.tsx apps/web/src/components/compliance/compliance-onboarding.tsx
git commit -m "fix: add title attributes to truncated compliance text

Checklist titles, deadline ribbon items, and onboarding items now show
full text on hover when truncated."
```

---

## Audit Items Not Addressed (Intentional)

| # | Finding | Reason |
|---|---------|--------|
| 11 | Nav links vs buttons | NavRail renders links when `href` exists, buttons when it doesn't. This is semantically correct — items with navigation targets should be links. No fix needed. |
| 12 | Notifications disabled on some pages | Intentional: `communityId` is null on cross-community pages (PM dashboard, etc.). The bell correctly disables when there's no community context. |
| 14-15 | Console/network clean | No action needed. |
