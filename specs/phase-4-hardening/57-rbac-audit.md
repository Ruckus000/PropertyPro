# Spec: P4-57 — RBAC Audit

> Verify role-based access control is correctly enforced across all endpoints and community types.

## Phase
4

## Priority
P0

## Dependencies
- P4-56
- P1-25

## Functional Requirements
- For every API endpoint, verify access rules based on all 7 canonical roles (owner, tenant, board_member, board_president, cam, site_manager, property_manager_admin) and community types (condo_718, hoa_720, apartment) per ADR-001:
  - Tenants cannot access restricted documents in condo/HOA
  - Owners cannot access communities they don't belong to
  - Board presidents have admin access to community documents/settings in condo/HOA
  - Board members have document editor access in condo/HOA
  - CAM can access assigned communities in condo/HOA (disallowed in apartment)
  - Property manager admins can only access their managed communities
  - Site managers have apartment-only admin access (disallowed in condo/HOA)
  - Apartment tenants see apartment-specific document set
- Test disallowed role/community combinations are rejected (e.g., site_manager in condo, cam in apartment)
- Document access matrix (role × community_type × category) fully enforced at DB query layer as primary enforcement per ADR-001
- Verify DB-layer enforcement by testing direct query-layer access bypassing API

## Acceptance Criteria
- [ ] Test suite covers all 7 canonical roles × 3 community_type combinations per ADR-001
- [ ] Test suite includes negative cases: disallowed role/community combinations are rejected
- [ ] Test suite validates one active role per (user_id, community_id) constraint per ADR-001
- [ ] Test suite includes role transition cases verifying board-over-owner precedence per ADR-001
- [ ] No endpoint returns data above the user's access level
- [ ] Direct API calls (bypassing UI) still respect access rules
- [ ] Direct DB queries (bypassing API) enforce role × community_type access rules per ADR-001
- [ ] Audit log captures attempted unauthorized access with role and community context
- [ ] `pnpm test` passes with full RBAC coverage
- [ ] NOTE: This spec is a test gate blocker per ADR-001 — implementation of role-based features blocked until these tests are specified and accepted

## Technical Notes
- Create comprehensive test matrix: 7 canonical roles × 3 community types = 21 base combinations per ADR-001
- Each combination tested against all resource categories (documents, meetings, announcements, etc.)
- Include negative test cases: attempt to assign site_manager in condo/HOA (should fail), attempt to assign cam in apartment (should fail)
- Test boundary cases: role transitions, community reassignments, one-active-role enforcement
- Verify DB-layer enforcement: test query layer directly without API intermediary per ADR-001
- Test board-over-owner precedence: when one user holds both roles in same community, board role permissions take precedence per ADR-001
- Verify audit log captures attempted unauthorized access with specific role and community context
- Use fixtures for consistent test data across all role/community_type tests ensuring test isolation

## Files Expected
- `apps/web/lib/db/access-control.ts`
- `apps/web/__tests__/rbac.test.ts`
- `docs/RBAC_MATRIX.md` (role × community_type × resource mapping)

## Attempts
0
