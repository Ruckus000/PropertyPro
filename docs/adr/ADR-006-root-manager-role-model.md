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

> **Addendum (2026-08-07): Phase 3.4 root-only billing/deletion has SHIPPED.**
> R3-03 was the last deferred item; role-v3 now has no open work.
>
> **Why the claim-root adoption gate no longer applies.** The gate existed to
> prevent locking out every admin in communities with no claimed root. Measured
> against prod on 2026-08-06, all 7 live communities are non-customers — ids 1–3
> are `pnpm seed:demo` fixtures that leaked into prod, 133/134/135/147 are demo
> conversions, and there are **zero paying customers**. 3 of 7 hold a root; the
> 4 rootless ones **each have ≥1 `property_manager`**, so every one is
> self-claimable, and none has zero managers. There is no real admin to lock
> out, and the lockout is recoverable everywhere it could occur. The window only
> narrows as customers arrive, which is why this shipped now rather than later.
> Re-verify before any similar change:
>
> ```sql
> select c.id, c.slug, c.subscription_status,
>        count(*) filter (where r.role='root_manager')     as roots,
>        count(*) filter (where r.role='property_manager') as pms
> from communities c left join user_roles r on r.community_id = c.id
> where c.deleted_at is null group by c.id, c.slug, c.subscription_status;
> ```
>
> **How it is enforced.** `requireRootManager`
> (`apps/web/src/lib/api/role-guard.ts`) on `POST /api/v1/subscribe`,
> `POST /api/v1/subscribe/change-plan`, and `POST|DELETE
> /api/v1/communities/delete`; a root-only `hasRole` **redirect** (never a
> throw — that handler has no `withErrorHandler`) on
> `/billing/portal`. `canManageBilling` (`packages/shared`) is the matching
> client-side predicate. `settings:write` is NOT usable for this: the RBAC
> matrix collapses `property_manager` and `root_manager` onto a single `manager`
> row and structurally cannot tell them apart — that is the bug this closes.
> `apps/web/__tests__/api/root-exclusive-routes.test.ts` is the fence against
> re-widening.
>
> **Explicitly NOT narrowed**, with reasons, so this is not "finished" later by
> mistake:
> - `POST /api/v1/account/delete` — *account*, not *community*, deletion.
>   Self-scoped and legally required to stay self-service (erasure requests);
>   residents must be able to use it. The real adjacent gap runs the other way:
>   a root can still delete their own account and orphan a community —
>   `requestUserDeletion` only logs a warning plus a `root_pending_deletion`
>   audit event, and does so inside a `try/catch` that swallows failures, so
>   even the flag is best-effort. Tracked separately as **R3-03b**,
>   [issue #924](https://github.com/Ruckus000/PropertyPro/issues/924).
>
>   Two things changed after this addendum was first written. The deferral's
>   own precondition is now met — `root-offboarding.ts` says "Phase 3 will
>   block once the claim/transfer UX (2b) exists", and 2b has shipped
>   (claim-root and transfer-root are both live). And **R3-03 raised the
>   stakes**: with billing now root-exclusive, a community whose root deletes
>   their account has nobody who can pay it until someone claims root, so what
>   was a governance annoyance is now a possible lapse-to-suspension path. The
>   zero-property-manager case has no self-service recovery at all and needs an
>   explicit answer (see the break-glass runbook below).
> - `POST /api/v1/communities/[id]/cancel` — gates on **billing-group
>   ownership**, a portfolio-level financial identity orthogonal to community
>   role. The owner may not be a member of the child community at all, so a root
>   check would break the legitimate multi-community PM cancel flow.
> - `/api/v1/stripe/connect/*` — the community's *inbound* dues collection, not
>   PropertyPro's subscription. Root-gating would block routine PM operations.
>
> **PM experience after the narrowing.** Read-only, never hidden — hiding would
> make the capability loss invisible. A property manager keeps `canViewBilling`
> (plan, status, interval) and the past-due/trialing banners *without* their
> action links, and `getLockedFeatureBehavior` routes them to the "request"
> CTA instead of a purchase button that would dead-end in a 403.
>
> **Rootless recovery.** `/settings/billing` renders a non-dismissible notice
> for a PM in a rootless community linking `/dashboard/claim-root`. It is
> deliberately NOT `ClaimRootBanner`, which is dismissible and writes a shared
> `claim-root-dismissed` sessionStorage key — dismissing it on the dashboard
> would suppress it here too, on a surface where suppression means staying
> locked out.
>
> **Zero-PM break-glass** (no such community exists today). `reassignRootOp`
> requires the target to already be a `property_manager`, so it is two steps:
> a platform admin promotes someone to `property_manager` via the admin app,
> then calls `POST /api/admin/communities/reassign-root`.
>
> **Seed fix landed with it.** `pnpm seed:demo` previously minted a root only
> for palm-shores, which is why prod's seeded sunset-condos and sunset-ridge are
> rootless. It now mints one per community (`ROOT_MANAGER_BY_SLUG` in
> `scripts/seed-demo.ts`). The leaked prod fixtures were left alone — backfilling
> a root there is an ownership assertion, not a data fix, and belongs to a
> separate human-approved cleanup.

> **Addendum (2026-07-20):** role-v3 is now **fully landed.** Since the 07-18 note
> below, the 7-role `RBAC_MATRIX` collapse (R3-01) + v1 `checkPermission` deletion
> (R3-07), the bridge drain (R3-02) + billing-admin fix (R3-04), the management-tier
> matrix-key rename to `manager`, the dead `user_role` pgEnum drop (R3-06 — applied
> to prod as a verified no-op, both migration ledgers reconciled), the global
> `CommunityRole` 7→3 narrowing, and the role type/const alias consolidation have all
> shipped. The runtime role vocabulary is v3-only; the compatibility shim is gone and
> the `guard:legacy-roles` STRUCTURAL + BRIDGE buckets are empty. The **only**
> remaining deferred item is Phase 3.4 root-only billing/deletion (last "Deferred"
> bullet below), still gated on claim-root adoption by design.
>
> **Addendum (2026-07-18):** Phase 4.1 has **shipped**. Migration `0020`
> (role-v3 enum rebuild + column drops) is live, and `checkPermissionV2`
> (`apps/web/src/lib/db/access-control.ts`) now resolves `property_manager` /
> `root_manager` to the uniform management-tier row — it no longer reads the
> per-row `permissions` JSONB, so the first "Deferred" bullet below is
> **done**. Still open: the legacy seven-role `RBAC_MATRIX` collapse (four
> columns unreachable at the choke point), the Phase 4.4 bridge drain, and the
> Phase 3.4 root-only billing/deletion cutover (still gated on claim-root
> adoption). See `docs/audits/2026-07-18-refactor-audit-and-cleanup-roadmap.md`
> §4.2 (R3-01…R3-07).

The model is delivered in phases (1 → 4) behind a compatibility shim and a `guard:legacy-roles` floor, with no flag day:

- **Live:** the `designation` column + statutory gate (`requireBoardDesignation`), the root claim/transfer/dispute flow, creator-is-root, resident-tier minting lockdown, and the board-targeting + vocabulary drains.
- **Deferred to a product-signed-off step (with the Phase 4 migration):** making `property_manager` permissions **uniform** in `checkPermissionV2` (a real widening for the minority of rows that still carry restricted preset-derived permissions). Until then, `checkPermissionV2` still reads the per-row JSONB.
- ~~**Deferred to Phase 3.4 (gated on claim-root adoption):** moving billing / community-deletion to root-only. Shipping it before communities have a claimed root would lock out every admin.~~ **SHIPPED 2026-08-07** — see the addendum at the top of this section for the prod evidence that retired the gate, the enforcement points, and the explicit non-scope.

## Consequences

| Type | Consequence |
|---|---|
| Positive | One small role vocabulary across storage and the derived layer; far less code to reason about. |
| Positive | Board membership is a clean statutory marker decoupled from operational permissions. |
| Tradeoff | No per-manager permission overrides post-cleanup (granularity loss — accepted). |
| Tradeoff | Rootless communities lose billing/deletion until claimed (accepted; visible via the admin rootless report, and `/settings/billing` links a rootless PM straight to claim-root). **Realised 2026-08-07** with R3-03. |

## Rejected alternatives

| Alternative | Reason rejected |
|---|---|
| Keep the seven-role enum (ADR-001) | The storage layer already used three roles; maintaining the seven-role derived vocabulary was the source of the drift. |
| Make `designation` grant general permissions | Re-introduces designation-as-permission coupling; the model deliberately keeps general permissions role-only. |
| Reduce restricted board members in place via designation gating | Contradicts "general permissions never read designation"; restricted actors belong at the resident tier (+ designation) instead. |
