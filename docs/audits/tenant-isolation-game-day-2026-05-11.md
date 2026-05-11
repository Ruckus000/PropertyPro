# Tenant Isolation Game Day — Automated Dynamic Canary (2026-05-11)

Phase 0.5 of the architectural verification gate from
`~/.claude/plans/draft-a-plan-that-reflective-pie.md`.

## Status

Dynamic tenant-isolation coverage is now automated in
`apps/web/__tests__/integration/tenant-isolation-game-day.integration.test.ts`
and scheduled weekly by `.github/workflows/tenant-isolation-game-day.yml`.

This replaces the 2026-05-06 static-only audit for the API/database layer.
The browser-only TanStack Query cache-poisoning assertion remains outside this
CI canary because it needs a live dev server and real browser session state.

## Experiment

The canary creates two fresh communities in a migrated Postgres database:

- **Sunset Condos** (`communityA`) as the writer tenant.
- **Palm Shores HOA** (`communityB`) as the reader tenant.

It then runs a CI-sized concurrent workload:

1. Sunset writer creates announcements, user-role rows through the residents
   route, and scoped document rows with a `GAME_DAY_A_*` sentinel.
2. Palm Shores reader continuously polls the same surfaces:
   `/api/v1/announcements`, `/api/v1/documents`, and `/api/v1/residents`.
3. Every reader response is asserted to contain only Palm Shores `communityId`
   values and no Sunset sentinel payload.
4. A forged `x-community-id` request is rejected:
   - mismatched query/header tenant context returns `404`;
   - forged target community for a non-member returns `403`.
5. A deliberate transaction failure rolls back an inserted announcement before
   it can be observed.
6. Scoped clients fail closed when tenant context is missing or crossed.

The test auth provider now uses `AsyncLocalStorage` for per-worker actor
identity, so concurrent route calls do not share a process-global actor.

## Recurring CI

Workflow: `.github/workflows/tenant-isolation-game-day.yml`

Schedule: weekly on Mondays at 09:30 UTC, plus manual `workflow_dispatch`.

The workflow mirrors the integration-test DB setup:

- fresh Postgres 16 service;
- Supabase role/auth stubs;
- workspace package build;
- Drizzle migrations;
- `pnpm test:tenant-isolation-game-day`.

## Local Verification

Verified locally against a fresh migrated database:

```bash
dropdb --if-exists propertypro_tenant_game_day_local
createdb propertypro_tenant_game_day_local
# apply the same Supabase stubs used by the workflow
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/propertypro_tenant_game_day_local \
DIRECT_URL=postgresql://postgres:postgres@localhost:5432/propertypro_tenant_game_day_local \
pnpm --filter @propertypro/db db:migrate

DATABASE_URL=postgresql://postgres:postgres@localhost:5432/propertypro_tenant_game_day_local \
DIRECT_URL=postgresql://postgres:postgres@localhost:5432/propertypro_tenant_game_day_local \
pnpm test:tenant-isolation-game-day
```

Result: `4 passed`.

Additional checks:

```bash
pnpm exec tsx scripts/verify-no-mocks-in-integration.ts
pnpm exec tsc --noEmit --project apps/web/tsconfig.json
```

Both passed.

## Residual Gap

The original game-day design included an in-page cache-poisoning test for stale
TanStack Query keys. This PR does not close that browser-only assertion. The
API/database isolation property now has a recurring dynamic canary; a future
Playwright test should cover the client cache boundary once there is a stable
multi-session browser harness for community switching.
