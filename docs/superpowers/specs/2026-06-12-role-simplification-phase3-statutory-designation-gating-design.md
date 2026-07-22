# Phase 3.1 — Statutory Designation Gating (Foundation) Design

**Date:** 2026-06-12
**Status:** Approved by product owner (decisions below); implementation plan to follow
**Parent spec:** `docs/superpowers/specs/2026-06-10-root-manager-role-simplification-design.md` §3.2 (Designation)
**Depends on:** Phases 1 / 2a / 2b / 2c (all merged + live). The `designation` column, its `CHECK`, the one-`board_president` partial unique index, and the root-only `POST /communities/designations` write path already exist in prod; migration **0018** already set `designation` on all 579 board rows (`property_manager` + designation).

## 1. Purpose

Establish the **read path** for board `designation` and the canonical statutory-gate helper `requireBoardDesignation()`, then route the board-statutory feature gates through it. This is the first sub-project of Phase 3 and is deliberately a **thin, behavior-neutral foundation** that 3.2 (board-targeting repoint) and 3.3 (matrix collapse / vocabulary drain) build on.

## 2. Verified current state (the reason this is behavior-neutral)

Confirmed against code + prod on 2026-06-12:

- `requireBoardDesignation()` **does not exist**. `CommunityMembership` (`apps/web/src/lib/api/community-membership.ts:8-40`) **does not carry `designation`** — the membership read `SELECT *`s the `user_roles` row (`scoped.selectFrom(userRoles, {}, …)`) but the mapping at `:132-158` never extracts `designation`. The column is **dead data for authorization** today.
- The board model is the approved parent spec's: a `designation` (`board_president` | `board_member`) is valid on **any** role; **general permissions come from the role and never read designation**; only statutory features consult it. Board members are `property_manager` + `designation` (migration 0018), **not** residents.
- Every "is this an admin/board actor?" statutory gate today resolves to `membership.isAdmin` = `ADMIN_TIER_DB_ROLES.includes(role)` (`community-membership.ts:90`; `role-transition.ts:17`) = true for any `manager` / `pm_admin` / `property_manager` / `root_manager`. **None of the spec-named statutory features is board-restricted today** — a generic `property_manager` can certify elections, manage violations, and create board meetings.
- Prod data: 579 board rows are `property_manager` + designation; **0 residents hold a designation** (`designation_on_non_pm = 0`). Therefore "management-tier OR has-designation" admits exactly the same set as today's `isAdmin` — so re-expressing the gates changes **no one's** current access. The `designation` arm is purely forward-looking (for a future resident-held board seat).

## 3. Decisions (product owner, 2026-06-12)

1. **Start Phase 3 with this sub-project (3.1)** as a thin, safe foundation; the substantive board work is in 3.2 / 3.3.
2. **Gating semantics — "safe":** `requireBoardDesignation(membership)` passes when the caller is **management-tier (property_manager / root_manager, i.e. `isAdmin`) OR holds a board `designation`.** No lockout for PM-run buildings (a `property_manager` with no board can still perform statutory acts). Accepted trade-off: this does **not** statutorily tighten (the spec's stricter "designation-or-root-only" intent is intentionally **not** adopted now).
3. **Granularity — "broad":** route the **whole** election-management and violation-management admin-helper families through `requireBoardDesignation`, not just the narrowly-named acts. Implemented as a one-line swap inside each shared helper so it propagates to every call site.
4. **ARC — deferred:** ARC (`arc/[id]/decide`, `/review`) is **out of scope** for 3.1 and recorded as an open question (HB 1203 makes denials statutorily sensitive, but the parent spec's statutory list omits ARC).
5. **President vs member:** `requireBoardDesignation` accepts **either** designation. President-only refinements (e.g. certification chair) are a future refinement, not built now.
6. **No migration, no data change.** Read-path + helper + gate re-expression only.

## 4. Target model

### 4.1 Thread `designation` onto membership (additive)

- Add `designation: 'board_president' | 'board_member' | null` to the `CommunityMembership` interface and map it in `requireCommunityMembership` from the already-fetched row. Zero new query cost (the row is already `SELECT *`'d).
- It flows unchanged through `requirePageCommunityMembership` (`page-community-context.ts`), `getMembershipResourceAccess` (`access-control.ts`), and the PM-dashboard context — a single field addition propagates everywhere.

### 4.2 The helper

In `apps/web/src/lib/db/access-control.ts` (next to `requirePermission`):

```ts
/**
 * Statutory board-action gate (role-v3 §3.2). Passes for management-tier callers
 * (property_manager / root_manager, == membership.isAdmin) OR any holder of a
 * board designation. General permissions are unaffected — this is a SECOND gate
 * applied after requirePermission(resource, action) on statutory routes only.
 */
export function requireBoardDesignation(membership: CommunityMembership): void {
  if (!(membership.isAdmin || membership.designation != null)) {
    throw new ForbiddenError('This action is restricted to the board.');
  }
}
```

Bilingual-safe: `isAdmin` already covers `manager`/`pm_admin` during the transition window.

### 4.3 Gate re-expression (each statutory route keeps its existing `requirePermission` first, then this helper)

- **Elections (broad):** redefine `requireElectionsAdminRole` (`apps/web/src/lib/elections/common.ts:21-25`) from `if (!membership.isAdmin) throw` to delegate to `requireBoardDesignation(membership)`. Propagates to the whole family — `certify`, `open`, `close`, `cancel`, `eligibility`, `proxies/[id]/approve|reject`. (Voting + self-revoke intentionally don't use it — unchanged.)
- **Violations (broad):** redefine `requireViolationAdminWrite` (`apps/web/src/lib/violations/common.ts:32-36`) to delegate to `requireBoardDesignation(membership)`. Propagates to `create` / `fine` / `resolve` / `dismiss` / `notice` / `hearingDate` PATCH / `hearing-notice` PDF.
- **Board-meeting calls (one net-new seam):** in `apps/web/src/app/api/v1/meetings/route.ts` POST (`:128-154`), when `meetingType === 'board'`, additionally call `requireBoardDesignation(membership)` after the existing `requirePermission(membership, 'meetings', 'write')` (`:137`). Other meeting types unchanged. (A `property_manager` passes both; residents lack `meetings:write` regardless — no behavior change.)
- **NOT touched:** polls (`polls/common.ts` — not statutory, not named), ARC (deferred), and every general-permission gate.

### 4.4 Invariants

1. Behavior-neutral for all current actors: management-tier passes exactly as it does today; the only *new* allowance is resident+designation, of which there are currently zero.
2. `requireBoardDesignation` is always a **second** gate after the resource `requirePermission` — never a replacement for it.
3. The strict-root 2c endpoints (`role-assignments`, `designations`, `transfer-root`) are untouched and must **not** gain any board/admin fallback.
4. No `presetKey` / `permissions` JSONB reads are added or removed (that is 3.2 / 3.3).

## 5. Testing

- **Unit (`requireBoardDesignation`):** passes for `property_manager`, `root_manager`, and `resident` + designation; throws `ForbiddenError` for plain `owner` / `tenant` (no designation); passes for `manager`/`pm_admin` (bilingual).
- **Per-family route tests:** for an election-management action, a violation-management action, and a `meetingType:'board'` create — assert (a) management-tier caller still succeeds (status quo), (b) a `resident` + board designation succeeds, (c) a plain `resident` → 403, (d) the existing `requirePermission` gate still fires first (a caller lacking the resource perm 403s before reaching the designation check).
- **Regression / no-lockout:** a `property_manager` (no designation) creating a `meetingType:'board'` meeting still succeeds.
- **Membership threading:** `requireCommunityMembership` returns `designation` populated for a board row and `null` for a non-board row.
- No integration runs locally (`DATABASE_URL` = prod).

## 6. Scope

One cohesive plan: thread `designation` onto `CommunityMembership` + add `requireBoardDesignation()` + redefine the two admin-helper families + the board-meeting-type seam + tests. No migration, no prod-apply gate, no `presetKey`/JSONB change.

## 7. Out of scope (later sub-projects)

- **3.2** — repoint the `presetKey`→"board" *targeting* consumers (announcement/notification `board_only`, the public §718 board roster, access-request notify, billing presets) to `designation`. Must land before `presetKey` is dropped.
- **3.3** — collapse `RBAC_MATRIX` to 3 roles, make `property_manager` uniform, add a distinct `root_manager` row + root-only `roles:write`, drop the JSONB/preset path, delete dead code (`manager-presets.ts`, the orphaned legacy role sets, `validateDelegation`/meta-permissions), ratchet `guard:legacy-roles`.
- **3.4** — root-only enforcement for the agreed subset of the 5 `settings:write` routes (`communities/delete`, `subscribe`, `subscribe/change-plan`, `transparency/settings`, `settings/support-access`); grace-vs-hard-cutover reconciled with the parent spec.
- **Phase 4** — cleanup migration (next number **0020**): drop `preset_key` / `permissions` / `legacy_role` columns + the stray `super_admin` enum value; flip `guard:legacy-roles` from ratchet to ban.

## 8. Open questions (recorded, not blocking 3.1)

- **ARC under HB 1203:** should `arc` decisions become board-statutory (designation-gated) in a later pass? The parent spec omits ARC.
- **President-only acts:** are any statutory features (election-certification chair, hearing chair) `board_president`-only rather than any-designation?
- **Billing authority under 3 roles (3.3/3.4):** today `board_president` can purchase upgrades via `presetKey`; under 3 roles both board roles are `property_manager`. Does `property_manager` universally get billing, or does billing require a designation (which would make billing a designation consumer, contradicting "general permissions never read designation")?
