# Workstream 72: Security and Reliability Gates

**Complexity:** Medium
**Tier:** Final (last to merge — cross-cutting hardening gate)
**Migration Range:** 0090-0094
**Depends on:** All other workstreams (66-71)

---

## 1. Objective And Business Outcome

Validate cross-workstream security boundaries, tenant isolation invariants, and production readiness. This is the final quality gate before Phase 5 is declared complete.

**Note:** Chaos engineering drills (webhook replay storms, sync token invalidation, worker pause/recovery) are **deferred to post-launch** when real traffic patterns exist to validate against. This workstream focuses on security boundary tests and hardening.

---

## 2. In Scope

- Cross-module security boundary tests (tenant header spoofing, context spoof attempts)
- Permission boundary tests across all Phase 5 features
- Cross-tenant data leak detection tests
- RLS policy audit across all Phase 5 tables
- `withErrorHandler` coverage verification for all new routes
- Audit event completeness verification
- Rate limiting validation for new endpoints
- Production deployment checklist
- Incident runbook templates for Phase 5 features

---

## 3. Out Of Scope

- Chaos engineering drills (deferred to post-launch)
- Load testing beyond existing `perf:check` budget (WS 66 may add finance-specific load tests)
- Penetration testing by external firm
- SOC 2 compliance documentation

---

## 4. Dependencies

| Dependency | Source | Status |
|---|---|---|
| All Phase 5 workstreams (65-71) | Various | Must be complete or near-complete |
| All Phase 5 RLS policies | Various | Must be applied |
| All Phase 5 API routes | Various | Must be deployed |

---

## 5. Data Model And Migrations

Minimal — primarily adds verification infrastructure:

- May add `security_audit_results` table for storing automated audit scan results (optional)
- No new tenant-scoped tables

---

## 6. API Contracts

No new API endpoints. This workstream tests existing endpoints.

---

## 7. Authorization + RLS Policy Family Mapping

Verifies authorization across all Phase 5 tables:

### Cross-Tenant Abuse Tests
For each Phase 5 table, verify:
1. Scoped client for communityA cannot read communityB data
2. API requests with communityA context cannot access communityB resources
3. Spoofed `x-community-id` headers are stripped by middleware (existing behavior, verify not regressed)

### Permission Boundary Tests
For each Phase 5 RBAC resource, verify:
1. Each role can only perform actions allowed by the RBAC matrix
2. Role escalation is not possible through API manipulation
3. Feature flag enforcement blocks access when flag is `false`

---

## 9. Failure Modes And Edge Cases

### Deliberate Abuse Scenarios to Test
- Malformed `x-community-id` header with SQL injection payload → must be stripped
- Valid auth token from communityA used against communityB API → must reject
- Expired/revoked session token → must return 401, not leak data
- Request with missing community context to tenant-scoped route → must return appropriate error
- Bulk data export attempt across tenant boundary → must be impossible
- Rate limit bypass via header manipulation → must enforce limits

---

## 10. Testing Plan

### Seed Strategy
- Reuse existing multi-tenant fixtures
- Extend with Phase 5 data from all workstreams

### Teardown Rules
- Standard; no new data created beyond test fixtures

### Tenant Isolation Matrix
- **Every Phase 5 table** must have at least one cross-tenant isolation test
- Matrix: communityA actor × communityB data × each CRUD operation

### Concurrency Cases
- Not the primary focus; individual workstreams handle their own concurrency tests

### Environment Requirements
- `DATABASE_URL` — Required
- All Phase 5 migrations applied

### Required Test Coverage
- Cross-tenant access attempt for every new table (integration)
- Header spoofing rejection (integration)
- RBAC matrix enforcement for all new resources (integration)
- Feature flag enforcement for all new flags (integration)
- `withErrorHandler` wrapping verification (static analysis or test)
- Audit event completeness verification (integration)

---

## 12. Definition Of Done + Evidence Required

- [ ] Cross-tenant isolation tests pass for ALL Phase 5 tables
- [ ] Permission boundary tests pass for ALL Phase 5 RBAC resources
- [ ] Header spoofing tests pass
- [ ] All Phase 5 routes verified to use `withErrorHandler`
- [ ] All Phase 5 mutations verified to emit audit events
- [ ] Rate limiting verified for all new endpoints
- [ ] Production deployment checklist created
- [ ] Incident runbooks created for Finance, Violations, and Work Orders
- [ ] No open P0/P1 defects across any Phase 5 workstream
- [ ] Evidence doc in `docs/audits/phase5-72-YYYY-MM-DD.md`
- [ ] **Phase 5 overall evidence doc** in `docs/audits/phase5-gate-YYYY-MM-DD.md`
