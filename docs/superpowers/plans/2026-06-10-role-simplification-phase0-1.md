# Role Simplification — Phase 0 + Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Land the additive foundations of the root-manager role simplification — prod verification, migrations 0014–0016 (new enum values, designation column, partial unique indexes, bilingual RLS), the bilingual code window (SQL predicates + app-layer role branches accept both role generations), the extended compat shim, and the `guard:legacy-roles` CI floor — with **zero behavior change**.

**Architecture:** Expand/contract on the `user_role_v2` enum. Phase 1 *expands*: new values `property_manager`/`root_manager` coexist with `manager`/`pm_admin`, and every role predicate matches both generations via shared transition constants. The Phase 2 backfill (separate plan) only becomes safe once everything here is deployed AND applied to prod. Spec: `docs/superpowers/specs/2026-06-10-root-manager-role-simplification-design.md`.

**Tech Stack:** Drizzle ORM + drizzle-kit migrations, PostgreSQL (Supabase), Next.js 15 / TypeScript, Vitest, tsx guard scripts.

---

## Program roadmap (this is Plan 1 of 4)

| Plan | Scope | Status |
|---|---|---|
| **1 (this)** | Phase 0 verify + Phase 1 foundations/bilingual window | ready |
| 2 | Phase 2: backfill migration + claim-root UX + role-management UI | write after Plan 1 lands |
| 3 | Phase 3: vocabulary drain (RBAC matrix, constants, UI, tests, MDX, admin app) | write after Plan 2 |
| 4 | Phase 4: enum rebuild, drop presetKey/permissions/legacyRole, shim deletion, guard→forbid | write after Plan 3 |

## PR & deploy-gate map

| PR | Contents | Tasks | Merge gate |
|---|---|---|---|
| PR-A | Phase 0 audit doc + stale rule fix | 1 | none |
| PR-B | Migrations 0014/0015/0016 + schema TS | 2–4 | normal CI |
| **PROD APPLY** | Manually apply 0014/0015/0016 to prod (pipeline does NOT migrate) | 5 | after PR-B merges |
| PR-C | Transition constants, shim, app-layer + SQL bilingual sweep, tests | 6–10 | **must NOT merge until Task 5 prod-apply is confirmed** — its deployed queries emit `'property_manager'`/`'root_manager'` enum literals |
| PR-D | `guard:legacy-roles` + floor | 11 | after PR-C merges (floor counts PR-C's final state) |

⚠️ Vercel preview deployments use the prod database. Do not exercise PR-C preview routes until Task 5 is done.

## File structure

```
docs/audits/phase0-role-simplification-prod-verify-2026-06-10.md   # NEW: Phase 0 evidence
.claude/rules/migration-safety.md                                   # FIX: stale ledger numbers
packages/db/src/schema/enums.ts                                     # +2 enum values
packages/db/src/schema/user-roles.ts                                # +designation, +2 partial unique indexes
packages/db/migrations/0014_*.sql, 0015_*.sql, 0016_*.sql           # generated + custom
packages/shared/src/role-transition.ts                              # NEW: transition constants + filter expander
packages/shared/src/index.ts                                        # export barrel line
packages/shared/src/billing/permissions.ts                          # shim extension
packages/shared/__tests__/role-transition.test.ts                   # NEW
packages/shared/__tests__/billing-permissions.test.ts               # extend
apps/web/src/lib/utils/community-validators.ts                      # requireNewCommunityRole → TRANSITION_ROLES
apps/web/src/lib/db/access-control.ts                               # checkPermissionV2 bilingual
apps/web/src/lib/api/community-membership.ts                        # isAdmin + permissions normalization bilingual
apps/web/src/lib/api/role-guard.ts                                  # ROLE_ALIASES + hasRole bilingual
apps/web/src/lib/api/community-context.ts                           # PM-dashboard role check bilingual
packages/db/src/queries/pm-portfolio.ts                             # SQL sweep (2 sites)
apps/web/src/lib/services/{provisioning-service,payment-alert-scheduler,resident-service,demo-conversion,account-lifecycle-service,site-portfolio-template-service}.ts
apps/web/src/lib/db/public-community-reader.ts                      # SQL sweep
apps/web/src/lib/billing/{downgrade-notifications,billing-group-service}.ts
scripts/verify-legacy-roles.ts                                      # NEW guard
package.json                                                        # guard wiring
```

---

### Task 1: Phase 0 — prod verification + stale-doc fix (PR-A)

**Files:**
- Create: `docs/audits/phase0-role-simplification-prod-verify-2026-06-10.md`
- Modify: `.claude/rules/migration-safety.md`

- [ ] **Step 1: Run the five read-only verification queries against prod** (Supabase MCP `execute_sql`, project `vbqobyagjzvlfpfozvmx`). Record each result verbatim.

```sql
-- Q1: enum values actually present in prod
SELECT e.enumlabel FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
WHERE t.typname = 'user_role_v2' ORDER BY e.enumsortorder;
-- EXPECT: resident, manager, pm_admin (exactly 3; if property_manager/root_manager already exist, STOP and reconcile)

-- Q2: user_roles columns
SELECT column_name, data_type, is_nullable FROM information_schema.columns
WHERE table_name = 'user_roles' ORDER BY ordinal_position;
-- EXPECT: id, user_id, community_id, role, unit_id, created_at, is_unit_owner, permissions, preset_key, display_title, legacy_role, updated_at — and NO designation column

-- Q3: role/preset distribution
SELECT role, preset_key, count(*) FROM user_roles GROUP BY 1, 2 ORDER BY 1, 2;

-- Q4: board_president designation-collision count (feeds Plan 2's dedup)
SELECT community_id, count(*) AS presidents FROM user_roles
WHERE preset_key = 'board_president' GROUP BY 1 HAVING count(*) > 1;

-- Q5: applied-migration ledger tail + orphaned legacy enum type
SELECT * FROM drizzle.__drizzle_migrations ORDER BY id DESC LIMIT 5;
SELECT t.typname FROM pg_type t WHERE t.typname IN ('user_role', 'user_role_v2');
```

- [ ] **Step 2: Write the audit doc** at `docs/audits/phase0-role-simplification-prod-verify-2026-06-10.md` with sections: Queries Run, Results (verbatim), Verdict (prod matches/diverges from squashed ledger), Collision Count for Plan 2. If Q1/Q2 diverge from EXPECT, **stop the plan and escalate** — the spec's Phase 0 exit criterion is a reconciled baseline.

- [ ] **Step 3: Fix the stale migration-safety rule.** In `.claude/rules/migration-safety.md`, replace the "Current State" block:

```markdown
## Current State

- Migrations were squashed to a new baseline: live ledger is `0000`–`0013` (`packages/db/migrations/`), journal has 14 entries (idx 0–13)
- Next migration number: **0014** (role-simplification Phase 1 reserves 0014–0016)
- Pre-squash history (incl. the 0090–0106 phase-2 range) lives in `packages/db/migrations/_archive/`
- The deploy pipeline does NOT run `db:migrate` — every migration needs a manual prod apply (see docs/audits/phase0-role-simplification-prod-verify-2026-06-10.md)
```

- [ ] **Step 4: Commit and open PR-A**

```bash
git checkout -b feat/role-v3-phase0 origin/main
git add docs/audits/phase0-role-simplification-prod-verify-2026-06-10.md .claude/rules/migration-safety.md
git commit -m "docs(roles): phase 0 prod verification audit + fix stale migration-safety state"
```

---

### Task 2: Migration 0014 — add enum values (PR-B)

**Files:**
- Modify: `packages/db/src/schema/enums.ts:104-114`
- Generated: `packages/db/migrations/0014_role_v3_enum_values.sql` + `meta/0014_snapshot.json` + journal entry

- [ ] **Step 1: Edit the enum** in `packages/db/src/schema/enums.ts` (lines 104–114):

```ts
/**
 * Simplified community-scoped roles (v3 transition window).
 * - resident: owner or tenant (distinguished by is_unit_owner flag)
 * - manager: v2 manager (presets) — retired by the v3 cleanup migration
 * - pm_admin: v2 PM admin — retired by the v3 cleanup migration
 * - property_manager: v3 operational manager (assigned by root)
 * - root_manager: v3 root (≤1 per community, partial unique index)
 * Spec: docs/superpowers/specs/2026-06-10-root-manager-role-simplification-design.md
 */
export const userRoleV2Enum = pgEnum('user_role_v2', [
  'resident',
  'manager',
  'pm_admin',
  'property_manager',
  'root_manager',
]);
```

- [ ] **Step 2: Generate the migration**

Run: `cd packages/db && pnpm exec drizzle-kit generate --name role_v3_enum_values`
Expected: new file `migrations/0014_role_v3_enum_values.sql` containing EXACTLY two statements (PG requires one value per `ADD VALUE`):

```sql
ALTER TYPE "public"."user_role_v2" ADD VALUE 'property_manager';--> statement-breakpoint
ALTER TYPE "public"."user_role_v2" ADD VALUE 'root_manager';
```

If the file contains anything else (schema drift), STOP — reconcile drift in its own commit first.

- [ ] **Step 3: Verify journal + snapshot**

Run: `python3 -c "import json; j=json.load(open('packages/db/migrations/meta/_journal.json')); print(j['entries'][-1])"`
Expected: `{'idx': 14, ..., 'tag': '0014_role_v3_enum_values', ...}` and `meta/0014_snapshot.json` exists.

- [ ] **Step 4: Apply locally**

Run: `scripts/with-env-local.sh pnpm --filter @propertypro/db db:migrate`
Expected: applies cleanly. (New enum values are unusable inside the adding transaction — that's why the indexes are a SEPARATE migration file, 0015.)

- [ ] **Step 5: Commit**

```bash
git checkout -b feat/role-v3-migrations origin/main
git add packages/db/src/schema/enums.ts packages/db/migrations/
git commit -m "feat(db): migration 0014 — add property_manager/root_manager to user_role_v2"
```

---

### Task 3: Migration 0015 — designation column + partial unique indexes (PR-B)

**Files:**
- Modify: `packages/db/src/schema/user-roles.ts`
- Generated: `packages/db/migrations/0015_role_v3_designation_and_root_indexes.sql` + snapshot + journal

- [ ] **Step 1: Edit `packages/db/src/schema/user-roles.ts`.** Update imports (add `uniqueIndex`; add drizzle `sql`):

```ts
import { bigint, bigserial, boolean, jsonb, pgTable, text, timestamp, unique, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
```

Add the column after `legacyRole` (line 44):

```ts
    /**
     * v3 board designation: 'board_president' | 'board_member' | null.
     * Statutory features check this via requireBoardDesignation(); general
     * permissions never read it. CHECK constraint lives in migration 0016.
     */
    designation: text('designation'),
```

Replace the table callback (lines 48–53):

```ts
  (table) => [
    unique('user_roles_user_community_unique').on(
      table.userId,
      table.communityId,
    ),
    // ≤1 root per community. user_roles has NO deleted_at (hard deletes) — no soft-delete predicate.
    uniqueIndex('user_roles_one_root_per_community')
      .on(table.communityId)
      .where(sql`role = 'root_manager'`),
    // ≤1 board president per community.
    uniqueIndex('user_roles_one_board_president_per_community')
      .on(table.communityId)
      .where(sql`designation = 'board_president'`),
  ],
```

- [ ] **Step 2: Generate**

Run: `cd packages/db && pnpm exec drizzle-kit generate --name role_v3_designation_and_root_indexes`
Expected SQL (0015):

```sql
ALTER TABLE "user_roles" ADD COLUMN "designation" text;--> statement-breakpoint
CREATE UNIQUE INDEX "user_roles_one_root_per_community" ON "user_roles" USING btree ("community_id") WHERE role = 'root_manager';--> statement-breakpoint
CREATE UNIQUE INDEX "user_roles_one_board_president_per_community" ON "user_roles" USING btree ("community_id") WHERE designation = 'board_president';
```

(0015 runs in its own transaction AFTER 0014 committed, so referencing `'root_manager'` in the index predicate is safe.)

- [ ] **Step 3: Apply locally + verify**

Run: `scripts/with-env-local.sh pnpm --filter @propertypro/db db:migrate`
Then verify: `scripts/with-env-local.sh pnpm exec tsx -e "..."` is unnecessary — instead run the SQL check via psql or Supabase MCP on the LOCAL db: `SELECT indexname FROM pg_indexes WHERE tablename='user_roles';` Expected to include both new index names.

- [ ] **Step 4: Commit**

```bash
git add packages/db/src/schema/user-roles.ts packages/db/migrations/
git commit -m "feat(db): migration 0015 — designation column + one-root/one-president partial unique indexes"
```

---

### Task 4: Migration 0016 — designation CHECK + bilingual RLS (PR-B)

**Files:**
- Create (via drizzle custom): `packages/db/migrations/0016_role_v3_rls_bilingual.sql` + journal entry

- [ ] **Step 1: Generate an empty custom migration**

Run: `cd packages/db && pnpm exec drizzle-kit generate --custom --name role_v3_rls_bilingual`

- [ ] **Step 2: Fill the generated 0016 file with exactly:**

```sql
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_designation_check"
  CHECK (designation IS NULL OR designation IN ('board_president', 'board_member'));--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.pp_rls_can_read_audit_log(target_community_id bigint)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'pg_catalog'
AS $function$
  SELECT CASE
    WHEN "public"."pp_rls_is_privileged"() THEN true
    WHEN auth.uid() IS NULL THEN false
    ELSE EXISTS (
      SELECT 1
      FROM "public"."user_roles" ur
      WHERE ur.user_id = auth.uid()
        AND ur.community_id = target_community_id
        AND ur.role IN ('manager', 'pm_admin', 'property_manager', 'root_manager')
    )
  END;
$function$;
```

(This is the verbatim function from `0000_nappy_guardian.sql:1742-1759` with ONLY the `IN` list widened. It is the single role-branching RLS function — verified by `grep "role IN\|ur.role\|role =" packages/db/migrations/0000_nappy_guardian.sql` returning only line 1756.)

- [ ] **Step 3: Apply locally, run migration-ordering guard**

Run: `scripts/with-env-local.sh pnpm --filter @propertypro/db db:migrate && pnpm exec tsx scripts/verify-migration-ordering.ts`
Expected: both pass.

- [ ] **Step 4: Run integration preflight to prove zero behavior change**

Run: `scripts/with-env-local.sh pnpm test:integration:preflight`
Expected: PASS (the migrations are purely additive; nothing reads the new values yet).

- [ ] **Step 5: Commit and open PR-B**

```bash
git add packages/db/migrations/
git commit -m "feat(db): migration 0016 — designation CHECK + bilingual pp_rls_can_read_audit_log"
```

---

### Task 5: PROD APPLY GATE (manual runbook — after PR-B merges)

- [ ] **Step 1:** After PR-B is merged to main, apply each migration to prod **in order** via Supabase MCP `apply_migration` (project `vbqobyagjzvlfpfozvmx`), names `0014_role_v3_enum_values`, `0015_role_v3_designation_and_root_indexes`, `0016_role_v3_rls_bilingual`, content identical to the merged files.
- [ ] **Step 2:** Verify with read-only SQL:

```sql
SELECT e.enumlabel FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid WHERE t.typname='user_role_v2' ORDER BY e.enumsortorder;
-- EXPECT 5 values, property_manager + root_manager appended
SELECT indexname FROM pg_indexes WHERE tablename='user_roles' AND indexname LIKE 'user_roles_one_%';
-- EXPECT both partial indexes
SELECT prosrc FROM pg_proc WHERE proname='pp_rls_can_read_audit_log';
-- EXPECT the 4-value IN list
```

- [ ] **Step 3:** Append the apply timestamps + outputs to the Phase 0 audit doc (follow-up commit on main or PR-C). **PR-C may not merge before this step is green.**

---

### Task 6: Shared transition constants + filter expander (PR-C, TDD)

**Files:**
- Create: `packages/shared/src/role-transition.ts`
- Modify: `packages/shared/src/index.ts` (barrel export, after line 94's `export * from './default-faqs';`)
- Test: `packages/shared/__tests__/role-transition.test.ts`

- [ ] **Step 1: Write the failing test** at `packages/shared/__tests__/role-transition.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  ADMIN_TIER_DB_ROLES,
  MANAGER_TIER_DB_ROLES,
  PM_SCOPE_DB_ROLES,
  TRANSITION_ROLES,
  expandTransitionRoleFilter,
} from '../src/role-transition';

describe('role-transition constants', () => {
  it('TRANSITION_ROLES carries both generations', () => {
    expect(TRANSITION_ROLES).toEqual(['resident', 'manager', 'pm_admin', 'property_manager', 'root_manager']);
  });
  it('ADMIN_TIER includes every manager-or-above value of both generations', () => {
    expect(ADMIN_TIER_DB_ROLES).toEqual(['manager', 'pm_admin', 'property_manager', 'root_manager']);
  });
  it('PM_SCOPE covers pm_admin and its v3 successors', () => {
    expect(PM_SCOPE_DB_ROLES).toEqual(['pm_admin', 'property_manager', 'root_manager']);
  });
  it('MANAGER_TIER covers manager and its v3 successors', () => {
    expect(MANAGER_TIER_DB_ROLES).toEqual(['manager', 'property_manager', 'root_manager']);
  });
});

describe('expandTransitionRoleFilter', () => {
  it('expands v2 filter values to match rows of both generations', () => {
    expect(expandTransitionRoleFilter('manager')).toEqual(['manager', 'property_manager', 'root_manager']);
    expect(expandTransitionRoleFilter('pm_admin')).toEqual(['pm_admin', 'property_manager', 'root_manager']);
  });
  it('passes v3 and resident values through unchanged', () => {
    expect(expandTransitionRoleFilter('resident')).toEqual(['resident']);
    expect(expandTransitionRoleFilter('property_manager')).toEqual(['property_manager']);
    expect(expandTransitionRoleFilter('root_manager')).toEqual(['root_manager']);
  });
  it('returns [] for unknown values (callers must short-circuit before inArray)', () => {
    expect(expandTransitionRoleFilter('owner')).toEqual([]);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @propertypro/shared exec vitest run __tests__/role-transition.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement** `packages/shared/src/role-transition.ts`:

```ts
/**
 * v3 role-transition constants (root-manager simplification).
 * Spec: docs/superpowers/specs/2026-06-10-root-manager-role-simplification-design.md
 *
 * During the bilingual window (Phase 1 → Phase 4) the user_role_v2 enum holds
 * BOTH the v2 values (manager, pm_admin) and the v3 values (property_manager,
 * root_manager). Every DB-level role predicate AND every app-layer branch on a
 * raw membership.role value must match both generations, via these constants.
 * Phase 4 cleanup shrinks them to v3-only and deletes the expander.
 */
export const TRANSITION_ROLES = ['resident', 'manager', 'pm_admin', 'property_manager', 'root_manager'] as const;
export type TransitionRole = (typeof TRANSITION_ROLES)[number];

/** Admin-tier membership rows (manager or above), both generations. */
export const ADMIN_TIER_DB_ROLES = ['manager', 'pm_admin', 'property_manager', 'root_manager'] as const;

/** Rows granting cross-community PM-portfolio scope, both generations. */
export const PM_SCOPE_DB_ROLES = ['pm_admin', 'property_manager', 'root_manager'] as const;

/** v2 'manager' and its v3 successors (community-scoped manager generation). */
export const MANAGER_TIER_DB_ROLES = ['manager', 'property_manager', 'root_manager'] as const;

/**
 * Expand a v2 role-filter value so list filters match rows of both
 * generations. Returns [] for unknown input — callers MUST short-circuit
 * (drizzle forbids inArray(col, [])).
 */
export function expandTransitionRoleFilter(role: string): readonly TransitionRole[] {
  switch (role) {
    case 'manager': return MANAGER_TIER_DB_ROLES;
    case 'pm_admin': return PM_SCOPE_DB_ROLES;
    case 'resident': return ['resident'];
    case 'property_manager': return ['property_manager'];
    case 'root_manager': return ['root_manager'];
    default: return [];
  }
}
```

Add to `packages/shared/src/index.ts` after the `default-faqs` export line:

```ts
export * from './role-transition';
```

- [ ] **Step 4: Run tests to verify pass**

Run: `pnpm --filter @propertypro/shared exec vitest run __tests__/role-transition.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 5: Commit** — ⚠️ cut this branch only AFTER PR-B has merged: PR-C's `inArray` typing depends on the widened enum in `packages/db/src/schema/enums.ts`.

```bash
git checkout -b feat/role-v3-bilingual origin/main   # AFTER PR-B is merged into main
git add packages/shared/src/role-transition.ts packages/shared/src/index.ts packages/shared/__tests__/role-transition.test.ts
git commit -m "feat(shared): v3 role-transition constants + filter expander"
```

---

### Task 7: Compat shim extension (PR-C, TDD)

**Files:**
- Modify: `packages/shared/src/billing/permissions.ts:36-52`
- Test: `packages/shared/__tests__/billing-permissions.test.ts` (append)
- Modify: `docs/superpowers/specs/2026-06-10-root-manager-role-simplification-design.md` §6 (one sentence)

- [ ] **Step 1: Append failing tests** to `packages/shared/__tests__/billing-permissions.test.ts`:

```ts
describe('inferCanonicalRoleFromMembership — v3 transition values', () => {
  it('maps root_manager to property_manager_admin', () => {
    expect(inferCanonicalRoleFromMembership({ role: 'root_manager' })).toBe('property_manager_admin');
  });
  it('maps presetKey-less property_manager to cam', () => {
    expect(inferCanonicalRoleFromMembership({ role: 'property_manager' })).toBe('cam');
  });
  it('keeps preset fidelity for backfilled property_managers', () => {
    expect(inferCanonicalRoleFromMembership({ role: 'property_manager', presetKey: 'board_member' })).toBe('board_member');
    expect(inferCanonicalRoleFromMembership({ role: 'property_manager', presetKey: 'board_president' })).toBe('board_president');
    expect(inferCanonicalRoleFromMembership({ role: 'property_manager', presetKey: 'site_manager' })).toBe('site_manager');
  });
  it('does NOT regress v2 behavior', () => {
    expect(inferCanonicalRoleFromMembership({ role: 'pm_admin' })).toBe('property_manager_admin');
    expect(inferCanonicalRoleFromMembership({ role: 'manager', presetKey: 'cam' })).toBe('cam');
    expect(inferCanonicalRoleFromMembership({ role: 'manager' })).toBe('board_member');
    expect(inferCanonicalRoleFromMembership({ role: 'resident', isUnitOwner: true })).toBe('owner');
    expect(inferCanonicalRoleFromMembership({ role: 'resident' })).toBe('tenant');
  });
});
```

(If the file does not already import `inferCanonicalRoleFromMembership`, add it to the existing import from `../src/billing/permissions`.)

- [ ] **Step 2: Run to verify the new block fails**

Run: `pnpm --filter @propertypro/shared exec vitest run __tests__/billing-permissions.test.ts`
Expected: FAIL — `root_manager` input currently falls through to `'tenant'`.

- [ ] **Step 3: Replace the function body** in `packages/shared/src/billing/permissions.ts` (current lines 36–52, keep the existing JSDoc and add to it):

```ts
/**
 * Resolve the canonical CommunityRole from the new-model membership shape.
 *
 * The runtime stores `role` as resident | manager | pm_admin — plus, during
 * the v3 transition window, property_manager | root_manager. This is THE
 * single legacy-role resolver (spec Phase 1); preset fidelity is preserved
 * for backfilled property_managers so legacy permission semantics survive
 * the window. Phase 4 deletes this function.
 */
export function inferCanonicalRoleFromMembership(input: {
  role: string;
  isUnitOwner?: boolean;
  presetKey?: string | null;
}): AnyCommunityRole {
  if (input.role === 'pm_admin' || input.role === 'root_manager') return 'property_manager_admin';
  if (input.role === 'manager' || input.role === 'property_manager') {
    switch (input.presetKey) {
      case 'board_president': return 'board_president';
      case 'cam': return 'cam';
      case 'site_manager': return 'site_manager';
      case 'board_member': return 'board_member';
      default: return input.role === 'property_manager' ? 'cam' : 'board_member';
    }
  }
  return input.isUnitOwner ? 'owner' : 'tenant';
}

/** Phase-1 alias — the spec's name for the single legacy-role resolver. */
export const resolveLegacyRole = inferCanonicalRoleFromMembership;
```

- [ ] **Step 4: Run tests to verify pass**

Run: `pnpm --filter @propertypro/shared exec vitest run __tests__/billing-permissions.test.ts`
Expected: PASS, including all pre-existing cases.

- [ ] **Step 5: Update spec §6 first bullet** — replace the sentence `(shim maps \`property_manager → cam\`, and cam is in \`BILLING_ADMIN_ROLES\`; the subscribe route gates \`settings:write\`)` with:

```markdown
(the shim is preset-aware, so backfilled board members keep board-level legacy semantics through the window; only presetKey-less property_managers — minted deliberately by a root in Phase 2+ — map to `cam` and gain purchase rights before Phase 3 ①)
```

- [ ] **Step 6: Commit**

```bash
git add packages/shared/src/billing/permissions.ts packages/shared/__tests__/billing-permissions.test.ts docs/superpowers/specs/2026-06-10-root-manager-role-simplification-design.md
git commit -m "feat(shared): preset-aware bilingual legacy-role shim (resolveLegacyRole)"
```

---

### Task 8: App-layer bilingual sweep (PR-C, TDD)

The second backfill-sensitive class: branches on raw `membership.role` / row values. Without these, backfilled rows are DENIED everything (`checkPermissionV2` returns false for unknown roles) or throw (`requireNewCommunityRole`).

**Files:**
- Modify: `apps/web/src/lib/utils/community-validators.ts:39-51`
- Modify: `apps/web/src/lib/db/access-control.ts:37-65`
- Modify: `apps/web/src/lib/api/community-membership.ts:84-117`
- Modify: `apps/web/src/lib/api/role-guard.ts:13-39`
- Modify: `apps/web/src/lib/api/community-context.ts` (the `membership.role !== 'pm_admin'` early-return)
- Test: `apps/web/__tests__/lib/role-transition-app-layer.test.ts` (new)

- [ ] **Step 1: Write the failing test** at `apps/web/__tests__/lib/role-transition-app-layer.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { checkPermissionV2 } from '@/lib/db/access-control';
import { hasRole } from '@/lib/api/role-guard';

describe('checkPermissionV2 — v3 transition roles', () => {
  it('root_manager resolves the property_manager_admin matrix row', () => {
    expect(checkPermissionV2('root_manager', 'condo_718', 'documents', 'write')).toBe(
      checkPermissionV2('pm_admin', 'condo_718', 'documents', 'write'),
    );
  });
  it('property_manager uses JSONB permissions like manager', () => {
    const permissions = { resources: { documents: { read: true, write: false } } } as never;
    expect(checkPermissionV2('property_manager', 'condo_718', 'documents', 'read', { permissions })).toBe(true);
    expect(checkPermissionV2('property_manager', 'condo_718', 'documents', 'write', { permissions })).toBe(false);
  });
  it('property_manager without permissions is denied (matches manager behavior)', () => {
    expect(checkPermissionV2('property_manager', 'condo_718', 'documents', 'read')).toBe(false);
  });
});

describe('hasRole — v3 transition aliases', () => {
  it('accepts property_manager and root_manager rows where pm_admin is allowed', () => {
    expect(hasRole({ role: 'property_manager', communityId: 1 }, ['pm_admin'])).toBe(true);
    expect(hasRole({ role: 'root_manager', communityId: 1 }, ['pm_admin'])).toBe(true);
  });
  it('matches manager-preset allowlists for property_manager rows (backfill keeps presetKey)', () => {
    expect(hasRole({ role: 'property_manager', communityId: 1, presetKey: 'cam' }, ['cam'])).toBe(true);
  });
  it('does not regress v2 behavior', () => {
    expect(hasRole({ role: 'manager', communityId: 1, presetKey: 'cam' }, ['cam'])).toBe(true);
    expect(hasRole({ role: 'resident', communityId: 1 }, ['pm_admin'])).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd apps/web && pnpm exec vitest run __tests__/lib/role-transition-app-layer.test.ts`
Expected: FAIL — `'root_manager'` not assignable to `NewCommunityRole` (type error) and/or runtime false/false mismatches.

- [ ] **Step 3: Widen the validator.** In `apps/web/src/lib/utils/community-validators.ts`, replace `requireNewCommunityRole` (lines 39–51) — and add the predicate next to the existing `isNewCommunityRole`:

```ts
import { TRANSITION_ROLES, type TransitionRole } from '@propertypro/shared';

function isTransitionRole(value: unknown): value is TransitionRole {
  return typeof value === 'string' && (TRANSITION_ROLES as readonly string[]).includes(value);
}

/**
 * v3 transition window: accepts both role generations
 * (resident|manager|pm_admin|property_manager|root_manager).
 * Phase 4 narrows this back to the v3-only set.
 */
export function requireNewCommunityRole(
  value: unknown,
  context: string,
): TransitionRole {
  if (!isTransitionRole(value)) {
    throw new DataIntegrityError(`Invalid community role (v2) in ${context}`, {
      context,
      value,
    });
  }

  return value;
}
```

(Keep the import line for `NewCommunityRole` only if still referenced elsewhere in the file; TypeScript will tell you.)

- [ ] **Step 4: Make `checkPermissionV2` bilingual.** In `apps/web/src/lib/db/access-control.ts`, replace lines 45–65:

```ts
export function checkPermissionV2(
  role: TransitionRole,
  communityType: CommunityType,
  resource: RbacResource,
  action: RbacAction,
  opts?: { isUnitOwner?: boolean; permissions?: ManagerPermissions },
): boolean {
  if (role === 'pm_admin' || role === 'root_manager') {
    return RBAC_MATRIX[communityType]['property_manager_admin'][resource][action];
  }
  if (role === 'resident') {
    const legacyRole = opts?.isUnitOwner ? 'owner' : 'tenant';
    return RBAC_MATRIX[communityType][legacyRole][resource][action];
  }
  if (role === 'manager' || role === 'property_manager') {
    if (!opts?.permissions) return false;
    const perm = opts.permissions.resources[resource];
    return action === 'read' ? perm.read : perm.write;
  }
  return false;
}
```

Update the file's imports: replace the `NewCommunityRole` type import with `TransitionRole` from `@propertypro/shared`, and update the function JSDoc (lines 37–44) to mention the two v3 values.

- [ ] **Step 5: Make membership resolution bilingual.** In `apps/web/src/lib/api/community-membership.ts`:

Line 90 — replace:

```ts
  const isAdmin = (ADMIN_TIER_DB_ROLES as readonly string[]).includes(role);
```

Line 112 — replace `if (role === 'manager') {` with:

```ts
  if (role === 'manager' || role === 'property_manager') {
```

Add `ADMIN_TIER_DB_ROLES` to the file's `@propertypro/shared` import.

- [ ] **Step 6: Make `role-guard.ts` bilingual.** Replace lines 13–39:

```ts
const ROLE_ALIASES: Record<string, readonly string[]> = {
  pm_admin: ['pm_admin', 'property_manager_admin', 'property_manager', 'root_manager'],
  property_manager_admin: ['pm_admin', 'property_manager_admin', 'property_manager', 'root_manager'],
  property_manager: ['pm_admin', 'property_manager_admin', 'property_manager', 'root_manager'],
  root_manager: ['root_manager'],
};

export type Membership = { role: string; communityId: number; presetKey?: string | null };

function expandRoles(allowed: readonly string[]): Set<string> {
  const expanded = new Set<string>();
  for (const role of allowed) {
    expanded.add(role);
    for (const alias of ROLE_ALIASES[role] ?? []) {
      expanded.add(alias);
    }
  }
  return expanded;
}

export function hasRole(membership: Membership, allowed: readonly string[]): boolean {
  const expanded = expandRoles(allowed);
  if (expanded.has(membership.role)) {
    return true;
  }
  // Manager-generation rows match preset-name allowlists (backfill preserves presetKey).
  return (membership.role === 'manager' || membership.role === 'property_manager' || membership.role === 'root_manager')
    && typeof membership.presetKey === 'string'
    && expanded.has(membership.presetKey);
}
```

Note `root_manager` maps only to itself in the alias table BUT routes allowing `pm_admin` accept it via the `pm_admin` entry's alias list — a root passes every PM gate, while a future root-only gate (`['root_manager']`) admits only roots.

- [ ] **Step 7: Make the PM-dashboard check bilingual.** In `apps/web/src/lib/api/community-context.ts`, replace:

```ts
    // Require property_manager_admin role specifically
    if (membership.role !== 'pm_admin') {
      return null;
    }
```

with:

```ts
    // Require PM-scope role (v2 pm_admin or v3 property_manager/root_manager)
    if (!(PM_SCOPE_DB_ROLES as readonly string[]).includes(membership.role)) {
      return null;
    }
```

and add `PM_SCOPE_DB_ROLES` to the file's `@propertypro/shared` import.

- [ ] **Step 8: Run the new test + typecheck**

Run: `cd apps/web && pnpm exec vitest run __tests__/lib/role-transition-app-layer.test.ts && pnpm exec tsc --noEmit`
Expected: tests PASS. tsc will surface every OTHER spot that switched exhaustively on `NewCommunityRole` — fix each by importing `TransitionRole` and handling the two new values with the same generation-mapping (property_manager→manager branch, root_manager→pm_admin branch). List every file touched this way in the commit message.

- [ ] **Step 9: Commit**

```bash
git add apps/web/src/lib packages/shared apps/web/__tests__/lib/role-transition-app-layer.test.ts
git commit -m "feat(web): app-layer bilingual role window — validator, checkPermissionV2, membership, role-guard, pm-dashboard"
```

---

### Task 9: SQL-predicate bilingual sweep (PR-C)

**Files (all Modify):** the 13 verified sites in 10 files. After 0014 lands in the schema TS (Task 2), `inArray(userRoles.role, [...])` accepts the v3 literals.

- [ ] **Step 1: `packages/db/src/queries/pm-portfolio.ts`** — add `import { PM_SCOPE_DB_ROLES } from '@propertypro/shared';`. Replace line 61 and line 82 `eq(userRoles.role, 'pm_admin'),` with:

```ts
        inArray(userRoles.role, [...PM_SCOPE_DB_ROLES]),
```

(`inArray` is already imported — used at line 129. Line 129's `eq(userRoles.role, 'resident')` stays — `resident` is unchanged across generations.) Update the function JSDoc at lines 46–50: `pm_admin` → "a PM-scope role (pm_admin / property_manager / root_manager)".

- [ ] **Step 2: `apps/web/src/lib/services/provisioning-service.ts`** — lines 288 and 349, replace `eq(userRoles.role, 'pm_admin')` with `inArray(userRoles.role, [...PM_SCOPE_DB_ROLES])`. Add `PM_SCOPE_DB_ROLES` to the shared import and ensure `inArray` is imported from `@propertypro/db/filters` (add if absent). Update the error string at line 354: `no pm_admin user_role found` → `no admin user_role found`.

- [ ] **Step 3: `apps/web/src/lib/services/payment-alert-scheduler.ts`** — replace lines 29–40's local type + constants:

```ts
import { ADMIN_TIER_DB_ROLES, MANAGER_TIER_DB_ROLES, type TransitionRole } from '@propertypro/shared';

const CONDO_HOA_ADMIN_ROLES: readonly TransitionRole[] = MANAGER_TIER_DB_ROLES;
const APARTMENT_ADMIN_ROLES: readonly TransitionRole[] = ADMIN_TIER_DB_ROLES;
```

and line 74's local annotation `UserRoleV2Value[]` → `readonly TransitionRole[]`, line 85 `inArray(userRoles.role, adminRoles)` → `inArray(userRoles.role, [...adminRoles])`. (Semantic note for the PR description: after the Phase 2 backfill, ex-`pm_admin`s in condos become `property_manager` and will start receiving payment alerts — intended convergence to the target model.)

- [ ] **Step 4: `apps/web/src/lib/services/resident-service.ts`** — replace lines 81–96:

```ts
  let roleRows: Array<Record<string, unknown>>;
  if (filter.roles && filter.roles.length > 0) {
    const expanded = [...new Set(filter.roles.flatMap((r) => expandTransitionRoleFilter(r)))];
    if (expanded.length === 0) {
      return [];
    }
    roleRows = await scoped.selectFrom(
      userRoles,
      {},
      inArray(userRoles.role, expanded),
    ) as Array<Record<string, unknown>>;
  } else if (filter.role) {
    const expanded = [...expandTransitionRoleFilter(filter.role)];
    if (expanded.length === 0) {
      return [];
    }
    roleRows = await scoped.selectFrom(
      userRoles,
      {},
      inArray(userRoles.role, expanded),
    ) as Array<Record<string, unknown>>;
  } else {
    roleRows = await scoped.query(userRoles) as Array<Record<string, unknown>>;
  }
```

Add `expandTransitionRoleFilter` to the shared import. This deletes both `as ('resident' | 'manager' | 'pm_admin')[]` silent-exclusion casts flagged in review.

- [ ] **Step 5: `apps/web/src/lib/db/public-community-reader.ts`** — line 352, replace `eq(userRoles.role, 'manager'),` with `inArray(userRoles.role, [...MANAGER_TIER_DB_ROLES]),` (presetKey board filter on line 353 stays — backfill preserves presetKey). Import `MANAGER_TIER_DB_ROLES`; `inArray` already imported (line 353 uses it).

- [ ] **Step 6: `apps/web/src/lib/services/demo-conversion.ts`** — line 237, replace `eq(userRoles.role, 'manager'),` with `inArray(userRoles.role, [...MANAGER_TIER_DB_ROLES]),` (line 238 presetKey filter stays). Imports as above.

- [ ] **Step 7: `apps/web/src/lib/billing/downgrade-notifications.ts`** — line 35, replace:

```ts
        inArray(userRoles.role, [...ADMIN_TIER_DB_ROLES]),
```

(deletes the second silent-exclusion cast). Import `ADMIN_TIER_DB_ROLES`.

- [ ] **Step 8: `apps/web/src/lib/services/account-lifecycle-service.ts`** — line 915, replace:

```ts
const LIFECYCLE_ADMIN_ROLES = ADMIN_TIER_DB_ROLES;
```

Import `ADMIN_TIER_DB_ROLES`; update the JSDoc at lines 917–920: "every `manager` or `pm_admin`" → "every admin-tier member (both role generations)".

- [ ] **Step 9: `apps/web/src/lib/services/site-portfolio-template-service.ts`** (line 98) **and `apps/web/src/lib/billing/billing-group-service.ts`** (line 411) — replace `eq(userRoles.role, 'pm_admin'),` with `inArray(userRoles.role, [...PM_SCOPE_DB_ROLES]),` in both; add imports (`inArray` from `@propertypro/db/filters` if absent).

- [ ] **Step 10: Straggler check** — run:

```bash
grep -rn "role, 'pm_admin'\|role, 'manager'\|role === 'pm_admin'\|role === 'manager'\|role !== 'pm_admin'\|role !== 'manager'" apps/web/src apps/admin/src packages/db/src packages/shared/src --include='*.ts' --include='*.tsx' | grep -v __tests__ | grep -v role-transition
```

Expected survivors: only `inferCanonicalRoleFromMembership`/`resolveLegacyRole` (the shim, intentionally generation-aware), `checkPermissionV2`'s branches (now paired with v3 values), and `community-membership.ts:112`'s paired branch. Anything else found: apply the same generation-pairing treatment and note it in the commit.

- [ ] **Step 11: Commit**

```bash
git add packages/db/src apps/web/src
git commit -m "feat(roles): bilingual SQL sweep — 13 role predicates accept both generations"
```

---

### Task 10: Test reconciliation + full verification (PR-C)

- [ ] **Step 1: Find unit tests asserting the old predicates**

```bash
grep -rln "pm-portfolio\|lookupLifecycleAdminRecipients\|listResidentsForCommunity\|isPmAdminInAnyCommunity\|downgrade-notifications\|billing-group-service\|payment-alert" apps/web/__tests__ packages/db --include='*.test.ts' | head -30
grep -rn "vi.mock('@propertypro/shared'" apps/web/__tests__ | head
```

For each test asserting an `eq(role, 'pm_admin')`-shaped clause (the mock-operator stubs record `{ __eq: ... }` / `{ __inArray: ... }` shapes per the api-patterns rule), update the expectation to the `__inArray` shape with the matching constant's values. If any `vi.mock('@propertypro/shared')` factory exists, add the new exports (`TRANSITION_ROLES`, `ADMIN_TIER_DB_ROLES`, `PM_SCOPE_DB_ROLES`, `MANAGER_TIER_DB_ROLES`, `expandTransitionRoleFilter`, `inferCanonicalRoleFromMembership`) to EVERY factory — a missing export 500s every test in the file (known trap).

- [ ] **Step 2: Build packages, then run the affected suites**

```bash
pnpm turbo run build --filter='./packages/*'   # fresh-worktree trap
pnpm --filter @propertypro/shared test
cd apps/web && pnpm exec vitest run __tests__/lib __tests__/unit 2>/dev/null || pnpm exec vitest run
```

Expected: PASS. Fix any missed assertion updates.

- [ ] **Step 3: Typecheck without the turbo cache + real build**

```bash
cd apps/web && pnpm exec tsc --noEmit
cd ../.. && pnpm exec turbo run typecheck --force
pnpm --filter @propertypro/web build
```

Expected: all green (the cache-trap and client-bundle traps from project memory).

- [ ] **Step 4: Integration suite against the migrated local DB**

```bash
scripts/with-env-local.sh pnpm exec vitest run --config apps/web/vitest.integration.config.ts
```

Expected: PASS — proves zero behavior change with migrations applied and bilingual code active.

- [ ] **Step 5: Update spec Phase 1 inventory** — in `docs/superpowers/specs/2026-06-10-root-manager-role-simplification-design.md`: first, replace the provisional migration labels `0014a`/`0014b`/`0014c` with the resolved numbers `0014`/`0015`/`0016` (and the Phase 2 backfill reference "Migration 0015" becomes "Migration 0017", "Migration 0016+" in Phase 4 becomes "Migration 0018+"). Then, in the "Bilingual sweep PR (code)" bullet, append after the 13-site inventory sentence:

```markdown
  The sweep equally covers the app-layer raw-value branches (same backfill sensitivity):
  `community-validators.ts` (`requireNewCommunityRole`), `access-control.ts`
  (`checkPermissionV2`), `community-membership.ts` (isAdmin + permissions
  normalization), `role-guard.ts` (aliases + preset matching), and
  `community-context.ts` (PM-dashboard gate).
```

- [ ] **Step 6: Commit and open PR-C** (merge gate: Task 5 prod apply confirmed)

```bash
git add -A
git commit -m "test(roles): reconcile suites with bilingual predicates; spec inventory update"
```

---

### Task 11: `guard:legacy-roles` (PR-D)

**Files:**
- Create: `scripts/verify-legacy-roles.ts`
- Modify: `package.json` (scripts block + lint chain)

- [ ] **Step 1: Write the guard** at `scripts/verify-legacy-roles.ts`:

```ts
/**
 * Legacy-role literal guard (role-simplification Phase 1+).
 *
 * Counts occurrences of (a) the five legacy admin-role string literals and
 * (b) the v2 union-type cast pattern, across app + package source. This is a
 * REGRESSION FLOOR during the Phase 3 drain (ratchet FLOOR down with every
 * drain PR), and flips to forbid (FLOOR = allowlist-only) at Phase 4.
 *
 * Spec: docs/superpowers/specs/2026-06-10-root-manager-role-simplification-design.md
 * NOTE: 'owner'/'tenant' literals are NOT counted (too many legitimate uses:
 * ownerUserId, tenant isolation, etc.). presetKey VALUES share these strings
 * and legitimately persist until Phase 4 drops the column — that's why this
 * is a floor, not a ban.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const FLOOR = Number.NaN; // set in Step 3 from --report output before wiring into lint
const ROOTS = ['apps/web/src', 'apps/admin/src', 'packages/shared/src', 'packages/db/src', 'packages/ui/src', 'packages/email/src'];
const LITERAL = /'(board_member|board_president|cam|site_manager|property_manager_admin)'/g;
const V2_CAST = /'resident'\s*\|\s*'manager'\s*\|\s*'pm_admin'/g;
const EXEMPT = new Set([
  'packages/shared/src/role-transition.ts',
  'packages/shared/src/billing/permissions.ts', // the shim — deleted at Phase 4
]);

function* walk(dir: string): Generator<string> {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (entry === 'node_modules' || entry.startsWith('.')) continue;
    if (statSync(full).isDirectory()) yield* walk(full);
    else if (/\.(ts|tsx)$/.test(entry)) yield full;
  }
}

let total = 0;
const perFile: Array<[string, number]> = [];
for (const root of ROOTS) {
  for (const file of walk(root)) {
    if (EXEMPT.has(file)) continue;
    const src = readFileSync(file, 'utf8');
    const n = (src.match(LITERAL)?.length ?? 0) + (src.match(V2_CAST)?.length ?? 0);
    if (n > 0) {
      total += n;
      perFile.push([file, n]);
    }
  }
}

if (process.argv.includes('--report')) {
  perFile.sort((a, b) => b[1] - a[1]).forEach(([f, n]) => console.log(`${String(n).padStart(4)}  ${f}`));
  console.log(`\nTOTAL: ${total}`);
  process.exit(0);
}

if (Number.isNaN(FLOOR)) {
  console.error('guard:legacy-roles — FLOOR not set. Run with --report and pin the count.');
  process.exit(1);
}
if (total > FLOOR) {
  console.error(`guard:legacy-roles — ${total} legacy role literals found, floor is ${FLOOR}.`);
  console.error('New code must use the v3 roles / transition constants (packages/shared/src/role-transition.ts).');
  console.error('If you DRAINED literals, lower FLOOR in scripts/verify-legacy-roles.ts to the new count.');
  process.exit(1);
}
console.log(`guard:legacy-roles OK — ${total} legacy literals (floor ${FLOOR}).`);
```

- [ ] **Step 2: Capture the floor**

Run: `pnpm exec tsx scripts/verify-legacy-roles.ts --report`
Expected: per-file counts + `TOTAL: <N>`. Edit the script: `const FLOOR = <N>;`.

- [ ] **Step 3: Verify both modes**

Run: `pnpm exec tsx scripts/verify-legacy-roles.ts`
Expected: `guard:legacy-roles OK — <N> legacy literals (floor <N>).`
Then add one literal `'board_member'` to any source file temporarily, re-run, expect exit 1 with the over-floor message, revert.

- [ ] **Step 4: Wire into `package.json`** — add to the scripts block (after `guard:help-content` at line 44):

```json
    "guard:legacy-roles": "tsx scripts/verify-legacy-roles.ts",
```

and append ` && pnpm guard:legacy-roles` to the `lint` script (line 47).

- [ ] **Step 5: Run the full lint chain**

Run: `pnpm lint`
Expected: every guard passes including the new one.

- [ ] **Step 6: Commit and open PR-D**

```bash
git checkout -b feat/role-v3-guard origin/main
git add scripts/verify-legacy-roles.ts package.json
git commit -m "feat(ci): guard:legacy-roles regression floor for the v3 role drain"
```

---

### Task 12: Close-out

- [ ] **Step 1:** Merge order: PR-A → PR-B → **Task 5 prod apply** → PR-C → PR-D, each through normal CI.
- [ ] **Step 2:** Append prod-apply evidence (Task 5 outputs) to the Phase 0 audit doc if not already committed.
- [ ] **Step 3:** Phase 1 exit criteria — all true: 5 enum values in prod; designation column + 2 partial indexes + CHECK in prod; bilingual RLS function in prod; bilingual code deployed; `guard:legacy-roles` in the lint chain; integration suite green. Then write Plan 2 (Phase 2: backfill 0017, claim-root UX, role-management UI) using the Phase 0 collision counts.
