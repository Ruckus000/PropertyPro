# Gate 3 Evidence - 2026-02-21

## Context

| Field | Value |
|---|---|
| Commit | `ae55ca8ea5fba2abddfdfaec5ed331f213b80d6a` |
| Branch | `main` |
| Freshness | ahead `1`, behind `0` vs `origin/main` |
| Working tree | clean at test capture start (before closeout-doc updates) |
| Runner | Codex (GPT-5) |
| Date | 2026-02-21 |

## Pre-Checks

- [x] `git status` showed a clean working tree at capture start.
- [ ] `git fetch origin && git status` showed `0/0` with `origin/main` (actual: ahead `1`, behind `0`).
- [x] `pnpm install --frozen-lockfile` reported lockfile up to date and no changes.
- [x] `pnpm --filter @propertypro/db db:migrate` completed successfully.

## Static Checks

### 1. Build

**Command:**
```bash
pnpm build
```

**Result:** PASS  
**Output:** Next.js workspace-root warning (`/Users/jphilistin/package-lock.json` detected), Sentry deprecation warnings, no build failures.

### 2. Typecheck

**Command:**
```bash
pnpm typecheck
```

**Result:** PASS  
**Output:** no type errors.

### 3. Lint

**Command:**
```bash
pnpm lint
```

**Result:** PASS  
**Output:** lint clean and `pnpm guard:db-access` passed (`164` runtime files checked).

### 4. Plan Consistency Verification

**Command:**
```bash
pnpm plan:verify:phase2
```

**Result:** PASS  
**Output:**
- Completed tasks: `16/16`
- Cross-file consistency: VERIFIED
- Tech stack accuracy: VERIFIED
- Gate 3 checklist: VERIFIED

## Unit Tests

**Command:**
```bash
pnpm test
```

**Result:** PASS  
**Summary:**
- Test files: `87`
- Tests passed: `1022`
- Tests failed: `0`
- Duration: `5.96s`

## Integration Tests

### Full Preflight Suite

**Command:**
```bash
set -a; source .env.local; set +a; pnpm test:integration:preflight
```

**Result:** PASS

### Step 1: DB Migrations
**Result:** PASS  
**Output:** Drizzle migration run completed successfully.

Operational note: initial preflight attempt failed with `__drizzle_migrations` sequence drift (`duplicate key ... id=13`). Sequence was reconciled using:
```sql
select setval('drizzle.__drizzle_migrations_id_seq', (select coalesce(max(id),0) + 1 from drizzle.__drizzle_migrations), false);
```
Then full preflight rerun passed.

### Step 2: Seed Verification
**Result:** PASS  
**Output:** category coverage and uncategorized-doc checks passed for all demo communities.

### Step 3: DB Integration Tests
**Result:** PASS  
**Summary:**
- Test files: `9`
- Tests passed: `32`
- Duration: `121.47s`

**Key files:**
- `packages/db/__tests__/schema-gate0.integration.test.ts`
- `packages/db/__tests__/invitation-flow.integration.test.ts`
- `packages/db/__tests__/document-search.integration.test.ts`
- `packages/db/__tests__/supabase-storage.integration.test.ts`
- `packages/db/__tests__/scoped-client.integration.test.ts`
- `packages/db/__tests__/audit-log-append-only-db.integration.test.ts`
- `packages/db/__tests__/documents-tenant-isolation.integration.test.ts`
- `packages/db/__tests__/document-access.integration.test.ts`
- `packages/db/__tests__/seed-demo.integration.test.ts`

### Step 4: Web Integration Tests
**Result:** PASS  
**Summary:**
- Test files: `7`
- Tests passed: `100`
- Tests skipped: `2` (intentional skips in feature-flag suite)
- Duration: `31.93s`

**Key files:**
- `apps/web/__tests__/integration/multi-tenant-isolation.integration.test.ts` (`9` tests)
- `apps/web/__tests__/integration/multi-tenant-access-policy.integration.test.ts` (`11` tests)
- `apps/web/__tests__/integration/multi-tenant-routes.integration.test.ts` (`45` tests)
- `apps/web/__tests__/integration/feature-flag-enforcement.integration.test.ts` (`22` tests, `2` skipped)
- `apps/web/__tests__/integration/onboarding-flow.integration.test.ts` (`6` tests)
- `apps/web/__tests__/integration/onboarding-flow-condo.integration.test.ts` (`6` tests)
- `apps/web/__tests__/billing/subscription-guard-integration.test.ts` (`3` tests)

### Total Integration Test Count

- Total: `134` tests (`32` DB + `102` web)
- Passed: `132`
- Skipped: `2`
- Total duration: `153.40s` (DB + web)

## Gate 3 Verification Checklist

- [x] All Phase 2 tests pass (unit + integration)
- [x] Cross-tenant isolation tests pass
- [x] Subdomain routing tested
- [x] Stripe webhook flow tested
- [x] Provisioning pipeline tested
- [x] Rate limiting tested
- [x] Build clean
- [x] Typecheck clean
- [x] Lint clean
- [x] Plan verification clean
- [x] Full integration preflight passes

## Known Limitations

1. Stripe webhook tests are mocked SDK tests (no live webhook tunnel in CI evidence).
2. Provisioning concurrency is not stress-tested with simultaneous jobs.
3. Rate limiting is validated by logic/integration coverage, not load-test traffic.
4. Some web integration assertions are intentionally skipped in the feature-flag suite (`2` skips).

## Blockers

None.

## Sign-Off

**Evidence captured by:** Codex  
**Evidence reviewed by:** Pending maintainer review  
**Gate 3 status:** PASS (local main evidence; branch ahead of origin by 1 commit at capture time)  
**Date:** 2026-02-21
