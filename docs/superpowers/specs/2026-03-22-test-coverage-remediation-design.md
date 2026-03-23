# Test Coverage Remediation — Design Spec

**Date:** 2026-03-22
**Status:** Approved
**Branch:** `test/coverage-remediation` (from main)
**Audit reference:** `docs/audits/test-coverage-verification-2026-03-22.md`

## Problem

The test coverage verification audit identified critical gaps:

- 6 of 7 cron routes untested (revenue risk — late-fee processor could double-charge)
- 19 untested services (~8,300 LOC), including assessment automation and stripe
- No statutory compliance regression suite
- 18 of 19 hooks untested
- 92 proposed tests from branch `claude/analyze-test-coverage-dkW2T` never merged

## Approach

**Cherry-pick first, then fill gaps.** Cherry-pick the 3 existing commits onto a new branch, fix any failures from code drift, then write new tests for gaps not covered by the cherry-pick.

## Phase 1 — Cherry-pick & Validate

Cherry-pick commits from `origin/claude/analyze-test-coverage-dkW2T`:

1. `5091764` — Test coverage analysis doc (1 file)
2. `9a32f15` — Statutory compliance suite, E2E demo flows, hook failure-path tests, compliance integration tests (10 files, ~2,098 lines)
3. `636882e` — Amendment regression, anti-flake E2E, presigned URL tests, tenant isolation load test (5 files, ~141 lines)

**Validation:** Run `pnpm test` after cherry-pick. Fix any failures caused by code drift. If a commit has irreconcilable conflicts, use its test files as specs and rewrite against current code.

**Expected yield:** ~92 tests covering statutory §718 regression, E2E demo flows, hook failure paths, and compliance integration.

## Phase 2 — Tier 1: Cron Routes & Critical Services

### 2a. Cron Route Idempotency Tests

New test files under `apps/web/__tests__/cron/` (new directory for internal cron route tests):

| Route | Test File | Env Var | Key Cases |
|-------|-----------|---------|-----------|
| `late-fee-processor` | `late-fee-processor-route.test.ts` | `ASSESSMENT_CRON_SECRET` | Auth rejection without cron secret; idempotency (double-run = no duplicate charges); error propagation; success response format |
| `generate-assessments` | `generate-assessments-route.test.ts` | `ASSESSMENT_CRON_SECRET` | Auth; idempotency (double-run same month = no duplicates); empty community list |
| `assessment-overdue` | `assessment-overdue-route.test.ts` | `ASSESSMENT_CRON_SECRET` | Auth; transition correctness; no overdue items gracefully handled |
| `assessment-due-reminders` | `assessment-due-reminders-route.test.ts` | `ASSESSMENT_CRON_SECRET` | Auth; reminder scheduling; silent failure handling |
| `payment-reminders` | `payment-reminders-route.test.ts` | `PAYMENT_REMINDERS_CRON_SECRET` | Auth; reminder delivery; error handling |
| `expire-demos` | `expire-demos-route.test.ts` | (check source) | Auth; demo expiry logic; access request cleanup |

**Test pattern (following `digest-cron-route.test.ts`):**
- Set the relevant env var (e.g., `ASSESSMENT_CRON_SECRET`) in `beforeEach` and pass correct/incorrect Bearer tokens in the `NextRequest` headers — do NOT mock `requireCronSecret` directly
- Mock the service function each route calls (e.g., `processLateFees`)
- Test the HTTP handler layer: status codes, response bodies, error wrapping
- Note: `payment-reminders` uses `PAYMENT_REMINDERS_CRON_SECRET`, not `ASSESSMENT_CRON_SECRET`

### 2b. Assessment Automation Service (Expand)

Expand existing `apps/web/__tests__/finance/assessment-automation.test.ts`:

- Add tests for `processRecurringAssessments` (monthly billing generation, idempotency on same-month double-run, empty community list) — this function has **zero** test coverage currently
- The other three functions (`processOverdueTransitions`, `processLateFees`, `processAssessmentDueReminders`) already have `describe` blocks in the existing test file — review and expand if coverage is thin, but do not duplicate

### 2c. Stripe Service (New)

New file: `apps/web/__tests__/billing/stripe-service.test.ts`

- Mock the Stripe SDK constructor and method returns
- Test `createBillingPortalSession` (success, missing customer ID)
- Test `createEmbeddedCheckoutSession` (success, invalid price ID)
- Test `retrieveCheckoutSession`, `retrieveSubscription`, `retrieveInvoice`
- Test `getPriceId` (env var lookup, missing config)
- Test error handling: Stripe API errors, network failures, invalid responses

## Phase 3 — Tier 2: Onboarding, Emergency Routes, Hooks

### 3a. Onboarding Service (New)

New file: `apps/web/__tests__/services/onboarding-service.test.ts`

- Mock DB (`createScopedClient`) and email service
- Test `createOnboardingInvitation` (success, duplicate email handling)
- Test `createOnboardingResident` (success, validation errors)
- Test `resolveDisplayTitle` and `addDays` indirectly through the parent functions (these are unexported module-private helpers — do not export them just for testing)

### 3b. Emergency Broadcast Route Tests (New)

New files under `apps/web/__tests__/emergency/`:

| Route | Test File | Key Cases |
|-------|-----------|-----------|
| `GET/POST /emergency-broadcasts` | `emergency-broadcast-routes.test.ts` | Auth; list broadcasts; create broadcast validation; permission checks |
| `POST .../send` | `emergency-broadcast-send-route.test.ts` | Auth; send triggers service; already-sent guard |
| `POST .../cancel` | `emergency-broadcast-cancel-route.test.ts` | Auth; cancel logic; already-canceled guard |

### 3c. Hook Failure-Path Tests

New/expanded test files under `apps/web/src/hooks/__tests__/` or `apps/web/__tests__/`:

| Hook | Test File | Key Cases |
|------|-----------|-----------|
| `useDocumentUpload` | `useDocumentUpload.test.ts` | Upload progress tracking; presign URL failure; upload failure rollback; file validation |
| `useComplianceMutations` | `useComplianceMutations.test.ts` | Optimistic update; cache invalidation on failure; concurrent mutation handling |
| `use-finance` | `use-finance.test.ts` | Query error states; empty data handling; stale data refresh |

**Hook test pattern:** `renderHook` from RTL, mock TanStack Query's `useMutation`/`useQuery`, test error callbacks and cache invalidation.

## Testing Conventions

All new tests follow existing codebase patterns:

- `vi.hoisted()` for mock function references
- `vi.mock()` for module mocking
- `describe/it` block structure
- Cron tests set the env var and pass Bearer tokens in headers (do not mock `requireCronSecret`); mock the called service function
- Service tests mock `createScopedClient`/`createUnscopedClient` and external dependencies
- Hook tests use `renderHook` with mocked query client provider
- All tests are unit tests (no `DATABASE_URL` required)
- Tests run under existing vitest config (`vitest.config.ts`, jsdom environment)

## Out of Scope

- Integration tests (require live database)
- E2E Playwright tests (currently skipped in CI)
- Coverage reporting CI step (separate initiative)
- Services not in Tier 1 or Tier 2 (15 remaining untested services)

## Success Criteria

- [ ] All cherry-picked tests pass (fixed if needed)
- [ ] 6 new cron route test files with idempotency coverage
- [ ] Assessment automation service expanded with `processRecurringAssessments` test suite
- [ ] Stripe service test file with full function coverage
- [ ] At least 3 of 5 Tier 2 items completed (onboarding + emergency routes + hooks)
- [ ] All 3,968+ existing tests still pass
- [ ] CI green: lint, typecheck, unit tests, DB access guard, build
- [ ] PR created with clear description of coverage improvements
