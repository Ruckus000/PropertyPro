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

requireDatabaseUrlInCI('WS69 work-orders/amenities integration tests');

const describeDb = getDescribeDb();

type VendorsRouteModule = typeof import('../../src/app/api/v1/vendors/route');
type VendorRouteModule = typeof import('../../src/app/api/v1/vendors/[id]/route');
type WorkOrdersRouteModule = typeof import('../../src/app/api/v1/work-orders/route');
type WorkOrderRouteModule = typeof import('../../src/app/api/v1/work-orders/[id]/route');
type WorkOrderCompleteRouteModule = typeof import('../../src/app/api/v1/work-orders/[id]/complete/route');
type AmenitiesRouteModule = typeof import('../../src/app/api/v1/amenities/route');
type AmenityRouteModule = typeof import('../../src/app/api/v1/amenities/[id]/route');
type AmenityReserveRouteModule = typeof import('../../src/app/api/v1/amenities/[id]/reserve/route');
type AmenityScheduleRouteModule = typeof import('../../src/app/api/v1/amenities/[id]/schedule/route');
type ReservationsRouteModule = typeof import('../../src/app/api/v1/reservations/route');
type ReservationRouteModule = typeof import('../../src/app/api/v1/reservations/[id]/route');

interface RouteModules {
  vendors: VendorsRouteModule;
  vendorDetail: VendorRouteModule;
  workOrders: WorkOrdersRouteModule;
  workOrderDetail: WorkOrderRouteModule;
  workOrderComplete: WorkOrderCompleteRouteModule;
  amenities: AmenitiesRouteModule;
  amenityDetail: AmenityRouteModule;
  amenityReserve: AmenityReserveRouteModule;
  amenitySchedule: AmenityScheduleRouteModule;
  reservations: ReservationsRouteModule;
  reservationDetail: ReservationRouteModule;
}

let state: TestKitState | null = null;
let routes: RouteModules | null = null;
let unitAId: number;

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

describeDb('WS69 work-orders/amenities (db-backed integration)', () => {
  beforeAll(async () => {
    if (!process.env.DATABASE_URL) return;

    state = await initTestKit();

    const selectedCommunities = MULTI_TENANT_COMMUNITIES.filter((community) =>
      ['communityA', 'communityB', 'communityC'].includes(community.key),
    );
    await seedCommunities(state, selectedCommunities);

    const communityA = requireCommunity(state, 'communityA');

    const scopedA = state.dbModule.createScopedClient(communityA.id);

    const [unitA] = await scopedA.insert(state.dbModule.units, {
      unitNumber: `WO-A-${state.runSuffix}`,
      building: 'A',
      floor: 1,
    });

    unitAId = readNumberField(unitA, 'id');

    const neededUsers: MultiTenantUserKey[] = ['actorA', 'residentA', 'tenantA', 'actorB', 'actorC', 'tenantC'];
    const unitMap = new Map<MultiTenantUserKey, number>();
    unitMap.set('tenantA', unitAId);

    await seedUsers(
      state,
      MULTI_TENANT_USERS.filter((user) => neededUsers.includes(user.key)),
      unitMap,
    );

    routes = {
      vendors: await import('../../src/app/api/v1/vendors/route'),
      vendorDetail: await import('../../src/app/api/v1/vendors/[id]/route'),
      workOrders: await import('../../src/app/api/v1/work-orders/route'),
      workOrderDetail: await import('../../src/app/api/v1/work-orders/[id]/route'),
      workOrderComplete: await import('../../src/app/api/v1/work-orders/[id]/complete/route'),
      amenities: await import('../../src/app/api/v1/amenities/route'),
      amenityDetail: await import('../../src/app/api/v1/amenities/[id]/route'),
      amenityReserve: await import('../../src/app/api/v1/amenities/[id]/reserve/route'),
      amenitySchedule: await import('../../src/app/api/v1/amenities/[id]/schedule/route'),
      reservations: await import('../../src/app/api/v1/reservations/route'),
      reservationDetail: await import('../../src/app/api/v1/reservations/[id]/route'),
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

  it('runs vendor and work-order lifecycle including assignment and completion', async () => {
    const kit = requireState();
    const routeModules = requireRoutes();
    const communityA = requireCommunity(kit, 'communityA');

    setActor(kit, 'actorA');
    const createVendorResponse = await routeModules.vendors.POST(
      jsonRequest(apiUrl('/api/v1/vendors'), 'POST', {
        communityId: communityA.id,
        name: `Coastal HVAC ${kit.runSuffix}`,
        company: 'Coastal Service Group',
        specialties: ['hvac', 'general_maintenance'],
      }),
    );
    expect(createVendorResponse.status).toBe(201);
    const createVendorJson = await parseJson<{ data: Record<string, unknown> }>(createVendorResponse);
    const vendorId = readNumberField(createVendorJson.data, 'id');

    setActor(kit, 'residentA');
    const createWorkOrderResponse = await routeModules.workOrders.POST(
      jsonRequest(apiUrl('/api/v1/work-orders'), 'POST', {
        communityId: communityA.id,
        title: `AC Not Cooling ${kit.runSuffix}`,
        description: 'The AC in hallway level 1 is not cooling.',
        unitId: unitAId,
        vendorId,
        priority: 'high',
        slaResponseHours: 4,
        slaCompletionHours: 24,
      }),
    );
    expect(createWorkOrderResponse.status).toBe(201);
    const createWorkOrderJson = await parseJson<{ data: Record<string, unknown> }>(createWorkOrderResponse);
    const workOrderId = readNumberField(createWorkOrderJson.data, 'id');

    setActor(kit, 'actorA');
    const assignResponse = await routeModules.workOrderDetail.PATCH(
      jsonRequest(apiUrl(`/api/v1/work-orders/${workOrderId}`), 'PATCH', {
        communityId: communityA.id,
        status: 'assigned',
        vendorId,
      }),
      { params: Promise.resolve({ id: String(workOrderId) }) },
    );
    expect(assignResponse.status).toBe(200);

    const completeResponse = await routeModules.workOrderComplete.POST(
      jsonRequest(apiUrl(`/api/v1/work-orders/${workOrderId}/complete`), 'POST', {
        communityId: communityA.id,
      }),
      { params: Promise.resolve({ id: String(workOrderId) }) },
    );
    expect(completeResponse.status).toBe(200);
    const completeJson = await parseJson<{ data: Record<string, unknown> }>(completeResponse);
    expect(completeJson.data.status).toBe('completed');

    const getResponse = await routeModules.workOrderDetail.GET(
      new NextRequest(apiUrl(`/api/v1/work-orders/${workOrderId}?communityId=${communityA.id}`)),
      { params: Promise.resolve({ id: String(workOrderId) }) },
    );
    expect(getResponse.status).toBe(200);
    const getJson = await parseJson<{ data: Record<string, unknown> }>(getResponse);
    expect(getJson.data.status).toBe('completed');
  });

  it('enforces amenity reservation conflict detection and cross-tenant isolation', async () => {
    const kit = requireState();
    const routeModules = requireRoutes();
    const communityA = requireCommunity(kit, 'communityA');
    const communityB = requireCommunity(kit, 'communityB');

    setActor(kit, 'actorA');
    const createAmenityResponse = await routeModules.amenities.POST(
      jsonRequest(apiUrl('/api/v1/amenities'), 'POST', {
        communityId: communityA.id,
        name: `Clubhouse ${kit.runSuffix}`,
        description: 'Community clubhouse',
        capacity: 40,
        isBookable: true,
      }),
    );
    expect(createAmenityResponse.status).toBe(201);
    const createAmenityJson = await parseJson<{ data: Record<string, unknown> }>(createAmenityResponse);
    const amenityId = readNumberField(createAmenityJson.data, 'id');

    const startTime = '2026-06-15T14:00:00.000Z';
    const endTime = '2026-06-15T16:00:00.000Z';

    setActor(kit, 'tenantA');
    const reserveResponse = await routeModules.amenityReserve.POST(
      jsonRequest(apiUrl(`/api/v1/amenities/${amenityId}/reserve`), 'POST', {
        communityId: communityA.id,
        startTime,
        endTime,
      }),
      { params: Promise.resolve({ id: String(amenityId) }) },
    );
    expect(reserveResponse.status).toBe(201);
    const reserveJson = await parseJson<{ data: Record<string, unknown> }>(reserveResponse);
    const reservationId = readNumberField(reserveJson.data, 'id');

    setActor(kit, 'actorA');
    const conflictingReserveResponse = await routeModules.amenityReserve.POST(
      jsonRequest(apiUrl(`/api/v1/amenities/${amenityId}/reserve`), 'POST', {
        communityId: communityA.id,
        unitId: unitAId,
        startTime: '2026-06-15T15:00:00.000Z',
        endTime: '2026-06-15T17:00:00.000Z',
      }),
      { params: Promise.resolve({ id: String(amenityId) }) },
    );
    expect(conflictingReserveResponse.status).toBe(409);

    setActor(kit, 'tenantA');
    const reservationsResponse = await routeModules.reservations.GET(
      new NextRequest(apiUrl(`/api/v1/reservations?communityId=${communityA.id}`)),
    );
    expect(reservationsResponse.status).toBe(200);
    const reservationsJson = await parseJson<{ data: Array<Record<string, unknown>> }>(reservationsResponse);
    expect(reservationsJson.data.some((row) => row.id === reservationId)).toBe(true);

    const cancelResponse = await routeModules.reservationDetail.DELETE(
      new NextRequest(apiUrl(`/api/v1/reservations/${reservationId}?communityId=${communityA.id}`), {
        method: 'DELETE',
      }),
      { params: Promise.resolve({ id: String(reservationId) }) },
    );
    expect(cancelResponse.status).toBe(200);
    const cancelJson = await parseJson<{ data: Record<string, unknown> }>(cancelResponse);
    expect(cancelJson.data.status).toBe('cancelled');

    setActor(kit, 'actorB');
    const crossTenantScheduleResponse = await routeModules.amenitySchedule.GET(
      new NextRequest(apiUrl(`/api/v1/amenities/${amenityId}/schedule?communityId=${communityB.id}`)),
      { params: Promise.resolve({ id: String(amenityId) }) },
    );
    expect([403, 404]).toContain(crossTenantScheduleResponse.status);
  });
});
