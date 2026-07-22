# Phase 3.2 — Board-Targeting Repoint (presetKey → designation) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every consumer that reads a board `presetKey` to mean "board member" sources from `designation` instead, and every writer of a board `presetKey` writes the identical `designation` in lockstep — behavior-neutral (prod verified: 579 board-preset rows = 579 designation rows, 0 mismatches), no migration.

**Architecture:** Two tiny predicates (`hasBoardDesignation`, `isBoardPresident`) are added to the guard-exempt `packages/shared/src/role-transition.ts` and become the sole board-targeting source. Seven read sites repoint to them; four write sites derive `designation` from the board preset they already write. The legacy-role shim (`inferCanonicalRoleFromMembership`) checks designation before presetKey for the two board cases only.

**Tech Stack:** TypeScript, Next.js 15 App Router, Drizzle via `createScopedClient`, vitest. NO new contracts, NO migration, NO `permission: 'roles'` anywhere.

**Spec:** `docs/superpowers/specs/2026-06-12-role-simplification-phase3.2-board-targeting-repoint-design.md`

---

## Hard rules (program discipline — violations fail CI or worse)

- Branch: `feat/role-v3-phase3.2-board-repoint` cut from **origin/main**. Code-only PR (this plan + spec stay on the docs branch).
- **NEVER** run `db:migrate` or the integration vitest config locally (local `DATABASE_URL` points at PROD).
- `guard:legacy-roles` is a ratchet (floor 254). NEVER inline `'board_president'` / `'board_member'` / `'cam'` / `'site_manager'` / `'property_manager_admin'` literals in scanned files — use the helpers / existing constants. Exempt files: `packages/shared/src/role-transition.ts`, `packages/shared/src/billing/permissions.ts`. The repoint removes literals, so the final task ratchets the FLOOR **down**.
- Fresh worktree: run `pnpm turbo run build --filter='./packages/*' --force` before any apps/web test run, and again after every `packages/shared` change (apps/web resolves the built package).
- When a module under test gains a new import from `@propertypro/shared`, grep `vi\.mock\(['"]@propertypro/shared['"]` across `apps/web/__tests__/` and `apps/admin/__tests__/` and add the new export to EVERY matching factory, or every test in those files 500s at module load.
- Local `pnpm --filter @propertypro/web build` fails on unrelated `Missing DATABASE_URL` accounting routes — environmental; CI Build is the gate. Do NOT load prod env to make it pass.

---

### Task 1: Shared board-designation helpers

**Files:**
- Modify: `packages/shared/src/role-transition.ts` (append after `BoardDesignation`)
- Test: `packages/shared/__tests__/role-transition.test.ts`

- [ ] **Step 1: Write the failing tests** — append to `packages/shared/__tests__/role-transition.test.ts`:

```ts
import { hasBoardDesignation, isBoardPresident } from '../src/role-transition';

describe('hasBoardDesignation', () => {
  it('accepts both board designations', () => {
    expect(hasBoardDesignation('board_president')).toBe(true);
    expect(hasBoardDesignation('board_member')).toBe(true);
  });
  it('rejects null, undefined, and non-board strings', () => {
    expect(hasBoardDesignation(null)).toBe(false);
    expect(hasBoardDesignation(undefined)).toBe(false);
    expect(hasBoardDesignation('')).toBe(false);
    expect(hasBoardDesignation('cam')).toBe(false);
    expect(hasBoardDesignation('president')).toBe(false);
    expect(hasBoardDesignation(7)).toBe(false);
  });
});

describe('isBoardPresident', () => {
  it('is true only for board_president', () => {
    expect(isBoardPresident('board_president')).toBe(true);
    expect(isBoardPresident('board_member')).toBe(false);
    expect(isBoardPresident(null)).toBe(false);
    expect(isBoardPresident(undefined)).toBe(false);
  });
});
```

(Match the existing import style at the top of the file — extend the existing import from `'../src/role-transition'` if one exists rather than adding a duplicate.)

- [ ] **Step 2: Run to verify failure**

Run: `cd packages/shared && pnpm exec vitest run __tests__/role-transition.test.ts`
Expected: FAIL — `hasBoardDesignation` is not exported.

- [ ] **Step 3: Implement** — append to `packages/shared/src/role-transition.ts` directly below the `BoardDesignation` type:

```ts
/**
 * Canonical "is a board member" predicate (role-v3 §3.2, Phase 3.2).
 * From 3.2 on, ALL board targeting (board_only audiences, the public §718
 * roster, president-notify arms) sources from `designation` via this helper —
 * never from presetKey. Lives in this guard-exempt file so consumers in
 * guard-scanned files never inline the designation literals.
 */
export function hasBoardDesignation(value: unknown): value is BoardDesignation {
  return typeof value === 'string' && (BOARD_DESIGNATIONS as readonly string[]).includes(value);
}

/** President-only arms (access-request notify, billing president check). */
export function isBoardPresident(value: unknown): boolean {
  return value === 'board_president';
}
```

- [ ] **Step 4: Run to verify pass**

Run: `cd packages/shared && pnpm exec vitest run __tests__/role-transition.test.ts`
Expected: PASS.

- [ ] **Step 5: Rebuild packages + commit**

```bash
pnpm turbo run build --filter='./packages/*' --force
git add packages/shared/src/role-transition.ts packages/shared/__tests__/role-transition.test.ts
git commit -m "feat(roles): hasBoardDesignation/isBoardPresident canonical predicates (3.2)"
```

---

### Task 2: `inferCanonicalRoleFromMembership` — designation wins over preset

**Files:**
- Modify: `packages/shared/src/billing/permissions.ts:39-56` (guard-EXEMPT — literals allowed here)
- Test: `packages/shared/__tests__/billing-permissions.test.ts`

- [ ] **Step 1: Write the failing tests** — add to `packages/shared/__tests__/billing-permissions.test.ts`:

```ts
describe('inferCanonicalRoleFromMembership — designation precedence (3.2)', () => {
  it('designation wins over presetKey for manager-tier rows', () => {
    expect(inferCanonicalRoleFromMembership({
      role: 'property_manager', presetKey: null, designation: 'board_president',
    })).toBe('board_president');
    expect(inferCanonicalRoleFromMembership({
      role: 'property_manager', presetKey: 'cam', designation: 'board_member',
    })).toBe('board_member');
    expect(inferCanonicalRoleFromMembership({
      role: 'manager', presetKey: null, designation: 'board_president',
    })).toBe('board_president');
  });
  it('falls back to presetKey when designation is absent (bilingual window)', () => {
    expect(inferCanonicalRoleFromMembership({
      role: 'manager', presetKey: 'board_president',
    })).toBe('board_president');
    expect(inferCanonicalRoleFromMembership({
      role: 'property_manager', presetKey: 'board_member', designation: null,
    })).toBe('board_member');
  });
  it('default branches are untouched (LOAD-BEARING: 10 prod null-preset rows)', () => {
    expect(inferCanonicalRoleFromMembership({ role: 'property_manager', presetKey: null })).toBe('cam');
    expect(inferCanonicalRoleFromMembership({ role: 'manager', presetKey: null })).toBe('board_member');
    expect(inferCanonicalRoleFromMembership({ role: 'root_manager', designation: 'board_president' })).toBe('property_manager_admin');
    expect(inferCanonicalRoleFromMembership({ role: 'resident', isUnitOwner: true, designation: 'board_member' })).toBe('owner');
  });
});
```

Note the last two assertions: designation must NOT affect non-manager-tier mappings — `root_manager` stays `property_manager_admin`; a resident stays owner/tenant (designation is statutory, not a legacy-role override).

- [ ] **Step 2: Run to verify failure**

Run: `cd packages/shared && pnpm exec vitest run __tests__/billing-permissions.test.ts`
Expected: FAIL — `designation` not accepted / wrong mapping.

- [ ] **Step 3: Implement** — in `packages/shared/src/billing/permissions.ts`, change the signature and the manager-tier branch (everything else byte-identical):

```ts
export function inferCanonicalRoleFromMembership(input: {
  role: string;
  isUnitOwner?: boolean;
  presetKey?: string | null;
  designation?: string | null;
}): AnyCommunityRole {
  if (input.role === 'pm_admin' || input.role === 'root_manager') return 'property_manager_admin';
  if (input.role === 'manager' || input.role === 'property_manager') {
    // Phase 3.2: designation is the source of truth for board membership;
    // the presetKey board cases below are the bilingual fallback for callers
    // not yet passing designation, and die with this whole function in Phase 4.
    if (input.designation === 'board_president') return 'board_president';
    if (input.designation === 'board_member') return 'board_member';
    switch (input.presetKey) {
      case 'board_president': return 'board_president';
      case 'cam': return 'cam';
      case 'site_manager': return 'site_manager';
      case 'board_member': return 'board_member';
      // property_manager rows without a presetKey are root-minted operational managers (Phase 2+); cam is the correct legacy analog — do not "symmetrize" this to board_member.
      default: return input.role === 'property_manager' ? 'cam' : 'board_member';
    }
  }
  return input.isUnitOwner ? 'owner' : 'tenant';
}
```

- [ ] **Step 4: Run to verify pass** (same command). Expected: PASS, including all pre-existing tests in the file.

- [ ] **Step 5: Rebuild + commit**

```bash
pnpm turbo run build --filter='./packages/*' --force
git add packages/shared/src/billing/permissions.ts packages/shared/__tests__/billing-permissions.test.ts
git commit -m "feat(roles): inferCanonicalRoleFromMembership reads designation before presetKey (3.2)"
```

---

### Task 3: Thread `designation` to the shim's four callers

**Files:**
- Modify: `apps/web/src/app/api/v1/billing/upgrade-requests/route.ts:44-48`
- Modify: `apps/web/src/components/billing/feature-gate.tsx:50-54`
- Modify: `apps/web/src/components/billing/feature-gate-any-of.tsx:38-42`
- Modify: `apps/web/src/lib/request/page-shell-context.ts` (interface + EMPTY + cached builder)
- Modify: `apps/web/src/app/(authenticated)/layout.tsx:66` (AppShell render)
- Modify: `apps/web/src/components/layout/app-shell.tsx:93,101,174,198` (prop pass-through)
- Modify: `apps/web/src/components/layout/app-sidebar.tsx:46,64,89`
- Test: existing suites (`apps/web/__tests__/billing/upgrade-requests-route.test.ts` and any app-shell/sidebar tests) must stay green; behavior is identical for all current data.

`CommunityMembership.designation` exists since 3.1 — server callers just forward it. The client sidebar needs the field threaded through `PageShellContext`.

- [ ] **Step 1: Server callers** — in each of the three server call sites, add the field:

`billing/upgrade-requests/route.ts`:
```ts
    const inferredCanonicalRole = inferCanonicalRoleFromMembership({
      role: membership.role,
      isUnitOwner: membership.isUnitOwner,
      presetKey: membership.presetKey ?? null,
      designation: membership.designation ?? null,
    });
```

`feature-gate.tsx` and `feature-gate-any-of.tsx` (identical shape):
```ts
  const role = inferCanonicalRoleFromMembership({
    role: membership.role,
    isUnitOwner: membership.isUnitOwner,
    presetKey: membership.presetKey ?? null,
    designation: membership.designation ?? null,
  });
```

- [ ] **Step 2: PageShellContext** — in `apps/web/src/lib/request/page-shell-context.ts`:

Add to the `PageShellContext` interface directly under `presetKey`:
```ts
  /** Board designation ('board_president' | 'board_member'); null when not on the board. */
  designation: string | null;
```
Add `designation: null,` to `EMPTY_PAGE_SHELL_CONTEXT`, and in the cached builder (next to `presetKey: membership.presetKey ?? null,`):
```ts
        designation: membership.designation ?? null,
```
If the file has a second return path that builds the context object (e.g. a PM-dashboard variant), add the same field there — TypeScript will flag every incomplete literal once the interface gains the field.

- [ ] **Step 3: Prop chain** — thread `designation` exactly like `presetKey`:

`(authenticated)/layout.tsx:66`: add `designation={designation}` to the `<AppShell …>` props (destructure `designation` from the shell context alongside `presetKey` — same source object).

`app-shell.tsx`: add `designation?: string | null;` to `AppShellProps` (next to `presetKey` at :93), destructure it in `ShellInner` (:101), and pass `designation={designation ?? null}` at BOTH AppSidebar render sites (:174 and :198).

`app-sidebar.tsx`: add `designation?: string | null;` to props (:46), default `designation = null` (:64), and:
```ts
  const canonicalRole: AnyCommunityRole | null = role
    ? inferCanonicalRoleFromMembership({ role, isUnitOwner, presetKey: presetKey ?? null, designation: designation ?? null })
    : null;
```

- [ ] **Step 4: Typecheck + targeted tests**

```bash
cd apps/web && pnpm exec tsc
cd apps/web && pnpm exec vitest run __tests__/billing/upgrade-requests-route.test.ts
```
Expected: clean tsc; tests PASS unchanged (designation is additive). If tsc flags other `PageShellContext` literal builders, complete them with `designation: null` ONLY when no membership row is in scope, else map it.

- [ ] **Step 5: Commit**

```bash
git add -A apps/web/src
git commit -m "feat(roles): thread designation to inferCanonicalRoleFromMembership callers (3.2)"
```

---

### Task 4: announcement-delivery `board_only` → designation

**Files:**
- Modify: `apps/web/src/lib/services/announcement-delivery.ts:12-15,52-64,121-123`
- Test: `apps/web/__tests__/announcements/email-delivery.test.ts`

- [ ] **Step 1: Write/adjust failing tests.** In `email-delivery.test.ts`, find the `board_only` fixtures (role rows with `presetKey: 'board_president'` etc.). Add `designation` to fixtures and add these cases (adapt to the file's existing fixture/builder style):

```ts
it('board_only matches any row with a board designation, regardless of role', async () => {
  // property_manager + designation (canonical post-0018 shape, no reliance on preset)
  // → matched; resident + designation → matched (forward-looking);
  // property_manager with neither → not matched.
});
it('board_only no longer matches a board presetKey without designation', async () => {
  // role: 'property_manager', presetKey: 'board_president', designation: null → NOT matched.
  // Deliberate: designation is the source of truth from 3.2 on (writers are in lockstep).
});
```

Write these as real assertions in the file's existing style (it already exercises `resolveRecipients` through the public entry point with mocked scoped queries) — update every existing `board_only` fixture to carry `designation` matching its preset.

- [ ] **Step 2: Run to verify the new cases fail**

Run: `cd apps/web && pnpm exec vitest run __tests__/announcements/email-delivery.test.ts`
Expected: new cases FAIL (board matching still preset-based).

- [ ] **Step 3: Implement.** In `announcement-delivery.ts`:

Replace the import + stale comment block (:12-15):
```ts
import { hasBoardDesignation } from '@propertypro/shared';
```
(Drop `MANAGER_TIER_DB_ROLES` — its only use in this file is the board_only branch. Drop the 3-line "Note: BOARD_ROLES…" comment.)

Replace `isAudienceMatch` (:52-64):
```ts
function isAudienceMatch(role: string, audience: AnnouncementAudience, opts?: { isUnitOwner?: boolean; designation?: string | null }): boolean {
  if (audience === 'all') return true;
  if (audience === 'owners_only') return role === 'resident' && opts?.isUnitOwner === true;
  if (audience === 'board_only') {
    // Phase 3.2: board targeting sources from designation (role-independent, §3.2).
    return hasBoardDesignation(opts?.designation);
  }
  if (audience === 'tenants_only') return role === 'resident' && opts?.isUnitOwner !== true;
  return false;
}
```

In the recipient loop (:121-123):
```ts
    const designation = row['designation'] as string | null | undefined;
    if (typeof userId !== 'string' || typeof role !== 'string') continue;
    if (!isAudienceMatch(role, audience, { isUnitOwner, designation })) continue;
```
(remove the `presetKey` extraction — rows are `SELECT *`'d, `designation` is already present.)

- [ ] **Step 4: vi.mock sweep + run**

```bash
grep -rln "vi.mock('@propertypro/shared'" apps/web/__tests__/ | xargs grep -ln "announcement-delivery" 
```
Add `hasBoardDesignation` to any matching factory. Then:
Run: `cd apps/web && pnpm exec vitest run __tests__/announcements/`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/services/announcement-delivery.ts apps/web/__tests__/announcements/
git commit -m "feat(roles): announcement board_only audience sources from designation (3.2)"
```

---

### Task 5: notification-service `board_only` → designation

**Files:**
- Modify: `apps/web/src/lib/services/notification-service.ts:193-211` (isRoleMatch), `:401-408` and `:799-806` (the two feeders)
- Test: `apps/web/__tests__/notifications/notification-service.test.ts`

- [ ] **Step 1: Write/adjust failing tests** — mirror Task 4: update `board_only` fixtures to carry `designation`; add "designation matches regardless of role/preset" + "preset without designation no longer matches" cases for BOTH the email recipient path and the in-app recipient path (`:799` loop).

- [ ] **Step 2: Run to verify failure**

Run: `cd apps/web && pnpm exec vitest run __tests__/notifications/notification-service.test.ts`

- [ ] **Step 3: Implement.** Import `hasBoardDesignation` from `@propertypro/shared` (keep `ADMIN_TIER_DB_ROLES` — `community_admins` is untouched; drop `MANAGER_TIER_DB_ROLES` if board_only was its only use in this file — verify with grep before removing).

`isRoleMatch` board branch (:196-203):
```ts
  if (filter === 'board_only') {
    // Phase 3.2: board targeting sources from designation (role-independent, §3.2).
    return hasBoardDesignation(opts?.designation);
  }
```
Signature: `opts?: { isUnitOwner?: boolean; designation?: string | null }`.

Both feeders (:404-408 and :802-806): replace
```ts
    const presetKey = row['presetKey'] as string | undefined;
```
with
```ts
    const designation = row['designation'] as string | null | undefined;
```
and pass `{ isUnitOwner, designation }`.

- [ ] **Step 4: vi.mock sweep + run** (as Task 4, for files exercising notification-service). Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/services/notification-service.ts apps/web/__tests__/notifications/
git commit -m "feat(roles): notification board_only recipients source from designation (3.2)"
```

---

### Task 6: Public §718 board roster → designation (STATUTORY — verify carefully)

**Files:**
- Modify: `apps/web/src/lib/db/public-community-reader.ts:341-379`
- Test: `apps/web/__tests__/lib/db/public-community-reader.test.ts`

- [ ] **Step 1: Write/adjust failing tests.** Update roster fixtures/assertions: the where-clause should filter on `designation` (the test file mocks the drizzle chain or filter ops — assert the new filter shape per the file's existing style); title fallback derives from `designation`. Add: a row with designation and NO preset appears with the right title; a resident-role row with designation appears (forward-looking).

- [ ] **Step 2: Run to verify failure**

Run: `cd apps/web && pnpm exec vitest run __tests__/lib/db/public-community-reader.test.ts`

- [ ] **Step 3: Implement.** Imports: add `BOARD_DESIGNATIONS, isBoardPresident` from `@propertypro/shared`; remove `MANAGER_TIER_DB_ROLES` IF its only use in this file is this where-clause (grep first — if used elsewhere, keep).

The board query (:342-360) becomes:
```ts
        opts.showBoard
          ? db
            .select({
              fullName: users.fullName,
              displayTitle: userRoles.displayTitle,
              designation: userRoles.designation,
            })
            .from(userRoles)
            .innerJoin(users, eq(users.id, userRoles.userId))
            .where(
              and(
                eq(userRoles.communityId, communityId),
                // Phase 3.2 (§3.2): the statutory board IS the set of designation
                // holders, regardless of role. presetKey is no longer consulted.
                inArray(userRoles.designation, [...BOARD_DESIGNATIONS]),
                isNull(users.deletedAt),
              ),
            )
            .orderBy(asc(userRoles.displayTitle), asc(users.fullName))
          : Promise.resolve([]),
```

Title fallback (:377):
```ts
          title: row.displayTitle ?? (isBoardPresident(row.designation) ? 'Board President' : 'Board Member'),
```

- [ ] **Step 4: Run + sweep.** Tests PASS; also run the public-site page tests if any reference this reader (`grep -rln "public-community-reader" apps/web/__tests__/`).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/db/public-community-reader.ts apps/web/__tests__/lib/db/
git commit -m "feat(roles): public §718 board roster sources from designation (3.2)"
```

---

### Task 7: access-request notify → PM-scope OR president-designation

**Files:**
- Modify: `apps/web/src/lib/services/access-request-service.ts:236-244`
- Test: `apps/web/__tests__/access-requests/service.test.ts`

- [ ] **Step 1: Write/adjust failing tests.** Recipient-set cases: PM-scope rows always notified (unchanged); a row with `designation: 'board_president'` notified regardless of role/preset; `designation: 'board_member'` NOT notified by the designation arm; a `presetKey: 'cam'` / `presetKey: 'board_president'` row WITHOUT designation no longer notified via preset (in prod such rows are `property_manager` → still notified via the role arm — assert that combination too).

- [ ] **Step 2: Run to verify failure**

Run: `cd apps/web && pnpm exec vitest run __tests__/access-requests/service.test.ts`

- [ ] **Step 3: Implement.** Import `isBoardPresident` from `@propertypro/shared`. Replace the filter (:236-244):

```ts
  // Phase 3.2 (§3.2): president arm sources from designation; the dead 'cam'
  // preset arm is dropped (cam-preset rows are property_manager → role arm).
  const adminRoles = roleRows.filter((r) => {
    return (
      (PM_SCOPE_DB_ROLES as readonly string[]).includes(r['role'] as string) ||
      isBoardPresident(r['designation'])
    );
  });
```

- [ ] **Step 4: vi.mock sweep + run.** Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/services/access-request-service.ts apps/web/__tests__/access-requests/
git commit -m "feat(roles): access-request notify president arm sources from designation (3.2)"
```

---

### Task 8: billing-upgrade recipients → designation president arm

**Files:**
- Modify: `apps/web/src/lib/services/billing-upgrade-requests-service.ts`
- Test: `apps/web/__tests__/billing/upgrade-requests-route.test.ts` (service is exercised through the route)

- [ ] **Step 1: Write/adjust failing tests.** Cases: PM-scope row → recipient; manager-tier + `designation: 'board_president'` (no preset) → recipient; legacy `manager` + `presetKey: 'cam'` (no designation) → recipient (bilingual arm retained); manager-tier + `presetKey: 'board_president'` + NO designation → NOT a recipient anymore; `designation: 'board_member'` → not a recipient (board members request, not manage).

- [ ] **Step 2: Run to verify failure**

Run: `cd apps/web && pnpm exec vitest run __tests__/billing/upgrade-requests-route.test.ts`

- [ ] **Step 3: Implement.** Replace the preset set + loop body:

```ts
import { createScopedClient, userRoles } from '@propertypro/db';
import { isBoardPresident, MANAGER_TIER_DB_ROLES, PM_SCOPE_DB_ROLES } from '@propertypro/shared';
```
Delete `BILLING_ADMIN_PRESETS`. Loop body becomes:
```ts
  for (const row of candidateRows) {
    const role = String(row['role']);
    const presetKey = typeof row['presetKey'] === 'string' ? row['presetKey'] : '';
    const recipientId = typeof row['userId'] === 'string' ? row['userId'] : null;
    if (!recipientId) continue;
    if (recipientId === excludeUserId) continue;
    // BILINGUAL (role-v3): collapse to v3-only at Phase 4 cleanup.
    // Phase 3.2: the president arm sources from designation; the 'cam' preset
    // arm survives only for hypothetical legacy manager rows and dies in 3.3.
    if ((PM_SCOPE_DB_ROLES as readonly string[]).includes(role)) {
      recipientIds.add(recipientId);
    } else if (
      (MANAGER_TIER_DB_ROLES as readonly string[]).includes(role) &&
      (isBoardPresident(row['designation']) || presetKey === 'cam')
    ) {
      recipientIds.add(recipientId);
    }
  }
```
Update the docblock (:14-26) to describe the new predicate.

- [ ] **Step 4: vi.mock sweep + run.** Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/services/billing-upgrade-requests-service.ts apps/web/__tests__/billing/
git commit -m "feat(roles): billing-upgrade recipients president arm sources from designation (3.2)"
```

---

### Task 9: welcome-screen display role → designation-first

**Files:**
- Modify: `apps/web/src/app/(authenticated)/welcome/page.tsx:77-106,190-194`
- Test: `apps/web/__tests__/app/welcome/page.test.ts`

- [ ] **Step 1: Write/adjust failing tests.** `resolveEffectiveDisplayRole` is module-private — test through the page per the file's existing style. Cases: membership `property_manager` + `designation: 'board_president'` + `presetKey: null` → board_president card; designation `board_member` beats `presetKey: 'cam'`; no designation + `presetKey: 'board_member'` → board_member (fallback); `property_manager` + neither → cam (unchanged default).

- [ ] **Step 2: Run to verify failure**

Run: `cd apps/web && pnpm exec vitest run __tests__/app/welcome/page.test.ts`

- [ ] **Step 3: Implement.** Import `hasBoardDesignation` from `@propertypro/shared`. Change resolver signature + board lines — return the designation VALUE (no new literals in this guard-scanned file):

```ts
function resolveEffectiveDisplayRole(
  role: string,
  presetKey: string | undefined,
  isUnitOwner: boolean,
  designation?: string | null,
): string {
  if (role === 'pm_admin' || role === 'root_manager') return 'property_manager_admin';
  if (role === 'manager' || role === 'property_manager') {
    // Phase 3.2: designation is the source of truth for the board distinction;
    // presetKey lines below are the bilingual fallback (die in Phase 4).
    if (hasBoardDesignation(designation)) return designation;
    if (presetKey === 'board_president') return 'board_president';
    if (presetKey === 'board_member') return 'board_member';
    if (presetKey === 'cam') return 'cam';
    if (presetKey === 'site_manager') return 'site_manager';
    return 'cam'; // Default manager display
  }
  if (role === 'resident') {
    return isUnitOwner ? 'owner' : 'tenant';
  }
  return role;
}
```

Call site (:190):
```ts
  const effectiveRole = resolveEffectiveDisplayRole(
    membership.role,
    membership.presetKey,
    membership.isUnitOwner,
    membership.designation ?? null,
  );
```

- [ ] **Step 4: Run + commit**

```bash
cd apps/web && pnpm exec vitest run __tests__/app/welcome/
git add "apps/web/src/app/(authenticated)/welcome/page.tsx" apps/web/__tests__/app/welcome/
git commit -m "feat(roles): welcome display role reads designation first (3.2)"
```

---

### Task 10: Writer lockstep — demo seeds

**Files:**
- Modify: `packages/db/src/seed/seed-community.ts:243-267` (V2RoleMapping + mapCanonicalToV2) and `:780-820` (seedRoles SQL)
- Test: `packages/db` has no vitest harness for seeds — verification is `pnpm seed:verify` in CI + the typecheck; assert correctness via a focused review of the generated SQL (the file builds raw SQL).

Derive designation from the preset (zero new guard literals):

- [ ] **Step 1: Implement.** Import `hasBoardDesignation` from `@propertypro/shared` (check `packages/db` imports from `@propertypro/shared` elsewhere first — `grep -rn "@propertypro/shared" packages/db/src | head`; if the dependency is absent from `packages/db/package.json`, add it — but it is almost certainly present already via PresetKey/permissions imports in this very file).

In `seedRoles` (:788-796), derive and add the column:
```ts
  const values = sql.join(
    assignments.map((a) => {
      const m = mapCanonicalToV2(a.role);
      const perms =
        m.presetKey && isPresetKey(m.presetKey)
          ? JSON.stringify(getPresetPermissions(m.presetKey, communityType))
          : null;
      // Phase 3.2 writer lockstep: a board presetKey always carries the identical designation.
      const designation = m.presetKey && hasBoardDesignation(m.presetKey) ? m.presetKey : null;
      return sql`(${a.userId}, ${a.communityId}, ${m.role}, NULL, ${m.isUnitOwner}, ${perms}::jsonb, ${m.presetKey}, ${designation}, ${m.displayTitle})`;
    }),
    sql`, `,
  );
```
And in the INSERT column list add `designation` between `preset_key` and `display_title`; in the `on conflict … do update` add `designation = excluded.designation,`:
```sql
    insert into user_roles (
      user_id,
      community_id,
      role,
      unit_id,
      is_unit_owner,
      permissions,
      preset_key,
      designation,
      display_title
    )
    values ${values}
    on conflict (user_id, community_id) do update
    set role = excluded.role,
        unit_id = excluded.unit_id,
        is_unit_owner = excluded.is_unit_owner,
        permissions = excluded.permissions,
        preset_key = excluded.preset_key,
        designation = excluded.designation,
        display_title = excluded.display_title,
        updated_at = now()
```
`mapCanonicalToV2` itself is untouched (designation derives from `m.presetKey` — single source).

- [ ] **Step 2: Typecheck + build**

```bash
pnpm turbo run build --filter='./packages/*' --force
```
Expected: clean. Do NOT run seeds locally against any DB.

- [ ] **Step 3: Commit**

```bash
git add packages/db/src/seed/seed-community.ts packages/db/package.json pnpm-lock.yaml
git commit -m "feat(roles): seeds write board designation in lockstep with preset (3.2)"
```
(Drop package.json/lockfile from the add list if no dependency change was needed.)

---

### Task 11: Writer lockstep — onboarding-service + import-residents

**Files:**
- Modify: `apps/web/src/lib/services/onboarding-service.ts:115-131`
- Modify: `apps/web/src/app/api/v1/import-residents/route.ts:188-201`
- Test: `apps/web/__tests__/services/onboarding-service.test.ts`, `apps/web/__tests__/import-residents/import-residents-route.test.ts`

- [ ] **Step 1: Write failing tests.** onboarding: creating a `manager` with `presetKey: 'board_president'` inserts `designation: 'board_president'`; with `presetKey: 'cam'` inserts `designation: null`; resident inserts `designation: null`. import: a CSV `board_member` row inserts `designation: 'board_member'`; `cam`/owner rows insert null. Use the shared `BOARD_DESIGNATIONS` import (or plain strings — TEST files are not guard-scanned… verify: the guard ROOTS are `apps/web/src` etc., `__tests__` is outside `src` → literals in tests are fine).

- [ ] **Step 2: Run to verify failure**

```bash
cd apps/web && pnpm exec vitest run __tests__/services/onboarding-service.test.ts __tests__/import-residents/import-residents-route.test.ts
```

- [ ] **Step 3: Implement.**

`onboarding-service.ts` — import `hasBoardDesignation` from `@propertypro/shared`; at the insert (:121-131):
```ts
  const presetKey = role === 'manager' ? (params.presetKey ?? null) : null;
  // Phase 3.2 writer lockstep: a board presetKey always carries the identical designation.
  const designation = presetKey && hasBoardDesignation(presetKey) ? presetKey : null;
  const displayTitle = resolveDisplayTitle(role, params.isUnitOwner, params.presetKey);

  await scoped.insert(userRoles, {
    userId,
    role,
    unitId: unitId ?? null,
    isUnitOwner,
    permissions,
    presetKey,
    designation,
    displayTitle,
  });
```

`import-residents/route.ts` — import `hasBoardDesignation` from `@propertypro/shared`; at the insert (:193-201):
```ts
      await insertUserRoleForImport(communityId, {
        userId,
        role: mapped.role,
        unitId,
        isUnitOwner: mapped.isUnitOwner,
        permissions,
        presetKey: mapped.presetKey,
        // Phase 3.2 writer lockstep: board presets carry the identical designation.
        designation: mapped.presetKey && hasBoardDesignation(mapped.presetKey) ? mapped.presetKey : null,
        displayTitle: mapped.displayTitle,
      });
```
Check `insertUserRoleForImport`'s parameter type (find it via `grep -rn "insertUserRoleForImport" packages apps/web/src`) and add the optional `designation` field to its signature + INSERT if it doesn't already pass unknown fields through.

- [ ] **Step 4: vi.mock sweep + run.** Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/services/onboarding-service.ts apps/web/src/app/api/v1/import-residents/route.ts apps/web/__tests__/services/ apps/web/__tests__/import-residents/ packages/db/src
git commit -m "feat(roles): onboarding + CSV import write board designation in lockstep (3.2)"
```

---

### Task 12: Writer lockstep — admin member-PATCH

**Files:**
- Modify: `apps/admin/src/app/api/admin/communities/[id]/members/[userId]/route.ts` (PATCH handler, after the updates loop)
- Test: extend `apps/admin/__tests__/clients/community-members.test.ts` ONLY if it exercises the route; otherwise add `apps/admin/__tests__/members/member-patch-designation.test.ts` following the existing admin test style (plain createRoot/fetch-mock — apps/admin has NO react-query/RTL).

- [ ] **Step 1: Write failing tests** for the designation derivation. If the route is hard to unit-test in the admin harness (Supabase admin client), extract the pure derivation into a local exported helper and test THAT:

```ts
// in the route file, exported for tests:
export function deriveDesignationUpdate(
  presetKey: string | null | undefined,
): { designation: string | null } | null {
  if (presetKey === undefined) return null; // preset not in this PATCH — leave designation alone
  return { designation: hasBoardDesignation(presetKey) ? presetKey : null };
}
```
Tests: `undefined` → null (untouched); `'board_president'` → sets same; `'cam'` → clears; `null` → clears.

**Check first** whether Next.js route files in apps/admin tolerate extra exports (they do for non-HTTP-verb names in the app router as long as it's not `GET/POST/...` — `deriveDesignationUpdate` is fine).

- [ ] **Step 2: Run to verify failure**

Run: `cd apps/admin && pnpm exec vitest run __tests__/members/member-patch-designation.test.ts`

- [ ] **Step 3: Implement.** Import `hasBoardDesignation` from `@propertypro/shared` (verify apps/admin depends on it — `grep "@propertypro/shared" apps/admin/package.json`; it does, e.g. admin-types usage). In the PATCH handler after the updates loop:

```ts
  // Phase 3.2 writer lockstep: when this PATCH touches preset_key, designation
  // follows it (board preset ⇒ same designation; non-board/null ⇒ cleared).
  // When preset_key is absent, designation is left untouched (root-set
  // designations on rows the platform admin edits for other reasons survive).
  const designationUpdate = deriveDesignationUpdate(parsed.data.preset_key);
  if (designationUpdate) {
    updates.designation = designationUpdate.designation;
  }

  // If changing away from manager, clear preset_key and permissions
  if (parsed.data.role && parsed.data.role !== 'manager') {
    updates.preset_key = null;
    updates.permissions = null;
    updates.designation = null;
  }
```
Note the existing away-from-manager branch ALSO clears designation now (lockstep: preset cleared ⇒ designation cleared). Known accepted edge (spec §4.3): a duplicate board_president PATCH hits the partial unique index → DB error → existing 500 path surfaces it; acceptable for the internal admin tool this phase.

- [ ] **Step 4: Run + typecheck**

```bash
cd apps/admin && pnpm exec vitest run && pnpm exec tsc
```
Expected: PASS / clean.

- [ ] **Step 5: Commit**

```bash
git add apps/admin
git commit -m "feat(roles): admin member-PATCH keeps designation in lockstep with preset_key (3.2)"
```

---

### Task 13: Guard ratchet + full verification battery

**Files:**
- Modify: `scripts/verify-legacy-roles.ts:18` (FLOOR)

- [ ] **Step 1: Ratchet the floor**

```bash
pnpm exec tsx scripts/verify-legacy-roles.ts --report
```
The repoint removed board/cam literals at sites 1–5/7. Set `FLOOR` in `scripts/verify-legacy-roles.ts` to the reported TOTAL (expected: several below 254 — it MUST be ≤ 254; if it is ABOVE 254, a task added literals to a scanned file — find and route them through the helpers instead). Update the comment above FLOOR:
```ts
const FLOOR = <reported>; // 2026-06-12 (Phase 3.2): board-targeting repoint drained presetKey-board literals to designation helpers
```

- [ ] **Step 2: Full battery (every command must pass)**

```bash
pnpm turbo run build --filter='./packages/*' --force
cd apps/web && pnpm exec tsc && cd ../..
cd apps/admin && pnpm exec tsc && cd ../..
pnpm lint
pnpm guard:legacy-roles
pnpm test
```
Plus every other guard in the lint/guard battery the repo defines (`pnpm lint` runs guard:db-access; run `pnpm guard:tenant-scope guard:breadcrumbs guard:hook-requestjson guard:authz-comments guard:contracts` if they are separate scripts — check `package.json` scripts and run what exists). Contract suite runs under `pnpm test` (apps/web vitest). Do NOT run integration configs locally.

- [ ] **Step 3: Commit + push + PR**

```bash
git add scripts/verify-legacy-roles.ts
git commit -m "chore(roles): ratchet guard:legacy-roles floor after 3.2 repoint"
git push -u origin feat/role-v3-phase3.2-board-repoint
gh pr create --title "feat(roles): Phase 3.2 — board-targeting repoint (presetKey → designation)" --body "<summary per repo convention; link spec path; note behavior-neutral + prod-verified 579/579 lockstep + no migration>

🤖 Generated with [Claude Code](https://claude.com/claude-code)"
```

- [ ] **Step 4: Post-merge prod verification (read-only Supabase MCP, project vbqobyagjzvlfpfozvmx)** — after merge + Vercel deploy:

```sql
-- §718 roster equivalence: symmetric difference between old and new predicates must be 0 rows.
SELECT count(*) AS mismatches FROM user_roles
WHERE (role IN ('manager','property_manager','root_manager') AND preset_key IN ('board_president','board_member'))
   <> (designation IN ('board_president','board_member') AND designation IS NOT NULL);
```
Expected: `mismatches = 0`. Also spot-check one community's public site board section renders the same roster.

---

## Execution notes for the dispatcher

- Tasks 1→2→3 are sequential (3 depends on 2 depends on 1). Tasks 4–9 are independent of each other but all depend on Task 1 (and Task 3's tsc state) — dispatch after 3 lands. Tasks 10–12 depend only on Task 1. Task 13 is last.
- Per-task: subagent implements + self-verifies; per-task spec/quality review per superpowers:subagent-driven-development; final holistic review (code + security) before merge, as in 2c/3.1.
- Reviews: verify findings before adopting — automated reviewers have over-flagged this program (3.1's "gate bypass" was declined as non-exploitable). Decline with rationale when wrong.
