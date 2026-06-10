# Root-Manager Role Simplification — Design

**Date:** 2026-06-10 (amended 2026-06-10 after adversarial review)
**Status:** Approved by product owner; amendments from verified design review applied; implementation plan to follow
**Supersedes:** ADR-001 (canonical role model, Proposed) — a superseding ADR ships in Phase 3

## 1. Problem

The user-facing role structure is confusing. Seven legacy roles (`owner`, `tenant`, `board_member`, `board_president`, `cam`, `site_manager`, `property_manager_admin`) persist throughout the codebase even though a prior simplification (archived migrations 0091–0095, now folded into the squashed baseline) already reduced **storage** to three roles: `resident` (+ `isUnitOwner`), `manager` (+ `presetKey`), `pm_admin`.

Root cause: the previous migration stopped halfway — storage moved, the derived/vocabulary layer never drained. Two models coexist, bridged by presets:

- `RBAC_MATRIX` keyed on legacy role names (`packages/shared/src/rbac-matrix.ts`)
- Manager presets (`packages/shared/src/manager-presets.ts`) and per-membership `permissions` JSONB
- Role-set constants: `ADMIN_ROLES`, `BOARD_ROLES`, `STAFF_ROLES`, `ELEVATED_ROLES`, `RESIDENT_ROLES`, `BILLING_ADMIN_ROLES`
- ~200–330 role string literals across `apps/web`, `apps/admin`, `packages/*`
- **DB-level role-value predicates** (SQL `WHERE` clauses and RLS functions — see §4 Phase 1, these cannot be served by any app-layer shim)
- 45 help-center MDX files, seeds, `/dev/agent-login`, notification services, docs

## 2. Decisions (product owner, 2026-06-10)

1. **Board roles become designations**, not permission roles.
2. **Owner/tenant stay merged as `resident`** with a type attribute (already true in storage via `isUnitOwner`).
3. **Creator is root, per property.** One account can be root of many communities; the PM dashboard aggregates communities where the user is root or property manager.
4. **Root-exclusive powers:** role assignment, billing/subscription, community deletion, root transfer. Property managers get everything else.
5. **Backfill:** all current admins become `property_manager`; root starts **vacant**; claim flow on next admin login.
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

Index: `UNIQUE (community_id) WHERE role = 'root_manager'`. **Note:** `user_roles` has no `deleted_at` — memberships are hard-deleted (FK cascade); this is a pre-existing exception to the soft-delete convention, so the predicates carry no `deleted_at` clause.

### 3.2 Designation (new)

- Nullable `designation` column on `user_roles`: `'board_president' | 'board_member'` (DB `CHECK` + Zod enums at every route).
- ≤ 1 `board_president` per community: `UNIQUE (community_id) WHERE designation = 'board_president'`.
- Valid on **any** role. Self-managed board president = `root_manager` + `board_president` designation.
- Statutory features (board-meeting calls / 48-hour notices, election certification, violation hearings) check designation via a new `requireBoardDesignation()` helper. General permissions never read it. Designation writes are root-only.

### 3.3 What dissolves

- `presetKey`, `permissions` JSONB, `legacyRole` (kept read-only through transition, dropped in cleanup).
- `pm_admin` as a scope discriminator: PM portfolio queries change from `role = 'pm_admin'` to `role IN ('root_manager','property_manager')` (same index usage — these lookups lead on `user_id`/`community_id`).
- `RBAC_MATRIX` shrinks to 3 community types × 3 roles; resident rows still split internally by `isUnitOwner` exactly as `checkPermissionV2()` does today. A `roles:write` action exists and is root-only.
- Community-type constraints re-key: apartments get no designations and no `isUnitOwner=true` residents; condo/HOA get the full set.
- `BILLING_ADMIN_ROLES` → root-only at end state (see §6 transition drift).

### 3.4 What does not change

Tenant isolation (scoped client, RLS, `community_id` FK), election eligibility (per-unit ownership snapshots — `elections.ts` `ownerUserId`, role-agnostic, verified), `compliance_audit_log` (keyed on `userId`, no role column), plan gating (community property), `announcementsWriteLevel`-style settings (store `'admin_only'`, not role lists — verified in `pp_rls_community_allows_member_writes`), help-center MDX as content source of truth.

### 3.5 Security invariants (all role-write paths)

Verified role-insertion sites (8): `lib/pm/create-community.ts:64`, `lib/join-requests/approve-request.ts:220`, `lib/services/resident-service.ts:229`, `lib/services/provisioning-service.ts:224`, `lib/services/onboarding-service.ts:124`, `lib/services/access-request-service.ts:323`, `lib/services/demo-conversion.ts:296`, `lib/services/import-residents-service.ts:118` — plus the residents role-change PATCH.

Invariants every path must enforce (app-layer; RLS + partial index as backstop):

1. `root_manager` is settable ONLY via: (a) community creation (creator-is-root, wired into the admin-minting paths: create-community, provisioning, onboarding, demo-conversion), (b) the claim flow (requires vacancy + claimant holds `property_manager` in that community), (c) root-initiated transfer, (d) platform-admin override in apps/admin.
2. The root's own membership row is modifiable only by the root or platform admin.
3. Resident-minting paths (join-requests, access-requests, import, resident-service, invitations) can never write a manager-tier role; only root mints `property_manager`.
4. Claim, transfer, demote, and designation changes are written to `compliance_audit_log`.
5. New endpoints (claim, transfer, role assignment) ship as runRoute contracts with `tenantScope` per `api-patterns.md`.

## 4. Transition plan

### Phase 0 — Verify reality (no code)

- Dump prod `information_schema` via Supabase MCP (project `vbqobyagjzvlfpfozvmx`): `user_role_v2` enum values, `user_roles` columns, role/presetKey row distribution, presence of orphaned legacy `user_role` type.
- **Count designation-backfill collisions in prod:** communities with >1 `presetKey='board_president'` rows (no uniqueness exists today — verified).
- Reconcile against the squashed ledger (live: 0000–0013; next: **0014**). Fix the stale `.claude/rules/migration-safety.md` (claims 0036).
- **The deploy pipeline does NOT run `db:migrate`** (2026-06-04 incident). Every migration ships with an explicit manual prod-apply step.

### Phase 1 — Additive foundations + bilingual window (zero behavior change)

- **Migration 0014a:** `ALTER TYPE user_role_v2 ADD VALUE 'root_manager';` and `ALTER TYPE user_role_v2 ADD VALUE 'property_manager';` (one value per statement — PG syntax; separate file because new enum values are unusable in the transaction that adds them; runner is `drizzle-kit migrate`, transactional per file).
- **Migration 0014b:** `designation` column + CHECK; both partial unique indexes (§3.1, §3.2 — no `deleted_at` predicate). Indexes must also appear in the Drizzle table callback (custom-domain lesson).
- **Migration 0014c — RLS bilingual:** update `pp_rls_can_read_audit_log()` (baseline `0000_nappy_guardian.sql:1756`) and any other role-branching RLS function to `role IN ('manager','pm_admin','root_manager','property_manager')`. RLS changes live in migration SQL, never applied manually.
- **Bilingual sweep PR (code):** every DB-level role predicate accepts old AND new values. Verified inventory (13 sites): `pm-portfolio.ts:61,82`; `provisioning-service.ts:288,349`; `site-portfolio-template-service.ts:98`; `billing-group-service.ts:411`; `account-lifecycle-service.ts:915/932` (`LIFECYCLE_ADMIN_ROLES`); `downgrade-notifications.ts:35`; `demo-conversion.ts:237`; `public-community-reader.ts:352`; `payment-alert-scheduler.ts:85`; `resident-service.ts:86,92`. This sweep also removes the hardcoded `as ('resident'|'manager'|'pm_admin')[]` casts, which would otherwise keep compiling while silently excluding new values.
- **Compat shim:** extend `inferCanonicalRoleFromMembership()` (promoted to `resolveLegacyRole()`) to map new values — `root_manager → property_manager_admin`, `property_manager → cam` — BEFORE any backfill. As written today the function falls through to `'tenant'` for unknown role values; shipping the backfill first would demote every admin to tenant in billing/plan-gate logic.
- **CI guard `guard:legacy-roles`:** counts legacy role literals AND legacy union-type casts outside the shim + allowlist; floor = current count; ratchets down per drain PR. Help MDX excluded until its drain step.

**Phase 2 is gated on all of Phase 1 being deployed to prod** (enum values present, RLS bilingual, code bilingual, shim extended). This ordering is what makes "no flag day" true — the original draft of this spec had the backfill before the query updates, which would have broken the PM dashboard and admin-tier RLS in a single deploy.

### Phase 2 — Data migration + new UX

- **Migration 0015 (backfill):**

| Current | Becomes |
|---|---|
| `manager` + preset `board_president` | `property_manager` + designation `board_president` (earliest `createdAt` per community; additional president-preset rows get designation `board_member` — deterministic dedup, each demotion audit-logged) |
| `manager` + preset `board_member` | `property_manager` + designation `board_member` |
| `manager` + preset `cam` or `site_manager` | `property_manager` |
| `pm_admin` | `property_manager` |
| `resident` (either `isUnitOwner`) | unchanged |
| — | root vacant everywhere |

- **Claim-root flow:** property_managers in rootless communities see a claim prompt on next authenticated load. **Multi-community admins get ONE aggregated screen** ("you manage N rootless communities — claim all / choose"), backed by a single grouped query; the rootless check piggybacks on the existing membership/community fetch (no per-community N+1 on PM dashboards). First claim wins — the partial unique index makes a concurrent double-claim a clean transactional loser. Every claim immediately notifies all other admins of that community (Resend) with a one-click **dispute** link that flags the community in the apps/admin intervention queue; platform admin can reassign. Root-initiated transfer flow included.
- **Billing groups during transition:** the end-state rule "billing-group `ownerUserId` must be root of member communities" is **root-candidacy only** until Phase 4 (the backfill leaves root vacant, so strict enforcement at 0015 time would invalidate every billing group instantly). The aggregated claim screen is how group owners converge to compliance.
- **Root offboarding:** an account-deletion request (`/api/v1/account/delete` — verified to have no role-awareness today) by a community's root requires root transfer first, or auto-flags the community in the existing admin deletion-requests intervention queue. A standing admin-app report lists rootless communities (covers the zero-admin case where nobody can ever claim).
- **Creation:** community creator is auto-assigned `root_manager` across the admin-minting paths (§3.5).
- **Role management UI:** root-only screen to assign/revoke `property_manager`, set designations, transfer root. Property managers may still invite residents (role implicit); only root mints property managers.

### Phase 3 — The drain (PR-by-PR, guard-ratcheted)

Order: ① RBAC matrix + access-control core (3×3 + `requireBoardDesignation()` + root-only `roles:write`/billing/deletion); ② role-set constants derived from the new model; ③ PM portfolio/cross-community queries collapse bilingual → new-only; ④ contract-suite expectations + 16 integration-test files + `vi.mock` fixtures; ⑤ UI literals (~40+ page docblocks, nav-config, mobile `ADMIN_PRESETS` — fixes the latent invalid `property_manager_admin`-as-presetKey entry), seeds, agent-login (legacy `?as=` values kept as aliases; update `.claude/rules/agent-testing.md`); ⑥ help MDX (45 files), superseding ADR, `docs/RBAC_MATRIX.md`, notification-service recipient targeting; ⑦ admin app member endpoints + role option lists.

### Phase 4 — Cleanup

- **Migration 0016+:** rebuild `user_role_v2` without `manager`/`pm_admin`; drop `presetKey`, `permissions` JSONB, `legacyRole`; drop orphaned legacy `user_role` type; RLS functions go new-values-only; billing-group root-ownership rule becomes enforced.
- Delete the compat shim; `guard:legacy-roles` flips from floor to forbid (agent-login alias map is the one permanent allowlist entry).

## 5. Testing & CI

- Per phase: unit tests, contract suite (285 contracts; RBAC metadata re-keyed in ④), integration sweep (grep both URL-substring and route-module patterns), `seed:verify`, agent-login smoke per role, preview verification of claim-root and role-assignment UX.
- **Pinned edge cases** (implementation plan must carry these): concurrent double-claim race (index loser gets clean 409), backfill president-collision dedup determinism, bilingual-window dual-value queries (old+new rows both found), type-cast regression (new enum values not silently excluded), rootless-community lockout behavior (root-only routes 403 cleanly), root-deletion guard, multi-community aggregated claim.
- Existing guards unaffected; `guard:legacy-roles` added in Phase 1.
- Fresh-worktree trap: run `pnpm turbo run build --filter='./packages/*'` before web tests.

## 6. Accepted consequences & risks

- **Board backfill gains write powers** — including, during the transition window, **plan purchase** (shim maps `property_manager → cam`, and cam is in `BILLING_ADMIN_ROLES`; the subscribe route gates `settings:write`). Root-only billing is enforced from Phase 3 ① onward. Root can demote ex-board members to `resident` + designation at any time after claim. Accepted, stated loudly.
- **Rootless lockout:** until claimed, billing/role-assignment/deletion are unavailable in that community. Accepted; admin-app rootless report provides visibility.
- **Granularity loss:** no per-manager permission overrides post-cleanup. Accepted (simplification mandate).
- **First-claim governance:** any backfilled admin can claim before the "right" person; mitigated by immediate notification + dispute flag + platform-admin reversal (not prevented — accepted per product decision).
- **Risk — prod drift:** mitigated by Phase 0 verification and manual-apply runbooks.
- **Risk — enum surgery:** `ADD VALUE` is additive/safe; the Phase 4 rebuild rewrites the column and is sequenced last, after all code reads new values only.

## 7. Out of scope

E-voting attorney-review gate (unchanged, still blocking for e-voting features), platform-admin role model (`platform_admin_users`, untouched), billing-group volume-tier mechanics (unchanged beyond the root-ownership rule).
