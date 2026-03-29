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

### Prerequisites

Integration tests require a PostgreSQL database. Set the `DATABASE_URL` environment variable:

```bash
export DATABASE_URL="postgresql://user:password@localhost:5432/getpropertypro_test"
```

### Commands

```bash
# Run all integration tests (DB required)
pnpm exec vitest run --config apps/web/vitest.integration.config.ts

# Run a specific integration test
pnpm exec vitest run --config apps/web/vitest.integration.config.ts apps/web/__tests__/integration/onboarding-flow.integration.test.ts

# Run full preflight suite (DB migrations + seeding + integration tests)
pnpm test:integration:preflight
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
