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
  requireUser,
  seedCommunities,
  seedUsers,
  setActor,
  teardownTestKit,
} from './helpers/multi-tenant-test-kit';
import { getCapturedNotifications } from './providers/test-capture-sinks';

requireDatabaseUrlInCI('WS71 package/visitor integration tests');

const describeDb = getDescribeDb();

type PackagesRouteModule = typeof import('../../src/app/api/v1/packages/route');
type PackagePickupRouteModule = typeof import('../../src/app/api/v1/packages/[id]/pickup/route');
type PackagesMyRouteModule = typeof import('../../src/app/api/v1/packages/my/route');
type VisitorsRouteModule = typeof import('../../src/app/api/v1/visitors/route');
type VisitorCheckInRouteModule = typeof import('../../src/app/api/v1/visitors/[id]/checkin/route');
type VisitorCheckOutRouteModule = typeof import('../../src/app/api/v1/visitors/[id]/checkout/route');
type VisitorsMyRouteModule = typeof import('../../src/app/api/v1/visitors/my/route');

interface RouteModules {
  packages: PackagesRouteModule;
  packagePickup: PackagePickupRouteModule;
  packagesMy: PackagesMyRouteModule;
  visitors: VisitorsRouteModule;
  visitorCheckIn: VisitorCheckInRouteModule;
  visitorCheckOut: VisitorCheckOutRouteModule;
  visitorsMy: VisitorsMyRouteModule;
}

let state: TestKitState | null = null;
let routes: RouteModules | null = null;
let unitAId: number;
let unitCId: number;

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

describeDb('WS71 package/visitor logging (db-backed integration)', () => {
  beforeAll(async () => {
    if (!process.env.DATABASE_URL) return;

    state = await initTestKit();

    const selectedCommunities = MULTI_TENANT_COMMUNITIES.filter((community) =>
      ['communityA', 'communityB', 'communityC'].includes(community.key),
    );
    await seedCommunities(state, selectedCommunities);

    const communityA = requireCommunity(state, 'communityA');
    const communityC = requireCommunity(state, 'communityC');

    const scopedA = state.dbModule.createScopedClient(communityA.id);
    const scopedC = state.dbModule.createScopedClient(communityC.id);

    const [unitA] = await scopedA.insert(state.dbModule.units, {
      unitNumber: `PKG-A-${state.runSuffix}`,
      building: 'A',
      floor: 1,
    });
    const [unitC] = await scopedC.insert(state.dbModule.units, {
      unitNumber: `PKG-C-${state.runSuffix}`,
      building: 'C',
      floor: 3,
    });

    unitAId = readNumberField(unitA, 'id');
    unitCId = readNumberField(unitC, 'id');

    const neededUsers: MultiTenantUserKey[] = ['actorA', 'tenantA', 'actorB', 'actorC', 'tenantC'];
    const unitMap = new Map<MultiTenantUserKey, number>();
    unitMap.set('tenantA', unitAId);
    unitMap.set('tenantC', unitCId);

    await seedUsers(
      state,
      MULTI_TENANT_USERS.filter((user) => neededUsers.includes(user.key)),
      unitMap,
    );

    routes = {
      packages: await import('../../src/app/api/v1/packages/route'),
      packagePickup: await import('../../src/app/api/v1/packages/[id]/pickup/route'),
      packagesMy: await import('../../src/app/api/v1/packages/my/route'),
      visitors: await import('../../src/app/api/v1/visitors/route'),
      visitorCheckIn: await import('../../src/app/api/v1/visitors/[id]/checkin/route'),
      visitorCheckOut: await import('../../src/app/api/v1/visitors/[id]/checkout/route'),
      visitorsMy: await import('../../src/app/api/v1/visitors/my/route'),
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

  it('runs package receive -> notify -> pickup flow with idempotent double pickup', async () => {
    const kit = requireState();
    const routeModules = requireRoutes();
    const communityA = requireCommunity(kit, 'communityA');
    const tenantA = requireUser(kit, 'tenantA');

    setActor(kit, 'actorA');
    const createPackageResponse = await routeModules.packages.POST(
      jsonRequest(apiUrl('/api/v1/packages'), 'POST', {
        communityId: communityA.id,
        unitId: unitAId,
        recipientName: `Tenant A ${kit.runSuffix}`,
        carrier: 'UPS',
        trackingNumber: `1Z-${kit.runSuffix}`,
      }),
    );
    expect(createPackageResponse.status).toBe(201);
    const createPackageJson = await parseJson<{ data: Record<string, unknown> }>(createPackageResponse);
    const packageId = readNumberField(createPackageJson.data, 'id');

    const packageNotifications = getCapturedNotifications().filter(
      (entry) =>
        entry.communityId === communityA.id
        && entry.event.type === 'compliance_alert'
        && entry.event.sourceId === String(packageId)
        && typeof entry.recipientFilter === 'object'
        && entry.recipientFilter.type === 'specific_user'
        && entry.recipientFilter.userId === tenantA.id,
    );
    expect(packageNotifications.length).toBeGreaterThan(0);

    setActor(kit, 'tenantA');
    const myPackagesResponse = await routeModules.packagesMy.GET(
      new NextRequest(apiUrl(`/api/v1/packages/my?communityId=${communityA.id}`)),
    );
    expect(myPackagesResponse.status).toBe(200);
    const myPackagesJson = await parseJson<{ data: Array<Record<string, unknown>> }>(myPackagesResponse);
    expect(myPackagesJson.data.some((row) => row.id === packageId)).toBe(true);

    setActor(kit, 'actorA');
    const pickupResponse = await routeModules.packagePickup.PATCH(
      jsonRequest(apiUrl(`/api/v1/packages/${packageId}/pickup`), 'PATCH', {
        communityId: communityA.id,
        pickedUpByName: 'Tenant A',
      }),
      { params: Promise.resolve({ id: String(packageId) }) },
    );
    expect(pickupResponse.status).toBe(200);
    const pickupJson = await parseJson<{ data: Record<string, unknown> }>(pickupResponse);
    expect(pickupJson.data.status).toBe('picked_up');

    const secondPickupResponse = await routeModules.packagePickup.PATCH(
      jsonRequest(apiUrl(`/api/v1/packages/${packageId}/pickup`), 'PATCH', {
        communityId: communityA.id,
        pickedUpByName: 'Tenant A',
      }),
      { params: Promise.resolve({ id: String(packageId) }) },
    );
    expect(secondPickupResponse.status).toBe(200);
    const secondPickupJson = await parseJson<{ data: Record<string, unknown> }>(secondPickupResponse);
    expect(secondPickupJson.data.status).toBe('picked_up');
  });

  it('runs visitor pass -> checkin -> checkout and resident my-visitors filtering', async () => {
    const kit = requireState();
    const routeModules = requireRoutes();
    const communityA = requireCommunity(kit, 'communityA');

    setActor(kit, 'tenantA');
    const createVisitorResponse = await routeModules.visitors.POST(
      jsonRequest(apiUrl('/api/v1/visitors'), 'POST', {
        communityId: communityA.id,
        visitorName: `Guest ${kit.runSuffix}`,
        purpose: 'Dinner visit',
        hostUnitId: unitAId,
        expectedArrival: '2026-06-21T18:00:00.000Z',
      }),
    );
    expect(createVisitorResponse.status).toBe(201);
    const createVisitorJson = await parseJson<{ data: Record<string, unknown> }>(createVisitorResponse);
    const visitorId = readNumberField(createVisitorJson.data, 'id');

    const myVisitorsResponse = await routeModules.visitorsMy.GET(
      new NextRequest(apiUrl(`/api/v1/visitors/my?communityId=${communityA.id}`)),
    );
    expect(myVisitorsResponse.status).toBe(200);
    const myVisitorsJson = await parseJson<{ data: Array<Record<string, unknown>> }>(myVisitorsResponse);
    expect(myVisitorsJson.data.some((row) => row.id === visitorId)).toBe(true);

    setActor(kit, 'actorA');
    const checkInResponse = await routeModules.visitorCheckIn.PATCH(
      jsonRequest(apiUrl(`/api/v1/visitors/${visitorId}/checkin`), 'PATCH', {
        communityId: communityA.id,
      }),
      { params: Promise.resolve({ id: String(visitorId) }) },
    );
    expect(checkInResponse.status).toBe(200);

    const checkOutResponse = await routeModules.visitorCheckOut.PATCH(
      jsonRequest(apiUrl(`/api/v1/visitors/${visitorId}/checkout`), 'PATCH', {
        communityId: communityA.id,
      }),
      { params: Promise.resolve({ id: String(visitorId) }) },
    );
    expect(checkOutResponse.status).toBe(200);
    const checkOutJson = await parseJson<{ data: Record<string, unknown> }>(checkOutResponse);
    expect(checkOutJson.data.checkedOutAt).toBeTruthy();
  });

  it('enforces feature flags and cross-tenant isolation for package/visitor routes', async () => {
    const kit = requireState();
    const routeModules = requireRoutes();
    const communityA = requireCommunity(kit, 'communityA');
    const communityB = requireCommunity(kit, 'communityB');
    const communityC = requireCommunity(kit, 'communityC');

    setActor(kit, 'actorB');
    const hoaPackageCreate = await routeModules.packages.POST(
      jsonRequest(apiUrl('/api/v1/packages'), 'POST', {
        communityId: communityB.id,
        unitId: unitAId,
        recipientName: 'HOA Resident',
        carrier: 'FedEx',
      }),
    );
    expect(hoaPackageCreate.status).toBe(403);

    const hoaVisitorsList = await routeModules.visitors.GET(
      new NextRequest(apiUrl(`/api/v1/visitors?communityId=${communityB.id}`)),
    );
    expect(hoaVisitorsList.status).toBe(403);

    const crossTenantPackages = await routeModules.packages.GET(
      new NextRequest(apiUrl(`/api/v1/packages?communityId=${communityA.id}`)),
    );
    expect(crossTenantPackages.status).toBe(403);

    const crossTenantVisitors = await routeModules.visitors.GET(
      new NextRequest(apiUrl(`/api/v1/visitors?communityId=${communityA.id}`)),
    );
    expect(crossTenantVisitors.status).toBe(403);

    setActor(kit, 'actorC');
    const apartmentPackageCreate = await routeModules.packages.POST(
      jsonRequest(apiUrl('/api/v1/packages'), 'POST', {
        communityId: communityC.id,
        unitId: unitCId,
        recipientName: 'Apartment Resident',
        carrier: 'USPS',
      }),
    );
    expect(apartmentPackageCreate.status).toBe(201);

    const apartmentVisitorCreate = await routeModules.visitors.POST(
      jsonRequest(apiUrl('/api/v1/visitors'), 'POST', {
        communityId: communityC.id,
        visitorName: 'Apartment Guest',
        purpose: 'Move-in help',
        hostUnitId: unitCId,
        expectedArrival: '2026-06-25T12:00:00.000Z',
      }),
    );
    expect(apartmentVisitorCreate.status).toBe(201);
  });
});
