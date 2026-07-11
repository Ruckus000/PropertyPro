# Phase 3.3 — Behavior-Neutral Vocabulary Drain Design

**Date:** 2026-06-15
**Status:** Approved by product owner (decisions below); implementation plan to follow
**Parent spec:** `docs/superpowers/specs/2026-06-10-root-manager-role-simplification-design.md` §3.3 (What dissolves), Phase 3 drain order ②/⑤/⑥
**Depends on:** Phases 1 / 2a / 2b / 2c / 3.1 / 3.2 (all merged + live), plus the invariant-3 lockdown (#731). `designation` is the live board source of truth; `BOARD_DESIGNATIONS` / `hasBoardDesignation` / `isBoardPresident` live in guard-exempt `packages/shared/src/role-transition.ts`.

## 1. Purpose

Drain legacy 7-role vocabulary from **shim-independent** code and from documentation, delete provably-dead role-set constants, and ratchet `guard:legacy-roles` — **without touching permission resolution**. This is a prerequisite for the Phase 4 flip of `guard:legacy-roles` from floor to ban. The substantive, behavior-changing pieces of "collapse to 3 roles" are explicitly **deferred** (see §6).

## 2. Verified current state (why this is the right scope)

Confirmed against code + prod (read-only Supabase MCP) on 2026-06-15:

- **Prod `user_roles`:** 442 resident, 850 property_manager (118 board_member + 461 board_president + 2 cam + 48 site_manager + 211 ex-pm_admin null-perms + 10 custom-JSONB), **0 manager / 0 pm_admin / 0 root_manager** (root vacant everywhere). All 579 board rows carry `designation == preset_key` (0 mismatch).
- **The uniform-property_manager collapse is a large LIVE widening, not a cosmetic change.** Per-row write-permission counts today (of ~23 resources): board_president 18–21, cam 21, but **board_member 0–13, site_manager 0–17, custom 12–13**. Making `property_manager` uniform (full operational set) would widen **~176 prod rows** to full write (finances, contracts, elections, violations, …) the moment `checkPermissionV2` stops reading the JSONB. The parent spec accepts "uniform property_manager / granularity loss," but the magnitude (a 0-write board member → full operational) makes this the program's single riskiest change. **Decision: defer it** (§3.1).
- **Root-only authority cannot ship yet.** With 0 `root_manager` rows, making billing/community-deletion root-only would lock out all 850 admins. That step (3.4) is gated on claim-root adoption.
- **The `inferCanonicalRoleFromMembership` shim stays until Phase 4.** Therefore every file that consumes its *legacy-name output* — `nav-config.ts` role allowlists, `feature-gate*.tsx`, `app-sidebar.tsx`, billing — must keep its legacy literals until the shim dies. These are **not** drainable in 3.3.
- **Drainable-now code is shim-independent display/seed logic:** `welcome/page.tsx`'s local `resolveEffectiveDisplayRole` + `welcome-screen.tsx`; `compliance-command-center.tsx`'s own `BOARD_LIKE_ROLES`/`CAM_LIKE_ROLES`; `seed-community.ts`. Dead constants `STAFF_ROLES`/`RESIDENT_ROLES` have 0 importers.
- **Guard:** `guard:legacy-roles` FLOOR = 241 = live count; regex counts `'board_member'|'board_president'|'cam'|'site_manager'|'property_manager_admin'` single-quoted literals in `apps/web/src`, `apps/admin/src`, `packages/*/src`; EXEMPT = `role-transition.ts`, `billing/permissions.ts`. Docs are **not** scanned. Top legacy-literal holders: `rbac-matrix.ts` (26, structural — Phase 4), `seed-community.ts` (20), `welcome-screen.tsx` (17), `access-policies.ts` (17, structural — Phase 4), `manager-presets.ts` (12, Phase 4), `welcome/page.tsx` (11), `compliance-command-center.tsx` (11), `nav-config.ts` (7, shim-dependent — Phase 4).

## 3. Decisions (product owner, 2026-06-15)

1. **Defer the uniform-property_manager widening.** 3.3 does NOT change `checkPermissionV2`, the JSONB read path, `RBAC_MATRIX` structure, or `community-membership` permission normalization. The widening ships later as a deliberate, product-signed-off, prod-audited step bundled with the Phase 4 migration.
2. **3.3 = behavior-neutral drain** of shim-independent code + dead constants + docs + guard ratchet. Two contained, documented exceptions where the legacy vocabulary cannot be drained without collapsing a distinction the v3 model doesn't keep: the **seed drain** (§3.4) and the **welcome cam/site_manager onboarding collapse** (§4.1 task 3, 50 rows, onboarding-only). Both are end-state-aligned, change no permissions or data, and are loudly tested.
3. **Include the help/docs drain** (45 help-center MDX files + a superseding ADR + `docs/RBAC_MATRIX.md`) — user-facing accuracy; addresses a known 7-role/3-role inconsistency. Not guard-scanned.
4. **Full seed drain** (accepted as the one intentional non-neutrality): rewrite the demo-community definitions + `mapCanonicalToV2` to v3-only vocabulary, drop `presetKey` output, write `designation` via `BOARD_DESIGNATIONS`, and let perms resolve through the matrix-fallback. Seeded/test environments will model the **v3 end-state** (uniform property_manager, designation-only board distinction) and thereby diverge from prod (which stays restricted until the widening migration). Accepted: demo data does not need prod's transitional permission granularity, and this makes the seed the reference implementation of the end state.
5. **Defer** (not in 3.3): seed-independent shim-dependent literal files; mobile `ADMIN_PRESETS`; `rbac-matrix`/`access-policies` structural literals; PM-portfolio query collapse; `roles:write` matrix entry; billing/deletion → root-only; the shim deletion. See §6.

## 4. Scope

### 4.1 In scope (each a small, independently-shippable task)

| # | Area | Change | Neutrality |
|---|---|---|---|
| 1 | **Dead constants** | Delete `STAFF_ROLES`, `RESIDENT_ROLES` from `packages/shared/src/access-policies.ts` (verify 0 importers at implementation). | Neutral (dead code). |
| 2 | **Compliance view-mode** | `apps/web/src/components/compliance/compliance-command-center.tsx`: re-key `BOARD_LIKE_ROLES` (`{board_president, board_member}`) → `hasBoardDesignation(membership.designation)`; keep the CAM-view default for other admin-tier roles via `isAdmin`. Drains ~11 literals. | Neutral — designation==board on all prod board rows; default view unchanged for everyone. |
| 3 | **Welcome display** | `apps/web/src/app/(authenticated)/welcome/page.tsx` local `resolveEffectiveDisplayRole` + `apps/web/src/components/onboarding/welcome-screen.tsx` + `getItemKeysForRole` in `onboarding-checklist-service.ts`: re-key card selection / greeting / checklist-item resolution onto `role` + `designation` + `isUnitOwner` instead of inferred legacy names. Drains ~28 literals (+ the checklist-service ones). | **Neutral for all cohorts EXCEPT site_manager + cam (50 prod rows), onboarding-only:** distinguishing cam from site_manager requires reading `presetKey` (the only thing separating them post-3.2, and `'cam'`/`'site_manager'` ARE counted literals), so draining collapses them to the v3 "Property Manager". Effects: (a) cam(2)+site_manager(48) greeting label → "Property Manager" (cosmetic); (b) site_manager(48) onboarding checklist flips owner/tenant→admin (today `getItemKeysForRole` lets site_manager fall through to owner/tenant items; a generic property_manager gets admin items). One-time, end-state-aligned, no permission/data change. board_member→BOARD_MEMBER_ITEMS and every other cohort verified parity (snapshot tests). |
| 4 | **Full seed drain** | `packages/db/src/seed/seed-community.ts` + the demo-community definitions: express seeded roles in v3 vocabulary (resident / property_manager / root_manager) + `designation` (from `BOARD_DESIGNATIONS`); `mapCanonicalToV2` (or its replacement) stops emitting `presetKey` and preset-derived perms; perms resolve via the matrix-fallback. Update `seed:verify` and the integration-test fixtures that read seeded shapes. Drains ~20 literals. | **Intentional non-neutrality** (§3.4): seeded board members become uniform-full-ops + designation; prod unchanged. |
| 5 | **Docs / help** | Drain the 7-role vocabulary from the 45 help-center MDX files, write a superseding ADR (ADR-001 was "Proposed"; the v3 model supersedes it), and update `docs/RBAC_MATRIX.md` to the 3-role model. | Neutral (documentation; not guard-scanned). |
| 6 | **Guard ratchet** | Lower `scripts/verify-legacy-roles.ts` FLOOR to the new count after tasks 1–4 land (≈ 241 − 59). | — |

### 4.2 Non-negotiable invariants

- `checkPermissionV2`, `requirePermission`, `getMembershipResourceAccess`, the JSONB `permissions` read, `normalizeManagerPermissions`, and `RBAC_MATRIX` structure are **untouched**.
- No new single-quoted board/cam/site_manager/property_manager_admin literals in scanned src — board distinctions use `hasBoardDesignation`/`isBoardPresident`/`BOARD_DESIGNATIONS` from the exempt `role-transition.ts`; the welcome/compliance/seed re-keys must not introduce counted literals (derive, don't inline).
- The 2c strict-root endpoints (role-assignments / designations / transfer-root) and `requireBoardDesignation` are untouched.
- No contract gains a `permission` for `roles` (still ∉ RBAC_RESOURCES until 3.4).
- No migration. Next migration number stays **0020** (Phase 4).

## 5. Testing

- **Welcome (task 3):** snapshot/parity test asserting, for every `{role, designation, isUnitOwner}` combination present in prod, the same welcome card + greeting + `getItemKeysForRole` output as the pre-drain resolver.
- **Compliance (task 2):** view-mode parity — board-designated → board view; other admin-tier → cam view; resident unaffected.
- **Seeds (task 4):** `pnpm seed:verify` green against the new v3 shapes; update integration fixtures that assert seeded role/preset shapes; assert seeded board members carry `role='property_manager'` + `designation` + null preset (end-state shape). Do NOT run `seed:demo`/migrations against the local DB (local `DATABASE_URL` = prod).
- **Dead constants (task 1):** typecheck proves 0 importers; full unit suite green.
- **Guard:** `pnpm guard:legacy-roles --report` confirms the new count; ratchet FLOOR to it.
- **Battery:** full guard set + `cd apps/web && pnpm exec tsc` + `cd apps/admin && pnpm exec tsc` + `pnpm lint` + `pnpm turbo run build --filter='./packages/*' --force` + `pnpm test`. The 3 known local collect-fail tests (`site-page`, `esign-my-pending`, `calendar-event-reminder-service`) are the `Missing DATABASE_URL` env limitation — CI is the gate.
- **vi.mock sweep:** any new `@propertypro/shared` import in a mocked module → add the export to every `vi.mock('@propertypro/shared'…)` factory in the affected test files.

## 6. Out of scope — deferred ledger (recorded so the boundary is explicit)

- **Uniform-property_manager widening** (the ~176-row permission change) → product-signed-off, prod-audited step with the Phase 4 migration.
- **Billing / community-deletion → root-only**, and the **`roles:write` matrix entry** that retires the 2c explicit checks → **3.4**, gated on claim-root adoption (0 root_manager rows today).
- **Shim-dependent literal files** (`nav-config.ts`, `feature-gate*.tsx`, `app-sidebar.tsx`, billing) → Phase 4, with the `inferCanonicalRoleFromMembership` deletion (they match its legacy output).
- **Mobile `ADMIN_PRESETS`** (`MobileHomeContent.tsx`, `MobileProfileContent.tsx`) → separate bugfix (chip `task_c1c604e2`): re-keying to designation/`isAdmin` would *fix* a latent admin-sees-resident-UI bug — a correctness change, not a neutral drain.
- **`rbac-matrix.ts` (26) + `access-policies.ts` structural (17) literals** → Phase 4, rewritten alongside the matrix collapse / widening.
- **PM-portfolio query collapse** (bilingual → v3-only) → Phase 4 (keeps the bilingual safety net while the enum still allows v2 values; ~0 gain now).
- **`inferCanonicalRoleFromMembership` deletion** and `manager-presets.ts` deletion → Phase 4.

## 7. Open questions (recorded, not blocking)

- **Seed root_manager:** should seeded communities mint a `root_manager` (modeling the end state) or leave root vacant like prod? Lean: leave vacant (matches prod + the claim-root flow); decide at implementation.
- **ADR numbering:** confirm the superseding ADR number/location with the existing `docs/adr/` sequence at implementation.
