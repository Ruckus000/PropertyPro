# Phase 3.3 — Vocabulary Drain Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Drain legacy 7-role vocabulary from shim-independent code (welcome, compliance, seeds), delete dead role-set constants, drain the help/docs, and ratchet `guard:legacy-roles` — without touching permission resolution.

**Architecture:** `checkPermissionV2`, the JSONB permission read, `RBAC_MATRIX` structure, and the `inferCanonicalRoleFromMembership` shim are all UNTOUCHED. Board distinctions are sourced from `designation` via the guard-exempt helpers `hasBoardDesignation`/`isBoardPresident`/`BOARD_DESIGNATIONS` (`packages/shared/src/role-transition.ts`). Two contained, documented non-neutralities (seed end-state pre-staging; welcome cam/site_manager onboarding collapse, 50 rows) — everything else is behavior-neutral and prod-verified.

**Tech Stack:** TypeScript, Next.js 15 App Router, React, vitest, Drizzle seeds (raw SQL), MDX help content.

**Spec:** `docs/superpowers/specs/2026-06-15-role-simplification-phase3.3-vocabulary-drain-design.md`

---

## Hard rules (program discipline)

- Branch: `feat/role-v3-phase3.3-vocabulary-drain` cut from **origin/main**. Code-only PR (spec + this plan stay on the docs branch).
- **NEVER** run `db:migrate`, `seed:demo`, or the integration vitest config locally (local `DATABASE_URL` = PROD). `seed:verify` against a local DB is also forbidden; CI is the gate for seed/integration.
- `guard:legacy-roles` regex counts single-quoted `'board_member'|'board_president'|'cam'|'site_manager'|'property_manager_admin'` in `apps/web/src`, `apps/admin/src`, `packages/*/src` (.ts/.tsx only). It does NOT scan `.mdx` or `docs/`. EXEMPT: `role-transition.ts`, `billing/permissions.ts`. Use the designation helpers — never inline these literals. Floor is 241/241 (zero headroom) until Task 6 ratchets it.
- Fresh worktree: `pnpm install` then `pnpm turbo run build --filter='./packages/*' --force` before web tests, and after any `packages/*` change.
- New `@propertypro/shared` import in a module under test → add it to every `vi.mock('@propertypro/shared'…)` factory in the affected test files.
- Local `pnpm --filter @propertypro/web build` fails on `Missing DATABASE_URL` (accounting routes) — environmental; CI Build is the gate.

---

### Task 1: Delete dead role-set constants

**Files:**
- Modify: `packages/shared/src/access-policies.ts` (delete `STAFF_ROLES`, `RESIDENT_ROLES`)
- Test: `packages/shared/__tests__/access-policies.test.ts` (remove any cases referencing them)

- [ ] **Step 1: Confirm 0 importers**

Run: `grep -rn "STAFF_ROLES\|RESIDENT_ROLES" apps packages --include="*.ts" --include="*.tsx" | grep -v "access-policies.ts" | grep -v ".d.ts"`
Expected: no output (verified 2026-06-15). If ANY importer appears, STOP and report — they are not dead.

- [ ] **Step 2: Delete the two constants**

In `packages/shared/src/access-policies.ts` remove the `export const STAFF_ROLES …` block (4 lines: board_president/cam/site_manager/property_manager_admin) and the `export const RESIDENT_ROLES …` block (owner/tenant). Remove any now-unused imports they introduced. Leave `ADMIN_ROLES`, `BOARD_ROLES`, `ELEVATED_ROLES`, `RESTRICTED_ROLES`, and the private `resolveLegacyRole` untouched (still live).

- [ ] **Step 3: Remove dead test references**

In `packages/shared/__tests__/access-policies.test.ts`, delete any `describe`/`it` block that imports or asserts `STAFF_ROLES`/`RESIDENT_ROLES`. (grep the test file first.)

- [ ] **Step 4: Build + typecheck + test**

```bash
pnpm turbo run build --filter='./packages/*' --force
cd packages/shared && pnpm exec vitest run __tests__/access-policies.test.ts
```
Expected: build clean (proves 0 importers), tests pass. This drains the 2 `STAFF_ROLES` board literals (`board_president`, `property_manager_admin`, `cam`, `site_manager` = 4) from access-policies.ts.

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/access-policies.ts packages/shared/__tests__/access-policies.test.ts
git commit -m "refactor(roles): delete dead STAFF_ROLES/RESIDENT_ROLES constants (3.3)"
```

---

### Task 2: Compliance command center → designation/isAdmin

**Files:**
- Modify: `apps/web/src/components/compliance/compliance-command-center.tsx:21-46` (props + `CAM_LIKE_ROLES`/`BOARD_LIKE_ROLES`/`defaultViewForRole`/`showToggle`)
- Modify: `apps/web/src/app/(authenticated)/communities/[id]/compliance/page.tsx:50` (render call — pass `isAdmin` + `designation`)
- Test: `apps/web/src/components/compliance/__tests__/compliance-command-center.test.tsx` (re-key the ~20 invocations off `role="cam"` onto the new props)

**Neutral mapping (verified):** today `defaultView='board'` ⇔ role ∈ {board_president, board_member}; `showToggle` ⇔ role ∈ {board roles ∪ cam ∪ site_manager ∪ manager-tier ∪ pm}. Replace with: board view ⇔ `hasBoardDesignation(designation)`; toggle shown ⇔ `isAdmin || hasBoardDesignation(designation)`. Prod: all board rows have designation → board view (same); all property_managers are admin → toggle (same); residents → no toggle (same).

- [ ] **Step 1: Update the test invocations (RED)**

In `compliance-command-center.test.tsx`, replace the prop shape. The component will take `{ communityId, isAdmin, designation, canWrite }` instead of `{ communityId, role, canWrite }`. Map the existing fixtures:
- `role="cam"` → `isAdmin={true} designation={null}` (manager, cam view, toggle shown)
- `role="manager"` → `isAdmin={true} designation={null}`
- `role="owner"` → `isAdmin={false} designation={null}` (resident, no toggle)
Add two new cases: `isAdmin={true} designation="board_president"` and `designation="board_member"` → default board view + toggle shown. Import `BOARD_DESIGNATIONS` is not needed in the test (use the literal designation strings — `__tests__` is NOT guard-scanned).

Run: `cd apps/web && pnpm exec vitest run src/components/compliance/__tests__/compliance-command-center.test.tsx`
Expected: FAIL (component still expects `role`).

- [ ] **Step 2: Re-key the component (GREEN)**

In `compliance-command-center.tsx`:
- Add import: `import { hasBoardDesignation, type BoardDesignation } from '@propertypro/shared';`
- Change props interface to:
```ts
export interface ComplianceCommandCenterProps {
  communityId: number;
  isAdmin: boolean;
  designation: BoardDesignation | null;
  canWrite: boolean;
}
```
- Delete `CAM_LIKE_ROLES`, `BOARD_LIKE_ROLES`, and the stale comment block (lines ~30-38).
- Replace the helpers:
```ts
function defaultView(designation: BoardDesignation | null): ViewMode {
  return hasBoardDesignation(designation) ? 'board' : 'cam';
}

function showToggle(isAdmin: boolean, designation: BoardDesignation | null): boolean {
  return isAdmin || hasBoardDesignation(designation);
}
```
- Update the destructure + the two call sites (`defaultView(designation)`, `showToggle(isAdmin, designation)`). The `showToggle` result still gates rendering the toggle exactly as before.

- [ ] **Step 3: Update the page render**

In `compliance/page.tsx`, the page already has the membership. Replace `role={…}` with `isAdmin={membership.isAdmin}` and `designation={membership.designation}`. (Confirm the membership variable name in the file; it resolves via `requirePageCommunityMembership` and carries both fields since 3.1/3.2.)

- [ ] **Step 4: Verify**

```bash
cd apps/web && pnpm exec vitest run src/components/compliance/__tests__/compliance-command-center.test.tsx && pnpm exec tsc
```
Expected: PASS + clean. Drains the 5 counted literals in this file (`board_president`, `board_member`, `cam`, `property_manager_admin`, `site_manager`).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/compliance/ "apps/web/src/app/(authenticated)/communities/[id]/compliance/page.tsx"
git commit -m "refactor(roles): compliance command center view-mode from designation (3.3)"
```

---

### Task 3: Welcome display + checklist → v3 role + designation

**Files:**
- Modify: `apps/web/src/components/onboarding/welcome-screen.tsx:19-98` (props + 3 helpers)
- Modify: `apps/web/src/app/(authenticated)/welcome/page.tsx` (delete `resolveEffectiveDisplayRole`; pass `role`+`designation`+`isUnitOwner`)
- Modify: `apps/web/src/lib/services/onboarding-checklist-service.ts:65-95` (`getItemKeysForRole` signature + body)
- Test: `apps/web/__tests__/components/onboarding/welcome-screen.test.tsx`, `apps/web/__tests__/components/onboarding/welcome-snapshot-cards.test.tsx`, `apps/web/__tests__/app/welcome/page.test.ts`, and the onboarding-checklist-service test (find via `grep -rln getItemKeysForRole apps/web/__tests__`)

**Documented non-neutrality (spec §4.1 task 3):** distinguishing cam from site_manager needs `presetKey` (a counted literal), so the drain collapses them to the v3 "Property Manager". Effects, onboarding-only, no permission/data change: cam(2)+site_manager(48) greeting label → "Property Manager"; site_manager(48) checklist flips owner/tenant→admin. cardCategory + subtext + every non-site_manager cohort verified neutral.

- [ ] **Step 1: Re-key `getItemKeysForRole` test (RED)**

In the onboarding-checklist-service test, change the signature to `getItemKeysForRole(role, designation, isUnitOwner, communityType)` and assert this neutral-plus-documented mapping:
- `isBoardPresident`-equivalent (`designation==='board_president'`) → admin items (ADMIN_CONDO/APARTMENT_ITEMS)
- `designation==='board_member'` → `BOARD_MEMBER_ITEMS`
- `role==='root_manager'`, no designation → admin + `PM_ADMIN_ITEMS`
- `role` manager-tier (`property_manager`/`manager`), no designation → admin items
- `role==='resident'` (either `isUnitOwner`) → `OWNER_TENANT_ITEMS`
Add an explicit DOCUMENTED case asserting a former site_manager (now `property_manager`, no designation) → admin items (the intentional flip).

Run the test file: expect FAIL.

- [ ] **Step 2: Re-key `getItemKeysForRole` (GREEN)**

```ts
import { BOARD_DESIGNATIONS, PM_SCOPE_DB_ROLES, MANAGER_TIER_DB_ROLES, type BoardDesignation } from '@propertypro/shared';

export function getItemKeysForRole(
  role: string,
  designation: BoardDesignation | null,
  isUnitOwner: boolean,
  communityType: CommunityType,
): readonly ChecklistItemKey[] {
  const adminBase = communityType === 'apartment' ? ADMIN_APARTMENT_ITEMS : ADMIN_CONDO_ITEMS;
  // Board member: the one designation with a distinct (reduced) onboarding set.
  if (designation === 'board_member') return BOARD_MEMBER_ITEMS;
  // Board president gets the full admin set (matches pre-drain behavior).
  if (designation === 'board_president') return adminBase;
  // root_manager (PM-scope) additionally gets customize_portal.
  if (role === 'root_manager') return [...adminBase, ...PM_ADMIN_ITEMS];
  // Any other manager-tier row → admin base. (NOTE: former site_manager rows,
  // now property_manager with no designation, resolve here — documented 3.3 flip.)
  if ((MANAGER_TIER_DB_ROLES as readonly string[]).includes(role)) return adminBase;
  // resident (owner/tenant)
  return OWNER_TENANT_ITEMS;
}
```
Keep the existing item-set constants. Remove the old bilingual comment + legacy alias branches. (`PM_SCOPE_DB_ROLES` import may be unused now — drop it if so; `pm_admin` rows are 0 and `pm_admin` is in PM_SCOPE but the welcome path never produced PM_ADMIN_ITEMS for non-root, so omitting it is the neutral choice for the 211 ex-pm_admin property_managers.)

- [ ] **Step 3: Re-key welcome-screen helpers (RED first — update its test)**

Change `WelcomeScreenProps`: replace `role: string` with `role: string` (v3) + `designation: BoardDesignation | null` + `isUnitOwner: boolean`. Rewrite the three helpers:
```ts
import { hasBoardDesignation, isBoardPresident, MANAGER_TIER_DB_ROLES, PM_SCOPE_DB_ROLES, type BoardDesignation } from '@propertypro/shared';

function isManagerTier(role: string): boolean {
  return (MANAGER_TIER_DB_ROLES as readonly string[]).includes(role)
    || (PM_SCOPE_DB_ROLES as readonly string[]).includes(role);
}

function getRoleGreeting(role: string, designation: BoardDesignation | null, isUnitOwner: boolean): string {
  if (isBoardPresident(designation)) return 'Board President';
  if (hasBoardDesignation(designation)) return 'Board Member';
  if (isManagerTier(role)) return 'Property Manager';     // collapses cam/site_manager (documented)
  if (role === 'resident') return isUnitOwner ? 'Owner' : 'Tenant';
  return 'Member';
}

function getRoleSubtext(role: string, designation: BoardDesignation | null, isUnitOwner: boolean, communityName: string): string {
  if (hasBoardDesignation(designation)) return `Here is a snapshot of ${communityName} to get you started.`;
  if (isManagerTier(role)) return `Here is an overview of ${communityName} for your review.`;
  if (role === 'resident' && isUnitOwner) return `Here is what is happening at ${communityName}.`;
  if (role === 'resident') return `Here are some helpful resources for living at ${communityName}.`;
  return `Here is your community at a glance.`;
}

function getCardCategory(role: string, designation: BoardDesignation | null, isUnitOwner: boolean): 'owner' | 'board' | 'tenant' {
  if (hasBoardDesignation(designation) || isManagerTier(role)) return 'board';
  if (role === 'resident') return isUnitOwner ? 'owner' : 'tenant';
  return 'owner';
}
```
Update the component body to call them with `(role, designation, isUnitOwner)` / `(…, community.name)`. Update `welcome-screen.test.tsx` + `welcome-snapshot-cards.test.tsx` to pass the new props and assert: board_president→"Board President"+board cards; board_member→"Board Member"+board cards; property_manager(no designation)→"Property Manager"+board cards+overview; resident owner→"Owner"+owner cards; resident tenant→"Tenant"+tenant cards.

- [ ] **Step 4: Update the welcome page (delete the local shim)**

In `welcome/page.tsx`: delete `resolveEffectiveDisplayRole` entirely. Replace the `effectiveRole` computation + the `getItemKeysForRole(effectiveRole, …)` call + the `<WelcomeScreen role={effectiveRole} … />` with direct passing:
```ts
const itemKeys = getItemKeysForRole(membership.role, membership.designation, membership.isUnitOwner, membership.communityType);
…
<WelcomeScreen
  role={membership.role}
  designation={membership.designation}
  isUnitOwner={membership.isUnitOwner}
  …
/>
```
Update `apps/web/__tests__/app/welcome/page.test.ts` accordingly (it currently asserts the resolver output — assert the passed props / element shape instead).

- [ ] **Step 5: vi.mock sweep + verify**

```bash
grep -rln "vi.mock('@propertypro/shared'" apps/web/__tests__ | xargs grep -l "welcome\|onboarding-checklist" 2>/dev/null
cd apps/web && pnpm exec vitest run __tests__/components/onboarding/ __tests__/app/welcome/ && pnpm exec tsc
```
Add `hasBoardDesignation`/`isBoardPresident`/`MANAGER_TIER_DB_ROLES`/`PM_SCOPE_DB_ROLES`/`BOARD_DESIGNATIONS` to any breaking `@propertypro/shared` mock factory. Expected: PASS + clean. Drains welcome-screen (17) + welcome/page (11) + checklist-service literals.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/components/onboarding/welcome-screen.tsx "apps/web/src/app/(authenticated)/welcome/page.tsx" apps/web/src/lib/services/onboarding-checklist-service.ts apps/web/__tests__/components/onboarding/ apps/web/__tests__/app/welcome/ apps/web/__tests__/services/
git commit -m "refactor(roles): welcome display + onboarding checklist from designation/v3 role (3.3)

cam/site_manager greeting collapses to Property Manager; site_manager onboarding
checklist flips to the admin set (50 rows, onboarding-only, end-state-aligned)."
```

---

### Task 4: Full seed drain to v3 vocabulary

**Files:**
- Modify: `packages/db/src/seed/seed-community.ts` (`SeedUserConfig.role` union :53, `mapCanonicalToV2` :251-267, `ANNOUNCEMENT_AUTHOR_ROLES` :270, `seedRoles` :782-820, the `:1697` cast)
- Modify: `scripts/seed-demo.ts` (demo user role assignments using the legacy union)
- Test/verify: `pnpm seed:verify` (CI only), integration fixtures that assert seeded role/preset shapes

**Approach (spec §3.4 — intentional end-state pre-staging):** seeded rows model the v3 end state — `property_manager` (uniform) + `designation` (from `BOARD_DESIGNATIONS`), no `presetKey`, perms resolved via the matrix-fallback (null perms). Keep the human-readable demo INPUT vocabulary but map it to v3 storage.

- [ ] **Step 1: Redefine the seed role vocabulary (no counted literals)**

Replace `SeedUserConfig.role` (:53) with a v3-facing shape that splits the board distinction onto `designation` so NO counted literal appears in `seed-community.ts`/`scripts`:
```ts
import { BOARD_DESIGNATIONS, type BoardDesignation } from '@propertypro/shared';

export interface SeedUserConfig {
  email: string;
  fullName: string;
  phone?: string;
  role: 'owner' | 'tenant' | 'property_manager';   // none of these are counted literals
  designation?: BoardDesignation;                    // BOARD_DESIGNATIONS[0|1], never inlined
}
```
Demo defs express a board president as `{ role: 'property_manager', designation: BOARD_DESIGNATIONS[0] }` and a board member as `{ ..., designation: BOARD_DESIGNATIONS[1] }` (confirm the index↔value order in `role-transition.ts` at implementation; `BOARD_DESIGNATIONS = ['board_president','board_member']`). Former cam/site_manager/property_manager_admin users become plain `{ role: 'property_manager' }` with no designation. This is the binding constraint: **zero new counted literals in scanned src** — every board value flows from `BOARD_DESIGNATIONS`.

- [ ] **Step 2: Rewrite `mapCanonicalToV2` → `mapSeedRoleToStorage`**

Replace the legacy switch (:251-267) with a v3 mapping that emits `{ role, isUnitOwner, designation }` and NO `presetKey`/preset-derived perms:
- owner → `{ role:'resident', isUnitOwner:true, designation:null }`
- tenant → `{ role:'resident', isUnitOwner:false, designation:null }`
- board_president → `{ role:'property_manager', isUnitOwner:false, designation: BOARD_DESIGNATIONS[<president idx>] }`
- board_member → `{ role:'property_manager', isUnitOwner:false, designation: BOARD_DESIGNATIONS[<member idx>] }`
- property_manager (was cam/site_manager/property_manager_admin) → `{ role:'property_manager', isUnitOwner:false, designation:null }`
Reference designation values through `BOARD_DESIGNATIONS` (guard-exempt), never inline.

- [ ] **Step 3: Update `seedRoles` SQL**

In `seedRoles` (:782-820): drop the `preset_key` and `permissions` columns from the INSERT (or write `NULL`), write `designation` from the mapping, set `display_title` from a small local map (no preset). Seeded managers now resolve perms via `checkPermissionV2`'s matrix-fallback (null perms → full operational), which is the end-state shape. Update `ANNOUNCEMENT_AUTHOR_ROLES` (:270) + the `:1697` cast to the new vocabulary.

- [ ] **Step 4: Update `scripts/seed-demo.ts`**

Replace legacy role assignments in the demo community definitions with the new vocabulary (board members as `property_manager`+designation; cam/site/pm as `property_manager`). Keep the same PEOPLE/structure so demos look identical.

- [ ] **Step 5: Update integration fixtures + verify (CI-gated)**

Grep `apps/web/__tests__/integration/` and `apps/web/__tests__/fixtures/` for assertions on seeded `role`/`presetKey` shapes; update them to expect `role:'property_manager'` + `designation` + null preset. Do NOT run `seed:verify`/`seed:demo`/integration locally (prod DB). Typecheck + build:
```bash
pnpm turbo run build --filter='./packages/*' --force && cd apps/web && pnpm exec tsc
```
Expected: clean. `seed:verify` + integration run in CI.

- [ ] **Step 6: Commit**

```bash
git add packages/db/src/seed/seed-community.ts scripts/seed-demo.ts apps/web/__tests__/
git commit -m "refactor(roles): seeds emit v3 end-state shape (property_manager+designation) (3.3)

Drops presetKey/preset-perms from seeds; seeded managers resolve via the
matrix-fallback. Seeded envs model the end state (uniform); prod unchanged."
```

---

### Task 5: Help MDX + ADR + docs drain

**Files:**
- Modify: the 39 help MDX files under `apps/web/src/content/help/**` that mention legacy roles (enumerate: `grep -rln "board_president\|board_member\|property_manager_admin\|site_manager\|\bcam\b" apps/web/src/content/help`)
- Create/Modify: a superseding ADR under `docs/adr/` (supersedes ADR-001, which was "Proposed")
- Modify: `docs/RBAC_MATRIX.md`

**Note:** `.mdx` and `docs/` are NOT guard-scanned, so this drains 0 guard literals — it is documentation accuracy. Pattern, applied per file:

- [ ] **Step 1: Establish the vocabulary mapping**

Document the replacement once (and reuse): "board president" / "board member" stay as **designations**; "CAM" / "site manager" / "property manager admin" → **property manager**; "owner" / "tenant" → **resident** (owner/tenant as a unit-ownership attribute). Where help text describes *who can do X*, phrase by capability (board/manager/resident), matching the 3-role model.

- [ ] **Step 2: Drain the 39 MDX files**

For each file from the grep, replace legacy role references per the Step-1 mapping, preserving meaning. Representative files: `apps/web/src/content/help/meetings/creating-meeting-notices.mdx`, `…/finance/creating-and-tracking-assessments.mdx`, `…/forum/using-the-board-forum.mdx`, `…/apartment/managing-leases.mdx`. Keep front-matter and structure intact.

- [ ] **Step 3: Superseding ADR + RBAC_MATRIX doc**

Write `docs/adr/NNNN-root-manager-role-model.md` (next number in sequence) marking ADR-001 superseded and stating the 3-role model (root_manager / property_manager / resident + board designation). Update `docs/RBAC_MATRIX.md` to describe 3 roles × 3 community types + the designation gate.

- [ ] **Step 4: Verify help build**

Run the help-content guard if present: `pnpm guard:help-content`. Expected: pass. (No code tests; this is content.)

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/content/help docs/adr docs/RBAC_MATRIX.md
git commit -m "docs(roles): drain legacy role vocabulary from help center + ADR + RBAC doc (3.3)"
```

---

### Task 6: Guard ratchet + full battery + PR

**Files:**
- Modify: `scripts/verify-legacy-roles.ts` (FLOOR)

- [ ] **Step 1: Ratchet the floor**

```bash
pnpm exec tsx scripts/verify-legacy-roles.ts --report
```
Set `FLOOR` to the reported TOTAL (expected ≈ 241 − [Task1 4 + Task2 5 + Task3 ~28 + checklist-service]) — confirm it is the real reported number, not estimated. Add a dated comment line explaining the 3.3 drain. If TOTAL is unexpectedly high, a task added a literal — find and route it through the helpers.

- [ ] **Step 2: Full battery**

```bash
pnpm turbo run build --filter='./packages/*' --force
cd apps/web && pnpm exec tsc && cd ../..
cd apps/admin && pnpm exec tsc && cd ../..
pnpm lint
pnpm guard:legacy-roles
pnpm test
```
Plus the rest of the guard battery present in `package.json` (`guard:tenant-scope`, `guard:breadcrumbs`, `guard:hook-requestjson`, `guard:authz-comments`, `guard:contracts`, `guard:help-content`, …). The 3 known local collect-fails (`site-page`, `esign-my-pending`, `calendar-event-reminder-service`) are the `Missing DATABASE_URL` env limitation — CI is the gate; do NOT run integration configs locally.

- [ ] **Step 3: Commit + push + PR**

```bash
git add scripts/verify-legacy-roles.ts
git commit -m "chore(roles): ratchet guard:legacy-roles floor after 3.3 drain"
git push -u origin feat/role-v3-phase3.3-vocabulary-drain
gh pr create --title "feat(roles): Phase 3.3 — behavior-neutral vocabulary drain" --body "<summary; link spec; note: permission resolution untouched; two documented non-neutralities (seed end-state pre-staging; welcome cam/site_manager onboarding collapse, 50 rows); guard floor ratcheted>

🤖 Generated with [Claude Code](https://claude.com/claude-code)"
```

- [ ] **Step 4: Post-merge — confirm CI integration + seed jobs green**

The seed (Task 4) and integration-fixture changes are validated by CI's `integration-tests` + any seed-verify job, not locally. Confirm green on the PR before/after merge.

---

## Execution notes for the dispatcher

- Tasks are independent and can each be their own small PR, OR one PR with per-task commits + per-task spec/quality review (the 3.1/3.2 pattern). Task 6 is last.
- **Task 3 and Task 4 carry the documented non-neutralities** — give their reviews extra scrutiny and keep the prod-impact notes in the commit messages.
- Verify review findings before adopting — automated reviewers have over-flagged this program. Decline with rationale when wrong.
- The widening, root-only billing/deletion, `roles:write`, shim deletion, and structural-matrix literals are explicitly OUT (spec §6) — do not let scope creep pull them in.
