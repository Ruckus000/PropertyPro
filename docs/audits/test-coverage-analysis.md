# Test Coverage Strategy — PropertyPro

**Date:** 2026-03-22
**Scope:** Full codebase audit and risk-prioritized testing implementation

## Philosophy

Coverage percentage is a vanity metric. What matters is: **can we prove statutory compliance for every §718 requirement, and does the demo work?**

This strategy is structured around what actually breaks in production — not what gives the green dashboard. A board treasurer who clicks something and gets a spinner forever will walk away. These are skeptical 60-80 year old volunteers on spotty Florida condo WiFi.

---

## What Was Implemented

### 1. CI Coverage Baseline

**File:** `.github/workflows/ci.yml`

- Added `vitest --coverage` with V8 provider to the CI unit test job
- Coverage scoped to high-risk code: `src/lib/services/**`, `src/lib/utils/**`, `src/hooks/**`, `src/components/compliance/**`, `src/components/finance/**`
- Coverage summary reported to GitHub step summary on every PR
- Config: `apps/web/vitest.config.ts` (coverage section)

### 2. E2E Demo Flow Tests (5 flows)

**File:** `apps/web/e2e/demo-flows.spec.ts`

These flows ARE the demo script. If they pass, the demo works.

| Flow | What It Proves |
|------|----------------|
| Board admin compliance | Dashboard loads → score displays → items visible → can navigate to action |
| Owner documents | Sees their community's documents → can access maintenance requests |
| PM portfolio | Portfolio dashboard loads → sees managed communities |
| Renter restrictions | Can see documents → CANNOT access finance dashboard |
| Public site | Landing page loads → login accessible without auth |

### 3. Statutory Compliance Regression Suite (43 tests)

**File:** `apps/web/__tests__/compliance/statutory-718-regression.test.ts`

Encodes every requirement from §718.111(12)(g) and §720.303 as executable tests:

- **Template completeness:** Condo requires exactly 16 categories, HOA requires 10
- **Document category coverage:** Every governing document, financial record, meeting record, insurance policy, and operations document verified against statute references
- **30-day posting deadline enforcement:** Boundary conditions, weekend rollover, millisecond precision
- **Rolling window compliance:** 12-month window boundaries, stale document detection
- **Meeting notice windows:** 14-day owner meeting, 48-hour board meeting, non-compliant scheduling detection
- **Score accuracy:** 100%, 0%, mixed-status calculations with N/A exclusion
- **Category grouping:** Preserves statutory order (governing → financial → meeting → insurance → operations)
- **Conditional item handling:** 5 conditional items correctly flagged (video, conflicts, bids, inspections, SIRS)

When HB 913's next amendment drops, update `packages/shared/src/compliance/templates.ts` and run this suite.

### 4. Hook Tests — Failure Paths (34 tests)

**Files:**
- `apps/web/src/hooks/__tests__/useDocumentUpload.test.ts` (8 tests)
- `apps/web/src/hooks/__tests__/useComplianceMutations.test.tsx` (9 tests)
- `apps/web/src/hooks/__tests__/use-finance.test.tsx` (15 tests)

Focus: **error/edge cases, not happy paths.**

| Hook | What's Tested |
|------|--------------|
| useDocumentUpload | Presign failure, network timeout, S3 403, connection drop mid-upload, metadata save failure after successful upload |
| useComplianceMutations | Optimistic update → rollback on failure, correct cache targeting (siblings unchanged), error message extraction, network error rollback |
| use-finance | Query key factory correctness (cache invalidation), enabled gate (no fetch for communityId=0), error message extraction, missing payload handling, URL filter construction |

### 5. Integration Tests — Compliance Deadlines (10 tests)

**File:** `apps/web/__tests__/integration/compliance-statutory-deadlines.integration.test.ts`

Tests against real database with RLS policies enforced:

- Condo generates exactly 16 items, HOA generates exactly 10
- Tenant isolation: actorA cannot see communityB data
- Tenant role cannot read compliance checklist
- Every generated item has non-empty statute reference starting with §
- Items without documents show unsatisfied/overdue status
- PATCH operations change status correctly
- Mark applicable/not-applicable state transitions
- All 5 statutory categories covered

### 6. Critical Component Tests (15 tests)

**Files:**
- `apps/web/__tests__/compliance/compliance-dashboard.test.tsx` (7 tests)
- `apps/web/__tests__/finance/assessment-manager.test.tsx` (6 tests)
- `apps/web/__tests__/finance/payment-portal.test.tsx` (4 tests)

Only the 3 components that handle money or compliance status. NOT 228 components alphabetically.

| Component | What's Tested |
|-----------|--------------|
| ComplianceDashboard (536 lines) | Loading skeleton, error state, empty/onboarding state, score accuracy (50%, 60%, 100%), category rendering, communityId prop passing |
| AssessmentManager (815 lines) | Dollar amounts (cents→dollars), error state, empty state, create dialog, frequency labels |
| PaymentPortal (409 lines) | Total due calculation (pending + overdue, excluding paid), error state, empty state |

---

## Test Results

**New tests added:** 92 tests across 7 files — all passing
**Pre-existing suite:** 3,975 tests passing (no regressions introduced)
**Pre-existing failures:** 5 files (esign, finance-mutation, finance-webhook, violations, visitors) — unchanged

---

## What's NOT Tested (and Why That's OK for Now)

| Category | Reason |
|----------|--------|
| 218 other components | Test the 3 that handle money/compliance deeply. The rest break during development, not in production. |
| Page routes (83 files) | Server components are composition — the real logic is in hooks and services. E2E covers the user-facing behavior. |
| Happy-path hook tests | The happy path works or you'd have noticed. Test the failure paths harder. |
| Snapshot tests | False confidence. A snapshot test that passes doesn't prove the component is correct. |

---

## Remaining High-Priority Gaps

### Should Be Next

1. **Internal/cron routes** — Test for idempotency and failure recovery, not just 200 on valid input. If the late-fee processor runs twice, it shouldn't double-charge anyone.
2. **Emergency broadcast hooks/routes** — Safety-critical; SMS broadcast on wrong community = legal problem.
3. **E-sign service** — 32.5KB of legal document workflow. Needs integration tests for the full sign→complete flow.

### Can Wait

- PM reports hooks (nice-to-have, not revenue-critical)
- Calendar sync (annoying if broken, not catastrophic)
- Package/visitor management (operational, not compliance)

---

## Architecture

```
tests/
├── Unit (vitest, jsdom)
│   ├── Statutory regression suite ←── §718 requirements as executable tests
│   ├── Hook failure-path tests ←── Upload errors, network drops, rollbacks
│   └── Critical component tests ←── Only money + compliance UI
│
├── Integration (vitest, node, real DB)
│   ├── Existing 19 route tests ←── Established test-kit pattern
│   └── Compliance deadlines ←── Real DB + RLS for deadline verification
│
└── E2E (Playwright)
    ├── Existing 2 smoke tests
    └── 5 demo flow tests ←── The actual sales demo as executable tests
```
