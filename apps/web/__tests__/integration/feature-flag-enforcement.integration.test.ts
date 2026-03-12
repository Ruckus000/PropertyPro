/**
 * Feature Flag Enforcement Integration Tests
 *
 * Validates that feature flags correctly gate community-type-specific features.
 * Tests ensure that:
 * 1. Lease tracking is apartment-only (hasLeaseTracking)
 * 2. Condo onboarding is condo/HOA-only (hasCompliance)
 * 3. Compliance API is condo/HOA-only (hasCompliance)
 * 4. Feature flag consistency across community types
 *
 * Phase 3 placeholder tests for future features (voting, etc.) marked with .skip
 */
import { NextRequest } from 'next/server';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { MULTI_TENANT_COMMUNITIES } from '../fixtures/multi-tenant-communities';
import { MULTI_TENANT_USERS } from '../fixtures/multi-tenant-users';
import {
  type TestKitState,
  initTestKit,
  seedCommunities,
  seedUsers,
  teardownTestKit,
  requireCommunity,
  requireUser,
  setActor,
  requireCurrentActor,
  apiUrl,
  jsonRequest,
  parseJson,
  requireInsertedRow,
} from './helpers/multi-tenant-test-kit';
import { getFeaturesForCommunity } from '@propertypro/shared';

if (process.env.CI && !process.env.DATABASE_URL) {
  throw new Error('Feature flag enforcement tests require DATABASE_URL in CI');
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

type LeasesRouteModule = typeof import('../../src/app/api/v1/leases/route');
type CondoOnboardingRouteModule = typeof import('../../src/app/api/v1/onboarding/condo/route');
type ComplianceRouteModule = typeof import('../../src/app/api/v1/compliance/route');

interface RouteModules {
  leases: LeasesRouteModule;
  condoOnboarding: CondoOnboardingRouteModule;
  compliance: ComplianceRouteModule;
}

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------

interface SeededFeatureFlagData {
  unitCId: number;
  leaseC1Id: number;
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

let state: TestKitState | null = null;
let routes: RouteModules | null = null;
let testData: SeededFeatureFlagData | null = null;

function requireState(): TestKitState {
  if (!state) throw new Error('Test state not initialized');
  return state;
}

function requireRoutes(): RouteModules {
  if (!routes) throw new Error('Routes not loaded');
  return routes;
}

function requireTestData(): SeededFeatureFlagData {
  if (!testData) throw new Error('Test data not seeded');
  return testData;
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describeDb('feature flag enforcement (db-backed integration)', () => {
  beforeAll(async () => {
    if (!process.env.DATABASE_URL) return;

    state = await initTestKit();

    // Seed all 3 community types
    await seedCommunities(state, MULTI_TENANT_COMMUNITIES);

    // Seed required users (including tenants for lease POST tests)
    const requiredUsers = MULTI_TENANT_USERS.filter((u) =>
      ['actorA', 'actorB', 'siteManagerA', 'siteManagerC', 'tenantA', 'tenantC'].includes(u.key),
    );
    await seedUsers(state, requiredUsers);

    // Create test unit in apartment community (communityC)
    const communityC = requireCommunity(state, 'communityC');
    const scopedC = state.dbModule.createScopedClient(communityC.id);

    const [unit] = await scopedC.insert(state.dbModule.units, {
      unitNumber: `TEST-${state.runSuffix}`,
      building: null,
      floor: 1,
    });
    requireInsertedRow(unit, 'unit');

    // Create test lease in apartment community
    const siteManagerC = requireUser(state, 'siteManagerC');
    const [lease] = await scopedC.insert(state.dbModule.leases, {
      unitId: unit.id,
      residentId: siteManagerC.id,
      startDate: '2026-01-01',
      endDate: '2026-12-31',
      status: 'active',
    });
    requireInsertedRow(lease, 'lease');

    testData = {
      unitCId: unit.id,
      leaseC1Id: lease.id,
    };

    // Load route modules
    routes = {
      leases: await import('../../src/app/api/v1/leases/route'),
      condoOnboarding: await import('../../src/app/api/v1/onboarding/condo/route'),
      compliance: await import('../../src/app/api/v1/compliance/route'),
    };
  });

  beforeEach(() => {
    vi.clearAllMocks();
    const kit = requireState();
    requireAuthenticatedUserIdMock.mockImplementation(async () => requireCurrentActor(kit));
    setActor(kit, 'actorA'); // default actor: board_president in condo community
  });

  afterAll(async () => {
    if (state) await teardownTestKit(state);
  });

  // ---------------------------------------------------------------------------
  // 1. Lease Tracking Feature Gate (hasLeaseTracking)
  // ---------------------------------------------------------------------------

  describe('lease tracking (hasLeaseTracking - apartment only)', () => {
    it('allows lease GET on apartment communities (hasLeaseTracking=true)', async () => {
      const kit = requireState();
      const { leases } = requireRoutes();
      const communityC = requireCommunity(kit, 'communityC');

      setActor(kit, 'siteManagerC');

      const req = jsonRequest(apiUrl(`/api/v1/leases?communityId=${communityC.id}`), 'GET');
      const res = await leases.GET(req);

      expect(res.status).toBe(200);
      const body = await parseJson(res);
      expect(Array.isArray(body.data)).toBe(true);
    });

    it('allows lease POST on apartment communities', async () => {
      const kit = requireState();
      const { leases } = requireRoutes();
      const communityC = requireCommunity(kit, 'communityC');
      const { unitCId } = requireTestData();
      const tenantC = requireUser(kit, 'tenantC');

      setActor(kit, 'siteManagerC');

      const req = jsonRequest(apiUrl('/api/v1/leases'), 'POST', {
        communityId: communityC.id,
        unitId: unitCId,
        residentId: tenantC.id,
        startDate: '2027-01-01',
        endDate: '2027-12-31',
        status: 'active',
      });
      const res = await leases.POST(req);

      expect(res.status).toBe(201);
    });

    it('allows lease PATCH on apartment communities', async () => {
      const kit = requireState();
      const { leases } = requireRoutes();
      const communityC = requireCommunity(kit, 'communityC');
      const { leaseC1Id } = requireTestData();

      setActor(kit, 'siteManagerC');

      const req = jsonRequest(apiUrl('/api/v1/leases'), 'PATCH', {
        id: leaseC1Id,
        communityId: communityC.id,
        status: 'renewed',
      });
      const res = await leases.PATCH(req);

      expect(res.status).toBe(200);
    });

    it('rejects lease GET on condo communities (hasLeaseTracking=false)', async () => {
      const kit = requireState();
      const { leases } = requireRoutes();
      const communityA = requireCommunity(kit, 'communityA');

      setActor(kit, 'siteManagerA');

      const req = jsonRequest(apiUrl(`/api/v1/leases?communityId=${communityA.id}`), 'GET');
      const res = await leases.GET(req);

      expect(res.status).toBe(403);
      const body = await parseJson(res);
      expect(body.error.message).toMatch(/lease tracking/i);
      expect(body.error.message).toMatch(/apartment/i);
    });

    it('rejects lease POST on condo communities', async () => {
      const kit = requireState();
      const { leases } = requireRoutes();
      const communityA = requireCommunity(kit, 'communityA');
      const tenantA = requireUser(kit, 'tenantA');

      setActor(kit, 'siteManagerA');

      const req = jsonRequest(apiUrl('/api/v1/leases'), 'POST', {
        communityId: communityA.id,
        unitId: 1,
        residentId: tenantA.id,
        startDate: '2027-01-01',
        endDate: '2027-12-31',
        status: 'active',
      });
      const res = await leases.POST(req);

      expect(res.status).toBe(403);
    });

    it('rejects lease PATCH on HOA communities (hasLeaseTracking=false)', async () => {
      const kit = requireState();
      const { leases } = requireRoutes();
      const communityB = requireCommunity(kit, 'communityB');

      setActor(kit, 'actorB');

      const req = jsonRequest(apiUrl('/api/v1/leases'), 'PATCH', {
        id: 1,
        communityId: communityB.id,
        status: 'renewed',
      });
      const res = await leases.PATCH(req);

      expect(res.status).toBe(403);
    });

    it('rejects lease DELETE on condo communities', async () => {
      const kit = requireState();
      const { leases } = requireRoutes();
      const communityA = requireCommunity(kit, 'communityA');

      setActor(kit, 'siteManagerA');

      const req = jsonRequest(
        apiUrl(`/api/v1/leases?id=1&communityId=${communityA.id}`),
        'DELETE',
        {},
      );
      const res = await leases.DELETE(req);

      expect(res.status).toBe(403);
    });
  });

  // ---------------------------------------------------------------------------
  // 2. Condo Onboarding Feature Gate (hasCompliance)
  // ---------------------------------------------------------------------------

  describe('condo onboarding wizard (hasCompliance - condo/HOA only)', () => {
    it('allows condo wizard GET on condo communities (hasCompliance=true)', async () => {
      const kit = requireState();
      const { condoOnboarding } = requireRoutes();
      const communityA = requireCommunity(kit, 'communityA');

      setActor(kit, 'siteManagerA');

      const req = jsonRequest(apiUrl(`/api/v1/onboarding/condo?communityId=${communityA.id}`), 'GET');
      const res = await condoOnboarding.GET(req);

      expect(res.status).toBe(200);
      const body = await parseJson(res);
      expect(body.data).toHaveProperty('nextStep');
    });

    it('allows condo wizard GET on HOA communities (hasCompliance=true)', async () => {
      const kit = requireState();
      const { condoOnboarding } = requireRoutes();
      const communityB = requireCommunity(kit, 'communityB');

      setActor(kit, 'actorB');

      const req = jsonRequest(apiUrl(`/api/v1/onboarding/condo?communityId=${communityB.id}`), 'GET');
      const res = await condoOnboarding.GET(req);

      expect(res.status).toBe(200);
    });

    it('rejects condo wizard GET on apartment communities (hasCompliance=false)', async () => {
      const kit = requireState();
      const { condoOnboarding } = requireRoutes();
      const communityC = requireCommunity(kit, 'communityC');

      setActor(kit, 'siteManagerC');

      const req = jsonRequest(apiUrl(`/api/v1/onboarding/condo?communityId=${communityC.id}`), 'GET');
      const res = await condoOnboarding.GET(req);

      expect(res.status).toBe(403);
      const body = await parseJson(res);
      expect(body.error.message).toMatch(/condo onboarding/i);
      expect(body.error.message).toMatch(/condo\/hoa/i);
    });

    it('rejects condo wizard PATCH on apartment communities', async () => {
      const kit = requireState();
      const { condoOnboarding } = requireRoutes();
      const communityC = requireCommunity(kit, 'communityC');

      setActor(kit, 'siteManagerC');

      const req = jsonRequest(apiUrl('/api/v1/onboarding/condo'), 'PATCH', {
        communityId: communityC.id,
        currentStep: 2,
        stepData: {},
      });
      const res = await condoOnboarding.PATCH(req);

      expect(res.status).toBe(403);
    });

    it('rejects condo wizard POST complete on apartment communities', async () => {
      const kit = requireState();
      const { condoOnboarding } = requireRoutes();
      const communityC = requireCommunity(kit, 'communityC');

      setActor(kit, 'siteManagerC');

      const req = jsonRequest(apiUrl('/api/v1/onboarding/condo'), 'POST', {
        communityId: communityC.id,
        action: 'complete',
      });
      const res = await condoOnboarding.POST(req);

      expect(res.status).toBe(403);
    });
  });

  // ---------------------------------------------------------------------------
  // 3. Compliance API Feature Gate (hasCompliance)
  // ---------------------------------------------------------------------------

  describe('compliance API (hasCompliance - condo/HOA only)', () => {
    it('allows compliance GET on condo communities (hasCompliance=true)', async () => {
      const kit = requireState();
      const { compliance } = requireRoutes();
      const communityA = requireCommunity(kit, 'communityA');

      setActor(kit, 'actorA');

      const req = jsonRequest(apiUrl(`/api/v1/compliance?communityId=${communityA.id}`), 'GET');
      const res = await compliance.GET(req);

      expect(res.status).toBe(200);
      const body = await parseJson(res);
      expect(Array.isArray(body.data)).toBe(true);
    });

    it('allows compliance POST on HOA communities (hasCompliance=true)', async () => {
      const kit = requireState();
      const { compliance } = requireRoutes();
      const communityB = requireCommunity(kit, 'communityB');

      setActor(kit, 'actorB');

      const req = jsonRequest(apiUrl('/api/v1/compliance'), 'POST', {
        communityId: communityB.id,
      });
      const res = await compliance.POST(req);

      expect([200, 201]).toContain(res.status);
    });

    it('rejects compliance POST on apartment communities (hasCompliance=false)', async () => {
      const kit = requireState();
      const { compliance } = requireRoutes();
      const communityC = requireCommunity(kit, 'communityC');

      setActor(kit, 'siteManagerC');

      const req = jsonRequest(apiUrl('/api/v1/compliance'), 'POST', {
        communityId: communityC.id,
      });
      const res = await compliance.POST(req);

      expect(res.status).toBe(403);
      const body = await parseJson(res);
      expect(body.error.message).toMatch(/compliance/i);
      expect(body.error.message).toMatch(/condo\/hoa/i);
    });

    it('rejects compliance GET on apartment communities (hasCompliance=false)', async () => {
      const kit = requireState();
      const { compliance } = requireRoutes();
      const communityC = requireCommunity(kit, 'communityC');

      setActor(kit, 'siteManagerC');

      const req = jsonRequest(apiUrl(`/api/v1/compliance?communityId=${communityC.id}`), 'GET');
      const res = await compliance.GET(req);

      expect(res.status).toBe(403);
      const body = await parseJson(res);
      expect(body.error.message).toMatch(/compliance/i);
      expect(body.error.message).toMatch(/condo\/hoa/i);
    });
  });

  // ---------------------------------------------------------------------------
  // 4. Cross-Feature Consistency Tests
  // ---------------------------------------------------------------------------

  describe('feature flag consistency', () => {
    it('verifies condo and HOA share baseline flags with package/visitor exceptions', () => {
      const condoFeatures = getFeaturesForCommunity('condo_718');
      const hoaFeatures = getFeaturesForCommunity('hoa_720');

      const { hasPackageLogging: _cp, hasVisitorLogging: _cv, ...condoRest } = condoFeatures;
      const { hasPackageLogging: _hp, hasVisitorLogging: _hv, ...hoaRest } = hoaFeatures;
      expect(condoRest).toEqual(hoaRest);

      expect(condoFeatures.hasPackageLogging).toBe(true);
      expect(hoaFeatures.hasPackageLogging).toBe(false);
      expect(condoFeatures.hasVisitorLogging).toBe(true);
      expect(hoaFeatures.hasVisitorLogging).toBe(false);
    });

    it('verifies apartment differs from condo on compliance-related flags', () => {
      const apartmentFeatures = getFeaturesForCommunity('apartment');
      const condoFeatures = getFeaturesForCommunity('condo_718');

      // Apartment-specific flags
      expect(apartmentFeatures.hasCompliance).toBe(false);
      expect(apartmentFeatures.hasLeaseTracking).toBe(true);

      // Condo-specific flags
      expect(condoFeatures.hasCompliance).toBe(true);
      expect(condoFeatures.hasLeaseTracking).toBe(false);
    });

    it('verifies universal features are enabled for all community types', () => {
      const apartmentFeatures = getFeaturesForCommunity('apartment');
      const condoFeatures = getFeaturesForCommunity('condo_718');
      const hoaFeatures = getFeaturesForCommunity('hoa_720');

      // Universal features that should be enabled for all types
      expect(apartmentFeatures.hasMeetings).toBe(true);
      expect(condoFeatures.hasMeetings).toBe(true);
      expect(hoaFeatures.hasMeetings).toBe(true);

      expect(apartmentFeatures.hasAnnouncements).toBe(true);
      expect(condoFeatures.hasAnnouncements).toBe(true);
      expect(hoaFeatures.hasAnnouncements).toBe(true);
    });

    it('verifies statutory features match expected requirements', () => {
      const condoFeatures = getFeaturesForCommunity('condo_718');
      const hoaFeatures = getFeaturesForCommunity('hoa_720');
      const apartmentFeatures = getFeaturesForCommunity('apartment');

      // Statutory requirements (FL Statute §718/§720)
      expect(condoFeatures.hasStatutoryCategories).toBe(true);
      expect(hoaFeatures.hasStatutoryCategories).toBe(true);
      expect(apartmentFeatures.hasStatutoryCategories).toBe(false);

      expect(condoFeatures.hasPublicNoticesPage).toBe(true);
      expect(hoaFeatures.hasPublicNoticesPage).toBe(true);
      expect(apartmentFeatures.hasPublicNoticesPage).toBe(false);

      expect(condoFeatures.requiresPublicWebsite).toBe(true);
      expect(hoaFeatures.requiresPublicWebsite).toBe(true);
      expect(apartmentFeatures.requiresPublicWebsite).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // 5. Phase 3 Placeholder Tests
  // ---------------------------------------------------------------------------

  describe('Phase 3 feature flags (not yet implemented)', () => {
    it.skip('voting routes should enforce hasVoting flag (Phase 3 not implemented)', () => {
      // Expected behavior when Phase 3 voting features are implemented:
      // - Apartment communities: voting disabled (hasVoting=false)
      // - Condo/HOA communities: voting enabled (hasVoting=true)
      //
      // Test cases to add in Phase 3:
      // - GET /api/v1/voting/ballots → 200 for condo/HOA, 403 for apartments
      // - POST /api/v1/voting/cast-vote → 200 for condo/HOA, 403 for apartments
      //
      // Reference implementation: apps/web/src/app/api/v1/leases/route.ts
    });

    it.skip('maintenance requests should have role-based restrictions (Phase 3)', () => {
      // Current state: hasMaintenanceRequests=true for all community types
      // Phase 3 may add role-based restrictions:
      // - Tenants can create but not manage
      // - Board members can view all but not assign
      // - Site managers can assign and close
      //
      // Test cases to add in Phase 3:
      // - Verify tenants can POST but not PATCH
      // - Verify board members can GET but not DELETE
      // - Verify site managers have full CRUD access
    });
  });
});
