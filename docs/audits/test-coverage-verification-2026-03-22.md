# Test Coverage Verification Audit

**Date:** 2026-03-22
**Scope:** Verify findings from `claude/analyze-test-coverage-dkW2T` branch against current `main` (post-Phase 4)
**Method:** Independent audit of test file inventory + gap analysis

---

## Executive Summary

The test coverage analysis from branch `claude/analyze-test-coverage-dkW2T` identified gaps and proposed 92 new tests across 9 files. **None of those 9 test files were ever merged to main.** The analysis document itself (`docs/audits/test-coverage-analysis.md`) also never merged. The proposed tests exist only on that branch.

Current main has **171 test files, 3,968 passing tests**. The coverage is strong in billing, esign, middleware, and PM domains but has significant blind spots in cron jobs, hooks, and several large services.

---

## Verification: Branch Claims vs Reality

### Claimed Test Files — Status on Main

| File | Claimed Tests | On Main? |
|------|--------------|----------|
| `statutory-718-regression.test.ts` | 43 tests | **MISSING** |
| `compliance-dashboard.test.tsx` | 7 tests | **MISSING** |
| `assessment-manager.test.tsx` | 6 tests | **MISSING** |
| `payment-portal.test.tsx` | 4 tests | **MISSING** |
| `compliance-statutory-deadlines.integration.test.ts` | 10 tests | **MISSING** |
| `demo-flows.spec.ts` | 5 E2E tests | **MISSING** |
| `use-finance.test.tsx` | 15 tests | **MISSING** |
| `useComplianceMutations.test.tsx` | 9 tests | **MISSING** |
| `useDocumentUpload.test.ts` | 8 tests | **MISSING** |

**All 9 files (92 tests) are missing from main.** They need to be cherry-picked or re-implemented.

### Claimed Gap Priorities — Current Status

| Gap | Original Assessment | Current Status | Verified? |
|-----|-------------------|----------------|-----------|
| Internal/cron idempotency | Critical | **Still critical** — 6 of 7 cron routes have zero tests | ✅ Confirmed |
| Emergency broadcasts | High | **Partially mitigated** — service has tests, but routes and hook do not | ✅ Confirmed |
| E-sign service | Should be next | **Well-covered** — 6 test files, 131 test cases | ✅ Confirmed (no longer a gap) |
| Compliance statutory suite | Critical (proposed) | **Still missing** — branch tests never merged | ✅ Confirmed |

---

## Current State: Test Suite Inventory

### By Category

| Category | Files | Tests |
|----------|-------|-------|
| Unit tests (apps/web) | 159 | 1,620 |
| Unit tests (apps/admin) | 8 | 66 |
| Integration tests | 19 | 234 |
| Package tests | 43 | 610 |
| E2E tests | 2 | 8 (skipped) |
| **Total** | **171 passing + 2 skipped** | **3,968** |

### Strongest Coverage

| Domain | Files | Tests | Assessment |
|--------|-------|-------|------------|
| E-sign | 6 | 131 | Comprehensive |
| Billing/Stripe | 5 | 97 | Strong |
| PM dashboard | 8 | 72 | Good |
| Middleware | 4 | 63 | Good (now includes CSRF) |
| Access requests | 2 | 32 | Good (new, Phase 4) |

### Critical Gaps

#### 1. Untested Cron/Internal Routes (CRITICAL)

6 of 7 internal routes have **zero** test coverage. These run automatically and handle money:

| Route | Risk | Why It Matters |
|-------|------|---------------|
| `late-fee-processor` | **Revenue** | Double-run = double-charge residents |
| `generate-assessments` | **Revenue** | Idempotency failure = duplicate assessments |
| `assessment-due-reminders` | **UX** | Silent failure = no reminder emails |
| `assessment-overdue` | **Revenue** | Incorrect overdue marking = billing disputes |
| `payment-reminders` | **UX** | Silent failure = missed payment notices |
| `expire-demos` | **Ops** | Failure = demos never expire (low risk) |

Only `notification-digests/process` has a test (`digest-cron-route.test.ts`).

#### 2. Untested Services (HIGH — 19 services, ~8,300+ LOC)

| Service | LOC | Risk Level |
|---------|-----|------------|
| work-orders-service | 843 | High — maintenance workflows |
| polls-service | 582 | Medium — community voting |
| package-visitor-service | 538 | Medium — package tracking |
| assessment-automation-service | 529 | **Critical** — automated billing |
| notification-digest-processor | 445 | Medium — email digests |
| calendar-sync-service | 434 | Low — Google Calendar |
| accounting-connectors-service | 419 | Medium — financial integrations |
| announcement-delivery | 339 | Medium — bulk notifications |
| payment-alert-scheduler | 319 | **High** — payment reminders |
| demo-conversion | 285 | Medium — sales flow |
| calendar-data-service | 273 | Low — event queries |
| stripe-service | unknown | **High** — payment processing |
| onboarding-service | unknown | High — new community setup |
| contract-renewal-alerts | unknown | Low — contract tracking |
| demo-session | unknown | Low — demo helpers |
| faq-service | unknown | Low — help content |
| move-checklist-service | unknown | Low — move-in/out |
| photo-processor | unknown | Low — image handling |

#### 3. Untested Hooks (MEDIUM — 18 of 19 hooks)

Only `use-plan-gate.ts` has tests. All other hooks including `useComplianceMutations`, `useDocumentUpload`, `use-finance`, `use-emergency-broadcasts` have zero coverage. These hooks contain client-side business logic (cache management, optimistic updates, error handling).

#### 4. Missing Statutory Compliance Tests (HIGH)

No test encodes §718.111(12)(g) requirements as executable assertions. The compliance service exists and works, but there's no regression suite proving:
- Correct document category counts per community type
- 30-day posting deadline enforcement
- Meeting notice timing windows (14-day / 48-hour)
- Score calculation accuracy

---

## Recommended Priority Order

### Tier 1: Revenue & Safety (Must Have)

1. **Cron route idempotency tests** — `late-fee-processor`, `generate-assessments`, `assessment-overdue`
2. **Statutory compliance regression suite** — Cherry-pick from `claude/analyze-test-coverage-dkW2T` or rewrite
3. **assessment-automation-service tests** — 529 LOC of automated billing logic
4. **payment-alert-scheduler tests** — Payment reminder scheduling

### Tier 2: Core Workflows (Should Have)

5. **stripe-service tests** — Payment processing
6. **onboarding-service tests** — New community provisioning
7. **Emergency broadcast route tests** — Route-level coverage for safety-critical endpoints
8. **Hook failure-path tests** — `useDocumentUpload`, `useComplianceMutations`, `use-finance`

### Tier 3: Operational (Nice to Have)

9. **work-orders-service tests** — Maintenance workflows
10. **notification-digest-processor tests** — Email digest logic
11. **polls-service tests** — Community voting
12. **E2E demo flow tests** — Cherry-pick from branch or rewrite

---

## Action Items

1. **Cherry-pick the 9 test files from `claude/analyze-test-coverage-dkW2T`** if they still compile against current main. If not, use them as specs for rewriting.
2. **Write cron idempotency tests** — highest ROI, protects revenue.
3. **Add CI coverage reporting** — The branch proposed `vitest --coverage` with V8 provider scoped to high-risk code. This should be implemented.
