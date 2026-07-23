# Integration Tests

Integration tests in this directory test multi-tenant database operations, API routes, and cross-service behavior.

## Naming Convention

**CRITICAL:** All integration test files in this directory **MUST** follow the naming pattern:

```
*.integration.test.ts
*.integration.test.tsx
```

### Why This Matters

The integration test config ([`vitest.integration.config.ts`](../../vitest.integration.config.ts)) uses a glob pattern `**/*.integration.test.ts` to discover tests. Files that don't match this pattern will:

1. **Not run** when using `pnpm exec vitest run --config apps/web/vitest.integration.config.ts`
2. Appear as **skipped** in the default `pnpm test` suite (because they lack `DATABASE_URL`)
3. Silently lose integration test coverage

### Automated Guard

The naming convention is enforced by [`scripts/verify-integration-test-discovery.ts`](../../../../scripts/verify-integration-test-discovery.ts), which runs as part of `pnpm lint`. If you add a misnamed integration test, the lint step will fail with rename instructions.

## Running Integration Tests

### Recommended: the local isolated DB runner

Use the local runner — it creates/migrates a **disposable localhost Postgres** that
mirrors CI's ephemeral container exactly (same [Supabase stub](../../../../scripts/sql/local-supabase-stub.sql),
same migrations, same privileged `postgres` role), so "green locally" == "green in
CI". It **never** touches production.

```bash
pnpm test:integration:local                 # whole suite
pnpm test:integration:local apps/web/__tests__/integration/onboarding-flow.integration.test.ts  # one file
pnpm db:test-local:setup                     # just prepare the local DB
pnpm db:test-local:reset                     # clean slate (drop + recreate + migrate)
```

Requires a local Postgres server on `localhost:5432` (e.g. Postgres.app / Homebrew).
Config via `PROPERTYPRO_TEST_DB_*` env vars — see [`scripts/local-test-db.sh`](../../../../scripts/local-test-db.sh).
The runner connects as the `postgres` role because the scoped client relies on a
privileged role (`pp_rls_is_privileged()`) rather than setting the tenant GUC.

> ⚠️ **Do NOT run the suite through `scripts/with-env-local.sh`** — that loads
> `.env.local`, whose `DATABASE_URL` points at **production**. Running integration
> tests that way seeds/mutates prod (this is how test communities leaked). Use the
> local runner above.

### Manual / advanced

Integration tests require a PostgreSQL database via `DATABASE_URL`. If you wire it
yourself, point it at a **local, disposable** database — never prod:

```bash
export DATABASE_URL="postgresql://postgres@localhost:5432/propertypro_test"

# Run all integration tests
pnpm exec vitest run --config apps/web/vitest.integration.config.ts

# Run a specific integration test
pnpm exec vitest run --config apps/web/vitest.integration.config.ts apps/web/__tests__/integration/onboarding-flow.integration.test.ts
```

### Behavior Without DATABASE_URL

Tests use the `describeDb` helper pattern to conditionally skip when `DATABASE_URL` is missing:

```typescript
const describeDb = process.env.DATABASE_URL ? describe : describe.skip;

describeDb('my integration test suite', () => {
  // tests here
});
```

This allows:
- **Local development:** Tests run when DB is available
- **CI without DB:** Tests are gracefully skipped (not failed)
- **Default `pnpm test`:** Skips integration tests, shows them as "skipped" in output

## Test Isolation

Integration tests use **multi-tenant test kit** ([`helpers/multi-tenant-test-kit.ts`](./helpers/multi-tenant-test-kit.ts)) to ensure isolation:

- Each test run gets a unique `runSuffix` (timestamp-based)
- All created entities (communities, users, units, etc.) include the suffix
- `teardownTestKit` cleans up all entities created during the run
- **No global DB resets** — tests can run concurrently

### Example

```typescript
import {
  initTestKit,
  teardownTestKit,
  seedCommunities,
  requireCommunity,
} from './helpers/multi-tenant-test-kit';

let state: TestKitState | null = null;

beforeAll(async () => {
  state = await initTestKit();
  await seedCommunities(state, [MULTI_TENANT_COMMUNITIES[0]]);
});

afterAll(async () => {
  if (state) await teardownTestKit(state);
});

it('my test', async () => {
  const community = requireCommunity(state!, 'communityA');
  // Test uses community with unique suffix
});
```

## Writing New Integration Tests

1. **Name your file:** `my-feature.integration.test.ts` (NOT `my-feature.test.ts`)
2. **Use describeDb:** Wrap your test suite with `describeDb` to handle missing DB
3. **Use multi-tenant test kit:** Ensure proper isolation and cleanup
4. **Verify discovery:** Run `pnpm lint` to confirm your test is correctly named

## Common Pitfalls

### ❌ Wrong Naming
```typescript
// apps/web/__tests__/integration/onboarding-flow.test.ts
// This will be SKIPPED by integration config!
```

### ✅ Correct Naming
```typescript
// apps/web/__tests__/integration/onboarding-flow.integration.test.ts
// This will be DISCOVERED by integration config
```

### ❌ Missing DATABASE_URL Check
```typescript
describe('my suite', () => {
  // Will fail in CI if DATABASE_URL is not set
});
```

### ✅ Correct DATABASE_URL Check
```typescript
const describeDb = process.env.DATABASE_URL ? describe : describe.skip;

describeDb('my suite', () => {
  // Gracefully skipped when DATABASE_URL is missing
});
```

## CI Behavior

In CI environments:
- **If `DATABASE_URL` is set:** Integration tests run
- **If `DATABASE_URL` is missing AND `process.env.CI` is true:** Some tests may throw to enforce DB setup (see individual test files)
- **Lint always runs:** Naming convention is enforced in all environments
