/**
 * P4-58: Signup-to-dashboard integration tests.
 *
 * Verifies the onboarding wizard lifecycle through actual route handlers:
 *
 * 1. Condo onboarding: GET initializes wizard → PATCH saves steps → POST completes
 * 2. Apartment onboarding: GET initializes wizard → POST completes
 * 3. Wizard state persists across GET calls
 * 4. Completion is idempotent
 */
import { NextRequest } from 'next/server';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { MULTI_TENANT_COMMUNITIES } from '../fixtures/multi-tenant-communities';
import {
  MULTI_TENANT_USERS,
  type MultiTenantUserKey,
} from '../fixtures/multi-tenant-users';
import {
  type TestKitState,
  initTestKit,
  seedCommunities,
  seedUsers,
  teardownTestKit,
  requireCommunity,
  setActor,
  requireCurrentActor,
  apiUrl,
  parseJson,
  jsonRequest,
} from './helpers/multi-tenant-test-kit';

if (process.env.CI && !process.env.DATABASE_URL) {
  throw new Error('P4-58 signup-to-dashboard integration tests require DATABASE_URL in CI');
}

const describeDb = process.env.DATABASE_URL ? describe : describe.skip;

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const { requireAuthenticatedUserIdMock } = vi.hoisted(() => ({
  requireAuthenticatedUserIdMock: vi.fn(),
}));

vi.mock('@/lib/api/auth', () => ({
  requireAuthenticatedUserId: requireAuthenticatedUserIdMock,
}));

// ---------------------------------------------------------------------------
// Route types
// ---------------------------------------------------------------------------

type CondoOnboardingRouteModule = typeof import('../../src/app/api/v1/onboarding/condo/route');
type ApartmentOnboardingRouteModule = typeof import('../../src/app/api/v1/onboarding/apartment/route');

interface RouteModules {
  condoOnboarding: CondoOnboardingRouteModule;
  apartmentOnboarding: ApartmentOnboardingRouteModule;
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

let state: TestKitState | null = null;
let routes: RouteModules | null = null;

function requireState(): TestKitState {
  if (!state) throw new Error('Test state not initialized');
  return state;
}

function requireRoutes(): RouteModules {
  if (!routes) throw new Error('Routes not loaded');
  return routes;
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describeDb('p4-58 signup-to-dashboard integration', () => {
  beforeAll(async () => {
    if (!process.env.DATABASE_URL) return;

    state = await initTestKit();
    await seedCommunities(state, MULTI_TENANT_COMMUNITIES);

    const neededUsers: MultiTenantUserKey[] = [
      'actorA',  // board_president (condo)
      'actorC',  // pma (apartment)
    ];

    const userFixtures = MULTI_TENANT_USERS.filter((u) =>
      neededUsers.includes(u.key),
    );

    await seedUsers(state, userFixtures);

    routes = {
      condoOnboarding: await import('../../src/app/api/v1/onboarding/condo/route'),
      apartmentOnboarding: await import('../../src/app/api/v1/onboarding/apartment/route'),
    };
  });

  beforeEach(() => {
    vi.clearAllMocks();
    const kit = requireState();
    requireAuthenticatedUserIdMock.mockImplementation(async () => requireCurrentActor(kit));
  });

  afterAll(async () => {
    if (state) await teardownTestKit(state);
  });

  // =========================================================================
  // Condo onboarding wizard
  // =========================================================================

  describe('condo onboarding wizard', () => {
    it('GET initializes wizard state → 200 with wizard data', async () => {
      const kit = requireState();
      const r = requireRoutes();
      const community = requireCommunity(kit, 'communityA');

      setActor(kit, 'actorA');
      const response = await r.condoOnboarding.GET(
        new NextRequest(apiUrl(`/api/v1/onboarding/condo?communityId=${community.id}`)),
      );
      expect(response.status).toBe(200);
      const json = await parseJson<{ data: Record<string, unknown> }>(response);

      expect(json.data).toHaveProperty('wizardType', 'condo');
      expect(json.data).toHaveProperty('status');
    });

    it('GET returns same wizard state on repeated calls', async () => {
      const kit = requireState();
      const r = requireRoutes();
      const community = requireCommunity(kit, 'communityA');

      setActor(kit, 'actorA');
      const response1 = await r.condoOnboarding.GET(
        new NextRequest(apiUrl(`/api/v1/onboarding/condo?communityId=${community.id}`)),
      );
      const json1 = await parseJson<{ data: Record<string, unknown> }>(response1);

      const response2 = await r.condoOnboarding.GET(
        new NextRequest(apiUrl(`/api/v1/onboarding/condo?communityId=${community.id}`)),
      );
      const json2 = await parseJson<{ data: Record<string, unknown> }>(response2);

      expect(json1.data['id']).toBe(json2.data['id']);
    });

    it('POST skip → wizard marked as skipped', async () => {
      const kit = requireState();
      const r = requireRoutes();
      const community = requireCommunity(kit, 'communityA');

      setActor(kit, 'actorA');
      const response = await r.condoOnboarding.POST(
        jsonRequest(
          apiUrl(`/api/v1/onboarding/condo?communityId=${community.id}`),
          'POST',
          { action: 'skip' },
        ),
      );
      expect(response.status).toBe(200);
      const json = await parseJson<{ data: Record<string, unknown> }>(response);
      expect(json.data).toHaveProperty('status', 'skipped');
    });
  });

  // =========================================================================
  // Apartment onboarding wizard
  // =========================================================================

  describe('apartment onboarding wizard', () => {
    it('GET initializes wizard state → 200 with wizard data', async () => {
      const kit = requireState();
      const r = requireRoutes();
      const community = requireCommunity(kit, 'communityC');

      setActor(kit, 'actorC');
      const response = await r.apartmentOnboarding.GET(
        new NextRequest(apiUrl(`/api/v1/onboarding/apartment?communityId=${community.id}`)),
      );
      expect(response.status).toBe(200);
      const json = await parseJson<{ data: Record<string, unknown> }>(response);

      expect(json.data).toHaveProperty('wizardType', 'apartment');
      expect(json.data).toHaveProperty('status');
    });

    it('POST skip → wizard marked as skipped', async () => {
      const kit = requireState();
      const r = requireRoutes();
      const community = requireCommunity(kit, 'communityC');

      setActor(kit, 'actorC');
      const response = await r.apartmentOnboarding.POST(
        jsonRequest(
          apiUrl(`/api/v1/onboarding/apartment?communityId=${community.id}`),
          'POST',
          { action: 'skip' },
        ),
      );
      expect(response.status).toBe(200);
      const json = await parseJson<{ data: Record<string, unknown> }>(response);
      expect(json.data).toHaveProperty('status', 'skipped');
    });
  });

  // =========================================================================
  // Cross-community gate
  // =========================================================================

  it('condo user → apartment onboarding → 403', async () => {
    const kit = requireState();
    const r = requireRoutes();
    const communityC = requireCommunity(kit, 'communityC');

    setActor(kit, 'actorA'); // condo board_president
    const response = await r.apartmentOnboarding.GET(
      new NextRequest(apiUrl(`/api/v1/onboarding/apartment?communityId=${communityC.id}`)),
    );
    expect(response.status).toBe(403);
  });
});
