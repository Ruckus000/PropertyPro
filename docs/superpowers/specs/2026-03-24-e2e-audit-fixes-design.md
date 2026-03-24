# E2E Audit Fixes — Design Spec

**Date:** 2026-03-24
**Branch:** `fix/compliance-alert-bugfixes` (or new branch)
**Triggered by:** Cursor browser tool E2E audit against `docs/cursor-e2e-test-guide.md`

## Problem

The E2E visual audit scored **Partial** overall with 3 critical failures that trace to a single root cause, plus 2 independent issues:

1. **Violations inbox shows 0 violations** for Sunset Condos
2. **Payments page shows empty/skeleton** for the owner role
3. **Assessments have no line items** for Sunset Condos
4. **Agent-login defaults to Palm Shores** instead of Sunset Condos
5. **`/violations` bare URL crashes** (no route handler)

Issues 1-3 share a root cause: `seedCommunity()` only creates units for `apartment` type communities. Condo/HOA communities get zero units. Since `seedViolationsData()`, `seedAssessmentData()`, and the payments chain all depend on units existing, all three silently produce empty results.

## Changes

### Change 1: Seed units for condo/HOA communities

**Root cause:** `packages/db/src/seed/seed-community.ts:1463` gates unit creation behind `if (config.communityType === 'apartment')`. Condo and HOA communities get no units. Downstream, `seedViolationsData` (line 402) and `seedAssessmentData` (line 873) both bail with "no units found" when `communityUnits.length === 0`.

**Fix:** Add a `seedCondoHoaUnits()` function in `seed-community.ts` and call it for non-apartment types. Then link the owner user to their unit.

**File: `packages/db/src/seed/seed-community.ts`**

Add new function (modeled on `seedApartmentUnits` at line 877):

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

Wire it into `seedCommunity()` at line 1462, adding an `else` branch:

```typescript
if (config.communityType === 'apartment') {
  // ... existing apartment logic ...
} else {
  await seedCondoHoaUnits(communityId);
}
```

**File: `scripts/seed-demo.ts`**

After communities are seeded (after line 729), link the owner user to unit 1A for Sunset Condos only. (Palm Shores HOA doesn't need owner-unit linking — its violations are reported by the board president and only need units to exist, which `seedCondoHoaUnits` handles. Assessments are only seeded for Sunset Condos.)

```typescript
// Link owner to unit 1A for Sunset Condos (payments + assessments require unit association)
{
  const cId = sunsetCommunityId;
  const ownerId = resolveUserId(userIdsByEmail, 'owner.one@sunset.local');
  const firstUnit = await db
    .select({ id: units.id })
    .from(units)
    .where(and(eq(units.communityId, cId), isNull(units.deletedAt)))
    .orderBy(units.unitNumber)
    .limit(1);

  if (firstUnit[0]) {
    // Set ownerUserId on the unit
    await db
      .update(units)
      .set({ ownerUserId: ownerId, updatedAt: new Date() })
      .where(eq(units.id, firstUnit[0].id));

    // Set unitId on the owner's user_roles entry
    await db.execute(sql`
      UPDATE user_roles
      SET unit_id = ${firstUnit[0].id}
      WHERE community_id = ${cId}
        AND user_id = ${ownerId}
    `);
  }
}
```

**What this unblocks:**
- `seedViolationsData` finds 6 units → inserts 4 violations (uses first 4 units)
- `seedAssessmentData` finds 6 units → inserts 2 assessments with 18 line items (6 units x 3 line items: last month overdue, this month pending, special assessment pending)
- `PaymentPortal` finds the owner's unit via `listActorUnitIds` → displays assessment balance
- `listActorUnitIds` finds the unit via both `userRoles.unitId` and `units.ownerUserId`

### Change 2: Add `?communityId=X` to agent-login route

**Root cause:** `findUserCommunitiesUnscoped` sorts by `communities.name` alphabetically. "Palm Shores HOA" < "Sunset Condos", so `communities[0]` is always Palm Shores for multi-community users.

Changing the sort order would affect 5 callers including the community picker UI (`select-community/page.tsx`) and the authenticated layout, so that's off the table.

**File: `apps/web/src/app/dev/agent-login/route.ts`**

After line 129, add community override logic:

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

No other changes needed — the rest of the route uses `primary` which now respects the override.

### Change 3: Add `/violations` redirect page

**Root cause:** No `page.tsx` exists at `apps/web/src/app/(authenticated)/violations/`. Only `inbox/`, `[id]/`, `report/` sub-routes exist.

**File: `apps/web/src/app/(authenticated)/violations/page.tsx`** (new file)

```typescript
import { redirect } from 'next/navigation';

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function ViolationsRedirectPage({ searchParams }: PageProps) {
  const resolved = await searchParams;
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(resolved)) {
    if (typeof value === 'string') params.set(key, value);
  }
  const qs = params.toString();
  redirect(`/violations/inbox${qs ? `?${qs}` : ''}`);
}
```

## What this does NOT fix (and why)

**Mobile document viewer (MobileDocumentsContent.tsx rows not tappable):** This is a feature gap, not a bug. The mobile portal is Phase 2 scope — document viewing may be intentionally deferred. Adding a viewer requires either a new route (`/mobile/documents/[id]`) or a slide-over component. Both are non-trivial. Defer to Phase 3 scoping.

**Violations API pagination metadata:** The frontend component (`ViolationsAdminInbox.tsx:99`) gracefully handles missing `meta` via `res.meta?.total ?? res.data.length`. The type mismatch between `ListViolationsResponse` (expects `meta`) and the API response (returns `{ data }` only) is a real inconsistency but doesn't cause functional breakage. Track as tech debt.

**Violations API severity filter:** The API route doesn't extract the `severity` query param that the frontend sends. The frontend still works — it just doesn't server-filter by severity. This is an enhancement, not a cause of the 0-violations bug.

## Files Modified

| File | Change | Lines |
|------|--------|-------|
| `packages/db/src/seed/seed-community.ts` | Add `seedCondoHoaUnits()`, wire into `seedCommunity()` | ~30 new, ~3 modified |
| `scripts/seed-demo.ts` | Link owner user to unit after seeding | ~15 new |
| `apps/web/src/app/dev/agent-login/route.ts` | Parse `?communityId` param, use as override | ~5 modified |
| `apps/web/src/app/(authenticated)/violations/page.tsx` | New redirect page | ~15 new |

**Total:** ~65 lines across 4 files. No API changes. No component changes. No schema changes.

## Verification

After applying changes:

1. **Re-seed:** `pnpm seed:demo` — should complete without errors, debug output should show "seeded 4 violations for community X" and "seeded 2 assessments with 18 line items" for Sunset Condos
2. **Agent-login:** `GET /dev/agent-login?as=owner&communityId=1` → redirects to `/mobile?communityId=1` (Sunset Condos)
3. **Violations inbox:** Login as `board_president` with `communityId=1` → `/violations/inbox?communityId=1` shows 4 violations
4. **Payments:** Login as `owner` with `communityId=1` → `/communities/1/payments` shows assessment balance ($350 monthly + $1,500 special)
5. **Violations redirect:** Navigate to `/violations?communityId=1` → redirects to `/violations/inbox?communityId=1`
6. **Unit tests:** `pnpm test` passes
7. **Type check:** `pnpm typecheck` passes
8. **Lint + DB guard:** `pnpm lint` passes (no unauthorized Drizzle imports)
9. **Re-run Cursor E2E audit** against updated guide — violations, payments, and assessments categories should flip from Fail/Partial to Pass
