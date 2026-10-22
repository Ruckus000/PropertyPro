/**
 * Feature Flag Enforcement Integration Tests
 *
 * Validates that feature flags correctly gate community-type-specific features.
 * Tests ensure that:
 * 1. Lease tracking is apartment-only (hasLeaseTracking)
 * 2. Compliance API is condo/HOA-only (hasCompliance)
 * 3. Feature flag consistency across community types
 *
 * (A condo-onboarding-wizard gate case lived here until the wizard was
 * deleted; no route ever reached it. Onboarding audit F11.)
 */
import { NextRequest } from 'next/server';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
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

// No file-local mocks: setup-integration.ts's shared providers supply the
// session (keyed on the kit's current actor) and capture the outbound side
// effects (notification email queue, announcement fan-out, PDF extraction).
// Membership, permissions and tenant scoping are the real code.

// ---------------------------------------------------------------------------
// Route types
// ---------------------------------------------------------------------------

type LeasesRouteModule = typeof import('../../src/app/api/v1/leases/route');
type ComplianceRouteModule = typeof import('../../src/app/api/v1/compliance/route');

interface RouteModules {
  leases: LeasesRouteModule;
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
      unitId: unit!.id,
      residentId: siteManagerC.id,
      startDate: '2026-01-01',
      endDate: '2026-12-31',
      status: 'active',
    });
    requireInsertedRow(lease, 'lease');

    testData = {
      unitCId: unit!.id as number,
      leaseC1Id: lease!.id as number,
    };

    // Load route modules
    routes = {
      leases: await import('../../src/app/api/v1/leases/route'),
      compliance: await import('../../src/app/api/v1/compliance/route'),
    };
  });

  beforeEach(() => {
    const kit = requireState();
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
      const body = await parseJson<{ data: unknown }>(res);
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

      expect(res.status).toBe(200);
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
      const body = await parseJson<{ error: { message: string } }>(res);
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
  // 2. Compliance API Feature Gate (hasCompliance)
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
      const body = await parseJson<{ data: unknown }>(res);
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
      const body = await parseJson<{ error: { message: string } }>(res);
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
      const body = await parseJson<{ error: { message: string } }>(res);
      expect(body.error.message).toMatch(/compliance/i);
      expect(body.error.message).toMatch(/condo\/hoa/i);
    });
  });

  // ---------------------------------------------------------------------------
  // 3. Cross-Feature Consistency Tests
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

});
