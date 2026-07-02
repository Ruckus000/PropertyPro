# Phase 2c — Root-Only Role Management Design

**Date:** 2026-06-11
**Status:** Approved by product owner (decisions below); implementation plan to follow
**Parent spec:** `docs/superpowers/specs/2026-06-10-root-manager-role-simplification-design.md` §4 Phase 2
**Depends on:** Phase 1 + 2a + 2b (all merged + prod-applied). The `designation` column, the one-root and one-board_president partial unique indexes, the `chk_owner_flag_resident_only` CHECK, and the `transfer-root` endpoint already exist in prod.

## 1. Purpose

The day-to-day management surface a `root_manager` uses to run their community's access: promote/revoke `property_manager`, set board `designation`s, and transfer root. The transfer + platform-admin reassign APIs shipped in 2b; 2c adds the assign/revoke/designate endpoints and the root-facing UI, and **closes a privilege-escalation path discovered during design** (see §2).

## 2. Root cause this phase also fixes

`validateRoleAssignment` (`apps/web/src/lib/utils/role-validator.ts`) returns valid for **every** `TRANSITION_ROLE` including `property_manager`/`root_manager`, and the residents PATCH (`apps/web/src/app/api/v1/residents/route.ts`, gated `residents:write` — held by every admin) calls it then writes the role. **Today any admin can promote another user to `property_manager`/`root_manager` via the residents PATCH**, violating the "only root mints managers / one root" invariants. 2c closes this: the residents PATCH (and the resident-form picker that drives it) are constrained to **resident-tier** roles; manager-tier + root are exclusively the root-only endpoints below.

## 3. Decisions (product owner, 2026-06-11)

1. **Surface:** dedicated root-only "Roles & Access" screen at `/settings/roles` (verified free); residents page/PATCH stays resident-CRUD for any admin, but loses manager-tier assignment.
2. **Endpoints:** dedicated root-only routes (one op each), not a fat handler or a residents-PATCH branch.
3. **PM assignment:** promote an existing member; revoke → resident. New-person invites stay on the existing invitation flow.
4. **Designations:** root sets `board_president`/`board_member` on any member; one-president enforced by the partial unique index; condo/HOA only (apartment → blocked).
5. **Board eligibility:** **scoped soft-warn** — no hard block. Warn + audited override ONLY when the target is a tenant (`resident` with `isUnitOwner = false`). Rationale: `isUnitOwner` is structurally `false` for owner-roles (the `chk_owner_flag_resident_only` constraint), and FL §718 permits non-owner representatives, so hard enforcement is both brittle and broken; the platform records what the association declares and warns only where the data is unambiguous.
6. **Self-protection:** root can never demote/revoke its own root role via 2c — the only exits from root are transfer (2b) or platform-admin reassign. Every op rejects self-targeting the root.
7. **Confirmation:** inline confirm for revoke-PM / reassign-president; typed-confirm modal for transfer-root (type the community name + "you will become a property_manager" notice).

## 4. Target model

### 4.1 Endpoints (each `runRoute`; explicit gate "caller is this community's current `root_manager`" — NOT `requirePermission`, since `roles` enters `RBAC_RESOURCES` in Phase 3)

- `POST /api/v1/communities/role-assignments` — promote member → `property_manager`. Body `{ communityId, userId }`, `tenantScope: { in: 'body' }`. **Idempotent**: already `property_manager` → `{ assigned: true, alreadyAssigned: true }`. Rejects: target is the root (use transfer); target is a manager-tier row already at root. Audit `role_assigned`.
- `DELETE /api/v1/communities/role-assignments` — demote `property_manager` → `resident`. Body `{ communityId, userId }`. **The demoted user becomes `resident` with `isUnitOwner = false` (tenant) by default** — the prior resident type isn't recoverable (the promote-to-PM overwrote the role and the `chk_owner_flag_resident_only` CHECK forced `isUnitOwner = false` while they were a manager), so 2c does not guess ownership; the root corrects owner status afterward via the residents page if the person owns a unit. Rejects: **target is the root** (403, "transfer root first"); target is not a `property_manager` → no-op `{ revoked: false, reason: 'not_a_property_manager' }`. Audit `role_revoked`.
- `POST /api/v1/communities/designations` — set/clear a designation. Body `{ communityId, userId, designation: 'board_president' | 'board_member' | null, acknowledgeNonOwner?: boolean }`. Condo/HOA only (apartment → 400). One-president via the partial unique index: reassigning president → the UI confirms, the op clears the prior president then sets the new (single transaction) so the index never sees two. Setting `board_president`/`board_member` on a tenant (`resident`, `isUnitOwner=false`) without `acknowledgeNonOwner: true` → 409 `{ reason: 'non_owner_requires_ack' }` (the UI warns + re-submits with the ack; the ack is audited). Audit `designation_set` / `designation_cleared` (the latter when `null`).
- **Transfer:** reuse `POST /api/v1/communities/transfer-root` (2b).

### 4.2 Residents-PATCH lockdown (the escalation fix)

- `validateRoleAssignment` gains a resident-tier guard usable by the residents path: a new `assertResidentTierRole(role)` (or a parameter) that rejects `manager`/`pm_admin`/`property_manager`/`root_manager`. The residents PATCH calls it before writing — a manager-tier role via that route → 403 `'Manager roles are assigned from Roles & Access (root only).'`
- `resident-form.tsx` role picker is narrowed to resident-tier options (Owner/Tenant). The legacy preset options (CAM/site-manager/board) are removed from that picker — board designations move to the Roles & Access screen; manager assignment is root-only.

### 4.3 Invariants (server-enforced — the core)

1. **One root / community** — partial unique index. Assign-PM never mints a second root.
2. **One board_president / community** — partial unique index; designation-set moves it atomically.
3. **Root can't self-demote via 2c** — every op rejects targeting the caller's own root row; root exits only via transfer / reassign.
4. **Only the current root** mints/revokes PM + sets designations (explicit gate, every endpoint).
5. **Residents path can never escalate** to manager tier (§4.2 lockdown).
6. **Designations condo/HOA-only.**
7. Every role-write is audited (`role_assigned`, `role_revoked`, `designation_set`, `designation_cleared`).

### 4.4 Failure modes & idempotency

| Case | Result |
|---|---|
| assign already-PM | `{ assigned: true, alreadyAssigned: true }` (200) |
| revoke non-PM | `{ revoked: false, reason: 'not_a_property_manager' }` (200) |
| set designation to current value | no-op success (200) |
| reassign president (one already exists) | UI confirm → atomic clear+set; never a 23505/500 |
| set board designation on a tenant w/o ack | 409 `non_owner_requires_ack` → UI warns → re-submit w/ ack (audited) |
| target = the root (assign/revoke/designate manager role) | 403 "transfer root instead" |
| designation on apartment community | 400 "no board in apartments" |
| caller not the current root | 403 |

## 5. UI (`/settings/roles`, root-only)

Server page gates on `membership.role === 'root_manager'` → non-root redirected (mirrors the 2b claim screen's server gate). Client body, hooks via `requestJson`, loading(Skeleton)/empty(EmptyState)/error(AlertBanner)/success states, `PageHeader` with `breadcrumb=` before other props (design rule). Sections:

- **Current root + Transfer** — shows the current root; "Transfer root" opens a typed-confirm modal (type the community name; explicit "you will become a property_manager" notice) → 2b transfer endpoint.
- **Property managers** — list with per-row Revoke (inline confirm → DELETE role-assignments).
- **Members** — roster (the existing scoped residents query) with Promote-to-property_manager (→ POST role-assignments).
- **Board (condo/HOA only)** — set/clear `board_president` (inline confirm to reassign if one exists) and `board_member`; the non-owner soft-warn surfaces inline on a tenant target with an "I confirm per our bylaws" checkbox that sets `acknowledgeNonOwner`. A static note: "Board eligibility is governed by your bylaws and Florida statute; PropertyPro records the designation you set and does not determine eligibility." Section hidden on apartment communities.

Hooks: `useAssignPropertyManager`, `useRevokePropertyManager`, `useSetDesignation`, `useTransferRoot` (reuse), all invalidating the roster query.

## 6. Security

- AuthZ: every endpoint verifies caller = current root_manager of the path/body community; residents-PATCH narrowed to resident-tier; self-target-root rejected. Closes the OWASP A01 escalation path (§2).
- Input: Zod bodies; designation enum (DB CHECK backstop); community-type gate; `assertResidentTierRole` on the residents path.
- Any new `@propertypro/db/unsafe` consumer carries `// AUTHZ:` + a `WEB_UNSAFE_IMPORT_ALLOWLIST` entry (the two-guard rule). Prefer scoped client where the op is single-community (assign/revoke/designate all are — use `createScopedClient`, no unsafe needed).
- Every role-write audited; the non-owner override is recorded for defensibility.

## 7. Testing (edge cases the plan must carry)

assign-already-PM no-op; revoke-non-PM no-op; revoke-root → 403; designation reassign-president atomic (no 23505); tenant-designation → 409 then ack→200; apartment-designation → 400; non-root caller → 403 on all four; **regression: residents-PATCH rejects manager-tier** (proves the lockdown); resident-form picker offers only resident-tier; the root-only server gate redirects non-root.

## 8. Scope

**No migration** — `designation`, both partial indexes, and the CHECK are already in prod. One cohesive plan: 3 endpoints + the residents-PATCH/validator lockdown + resident-form narrowing + the `/settings/roles` screen + 4 audit actions + hooks. Next migration in the program remains **0020** (Phase 4 cleanup).

## 9. Out of scope (→ later)

Root-only ENFORCEMENT of billing/deletion/role-assignment as RBAC-matrix `roles:write` (Phase 3 — until then the explicit per-endpoint root checks are authoritative); the broader vocabulary drain (Phase 3); invite-new-person-as-PM (stays on the existing invitation flow).
