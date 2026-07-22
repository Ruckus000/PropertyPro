# Phase 3.1 — Statutory Designation Gating Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Thread the board `designation` onto `CommunityMembership` and add a `requireBoardDesignation()` gate, then route the election- and violation-management helper families plus a board-meeting-type seam through it — a behavior-neutral foundation for the rest of Phase 3.

**Architecture:** `designation` already exists on `user_roles` (migration 0018) and is already fetched by the membership query (`SELECT *`); it is simply never surfaced. We surface it (additive), add a `requireBoardDesignation(membership)` helper = "management-tier (`isAdmin`) OR holds a board designation", and apply it as a **second** gate after the existing `requirePermission(resource, action)` on statutory routes. Because every current board member is already a `property_manager` and zero residents hold a designation, this changes no current access — the designation arm is forward-looking scaffolding (and is currently unreachable on these routes because `requirePermission(…, 'write')` already filters to management-tier; this is intentional and documented).

**Tech Stack:** Next.js 15 / TypeScript / Vitest / Zod. No DB migration. Spec: `docs/superpowers/specs/2026-06-12-role-simplification-phase3-statutory-designation-gating-design.md`.

---

## File structure

```
apps/web/src/lib/api/community-membership.ts          # +designation on interface + mapping
apps/web/__tests__/api/community-membership.test.ts   # update expected obj + new board-row case
apps/web/src/lib/db/access-control.ts                 # +requireBoardDesignation() helper
apps/web/__tests__/lib/db/access-control.test.ts      # NEW: helper unit tests
apps/web/src/lib/elections/common.ts                  # requireElectionsAdminRole → delegate
apps/web/src/lib/violations/common.ts                 # requireViolationAdminWrite → delegate
apps/web/__tests__/lib/statutory-gates.test.ts        # NEW: helper-family delegation tests
apps/web/src/app/api/v1/meetings/route.ts             # board-meeting-type seam
apps/web/__tests__/meetings/meetings-board-gate.test.ts # NEW: board-type create gate test
```

---

### Task 1: Surface `designation` on `CommunityMembership`

**Files:**
- Modify: `apps/web/src/lib/api/community-membership.ts` (interface ~`:8-43`, mapping ~`:96-160`)
- Test: `apps/web/__tests__/api/community-membership.test.ts`

- [ ] **Step 1: Update the existing test's expected object + add a board-row case.** In `apps/web/__tests__/api/community-membership.test.ts`, the first test asserts the full membership with `toEqual`. Add `designation: null` to that expected object (the resident row has no designation). Then add a new test after it:

```ts
  it('surfaces designation for a board-designated row', async () => {
    scopedSelectFromMock.mockImplementation(async (table: unknown) => {
      if (table === userRolesTable) {
        return [{
          userId: 'user-1',
          role: 'property_manager',
          isUnitOwner: false,
          displayTitle: 'Board President',
          presetKey: 'board_president',
          designation: 'board_president',
        }];
      }
      if (table === communitiesTable) {
        return [{ id: 42, communityType: 'condo_718', timezone: 'America/New_York', isDemo: false }];
      }
      return [];
    });

    const membership = await requireCommunityMembership(42, 'user-1');

    expect(membership.designation).toBe('board_president');
    expect(membership.isAdmin).toBe(true);
  });
```

- [ ] **Step 2: Run the test to verify the new case FAILS.**

Run: `cd apps/web && pnpm exec vitest run __tests__/api/community-membership.test.ts`
Expected: the new case FAILS (`membership.designation` is `undefined`, not `'board_president'`); the updated `toEqual` case also fails until Step 3.

- [ ] **Step 3: Add `designation` to the `CommunityMembership` interface.** In `community-membership.ts`, inside the `CommunityMembership` interface, add after the `presetKey?` field:

```ts
  /** Board designation (role-v3 §3.2) — statutory marker, independent of role. Null when not a board member. */
  designation: 'board_president' | 'board_member' | null;
```

- [ ] **Step 4: Map it in `requireCommunityMembership`.** After the `presetKey` derivation block (the `const presetKey = …` lines), add:

```ts
  const rawDesignation = membership['designation'];
  const designation =
    rawDesignation === 'board_president' || rawDesignation === 'board_member'
      ? rawDesignation
      : null;
```

Then add `designation,` to the returned object (next to `presetKey,`).

- [ ] **Step 5: Run the tests to verify they PASS.**

Run: `cd apps/web && pnpm exec vitest run __tests__/api/community-membership.test.ts`
Expected: PASS (both the updated `toEqual` case and the new board-row case).

- [ ] **Step 6: Commit.**

```bash
git add apps/web/src/lib/api/community-membership.ts apps/web/__tests__/api/community-membership.test.ts
git commit -m "feat(roles): surface board designation on CommunityMembership"
```

---

### Task 2: Add the `requireBoardDesignation()` helper

**Files:**
- Modify: `apps/web/src/lib/db/access-control.ts`
- Test: `apps/web/__tests__/lib/db/access-control.test.ts` (NEW)

- [ ] **Step 1: Write the failing test.** Create `apps/web/__tests__/lib/db/access-control.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { requireBoardDesignation } from '../../../src/lib/db/access-control';
import { ForbiddenError } from '../../../src/lib/api/errors';
import type { CommunityMembership } from '../../../src/lib/api/community-membership';

// Minimal membership factory — only the fields requireBoardDesignation reads.
function membership(overrides: Partial<CommunityMembership>): CommunityMembership {
  return {
    userId: 'u', communityId: 1, communityName: '', role: 'resident',
    communityType: 'condo_718', subscriptionPlan: null, subscriptionStatus: null,
    freeAccessExpiresAt: null, timezone: 'America/New_York', isUnitOwner: false,
    isAdmin: false, displayTitle: '', designation: null, city: null, state: null,
    isDemo: false, trialEndsAt: null, demoExpiresAt: null, electionsAttorneyReviewed: false,
    ...overrides,
  };
}

describe('requireBoardDesignation', () => {
  it('passes for a management-tier actor (isAdmin)', () => {
    expect(() => requireBoardDesignation(membership({ role: 'property_manager', isAdmin: true }))).not.toThrow();
  });
  it('passes for a resident holding a board designation', () => {
    expect(() => requireBoardDesignation(membership({ role: 'resident', isAdmin: false, designation: 'board_member' }))).not.toThrow();
  });
  it('throws ForbiddenError for a plain resident with no designation', () => {
    expect(() => requireBoardDesignation(membership({ role: 'resident', isAdmin: false, designation: null }))).toThrow(ForbiddenError);
  });
});
```

- [ ] **Step 2: Run the test to verify it FAILS.**

Run: `cd apps/web && pnpm exec vitest run __tests__/lib/db/access-control.test.ts`
Expected: FAIL — `requireBoardDesignation` is not exported.

- [ ] **Step 3: Implement the helper.** In `apps/web/src/lib/db/access-control.ts`, after `requirePermission`, add (`ForbiddenError` and `CommunityMembership` are already imported in this file):

```ts
/**
 * Statutory board-action gate (role-v3 §3.2). Passes for management-tier callers
 * (property_manager / root_manager == membership.isAdmin) OR any holder of a board
 * designation. Apply as a SECOND gate AFTER requirePermission(resource, action) on
 * statutory routes only — general permissions still come from the role.
 *
 * NOTE: the designation arm is currently unreachable on the statutory routes,
 * because requirePermission(..., 'write') already filters to management-tier
 * (residents lack write on meetings/elections/violations). It is intentional
 * forward-looking scaffolding for a future resident-held board seat; today this
 * helper is equivalent to the isAdmin check it replaces (behavior-neutral).
 */
export function requireBoardDesignation(membership: CommunityMembership): void {
  if (!(membership.isAdmin || membership.designation != null)) {
    throw new ForbiddenError('This action is restricted to the board.');
  }
}
```

- [ ] **Step 4: Run the test to verify it PASSES.**

Run: `cd apps/web && pnpm exec vitest run __tests__/lib/db/access-control.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit.**

```bash
git add apps/web/src/lib/db/access-control.ts apps/web/__tests__/lib/db/access-control.test.ts
git commit -m "feat(roles): add requireBoardDesignation statutory-gate helper"
```

---

### Task 3: Route the election + violation admin-helper families through the gate

**Files:**
- Modify: `apps/web/src/lib/elections/common.ts` (`requireElectionsAdminRole` ~`:21-25`)
- Modify: `apps/web/src/lib/violations/common.ts` (`requireViolationAdminWrite` ~`:32-36`)
- Test: `apps/web/__tests__/lib/statutory-gates.test.ts` (NEW)

ARC's `requireArcReviewPermission` in `violations/common.ts` is intentionally **left unchanged** (deferred per spec §3.4 / open questions).

- [ ] **Step 1: Write the failing delegation tests.** Create `apps/web/__tests__/lib/statutory-gates.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { requireElectionsAdminRole } from '../../src/lib/elections/common';
import { requireViolationAdminWrite } from '../../src/lib/violations/common';
import { ForbiddenError } from '../../src/lib/api/errors';
import type { CommunityMembership } from '../../src/lib/api/community-membership';

function membership(overrides: Partial<CommunityMembership>): CommunityMembership {
  return {
    userId: 'u', communityId: 1, communityName: '', role: 'resident',
    communityType: 'condo_718', subscriptionPlan: null, subscriptionStatus: null,
    freeAccessExpiresAt: null, timezone: 'America/New_York', isUnitOwner: false,
    isAdmin: false, displayTitle: '', designation: null, city: null, state: null,
    isDemo: false, trialEndsAt: null, demoExpiresAt: null, electionsAttorneyReviewed: false,
    ...overrides,
  };
}

describe('statutory admin gates delegate to requireBoardDesignation', () => {
  for (const [name, fn] of [
    ['requireElectionsAdminRole', requireElectionsAdminRole],
    ['requireViolationAdminWrite', requireViolationAdminWrite],
  ] as const) {
    it(`${name} passes management-tier`, () => {
      expect(() => fn(membership({ role: 'property_manager', isAdmin: true }))).not.toThrow();
    });
    it(`${name} passes a resident + designation`, () => {
      expect(() => fn(membership({ designation: 'board_president' }))).not.toThrow();
    });
    it(`${name} rejects a plain resident`, () => {
      expect(() => fn(membership({}))).toThrow(ForbiddenError);
    });
  }
});
```

- [ ] **Step 2: Run to verify the resident+designation cases FAIL.**

Run: `cd apps/web && pnpm exec vitest run __tests__/lib/statutory-gates.test.ts`
Expected: the `passes a resident + designation` cases FAIL (current helpers throw for non-`isAdmin`).

- [ ] **Step 3: Delegate `requireElectionsAdminRole`.** In `apps/web/src/lib/elections/common.ts`, add the import and replace the helper body:

```ts
import { requireBoardDesignation } from '@/lib/db/access-control';
```

```ts
export function requireElectionsAdminRole(membership: CommunityMembership): void {
  requireBoardDesignation(membership);
}
```

- [ ] **Step 4: Delegate `requireViolationAdminWrite`.** In `apps/web/src/lib/violations/common.ts`, add the import and replace the helper body (leave `requireArcReviewPermission` untouched):

```ts
import { requireBoardDesignation } from '@/lib/db/access-control';
```

```ts
export function requireViolationAdminWrite(membership: CommunityMembership): void {
  requireBoardDesignation(membership);
}
```

- [ ] **Step 5: Run the new tests + the existing election/violation route suites (no regression).**

Run: `cd apps/web && pnpm exec vitest run __tests__/lib/statutory-gates.test.ts __tests__/elections __tests__/violations`
Expected: PASS (new delegation tests green; existing route tests unchanged — management-tier still passes).

- [ ] **Step 6: Commit.**

```bash
git add apps/web/src/lib/elections/common.ts apps/web/src/lib/violations/common.ts apps/web/__tests__/lib/statutory-gates.test.ts
git commit -m "feat(roles): route election + violation admin gates through requireBoardDesignation"
```

---

### Task 4: Board-meeting-type seam in the meetings route

**Files:**
- Modify: `apps/web/src/app/api/v1/meetings/route.ts` (POST handler ~`:128-153`)
- Test: `apps/web/__tests__/meetings/meetings-board-gate.test.ts` (NEW)

- [ ] **Step 1: Write the failing test.** Create `apps/web/__tests__/meetings/meetings-board-gate.test.ts`. Model the mocks on `apps/web/__tests__/meetings/meetings-detail-route.test.ts` (read it for the exact `vi.mock` set the route needs so module load succeeds — at minimum `@/lib/api/auth`, `@/lib/api/community-membership`, `@/lib/db/access-control` (mock `requirePermission` no-op AND a real-ish `requireBoardDesignation`), `@/lib/middleware/subscription-guard`, `@/lib/middleware/demo-grace-guard`, `@/lib/services/meeting-service`, `@/lib/services/notification-service`, `@propertypro/db`). The decisive assertions:

```ts
// A board-designated property_manager creating a board meeting succeeds (no lockout).
it('property_manager can create a board meeting (status quo)', async () => {
  requireCommunityMembershipMock.mockResolvedValue({ role: 'property_manager', isAdmin: true, designation: null, communityType: 'condo_718' });
  const res = await POST(boardMeetingReq());
  expect(res.status).toBe(200);
});

// A plain resident is rejected — by requirePermission first (proves the resource gate still leads).
it('plain resident is rejected creating a board meeting', async () => {
  requirePermissionMock.mockImplementation(() => { throw new ForbiddenError('no'); });
  requireCommunityMembershipMock.mockResolvedValue({ role: 'resident', isAdmin: false, designation: null, communityType: 'condo_718' });
  const res = await POST(boardMeetingReq());
  expect(res.status).toBe(403);
});
```

where `boardMeetingReq()` posts `{ communityId, action: 'create', title: 'X', meetingType: 'board', startTime: <iso>, … }` with the `x-community-id` header (copy the request-builder shape from the detail-route test).

- [ ] **Step 2: Run to verify it FAILS / errors.**

Run: `cd apps/web && pnpm exec vitest run __tests__/meetings/meetings-board-gate.test.ts`
Expected: FAIL (the seam isn't wired / `requireBoardDesignation` not imported in the route).

- [ ] **Step 3: Wire the seam.** In `apps/web/src/app/api/v1/meetings/route.ts`, add to the access-control import:

```ts
import { requirePermission, requireBoardDesignation } from '@/lib/db/access-control';
```

In the `POST` handler, immediately after `requirePermission(membership, 'meetings', 'write');`, add:

```ts
  // Statutory board-meeting calls require a board designation (role-v3 §3.2).
  // Behaviour-neutral today: any caller past the meetings:write gate is
  // management-tier and passes; residents are already blocked above.
  if (normalizedBody.meetingType === 'board') {
    requireBoardDesignation(membership);
  }
```

- [ ] **Step 4: Run the test to verify it PASSES.**

Run: `cd apps/web && pnpm exec vitest run __tests__/meetings/meetings-board-gate.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit.**

```bash
git add apps/web/src/app/api/v1/meetings/route.ts apps/web/__tests__/meetings/meetings-board-gate.test.ts
git commit -m "feat(roles): gate board-meeting creation on requireBoardDesignation"
```

---

### Task 5: Close-out — full battery + PR

- [ ] **Step 1: Fresh-worktree packages build (avoids `@propertypro/*` resolve failures).**

Run: `pnpm turbo run build --filter='./packages/*' --force`
Expected: all packages build.

- [ ] **Step 2: Typecheck.**

Run: `cd apps/web && pnpm exec tsc --noEmit`
Expected: exit 0. (The new `designation` field is required `| null`, but this was verified safe: the 193 test files mock the *function* return via loosely-typed `requireCommunityMembershipMock.mockResolvedValue({…})`, and the one source-side typed fixture — `apps/web/src/lib/work-orders/__tests__/common.test.ts` — uses `as CommunityMembership`; both tolerate a new required field, so tsc should pass cleanly. If tsc *does* flag a literal assigned to `: CommunityMembership`, add `designation: null` there.)

- [ ] **Step 3: Run the full set of touched test suites.**

Run: `cd apps/web && pnpm exec vitest run __tests__/api/community-membership.test.ts __tests__/lib/db/access-control.test.ts __tests__/lib/statutory-gates.test.ts __tests__/meetings __tests__/elections __tests__/violations`
Expected: all PASS.

- [ ] **Step 4: Guard battery from repo root.**

Run: `pnpm guard:db-access && pnpm guard:legacy-roles && pnpm guard:contracts && pnpm guard:component-api-calls && pnpm guard:tenant-scope`
Expected: all clean. (No new legacy-role literals are added — `designation` values `board_president`/`board_member` are already counted; if `guard:legacy-roles` rises, confirm it's only the test fixtures and adjust the floor with a justifying comment, mirroring prior phases.)

- [ ] **Step 5: Web build.**

Run: `pnpm --filter @propertypro/web build`
Expected: success.

- [ ] **Step 6: Open the PR** (single PR; no migration, no prod-apply gate). Title: `feat(roles): Phase 3.1 statutory designation gating (foundation)`. Body: link the spec, note behavior-neutral (designation arm currently unreachable — forward-looking), list the touched gates (election + violation families, board-meeting seam), and the deferred ARC / president-only / billing open questions. After merge: proceed to **3.2** (repoint the `presetKey`→designation targeting consumers) per the spec's out-of-scope section.

---

## Notes for the implementer

- **Behavior-neutral is the goal.** No existing route test should change its pass/fail expectation except where it now asserts the *same* outcome through the new helper. If a route test breaks, you've changed behavior — stop and reconcile.
- **Do not touch** `presetKey`, the `permissions` JSONB, the RBAC matrix, or any `settings:write`/billing route — those are 3.2/3.3/3.4.
- **Never run** `db:migrate` or the integration vitest config locally — the local `DATABASE_URL` points at prod. Only run the unit suites named above.
- `requireArcReviewPermission` stays `isAdmin`-based (ARC deferred).
