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
- For every API endpoint, verify: tenants cannot see restricted documents in condos
- Owners cannot access other communities
- PM admins can only see their managed communities
- Board members have appropriate admin access
- Site managers have apartment-only admin access
- Apartment tenants see apartment document set
- Document access matrix (role × community_type × category) fully enforced at query level

## Acceptance Criteria
- [ ] Test suite covering all role × community_type combinations
- [ ] No endpoint returns data above the user's access level
- [ ] Direct API calls (bypassing UI) still respect access rules
- [ ] `pnpm test` passes with full RBAC coverage

## Technical Notes
- Create a test matrix for all role/community_type combinations
- Test boundary cases: role transitions, community reassignments
- Verify audit log captures attempted unauthorized access
- Use fixtures for consistent test data across role tests

## Files Expected
- `apps/web/lib/db/access-control.ts`
- `apps/web/__tests__/rbac.test.ts`
- `docs/RBAC_MATRIX.md` (role × community_type × resource mapping)

## Attempts
0
