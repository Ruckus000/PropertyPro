# Spec: P4-58 — Integration Tests

> Write integration tests for all critical user flows including signup, upload, compliance, and search.

## Phase
4

## Priority
P0

## Dependencies
- P4-57

## Functional Requirements
- Test flows: self-service signup → payment → provisioning → first login → onboarding wizard
- Document upload → magic bytes validation → text extraction → search indexing → search returns result
- Compliance checklist generation → document upload satisfies item → status updates
- Tenant isolation (covered in P2-43 but extended)
- Role-based document filtering across all community types
- Meeting notice deadline calculations

## Acceptance Criteria
- [ ] All integration tests pass
- [ ] Critical flows tested end-to-end
- [ ] Test coverage > 80% on API routes
- [ ] `pnpm test` passes

## Technical Notes
- Use real database (Supabase test instance) for integration tests
- Create test fixtures for each community type (condo, HOA, apartment)
- Test both happy path and error scenarios
- Use database transactions to isolate test data
- Consider using Playwright for E2E flow tests

## Files Expected
- `apps/web/__tests__/integration/signup.test.ts`
- `apps/web/__tests__/integration/document-upload.test.ts`
- `apps/web/__tests__/integration/compliance.test.ts`
- `apps/web/__tests__/integration/role-isolation.test.ts`
- `apps/web/__tests__/fixtures/community-fixtures.ts`

## Attempts
0
