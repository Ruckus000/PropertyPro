# Gate 2 Preflight Verification — 2026-02-16

## Context

| Field          | Value                        |
|----------------|------------------------------|
| Commit         | `bbaade5`                    |
| Branch         | `main`                       |
| Working tree   | clean                        |
| Runner         | Ralph (Claude Opus 4.6)      |
| Date           | 2026-02-16                   |

## Command

```bash
set -a && source .env.local && set +a && pnpm test:integration:preflight
```

Expands to:

```
pnpm --filter @propertypro/db db:migrate
  && pnpm seed:verify
  && pnpm --filter @propertypro/db test:integration
  && pnpm exec vitest run --config apps/web/vitest.integration.config.ts
```

## Step Results

### 1. `db:migrate` (drizzle-kit migrate)

**Result: PASS**

All migrations applied successfully. Two expected NOTICEs (schema and table already exist — idempotent).

### 2. `seed:verify` (tsx scripts/verify-seed-evidence.ts)

**Result: PASS**

| Community           | Expected Categories | Actual | Docs Without Category | Status |
|---------------------|--------------------:|-------:|----------------------:|--------|
| sunset-condos       | 5                   | 5      | 0                     | PASS   |
| palm-shores-hoa     | 5                   | 5      | 0                     | PASS   |
| bay-view-apartments | 6                   | 6      | 0                     | PASS   |

### 3. `@propertypro/db test:integration` (packages/db integration tests)

**Result: PASS — 9 test files, 31 tests passed, 0 failed, 0 skipped**

| Test File                                    | Tests | Status |
|----------------------------------------------|------:|--------|
| invitation-flow.integration.test.ts          |     2 | PASS   |
| schema-gate0.integration.test.ts             |     5 | PASS   |
| document-search.integration.test.ts          |     2 | PASS   |
| supabase-storage.integration.test.ts         |     1 | PASS   |
| scoped-client.integration.test.ts            |     7 | PASS   |
| audit-log-append-only-db.integration.test.ts |     3 | PASS   |
| documents-tenant-isolation.integration.test.ts |   4 | PASS   |
| document-access.integration.test.ts          |     3 | PASS   |
| seed-demo.integration.test.ts                |     4 | PASS   |

Duration: 57.37s

### 4. `apps/web` integration tests (vitest.integration.config.ts)

**Result: PASS — 3 test files, 64 tests passed, 0 failed, 0 skipped**

| Test File                                             | Tests | Status |
|-------------------------------------------------------|------:|--------|
| multi-tenant-isolation.integration.test.ts            |     9 | PASS   |
| multi-tenant-access-policy.integration.test.ts        |    11 | PASS   |
| multi-tenant-routes.integration.test.ts               |    44 | PASS   |

Duration: 28.59s

### Non-blocking stderr warnings

- Resend domain verification warnings (expected in non-production): `mail.getpropertypro.com` domain not verified.
- Resend rate limit (2 req/s) hit during test — notifications are best-effort and do not affect test assertions.

## Summary

| Metric               | Value |
|----------------------|-------|
| Total test files     | 12    |
| Total tests passed   | 95    |
| Total tests failed   | 0     |
| Total tests skipped  | 0     |
| Seed verification    | PASS  |
| Migration            | PASS  |
| **Overall**          | **PASS** |

## Skipped Tests

None.

## Blockers

None.
