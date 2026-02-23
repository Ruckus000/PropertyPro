/**
 * P4-58: Role-isolation integration tests.
 *
 * Verifies that route-level authorization gates enforce the RBAC matrix
 * correctly across all role × community-type combinations:
 *
 * 1. Admin-gate endpoints (audit-trail, contracts) reject non-admin roles
 * 2. Feature-gate endpoints (meetings, compliance, leases) reject wrong community types
 * 3. Maintenance: residents see only own requests; admins see all
 * 4. Cross-tenant isolation: users cannot access other communities' resources
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
  requireUser,
  setActor,
  requireCurrentActor,
  apiUrl,
  parseJson,
  readNumberField,
  requireInsertedRow,
} from './helpers/multi-tenant-test-kit';

if (process.env.CI && !process.env.DATABASE_URL) {
  throw new Error('P4-58 role-isolation integration tests require DATABASE_URL in CI');
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

type AuditTrailRouteModule = typeof import('../../src/app/api/v1/audit-trail/route');
type ContractsRouteModule = typeof import('../../src/app/api/v1/contracts/route');
type MeetingsRouteModule = typeof import('../../src/app/api/v1/meetings/route');
type ComplianceRouteModule = typeof import('../../src/app/api/v1/compliance/route');
type LeasesRouteModule = typeof import('../../src/app/api/v1/leases/route');
type MaintenanceRouteModule = typeof import('../../src/app/api/v1/maintenance-requests/route');
type DocumentsRouteModule = typeof import('../../src/app/api/v1/documents/route');

interface RouteModules {
  auditTrail: AuditTrailRouteModule;
  contracts: ContractsRouteModule;
  meetings: MeetingsRouteModule;
  compliance: ComplianceRouteModule;
  leases: LeasesRouteModule;
  maintenance: MaintenanceRouteModule;
  documents: DocumentsRouteModule;
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

let state: TestKitState | null = null;
let routes: RouteModules | null = null;

/** Maps: maintenance request IDs per user */
let maintenanceRequestIds: Record<string, number> = {};

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

describeDb('p4-58 role-isolation integration', () => {
  beforeAll(async () => {
    if (!process.env.DATABASE_URL) return;

    state = await initTestKit();

    // Seed all 3 communities
    await seedCommunities(state, MULTI_TENANT_COMMUNITIES);

    // Seed users for role coverage
    const neededUsers: MultiTenantUserKey[] = [
      // communityA (condo_718)
      'actorA',    // board_president
      'residentA', // board_member
      'tenantA',   // tenant
      'camA',      // cam
      'ownerA',    // owner
      'pmaA',      // property_manager_admin
      // communityB (hoa_720)
      'actorB',    // board_president
      // communityC (apartment)
      'actorC',    // property_manager_admin
      'tenantC',   // tenant
      'siteManagerC', // site_manager
    ];

    const userFixtures = MULTI_TENANT_USERS.filter((u) =>
      neededUsers.includes(u.key),
    );

    // Seed units for tenant users (needed for role assignment)
    const communityA = requireCommunity(state, 'communityA');
    const communityC = requireCommunity(state, 'communityC');
    const scopedA = state.dbModule.createScopedClient(communityA.id);
    const scopedC = state.dbModule.createScopedClient(communityC.id);

    const [unitA] = await scopedA.insert(state.dbModule.units, {
      unitNumber: `P458-ISO-A-${state.runSuffix}`,
      building: null,
      floor: null,
    });
    const [unitC] = await scopedC.insert(state.dbModule.units, {
      unitNumber: `P458-ISO-C-${state.runSuffix}`,
      building: null,
      floor: null,
    });

    const unitAId = readNumberField(requireInsertedRow(unitA, 'unitA'), 'id');
    const unitCId = readNumberField(requireInsertedRow(unitC, 'unitC'), 'id');

    const unitMap = new Map<MultiTenantUserKey, number>([
      ['tenantA', unitAId],
      ['ownerA', unitAId],
      ['tenantC', unitCId],
    ]);

    await seedUsers(state, userFixtures, unitMap);

    // Seed maintenance requests for scoping tests
    const tenantA = requireUser(state, 'tenantA');
    const camA = requireUser(state, 'camA');

    const [tenantReq] = await scopedA.insert(state.dbModule.maintenanceRequests, {
      title: `Tenant Request ${state.runSuffix}`,
      description: 'Leaky faucet',
      submittedById: tenantA.id,
      priority: 'normal',
      status: 'open',
      category: 'plumbing',
    });
    const [adminReq] = await scopedA.insert(state.dbModule.maintenanceRequests, {
      title: `Admin Request ${state.runSuffix}`,
      description: 'Lobby repair',
      submittedById: camA.id,
      priority: 'high',
      status: 'open',
      category: 'general',
    });

    maintenanceRequestIds['tenantA'] = readNumberField(
      requireInsertedRow(tenantReq, 'tenantReq'), 'id',
    );
    maintenanceRequestIds['camA'] = readNumberField(
      requireInsertedRow(adminReq, 'adminReq'), 'id',
    );

    // Seed an internal comment on the tenant's request
    await scopedA.insert(state.dbModule.maintenanceComments, {
      requestId: maintenanceRequestIds['tenantA'],
      userId: camA.id,
      text: `Internal note ${state.runSuffix}`,
      isInternal: true,
    });

    // Dynamically import routes (after mocks are in place)
    routes = {
      auditTrail: await import('../../src/app/api/v1/audit-trail/route'),
      contracts: await import('../../src/app/api/v1/contracts/route'),
      meetings: await import('../../src/app/api/v1/meetings/route'),
      compliance: await import('../../src/app/api/v1/compliance/route'),
      leases: await import('../../src/app/api/v1/leases/route'),
      maintenance: await import('../../src/app/api/v1/maintenance-requests/route'),
      documents: await import('../../src/app/api/v1/documents/route'),
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
  // Audit trail — admin-only gate
  // =========================================================================

  describe('audit-trail admin gate', () => {
    it('board_president (admin) → 200', async () => {
      const kit = requireState();
      const r = requireRoutes();
      const community = requireCommunity(kit, 'communityA');

      setActor(kit, 'actorA');
      const response = await r.auditTrail.GET(
        new NextRequest(apiUrl(`/api/v1/audit-trail?communityId=${community.id}`)),
      );
      expect(response.status).toBe(200);
    });

    it('cam (admin) → 200', async () => {
      const kit = requireState();
      const r = requireRoutes();
      const community = requireCommunity(kit, 'communityA');

      setActor(kit, 'camA');
      const response = await r.auditTrail.GET(
        new NextRequest(apiUrl(`/api/v1/audit-trail?communityId=${community.id}`)),
      );
      expect(response.status).toBe(200);
    });

    it('tenant (non-admin) → 403', async () => {
      const kit = requireState();
      const r = requireRoutes();
      const community = requireCommunity(kit, 'communityA');

      setActor(kit, 'tenantA');
      const response = await r.auditTrail.GET(
        new NextRequest(apiUrl(`/api/v1/audit-trail?communityId=${community.id}`)),
      );
      expect(response.status).toBe(403);
    });

    it('owner (non-admin) → 403', async () => {
      const kit = requireState();
      const r = requireRoutes();
      const community = requireCommunity(kit, 'communityA');

      setActor(kit, 'ownerA');
      const response = await r.auditTrail.GET(
        new NextRequest(apiUrl(`/api/v1/audit-trail?communityId=${community.id}`)),
      );
      expect(response.status).toBe(403);
    });
  });

  // =========================================================================
  // Contracts — admin gate + compliance feature gate
  // =========================================================================

  describe('contracts admin + feature gate', () => {
    it('pma (admin) in condo → 200', async () => {
      const kit = requireState();
      const r = requireRoutes();
      const community = requireCommunity(kit, 'communityA');

      setActor(kit, 'pmaA');
      const response = await r.contracts.GET(
        new NextRequest(apiUrl(`/api/v1/contracts?communityId=${community.id}`)),
      );
      expect(response.status).toBe(200);
    });

    it('tenant (non-admin) in condo → 403', async () => {
      const kit = requireState();
      const r = requireRoutes();
      const community = requireCommunity(kit, 'communityA');

      setActor(kit, 'tenantA');
      const response = await r.contracts.GET(
        new NextRequest(apiUrl(`/api/v1/contracts?communityId=${community.id}`)),
      );
      expect(response.status).toBe(403);
    });

    it('pma (admin) in apartment → feature gate error', async () => {
      const kit = requireState();
      const r = requireRoutes();
      const community = requireCommunity(kit, 'communityC');

      setActor(kit, 'actorC'); // pma in apartment
      const response = await r.contracts.GET(
        new NextRequest(apiUrl(`/api/v1/contracts?communityId=${community.id}`)),
      );
      expect(response.status).toBe(403);
    });
  });

  // =========================================================================
  // Meetings — feature gate (apartment blocked)
  // =========================================================================

  describe('meetings feature gate', () => {
    it('any member in condo → 200', async () => {
      const kit = requireState();
      const r = requireRoutes();
      const community = requireCommunity(kit, 'communityA');

      setActor(kit, 'tenantA');
      const response = await r.meetings.GET(
        new NextRequest(apiUrl(`/api/v1/meetings?communityId=${community.id}`)),
      );
      expect(response.status).toBe(200);
    });

    it('any member in apartment → feature gate error', async () => {
      const kit = requireState();
      const r = requireRoutes();
      const community = requireCommunity(kit, 'communityC');

      setActor(kit, 'tenantC');
      const response = await r.meetings.GET(
        new NextRequest(apiUrl(`/api/v1/meetings?communityId=${community.id}`)),
      );
      expect(response.status).toBe(403);
    });
  });

  // =========================================================================
  // Compliance — feature gate (apartment blocked)
  // =========================================================================

  describe('compliance feature gate', () => {
    it('any member in condo → 200', async () => {
      const kit = requireState();
      const r = requireRoutes();
      const community = requireCommunity(kit, 'communityA');

      setActor(kit, 'actorA');
      const response = await r.compliance.GET(
        new NextRequest(apiUrl(`/api/v1/compliance?communityId=${community.id}`)),
      );
      expect(response.status).toBe(200);
    });

    it('any member in apartment → feature gate error', async () => {
      const kit = requireState();
      const r = requireRoutes();
      const community = requireCommunity(kit, 'communityC');

      setActor(kit, 'actorC');
      const response = await r.compliance.GET(
        new NextRequest(apiUrl(`/api/v1/compliance?communityId=${community.id}`)),
      );
      expect(response.status).toBe(403);
    });
  });

  // =========================================================================
  // Leases — feature gate (condo/hoa blocked)
  // =========================================================================

  describe('leases feature gate', () => {
    it('any member in apartment → 200', async () => {
      const kit = requireState();
      const r = requireRoutes();
      const community = requireCommunity(kit, 'communityC');

      setActor(kit, 'actorC');
      const response = await r.leases.GET(
        new NextRequest(apiUrl(`/api/v1/leases?communityId=${community.id}`)),
      );
      expect(response.status).toBe(200);
    });

    it('any member in condo → feature gate error', async () => {
      const kit = requireState();
      const r = requireRoutes();
      const community = requireCommunity(kit, 'communityA');

      setActor(kit, 'actorA');
      const response = await r.leases.GET(
        new NextRequest(apiUrl(`/api/v1/leases?communityId=${community.id}`)),
      );
      expect(response.status).toBe(403);
    });
  });

  // =========================================================================
  // Maintenance — resident-scoped access
  // =========================================================================

  describe('maintenance resident scoping', () => {
    it('admin (camA) sees all maintenance requests', async () => {
      const kit = requireState();
      const r = requireRoutes();
      const community = requireCommunity(kit, 'communityA');

      setActor(kit, 'camA');
      const response = await r.maintenance.GET(
        new NextRequest(apiUrl(`/api/v1/maintenance-requests?communityId=${community.id}`)),
      );
      expect(response.status).toBe(200);
      const json = await parseJson<{ data: Array<Record<string, unknown>> }>(response);

      const titles = json.data.map((r) => String(r['title']));
      const suffix = kit.runSuffix;
      expect(titles).toContain(`Tenant Request ${suffix}`);
      expect(titles).toContain(`Admin Request ${suffix}`);
    });

    it('tenant sees only own maintenance requests', async () => {
      const kit = requireState();
      const r = requireRoutes();
      const community = requireCommunity(kit, 'communityA');

      setActor(kit, 'tenantA');
      const response = await r.maintenance.GET(
        new NextRequest(apiUrl(`/api/v1/maintenance-requests?communityId=${community.id}`)),
      );
      expect(response.status).toBe(200);
      const json = await parseJson<{ data: Array<Record<string, unknown>> }>(response);

      const titles = json.data.map((r) => String(r['title']));
      const suffix = kit.runSuffix;
      expect(titles).toContain(`Tenant Request ${suffix}`);
      expect(titles).not.toContain(`Admin Request ${suffix}`);
    });

    it('owner sees only own maintenance requests', async () => {
      const kit = requireState();
      const r = requireRoutes();
      const community = requireCommunity(kit, 'communityA');

      setActor(kit, 'ownerA');
      const response = await r.maintenance.GET(
        new NextRequest(apiUrl(`/api/v1/maintenance-requests?communityId=${community.id}`)),
      );
      expect(response.status).toBe(200);
      const json = await parseJson<{ data: Array<Record<string, unknown>> }>(response);

      // ownerA has no maintenance requests — should see none
      expect(json.data).toHaveLength(0);
    });
  });

  // =========================================================================
  // Cross-tenant isolation
  // =========================================================================

  describe('cross-tenant isolation', () => {
    it('communityA user → communityB documents → 403', async () => {
      const kit = requireState();
      const r = requireRoutes();
      const communityB = requireCommunity(kit, 'communityB');

      setActor(kit, 'actorA'); // board_president in communityA
      const response = await r.documents.GET(
        new NextRequest(apiUrl(`/api/v1/documents?communityId=${communityB.id}`)),
      );
      expect(response.status).toBe(403);
    });

    it('communityB user → communityC leases → 403', async () => {
      const kit = requireState();
      const r = requireRoutes();
      const communityC = requireCommunity(kit, 'communityC');

      setActor(kit, 'actorB'); // board_president in communityB
      const response = await r.leases.GET(
        new NextRequest(apiUrl(`/api/v1/leases?communityId=${communityC.id}`)),
      );
      expect(response.status).toBe(403);
    });

    it('communityC user → communityA audit-trail → 403', async () => {
      const kit = requireState();
      const r = requireRoutes();
      const communityA = requireCommunity(kit, 'communityA');

      setActor(kit, 'actorC'); // pma in communityC
      const response = await r.auditTrail.GET(
        new NextRequest(apiUrl(`/api/v1/audit-trail?communityId=${communityA.id}`)),
      );
      expect(response.status).toBe(403);
    });

    it('communityC user → communityA maintenance → 403', async () => {
      const kit = requireState();
      const r = requireRoutes();
      const communityA = requireCommunity(kit, 'communityA');

      setActor(kit, 'tenantC'); // tenant in communityC
      const response = await r.maintenance.GET(
        new NextRequest(apiUrl(`/api/v1/maintenance-requests?communityId=${communityA.id}`)),
      );
      expect(response.status).toBe(403);
    });
  });
});
