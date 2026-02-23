# RBAC Matrix — PropertyPro Florida

Declarative role-based access control matrix covering all 7 canonical roles, 3 community types, and 10 resource categories. Aligned with ADR-001.

**Typed source of truth:** `packages/shared/src/rbac-matrix.ts`
**Document-category sub-matrix:** `packages/shared/src/access-policies.ts`

## Role Validity by Community Type

| Role | condo_718 | hoa_720 | apartment |
|------|-----------|---------|-----------|
| owner | Yes | Yes | No |
| tenant | Yes | Yes | Yes |
| board_member | Yes | Yes | No |
| board_president | Yes | Yes | No |
| cam | Yes | Yes | No |
| site_manager | No | No | Yes |
| property_manager_admin | Yes | Yes | Yes |

Invalid role/community combinations result in `none` access for all resources. Attempting to assign an invalid role is rejected by `validateRoleAssignment()` in `apps/web/src/lib/utils/role-validator.ts`.

## Resource Access Matrix

Access levels: `none` | `read` | `write` | `own`
- `write` implies read access
- `own` means read/write only own records (e.g., maintenance requests submitted by self)

### condo_718

| Resource | owner | tenant | board_member | board_president | cam | pma |
|----------|-------|--------|--------------|-----------------|-----|-----|
| documents | write | read | write | write | read | write |
| meetings | read | read | write | write | write | write |
| announcements | read | read | write | write | write | write |
| residents | read | read | write | write | write | write |
| audit_trail | none | none | read | read | read | read |
| compliance | read | read | write | write | write | write |
| contracts | none | none | write | write | write | write |
| maintenance | own | own | write | write | write | write |
| leases | none | none | none | none | none | none |
| settings | none | none | write | write | write | write |

### hoa_720

Identical to condo_718 (same role set, same feature flags).

### apartment

| Resource | tenant | site_manager | pma |
|----------|--------|--------------|-----|
| documents | read | read | write |
| meetings | none | none | none |
| announcements | read | write | write |
| residents | read | write | write |
| audit_trail | none | read | read |
| compliance | none | none | none |
| contracts | none | none | none |
| maintenance | own | write | write |
| leases | own | write | write |
| settings | none | write | write |

Roles not valid for apartment (owner, board_member, board_president, cam) have `none` for all resources.

## Feature Gates by Community Type

| Feature | condo_718 | hoa_720 | apartment | Enforcement |
|---------|-----------|---------|-----------|-------------|
| Meetings | Yes | Yes | No (route blocks) | `requireMeetingsEnabled()` in meetings/route.ts |
| Compliance | Yes | Yes | No | `requireCondoCommunity()` via `hasCompliance` feature flag |
| Contracts | Yes | Yes | No | `requireComplianceCommunity()` via `hasCompliance` feature flag |
| Leases | No | No | Yes | `requireApartmentCommunity()` via `hasLeaseTracking` feature flag |
| Maintenance | Yes | Yes | Yes | No feature gate (all community types) |
| Announcements | Yes | Yes | Yes | No feature gate |

## Document Category Sub-Matrix

Document-level access is a two-layer check:
1. **Resource-level** (this matrix): Can the role access documents at all?
2. **Category-level** (`DOCUMENT_ACCESS_POLICY` in `access-policies.ts`): Which document categories can the role see?

Elevated roles (`owner`, `board_member`, `board_president`, `property_manager_admin`) see all categories plus unknown/unmapped categories.

Restricted roles see only their allowlisted categories:

| Role | condo_718 / hoa_720 | apartment |
|------|---------------------|-----------|
| tenant | declaration, rules, inspection_reports | lease_docs, rules, community_handbook, move_in_out_docs |
| cam | rules, inspection_reports, announcements, meeting_minutes | (no access) |
| site_manager | (no access) | rules, announcements, maintenance_records |

## Admin Role Set

Used across contracts, audit trail, maintenance management, and settings:
`board_member`, `board_president`, `cam`, `site_manager`, `property_manager_admin`

## Enforcement Points

| Resource | Primary Enforcement | File |
|----------|-------------------|------|
| documents | DB query layer (category filter) | `packages/db/src/queries/document-access.ts` |
| meetings | Route handler (community type gate) | `apps/web/src/app/api/v1/meetings/route.ts` |
| announcements | Community membership | `apps/web/src/app/api/v1/announcements/route.ts` |
| residents | Community membership | `apps/web/src/app/api/v1/residents/route.ts` |
| audit_trail | Route handler (admin role check) | `apps/web/src/app/api/v1/audit-trail/route.ts` |
| compliance | Route handler (community type gate) | `apps/web/src/app/api/v1/compliance/route.ts` |
| contracts | Route handler (admin + community type) | `apps/web/src/app/api/v1/contracts/route.ts` |
| maintenance | Route handler (admin/resident split) | `apps/web/src/app/api/v1/maintenance-requests/route.ts` |
| leases | Route handler (community type gate) | `apps/web/src/app/api/v1/leases/route.ts` |
| settings | Route handler (admin role check) | (no dedicated route yet) |

## ADR-001 Constraints

- **One active role per (user_id, community_id):** Enforced by DB unique constraint on `user_roles(user_id, community_id)`.
- **Board-over-owner precedence:** When a user is both owner and board member, assign the board role (inherits owner capabilities).
- **platform_admin:** System-scoped, not stored in `user_roles`. Out of scope for this matrix.
- **auditor:** Deferred to v2 per ADR-001.
