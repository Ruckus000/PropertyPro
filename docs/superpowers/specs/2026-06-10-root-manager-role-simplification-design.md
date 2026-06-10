# Root-Manager Role Simplification — Design

**Date:** 2026-06-10
**Status:** Approved by product owner (this doc); implementation plan to follow
**Supersedes:** ADR-001 (canonical role model, Proposed) — a superseding ADR ships in Phase 3

## 1. Problem

The user-facing role structure is confusing. Seven legacy roles (`owner`, `tenant`, `board_member`, `board_president`, `cam`, `site_manager`, `property_manager_admin`) persist throughout the codebase even though a prior simplification (archived migrations 0091–0095, now folded into the squashed baseline) already reduced **storage** to three roles: `resident` (+ `isUnitOwner`), `manager` (+ `presetKey`), `pm_admin`.

The seven-role vocabulary survives only in the derived layer:

- `RBAC_MATRIX` keyed on legacy role names (`packages/shared/src/rbac-matrix.ts`)
- Manager presets (`packages/shared/src/manager-presets.ts`) and per-membership `permissions` JSONB
- Role-set constants: `ADMIN_ROLES`, `BOARD_ROLES`, `STAFF_ROLES`, `ELEVATED_ROLES`, `RESIDENT_ROLES` (`packages/shared/src/access-policies.ts`), `BILLING_ADMIN_ROLES` (`packages/shared/src/billing/permissions.ts`)
- ~200–330 role string literals across `apps/web`, `apps/admin`, `packages/*`
- 45 help-center MDX files, seeds, `/dev/agent-login`, notification services, docs

## 2. Decisions (product owner, 2026-06-10)

1. **Board roles become designations**, not permission roles.
2. **Owner/tenant stay merged as `resident`** with a type attribute (already true in storage via `isUnitOwner`).
3. **Creator is root, per property.** One account can be root of many communities; the PM dashboard aggregates communities where the user is root or property manager.
4. **Root-exclusive powers:** role assignment, billing/subscription, community deletion, root transfer. Property managers get everything else.
5. **Backfill:** all current admins become `property_manager`; root starts **vacant**; next admin to log in hits a blocking claim prompt.
6. **Rollout:** phased with a compat layer and CI guard floor (no flag day).
7. **Approach:** extend the v2 membership model in place (root is a membership role, visible to RBAC).
8. **Designations can sit on any role** (resolves the board-people-are-currently-managers tension).
9. **Presets and per-manager permission JSONB dissolve** into one uniform `property_manager` capability set.

## 3. Target model

### 3.1 Roles (on `user_roles`, one per user per community)

| Role | Cardinality | Powers |
|---|---|---|
| `root_manager` | ≤ 1 per community (partial unique index); vacancy allowed | Everything, incl. the four root-exclusive powers |
| `property_manager` | unbounded; minted only by root | Union of today's cam/site_manager/pm_admin operational powers, minus root-exclusive four |
| `resident` | unbounded | As today; `isUnitOwner` distinguishes owner vs tenant for voting, assessments, leases, billing CTAs |

### 3.2 Designation (new)

- Nullable `designation` column on `user_roles`: `'board_president' | 'board_member'`.
- ≤ 1 `board_president` per community (partial unique index).
- Valid on **any** role. Self-managed board president = `root_manager` + `board_president` designation.
- Statutory features (board-meeting calls / 48-hour notices, election certification, violation hearings) check designation via a new `requireBoardDesignation()` helper. General permissions never read it.

### 3.3 What dissolves

- `presetKey`, `permissions` JSONB, `legacyRole` (kept read-only through transition, dropped in cleanup).
- `pm_admin` as a scope discriminator: PM portfolio queries change from `role = 'pm_admin'` to `role IN ('root_manager','property_manager')`.
- `RBAC_MATRIX` shrinks to 3 community types × 3 roles; resident rows still split internally by `isUnitOwner` exactly as `checkPermissionV2()` does today.
- Community-type constraints re-key: apartments get no designations and no `isUnitOwner=true` residents; condo/HOA get the full set.
- `BILLING_ADMIN_ROLES` → root-only. Billing-group `ownerUserId` must be root of member communities.

### 3.4 What does not change

Tenant isolation (scoped client, RLS, `community_id` FK), election eligibility (already per-unit ownership snapshots, role-agnostic — verified safe), `compliance_audit_log` (keyed on `userId`, no role column), plan gating (community property), help-center MDX as content source of truth.

## 4. Transition plan

### Phase 0 — Verify reality (no code)

- Dump prod `information_schema` via Supabase MCP (project `vbqobyagjzvlfpfozvmx`): `user_role_v2` enum values, `user_roles` columns, role/presetKey row distribution, presence of orphaned legacy `user_role` type.
- Reconcile against the squashed ledger (live: 0000–0013; next: **0014**). Fix the stale `.claude/rules/migration-safety.md` (claims 0036).
- **The deploy pipeline does NOT run `db:migrate`** (2026-06-04 incident). Every migration below ships with an explicit manual prod-apply step.

### Phase 1 — Additive foundations (zero behavior change)

- **Migration 0014:** `ALTER TYPE user_role_v2 ADD VALUE 'root_manager', 'property_manager'`; add `designation` column + CHECK; partial unique indexes (≤1 root, ≤1 board_president per community, both `WHERE deleted_at IS NULL`). Note: `ADD VALUE` transaction semantics may force a file split (new enum values unusable in the same transaction) — resolve in implementation plan; indexes must also appear in the Drizzle table callback (custom-domain lesson).
- **Compat shim:** promote `inferCanonicalRoleFromMembership()` to the single legacy-role resolver (`resolveLegacyRole(membership)`), extended to map new values (`root_manager`/`property_manager` → legacy equivalents). All legacy role-set checks reroute through it during the drain.
- **CI guard `guard:legacy-roles`:** counts legacy role literals outside the shim + allowlist; floor = current count; ratchets down per drain PR. Help MDX excluded from the count until its drain step.

### Phase 2 — Data migration + new UX

- **Migration 0015 (backfill):**

| Current | Becomes |
|---|---|
| `manager` + preset `board_president` | `property_manager` + designation `board_president` |
| `manager` + preset `board_member` | `property_manager` + designation `board_member` |
| `manager` + preset `cam` or `site_manager` | `property_manager` |
| `pm_admin` | `property_manager` |
| `resident` (either `isUnitOwner`) | unchanged |
| — | root vacant everywhere |

- **Claim-root flow:** blocking prompt for `property_manager`s in rootless communities on next authenticated dashboard load. First claim wins — the partial unique index makes a concurrent double-claim a clean transactional loser. Claim audited to `compliance_audit_log`; other admins notified via Resend; platform-admin app gets a reassign/override screen; root-initiated transfer flow included.
- **Creation:** community creator is auto-assigned `root_manager` (onboarding + PM add-community + provisioning paths).
- **Role management UI:** root-only screen to assign/revoke `property_manager`, set designations, transfer root. Property managers may still invite residents (role implicit); only root mints property managers.

### Phase 3 — The drain (PR-by-PR, guard-ratcheted)

Order: ① RBAC matrix + access-control core (3×3 + `requireBoardDesignation()`); ② role-set constants derived from new model; ③ PM portfolio/cross-community queries (`pm-portfolio.ts`, `role-guard.ts` aliases, `community-context.ts`); ④ contract-suite expectations + 16 integration-test files + `vi.mock` fixtures; ⑤ UI literals (~40+ page docblocks, nav-config, mobile `ADMIN_PRESETS` — also fixes the latent invalid `property_manager_admin`-as-presetKey entry), seeds, agent-login (legacy `?as=` values kept as aliases; update `.claude/rules/agent-testing.md`); ⑥ help MDX (45 files), superseding ADR, `docs/RBAC_MATRIX.md`, notification-service recipient targeting; ⑦ admin app member endpoints + role option lists.

### Phase 4 — Cleanup

- **Migration 0016+:** rebuild `user_role_v2` without `manager`/`pm_admin`; drop `presetKey`, `permissions` JSONB, `legacyRole`; drop orphaned legacy `user_role` type.
- Delete the compat shim; `guard:legacy-roles` flips from floor to forbid. Legacy agent-login aliases may remain as conveniences — the alias map file is the one permanent entry on the guard's allowlist.

## 5. Testing & CI

- Per phase: unit tests, contract suite (285 contracts; RBAC metadata re-keyed in ④), integration sweep (grep both URL-substring and route-module patterns), `seed:verify`, agent-login smoke per role, preview verification of claim-root and role-assignment UX.
- Existing guards (`guard:db-access`, `guard:contracts`, `guard:breadcrumbs`, `guard:tenant-scope`, `guard:hook-requestjson`) unaffected; `guard:legacy-roles` added in Phase 1.
- Fresh-worktree trap: run `pnpm turbo run build --filter='./packages/*'` before web tests.

## 6. Accepted consequences & risks

- **Board backfill gains write powers:** former read-only board members become full property_managers; root can demote to `resident` + designation afterward. Accepted.
- **Rootless lockout:** until claimed, billing/role-assignment/deletion are unavailable in that community. Accepted.
- **Granularity loss:** no per-manager permission overrides post-cleanup. Accepted (simplification mandate).
- **Risk — prod drift:** mitigated by Phase 0 verification and manual-apply runbooks.
- **Risk — enum surgery:** `ADD VALUE` is additive/safe; the Phase 4 enum rebuild rewrites the column and is sequenced last, after all code reads new values only.
- **Risk — claim disputes:** first-claim-wins is auditable and platform-admin-reversible.

## 7. Out of scope

E-voting attorney-review gate (unchanged, still blocking for e-voting features), platform-admin role model (`platform_admin_users` separate table, untouched), billing-group volume-tier mechanics (unchanged beyond root-ownership rule).
