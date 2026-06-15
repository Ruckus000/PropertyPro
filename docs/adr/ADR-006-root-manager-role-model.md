# ADR-006: Root-Manager Role Model (supersedes ADR-001)

- Status: Accepted
- Date: June 15, 2026
- Supersedes: [ADR-001 Canonical Role Model](./ADR-001-canonical-role-model.md)
- Deciders: Product Owner, Engineering
- Scope: Community role vocabulary, authorization model, board designation, provisioning constraints
- Design source: [`docs/superpowers/specs/2026-06-10-root-manager-role-simplification-design.md`](../superpowers/specs/2026-06-10-root-manager-role-simplification-design.md)

## Context

ADR-001 proposed a seven-value domain-role enum (`owner`, `tenant`, `board_member`, `board_president`, `cam`, `site_manager`, `property_manager_admin`). In practice the **storage** layer had already collapsed to three roles (`resident` + `isUnitOwner`, `manager` + `presetKey`, `pm_admin`), while the seven-role vocabulary persisted only in the derived/RBAC layer — two models bridged by manager presets. This split created ambiguity and a large maintenance surface (the `RBAC_MATRIX`, manager presets, per-membership `permissions` JSONB, ~300 role string literals, 45 help articles).

The product owner approved a simplification to **three community roles plus a board designation**. This ADR records that model and supersedes ADR-001.

## Decision

### 1) Canonical community roles (`user_roles.role`)

| Role | Cardinality | Powers |
|---|---|---|
| `root_manager` | ≤ 1 per community (partial unique index; vacancy allowed) | Everything, including the four root-exclusive powers: role assignment, billing/subscription, community deletion, root transfer. |
| `property_manager` | unbounded; minted only by the root | Uniform operational power set (the union of the legacy cam / site_manager / property_manager_admin operational capabilities), minus the four root-exclusive powers. |
| `resident` | unbounded | As today; `isUnitOwner` distinguishes owner vs tenant for voting, assessments, leases, and billing CTAs. |

`platform_admin` remains system-scoped and is **not** stored in `user_roles` (unchanged from ADR-001).

### 2) Board designation (new, orthogonal to role)

- A nullable `designation` column on `user_roles`: `board_president | board_member`, valid on **any** role.
- ≤ 1 `board_president` per community (partial unique index).
- **General permissions never read `designation`.** Only statutory features consult it — board-meeting calls / 48-hour notices, election certification, violation hearings — via `requireBoardDesignation()`. A self-managed board president is `root_manager` + `board_president` designation.

### 3) Permission resolution

Authorization is enforced at the route/query layer via `requirePermission()` → `checkPermissionV2()` against the declarative `RBAC_MATRIX`. The matrix is keyed by community type × role × resource → `{read, write}`. Resident rows split internally by `isUnitOwner` (owner vs tenant policy). `root_manager` and `property_manager` resolve to the uniform full-operational policy. A `roles:write` action is root-only (enforced today by explicit `role === 'root_manager'` checks at the role-management endpoints).

### 4) Community-type constraints

| Community Type | Roles | Designations | `isUnitOwner` |
|---|---|---|---|
| `condo_718`, `hoa_720` | resident, property_manager, root_manager | allowed (board_president / board_member) | owner + tenant |
| `apartment` | resident, property_manager, root_manager | not used | tenant only (no owners) |

### 5) Provisioning & lifecycle

- The community **creator is the root** (`root_manager`), wired into the admin-minting paths.
- Resident-minting paths (join-requests, access-requests, CSV import, resident invite, resident-service) can never write a manager-tier role; only the root mints `property_manager`. (Enforced via `isResidentTierRole`.)
- Backfill left the root **vacant**; admins claim root on next authenticated load (first-claim-wins + dispute flag + platform-admin override).
- Claim, transfer, demotion, and designation changes are written to `compliance_audit_log`.

## What dissolves (cleanup, sequenced)

`presetKey`, the per-membership `permissions` JSONB, and `legacyRole` are kept read-only through the transition and dropped in the Phase 4 cleanup migration. The `manager` / `pm_admin` enum values and the stray `super_admin` value are removed in the same rebuild. The legacy seven-role `RBAC_MATRIX` columns collapse to the three-role policy at that point.

## Transition status (as of this ADR)

The model is delivered in phases (1 → 4) behind a compatibility shim and a `guard:legacy-roles` floor, with no flag day:

- **Live:** the `designation` column + statutory gate (`requireBoardDesignation`), the root claim/transfer/dispute flow, creator-is-root, resident-tier minting lockdown, and the board-targeting + vocabulary drains.
- **Deferred to a product-signed-off step (with the Phase 4 migration):** making `property_manager` permissions **uniform** in `checkPermissionV2` (a real widening for the minority of rows that still carry restricted preset-derived permissions). Until then, `checkPermissionV2` still reads the per-row JSONB.
- **Deferred to Phase 3.4 (gated on claim-root adoption):** moving billing / community-deletion to root-only. Shipping it before communities have a claimed root would lock out every admin.

## Consequences

| Type | Consequence |
|---|---|
| Positive | One small role vocabulary across storage and the derived layer; far less code to reason about. |
| Positive | Board membership is a clean statutory marker decoupled from operational permissions. |
| Tradeoff | No per-manager permission overrides post-cleanup (granularity loss — accepted). |
| Tradeoff | Rootless communities lose billing/deletion until claimed (accepted; visible via the admin rootless report). |

## Rejected alternatives

| Alternative | Reason rejected |
|---|---|
| Keep the seven-role enum (ADR-001) | The storage layer already used three roles; maintaining the seven-role derived vocabulary was the source of the drift. |
| Make `designation` grant general permissions | Re-introduces designation-as-permission coupling; the model deliberately keeps general permissions role-only. |
| Reduce restricted board members in place via designation gating | Contradicts "general permissions never read designation"; restricted actors belong at the resident tier (+ designation) instead. |
