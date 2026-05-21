/**
 * DB-backed integration test stub for `/api/v1/widgets`.
 *
 * Scaffolded by `pnpm new:resource widgets` (Plan A4 reference resource).
 *
 * The `describe.skipIf` guard keeps this file inert when `DATABASE_URL` is
 * unset (e.g. ambient `pnpm test` without `scripts/with-env-local.sh`). When
 * the env var IS set, replace the placeholder assertions with calls against
 * the route module using `apiUrl` / `jsonRequest` / `seedCommunities` from
 * `apps/web/__tests__/integration/helpers/multi-tenant-test-kit.ts`.
 *
 * The route unit test in `apps/web/__tests__/api/widgets/route.test.ts` covers
 * the contract-runner / handler wiring; this file should cover SQL behavior
 * (RLS, pagination, cross-tenant isolation) once you wire it up.
 */
import { describe, expect, it } from 'vitest';

const hasDatabaseUrl = Boolean(process.env['DATABASE_URL']);

describe.skipIf(!hasDatabaseUrl)('widgets integration (DB-backed stub)', () => {
  it('placeholder — replace with seeded GET /api/v1/widgets assertions', () => {
    // Wire up:
    //   import { GET } from '../../src/app/api/v1/widgets/route';
    //   import { apiUrl, seedCommunities, ... } from './helpers/multi-tenant-test-kit';
    // then call GET(new NextRequest(apiUrl('/api/v1/widgets?communityId=' + id)))
    // against a seeded community.
    expect(true).toBe(true);
  });
});
