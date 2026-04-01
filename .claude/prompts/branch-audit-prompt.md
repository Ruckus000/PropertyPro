# Pre-Launch Branch Audit Prompt

Copy everything below the line into a new Claude Code chat.

---

## Context

We are nearing production launch of PropertyPro Florida, a compliance and community management platform for Florida condominium associations. The codebase is at `/Users/jphilistin/Documents/Coding/PropertyPro`.

There are exactly 2 remaining feature branches with worktrees that need thorough audit before we decide how to proceed. Main is at commit `4624550`. We've already cleaned up all stale branches, stashes, and worktrees in a prior session — these two are the only survivors, and both contain meaningful unmerged work.

## What was already resolved this session

In the prior cleanup session, we applied a patch to the Stripe webhook route that **partially addresses** one of the issues in the inspiring-chebyshev spec (WS1-B: stripeSubscriptionId/stripeCustomerId persistence). The patch handles the **self-serve subscribe flow for existing communities** (accessPlanId + communityId in metadata), but it does NOT address the **new signup provisioning flow** (signupRequestId path) where the IDs also need to be written during community creation. Keep this in mind during your audit.

## Branch 1: `claude/inspiring-chebyshev` (3 commits, docs only)

**Worktree:** `.claude/worktrees/inspiring-chebyshev`
**Commits:**
- `c85cd53` docs: launch audit remediation design spec
- `34aae94` docs: revise spec after code review verification
- `28360d5` docs: launch audit remediation implementation plan

This branch contains a comprehensive spec + implementation plan for 13 launch-blocking bugs (P0-P2) found by two independent audits (Cursor + Codex). No code changes — purely documentation. The spec covers 3 workstreams:

- **WS1** (Provisioning & Onboarding): provisioning state machine role mismatch, Stripe ID persistence in provisioning, broken login URL in welcome email, checkout dead-ends, checkout return error recovery, missing 14-day trial
- **WS2** (Payments & Security): Stripe JS blocked by CSP, missing unitId in payment dialog
- **WS3** (Marketing & Content): transparency page 500, pricing misalignment, marketing overselling native app/push, DRAFT banners on legal pages, PM signup routing, missing transparency link, PM branding redirect

## Branch 2: `claude/sad-hertz` (20 commits + 2 uncommitted files)

**Worktree:** `.claude/worktrees/sad-hertz`
**Commits:** 20 (from `28360d5` through `cdb1ff3`)
**Uncommitted changes:**
- `apps/web/src/app/mobile/notifications/page.tsx` (modified)
- `apps/web/src/lib/services/notification-service.ts` (modified)
- `.claude/scheduled_tasks.lock` (deleted — irrelevant)

This branch implements a complete in-app notification system:
- 2 DB migrations (0129-0130): notifications table + in-app muting columns on notification_preferences
- Drizzle schema + query helpers
- Service layer (createNotificationsForEvent, recipient resolution)
- 4 API routes (list, unread-count, read, archive)
- UI components (NotificationBell, NotificationDropdown, NotificationListItem)
- 2 pages (/notifications, /mobile/notifications)
- TanStack Query hooks + Supabase Realtime hook
- Wired into 5 event flows (meetings, maintenance, documents, announcements, violations)

Migration numbers 0129-0130 are safe — main's highest is 0128.

## Your Task

Perform a **comprehensive, line-by-line audit** of both branches. This is pre-launch — we cannot afford to merge broken code or lose critical fixes. Think like a senior engineer doing a final review before shipping.

### For `claude/inspiring-chebyshev`:

1. **Verify each issue still exists on main.** For every one of the 13 issues in the spec, read the actual source code on main and confirm whether the bug is still present. Some may have been fixed by commits that landed after the spec was written. Report status for each: STILL PRESENT, ALREADY FIXED, or PARTIALLY FIXED (and explain what remains).

2. **Validate the proposed fixes.** For issues still present, read the spec's proposed fix and verify it's correct by reading the surrounding code. Check for:
   - Line numbers that may have shifted
   - Function signatures that may have changed
   - Assumptions about data flow that may be wrong
   - Missing edge cases the spec doesn't account for

3. **Check for new issues the spec missed.** The spec was written on 2026-03-30. Has any code changed on main since then that introduces NEW problems in the same areas?

4. **Prioritize.** Which issues are true launch blockers vs. can-ship-and-fix-later? Be opinionated.

### For `claude/sad-hertz`:

1. **Schema review.** Read migrations 0129 and 0130. Check:
   - RLS policies present and correct
   - Indexes appropriate for query patterns
   - FK constraints and cascades correct
   - Soft-delete column present
   - community_id isolation enforced
   - Journal entries present and correctly numbered

2. **Tenant isolation.** Verify every API route and query helper uses `createScopedClient()`, not raw Drizzle. Check the CI guard allowlist if any files import from `@propertypro/db` directly.

3. **API routes.** Read all 4 notification API routes. Check:
   - `withErrorHandler` wrapper present
   - `requirePermission` authorization present
   - Zod validation on request bodies
   - Proper error responses
   - No N+1 queries or unbounded selects

4. **Service layer.** Read `notification-service.ts` (both committed and uncommitted versions). Check:
   - Recipient resolution logic correctness
   - Batch insertion handling
   - Error handling (does a notification failure crash the parent operation?)
   - Preference checking (master toggle + per-category)

5. **UI components.** Read the bell, dropdown, and list-item components. Check:
   - Loading/empty/error states handled per design system rules
   - Accessibility (aria attributes, focus management)
   - Realtime subscription cleanup on unmount
   - No memory leaks in hooks

6. **Event wiring.** Check how notifications are dispatched in the 5 event flows. Verify:
   - Notification dispatch doesn't block the parent operation (fire-and-forget or try/catch)
   - Correct event types and categories used
   - No duplicate notifications on rapid updates

7. **Integration concerns.** Check:
   - Middleware includes `/notifications` in protected paths
   - The notification bell is wired into the app layout correctly
   - Mobile routes follow the existing `/mobile/` pattern
   - No import violations that would fail the DB access guard

8. **Uncommitted changes.** Read the 2 uncommitted modified files. Are the uncommitted changes improvements or regressions? Should they be committed before merge?

### Deliverables

Provide a structured report with:

1. **inspiring-chebyshev: Issue-by-issue status matrix** (13 rows, columns: Issue ID, Description, Status on Main, Spec Fix Valid?, Priority, Notes)

2. **sad-hertz: Audit findings** organized by category (Schema, Tenant Isolation, API, Service, UI, Event Wiring, Integration). For each finding, state severity (Critical/Important/Minor/Suggestion) and whether it blocks merge.

3. **Merge recommendation** for each branch:
   - MERGE AS-IS
   - MERGE WITH FIXES (list what needs fixing)
   - DO NOT MERGE (explain why)
   - DELETE (explain why)

4. **Recommended action plan** — what to do next, in what order, considering we are near launch.
