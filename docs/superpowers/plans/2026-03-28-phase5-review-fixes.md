# Phase 5 Code Review Remediation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. **Use parallel agents** (superpowers:dispatching-parallel-agents) where tasks are independent — Tasks 1-4 can run in parallel, Tasks 5-8 can run in parallel, Task 9 is a final gate.

**Goal:** Fix all Critical and Important findings from the Phase 5 final code review so the `claude/vibrant-bhaskara` branch is merge-ready.

**Architecture:** Targeted fixes to existing files on the feature branch. No new services or architectural changes — just tightening security, fixing accessibility, resolving migration issues, and adding missing test coverage.

**Tech Stack:** TypeScript, Next.js API routes, Drizzle ORM, PostgreSQL RLS, Vitest, React/Tailwind/shadcn

**Branch:** `claude/vibrant-bhaskara` (HEAD: `244c4a6`)

**Review findings source:** This plan addresses the 4 Critical + 10 Important findings from the Phase 5 final review conducted on 2026-03-28.

---

## File Map

| File | Action | Task | Purpose |
|------|--------|------|---------|
| `scripts/verify-scoped-db-access.ts` | Modify | 1 | Add resolve-users.ts to CI guard allowlist |
| `apps/web/src/app/api/v1/users/names/route.ts` | Modify | 1 | Add community membership guard |
| `apps/web/src/lib/utils/resolve-users.ts` | Modify | 1 | Accept communityId, filter by membership |
| `apps/web/src/hooks/use-user-names.ts` | Modify | 1 | Pass communityId to API call |
| `apps/web/__tests__/users/names-route.test.ts` | Modify | 1 | Update test for new guard |
| `apps/web/__tests__/users/resolve-users.test.ts` | Modify | 1 | Update test for membership filter |
| `packages/db/migrations/0126_election_ballot_submissions.sql` | Modify | 2 | Add UPDATE/DELETE RLS policies, fix FK contradiction |
| `packages/db/src/schema/elections.ts` | Modify | 2 | Fix `submittedByUserId` onDelete, add `proxyId` references |
| `apps/web/src/lib/services/elections-service.ts` | Modify | 3, 4 | Add FOR UPDATE on proxy select, use getDbNow for certifiedAt |
| `apps/web/src/components/operations/operations-hub.tsx` | Modify | 5 | Add ARIA tab semantics |
| `apps/web/src/components/board/board-chrome.tsx` | Modify | 6 | Fix active tab matching for sub-pages |
| `apps/web/src/components/layout/nav-config.ts` | Modify | 7 | Remove dead imports |
| `apps/web/src/app/(authenticated)/communities/[id]/operations/page.tsx` | Modify | 7 | Relax to require-any-one-of permission |
| `apps/web/src/components/board/board-forum-panel.tsx` | Modify | 7 | Remove unused isAdmin prop aliasing |
| `packages/shared/src/rbac-matrix.ts` | Modify | 7 | Add two-tier model comment |
| `apps/web/__tests__/elections/routes.test.ts` | Modify | 8 | Add gate-disabled test cases |

---

### Task 1: Fix Cross-Tenant User Name Resolution (C1 + C2)

The `/api/v1/users/names` endpoint has two issues: (a) `resolve-users.ts` imports `createAdminClient` but isn't in the CI guard allowlist — CI will reject the PR; (b) the route has no community membership check, allowing any authenticated user to resolve names of users in other communities.

**Files:**
- Modify: `scripts/verify-scoped-db-access.ts` (allowlist section, ~line 63)
- Modify: `apps/web/src/app/api/v1/users/names/route.ts`
- Modify: `apps/web/src/lib/utils/resolve-users.ts`
- Modify: `apps/web/src/hooks/use-user-names.ts`
- Modify: `apps/web/__tests__/users/names-route.test.ts`
- Modify: `apps/web/__tests__/users/resolve-users.test.ts`

**Context to read first:**
- `apps/web/src/lib/api/community-membership.ts` — see how `requireCommunityMembership` works
- `apps/web/src/hooks/use-board.ts` — see how other hooks pass communityId
- `apps/web/__tests__/users/names-route.test.ts` — understand existing test structure
- `apps/web/__tests__/users/resolve-users.test.ts` — understand existing test structure

- [ ] **Step 1: Add resolve-users.ts to the CI guard allowlist**

In `scripts/verify-scoped-db-access.ts`, find the `WEB_UNSAFE_IMPORT_ALLOWLIST` Set and add:

```typescript
  // Phase 5: User display name resolution — queries users table (no community_id column);
  // callers pass communityId and the utility filters results to community members only.
  resolve(repoRoot, 'apps/web/src/lib/utils/resolve-users.ts'),
```

Add it after the existing `elections-service.ts` entry.

- [ ] **Step 2: Update resolve-users.ts to accept communityId and filter by membership**

Replace the entire `resolveUserDisplayNames` function in `apps/web/src/lib/utils/resolve-users.ts`. The function must now: (a) accept `communityId` as the first parameter, (b) query only users who have a `community_members` row for that community, (c) still use `createAdminClient` because the `users` table has no `community_id` column.

```typescript
import { createAdminClient } from '@propertypro/db/supabase/admin';

interface UserDisplayNameRow {
  id: string;
  full_name: string | null;
}

function getFallbackUserDisplayName(userId: string): string {
  return `User ${userId.slice(0, 8)}`;
}

/**
 * Resolve display names for user IDs that are members of the given community.
 *
 * Authorization contract: The caller MUST have already verified that the
 * requesting user is a member of `communityId`. This function uses
 * `createAdminClient` because the `users` table has no `community_id` column,
 * but scopes results to users who have a `community_members` row for the
 * specified community.
 */
export async function resolveUserDisplayNames(
  communityId: number,
  userIds: string[],
): Promise<Map<string, string>> {
  const uniqueUserIds = Array.from(
    new Set(userIds.filter((userId) => typeof userId === 'string' && userId.length > 0)),
  );

  const displayNames = new Map<string, string>();

  if (uniqueUserIds.length === 0) {
    return displayNames;
  }

  const admin = createAdminClient();

  // First, find which of the requested user IDs are members of this community
  const { data: memberRows, error: memberError } = await admin
    .from('community_members')
    .select('user_id')
    .eq('community_id', communityId)
    .in('user_id', uniqueUserIds);

  if (memberError) {
    throw new Error(`Failed to resolve community members: ${memberError.message}`);
  }

  const memberUserIds = (memberRows ?? []).map((row: { user_id: string }) => row.user_id);

  if (memberUserIds.length === 0) {
    // Return fallbacks for all requested IDs — none are community members
    for (const userId of uniqueUserIds) {
      displayNames.set(userId, getFallbackUserDisplayName(userId));
    }
    return displayNames;
  }

  // Resolve names only for community members
  const { data, error } = await admin
    .from('users')
    .select('id, full_name')
    .in('id', memberUserIds);

  if (error) {
    throw new Error(`Failed to resolve user display names: ${error.message}`);
  }

  const rows = (data ?? []) as UserDisplayNameRow[];
  for (const row of rows) {
    displayNames.set(
      row.id,
      row.full_name?.trim() || getFallbackUserDisplayName(row.id),
    );
  }

  // Fill fallback for any IDs that were requested but are not community members
  for (const userId of uniqueUserIds) {
    if (!displayNames.has(userId)) {
      displayNames.set(userId, getFallbackUserDisplayName(userId));
    }
  }

  return displayNames;
}
```

- [ ] **Step 3: Update the /api/v1/users/names route to require community membership**

Replace the content of `apps/web/src/app/api/v1/users/names/route.ts`:

```typescript
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { withErrorHandler } from '@/lib/api/error-handler';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { ValidationError } from '@/lib/api/errors';
import { formatZodErrors } from '@/lib/api/zod/error-formatter';
import { resolveUserDisplayNames } from '@/lib/utils/resolve-users';

const userNamesQuerySchema = z.object({
  communityId: z.coerce.number().int().positive(),
  ids: z
    .string()
    .trim()
    .min(1)
    .transform((value) =>
      value
        .split(',')
        .map((entry) => entry.trim())
        .filter(Boolean),
    )
    .pipe(z.array(z.string().uuid()).min(1).max(50)),
});

export const GET = withErrorHandler(async (req: NextRequest) => {
  const userId = await requireAuthenticatedUserId();

  const searchParams = Object.fromEntries(new URL(req.url).searchParams.entries());
  const parsed = userNamesQuerySchema.safeParse(searchParams);
  if (!parsed.success) {
    throw new ValidationError('Invalid user names query', {
      fields: formatZodErrors(parsed.error),
    });
  }

  const { communityId, ids } = parsed.data;
  await requireCommunityMembership(communityId, userId);

  const displayNames = await resolveUserDisplayNames(communityId, ids);

  return NextResponse.json({
    data: Object.fromEntries(displayNames),
  });
});
```

- [ ] **Step 4: Update the useUserNames hook to pass communityId**

Read `apps/web/src/hooks/use-user-names.ts` and update the hook to accept `communityId` and include it in the API call URL. Find every call site of `useUserNames` in the codebase (grep for `useUserNames`) and pass the `communityId` parameter. The hook should look like:

```typescript
// In use-user-names.ts, the fetch URL changes from:
//   `/api/v1/users/names?ids=${ids.join(',')}`
// to:
//   `/api/v1/users/names?communityId=${communityId}&ids=${ids.join(',')}`
```

The hook signature changes from `useUserNames(userIds)` to `useUserNames(communityId, userIds)`.

- [ ] **Step 5: Update tests for resolve-users.ts**

Read the existing test at `apps/web/__tests__/users/resolve-users.test.ts`. Update it to:
- Pass `communityId` as the first argument to `resolveUserDisplayNames`
- Mock the `community_members` table query to return membership rows
- Add a test case where a user ID is NOT a community member — verify it gets the fallback name

- [ ] **Step 6: Update tests for names route**

Read the existing test at `apps/web/__tests__/users/names-route.test.ts`. Update it to:
- Add `communityId` to the query string
- Mock `requireCommunityMembership`
- Add a test case that verifies 403 when community membership check fails

- [ ] **Step 7: Run tests and verify**

```bash
pnpm exec vitest run apps/web/__tests__/users/ --reporter=verbose
```

Expected: All tests pass.

- [ ] **Step 8: Commit**

```bash
git add scripts/verify-scoped-db-access.ts apps/web/src/app/api/v1/users/names/route.ts apps/web/src/lib/utils/resolve-users.ts apps/web/src/hooks/use-user-names.ts apps/web/__tests__/users/
git commit -m "fix(users): scope name resolution to community members — prevent cross-tenant leak

The /api/v1/users/names endpoint now requires communityId and filters
results through community_members table. Adds resolve-users.ts to
the CI guard allowlist with documented authorization contract."
```

---

### Task 2: Fix Migration RLS Policies + FK Contradiction (C3 + C4)

The `election_ballot_submissions` table is missing UPDATE/DELETE RLS policies (FORCE RLS will silently block privileged operations), and `submitted_by_user_id` has a contradictory NOT NULL + ON DELETE SET NULL definition that will fail on user deletion.

**Files:**
- Modify: `packages/db/migrations/0126_election_ballot_submissions.sql`
- Modify: `packages/db/src/schema/elections.ts`

**Context to read first:**
- Other migration files for RLS policy patterns — search for `pp_tenant_update` and `pp_tenant_delete` in `packages/db/migrations/` to see the existing pattern for append-only tables
- `packages/db/src/schema/elections.ts` — current Drizzle schema for ballot submissions

- [ ] **Step 1: Add UPDATE and DELETE RLS policies to the migration**

In `packages/db/migrations/0126_election_ballot_submissions.sql`, after the existing INSERT policy, add:

```sql
CREATE POLICY "pp_tenant_update" ON "public"."election_ballot_submissions"
  FOR UPDATE USING ("public"."pp_rls_can_access_community"("community_id"));

CREATE POLICY "pp_tenant_delete" ON "public"."election_ballot_submissions"
  FOR DELETE USING ("public"."pp_rls_can_access_community"("community_id"));
```

These must be placed after the existing `pp_election_ballot_submissions_insert` policy and before the `ALTER TABLE ... ADD CONSTRAINT` line.

- [ ] **Step 2: Fix the submitted_by_user_id FK contradiction**

In the same migration file, change the `submitted_by_user_id` column definition from:

```sql
"submitted_by_user_id" UUID NOT NULL REFERENCES "public"."users"("id") ON DELETE SET NULL,
```

to:

```sql
"submitted_by_user_id" UUID NOT NULL REFERENCES "public"."users"("id") ON DELETE RESTRICT,
```

This means user deletion will be blocked if the user has ballot submissions — correct for an append-only compliance table.

- [ ] **Step 3: Fix the Drizzle schema to match**

In `packages/db/src/schema/elections.ts`, in the `electionBallotSubmissions` table definition, change:

```typescript
    submittedByUserId: uuid('submitted_by_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'set null' }),
```

to:

```typescript
    submittedByUserId: uuid('submitted_by_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
```

- [ ] **Step 4: Add .references() to proxyId in the Drizzle schema**

In the same file, in the `electionBallotSubmissions` table definition, change:

```typescript
    proxyId: bigint('proxy_id', { mode: 'number' }),
```

to:

```typescript
    proxyId: bigint('proxy_id', { mode: 'number' }).references(
      () => electionProxies.id,
      { onDelete: 'set null' },
    ),
```

Verify that `electionProxies` is imported or defined in scope (it should be, as it's in the same file).

- [ ] **Step 5: Commit**

```bash
git add packages/db/migrations/0126_election_ballot_submissions.sql packages/db/src/schema/elections.ts
git commit -m "fix(migration): add UPDATE/DELETE RLS policies, fix FK contradiction

- Add missing UPDATE and DELETE RLS policies for election_ballot_submissions
  (FORCE RLS blocks even service role without them)
- Change submitted_by_user_id from ON DELETE SET NULL to ON DELETE RESTRICT
  (NOT NULL + SET NULL is contradictory; RESTRICT is correct for append-only)
- Add .references() to proxyId in Drizzle schema for introspection parity"
```

---

### Task 3: Fix Proxy Status Transition Race Condition (I1)

The `updateProxyStatusForCommunity` function reads the proxy row without a FOR UPDATE lock, allowing concurrent approve + revoke requests to race.

**Files:**
- Modify: `apps/web/src/lib/services/elections-service.ts` (~line 1301)

**Context to read first:**
- `apps/web/src/lib/services/elections-service.ts` lines 1290-1380 (the `updateProxyStatusForCommunity` function)
- `apps/web/src/lib/services/elections-service.ts` lines 425-445 (the `getElectionForMutation` function — shows the `.for('update')` pattern)

- [ ] **Step 1: Add FOR UPDATE to proxy status select**

In `apps/web/src/lib/services/elections-service.ts`, find the `updateProxyStatusForCommunity` function. Locate the `scoped.selectFrom` call that reads the proxy row (around line 1301). It currently looks like:

```typescript
    const rows = await scoped.selectFrom<ElectionProxyRecord>(
      electionProxies,
      {
        id: electionProxies.id,
        electionId: electionProxies.electionId,
        grantorUserId: electionProxies.grantorUserId,
        grantorUnitId: electionProxies.grantorUnitId,
        proxyHolderUserId: electionProxies.proxyHolderUserId,
        status: electionProxies.status,
        approvedByUserId: electionProxies.approvedByUserId,
        approvedAt: electionProxies.approvedAt,
        createdAt: electionProxies.createdAt,
        updatedAt: electionProxies.updatedAt,
      },
      eq(electionProxies.id, proxyId),
    );
```

Add `.for('update')` at the end of the chain, matching the pattern in `getElectionForMutation`:

```typescript
    const rows = await scoped.selectFrom<ElectionProxyRecord>(
      electionProxies,
      {
        id: electionProxies.id,
        electionId: electionProxies.electionId,
        grantorUserId: electionProxies.grantorUserId,
        grantorUnitId: electionProxies.grantorUnitId,
        proxyHolderUserId: electionProxies.proxyHolderUserId,
        status: electionProxies.status,
        approvedByUserId: electionProxies.approvedByUserId,
        approvedAt: electionProxies.approvedAt,
        createdAt: electionProxies.createdAt,
        updatedAt: electionProxies.updatedAt,
      },
      eq(electionProxies.id, proxyId),
    ).for('update');
```

- [ ] **Step 2: Use getDbNow() for certifiedAt timestamp**

In the same file, find the `certifyElectionForCommunity` function (around line 1140). Change:

```typescript
    const certifiedAt = new Date();
```

to:

```typescript
    const certifiedAt = await getDbNow(tx);
```

Verify that `getDbNow` is already imported and available — it's used in the vote submission path, so it should be defined in the same file.

- [ ] **Step 3: Run existing elections tests to verify no regressions**

```bash
pnpm exec vitest run apps/web/__tests__/elections/ --reporter=verbose
```

Expected: All existing tests pass.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/lib/services/elections-service.ts
git commit -m "fix(elections): add FOR UPDATE lock on proxy transitions, use DB NOW() for certifiedAt

- Proxy status reads now acquire FOR UPDATE lock inside the transaction,
  preventing concurrent approve+revoke race conditions
- certifyElectionForCommunity now uses getDbNow(tx) instead of new Date()
  for consistency with vote timestamp handling"
```

---

### Task 4: Add RBAC Two-Tier Model Comment (I10-adjacent)

Small documentation fix — the elections RBAC entry gives `write: true` to all roles (for voting) but the two-tier model where admin transitions are separately gated isn't documented.

**Files:**
- Modify: `packages/shared/src/rbac-matrix.ts`

- [ ] **Step 1: Add comment to elections RBAC entry**

In `packages/shared/src/rbac-matrix.ts`, find the `elections` entry in the `PHASE5_POLICIES` object. Add a comment block above it:

```typescript
  // Two-tier permission model (same pattern as violations):
  // - write: true for all roles = eligible voters can cast ballots (POST /vote)
  // - Admin-only mutations (open/close/certify/cancel, proxy approve/reject)
  //   additionally check requireElectionsAdminRole() at the route layer.
  elections: {
```

- [ ] **Step 2: Commit**

```bash
git add packages/shared/src/rbac-matrix.ts
git commit -m "docs(rbac): add two-tier permission model comment for elections"
```

---

### Task 5: Fix Operations Hub ARIA Tab Semantics (I4)

The operations hub tabs are announced as generic buttons by screen readers. They need proper WAI-ARIA tab roles.

**Files:**
- Modify: `apps/web/src/components/operations/operations-hub.tsx`

**Context to read first:**
- `apps/web/src/components/operations/operations-hub.tsx` — full file, focus on the tab nav and content areas

- [ ] **Step 1: Add WAI-ARIA tab roles**

In `apps/web/src/components/operations/operations-hub.tsx`, find the `<nav>` element that wraps the tab buttons. It currently looks something like:

```tsx
<nav className="..." aria-label="Operations tabs">
  {TABS.map((tab) => (
    <button
      key={tab.id}
      onClick={...}
      className={cn(...)}
    >
      {tab.label}
    </button>
  ))}
</nav>
```

Update it to:

```tsx
<div role="tablist" aria-label="Operations tabs" className="flex flex-wrap items-center gap-2 border-b border-edge pb-3">
  {TABS.map((tab) => {
    const isActive = selectedTab === tab.id;
    return (
      <button
        key={tab.id}
        role="tab"
        aria-selected={isActive}
        onClick={...}
        className={cn(...)}
      >
        {tab.label}
      </button>
    );
  })}
</div>
```

Then wrap the content area below the tabs in:

```tsx
<div role="tabpanel" aria-label={`${selectedTab} content`}>
  {/* existing content */}
</div>
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/components/operations/operations-hub.tsx
git commit -m "fix(a11y): add ARIA tab roles to operations hub tabs

Operations tabs now use role=tablist/tab/tabpanel with aria-selected
for screen reader accessibility (WCAG 2.1 AA)."
```

---

### Task 6: Fix Board Chrome Active Tab Matching (I3)

The `pathname.startsWith(tab.match)` check never matches because `tab.match` is `/board/polls` but `pathname` is a full path like `/communities/42/board/forum/123`.

**Files:**
- Modify: `apps/web/src/components/board/board-chrome.tsx`

**Context to read first:**
- `apps/web/src/components/board/board-chrome.tsx` — full file (it's short, ~90 lines)

- [ ] **Step 1: Fix active tab detection**

In `apps/web/src/components/board/board-chrome.tsx`, find the line:

```typescript
          const active = pathname === href || pathname.startsWith(tab.match);
```

Replace it with:

```typescript
          const active = pathname === href || pathname.includes(tab.match);
```

This works because `tab.match` values are unique substrings (`/board/polls`, `/board/forum`, `/board/elections`) that won't false-match against each other, and they'll correctly match sub-pages like `/communities/42/board/forum/123`.

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/components/board/board-chrome.tsx
git commit -m "fix(board): use pathname.includes() for active tab detection

startsWith() never matched because pathname is a full path like
/communities/42/board/forum/123 while tab.match is /board/forum.
includes() correctly matches sub-page routes."
```

---

### Task 7: Fix Nav Dead Imports + Operations Page Guard + Forum Prop (I5 + I6 + I9)

Three small fixes that can be done in one commit.

**Files:**
- Modify: `apps/web/src/components/layout/nav-config.ts`
- Modify: `apps/web/src/app/(authenticated)/communities/[id]/operations/page.tsx`
- Modify: `apps/web/src/components/board/board-forum-panel.tsx`

**Context to read first:**
- `apps/web/src/components/layout/nav-config.ts` — check which imports are actually used (grep for `Wrench` and `ClipboardList` in the file body — they should be unused)
- `apps/web/src/app/(authenticated)/communities/[id]/operations/page.tsx` — see the guard calls
- `apps/web/src/components/board/board-forum-panel.tsx` — see the `_isAdmin` pattern
- Also check: do any callers of `BoardForumPanel` pass `isAdmin`? Grep for `BoardForumPanel` in the codebase.

- [ ] **Step 1: Remove dead imports from nav-config**

In `apps/web/src/components/layout/nav-config.ts`, remove `Wrench` and `ClipboardList` from the lucide-react import statement. Verify neither appears elsewhere in the file body first.

- [ ] **Step 2: Relax operations page guard to require-any**

In `apps/web/src/app/(authenticated)/communities/[id]/operations/page.tsx`, replace:

```typescript
  requireWorkOrdersEnabled(membership);
  requireWorkOrdersReadPermission(membership);
  requireAmenitiesEnabled(membership);
  requireAmenitiesReadPermission(membership);
```

with:

```typescript
  const hasWorkOrders = (() => {
    try { requireWorkOrdersEnabled(membership); requireWorkOrdersReadPermission(membership); return true; }
    catch { return false; }
  })();
  const hasAmenities = (() => {
    try { requireAmenitiesEnabled(membership); requireAmenitiesReadPermission(membership); return true; }
    catch { return false; }
  })();

  if (!hasWorkOrders && !hasAmenities) {
    throw new ForbiddenError('This community does not have operations features enabled');
  }
```

Import `ForbiddenError` from `@/lib/api/errors` at the top of the file.

- [ ] **Step 3: Clean up forum panel unused isAdmin prop**

In `apps/web/src/components/board/board-forum-panel.tsx`, thread creation is intentionally open to all community members (the component renders "New Thread" for everyone). Remove the confusing dead code:

Change the interface from:

```typescript
interface BoardForumPanelProps {
  communityId: number;
  isAdmin: boolean;
}

export function BoardForumPanel({ communityId, isAdmin: _isAdmin }: BoardForumPanelProps) {
```

to:

```typescript
interface BoardForumPanelProps {
  communityId: number;
}

export function BoardForumPanel({ communityId }: BoardForumPanelProps) {
```

Then find all callers of `BoardForumPanel` and remove the `isAdmin` prop being passed. The caller is likely in `apps/web/src/app/(authenticated)/communities/[id]/board/forum/page.tsx` or a layout file — grep for `BoardForumPanel` to find it.

- [ ] **Step 4: Run lint to verify dead imports are resolved**

```bash
pnpm lint
```

Expected: No lint errors related to unused imports.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/layout/nav-config.ts apps/web/src/app/\(authenticated\)/communities/\[id\]/operations/page.tsx apps/web/src/components/board/board-forum-panel.tsx
# Also add any caller files modified in step 3
git commit -m "fix: remove dead imports, relax operations guard, clean forum props

- Remove unused Wrench and ClipboardList imports from nav-config
- Operations page now requires at least one of work-orders or amenities
  (was requiring both, which blocked legitimate access)
- Remove unused isAdmin prop from BoardForumPanel (thread creation is
  intentionally open to all community members)"
```

---

### Task 8: Add Elections Gate-Disabled Test Cases (I8)

The elections route tests always configure `electionsAttorneyReviewed: true`. There are no tests verifying that the gate blocks requests when disabled.

**Files:**
- Modify: `apps/web/__tests__/elections/routes.test.ts`

**Context to read first:**
- `apps/web/__tests__/elections/routes.test.ts` — read the full file to understand the mock structure, especially how `requireElectionsEnabledMock` is set up and how other describe blocks are structured
- `apps/web/src/lib/elections/common.ts` — see what `requireElectionsEnabled` does and what error it throws

- [ ] **Step 1: Add a describe block for gate-disabled scenarios**

At the end of `apps/web/__tests__/elections/routes.test.ts`, add a new top-level describe block:

```typescript
describe('Elections gate disabled', () => {
  beforeEach(() => {
    requireAuthenticatedUserIdMock.mockResolvedValue('user-1');
    requireCommunityMembershipMock.mockResolvedValue({
      userId: 'user-1',
      communityId: 42,
      role: 'owner',
      isAdmin: false,
      features: { hasVoting: true },
      electionsAttorneyReviewed: false,
    });
    // requireElectionsEnabled should throw when attorney review is false
    requireElectionsEnabledMock.mockImplementation(() => {
      throw new ForbiddenError('Elections require attorney review');
    });
  });

  it('GET /api/v1/elections returns 403 when elections gate is disabled', async () => {
    const { GET } = await import('@/app/api/v1/elections/route');
    const req = new NextRequest('http://localhost/api/v1/elections?communityId=42');
    const res = await GET(req);
    expect(res.status).toBe(403);
  });

  it('POST /api/v1/elections/1/vote returns 403 when elections gate is disabled', async () => {
    const { POST } = await import('@/app/api/v1/elections/[id]/vote/route');
    const req = new NextRequest('http://localhost/api/v1/elections/1/vote', {
      method: 'POST',
      body: JSON.stringify({ communityId: 42, candidateIds: [1] }),
      headers: { 'Content-Type': 'application/json' },
    });
    const res = await POST(req, { params: Promise.resolve({ id: '1' }) });
    expect(res.status).toBe(403);
  });
});
```

Import `ForbiddenError` from `@/lib/api/errors` if not already imported. Adjust the mock setup to match the exact patterns used in the rest of the test file (check how `requireElectionsEnabledMock` is called — it may need to match the actual `requireElectionsEnabled` function signature, which takes a `membership` argument).

- [ ] **Step 2: Run the election tests**

```bash
pnpm exec vitest run apps/web/__tests__/elections/routes.test.ts --reporter=verbose
```

Expected: All tests pass, including the two new gate-disabled tests.

- [ ] **Step 3: Commit**

```bash
git add apps/web/__tests__/elections/routes.test.ts
git commit -m "test(elections): add gate-disabled test cases for attorney review toggle

Verify that election routes return 403 when electionsAttorneyReviewed
is false. Covers both read (GET /elections) and write (POST /vote) paths."
```

---

### Task 9: Final Verification Gate

Run the full CI-equivalent checks to verify nothing is broken.

**Files:** None (verification only)

- [ ] **Step 1: Run the CI guard**

```bash
pnpm guard:db-access
```

Expected: No violations. If `resolve-users.ts` violation appears, Task 1 wasn't applied correctly.

- [ ] **Step 2: Run typecheck**

```bash
pnpm typecheck
```

Expected: No type errors.

- [ ] **Step 3: Run lint**

```bash
pnpm lint
```

Expected: No lint errors. Watch specifically for unused import warnings.

- [ ] **Step 4: Run all unit tests**

```bash
pnpm test
```

Expected: All tests pass.

- [ ] **Step 5: Run elections integration tests (if DATABASE_URL available)**

```bash
scripts/with-env-local.sh pnpm exec vitest run apps/web/__tests__/elections/vote-integration.test.ts --reporter=verbose
```

Expected: All 3 integration test scenarios pass. If `DATABASE_URL` is not available, skip this step and note it.

- [ ] **Step 6: Run build**

```bash
pnpm build
```

Expected: Clean build with no errors.
