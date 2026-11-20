import { randomUUID } from 'node:crypto';
import { NextRequest } from 'next/server';
import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest';
import { eq } from '@propertypro/db/filters';
import { deriveVisitorStatus, type VisitorStatus } from '../../src/lib/visitors/visitor-logic';
import { listVisitorsForCommunity } from '../../src/lib/services/package-visitor-service';
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
  unitLabel: string;
}

let state: TestKitState | null = null;
let routes: RouteModules | null = null;
let unitAId = 0;
let unitALabel = '';

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

const DAY_MS = 24 * 60 * 60 * 1000;

async function checkIn(communityId: number, visitorId: number): Promise<Response> {
  return requireRoutes().visitorCheckIn.PATCH(
    jsonRequest(apiUrl(`/api/v1/visitors/${visitorId}/checkin`), 'PATCH', { communityId }),
    { params: Promise.resolve({ id: String(visitorId) }) },
  );
}

async function checkOut(communityId: number, visitorId: number): Promise<Response> {
  return requireRoutes().visitorCheckOut.PATCH(
    jsonRequest(apiUrl(`/api/v1/visitors/${visitorId}/checkout`), 'PATCH', { communityId }),
    { params: Promise.resolve({ id: String(visitorId) }) },
  );
}

async function createPass(
  communityId: number,
  body: Record<string, unknown>,
): Promise<number> {
  const response = await requireRoutes().visitors.POST(
    jsonRequest(apiUrl('/api/v1/visitors'), 'POST', {
      communityId,
      purpose: 'Visit',
      hostUnitLabel: unitALabel,
      ...body,
    }),
  );
  expect(response.status).toBe(200);
  const json = await parseJson<{ data: Record<string, unknown> }>(response);
  return readNumberField(json.data, 'id');
}

function statusOf(row: Record<string, unknown>): VisitorStatus {
  return deriveVisitorStatus({
    guestType: row.guestType as string,
    checkedInAt: row.checkedInAt as Date | null,
    checkedOutAt: row.checkedOutAt as Date | null,
    validUntil: row.validUntil as Date | null,
    revokedAt: row.revokedAt as Date | null,
  });
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
  const unitLabel = `${label.toUpperCase().slice(0, 6)}-${kit.runSuffix}`;
  const [unitRow] = await scoped.insert(kit.dbModule.units, {
    unitNumber: unitLabel,
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

  return { userId, unitId, unitLabel };
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

    unitALabel = `VIS-A-${state.runSuffix}`;
    const [unitA] = await scoped.insert(state.dbModule.units, {
      unitNumber: unitALabel,
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
        hostUnitLabel: unitALabel,
        expectedArrival: '2026-06-15T18:00:00.000Z',
        expectedDurationMinutes: 90,
      }),
    );
    expect(oneTimeResponse.status).toBe(200);
    const oneTimeJson = await parseJson<{ data: Record<string, unknown> }>(oneTimeResponse);
    const oneTimeId = readNumberField(oneTimeJson.data, 'id');
    expect(oneTimeJson.data.guestType).toBe('one_time');
    expect(oneTimeJson.data.expectedDurationMinutes).toBe(90);

    const recurringResponse = await routeModules.visitors.POST(
      jsonRequest(apiUrl('/api/v1/visitors'), 'POST', {
        communityId: communityA.id,
        visitorName: `Recurring ${kit.runSuffix}`,
        purpose: 'Caretaker',
        hostUnitLabel: unitALabel,
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
    expect(recurringResponse.status).toBe(200);
    const recurringJson = await parseJson<{ data: Record<string, unknown> }>(recurringResponse);
    expect(recurringJson.data.guestType).toBe('recurring');
    expect(recurringJson.data.recurrenceRule).toBe('weekdays');
    expect(recurringJson.data.vehiclePlate).toBe(`REC-${kit.runSuffix}`);

    const permanentResponse = await routeModules.visitors.POST(
      jsonRequest(apiUrl('/api/v1/visitors'), 'POST', {
        communityId: communityA.id,
        visitorName: `Permanent ${kit.runSuffix}`,
        purpose: 'Caregiver',
        hostUnitLabel: unitALabel,
        guestType: 'permanent',
        validFrom: '2026-06-01T00:00:00.000Z',
      }),
    );
    expect(permanentResponse.status).toBe(200);
    const permanentJson = await parseJson<{ data: Record<string, unknown> }>(permanentResponse);
    expect(permanentJson.data.guestType).toBe('permanent');
    expect(permanentJson.data.validUntil).toBeNull();

    const vendorResponse = await routeModules.visitors.POST(
      jsonRequest(apiUrl('/api/v1/visitors'), 'POST', {
        communityId: communityA.id,
        visitorName: `Vendor ${kit.runSuffix}`,
        purpose: 'HVAC service',
        hostUnitLabel: unitALabel,
        guestType: 'vendor',
        validFrom: '2026-06-15T08:00:00.000Z',
        validUntil: '2026-06-15T18:00:00.000Z',
        vehicleMake: 'Ford',
        vehicleModel: 'Transit',
        vehicleColor: 'White',
        vehiclePlate: `VEN-${kit.runSuffix}`,
      }),
    );
    expect(vendorResponse.status).toBe(200);
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
        && entry.event.type === 'resident_notice'
        && entry.event.title === `One Time ${kit.runSuffix} has checked in`
        && typeof entry.recipientFilter === 'object'
        && entry.recipientFilter.type === 'specific_user'
        && entry.recipientFilter.userId === tenantA.id,
    );
    expect(checkInNotification).toBeTruthy();

    clearCapturedNotifications();

    const summary = await processComplianceAlerts(new Date('2026-06-15T12:00:00.000Z'), {
      communityIds: [communityA.id],
    });
    expect(summary.totalExpiringVisitors).toBeGreaterThanOrEqual(1);
    expect(summary.totalExpiryNotifications).toBeGreaterThanOrEqual(1);

    const expiryNotification = getCapturedNotifications().find(
      (entry) =>
        entry.communityId === communityA.id
        && entry.event.type === 'resident_notice'
        && entry.event.title === `Recurring ${kit.runSuffix} visitor pass expires soon`
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
        hostUnitLabel: unitALabel,
        expectedArrival: '2026-07-01T18:00:00.000Z',
        expectedDurationMinutes: 60,
      }),
    );
    expect(selfPassResponse.status).toBe(200);
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
        && entry.event.type === 'resident_notice'
        && entry.event.title === `Self Revoke ${kit.runSuffix} visitor pass revoked`
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
        hostUnitLabel: unitALabel,
        expectedArrival: '2026-07-02T18:00:00.000Z',
        expectedDurationMinutes: 120,
      }),
    );
    expect(residentPassResponse.status).toBe(200);
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
        hostUnitLabel: unitALabel,
        guestType: 'recurring',
        validFrom: '2026-02-01T09:00:00.000Z',
        validUntil: '2026-03-01T17:00:00.000Z',
        recurrenceRule: 'weekdays',
        expectedDurationMinutes: 60,
      }),
    );
    expect(expiredPassResponse.status).toBe(200);
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
    expect(inactiveEntryResponse.status).toBe(200);
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
    expect(activeEntryResponse.status).toBe(200);
    const activeEntryJson = await parseJson<{ data: Record<string, unknown> }>(activeEntryResponse);
    const activeEntryId = readNumberField(activeEntryJson.data, 'id');

    const listResponse = await routeModules.deniedVisitors.GET(
      new NextRequest(apiUrl(`/api/v1/visitors/denied?communityId=${communityA.id}&active=true`)),
    );
    expect(listResponse.status).toBe(200);
    // Plan B3: /api/v1/visitors/denied now returns the canonical double-wrapped
    // paginated envelope `{ data: { data, pagination } }`.
    const listJson = await parseJson<{
      data: { data: Array<Record<string, unknown>>; pagination: unknown };
    }>(listResponse);
    expect(listJson.data.data.some((row) => row.id === inactiveEntryId)).toBe(true);
    expect(listJson.data.data.some((row) => row.id === activeEntryId)).toBe(true);

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
    const postDeleteListJson = await parseJson<{
      data: { data: Array<Record<string, unknown>>; pagination: unknown };
    }>(postDeleteListResponse);
    expect(postDeleteListJson.data.data.some((row) => row.id === inactiveEntryId)).toBe(true);
    expect(postDeleteListJson.data.data.some((row) => row.id === activeEntryId)).toBe(false);
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
        hostUnitLabel: unitALabel,
        expectedArrival: '2026-08-01T18:00:00.000Z',
        expectedDurationMinutes: 15,
      }),
    );
    expect(createResponse.status).toBe(200);
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
        hostUnitLabel: runtimeResident.unitLabel,
        guestType: 'recurring',
        validFrom: '2026-09-01T09:00:00.000Z',
        validUntil: '2026-09-30T17:00:00.000Z',
        recurrenceRule: 'weekdays',
        expectedDurationMinutes: 60,
      }),
    );
    expect(recurringResponse.status).toBe(200);
    const recurringJson = await parseJson<{ data: Record<string, unknown> }>(recurringResponse);
    const recurringId = readNumberField(recurringJson.data, 'id');

    const permanentResponse = await routeModules.visitors.POST(
      jsonRequest(apiUrl('/api/v1/visitors'), 'POST', {
        communityId: communityA.id,
        visitorName: `Cascade Permanent ${kit.runSuffix}`,
        purpose: 'Live-in aide',
        hostUnitLabel: runtimeResident.unitLabel,
        guestType: 'permanent',
        validFrom: '2026-09-01T00:00:00.000Z',
      }),
    );
    expect(permanentResponse.status).toBe(200);
    const permanentJson = await parseJson<{ data: Record<string, unknown> }>(permanentResponse);
    const permanentId = readNumberField(permanentJson.data, 'id');

    const vendorResponse = await routeModules.visitors.POST(
      jsonRequest(apiUrl('/api/v1/visitors'), 'POST', {
        communityId: communityA.id,
        visitorName: `Cascade Vendor ${kit.runSuffix}`,
        purpose: 'Renovation crew',
        hostUnitLabel: runtimeResident.unitLabel,
        guestType: 'vendor',
        validFrom: new Date(Date.now() - DAY_MS).toISOString(),
        validUntil: new Date(Date.now() + 7 * DAY_MS).toISOString(),
      }),
    );
    expect(vendorResponse.status).toBe(200);
    const vendorJson = await parseJson<{ data: Record<string, unknown> }>(vendorResponse);
    const vendorId = readNumberField(vendorJson.data, 'id');

    setActor(kit, 'actorA');
    // A used multi-use pass is still a live credential, so it must be revoked too.
    expect((await checkIn(communityA.id, permanentId)).status).toBe(200);
    expect((await checkOut(communityA.id, permanentId)).status).toBe(200);

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
    expect(permanentRow.checkedOutAt).toBeTruthy();
    expect(permanentRow.revokedAt).toBeTruthy();
    expect(permanentRow.revokedByUserId).toBeNull();

    const vendorRow = await loadVisitorRow(communityA.id, vendorId);
    expect(vendorRow.revokedAt).toBeTruthy();
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
        hostUnitLabel: unitALabel,
        guestType: 'recurring',
        validFrom: '2026-10-01T09:00:00.000Z',
        validUntil: '2026-12-31T17:00:00.000Z',
        // `custom` is not day-checked, so this check-in passes on any day the suite runs.
        recurrenceRule: 'custom',
        expectedDurationMinutes: 60,
      }),
    );
    expect(overstayedCreateResponse.status).toBe(200);
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
        guestType: overstayedRow.guestType as string,
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
        hostUnitLabel: unitALabel,
        expectedArrival: '2026-11-01T18:00:00.000Z',
        expectedDurationMinutes: 45,
      }),
    );
    expect(activeResponse.status).toBe(200);
    const activeJson = await parseJson<{ data: Record<string, unknown> }>(activeResponse);
    const activeId = readNumberField(activeJson.data, 'id');

    const checkedOutResponse = await routeModules.visitors.POST(
      jsonRequest(apiUrl('/api/v1/visitors'), 'POST', {
        communityId: communityA.id,
        visitorName: `Default Past ${kit.runSuffix}`,
        purpose: 'Pet sitter',
        hostUnitLabel: unitALabel,
        expectedArrival: '2026-11-01T12:00:00.000Z',
        expectedDurationMinutes: 30,
      }),
    );
    expect(checkedOutResponse.status).toBe(200);
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

  it('lets a multi-use pass check in again after each visit, and keeps one-time passes final', async () => {
    const kit = requireState();
    const communityA = requireCommunity(kit, 'communityA');
    const name = `Reentry Permanent ${kit.runSuffix}`;

    setActor(kit, 'tenantA');
    const permanentId = await createPass(communityA.id, {
      visitorName: name,
      guestType: 'permanent',
      validFrom: new Date(Date.now() - DAY_MS).toISOString(),
    });
    const oneTimeId = await createPass(communityA.id, {
      visitorName: `Reentry One Time ${kit.runSuffix}`,
      expectedArrival: new Date().toISOString(),
      expectedDurationMinutes: 60,
    });

    setActor(kit, 'actorA');
    clearCapturedNotifications();
    for (const id of [permanentId, oneTimeId]) {
      expect((await checkIn(communityA.id, id)).status).toBe(200);
      expect((await checkOut(communityA.id, id)).status).toBe(200);
    }
    expect(statusOf(await loadVisitorRow(communityA.id, permanentId))).toBe('expected');

    // Between visits the resident still has the pass (and its QR) in their list.
    setActor(kit, 'tenantA');
    const myResponse = await requireRoutes().visitorsMy.GET(
      new NextRequest(apiUrl(`/api/v1/visitors/my?communityId=${communityA.id}`)),
    );
    const myJson = await parseJson<{ data: Array<Record<string, unknown>> }>(myResponse);
    expect(myJson.data.some((row) => row.id === permanentId)).toBe(true);
    expect(myJson.data.some((row) => row.id === oneTimeId)).toBe(false);

    setActor(kit, 'actorA');
    expect((await checkIn(communityA.id, permanentId)).status).toBe(200);
    const reentered = await loadVisitorRow(communityA.id, permanentId);
    expect(reentered.checkedOutAt).toBeNull();
    expect(statusOf(reentered)).toBe('checked_in');

    expect((await checkIn(communityA.id, oneTimeId)).status).toBe(200);
    const oneTime = await loadVisitorRow(communityA.id, oneTimeId);
    expect(oneTime.checkedOutAt).toBeTruthy();
    expect(statusOf(oneTime)).toBe('checked_out');

    // The host hears about both visits: one digest key per visit, not per pass.
    const notices = getCapturedNotifications().filter(
      (entry) => entry.event.type === 'resident_notice' && entry.event.title === `${name} has checked in`,
    );
    expect(notices).toHaveLength(2);
    expect(new Set(notices.map((entry) => (entry.event as { sourceId?: string }).sourceId)).size).toBe(2);
  });

  it('refuses check-in before a pass starts and on a day its schedule leaves out', async () => {
    const kit = requireState();
    const communityA = requireCommunity(kit, 'communityA');
    const timeZone = MULTI_TENANT_COMMUNITIES.find((c) => c.key === 'communityA')!.timezone;
    const today = new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'short' }).format(new Date());
    const ruleExcludingToday = ['Sat', 'Sun'].includes(today) ? 'weekdays' : 'weekends';

    setActor(kit, 'tenantA');
    const futureId = await createPass(communityA.id, {
      visitorName: `Not Yet Valid ${kit.runSuffix}`,
      guestType: 'permanent',
      validFrom: new Date(Date.now() + 2 * DAY_MS).toISOString(),
    });
    const offDayId = await createPass(communityA.id, {
      visitorName: `Off Day ${kit.runSuffix}`,
      guestType: 'recurring',
      validFrom: new Date(Date.now() - DAY_MS).toISOString(),
      validUntil: new Date(Date.now() + 30 * DAY_MS).toISOString(),
      recurrenceRule: ruleExcludingToday,
      expectedDurationMinutes: 60,
    });

    setActor(kit, 'actorA');
    const futureResponse = await checkIn(communityA.id, futureId);
    expect(futureResponse.status).toBe(400);
    expect(JSON.stringify(await futureResponse.json())).toContain('This visitor pass starts on');

    const offDayResponse = await checkIn(communityA.id, offDayId);
    expect(offDayResponse.status).toBe(400);
    expect(JSON.stringify(await offDayResponse.json())).toContain(`valid on ${ruleExcludingToday} only`);

    expect((await loadVisitorRow(communityA.id, futureId)).checkedInAt).toBeNull();
    expect((await loadVisitorRow(communityA.id, offDayId)).checkedInAt).toBeNull();
  });

  it('returns a recurring pass to expected after the auto-checkout cron closes its visit', async () => {
    const kit = requireState();
    const routeModules = requireRoutes();
    const communityA = requireCommunity(kit, 'communityA');

    setActor(kit, 'tenantA');
    const visitorId = await createPass(communityA.id, {
      visitorName: `Cron Recurring ${kit.runSuffix}`,
      guestType: 'recurring',
      validFrom: new Date(Date.now() - DAY_MS).toISOString(),
      validUntil: new Date(Date.now() + 30 * DAY_MS).toISOString(),
      recurrenceRule: 'custom',
      expectedDurationMinutes: 15,
    });

    setActor(kit, 'actorA');
    expect((await checkIn(communityA.id, visitorId)).status).toBe(200);
    const stale = new Date(Date.now() - 45 * 60 * 1000);
    await kit.dbModule.createScopedClient(communityA.id).update(
      kit.dbModule.visitorLog,
      { checkedInAt: stale, updatedAt: stale },
      eq(kit.dbModule.visitorLog.id, visitorId),
    );

    process.env.VISITOR_AUTO_CHECKOUT_CRON_SECRET = 'visitor-auto-secret';
    const cronResponse = await routeModules.visitorAutoCheckout.POST(
      new NextRequest(apiUrl('/api/v1/internal/visitor-auto-checkout'), {
        method: 'POST',
        headers: { authorization: 'Bearer visitor-auto-secret' },
      }),
    );
    expect(cronResponse.status).toBe(200);

    const closed = await loadVisitorRow(communityA.id, visitorId);
    expect(closed.checkedOutAt).toBeTruthy();
    expect(statusOf(closed)).toBe('expected');

    expect((await checkIn(communityA.id, visitorId)).status).toBe(200);
    expect(statusOf(await loadVisitorRow(communityA.id, visitorId))).toBe('checked_in');
  });

  it('filters by status in SQL exactly as deriveVisitorStatus classifies each pass', async () => {
    const kit = requireState();
    const communityA = requireCommunity(kit, 'communityA');
    const resident = await seedRuntimeResident(communityA.id, 'parity-resident');
    const scoped = kit.dbModule.createScopedClient(communityA.id);

    const hour = 60 * 60 * 1000;
    const past = new Date(Date.now() - DAY_MS);
    const future = new Date(Date.now() + DAY_MS);
    const inAt = new Date(Date.now() - 2 * hour);
    const outAt = new Date(Date.now() - hour);
    const shapes: Array<Record<string, Date | null>> = [
      {},
      { checkedInAt: inAt },
      { checkedInAt: inAt, validUntil: past },
      { checkedInAt: inAt, checkedOutAt: outAt },
      { checkedInAt: inAt, checkedOutAt: outAt, validUntil: future },
      { validUntil: past },
      { checkedInAt: inAt, checkedOutAt: outAt, validUntil: past },
      { revokedAt: outAt },
      { checkedInAt: inAt, revokedAt: outAt },
      { checkedInAt: inAt, checkedOutAt: outAt, revokedAt: outAt },
      { checkedOutAt: outAt },
    ];
    const ids: number[] = [];
    for (const guestType of ['one_time', 'recurring', 'permanent', 'vendor']) {
      for (const shape of shapes) {
        const [row] = await scoped.insert(kit.dbModule.visitorLog, {
          visitorName: `Parity ${guestType} ${ids.length}`,
          purpose: 'Parity',
          hostUnitId: resident.unitId,
          expectedArrival: past,
          passCode: `P-${kit.runSuffix}-${ids.length}`,
          guestType,
          ...shape,
        });
        ids.push(readNumberField(row as Record<string, unknown>, 'id'));
      }
    }

    const all = await listVisitorsForCommunity(communityA.id, { hostUnitId: resident.unitId });
    expect(all).toHaveLength(ids.length);
    const statuses: VisitorStatus[] = [
      'expected', 'checked_in', 'checked_out', 'expired', 'overstayed', 'revoked', 'revoked_on_site',
    ];
    let matched = 0;
    for (const status of statuses) {
      const fromSql = await listVisitorsForCommunity(communityA.id, { hostUnitId: resident.unitId, status });
      const derived = all.filter((row) => statusOf(row) === status).map((row) => row.id).sort();
      expect({ status, ids: fromSql.map((row) => row.id).sort() }).toEqual({ status, ids: derived });
      matched += fromSql.length;
    }
    // Every pass falls in exactly one status.
    expect(matched).toBe(ids.length);
  });
});
