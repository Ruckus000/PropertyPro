# Pre-Launch Audit Remediation — Design Spec

**Date:** 2026-04-01
**Context:** Two feature branches (`claude/inspiring-chebyshev`, `claude/sad-hertz`) audited pre-launch. This spec covers all required fixes, the merge strategy, and branch cleanup.

## Scope

Five work items, executed sequentially on main:

1. Fix sad-hertz notification system issues (in worktree, before merge)
2. Squash-merge sad-hertz to main
3. Remove DRAFT banners from legal pages (launch blocker)
4. Add public transparency access + marketing footer link
5. Delete both branches and worktrees

## inspiring-chebyshev: No Merge Needed

This docs-only branch catalogs 13 launch-blocking issues. Audit found **11 of 13 are already fixed on main**. The 2 remaining issues (DRAFT banners, transparency link) are addressed directly in this spec. The branch has no code value — delete it.

## Work Item 1: sad-hertz Fixes (in worktree)

### 1a. Fix dedup unique index

**File:** `packages/db/migrations/0129_create_notifications_table.sql`

The `notifications_dedup_unique` index lacks a `WHERE deleted_at IS NULL` filter. If a notification is soft-deleted and the same source event fires again, `onConflictDoNothing()` silently drops the re-insert.

**Practical impact:** Low — there's no DELETE API endpoint; soft-delete is admin/system cleanup only. But the fix is one `WHERE` clause with no downside, and correctness matters.

**Fix:** Change the index definition from:
```sql
CREATE UNIQUE INDEX "notifications_dedup_unique"
  ON "notifications" ("community_id","user_id","source_type","source_id");
```
To:
```sql
CREATE UNIQUE INDEX "notifications_dedup_unique"
  ON "notifications" ("community_id","user_id","source_type","source_id")
  WHERE "deleted_at" IS NULL;
```

**Safe to amend in-place** because migration 0129 has never been applied on main (main's highest is 0128). It will be applied fresh after squash-merge.

### 1b. UI polish: error states

**Files:**
- `apps/web/src/components/notifications/notification-dropdown.tsx`
- `apps/web/src/app/(authenticated)/notifications/notifications-page-client.tsx`

Both components silently fail when queries error. Add `AlertBanner` (from `@/components/shared/alert-banner`) when `isError` is true on the notifications query.

### 1c. UI polish: loading states

**Files:** Same as 1b.

Replace inline `animate-pulse` skeleton divs with the design system `Skeleton` component from `@/components/ui/skeleton`.

### 1d. UI polish: empty states

**Files:** Same as 1b.

Replace inline "You're all caught up" text with `EmptyState` component from `@/components/shared/empty-state`, following the pattern configs in `docs/design-system/constants/empty-states.ts`.

### 1e. Accessibility fixes

**File:** `apps/web/src/app/(authenticated)/notifications/notifications-page-client.tsx`
- Add `aria-pressed={isActive}` to category filter buttons

**File:** `apps/web/src/components/notifications/notification-list-item.tsx`
- Add descriptive `aria-label` to the notification button (e.g., `"View: {title}"`)

### 1f. Commit uncommitted files

Two uncommitted files contain improvements that should be committed:

- `apps/web/src/app/mobile/notifications/page.tsx` — Adds communityId validation with redirect to `/select-community` on invalid input. Prevents downstream query errors.
- `apps/web/src/lib/services/notification-service.ts` — Adds `resolveInAppRecipients()`, decoupling in-app notification preferences from email preferences. Users can disable email but keep in-app notifications.

## Work Item 2: Squash-Merge sad-hertz

After all fixes are committed in the worktree:

```bash
git checkout main
git merge --squash claude/sad-hertz
git commit -m "feat: add in-app notification system"
```

**Post-merge verification:**
```bash
pnpm typecheck
pnpm lint           # includes db-access guard
pnpm test
pnpm build
```

The `pnpm lint` command includes the DB access guard (`guard:db-access`) which verifies notification files don't import Drizzle directly.

## Work Item 3: Remove DRAFT Banners

**Launch blocker.** Both legal pages display "DRAFT DOCUMENT" warnings.

**Files:**
- `apps/web/src/app/legal/terms/page.tsx` — Delete lines 23-27 (the `<div>` with DRAFT warning)
- `apps/web/src/app/legal/privacy/page.tsx` — Delete lines 23-27 (same)

Keep the existing placeholder legal text as-is. No copy replacement needed.

## Work Item 4: Transparency Page Access + Marketing Link

### 4a. Verify public access (no code change expected)

The transparency page at `apps/web/src/app/(public)/[subdomain]/transparency/page.tsx` is already publicly accessible:
- Route is in the `(public)` group (no auth middleware)
- Uses `findCommunityBySlugUnscoped()` via `@propertypro/db/unsafe`
- Feature-gated by `transparencyEnabled` flag per community

Verify by navigating to a demo community's transparency page without authentication.

### 4b. Add transparency info page

Create a minimal static page at `/transparency` on the marketing site. Content:
- Heading: "Community Transparency"
- 2-3 sentences explaining that each PropertyPro community maintains a public transparency page with documents, meeting records, and compliance status
- Instruction: "Visit `[your-community].getpropertypro.com/transparency` to view your association's page"
- Link to the Sunset Condos demo as an example: `sunset-condos.getpropertypro.com/transparency`

This is NOT a community lookup tool, search page, or feature-heavy page. It is a static informational page under 150 words. Follow the existing marketing page layout patterns (hero section + content).

**File:** `apps/web/src/app/(marketing)/transparency/page.tsx` (new)

### 4c. Add footer link

**File:** `apps/web/src/components/marketing/footer.tsx`

Add "Community Transparency" as a third link in the Legal section, after Privacy Policy, pointing to `/transparency`.

## Work Item 5: Branch Cleanup

1. Delete the `claude/inspiring-chebyshev` branch and worktree
2. Delete the `claude/sad-hertz` branch and worktree (after successful merge)

No archiving of spec docs — they document issues that are resolved.

## Out of Scope

- Realtime hook UPDATE/DELETE subscriptions (cross-device sync) — nice-to-have, not launch-blocking
- `requirePermission` calls on notification API routes — functionally safe since userId filtering prevents cross-user access; community membership is sufficient authorization
- Notification digest processing cron job testing
- Legal page copy replacement (needs legal counsel)

## Verification

After all work items complete:
```bash
pnpm typecheck && pnpm lint && pnpm test && pnpm build
```

Manual: Navigate to `/legal/terms`, `/legal/privacy` (no DRAFT banner), and `/transparency` (info page renders).
