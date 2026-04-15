import { NextRequest } from 'next/server';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { MULTI_TENANT_COMMUNITIES } from '../fixtures/multi-tenant-communities';
import { MULTI_TENANT_USERS, type MultiTenantUserKey } from '../fixtures/multi-tenant-users';
import {
  type TestKitState,
  apiUrl,
  getDescribeDb,
  initTestKit,
  jsonRequest,
  parseJson,
  readNumberField,
  requireCommunity,
  requireDatabaseUrlInCI,
  seedCommunities,
  seedUsers,
  setActor,
  teardownTestKit,
} from './helpers/multi-tenant-test-kit';

requireDatabaseUrlInCI('maintenance operations authorization integration tests');

const describeDb = getDescribeDb();

type MaintenanceRequestsRouteModule = typeof import('../../src/app/api/v1/maintenance-requests/route');
type MaintenanceRequestDetailRouteModule = typeof import('../../src/app/api/v1/maintenance-requests/[id]/route');

interface RouteModules {
  maintenanceRequests: MaintenanceRequestsRouteModule;
  maintenanceRequestDetail: MaintenanceRequestDetailRouteModule;
}

let state: TestKitState | null = null;
let routes: RouteModules | null = null;

function requireState(): TestKitState {
  if (!state) {
    throw new Error('Test state not initialized');
  }
  return state;
}

function requireRoutes(): RouteModules {
  if (!routes) {
    throw new Error('Route modules not loaded');
  }
  return routes;
}

async function createRequest(
  actor: MultiTenantUserKey,
  communityId: number,
  title: string,
): Promise<number> {
  const routeModules = requireRoutes();
  const kit = requireState();

  setActor(kit, actor);
  const response = await routeModules.maintenanceRequests.POST(
    jsonRequest(apiUrl('/api/v1/maintenance-requests'), 'POST', {
      action: 'create',
      communityId,
      title,
      description: `${title} description`,
      category: 'general',
      priority: 'normal',
    }),
  );

  expect(response.status).toBe(201);
  const payload = await parseJson<{ data: Record<string, unknown> }>(response);
  return readNumberField(payload.data, 'id');
}

describeDb('maintenance operations auth (db-backed integration)', () => {
  beforeAll(async () => {
    if (!process.env.DATABASE_URL) return;

    state = await initTestKit();
    await seedCommunities(
      state,
      MULTI_TENANT_COMMUNITIES.filter((community) =>
        ['communityA', 'communityC'].includes(community.key),
      ),
    );

    const neededUsers: MultiTenantUserKey[] = ['actorA', 'tenantA', 'actorC', 'tenantC'];
    await seedUsers(
      state,
      MULTI_TENANT_USERS.filter((user) => neededUsers.includes(user.key)),
    );

    routes = {
      maintenanceRequests: await import('../../src/app/api/v1/maintenance-requests/route'),
      maintenanceRequestDetail: await import('../../src/app/api/v1/maintenance-requests/[id]/route'),
    };
  });

  beforeEach(() => {
    const kit = requireState();
    setActor(kit, 'actorA');
  });

  afterAll(async () => {
    if (state) {
      await teardownTestKit(state);
    }
  });

  it('loads resident, manager, and pm_admin request scopes correctly and keeps write flow staff-only', async () => {
    const kit = requireState();
    const routeModules = requireRoutes();
    const communityA = requireCommunity(kit, 'communityA');
    const communityC = requireCommunity(kit, 'communityC');

    const tenantARequestId = await createRequest('tenantA', communityA.id, `Tenant A Request ${kit.runSuffix}`);
    const managerRequestId = await createRequest('actorA', communityA.id, `Manager Request ${kit.runSuffix}`);
    const tenantCRequestId = await createRequest('tenantC', communityC.id, `Tenant C Request ${kit.runSuffix}`);

    setActor(kit, 'tenantA');
    const residentListResponse = await routeModules.maintenanceRequests.GET(
      new NextRequest(apiUrl(`/api/v1/maintenance-requests?communityId=${communityA.id}`)),
    );
    expect(residentListResponse.status).toBe(200);
    const residentList = await parseJson<{ data: Array<Record<string, unknown>> }>(residentListResponse);
    expect(residentList.data.map((row) => row.id)).toEqual([tenantARequestId]);

    setActor(kit, 'actorA');
    const managerListResponse = await routeModules.maintenanceRequests.GET(
      new NextRequest(apiUrl(`/api/v1/maintenance-requests?communityId=${communityA.id}`)),
    );
    expect(managerListResponse.status).toBe(200);
    const managerList = await parseJson<{ data: Array<Record<string, unknown>> }>(managerListResponse);
    expect(managerList.data.map((row) => Number(row.id)).sort((a, b) => a - b)).toEqual(
      [tenantARequestId, managerRequestId].sort((a, b) => a - b),
    );

    setActor(kit, 'actorC');
    const pmAdminListResponse = await routeModules.maintenanceRequests.GET(
      new NextRequest(apiUrl(`/api/v1/maintenance-requests?communityId=${communityC.id}`)),
    );
    expect(pmAdminListResponse.status).toBe(200);
    const pmAdminList = await parseJson<{ data: Array<Record<string, unknown>> }>(pmAdminListResponse);
    expect(pmAdminList.data.map((row) => row.id)).toEqual([tenantCRequestId]);

    setActor(kit, 'actorA');
    const managerPatchResponse = await routeModules.maintenanceRequestDetail.PATCH(
      jsonRequest(apiUrl(`/api/v1/maintenance-requests/${tenantARequestId}`), 'PATCH', {
        communityId: communityA.id,
        status: 'acknowledged',
      }),
      { params: Promise.resolve({ id: String(tenantARequestId) }) },
    );
    expect(managerPatchResponse.status).toBe(200);

    setActor(kit, 'actorC');
    const pmAdminPatchResponse = await routeModules.maintenanceRequestDetail.PATCH(
      jsonRequest(apiUrl(`/api/v1/maintenance-requests/${tenantCRequestId}`), 'PATCH', {
        communityId: communityC.id,
        status: 'acknowledged',
      }),
      { params: Promise.resolve({ id: String(tenantCRequestId) }) },
    );
    expect(pmAdminPatchResponse.status).toBe(200);

    setActor(kit, 'tenantA');
    const residentPatchResponse = await routeModules.maintenanceRequestDetail.PATCH(
      jsonRequest(apiUrl(`/api/v1/maintenance-requests/${tenantARequestId}`), 'PATCH', {
        communityId: communityA.id,
        status: 'acknowledged',
      }),
      { params: Promise.resolve({ id: String(tenantARequestId) }) },
    );
    expect(residentPatchResponse.status).toBe(403);
  });
});
