# Spec: P2-43 — Multi-Tenant Isolation Tests

> Write comprehensive integration tests that verify no cross-tenant data leakage across all endpoints.

## Phase
2 — Multi-Tenancy & Self-Service

## Priority
P0

## Dependencies
- P0-06
- P2-30

## Functional Requirements
- Create two test communities (different types)
- Create users in each
- For every data-returning API endpoint: verify User A in Community 1 cannot see Community 2 data
- Test document access, meeting access, announcement access, resident list, maintenance requests
- Test that scoped query builder correctly filters
- Test subdomain routing returns correct tenant
- Test that direct API calls with wrong community context are rejected

## Acceptance Criteria
- [ ] Every data endpoint has a cross-tenant isolation test
- [ ] All tests pass
- [ ] No endpoint returns data from wrong community
- [ ] pnpm test passes with full coverage on isolation tests

## Technical Notes
- This is the most important test suite in the application
- Cross-tenant data leaks are the highest-severity security issue

## Files Expected
- apps/api/tests/integration/multi-tenant-isolation.test.ts
- apps/api/tests/fixtures/multi-tenant-communities.ts
- apps/api/tests/fixtures/multi-tenant-users.ts

## Attempts
0
