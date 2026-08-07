# RBAC Matrix — PropertyPro Florida

**Canonical source of truth:** [`packages/shared/src/rbac-matrix.ts`](../packages/shared/src/rbac-matrix.ts)
**Route-level guard:** [`apps/web/src/lib/db/access-control.ts`](../apps/web/src/lib/db/access-control.ts)
**Tests (378 cells + invariants):** [`apps/web/__tests__/rbac.test.ts`](../apps/web/__tests__/rbac.test.ts)
**ADR:** [ADR-006 Root-Manager Role Model](./adr/ADR-006-root-manager-role-model.md) (supersedes ADR-001)

---

## Role Model (v3 — canonical)

Per [ADR-006](./adr/ADR-006-root-manager-role-model.md), a community membership is one of **three roles** plus an optional, orthogonal **board designation**:

| Role | Description | Valid Community Types |
|---|---|---|
| `resident` | Community member; `isUnitOwner` distinguishes **owner** (condo/HOA only) from **tenant** | condo_718, hoa_720, apartment |
| `property_manager` | Uniform operational manager; minted only by the root | condo_718, hoa_720, apartment |
| `root_manager` | ≤ 1 per community (vacancy allowed); everything, incl. the four root-exclusive powers (roles, billing, deletion, transfer) | condo_718, hoa_720, apartment |

| Designation (any role) | Statutory marker |
|---|---|
| `board_president` | ≤ 1 per community |
| `board_member` | unbounded |

**Rules:**
- One active role per `(user_id, community_id)`.
- **General permissions come from the role and never read `designation`.** Only statutory features (board-meeting calls / 48-hour notices, election certification, violation hearings) consult `designation` via `requireBoardDesignation()`.
- `roles:write` (role assignment + designation management) is root-only.
- `platform_admin` is system-scoped — not stored in `user_roles`.
- Apartments have no designations and no `isUnitOwner=true` residents.

### Root-exclusive powers — NOT matrix cells

ADR-006 §2 names exactly four powers that only `root_manager` holds. **None of
them is expressible in the permission matrix below**, and none ever will be: the
matrix has a single `manager` row that `property_manager` and `root_manager`
both resolve to, so a matrix cell structurally cannot tell them apart. Reading
`settings write` as "can do billing" is the specific mistake this section exists
to prevent — it is true for property managers, and billing is not.

| Power | Enforced at |
|---|---|
| Role assignment | `api/v1/communities/role-assignments/route.ts`, `api/v1/communities/designations/route.ts` |
| Root transfer | `api/v1/communities/transfer-root/route.ts` |
| Billing / subscription | `api/v1/subscribe/route.ts`, `api/v1/subscribe/change-plan/route.ts`, `(authenticated)/billing/portal/route.ts` |
| Community deletion | `api/v1/communities/delete/route.ts` (POST + DELETE) |

All of them gate on `requireRootManager` (`apps/web/src/lib/api/role-guard.ts`),
except `/billing/portal`, which must **redirect** rather than throw and so uses
`hasRole(membership, ['root_manager'])`. `canManageBilling`
(`packages/shared/src/billing/permissions.ts`) is the matching client-side
predicate; `canViewBilling` is the broader read-only tier.
`apps/web/__tests__/api/root-exclusive-routes.test.ts` fails the build if any of
these reverts to `settings:write`.

Deliberately **outside** the set: `POST /api/v1/account/delete` (account, not
community, deletion), `POST /api/v1/communities/[id]/cancel` (billing-group
ownership — a separate authority axis), and `/api/v1/stripe/connect/*` (the
community's inbound dues collection, not PropertyPro's subscription).

## Permission resolution & the underlying matrix

`checkPermissionV2()` routes the v3 role to the policy table below, which is **still keyed on the legacy role names** during the bilingual transition (collapsed to three columns in the Phase 4 cleanup):

- `resident` → `owner` or `tenant` column (by `isUnitOwner`).
- `property_manager` / `root_manager` / `pm_admin` → `property_manager_admin` column (the uniform full-operational policy). *(Transitional exception: a `property_manager` row that still carries a per-membership `permissions` JSONB resolves from that JSONB until the product-signed-off uniform-permissions step ships with the Phase 4 migration.)*

**Deferred:** making `property_manager` permissions uniform in `checkPermissionV2` (a widening for the minority of rows with restricted preset-derived permissions). See ADR-006 → Transition status.

**Shipped 2026-08-07 (R3-03):** billing and community deletion are now root-only — see *Root-exclusive powers* above. They are enforced outside the matrix, so nothing in the table below changed.

---

## Legacy policy table (bilingual transition — keyed on legacy role names)

> These tables are the underlying `RBAC_MATRIX` policy source during the transition. Read them through the routing above: `property_manager`/`root_manager` use the `property_manager_admin` row; `resident` uses `owner`/`tenant`.

---

## Resource Definitions

| Resource | Description | API Endpoint |
|---|---|---|
| `documents` | Community documents and files | `/api/v1/documents` |
| `meetings` | Board/owner meetings | `/api/v1/meetings` |
| `announcements` | Community announcements | `/api/v1/announcements` |
| `residents` | Resident user management | `/api/v1/residents` |
| `settings` | Community configuration | (settings route) |
| `audit` | Compliance audit trail | `/api/v1/audit-trail` |
| `compliance` | Florida §718/§720 checklist | `/api/v1/compliance` |
| `maintenance` | Maintenance requests | `/api/v1/maintenance-requests` |
| `contracts` | Vendor contracts | `/api/v1/contracts` |

**Note:** `leases` is not in this matrix — it has its own apartment-only feature gate in `/api/v1/leases`.

---

## Permission Matrix: condo_718 and hoa_720

> `hoa_720` has identical policy to `condo_718`. Both are written as explicit entries in `RBAC_MATRIX` to allow future divergence.

Legend: **R** = read, **W** = write (create/update/delete), **—** = no access

| Role | documents | meetings | announcements | residents | settings | audit | compliance | maintenance | contracts |
|---|---|---|---|---|---|---|---|---|---|
| `owner` | R | R | R | R | R | — | R | RW | — |
| `tenant` | R | R | R | R | — | — | — | RW | — |
| `board_member` | RW | RW | RW | RW | R | R | RW | RW | RW |
| `board_president` | RW | RW | RW | RW | RW | R | RW | RW | RW |
| `cam` | RW | RW | RW | RW | R | R | RW | RW | RW |
| `site_manager` | — | — | — | — | — | — | — | — | — |
| `property_manager_admin` | RW | RW | RW | RW | RW | R | RW | RW | RW |

> `site_manager` is an invalid role for condo_718/hoa_720 — all access is denied per `ROLE_COMMUNITY_CONSTRAINTS`.

---

## Permission Matrix: apartment

| Role | documents | meetings | announcements | residents | settings | audit | compliance | maintenance | contracts |
|---|---|---|---|---|---|---|---|---|---|
| `owner` | — | — | — | — | — | — | — | — | — |
| `tenant` | R | — | R | — | — | — | — | RW | — |
| `board_member` | — | — | — | — | — | — | — | — | — |
| `board_president` | — | — | — | — | — | — | — | — | — |
| `cam` | — | — | — | — | — | — | — | — | — |
| `site_manager` | RW | — | RW | RW | R | R | — | RW | RW |
| `property_manager_admin` | RW | — | RW | RW | RW | R | — | RW | RW |

> `owner`, `board_member`, `board_president`, `cam` are invalid roles for apartment — all access denied per `ROLE_COMMUNITY_CONSTRAINTS`.

---

## Policy Notes

### meetings and compliance
- Available only for `condo_718` and `hoa_720` communities (feature gate via `getFeaturesForCommunity()`)
- All roles in `apartment` get `false` for meetings and compliance

### audit (compliance audit trail)
- **Write is always `false`** for all roles — audit entries are written internally via `logAuditEvent()` only
- Read is restricted to admin roles (board_member+)

### settings write
- Restricted to `board_president` and `property_manager_admin`
- `board_member` and `cam` can read but not write settings

### maintenance
- Both residents (`owner`, `tenant`) and admins have `write: true`
- **Data scoping** is enforced at the DB query layer: residents can only see/modify their own requests; admins see all
- The RBAC gate allows the action; query-layer WHERE clauses scope the data

### documents
- Resource-level access is controlled by this matrix (read/write)
- **Category-level** access is additionally controlled by `DOCUMENT_ACCESS_POLICY` in `access-policies.ts`
- Fine-grained category access (e.g., tenants can only read declaration, rules, inspection_reports in condo) is separate from the coarse RBAC gate

### owner in condo/HOA — settings
- `owner` has `settings read: true` in condo_718/hoa_720 (can view community settings)
- This does NOT grant write access to settings

---

## Enforcement Points

| Resource | Enforcement File | Pattern |
|---|---|---|
| `audit` | `apps/web/src/app/api/v1/audit-trail/route.ts` | `requirePermission(..., 'audit', 'read')` |
| `contracts` | `apps/web/src/app/api/v1/contracts/route.ts` | `requirePermission(..., 'contracts', 'read'/'write')` |
| `announcements` (write) | `apps/web/src/app/api/v1/announcements/route.ts` | `requirePermission(..., 'announcements', 'write')` in context extractor |
| `meetings` (write) | `apps/web/src/app/api/v1/meetings/route.ts` | `requirePermission(..., 'meetings', 'write')` in POST handler |
| `compliance` (write) | `apps/web/src/app/api/v1/compliance/route.ts` | `requirePermission(..., 'compliance', 'write')` in POST handler |
| `residents` (write) | `apps/web/src/app/api/v1/residents/route.ts` | `requirePermission(..., 'residents', 'write')` in POST/PATCH/DELETE |
| `documents` (write) | `apps/web/src/app/api/v1/documents/route.ts` | Legacy: `isElevatedRole()` from `access-policies.ts` (candidate for migration to `requirePermission`) |
| `maintenance` | `apps/web/src/app/api/v1/maintenance-requests/route.ts` | Legacy: role-scoped queries (ADMIN_ROLES/RESIDENT_ROLES split, candidate for migration to `requirePermission`) |

All routes additionally enforce:
1. `requireAuthenticatedUserId()` — valid Supabase session (401 if absent)
2. `requireCommunityMembership()` — user must belong to the community (403 if not)

---

## Programmatic Usage

```typescript
import { checkPermission } from '@propertypro/shared';

// Pure boolean check
const allowed = checkPermission('board_member', 'condo_718', 'meetings', 'write'); // true
const denied  = checkPermission('tenant',       'condo_718', 'meetings', 'write'); // false
```

```typescript
import { requirePermission } from '@/lib/db/access-control';

// Throws ForbiddenError (403) if not allowed
const membership = await requireCommunityMembership(communityId, userId);
requirePermission(membership.role, membership.communityType, 'meetings', 'write');
```
