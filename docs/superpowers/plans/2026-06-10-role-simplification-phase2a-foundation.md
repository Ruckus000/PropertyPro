# Role Simplification — Phase 2a (Foundation: storage-RLS, backfill, creator-is-root, offboarding guard) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Land the data + backend foundation of Phase 2 — widen the deferred storage-object RLS policies (0017), backfill all admins to `property_manager` with board `designation`s leaving root **vacant** (0018), make new-community creators `root_manager`, and add a root-offboarding guard + a rootless-communities admin report — without locking any community out.

**Architecture:** Two migrations (0017 storage-RLS widening must precede 0018 backfill), four creator-is-root code edits, an account-deletion guard, and a read-only admin report. The backfill leaves root vacant everywhere; this is SAFE because root-only enforcement of billing/deletion/role-assignment is Phase 3 work — nothing is gated to root yet, so "rootless" communities keep functioning exactly as they do today (their ex-admins are now `property_manager`, which the Phase-1 bilingual shim resolves to `cam`/`pm_admin` powers). Spec: `docs/superpowers/specs/2026-06-10-root-manager-role-simplification-design.md` §4 Phase 2.

**Tech Stack:** Drizzle ORM + drizzle-kit migrations, PostgreSQL (Supabase, FORCE RLS), Next.js 15 / TypeScript, Vitest.

---

## Phase 2 sub-plan roadmap (this is Plan 2a of 2a/2b/2c)

| Sub-plan | Scope | Status |
|---|---|---|
| **2a (this)** | Migrations 0017 (storage RLS) + 0018 (backfill); creator-is-root wiring; root-offboarding guard; rootless-communities admin report | ready |
| 2b | Claim-root flow: claim API + aggregated multi-community claim UX + dispute notifications + platform-admin override + root transfer | write after 2a lands + prod-applies |
| 2c | Root-only role-management UI: assign/revoke `property_manager`, set `designation`, transfer root | write after 2b (shares the transfer endpoint) |

**Why 2a ships first and standalone:** 2b/2c both need 0018's backfilled data + the `designation` column behavior in place, and 2b's claim flow needs to know which communities are rootless (the report from 2a). 2a is safe to deploy alone — see Architecture.

## PR & deploy-gate map (2a)

| PR | Contents | Tasks | Gate |
|---|---|---|---|
| PR-2a-mig | Migrations 0017 + 0018 + schema/snapshot | 1–2 | normal CI |
| **PROD APPLY** | Apply 0017 then 0018 to prod (pipeline does NOT migrate) | 3 | after PR-2a-mig merges; 0017 BEFORE 0018 |
| PR-2a-app | Creator-is-root edits + offboarding guard + rootless report | 4–8 | merge AFTER Task 3 prod-apply (creator-is-root mints `root_manager`, which only exists in prod after 0014 — already applied — so this is safe once 0018 is applied; but keep ordering for coherence) |

⚠️ Prod already has enum values `property_manager`/`root_manager` (Phase 1). The backfill 0018 is the first migration to WRITE them. Re-confirm via the Phase-0 audit before applying.

## File structure

```
packages/db/migrations/0017_role_v3_storage_rls_bilingual.sql   # NEW (custom): widen 2 storage.objects policies
packages/db/migrations/0018_role_v3_backfill.sql                # NEW (custom): data backfill
packages/db/migrations/meta/_journal.json                       # +2 entries
apps/web/src/lib/pm/create-community.ts                         # founding role pm_admin → root_manager
apps/web/src/lib/services/provisioning-service.ts              # founding role pm_admin → root_manager (insert + the 2 lookups already PM_SCOPE-bilingual from Phase 1)
apps/web/src/lib/services/onboarding-service.ts                # resolveDisplayTitle: handle root_manager title
apps/web/src/lib/services/demo-conversion.ts                   # founding board_president manager → root_manager + designation
apps/web/src/lib/account-lifecycle/root-offboarding.ts         # NEW: sole-root detection helper
apps/web/src/lib/services/account-lifecycle-service.ts         # requestUserDeletion: block/flag if sole root
apps/web/src/lib/db/rootless-communities.ts                    # NEW (unscoped): list communities with no root_manager
apps/admin/src/app/api/admin/communities/rootless/route.ts     # NEW: admin report endpoint
apps/admin/src/app/communities/rootless/page.tsx               # NEW: admin report page
```

---

### Task 1: Migration 0017 — widen storage.objects RLS policies (PR-2a-mig)

**Files:**
- Create (drizzle custom): `packages/db/migrations/0017_role_v3_storage_rls_bilingual.sql` + journal entry

**Context:** `0006_site_assets_storage.sql` created two `storage.objects` policies branching on `role = 'pm_admin' OR (role = 'manager' AND preset_key = 'cam')`. Phase-1's 0016 did NOT widen them (audit Finding 5). They're inert today (service_role bypass) but the backfill (0018) will convert those `pm_admin`/`manager` rows, so widen first.

- [ ] **Step 1: Generate the custom migration**

Run: `cd packages/db && pnpm exec drizzle-kit generate --custom --name role_v3_storage_rls_bilingual`
Expected: empty `migrations/0017_role_v3_storage_rls_bilingual.sql` + journal idx 17 + a carry-forward snapshot.

- [ ] **Step 2: Fill 0017 with EXACTLY this** (DROP + re-CREATE both policies with the widened predicate; trailing newline):

```sql
-- v3 role transition (Phase 2 prerequisite): widen the two community-site-assets
-- storage.objects policies so backfilled v3 roles retain bucket access. Verbatim
-- from 0006_site_assets_storage.sql except the role predicate. Spec audit Finding 5.
DO $$
BEGIN
  EXECUTE $POL$DROP POLICY IF EXISTS "site_assets_pm_insert" ON storage.objects$POL$;
  EXECUTE $POL$
    CREATE POLICY "site_assets_pm_insert" ON storage.objects
      FOR INSERT TO authenticated
      WITH CHECK (
        bucket_id = 'community-site-assets'
        AND (storage.foldername(name))[1] IN (
          SELECT community_id::text FROM public.user_roles
           WHERE user_id = auth.uid()
             AND (
               role IN ('pm_admin', 'property_manager', 'root_manager')
               OR (role IN ('manager', 'property_manager', 'root_manager') AND preset_key = 'cam')
             )
        )
      )
  $POL$;

  EXECUTE $POL$DROP POLICY IF EXISTS "site_assets_pm_delete" ON storage.objects$POL$;
  EXECUTE $POL$
    CREATE POLICY "site_assets_pm_delete" ON storage.objects
      FOR DELETE TO authenticated
      USING (
        bucket_id = 'community-site-assets'
        AND (storage.foldername(name))[1] IN (
          SELECT community_id::text FROM public.user_roles
           WHERE user_id = auth.uid()
             AND (
               role IN ('pm_admin', 'property_manager', 'root_manager')
               OR (role IN ('manager', 'property_manager', 'root_manager') AND preset_key = 'cam')
             )
        )
      )
  $POL$;
END $$;
```

(The `role IN (...)` first clause covers PM-scope; the second keeps cam-preset managers — both generations. `property_manager`/`root_manager` appear in both, harmless.)

- [ ] **Step 3: migration-ordering guard**

Run: `pnpm exec tsx scripts/verify-migration-ordering.ts`
Expected: PASS, last idx 17.

- [ ] **Step 4: Commit**

```bash
git checkout -b feat/role-v3-phase2-migrations origin/main
git add packages/db/migrations/
git commit -m "feat(db): migration 0017 — widen storage.objects RLS for v3 roles (pre-backfill)"
```

---

### Task 2: Migration 0018 — data backfill (PR-2a-mig)

**Files:**
- Create (drizzle custom): `packages/db/migrations/0018_role_v3_backfill.sql` + journal entry

**Context — exact prod distribution (Phase-0 Q3, 1292 rows):** resident 442 (unchanged), manager+board_president 461, manager+board_member 118, manager+cam 2, manager+site_manager 48, manager+NULL-preset 10, pm_admin 211. Zero board_president collisions (so the dedup is a defensive guard). `presetKey` is PRESERVED (the Phase-1 shim still reads it; dropped only in Phase 4). Root left VACANT everywhere.

- [ ] **Step 1: Generate the custom migration**

Run: `cd packages/db && pnpm exec drizzle-kit generate --custom --name role_v3_backfill`
Expected: empty 0018 file + journal idx 18 + carry-forward snapshot.

- [ ] **Step 2: Fill 0018 with EXACTLY this** (ordered: presidents with dedup first, then the rest; trailing newline):

```sql
-- v3 role transition Phase 2 backfill. Converts every admin-tier row to
-- property_manager, attaches board designations, and leaves root_manager VACANT
-- (claimed later via the claim-root flow). presetKey is intentionally preserved
-- (the Phase-1 compat shim still reads it; dropped in Phase 4). resident rows
-- are untouched. Spec §4 Phase 2.

-- 1. board_president preset → property_manager + designation.
--    Deterministic dedup (defensive; prod has zero collisions): the earliest
--    createdAt row per community keeps 'board_president'; any extras become
--    'board_member' so the one-board-president partial unique index never trips.
WITH ranked AS (
  SELECT id,
         row_number() OVER (PARTITION BY community_id ORDER BY created_at ASC, id ASC) AS rn
  FROM user_roles
  WHERE role = 'manager' AND preset_key = 'board_president'
)
UPDATE user_roles ur
SET role = 'property_manager',
    designation = CASE WHEN r.rn = 1 THEN 'board_president' ELSE 'board_member' END,
    updated_at = now()
FROM ranked r
WHERE ur.id = r.id;
--> statement-breakpoint

-- 2. board_member preset → property_manager + designation board_member.
UPDATE user_roles
SET role = 'property_manager', designation = 'board_member', updated_at = now()
WHERE role = 'manager' AND preset_key = 'board_member';
--> statement-breakpoint

-- 3. cam / site_manager / NULL-preset managers → property_manager (no designation).
UPDATE user_roles
SET role = 'property_manager', updated_at = now()
WHERE role = 'manager' AND (preset_key IN ('cam', 'site_manager') OR preset_key IS NULL);
--> statement-breakpoint

-- 4. pm_admin → property_manager (no designation).
UPDATE user_roles
SET role = 'property_manager', updated_at = now()
WHERE role = 'pm_admin';
```

(After this, no `manager`/`pm_admin` rows remain; `resident` untouched; zero `root_manager` rows — root is vacant pending claim. The one-root index is trivially satisfied. The board_president index is satisfied by the dedup.)

- [ ] **Step 3: Apply 0017+0018 to a LOCAL/branch db to validate the SQL** — ONLY if a non-prod DATABASE_URL is available. Confirm host first:

Run: `scripts/with-env-local.sh node -e "console.log(new URL(process.env.DATABASE_URL).hostname)"`
If the host contains `vbqobyagjzvlfpfozvmx` (prod) or is undeterminable: SKIP local apply, note it; the SQL is validated by inspection + the prod-apply runbook (Task 3). If non-prod: `scripts/with-env-local.sh pnpm --filter @propertypro/db db:migrate`, then sanity-check `SELECT role, designation, count(*) FROM user_roles GROUP BY 1,2 ORDER BY 1,2;`.

- [ ] **Step 4: migration-ordering guard + commit**

Run: `pnpm exec tsx scripts/verify-migration-ordering.ts` (last idx 18).

```bash
git add packages/db/migrations/
git commit -m "feat(db): migration 0018 — backfill admins to property_manager + board designations (root vacant)"
```

---

### Task 3: PROD APPLY GATE (manual runbook — after PR-2a-mig merges)

- [ ] **Step 1: Re-confirm prod baseline** (Supabase MCP `execute_sql`, project `vbqobyagjzvlfpfozvmx`, read-only):

```sql
SELECT role, preset_key, count(*) FROM user_roles GROUP BY 1,2 ORDER BY 1,2;
-- EXPECT the Phase-0 distribution (resident/manager+presets/pm_admin); 0 rows already property_manager/root_manager.
```
If any `property_manager`/`root_manager` rows already exist, STOP and reconcile (someone applied early).

- [ ] **Step 2: Apply 0017 then 0018, in order** (Supabase MCP `apply_migration`, names `0017_role_v3_storage_rls_bilingual` then `0018_role_v3_backfill`, content identical to the merged files). On any ambiguous connector error, do NOT blind-retry — re-query and verify state first (Phase-1 lesson).

- [ ] **Step 3: Verify post-backfill** (read-only):

```sql
SELECT role, designation, count(*) FROM user_roles GROUP BY 1,2 ORDER BY 1,2;
-- EXPECT: resident/NULL 442; property_manager/board_president 461; property_manager/board_member 118;
--         property_manager/NULL 271 (2 cam + 48 site_manager + 10 null-preset + 211 pm_admin); 0 manager; 0 pm_admin; 0 root_manager.
SELECT count(*) FROM user_roles WHERE role IN ('manager','pm_admin');   -- EXPECT 0
SELECT community_id, count(*) FROM user_roles WHERE designation='board_president' GROUP BY 1 HAVING count(*)>1;  -- EXPECT empty
```

- [ ] **Step 4: Append evidence** to `docs/audits/phase0-role-simplification-prod-verify-2026-06-10.md` (new "Phase 2 backfill evidence" section) in PR-2a-app or a follow-up commit.

---

### Task 4: Creator-is-root — create-community (PR-2a-app)

**Files:**
- Modify: `apps/web/src/lib/pm/create-community.ts:64-69`
- Test: `apps/web/__tests__/pm/create-community.test.ts` (extend if exists; else add a focused test)

- [ ] **Step 1: Write/extend the failing test** asserting the founding membership role is `root_manager`:

```ts
it('assigns the community creator the root_manager role', async () => {
  // ...arrange the existing create-community happy-path harness...
  const result = await createCommunity(validInput);
  const founding = capturedUserRoleInserts.find((r) => r.userId === validInput.userId);
  expect(founding?.role).toBe('root_manager');
  expect(founding?.displayTitle).toBe('Administrator');
});
```

- [ ] **Step 2: Run → FAIL** (`cd apps/web && pnpm exec vitest run __tests__/pm/create-community.test.ts`). Expected: role is `'pm_admin'`.

- [ ] **Step 3: Edit `create-community.ts`** — change the founding insert:

```ts
    // 2. Link the creator as root_manager (creator-is-root, v3). Spec §3.5(a).
    await tx.insert(userRoles).values({
      userId: input.userId,
      communityId: cId,
      role: 'root_manager',
      displayTitle: 'Administrator',
    });
```

- [ ] **Step 4: Run → PASS.** Then `cd apps/web && pnpm exec tsc --noEmit`.

- [ ] **Step 5: Commit**

```bash
git checkout -b feat/role-v3-phase2-app origin/main   # AFTER PR-2a-mig merged
git add apps/web/src/lib/pm/create-community.ts apps/web/__tests__/pm/create-community.test.ts
git commit -m "feat(roles): community creator is root_manager (create-community)"
```

---

### Task 5: Creator-is-root — provisioning-service + onboarding title

**Files:**
- Modify: `apps/web/src/lib/services/provisioning-service.ts:225`
- Modify: `apps/web/src/lib/services/onboarding-service.ts:241-249` (`resolveDisplayTitle`)
- Test: `apps/web/__tests__/billing/provisioning-service.test.ts` (the suite that already covers the founding insert)

- [ ] **Step 1: Update the provisioning founding insert.** Line 225 currently:

```ts
    .values({ userId, communityId, role: 'pm_admin', presetKey: null, displayTitle, permissions: null })
```
Change `role: 'pm_admin'` → `role: 'root_manager'`. The two LOOKUP queries in this file (lines ~288/349) were already widened to `PM_SCOPE_DB_ROLES` in Phase 1, so they still find the founding row (PM_SCOPE includes root_manager).

- [ ] **Step 2: Update `resolveDisplayTitle`** in onboarding-service.ts so root_manager has a title (it currently returns 'Property Manager Admin' for the non-manager/non-resident fallback, which now also catches root_manager — acceptable, but make it explicit):

```ts
function resolveDisplayTitle(
  role: NewCommunityRole,
  isUnitOwner?: boolean,
  presetKey?: PresetKey,
): string {
  if (role === 'manager' && presetKey) return PRESET_METADATA[presetKey].displayTitle;
  if (role === 'resident') return isUnitOwner ? 'Owner' : 'Tenant';
  return 'Administrator';  // pm_admin (legacy) + root_manager + property_manager
}
```
(If `NewCommunityRole` type doesn't yet include the v3 values, widen the param to `TransitionRole` from `@propertypro/shared` — Phase 1 added it.)

- [ ] **Step 3: Update the provisioning test** — the assertion that the founding role is `pm_admin` becomes `root_manager`; the "no admin role found" guard test still passes (PM_SCOPE bilingual lookup). Run `cd apps/web && pnpm exec vitest run __tests__/billing/provisioning-service.test.ts` → PASS.

- [ ] **Step 4: tsc + commit**

```bash
cd apps/web && pnpm exec tsc --noEmit
git add apps/web/src/lib/services/provisioning-service.ts apps/web/src/lib/services/onboarding-service.ts apps/web/__tests__/billing/provisioning-service.test.ts
git commit -m "feat(roles): provisioning + onboarding founding user is root_manager"
```

---

### Task 6: Creator-is-root — demo-conversion founding user

**Files:**
- Modify: `apps/web/src/lib/services/demo-conversion.ts:296-312`
- Test: the demo-conversion test file if present (`apps/web/__tests__/**/demo-conversion*.test.ts`)

**Context:** demo-conversion creates a founding "board_president" manager. Per spec §3.5(a) the founding user of a converted demo is the root. Read lines 225-315 first: there's an existence check (`role='manager' AND preset_key='board_president'`) that short-circuits if a founding user exists — that check must become bilingual or it will re-create after backfill.

- [ ] **Step 1: Read demo-conversion.ts 225-315.** Confirm the two relevant spots: the existence check (~237, already widened to `MANAGER_TIER_DB_ROLES` in Phase 1 per the SQL sweep — verify) and the founding insert(s) (~302 `role:'manager'`, ~311 `role:'pm_admin'`).

- [ ] **Step 2: Make the founding user root_manager + board_president designation.** The founding board_president becomes:

```ts
        role: 'root_manager',
        designation: 'board_president',
        presetKey: 'board_president',   // preserved for the bilingual window
        displayTitle: 'Board President',
```
For the `pm_admin` founding insert at ~311 (if it's a separate PM-admin path), change `role: 'pm_admin'` → `role: 'root_manager'`. Read the surrounding logic to confirm which insert is the single founding/root user — there must be exactly ONE root per community (partial unique index). If the function inserts BOTH a board_president AND a pm_admin for one community, only ONE may be root_manager; make the board_president the root and leave the other as `property_manager` (NOT pm_admin). If unclear, STOP and report.

- [ ] **Step 3: Run the demo-conversion test (or add one) asserting exactly one root_manager per converted community + tsc.** Run `cd apps/web && pnpm exec vitest run -t "demo"` and `pnpm exec tsc --noEmit`.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/lib/services/demo-conversion.ts apps/web/__tests__/
git commit -m "feat(roles): demo-conversion founding user is root_manager + board_president designation"
```

---

### Task 7: Root-offboarding guard on account deletion

**Files:**
- Create: `apps/web/src/lib/account-lifecycle/root-offboarding.ts`
- Modify: `apps/web/src/lib/services/account-lifecycle-service.ts` (`requestUserDeletion`)
- Test: `apps/web/__tests__/lib/account-lifecycle/root-offboarding.test.ts`

**Context:** `POST /api/v1/account/delete` calls `requestUserDeletion(userId)` (route line 49). Today it has zero role-awareness. A root deleting their account would silently leave a community rootless. Guard: detect communities where the user is the sole root and block (require transfer) — but since root-only enforcement is Phase 3, this guard's job in 2a is to AUTO-FLAG, not hard-block, so it doesn't surprise users before the claim/transfer UX (2b) exists.

- [ ] **Step 1: Write the failing test** for the detection helper:

```ts
import { describe, expect, it, vi } from 'vitest';
import { findCommunitiesUserIsRootOf } from '@/lib/account-lifecycle/root-offboarding';

// mock the unscoped query layer the helper uses
it('returns community ids where the user holds root_manager', async () => {
  const ids = await findCommunitiesUserIsRootOf('user-1');
  expect(Array.isArray(ids)).toBe(true);
});
```

- [ ] **Step 2: Run → FAIL** (module not found).

- [ ] **Step 3: Implement `root-offboarding.ts`** (unscoped read — root_manager spans communities; AUTHZ: lifecycle-internal):

```ts
// AUTHZ: account-lifecycle internal — cross-community read of the caller's own
// root_manager memberships to flag rootless-on-deletion. Caller is the user themselves.
import { createUnscopedClient, userRoles } from '@propertypro/db/unsafe';
import { and, eq } from '@propertypro/db/filters';

/** Community ids where `userId` currently holds root_manager. */
export async function findCommunitiesUserIsRootOf(userId: string): Promise<number[]> {
  const db = createUnscopedClient();
  const rows = await db
    .select({ communityId: userRoles.communityId })
    .from(userRoles)
    .where(and(eq(userRoles.userId, userId), eq(userRoles.role, 'root_manager')));
  return rows.map((r) => r.communityId);
}
```
(Confirm the exact `@propertypro/db/unsafe` export names by grepping an existing unsafe consumer, e.g. `pm-portfolio.ts`. Add the `// AUTHZ:` comment immediately above the unsafe import — `guard:authz-comments` requires it.)

- [ ] **Step 4: Wire into `requestUserDeletion`.** Read `account-lifecycle-service.ts` `requestUserDeletion`; after it resolves the deletion request, call `findCommunitiesUserIsRootOf(userId)`; for each returned community, write a flag to the existing admin deletion-requests intervention surface (reuse the same mechanism the community-deletion intervention uses — grep `deletion-requests` in apps/admin and the service for the existing `logAuditEvent`/flag call; follow that pattern). Do NOT hard-block (Phase 3 will, once transfer UX exists). Add a structured log + audit entry: `action: 'root_pending_deletion'`.

- [ ] **Step 5: Test the wiring** with a mock that returns one root community; assert the flag/audit call fired. Run the test file → PASS. `pnpm exec tsc --noEmit`.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/lib/account-lifecycle/root-offboarding.ts apps/web/src/lib/services/account-lifecycle-service.ts apps/web/__tests__/lib/account-lifecycle/root-offboarding.test.ts
git commit -m "feat(roles): flag rootless-on-deletion when a root_manager requests account deletion"
```

---

### Task 8: Rootless-communities admin report

**Files:**
- Create: `apps/web/src/lib/db/rootless-communities.ts` (or `packages/db/src/queries/rootless-communities.ts` — match where pm-portfolio.ts lives)
- Create: `apps/admin/src/app/api/admin/communities/rootless/route.ts`
- Create: `apps/admin/src/app/communities/rootless/page.tsx`
- Test: query unit test

**Context:** Until claim-root (2b) runs, every existing community is rootless. Platform admins need visibility (and 2b's claim flow + this report are how communities converge). The admin app has no react-query/RTL — use plain fetch + the existing admin page patterns (see `apps/admin/src/app/communities`).

- [ ] **Step 1: Write the failing query test** asserting the query returns communities with zero `root_manager` rows:

```ts
import { describe, expect, it } from 'vitest';
import { findRootlessCommunities } from '<path>/rootless-communities';
it('lists communities lacking a root_manager', async () => {
  const rows = await findRootlessCommunities();
  expect(Array.isArray(rows)).toBe(true);
});
```

- [ ] **Step 2: Run → FAIL.**

- [ ] **Step 3: Implement the unscoped query** (`NOT EXISTS` a root_manager row, non-deleted communities):

```ts
// AUTHZ: platform-admin report — cross-community read, exposed only via the
// apps/admin authenticated platform-admin route.
import { createUnscopedClient, communities, userRoles } from '@propertypro/db/unsafe';
import { and, eq, isNull, notExists } from '@propertypro/db/filters';

export interface RootlessCommunityRow { id: number; name: string; slug: string; }

export async function findRootlessCommunities(): Promise<RootlessCommunityRow[]> {
  const db = createUnscopedClient();
  return db
    .select({ id: communities.id, name: communities.name, slug: communities.slug })
    .from(communities)
    .where(and(
      isNull(communities.deletedAt),
      notExists(
        db.select({ one: userRoles.id }).from(userRoles)
          .where(and(eq(userRoles.communityId, communities.id), eq(userRoles.role, 'root_manager'))),
      ),
    ))
    .orderBy(communities.name);
}
```
(Verify `notExists` is exported from `@propertypro/db/filters`; if not, use a left-join + `IS NULL` or a `sql` subquery. Confirm exact export names against an existing query file.)

- [ ] **Step 4: Run → PASS.**

- [ ] **Step 5: Admin route** `apps/admin/src/app/api/admin/communities/rootless/route.ts` — a GET that requires the platform-admin session (copy the auth pattern from `apps/admin/src/app/api/admin/communities/[id]/members/route.ts`) and returns `findRootlessCommunities()` as JSON.

- [ ] **Step 6: Admin page** `apps/admin/src/app/communities/rootless/page.tsx` — server-render the list (or plain fetch), a table of name/slug with a count header; add a nav entry if the admin app has a communities nav (match the existing pattern; check `apps/admin/src/app/layout.tsx`/nav). Title "Rootless Communities".

- [ ] **Step 7: tsc both apps + commit**

```bash
cd apps/web && pnpm exec tsc --noEmit && cd ../admin && pnpm exec tsc --noEmit
cd ../..
git add apps/web/src/lib/db/rootless-communities.ts apps/admin/src/app/api/admin/communities/rootless apps/admin/src/app/communities/rootless apps/admin/src/app/**/nav*.ts 2>/dev/null
git commit -m "feat(roles): platform-admin rootless-communities report"
```

---

### Task 9: Close-out

- [ ] **Step 1: Full battery** (no prod DB): `pnpm turbo run build --filter='./packages/*' --force`; `cd apps/web && pnpm exec tsc --noEmit`; `cd ../admin && pnpm exec tsc --noEmit`; `pnpm exec tsx scripts/verify-migration-ordering.ts`; `pnpm lint` (incl. `guard:legacy-roles` — these edits ADD `root_manager`/`designation` literals which are NOT in the legacy-name set, so the floor is unaffected; confirm). Then `pnpm --filter @propertypro/web build`.
- [ ] **Step 2: Open PR-2a-mig (Tasks 1-2) and PR-2a-app (Tasks 4-8).** Merge PR-2a-mig → run Task 3 prod apply → merge PR-2a-app.
- [ ] **Step 3:** Once 0018 is prod-applied + verified, write **Plan 2b** (claim-root flow) using the rootless-communities report as its driver. Next migration number after this plan: **0019** (reserved for Phase 4 cleanup; 2b/2c are code-only unless the claim/transfer needs an audit-table change).
