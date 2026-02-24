# RBAC Matrix — PropertyPro Florida

**Canonical source of truth:** [`packages/shared/src/rbac-matrix.ts`](../packages/shared/src/rbac-matrix.ts)
**Route-level guard:** [`apps/web/src/lib/db/access-control.ts`](../apps/web/src/lib/db/access-control.ts)
**Tests (378 cells + invariants):** [`apps/web/__tests__/rbac.test.ts`](../apps/web/__tests__/rbac.test.ts)
**ADR:** [ADR-001 Canonical Role Model](./adr/ADR-001-canonical-role-model.md)

---

## Role Definitions

| Role | Description | Valid Community Types |
|---|---|---|
| `owner` | Unit owner with portal access | condo_718, hoa_720 |
| `tenant` | Resident renter | condo_718, hoa_720, apartment |
| `board_member` | Board member with admin access | condo_718, hoa_720 |
| `board_president` | Board president | condo_718, hoa_720 |
| `cam` | Community Association Manager | condo_718, hoa_720 |
| `site_manager` | Apartment on-site manager | apartment only |
| `property_manager_admin` | PM company admin | condo_718, hoa_720, apartment |

**Rules per ADR-001:**
- One active canonical role per `(user_id, community_id)`
- If user qualifies as both board member and owner, board role takes precedence
- `platform_admin` is a system-scoped role — not stored in `user_roles` table

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
| `documents` (write) | `apps/web/src/app/api/v1/documents/route.ts` | `isElevatedRole()` from `access-policies.ts` |
| `maintenance` | `apps/web/src/app/api/v1/maintenance-requests/route.ts` | Role-scoped queries (ADMIN_ROLES/RESIDENT_ROLES split) |

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
