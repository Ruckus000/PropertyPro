import { randomUUID } from 'node:crypto';
import { NextRequest } from 'next/server';
import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest';
import { eq } from '@propertypro/db/filters';
import { deriveVisitorStatus } from '../../src/lib/visitors/visitor-logic';
import { processComplianceAlerts } from '../../src/lib/services/compliance-alert-service';
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
  setActorById,
  teardownTestKit,
  trackUserForCleanup,
} from './helpers/multi-tenant-test-kit';
import {
  clearCapturedNotifications,
  getCapturedNotifications,
} from './providers/test-capture-sinks';

requireDatabaseUrlInCI('visitor upgrade integration tests');

const describeDb = getDescribeDb();

type VisitorsRouteModule = typeof import('../../src/app/api/v1/visitors/route');
type VisitorCheckInRouteModule = typeof import('../../src/app/api/v1/visitors/[id]/checkin/route');
type VisitorCheckOutRouteModule = typeof import('../../src/app/api/v1/visitors/[id]/checkout/route');
type VisitorRevokeRouteModule = typeof import('../../src/app/api/v1/visitors/[id]/revoke/route');
type VisitorsMyRouteModule = typeof import('../../src/app/api/v1/visitors/my/route');
type DeniedVisitorsRouteModule = typeof import('../../src/app/api/v1/visitors/denied/route');
type DeniedVisitorDetailRouteModule = typeof import('../../src/app/api/v1/visitors/denied/[id]/route');
type DeniedVisitorMatchRouteModule = typeof import('../../src/app/api/v1/visitors/denied/match/route');
type VisitorAutoCheckoutRouteModule = typeof import('../../src/app/api/v1/internal/visitor-auto-checkout/route');
type ResidentsRouteModule = typeof import('../../src/app/api/v1/residents/route');

interface RouteModules {
  visitors: VisitorsRouteModule;
  visitorCheckIn: VisitorCheckInRouteModule;
  visitorCheckOut: VisitorCheckOutRouteModule;
  visitorRevoke: VisitorRevokeRouteModule;
  visitorsMy: VisitorsMyRouteModule;
  deniedVisitors: DeniedVisitorsRouteModule;
  deniedVisitorDetail: DeniedVisitorDetailRouteModule;
  deniedVisitorMatch: DeniedVisitorMatchRouteModule;
  visitorAutoCheckout: VisitorAutoCheckoutRouteModule;
  residents: ResidentsRouteModule;
}

interface RuntimeResident {
  userId: string;
  unitId: number;
}

let state: TestKitState | null = null;
let routes: RouteModules | null = null;
let unitAId = 0;

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

async function mergeCommunitySettings(
  communityId: number,
  patch: Record<string, unknown>,
): Promise<void> {
  const kit = requireState();
  const scoped = kit.dbModule.createScopedClient(communityId);
  const communityRows = await scoped.selectFrom<Record<string, unknown>>(
    kit.dbModule.communities,
    {},
    eq(kit.dbModule.communities.id, communityId),
  );
  const currentSettings = (communityRows[0]?.communitySettings as Record<string, unknown> | undefined) ?? {};

  await scoped.update(
    kit.dbModule.communities,
    { communitySettings: { ...currentSettings, ...patch } },
    eq(kit.dbModule.communities.id, communityId),
  );
}

async function loadVisitorRow(
  communityId: number,
  visitorId: number,
): Promise<Record<string, unknown>> {
  const kit = requireState();
  const rows = await kit.dbModule.createScopedClient(communityId).selectFrom<Record<string, unknown>>(
    kit.dbModule.visitorLog,
    {},
    eq(kit.dbModule.visitorLog.id, visitorId),
  );
  const row = rows[0];
  if (!row) {
    throw new Error(`Missing visitor row ${visitorId}`);
  }
  return row;
}

async function seedRuntimeResident(
  communityId: number,
  label: string,
): Promise<RuntimeResident> {
  const kit = requireState();
  const userId = randomUUID();
  trackUserForCleanup(kit, userId);

  await kit.db.insert(kit.dbModule.users).values({
    id: userId,
    email: `${label}-${kit.runSuffix}@example.com`,
    fullName: `${label} ${kit.runSuffix}`,
    phone: null,
  });

  const scoped = kit.dbModule.createScopedClient(communityId);
  const [unitRow] = await scoped.insert(kit.dbModule.units, {
    unitNumber: `${label.toUpperCase().slice(0, 6)}-${kit.runSuffix}`,
    building: 'R',
    floor: 2,
  });
  const unitId = readNumberField(unitRow as Record<string, unknown>, 'id');

  await scoped.insert(kit.dbModule.userRoles, {
    userId,
    role: 'resident',
    isUnitOwner: false,
    displayTitle: 'Tenant',
    unitId,
  });

  return { userId, unitId };
}

describeDb('visitor upgrade (db-backed integration)', () => {
  beforeAll(async () => {
    if (!process.env.DATABASE_URL) return;

    state = await initTestKit();

    await seedCommunities(
      state,
      MULTI_TENANT_COMMUNITIES.filter((community) => community.key === 'communityA'),
    );

    const communityA = requireCommunity(state, 'communityA');
    const scoped = state.dbModule.createScopedClient(communityA.id);

    const [unitA] = await scoped.insert(state.dbModule.units, {
      unitNumber: `VIS-A-${state.runSuffix}`,
      building: 'A',
      floor: 1,
    });
    unitAId = readNumberField(unitA as Record<string, unknown>, 'id');

    const neededUsers: MultiTenantUserKey[] = ['actorA', 'tenantA'];
    const unitMap = new Map<MultiTenantUserKey, number>();
    unitMap.set('tenantA', unitAId);

    await seedUsers(
      state,
      MULTI_TENANT_USERS.filter((user) => neededUsers.includes(user.key)),
      unitMap,
    );

    routes = {
      visitors: await import('../../src/app/api/v1/visitors/route'),
      visitorCheckIn: await import('../../src/app/api/v1/visitors/[id]/checkin/route'),
      visitorCheckOut: await import('../../src/app/api/v1/visitors/[id]/checkout/route'),
      visitorRevoke: await import('../../src/app/api/v1/visitors/[id]/revoke/route'),
      visitorsMy: await import('../../src/app/api/v1/visitors/my/route'),
      deniedVisitors: await import('../../src/app/api/v1/visitors/denied/route'),
      deniedVisitorDetail: await import('../../src/app/api/v1/visitors/denied/[id]/route'),
      deniedVisitorMatch: await import('../../src/app/api/v1/visitors/denied/match/route'),
      visitorAutoCheckout: await import('../../src/app/api/v1/internal/visitor-auto-checkout/route'),
      residents: await import('../../src/app/api/v1/residents/route'),
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

  it('creates all guest types and sends check-in plus expiry notifications', async () => {
    const kit = requireState();
    const routeModules = requireRoutes();
    const communityA = requireCommunity(kit, 'communityA');
    const tenantA = requireUser(kit, 'tenantA');

    setActor(kit, 'tenantA');

    const oneTimeResponse = await routeModules.visitors.POST(
      jsonRequest(apiUrl('/api/v1/visitors'), 'POST', {
        communityId: communityA.id,
        visitorName: `One Time ${kit.runSuffix}`,
        purpose: 'Dinner',
        hostUnitId: unitAId,
        expectedArrival: '2026-06-15T18:00:00.000Z',
        expectedDurationMinutes: 90,
      }),
    );
    expect(oneTimeResponse.status).toBe(201);
    const oneTimeJson = await parseJson<{ data: Record<string, unknown> }>(oneTimeResponse);
    const oneTimeId = readNumberField(oneTimeJson.data, 'id');
    expect(oneTimeJson.data.guestType).toBe('one_time');
    expect(oneTimeJson.data.expectedDurationMinutes).toBe(90);

    const recurringResponse = await routeModules.visitors.POST(
      jsonRequest(apiUrl('/api/v1/visitors'), 'POST', {
        communityId: communityA.id,
        visitorName: `Recurring ${kit.runSuffix}`,
        purpose: 'Caretaker',
        hostUnitId: unitAId,
        guestType: 'recurring',
        validFrom: '2026-06-10T09:00:00.000Z',
        validUntil: '2026-06-20T17:00:00.000Z',
        recurrenceRule: 'weekdays',
        expectedDurationMinutes: 120,
        vehicleMake: 'Honda',
        vehicleModel: 'Civic',
        vehicleColor: 'Silver',
        vehiclePlate: `REC-${kit.runSuffix}`,
      }),
    );
    expect(recurringResponse.status).toBe(201);
    const recurringJson = await parseJson<{ data: Record<string, unknown> }>(recurringResponse);
    expect(recurringJson.data.guestType).toBe('recurring');
    expect(recurringJson.data.recurrenceRule).toBe('weekdays');
    expect(recurringJson.data.vehiclePlate).toBe(`REC-${kit.runSuffix}`);

    const permanentResponse = await routeModules.visitors.POST(
      jsonRequest(apiUrl('/api/v1/visitors'), 'POST', {
        communityId: communityA.id,
        visitorName: `Permanent ${kit.runSuffix}`,
        purpose: 'Caregiver',
        hostUnitId: unitAId,
        guestType: 'permanent',
        validFrom: '2026-06-01T00:00:00.000Z',
      }),
    );
    expect(permanentResponse.status).toBe(201);
    const permanentJson = await parseJson<{ data: Record<string, unknown> }>(permanentResponse);
    expect(permanentJson.data.guestType).toBe('permanent');
    expect(permanentJson.data.validUntil).toBeNull();

    const vendorResponse = await routeModules.visitors.POST(
      jsonRequest(apiUrl('/api/v1/visitors'), 'POST', {
        communityId: communityA.id,
        visitorName: `Vendor ${kit.runSuffix}`,
        purpose: 'HVAC service',
        hostUnitId: unitAId,
        guestType: 'vendor',
        validFrom: '2026-06-15T08:00:00.000Z',
        validUntil: '2026-06-15T18:00:00.000Z',
        vehicleMake: 'Ford',
        vehicleModel: 'Transit',
        vehicleColor: 'White',
        vehiclePlate: `VEN-${kit.runSuffix}`,
      }),
    );
    expect(vendorResponse.status).toBe(201);
    const vendorJson = await parseJson<{ data: Record<string, unknown> }>(vendorResponse);
    expect(vendorJson.data.guestType).toBe('vendor');
    expect(vendorJson.data.vehicleMake).toBe('Ford');

    setActor(kit, 'actorA');
    const checkInResponse = await routeModules.visitorCheckIn.PATCH(
      jsonRequest(apiUrl(`/api/v1/visitors/${oneTimeId}/checkin`), 'PATCH', {
        communityId: communityA.id,
      }),
      { params: Promise.resolve({ id: String(oneTimeId) }) },
    );
    expect(checkInResponse.status).toBe(200);

    const checkInNotification = getCapturedNotifications().find(
      (entry) =>
        entry.communityId === communityA.id
        && entry.event.type === 'compliance_alert'
        && entry.event.alertTitle === `One Time ${kit.runSuffix} has checked in`
        && typeof entry.recipientFilter === 'object'
        && entry.recipientFilter.type === 'specific_user'
        && entry.recipientFilter.userId === tenantA.id,
    );
    expect(checkInNotification).toBeTruthy();

    clearCapturedNotifications();

    const summary = await processComplianceAlerts(new Date('2026-06-15T12:00:00.000Z'));
    expect(summary.totalExpiringVisitors).toBeGreaterThanOrEqual(1);
    expect(summary.totalExpiryNotifications).toBeGreaterThanOrEqual(1);

    const expiryNotification = getCapturedNotifications().find(
      (entry) =>
        entry.communityId === communityA.id
        && entry.event.type === 'compliance_alert'
        && entry.event.alertTitle === `Recurring ${kit.runSuffix} visitor pass expires soon`
        && typeof entry.recipientFilter === 'object'
        && entry.recipientFilter.type === 'specific_user'
        && entry.recipientFilter.userId === tenantA.id,
    );
    expect(expiryNotification).toBeTruthy();
  });

  it('enforces revocation rules, sends revocation alerts, and rejects revoked or expired check-ins', async () => {
    const kit = requireState();
    const routeModules = requireRoutes();
    const communityA = requireCommunity(kit, 'communityA');
    const tenantA = requireUser(kit, 'tenantA');

    setActor(kit, 'tenantA');
    const selfPassResponse = await routeModules.visitors.POST(
      jsonRequest(apiUrl('/api/v1/visitors'), 'POST', {
        communityId: communityA.id,
        visitorName: `Self Revoke ${kit.runSuffix}`,
        purpose: 'Friend',
        hostUnitId: unitAId,
        expectedArrival: '2026-07-01T18:00:00.000Z',
        expectedDurationMinutes: 60,
      }),
    );
    expect(selfPassResponse.status).toBe(201);
    const selfPassJson = await parseJson<{ data: Record<string, unknown> }>(selfPassResponse);
    const selfPassId = readNumberField(selfPassJson.data, 'id');

    setActor(kit, 'actorA');
    const missingReasonResponse = await routeModules.visitorRevoke.POST(
      jsonRequest(apiUrl(`/api/v1/visitors/${selfPassId}/revoke`), 'POST', {
        communityId: communityA.id,
      }),
      { params: Promise.resolve({ id: String(selfPassId) }) },
    );
    expect(missingReasonResponse.status).toBe(400);

    const revokeResponse = await routeModules.visitorRevoke.POST(
      jsonRequest(apiUrl(`/api/v1/visitors/${selfPassId}/revoke`), 'POST', {
        communityId: communityA.id,
        reason: 'Denied at gate',
      }),
      { params: Promise.resolve({ id: String(selfPassId) }) },
    );
    expect(revokeResponse.status).toBe(200);
    const revokeJson = await parseJson<{ data: Record<string, unknown> }>(revokeResponse);
    expect(revokeJson.data.revokedAt).toBeTruthy();

    const revokeNotification = getCapturedNotifications().find(
      (entry) =>
        entry.communityId === communityA.id
        && entry.event.type === 'compliance_alert'
        && entry.event.alertTitle === `Self Revoke ${kit.runSuffix} visitor pass revoked`
        && typeof entry.recipientFilter === 'object'
        && entry.recipientFilter.type === 'specific_user'
        && entry.recipientFilter.userId === tenantA.id,
    );
    expect(revokeNotification).toBeTruthy();

    const secondRevokeResponse = await routeModules.visitorRevoke.POST(
      jsonRequest(apiUrl(`/api/v1/visitors/${selfPassId}/revoke`), 'POST', {
        communityId: communityA.id,
        reason: 'Duplicate revoke',
      }),
      { params: Promise.resolve({ id: String(selfPassId) }) },
    );
    expect(secondRevokeResponse.status).toBe(200);

    const revokedCheckInResponse = await routeModules.visitorCheckIn.PATCH(
      jsonRequest(apiUrl(`/api/v1/visitors/${selfPassId}/checkin`), 'PATCH', {
        communityId: communityA.id,
      }),
      { params: Promise.resolve({ id: String(selfPassId) }) },
    );
    expect(revokedCheckInResponse.status).toBe(400);

    setActor(kit, 'tenantA');
    const residentPassResponse = await routeModules.visitors.POST(
      jsonRequest(apiUrl('/api/v1/visitors'), 'POST', {
        communityId: communityA.id,
        visitorName: `Resident Toggle ${kit.runSuffix}`,
        purpose: 'Babysitter',
        hostUnitId: unitAId,
        expectedArrival: '2026-07-02T18:00:00.000Z',
        expectedDurationMinutes: 120,
      }),
    );
    expect(residentPassResponse.status).toBe(201);
    const residentPassJson = await parseJson<{ data: Record<string, unknown> }>(residentPassResponse);
    const residentPassId = readNumberField(residentPassJson.data, 'id');

    const residentDisabledResponse = await routeModules.visitorRevoke.POST(
      jsonRequest(apiUrl(`/api/v1/visitors/${residentPassId}/revoke`), 'POST', {
        communityId: communityA.id,
      }),
      { params: Promise.resolve({ id: String(residentPassId) }) },
    );
    expect(residentDisabledResponse.status).toBe(403);

    await mergeCommunitySettings(communityA.id, { allowResidentVisitorRevoke: true });

    const residentEnabledResponse = await routeModules.visitorRevoke.POST(
      jsonRequest(apiUrl(`/api/v1/visitors/${residentPassId}/revoke`), 'POST', {
        communityId: communityA.id,
      }),
      { params: Promise.resolve({ id: String(residentPassId) }) },
    );
    expect(residentEnabledResponse.status).toBe(200);

    const expiredPassResponse = await routeModules.visitors.POST(
      jsonRequest(apiUrl('/api/v1/visitors'), 'POST', {
        communityId: communityA.id,
        visitorName: `Expired ${kit.runSuffix}`,
        purpose: 'Tutor',
        hostUnitId: unitAId,
        guestType: 'recurring',
        validFrom: '2026-02-01T09:00:00.000Z',
        validUntil: '2026-03-01T17:00:00.000Z',
        recurrenceRule: 'weekdays',
        expectedDurationMinutes: 60,
      }),
    );
    expect(expiredPassResponse.status).toBe(201);
    const expiredPassJson = await parseJson<{ data: Record<string, unknown> }>(expiredPassResponse);
    const expiredPassId = readNumberField(expiredPassJson.data, 'id');

    setActor(kit, 'actorA');
    const expiredCheckInResponse = await routeModules.visitorCheckIn.PATCH(
      jsonRequest(apiUrl(`/api/v1/visitors/${expiredPassId}/checkin`), 'PATCH', {
        communityId: communityA.id,
      }),
      { params: Promise.resolve({ id: String(expiredPassId) }) },
    );
    expect(expiredCheckInResponse.status).toBe(400);
  });

  it('manages denied visitors with CRUD, active filtering, and limited match payloads', async () => {
    const kit = requireState();
    const routeModules = requireRoutes();
    const communityA = requireCommunity(kit, 'communityA');

    setActor(kit, 'actorA');

    const inactiveEntryResponse = await routeModules.deniedVisitors.POST(
      jsonRequest(apiUrl('/api/v1/visitors/denied'), 'POST', {
        communityId: communityA.id,
        fullName: `Denied Name ${kit.runSuffix}`,
        reason: 'Prior incident',
        vehiclePlate: `BAD-${kit.runSuffix}`,
        notes: 'Front desk note',
      }),
    );
    expect(inactiveEntryResponse.status).toBe(201);
    const inactiveEntryJson = await parseJson<{ data: Record<string, unknown> }>(inactiveEntryResponse);
    const inactiveEntryId = readNumberField(inactiveEntryJson.data, 'id');

    const activeEntryResponse = await routeModules.deniedVisitors.POST(
      jsonRequest(apiUrl('/api/v1/visitors/denied'), 'POST', {
        communityId: communityA.id,
        fullName: `Match Name ${kit.runSuffix}`,
        reason: 'Trespassed',
        vehiclePlate: `ACT-${kit.runSuffix}`,
      }),
    );
    expect(activeEntryResponse.status).toBe(201);
    const activeEntryJson = await parseJson<{ data: Record<string, unknown> }>(activeEntryResponse);
    const activeEntryId = readNumberField(activeEntryJson.data, 'id');

    const listResponse = await routeModules.deniedVisitors.GET(
      new NextRequest(apiUrl(`/api/v1/visitors/denied?communityId=${communityA.id}&active=true`)),
    );
    expect(listResponse.status).toBe(200);
    const listJson = await parseJson<{ data: Array<Record<string, unknown>> }>(listResponse);
    expect(listJson.data.some((row) => row.id === inactiveEntryId)).toBe(true);
    expect(listJson.data.some((row) => row.id === activeEntryId)).toBe(true);

    const deactivateResponse = await routeModules.deniedVisitorDetail.PATCH(
      jsonRequest(apiUrl(`/api/v1/visitors/denied/${inactiveEntryId}`), 'PATCH', {
        communityId: communityA.id,
        reason: 'Resolved entry',
        isActive: false,
      }),
      { params: Promise.resolve({ id: String(inactiveEntryId) }) },
    );
    expect(deactivateResponse.status).toBe(200);
    const deactivateJson = await parseJson<{ data: Record<string, unknown> }>(deactivateResponse);
    expect(deactivateJson.data.isActive).toBe(false);

    const inactiveMatchResponse = await routeModules.deniedVisitorMatch.GET(
      new NextRequest(
        apiUrl(
          `/api/v1/visitors/denied/match?communityId=${communityA.id}&name=${encodeURIComponent(`Denied Name ${kit.runSuffix}`)}`,
        ),
      ),
    );
    expect(inactiveMatchResponse.status).toBe(200);
    const inactiveMatchJson = await parseJson<{ data: Array<Record<string, unknown>> }>(inactiveMatchResponse);
    expect(inactiveMatchJson.data).toHaveLength(0);

    const activeMatchResponse = await routeModules.deniedVisitorMatch.GET(
      new NextRequest(
        apiUrl(
          `/api/v1/visitors/denied/match?communityId=${communityA.id}&plate=${encodeURIComponent(`ACT-${kit.runSuffix}`)}`,
        ),
      ),
    );
    expect(activeMatchResponse.status).toBe(200);
    const activeMatchJson = await parseJson<{ data: Array<Record<string, unknown>> }>(activeMatchResponse);
    expect(activeMatchJson.data).toHaveLength(1);
    expect(activeMatchJson.data[0]).toEqual({
      id: activeEntryId,
      fullName: `Match Name ${kit.runSuffix}`,
      vehiclePlate: `ACT-${kit.runSuffix}`,
      reason: 'Trespassed',
      isActive: true,
    });

    const deleteResponse = await routeModules.deniedVisitorDetail.DELETE(
      jsonRequest(apiUrl(`/api/v1/visitors/denied/${activeEntryId}`), 'DELETE', {
        communityId: communityA.id,
      }),
      { params: Promise.resolve({ id: String(activeEntryId) }) },
    );
    expect(deleteResponse.status).toBe(200);

    const postDeleteListResponse = await routeModules.deniedVisitors.GET(
      new NextRequest(apiUrl(`/api/v1/visitors/denied?communityId=${communityA.id}&active=false`)),
    );
    expect(postDeleteListResponse.status).toBe(200);
    const postDeleteListJson = await parseJson<{ data: Array<Record<string, unknown>> }>(postDeleteListResponse);
    expect(postDeleteListJson.data.some((row) => row.id === inactiveEntryId)).toBe(true);
    expect(postDeleteListJson.data.some((row) => row.id === activeEntryId)).toBe(false);
  });

  it('auto-checks out overdue visitors through the internal cron query', async () => {
    const kit = requireState();
    const routeModules = requireRoutes();
    const communityA = requireCommunity(kit, 'communityA');

    setActor(kit, 'tenantA');
    const createResponse = await routeModules.visitors.POST(
      jsonRequest(apiUrl('/api/v1/visitors'), 'POST', {
        communityId: communityA.id,
        visitorName: `Auto Checkout ${kit.runSuffix}`,
        purpose: 'Food delivery',
        hostUnitId: unitAId,
        expectedArrival: '2026-08-01T18:00:00.000Z',
        expectedDurationMinutes: 15,
      }),
    );
    expect(createResponse.status).toBe(201);
    const createJson = await parseJson<{ data: Record<string, unknown> }>(createResponse);
    const visitorId = readNumberField(createJson.data, 'id');

    setActor(kit, 'actorA');
    const checkInResponse = await routeModules.visitorCheckIn.PATCH(
      jsonRequest(apiUrl(`/api/v1/visitors/${visitorId}/checkin`), 'PATCH', {
        communityId: communityA.id,
      }),
      { params: Promise.resolve({ id: String(visitorId) }) },
    );
    expect(checkInResponse.status).toBe(200);

    const scoped = kit.dbModule.createScopedClient(communityA.id);
    const staleCheckInTime = new Date(Date.now() - 45 * 60 * 1000);
    await scoped.update(
      kit.dbModule.visitorLog,
      {
        checkedInAt: staleCheckInTime,
        updatedAt: staleCheckInTime,
      },
      eq(kit.dbModule.visitorLog.id, visitorId),
    );

    process.env.VISITOR_AUTO_CHECKOUT_CRON_SECRET = 'visitor-auto-secret';
    const cronResponse = await routeModules.visitorAutoCheckout.POST(
      new NextRequest(apiUrl('/api/v1/internal/visitor-auto-checkout'), {
        method: 'POST',
        headers: {
          authorization: 'Bearer visitor-auto-secret',
        },
      }),
    );
    expect(cronResponse.status).toBe(200);
    const cronJson = await parseJson<{ data: { autoCheckedOut: number; errors: string[] } }>(cronResponse);
    expect(cronJson.data.autoCheckedOut).toBeGreaterThanOrEqual(1);
    expect(cronJson.data.errors).toEqual([]);

    const visitorRow = await loadVisitorRow(communityA.id, visitorId);
    expect(visitorRow.checkedOutAt).toBeTruthy();
  });

  it('cascade-revokes recurring and permanent passes when a resident is removed', async () => {
    const kit = requireState();
    const routeModules = requireRoutes();
    const communityA = requireCommunity(kit, 'communityA');
    const runtimeResident = await seedRuntimeResident(communityA.id, 'cascade-resident');

    setActorById(kit, runtimeResident.userId);
    const recurringResponse = await routeModules.visitors.POST(
      jsonRequest(apiUrl('/api/v1/visitors'), 'POST', {
        communityId: communityA.id,
        visitorName: `Cascade Recurring ${kit.runSuffix}`,
        purpose: 'Care aide',
        hostUnitId: runtimeResident.unitId,
        guestType: 'recurring',
        validFrom: '2026-09-01T09:00:00.000Z',
        validUntil: '2026-09-30T17:00:00.000Z',
        recurrenceRule: 'weekdays',
        expectedDurationMinutes: 60,
      }),
    );
    expect(recurringResponse.status).toBe(201);
    const recurringJson = await parseJson<{ data: Record<string, unknown> }>(recurringResponse);
    const recurringId = readNumberField(recurringJson.data, 'id');

    const permanentResponse = await routeModules.visitors.POST(
      jsonRequest(apiUrl('/api/v1/visitors'), 'POST', {
        communityId: communityA.id,
        visitorName: `Cascade Permanent ${kit.runSuffix}`,
        purpose: 'Live-in aide',
        hostUnitId: runtimeResident.unitId,
        guestType: 'permanent',
        validFrom: '2026-09-01T00:00:00.000Z',
      }),
    );
    expect(permanentResponse.status).toBe(201);
    const permanentJson = await parseJson<{ data: Record<string, unknown> }>(permanentResponse);
    const permanentId = readNumberField(permanentJson.data, 'id');

    setActor(kit, 'actorA');
    const deleteResponse = await routeModules.residents.DELETE(
      jsonRequest(apiUrl('/api/v1/residents'), 'DELETE', {
        communityId: communityA.id,
        userId: runtimeResident.userId,
      }),
    );
    expect(deleteResponse.status).toBe(200);

    const recurringRow = await loadVisitorRow(communityA.id, recurringId);
    expect(recurringRow.revokedAt).toBeTruthy();
    expect(recurringRow.revokedByUserId).toBeNull();

    const permanentRow = await loadVisitorRow(communityA.id, permanentId);
    expect(permanentRow.revokedAt).toBeTruthy();
    expect(permanentRow.revokedByUserId).toBeNull();
  });

  it('derives overstayed status and keeps GET /visitors/my backward compatible by default', async () => {
    const kit = requireState();
    const routeModules = requireRoutes();
    const communityA = requireCommunity(kit, 'communityA');

    setActor(kit, 'tenantA');
    const overstayedCreateResponse = await routeModules.visitors.POST(
      jsonRequest(apiUrl('/api/v1/visitors'), 'POST', {
        communityId: communityA.id,
        visitorName: `Overstayed ${kit.runSuffix}`,
        purpose: 'Physical therapy',
        hostUnitId: unitAId,
        guestType: 'recurring',
        validFrom: '2026-10-01T09:00:00.000Z',
        validUntil: '2026-12-31T17:00:00.000Z',
        recurrenceRule: 'weekdays',
        expectedDurationMinutes: 60,
      }),
    );
    expect(overstayedCreateResponse.status).toBe(201);
    const overstayedCreateJson = await parseJson<{ data: Record<string, unknown> }>(overstayedCreateResponse);
    const overstayedId = readNumberField(overstayedCreateJson.data, 'id');

    setActor(kit, 'actorA');
    const overstayedCheckInResponse = await routeModules.visitorCheckIn.PATCH(
      jsonRequest(apiUrl(`/api/v1/visitors/${overstayedId}/checkin`), 'PATCH', {
        communityId: communityA.id,
      }),
      { params: Promise.resolve({ id: String(overstayedId) }) },
    );
    expect(overstayedCheckInResponse.status).toBe(200);

    const scoped = kit.dbModule.createScopedClient(communityA.id);
    const pastUntil = new Date('2026-01-01T17:00:00.000Z');
    await scoped.update(
      kit.dbModule.visitorLog,
      {
        validUntil: pastUntil,
        updatedAt: new Date(),
      },
      eq(kit.dbModule.visitorLog.id, overstayedId),
    );

    const overstayedRow = await loadVisitorRow(communityA.id, overstayedId);
    expect(
      deriveVisitorStatus({
        checkedInAt: overstayedRow.checkedInAt as Date | null,
        checkedOutAt: overstayedRow.checkedOutAt as Date | null,
        validUntil: overstayedRow.validUntil as Date | null,
        revokedAt: overstayedRow.revokedAt as Date | null,
      }),
    ).toBe('overstayed');

    const overstayedCheckOutResponse = await routeModules.visitorCheckOut.PATCH(
      jsonRequest(apiUrl(`/api/v1/visitors/${overstayedId}/checkout`), 'PATCH', {
        communityId: communityA.id,
      }),
      { params: Promise.resolve({ id: String(overstayedId) }) },
    );
    expect(overstayedCheckOutResponse.status).toBe(200);

    setActor(kit, 'tenantA');
    const activeResponse = await routeModules.visitors.POST(
      jsonRequest(apiUrl('/api/v1/visitors'), 'POST', {
        communityId: communityA.id,
        visitorName: `Default Active ${kit.runSuffix}`,
        purpose: 'Neighbor visit',
        hostUnitId: unitAId,
        expectedArrival: '2026-11-01T18:00:00.000Z',
        expectedDurationMinutes: 45,
      }),
    );
    expect(activeResponse.status).toBe(201);
    const activeJson = await parseJson<{ data: Record<string, unknown> }>(activeResponse);
    const activeId = readNumberField(activeJson.data, 'id');

    const checkedOutResponse = await routeModules.visitors.POST(
      jsonRequest(apiUrl('/api/v1/visitors'), 'POST', {
        communityId: communityA.id,
        visitorName: `Default Past ${kit.runSuffix}`,
        purpose: 'Pet sitter',
        hostUnitId: unitAId,
        expectedArrival: '2026-11-01T12:00:00.000Z',
        expectedDurationMinutes: 30,
      }),
    );
    expect(checkedOutResponse.status).toBe(201);
    const checkedOutJson = await parseJson<{ data: Record<string, unknown> }>(checkedOutResponse);
    const checkedOutId = readNumberField(checkedOutJson.data, 'id');

    setActor(kit, 'actorA');
    const checkedOutCheckIn = await routeModules.visitorCheckIn.PATCH(
      jsonRequest(apiUrl(`/api/v1/visitors/${checkedOutId}/checkin`), 'PATCH', {
        communityId: communityA.id,
      }),
      { params: Promise.resolve({ id: String(checkedOutId) }) },
    );
    expect(checkedOutCheckIn.status).toBe(200);

    const checkedOutCheckOut = await routeModules.visitorCheckOut.PATCH(
      jsonRequest(apiUrl(`/api/v1/visitors/${checkedOutId}/checkout`), 'PATCH', {
        communityId: communityA.id,
      }),
      { params: Promise.resolve({ id: String(checkedOutId) }) },
    );
    expect(checkedOutCheckOut.status).toBe(200);

    setActor(kit, 'tenantA');
    const myVisitorsResponse = await routeModules.visitorsMy.GET(
      new NextRequest(apiUrl(`/api/v1/visitors/my?communityId=${communityA.id}`)),
    );
    expect(myVisitorsResponse.status).toBe(200);
    const myVisitorsJson = await parseJson<{ data: Array<Record<string, unknown>> }>(myVisitorsResponse);

    expect(myVisitorsJson.data.some((row) => row.id === activeId)).toBe(true);
    expect(myVisitorsJson.data.some((row) => row.id === checkedOutId)).toBe(false);
  });
});
