# E2E Audit Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the 3 critical failures from the Cursor browser E2E audit — missing condo/HOA units (which cascades to 0 violations, empty payments, no assessments), agent-login community default, and `/violations` crash.

**Architecture:** Tasks 1-2 must run in order (Task 2 links owner to a unit that Task 1 creates). Tasks 3-4 are independent of each other and of Tasks 1-2. All changes are seed/route-level — no schema, API, or component modifications.

**Tech Stack:** TypeScript, Drizzle ORM (seed scripts), Next.js 15 App Router (server components)

**Spec:** `docs/superpowers/specs/2026-03-24-e2e-audit-fixes-design.md`

---

### Task 1: Add `seedCondoHoaUnits` to seed-community.ts

**Why:** `seedCommunity()` only creates units for `apartment` communities. Condo/HOA get zero units, which causes violations, assessments, and payments to silently produce empty results.

**Files:**
- Modify: `packages/db/src/seed/seed-community.ts` (add function + wire into `seedCommunity`)

- [ ] **Step 1: Add the `seedCondoHoaUnits` function**

Insert this function immediately before `seedApartmentUnits` (before line 877). It follows the exact same idempotent pattern — check-then-insert per unit:

```typescript
async function seedCondoHoaUnits(
  communityId: number,
): Promise<{ unitIds: number[]; unitNumbers: string[] }> {
  const unitNumbers = ['1A', '1B', '2A', '2B', '3A', '3B'];
  const unitIds: number[] = [];

  for (const unitNumber of unitNumbers) {
    const existing = await db
      .select({ id: units.id })
      .from(units)
      .where(
        and(
          eq(units.communityId, communityId),
          eq(units.unitNumber, unitNumber),
        ),
      )
      .limit(1);

    if (existing[0]) {
      unitIds.push(existing[0].id);
      continue;
    }

    const [created] = await db
      .insert(units)
      .values({ communityId, unitNumber })
      .returning({ id: units.id });

    unitIds.push(created!.id);
  }

  return { unitIds, unitNumbers };
}
```

- [ ] **Step 2: Wire `seedCondoHoaUnits` into `seedCommunity()`**

At line 1462, change the existing `if (config.communityType === 'apartment')` block to add an `else` branch:

```typescript
  if (config.communityType === 'apartment') {
    const { unitIds, unitNumbers } = await seedApartmentUnits(communityId);
    const tenantUserIds = usersToSeed
      .filter((user) => user.role === 'tenant')
      .map((user) => userIdsByEmail[user.email])
      .filter((userId): userId is string => userId != null);

    await seedApartmentLeases(communityId, unitIds, unitNumbers, tenantUserIds);
    await seedApartmentMaintenanceRequests(communityId, unitIds, unitNumbers, tenantUserIds);
  } else {
    await seedCondoHoaUnits(communityId);
  }
```

The existing apartment block (lines 1463–1471) stays identical. Only add the `else` clause.

- [ ] **Step 3: Verify typecheck passes**

Run: `pnpm typecheck`
Expected: No errors in `seed-community.ts`

- [ ] **Step 4: Commit**

```bash
git add packages/db/src/seed/seed-community.ts
git commit -m "fix(seed): add unit seeding for condo/HOA communities

seedCommunity() only created units for apartment types. Condo and HOA
communities got zero units, causing seedViolationsData and
seedAssessmentData to silently bail with 'no units found'."
```

---

### Task 2: Link owner to unit in seed-demo.ts

**Why:** Even after units exist, the owner user needs to be associated with a specific unit for the payments portal to work. `listActorUnitIds` checks both `userRoles.unitId` and `units.ownerUserId` — both are NULL after seeding without this fix.

**Files:**
- Modify: `scripts/seed-demo.ts` (add owner-unit linking block after community seeding)

- [ ] **Step 1: Add `sql` to the existing filters import**

In `scripts/seed-demo.ts`, line 19 has:
```typescript
import { and, eq, inArray, isNull } from '@propertypro/db/filters';
```

Add `sql` to this import:
```typescript
import { and, eq, inArray, isNull, sql } from '@propertypro/db/filters';
```

`sql` is re-exported from `@propertypro/db/filters` (see `packages/db/src/filters.ts:7`), so this passes the CI DB access guard. `units` is already imported at line 15.

- [ ] **Step 2: Add owner-unit linking block**

Insert the following block in `runDemoSeed()` immediately after line 822 (`debugSeed('cross-community role and notification fixups complete');`) and before line 824 (`// Seed violation data for condo and HOA communities`). This reuses the `ownerUserId` variable that's declared on line 825 — move that declaration up above this block.

```typescript
  // Link owner to unit 1A for Sunset Condos (payments + assessments require unit association)
  const ownerUserId = resolveUserId(userIdsByEmail, 'owner.one@sunset.local');
  {
    const firstUnit = await db
      .select({ id: units.id })
      .from(units)
      .where(and(eq(units.communityId, sunsetCommunityId), isNull(units.deletedAt)))
      .orderBy(units.unitNumber)
      .limit(1);

    if (firstUnit[0]) {
      await db
        .update(units)
        .set({ ownerUserId, updatedAt: new Date() })
        .where(eq(units.id, firstUnit[0].id));

      await db.execute(sql`
        UPDATE user_roles
        SET unit_id = ${firstUnit[0].id}
        WHERE community_id = ${sunsetCommunityId}
          AND user_id = ${ownerUserId}
      `);
      debugSeed(`linked owner to unit ${firstUnit[0].id} in community ${sunsetCommunityId}`);
    }
  }
```

Then on the existing line 825, remove the `const ownerUserId = ...` declaration since it's now above. The existing line 826 (`await seedViolationsData(sunsetCommunityId, ownerUserId);`) continues to work because `ownerUserId` is now in scope from the earlier declaration.

- [ ] **Step 2: Verify typecheck passes**

Run: `pnpm typecheck`
Expected: No errors

- [ ] **Step 3: Run the seed and verify output**

Run: `scripts/with-env-local.sh pnpm seed:demo`

Expected output should include (among other lines):
- `linked owner ... to unit ... in community ...`
- `seeded 4 violations for community X` (for Sunset Condos)
- `seeded 4 violations for community Y` (for Palm Shores HOA)
- `seeded 2 assessments with 18 line items for community X` (for Sunset Condos)

If violations or assessments still say "no units found, skipping" — something is wrong with Task 1. Double-check that `seedCondoHoaUnits` runs before `seedViolationsData` in the call order.

- [ ] **Step 4: Commit**

```bash
git add scripts/seed-demo.ts
git commit -m "fix(seed): link owner user to unit 1A in Sunset Condos

Sets units.ownerUserId and user_roles.unit_id so that
listActorUnitIds resolves the owner's unit for the payments portal."
```

---

### Task 3: Add `?communityId` param to agent-login route

**Why:** `findUserCommunitiesUnscoped` sorts alphabetically by name. "Palm Shores HOA" < "Sunset Condos", so multi-community users always default to Palm Shores. Adding a `?communityId=X` override lets the test guide (and developers) target a specific community without changing the sort order that 5 other callers depend on.

**Files:**
- Modify: `apps/web/src/app/dev/agent-login/route.ts` (lines 129-130)

- [ ] **Step 1: Modify the community selection logic**

Replace lines 129-130:

```typescript
  const communities = await findUserCommunitiesUnscoped(authData.user.id);
  const primary = communities[0] ?? null;
```

With:

```typescript
  const communities = await findUserCommunitiesUnscoped(authData.user.id);

  // Allow explicit community selection via ?communityId=X
  const rawCommunityId = url.searchParams.get('communityId');
  const requestedCommunityId = rawCommunityId ? Number(rawCommunityId) : null;

  const primary = (
    requestedCommunityId
      ? communities.find((c) => c.communityId === requestedCommunityId)
      : undefined
  ) ?? communities[0] ?? null;
```

The `url` variable already exists at line 48. No new imports needed. The fallback to `communities[0]` preserves existing behavior when `communityId` is not provided or doesn't match.

- [ ] **Step 2: Verify typecheck passes**

Run: `pnpm typecheck`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/dev/agent-login/route.ts
git commit -m "fix(dev): add ?communityId param to agent-login route

Multi-community users defaulted to Palm Shores (alphabetically first).
Now /dev/agent-login?as=owner&communityId=1 targets Sunset Condos."
```

---

### Task 4: Add `/violations` redirect page

**Why:** No `page.tsx` exists at the violations root. Navigating to `/violations?communityId=X` crashes. Only `inbox/`, `[id]/`, `report/` sub-routes exist.

**Pattern to follow:** `apps/web/src/app/(authenticated)/payments/page.tsx` — uses `resolveCommunityContext` for community resolution, then redirects.

**Files:**
- Create: `apps/web/src/app/(authenticated)/violations/page.tsx`

- [ ] **Step 1: Create the redirect page**

Create `apps/web/src/app/(authenticated)/violations/page.tsx`:

```typescript
import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { resolveCommunityContext } from '@/lib/tenant/resolve-community-context';
import { toUrlSearchParams } from '@/lib/tenant/community-resolution';

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/**
 * Redirect: /violations?communityId=X -> /violations/inbox?communityId=X
 */
export default async function ViolationsRedirectPage({ searchParams }: PageProps) {
  const [resolvedSearchParams, requestHeaders] = await Promise.all([
    searchParams,
    headers(),
  ]);

  const context = resolveCommunityContext({
    searchParams: toUrlSearchParams(resolvedSearchParams),
    host: requestHeaders.get('host'),
  });

  if (context.communityId) {
    redirect(`/violations/inbox?communityId=${context.communityId}`);
  }

  redirect('/violations/inbox');
}
```

This follows the exact pattern from the payments redirect page — uses `resolveCommunityContext` + `toUrlSearchParams` for community resolution, consistent with the codebase.

- [ ] **Step 2: Verify typecheck passes**

Run: `pnpm typecheck`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/(authenticated)/violations/page.tsx
git commit -m "fix(routes): add /violations redirect to /violations/inbox

Navigating to /violations without a sub-path crashed with an invalid
response. Now redirects to /violations/inbox preserving communityId."
```

---

### Task 5: Full verification

**Why:** Confirm all 3 changes work together end-to-end.

- [ ] **Step 1: Re-seed the database**

Run: `scripts/with-env-local.sh pnpm seed:demo`

Verify output includes:
- `seeded 4 violations for community ...` (appears twice — Sunset + Palm Shores)
- `seeded 2 assessments with 18 line items for community ...`
- `linked owner ... to unit ...`

- [ ] **Step 2: Run full CI checks**

Run these in parallel:
- `pnpm typecheck`
- `pnpm lint`
- `pnpm test`

All must pass with zero errors.

- [ ] **Step 3: Manual smoke test (if dev server available)**

Start dev server: `pnpm dev`

Test agent-login with communityId override:
- `http://localhost:3000/dev/agent-login?as=board_president&communityId=1` → lands on Sunset Condos dashboard
- Navigate to violations inbox → should show 4 violations
- Navigate to `/violations?communityId=1` → redirects to `/violations/inbox?communityId=1`

Test payments:
- `http://localhost:3000/dev/agent-login?as=owner&communityId=1` → lands on Sunset Condos mobile
- Navigate to `/communities/1/payments` → should show assessment balance

- [ ] **Step 4: Update the E2E test guide**

Edit `docs/cursor-e2e-test-guide.md` — update the Pre-Flight section and authentication instructions to include `&communityId=1` for Sunset Condos targeting:

In Part 0, step 0.2, change:
```
Navigate to `http://localhost:3000/dev/agent-login?as=owner`
```
to:
```
Navigate to `http://localhost:3000/dev/agent-login?as=owner&communityId=1`
```

Apply the same `&communityId=1` addition to all Sunset Condos login URLs in Parts 1, 2, and 6.

For the CAM role (Part 3) which tests multi-community, keep the bare `?as=cam` without a communityId so it demonstrates the community picker flow.

- [ ] **Step 5: Final commit**

```bash
git add docs/cursor-e2e-test-guide.md
git commit -m "docs: update e2e test guide with communityId targeting

Agent-login now supports ?communityId=X. Updated all Sunset Condos
test flows to use &communityId=1 for deterministic community selection."
```
