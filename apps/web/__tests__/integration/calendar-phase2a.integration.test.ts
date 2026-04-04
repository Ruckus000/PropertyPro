import { randomUUID } from 'node:crypto';
import { NextRequest } from 'next/server';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { getPresetPermissions } from '@propertypro/shared';
import { MULTI_TENANT_COMMUNITIES } from '../fixtures/multi-tenant-communities';
import { MULTI_TENANT_USERS, type MultiTenantUserKey } from '../fixtures/multi-tenant-users';
import {
  apiUrl,
  getDescribeDb,
  initTestKit,
  jsonRequest,
  parseJson,
  requireCommunity,
  requireCurrentActor,
  requireDatabaseUrlInCI,
  seedCommunities,
  seedUsers,
  setActor,
  setActorById,
  teardownTestKit,
  trackUserForCleanup,
  type TestKitState,
} from './helpers/multi-tenant-test-kit';

requireDatabaseUrlInCI('Phase 2A calendar integration tests');

const describeDb = getDescribeDb();

const { requireAuthenticatedUserIdMock } = vi.hoisted(() => ({
  requireAuthenticatedUserIdMock: vi.fn(),
}));

vi.mock('@/lib/api/auth', () => ({
  requireAuthenticatedUserId: requireAuthenticatedUserIdMock,
}));

vi.mock('@/lib/services/notification-service', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/services/notification-service')>();
  return {
    ...actual,
    queueNotification: vi.fn().mockResolvedValue(1),
    queueNotificationDetailed: vi.fn().mockResolvedValue({
      recipientsCount: 1,
      sentCount: 1,
      queuedCount: 0,
      failedCount: 0,
    }),
    createNotificationsForEvent: vi.fn().mockResolvedValue({
      created: 1,
      skipped: 0,
    }),
  };
});

type MeetingsRouteModule = typeof import('../../src/app/api/v1/meetings/route');
type MeetingDetailRouteModule = typeof import('../../src/app/api/v1/meetings/[id]/route');
type CalendarEventsRouteModule = typeof import('../../src/app/api/v1/calendar/events/route');
type CalendarPublicRouteModule = typeof import('../../src/app/api/v1/calendar/meetings.ics/route');
type CalendarMyRouteModule = typeof import('../../src/app/api/v1/calendar/my-meetings.ics/route');

interface RouteModules {
  meetings: MeetingsRouteModule;
  meetingDetail: MeetingDetailRouteModule;
  calendarEvents: CalendarEventsRouteModule;
  calendarPublic: CalendarPublicRouteModule;
  calendarMy: CalendarMyRouteModule;
}

let state: TestKitState | null = null;
let routes: RouteModules | null = null;
let ownerResidentUserId = '';
let ownerUnitId = 0;
let ownerUnitLabel = '';
let noFinanceManagerUserId = '';
let inRangeMeetingId = 0;
let outOfRangeMeetingId = 0;
let apartmentMeetingId = 0;
let assessmentTitle = '';
let settledAssessmentTitle = '';

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

async function seedRuntimeResidentOwner(testState: TestKitState, communityId: number) {
  const userId = randomUUID();
  trackUserForCleanup(testState, userId);

  await testState.db.insert(testState.dbModule.users).values({
    id: userId,
    email: `owner-${testState.runSuffix}@example.com`,
    fullName: `Owner ${testState.runSuffix}`,
    phone: null,
  });

  const scoped = testState.dbModule.createScopedClient(communityId);
  const [unitRow] = await scoped.insert(testState.dbModule.units, {
    unitNumber: `101-${testState.runSuffix}`,
    ownerUserId: userId,
  });
  ownerUnitId = Number(unitRow?.id);
  ownerUnitLabel = `101-${testState.runSuffix}`;

  await scoped.insert(testState.dbModule.userRoles, {
    userId,
    role: 'resident',
    isUnitOwner: true,
    unitId: ownerUnitId,
    displayTitle: 'Owner',
  });

  ownerResidentUserId = userId;
}

async function seedRuntimeNoFinanceManager(testState: TestKitState, communityId: number) {
  const userId = randomUUID();
  trackUserForCleanup(testState, userId);

  await testState.db.insert(testState.dbModule.users).values({
    id: userId,
    email: `manager-no-finance-${testState.runSuffix}@example.com`,
    fullName: `Manager No Finance ${testState.runSuffix}`,
    phone: null,
  });

  const permissions = structuredClone(getPresetPermissions('board_member', 'condo_718'));
  permissions.resources.finances = { read: false, write: false };
  permissions.resources.meetings = { read: true, write: true };

  const scoped = testState.dbModule.createScopedClient(communityId);
  await scoped.insert(testState.dbModule.userRoles, {
    userId,
    role: 'manager',
    isUnitOwner: false,
    displayTitle: 'Manager No Finance',
    permissions,
  });

  noFinanceManagerUserId = userId;
}

describeDb('Phase 2A calendar stack (db-backed integration)', () => {
  beforeAll(async () => {
    if (!process.env.DATABASE_URL) {
      return;
    }

    state = await initTestKit();
    await seedCommunities(state, MULTI_TENANT_COMMUNITIES);

    const neededUsers: MultiTenantUserKey[] = [
      'actorA',
      'tenantA',
      'actorC',
      'tenantC',
      'siteManagerC',
    ];
    await seedUsers(
      state,
      MULTI_TENANT_USERS.filter((fixture) => neededUsers.includes(fixture.key)),
    );

    const communityA = requireCommunity(state, 'communityA');
    const communityC = requireCommunity(state, 'communityC');

    await seedRuntimeResidentOwner(state, communityA.id);
    await seedRuntimeNoFinanceManager(state, communityA.id);

    const scopedA = state.dbModule.createScopedClient(communityA.id);
    const scopedC = state.dbModule.createScopedClient(communityC.id);

    const [otherUnitRow] = await scopedA.insert(state.dbModule.units, {
      unitNumber: `102-${state.runSuffix}`,
    });

    assessmentTitle = `Spring Assessment ${state.runSuffix}`;
    const [assessmentRow] = await scopedA.insert(state.dbModule.assessments, {
      title: assessmentTitle,
      amountCents: 12500,
      frequency: 'one_time',
      startDate: '2026-04-01',
      isActive: true,
    });

    await scopedA.insert(state.dbModule.assessmentLineItems, [
      {
        assessmentId: Number(assessmentRow?.id),
        unitId: ownerUnitId,
        amountCents: 12500,
        dueDate: '2026-04-10',
        status: 'pending',
        lateFeeCents: 0,
      },
      {
        assessmentId: Number(assessmentRow?.id),
        unitId: Number(otherUnitRow?.id),
        amountCents: 12500,
        dueDate: '2026-04-10',
        status: 'overdue',
        lateFeeCents: 500,
      },
    ]);

    settledAssessmentTitle = `Settled Assessment ${state.runSuffix}`;
    const [settledAssessmentRow] = await scopedA.insert(state.dbModule.assessments, {
      title: settledAssessmentTitle,
      amountCents: 9000,
      frequency: 'one_time',
      startDate: '2026-04-01',
      isActive: true,
    });

    await scopedA.insert(state.dbModule.assessmentLineItems, {
      assessmentId: Number(settledAssessmentRow?.id),
      unitId: ownerUnitId,
      amountCents: 9000,
      dueDate: '2026-04-15',
      status: 'paid',
      lateFeeCents: 0,
    });

    const [inRangeMeetingRow] = await scopedA.insert(state.dbModule.meetings, {
      title: `April Board Meeting ${state.runSuffix}`,
      meetingType: 'board',
      startsAt: new Date('2026-04-08T22:00:00.000Z'),
      endsAt: new Date('2026-04-08T23:00:00.000Z'),
      location: 'Clubhouse A',
    });
    inRangeMeetingId = Number(inRangeMeetingRow?.id);

    const [outOfRangeMeetingRow] = await scopedA.insert(state.dbModule.meetings, {
      title: `June Board Meeting ${state.runSuffix}`,
      meetingType: 'board',
      startsAt: new Date('2026-06-08T22:00:00.000Z'),
      endsAt: new Date('2026-06-08T23:00:00.000Z'),
      location: 'Clubhouse A',
    });
    outOfRangeMeetingId = Number(outOfRangeMeetingRow?.id);

    const [apartmentMeetingRow] = await scopedC.insert(state.dbModule.meetings, {
      title: `Apartment Standup ${state.runSuffix}`,
      meetingType: 'committee',
      startsAt: new Date('2026-04-12T15:00:00.000Z'),
      endsAt: new Date('2026-04-12T15:30:00.000Z'),
      location: 'Leasing Office',
    });
    apartmentMeetingId = Number(apartmentMeetingRow?.id);

    const [categoryRow] = await scopedA.insert(state.dbModule.documentCategories, {
      name: `Agenda ${state.runSuffix}`,
    });
    const [documentRow] = await scopedA.insert(state.dbModule.documents, {
      categoryId: Number(categoryRow?.id),
      title: `Agenda Packet ${state.runSuffix}`,
      filePath: `communities/${communityA.id}/agenda-${state.runSuffix}.pdf`,
      fileName: `agenda-${state.runSuffix}.pdf`,
      fileSize: 1024,
      mimeType: 'application/pdf',
    });
    await scopedA.insert(state.dbModule.meetingDocuments, {
      meetingId: inRangeMeetingId,
      documentId: Number(documentRow?.id),
    });

    routes = {
      meetings: await import('../../src/app/api/v1/meetings/route'),
      meetingDetail: await import('../../src/app/api/v1/meetings/[id]/route'),
      calendarEvents: await import('../../src/app/api/v1/calendar/events/route'),
      calendarPublic: await import('../../src/app/api/v1/calendar/meetings.ics/route'),
      calendarMy: await import('../../src/app/api/v1/calendar/my-meetings.ics/route'),
    };
  });

  beforeEach(() => {
    vi.clearAllMocks();
    const testState = requireState();
    requireAuthenticatedUserIdMock.mockImplementation(async () => requireCurrentActor(testState));
    setActor(testState, 'actorA');
  });

  afterAll(async () => {
    if (state) {
      await teardownTestKit(state);
    }
  });

  it('GET /api/v1/meetings?start=&end= returns only meetings in range', async () => {
    const routeModules = requireRoutes();
    const communityA = requireCommunity(requireState(), 'communityA');

    const response = await routeModules.meetings.GET(
      new NextRequest(apiUrl(`/api/v1/meetings?communityId=${communityA.id}&start=2026-04-01&end=2026-04-30`)),
    );
    expect(response.status).toBe(200);
    const json = await parseJson<{ data: Array<{ id: number; title: string }> }>(response);

    expect(json.data.map((meeting) => meeting.id)).toContain(inRangeMeetingId);
    expect(json.data.map((meeting) => meeting.id)).not.toContain(outOfRangeMeetingId);
  });

  it('GET /api/v1/meetings/[id] returns meeting documents and 404s cross-tenant', async () => {
    const testState = requireState();
    const routeModules = requireRoutes();
    const communityA = requireCommunity(testState, 'communityA');
    const communityC = requireCommunity(testState, 'communityC');

    setActor(testState, 'actorA');
    const response = await routeModules.meetingDetail.GET(
      new NextRequest(apiUrl(`/api/v1/meetings/${inRangeMeetingId}?communityId=${communityA.id}`)),
      { params: Promise.resolve({ id: String(inRangeMeetingId) }) },
    );
    expect(response.status).toBe(200);
    const json = await parseJson<{ data: { documents: Array<{ title: string }> } }>(response);
    expect(json.data.documents).toHaveLength(1);
    expect(json.data.documents[0]?.title).toContain('Agenda Packet');

    setActor(testState, 'actorC');
    const crossTenantResponse = await routeModules.meetingDetail.GET(
      new NextRequest(apiUrl(`/api/v1/meetings/${inRangeMeetingId}?communityId=${communityC.id}`)),
      { params: Promise.resolve({ id: String(inRangeMeetingId) }) },
    );
    expect(crossTenantResponse.status).toBe(404);
  });

  it('GET /api/v1/calendar/events returns admin aggregate, owner-specific, tenant-none, and omits assessments without finances.read', async () => {
    const testState = requireState();
    const routeModules = requireRoutes();
    const communityA = requireCommunity(testState, 'communityA');
    const url = `/api/v1/calendar/events?communityId=${communityA.id}&start=2026-04-01&end=2026-04-30`;

    setActor(testState, 'actorA');
    const adminResponse = await routeModules.calendarEvents.GET(new NextRequest(apiUrl(url)));
    const adminJson = await parseJson<{ data: Array<{ type: string; assessmentTitle?: string }> }>(adminResponse);
    expect(adminJson.data.some((event) => event.type === 'assessment_due' && event.assessmentTitle === assessmentTitle)).toBe(true);

    setActorById(testState, ownerResidentUserId);
    const ownerResponse = await routeModules.calendarEvents.GET(new NextRequest(apiUrl(url)));
    const ownerJson = await parseJson<{ data: Array<{ type: string; unitLabel?: string; assessmentTitle?: string }> }>(ownerResponse);
    expect(ownerJson.data.some((event) => event.type === 'my_assessment_due' && event.unitLabel === ownerUnitLabel)).toBe(true);
    expect(ownerJson.data.some((event) => event.assessmentTitle === settledAssessmentTitle)).toBe(false);

    setActor(testState, 'tenantA');
    const tenantResponse = await routeModules.calendarEvents.GET(new NextRequest(apiUrl(url)));
    const tenantJson = await parseJson<{ data: Array<{ type: string }> }>(tenantResponse);
    expect(tenantJson.data.some((event) => event.type !== 'meeting')).toBe(false);

    setActorById(testState, noFinanceManagerUserId);
    const noFinanceResponse = await routeModules.calendarEvents.GET(new NextRequest(apiUrl(url)));
    const noFinanceJson = await parseJson<{ data: Array<{ type: string }> }>(noFinanceResponse);
    expect(noFinanceJson.data.some((event) => event.type !== 'meeting')).toBe(false);
  });

  it('calendar ICS feeds follow assessment visibility rules and expose no public assessment PII', async () => {
    const testState = requireState();
    const routeModules = requireRoutes();
    const communityA = requireCommunity(testState, 'communityA');

    const publicResponse = await routeModules.calendarPublic.GET(
      new NextRequest(apiUrl(`/api/v1/calendar/meetings.ics?communityId=${communityA.id}`)),
    );
    expect(publicResponse.status).toBe(200);
    const publicBody = await publicResponse.text();
    expect(publicBody).toContain(assessmentTitle);
    expect(publicBody).toContain('1 pending\\, 1 overdue');
    expect(publicBody).not.toContain(ownerUnitLabel);
    expect(publicBody).not.toContain('$125.00');

    setActor(testState, 'actorA');
    const adminResponse = await routeModules.calendarMy.GET(
      new NextRequest(apiUrl(`/api/v1/calendar/my-meetings.ics?communityId=${communityA.id}`)),
    );
    const adminBody = await adminResponse.text();
    expect(adminBody).toContain(assessmentTitle);
    expect(adminBody).toContain('$255.00 total due');

    setActorById(testState, ownerResidentUserId);
    const ownerResponse = await routeModules.calendarMy.GET(
      new NextRequest(apiUrl(`/api/v1/calendar/my-meetings.ics?communityId=${communityA.id}`)),
    );
    const ownerBody = await ownerResponse.text();
    expect(ownerBody).toContain(ownerUnitLabel);
    expect(ownerBody).toContain('$125.00');
    expect(ownerBody).not.toContain(settledAssessmentTitle);

    setActor(testState, 'tenantA');
    const tenantResponse = await routeModules.calendarMy.GET(
      new NextRequest(apiUrl(`/api/v1/calendar/my-meetings.ics?communityId=${communityA.id}`)),
    );
    const tenantBody = await tenantResponse.text();
    expect(tenantBody).toContain(`April Board Meeting ${testState.runSuffix}`);
    expect(tenantBody).not.toContain(assessmentTitle);
  });

  it('apartment tenant/site manager/property manager admin flows succeed on the meetings API', async () => {
    const testState = requireState();
    const routeModules = requireRoutes();
    const communityC = requireCommunity(testState, 'communityC');

    setActor(testState, 'tenantC');
    const tenantReadResponse = await routeModules.meetings.GET(
      new NextRequest(apiUrl(`/api/v1/meetings?communityId=${communityC.id}`)),
    );
    expect(tenantReadResponse.status).toBe(200);

    setActor(testState, 'siteManagerC');
    const siteManagerCreateResponse = await routeModules.meetings.POST(
      jsonRequest(apiUrl('/api/v1/meetings'), 'POST', {
        communityId: communityC.id,
        title: `Site Manager Meeting ${testState.runSuffix}`,
        meetingType: 'committee',
        startsAt: '2026-04-16T15:00:00.000Z',
        location: 'Leasing Office',
      }),
    );
    expect(siteManagerCreateResponse.status).toBe(201);

    setActor(testState, 'actorC');
    const pmAdminDetailResponse = await routeModules.meetingDetail.GET(
      new NextRequest(apiUrl(`/api/v1/meetings/${apartmentMeetingId}?communityId=${communityC.id}`)),
      { params: Promise.resolve({ id: String(apartmentMeetingId) }) },
    );
    expect(pmAdminDetailResponse.status).toBe(200);
  });
});
