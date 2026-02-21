# Gate 3 Evidence Protocol — Phase 2 Closeout

**Last Updated:** 2026-02-20
**Protocol Version:** 1.0
**Applies To:** Phase 2 closeout (all 16/16 base tasks complete)

---

## Purpose

This protocol defines:
1. Required evidence for Gate 3 sign-off
2. Test execution context and environment validation
3. Security redaction rules for captured logs
4. Isolation proof requirements
5. End-to-end flow verification (webhook delivery, provisioning state)
6. Rate limiting validation
7. Evidence freshness requirements

---

## 1. Pre-Capture Environment Validation

### 1.1 Branch Freshness Check

**Requirement:** Evidence must be captured from `main` branch with 0 commits ahead/behind `origin/main`.

**Commands:**
```bash
git fetch origin
git status

# Expected output:
# On branch main
# Your branch is up to date with 'origin/main'.
# nothing to commit, working tree clean
```

**Failure protocol:** If branch is behind origin, pull and re-run all tests. If branch is ahead, evidence is invalid (must push first or use committed state).

### 1.2 Dependency State Check

**Requirement:** `pnpm-lock.yaml` must match installed `node_modules`.

**Commands:**
```bash
pnpm install --frozen-lockfile

# Expected: no changes to pnpm-lock.yaml
git status pnpm-lock.yaml
```

**Failure protocol:** If lockfile changes, commit changes and restart evidence capture.

### 1.3 Migration State Check

**Requirement:** Database schema must match latest migrations.

**Commands:**
```bash
set -a; source .env.local; set +a
pnpm --filter @propertypro/db db:migrate

# Expected output:
# [✓] done
# (No new migrations applied)
```

**Failure protocol:** If migrations are applied, evidence is invalid. Database was stale.

---

## 2. Test Execution Context

### 2.1 Environment Variables Required

**Minimum required variables:**
- `DATABASE_URL` (Supabase connection string)
- `DIRECT_URL` (for migrations)
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `STRIPE_SECRET_KEY` (can be test mode)
- `STRIPE_WEBHOOK_SECRET` (can be test mode)
- `RESEND_API_KEY` (can be test mode)
- `NEXT_PUBLIC_APP_URL`

**Environment loading pattern:**
```bash
set -a
source .env.local
set +a
```

**Redaction note:** Capture only variable names in evidence, not values. See Section 7 for redaction rules.

### 2.2 Test Execution Order

1. Static checks (no DB required):
   ```bash
   pnpm build
   pnpm typecheck
   pnpm lint
   pnpm plan:verify:phase2
   ```

2. Unit tests (mocked dependencies):
   ```bash
   pnpm test
   ```

3. Integration tests (requires DB):
   ```bash
   pnpm test:integration:preflight
   ```

**Critical:** Do NOT run integration tests before static checks pass. Build failures should gate integration runs.

---

## 3. Isolation Proof Requirements

### 3.1 Cross-Tenant Isolation Tests

**Required test files:**
- `apps/web/__tests__/integration/multi-tenant-isolation.integration.test.ts` (9 tests)
- `apps/web/__tests__/integration/multi-tenant-access-policy.integration.test.ts` (11 tests)
- `apps/web/__tests__/integration/multi-tenant-routes.integration.test.ts` (44 tests)

**Evidence requirement:** Capture test output showing:
- All 64 tests passed
- No skipped tests
- Duration under 2 minutes (performance baseline)

**What these tests prove:**
- Community A users cannot access Community B data
- Document queries are scoped by `communityId`
- Announcement creation requires community membership
- Meeting attachment/detachment respects tenant boundaries
- Upload presigned URLs are tenant-isolated
- Notification preferences are user-scoped
- Lease routes enforce feature flag + tenant isolation

### 3.2 Database Isolation Tests

**Required test files:**
- `packages/db/__tests__/scoped-client.integration.test.ts` (7 tests)
- `packages/db/__tests__/documents-tenant-isolation.integration.test.ts` (4 tests)

**Evidence requirement:** Capture test output showing scoped client behavior:
- `createScopedClient(communityId)` auto-filters all queries
- Cross-tenant queries return empty results
- Direct unscoped queries are blocked by `guard:db-access` lint rule

---

## 4. Webhook Delivery Verification

### 4.1 Webhook Handler Tests

**Required test file:**
- `apps/web/__tests__/billing/stripe-webhook.test.ts`

**Coverage verification:**
- [ ] Signature verification (valid, invalid, missing header)
- [ ] Idempotency (duplicate events return 200 without re-processing)
- [ ] `checkout.session.completed` → creates `pending_signups` row
- [ ] `customer.subscription.updated` → updates `communities.subscription_status`
- [ ] `customer.subscription.deleted` → sets `subscriptionCanceledAt`
- [ ] `invoice.payment_failed` → triggers payment failed email
- [ ] `invoice.payment_succeeded` → clears past_due status
- [ ] Unhandled event types silently ignored (no 500 errors)

**Known limitation:** All webhook tests use mocked Stripe SDK. Real webhook delivery (ngrok tunnel → local server → Stripe event processing) is NOT tested in CI.

**Acceptance criteria for Gate 3:** Unit test coverage is sufficient. Real webhook delivery is validated manually in staging/production rollout (post-Gate 3).

---

## 5. Provisioning State Validation

### 5.1 Provisioning Pipeline Tests

**Coverage verification:**
- [ ] Provisioning job state machine (initiated → completed)
- [ ] Resumable state transitions (uses `last_successful_status`)
- [ ] Idempotent step execution (re-running same step doesn't duplicate data)
- [ ] Failure handling (status=failed, retry_count incremented)
- [ ] Community creation (communities row inserted)
- [ ] User linking (user_roles row inserted)
- [ ] Checklist generation (compliance_checklist_items inserted)
- [ ] Category creation (document_categories inserted)
- [ ] Preference initialization (notification_preferences inserted)
- [ ] Welcome email sent (sendEmail called)

**Known limitation:** Provisioning tests are unit-only (mocked `createUnscopedClient`). Two simultaneous provisioning jobs running concurrently are NOT tested.

**Acceptance criteria for Gate 3:** Unit test coverage proves state machine correctness. Concurrent provisioning stress test is deferred to Phase 3 scaling validation.

---

## 6. Rate Limiting Validation

### 6.1 Rate Limiter Tests

**Required test file:**
- `apps/web/__tests__/middleware/rate-limiter.test.ts`

**Coverage verification:**
- [ ] SlidingWindowRateLimiter allows requests under limit
- [ ] SlidingWindowRateLimiter blocks requests when limit reached
- [ ] `retryAfter` returned in whole seconds
- [ ] Route classification (public, authenticated, webhook)
- [ ] Rate limit key generation (IP-based for public, user-based for authed)

**Known limitation:** Tests only verify classification logic and in-memory limiter behavior. Actual `429` HTTP responses under load are NOT tested in integration suite.

**Acceptance criteria for Gate 3:** Unit test coverage is sufficient. Load testing with real 429 responses is deferred to Phase 3 performance validation.

---

## 7. Redaction Rules

### 7.1 Required Redactions

**ALWAYS redact before publishing evidence:**
- Database connection strings (`DATABASE_URL`, `DIRECT_URL`)
- API keys (`STRIPE_SECRET_KEY`, `RESEND_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`)
- Webhook secrets (`STRIPE_WEBHOOK_SECRET`)
- Real email addresses (replace with `user@example.com`)
- Real Stripe IDs (replace with `cus_REDACTED`, `sub_REDACTED`)

**Safe to include:**
- Test counts (e.g., "102 tests passed")
- Duration (e.g., "Duration: 28.59s")
- Branch name (e.g., `main`)
- Commit hash (e.g., `170d987`)
- Environment variable names (e.g., "DATABASE_URL is set")
- File paths (e.g., `apps/web/__tests__/integration/...`)

### 7.2 Redaction Pattern

**Before:**
```
DATABASE_URL=postgresql://postgres:secret123@db.supabase.co:5432/postgres
STRIPE_SECRET_KEY=sk_live_51abc123xyz
```

**After:**
```
DATABASE_URL=[REDACTED - Supabase connection string]
STRIPE_SECRET_KEY=[REDACTED - Stripe secret key]
```

---

## 8. Evidence Capture Template

### 8.1 Document Structure

**File naming:** `gate3-evidence-YYYY-MM-DD.md`

**Template:**

```markdown
# Gate 3 Evidence — [Date]

## Context

| Field          | Value                        |
|----------------|------------------------------|
| Commit         | [commit hash]                |
| Branch         | main                         |
| Freshness      | 0/0 with origin/main         |
| Working tree   | clean                        |
| Runner         | [Name + Claude version]      |
| Date           | [YYYY-MM-DD]                 |

## Pre-Checks

- [ ] `git status` shows clean working tree
- [ ] `git fetch origin && git status` shows 0/0 with origin/main
- [ ] `pnpm install --frozen-lockfile` reports no changes
- [ ] `pnpm --filter @propertypro/db db:migrate` reports no new migrations

## Static Checks

### 1. Build

**Command:**
```bash
pnpm build
```

**Result:** [PASS/FAIL]
**Duration:** [X seconds]
**Output:** [Include build warnings if any, or "No warnings"]

### 2. Typecheck

**Command:**
```bash
pnpm typecheck
```

**Result:** [PASS/FAIL]
**Output:** [Include type errors if any, or "No errors"]

### 3. Lint

**Command:**
```bash
pnpm lint
```

**Result:** [PASS/FAIL]
**Output:** [Include lint errors if any, or "No errors"]

### 4. Plan Consistency Verification

**Command:**
```bash
pnpm plan:verify:phase2
```

**Result:** [PASS/FAIL]
**Output:** [Include verification summary]

## Unit Tests

**Command:**
```bash
pnpm test
```

**Result:** [PASS/FAIL]
**Summary:**
- Test files: [count]
- Tests passed: [count]
- Tests failed: [count]
- Duration: [X seconds]

## Integration Tests

### Full Preflight Suite

**Command:**
```bash
set -a; source .env.local; set +a; pnpm test:integration:preflight
```

**Result:** [PASS/FAIL]

**Breakdown:**

#### Step 1: DB Migrations
**Result:** [PASS/FAIL]
**Output:** [Migration summary]

#### Step 2: Seed Verification
**Result:** [PASS/FAIL]
**Output:** [Seed verification table]

#### Step 3: DB Integration Tests (31 tests)
**Result:** [PASS/FAIL]
**Summary:**
- Test files: [count]
- Tests passed: 31
- Duration: [X seconds]

**Key test files:**
- scoped-client.integration.test.ts
- documents-tenant-isolation.integration.test.ts
- audit-log-append-only-db.integration.test.ts
- seed-demo.integration.test.ts
[... list all 9 files ...]

#### Step 4: Web Integration Tests (71 tests)
**Result:** [PASS/FAIL]
**Summary:**
- Test files: [count]
- Tests passed: 71
- Duration: [X seconds]

**Key test files:**
- multi-tenant-isolation.integration.test.ts (9 tests)
- multi-tenant-access-policy.integration.test.ts (11 tests)
- multi-tenant-routes.integration.test.ts (44 tests)
- onboarding-flow.integration.test.ts
- onboarding-flow-condo.integration.test.ts

### Total Integration Test Count
**Total:** 102 tests (31 DB + 71 web)
**Total Duration:** [X seconds]

## Gate 3 Verification Checklist

- [ ] All Phase 2 tests pass (unit + integration)
- [ ] Cross-tenant isolation tests pass (64 tests)
- [ ] Subdomain routing tested (multi-tenant-routes.integration.test.ts)
- [ ] Stripe webhook flow tested (stripe-webhook.test.ts)
- [ ] Provisioning pipeline tested (unit coverage)
- [ ] Rate limiting tested (rate-limiter.test.ts)
- [ ] Build clean
- [ ] Typecheck clean
- [ ] Lint clean
- [ ] Plan verification clean
- [ ] Full integration preflight passes (102 tests)

## Known Limitations

1. **Webhook delivery:** Tests use mocked Stripe SDK. Real webhook delivery (ngrok → local server) not tested in CI.
2. **Provisioning concurrency:** Two simultaneous provisioning jobs not tested. Unit coverage proves state machine correctness.
3. **Rate limiting under load:** Actual 429 HTTP responses not tested. Unit coverage proves limiter logic correctness.
4. **Feature flag enforcement:** Cross-tenant feature access not tested (addressed by feature-flag-enforcement.integration.test.ts).
5. **Billing-to-provisioning handoff:** Individual steps tested in isolation. End-to-end from Stripe event → provisioned community not tested.

**Acceptance for Gate 3:** Above limitations are acceptable. Limitations 1-3, 5 are deferred to Phase 3 staging/production validation and performance testing. Limitation 4 is addressed by new integration test added in this remediation.

## Blockers

[None / List any blockers discovered during evidence capture]

## Sign-Off

**Evidence captured by:** [Name]
**Evidence reviewed by:** [Name]
**Gate 3 status:** [PASS / FAIL / BLOCKED]
**Date:** [YYYY-MM-DD]
```

---

## 9. Fallback Protocol for Environment Edge Cases

### 9.1 Sandbox / No-Network Runs

**Symptom:** Integration tests fail with `ENOTFOUND` (DNS lookup failure) when `DATABASE_URL` points to external Supabase instance.

**Fallback:**
1. Acknowledge environment limitation in evidence document.
2. Run static checks only (build, typecheck, lint, plan verification).
3. Run unit tests with mocked dependencies.
4. Document that integration tests cannot run in sandbox environment.
5. Gate 3 sign-off requires evidence from environment with network access.

**Acceptable for Gate 3:** No. Evidence must include integration test results.

### 9.2 Missing Environment Variables

**Symptom:** Integration tests skip due to missing `DATABASE_URL`.

**Fallback:**
1. Verify `.env.local` exists at project root.
2. Verify all required variables are set (see Section 2.1).
3. If variables cannot be provided, document blocker and defer Gate 3 sign-off.

**Acceptable for Gate 3:** No. All integration tests must run.

---

## 10. Evidence Freshness Requirement

**Rule:** Evidence older than 7 days is considered stale and must be regenerated.

**Rationale:** Schema migrations, dependency updates, or feature changes may invalidate old evidence.

**Exception:** If `main` branch has not changed since evidence capture (verified by commit hash match), evidence remains valid.

---

## 11. Known Limitations (Acceptable for Gate 3)

### 11.1 Webhook Delivery

**Limitation:** Tests use mocked Stripe SDK (`stripe.webhooks.constructEvent`). Real webhook delivery from Stripe servers → ngrok → local server → event processing is NOT tested in CI.

**Why acceptable:** Unit tests prove webhook handler correctness (signature validation, idempotency, event routing). Real delivery testing requires:
- Ngrok or similar tunneling service
- Stripe CLI webhook forwarding
- Network access from CI environment
These dependencies are impractical for CI. Manual validation in staging/production is sufficient.

**Deferred to:** Phase 3 staging deployment validation.

### 11.2 Provisioning Concurrency

**Limitation:** Two simultaneous provisioning jobs (different `signupRequestId`s) are not tested concurrently.

**Why acceptable:** Unit tests prove state machine correctness (resumable transitions, idempotent steps, failure handling). Concurrent job isolation is enforced by:
- Each job has unique `provisioningJobId` (UUID)
- State transitions use `WHERE provisioningJobId = ?`
- No shared mutable state between jobs

**Deferred to:** Phase 3 scaling validation and stress testing.

### 11.3 Rate Limiting Under Load

**Limitation:** Actual `429` HTTP responses under load are not tested. Only route classification and in-memory limiter logic are unit-tested.

**Why acceptable:** Unit tests prove limiter correctness (sliding window, retry-after calculation, key generation). Load testing requires:
- Sustained concurrent request volume
- Multiple client IPs or user sessions
- Time-based window expiration validation
These are impractical for CI integration tests.

**Deferred to:** Phase 3 performance testing.

### 11.4 Feature Flag Enforcement (ADDRESSED)

**Limitation (prior to this remediation):** Cross-tenant feature access was not tested (Community A with apartment type accessing Community B's HOA features).

**Resolution:** New integration test created: `apps/web/__tests__/integration/feature-flag-enforcement.integration.test.ts`. This test validates:
- Apartment communities cannot access HOA-only routes (compliance checklist)
- HOA communities cannot access apartment-only routes (lease tracking)
- Feature flag enforcement at API layer (not just UI)

**Status:** Limitation resolved by this plan.

### 11.5 Billing-to-Provisioning End-to-End

**Limitation:** Individual steps tested in isolation (Stripe webhook → pending_signups, provisioning service → community creation). Full end-to-end flow from `checkout.session.completed` event → webhook → provisioning job → completed community is not tested as a single integration.

**Why acceptable:** Each component is proven correct:
- Webhook handler creates `pending_signups` row (unit-tested)
- Provisioning service creates community from `signupRequestId` (unit-tested)
- State machine handles partial failures and resume (unit-tested)

End-to-end integration requires:
- Real Stripe checkout session
- Webhook delivery
- Background job execution
This complexity is impractical for CI.

**Deferred to:** Phase 3 staging deployment validation (manual end-to-end test with real Stripe test mode).

---

## 12. Change Log

| Date       | Version | Changes                                      |
|------------|---------|----------------------------------------------|
| 2026-02-20 | 1.0     | Initial protocol for Phase 2 Gate 3 closeout |
