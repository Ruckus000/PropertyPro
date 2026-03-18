/**
 * P4-58: Meeting management and deadline calculation integration test.
 *
 * Verifies:
 *   1. Create meeting → response includes computed deadlines
 *   2. Board meeting → 48-hour (2-day) notice lead time
 *   3. Annual meeting → 14-day notice lead time
 *   4. Meeting CRUD: create, update, soft-delete
 *   5. Document attach/detach on meeting
 *   6. Feature gate: apartment community → 403
 *   7. Minutes posting deadline = 30 days after meeting
 */
import { NextRequest } from 'next/server';
import { subDays, addDays, isWeekend, isSameDay, nextMonday, startOfDay } from 'date-fns';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { MULTI_TENANT_COMMUNITIES } from '../fixtures/multi-tenant-communities';
import { MULTI_TENANT_USERS, type MultiTenantUserKey } from '../fixtures/multi-tenant-users';
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
  readNumberField,
  requireInsertedRow,
  requireDatabaseUrlInCI,
  getDescribeDb,
} from './helpers/multi-tenant-test-kit';

requireDatabaseUrlInCI('Meeting deadlines integration tests');

const describeDb = getDescribeDb();

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const { requireAuthenticatedUserIdMock } = vi.hoisted(() => ({
  requireAuthenticatedUserIdMock: vi.fn(),
}));

vi.mock('@/lib/api/auth', () => ({
  requireAuthenticatedUserId: requireAuthenticatedUserIdMock,
}));

vi.mock('@/lib/services/notification-service', () => ({
  queueNotification: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/workers/pdf-extraction', () => ({
  queuePdfExtraction: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Route types
// ---------------------------------------------------------------------------

type MeetingsRouteModule = typeof import('../../src/app/api/v1/meetings/route');

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

let state: TestKitState | null = null;
let meetingsRoute: MeetingsRouteModule | null = null;

function requireState(): TestKitState {
  if (!state) throw new Error('Test state not initialized');
  return state;
}

function requireMeetingsRoute(): MeetingsRouteModule {
  if (!meetingsRoute) throw new Error('Route not loaded');
  return meetingsRoute;
}

/**
 * Mirror the weekend-forward adjustment from meeting-calculator.ts
 * so we can predict exact deadline values in assertions.
 */
function adjustWeekendForward(date: Date): Date {
  const dayStart = startOfDay(date);
  if (!isWeekend(dayStart)) return date;
  return nextMonday(dayStart);
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describeDb('P4-58: meeting management & deadline calculations (db-backed integration)', () => {
  beforeAll(async () => {
    if (!process.env.DATABASE_URL) return;

    state = await initTestKit();

    // Seed communityA (condo_718), communityB (hoa_720), communityC (apartment)
    await seedCommunities(state, MULTI_TENANT_COMMUNITIES);

    // Seed actorA (board_president, condo), actorB (board_president, hoa), actorC (pm_admin, apartment)
    const neededUsers: MultiTenantUserKey[] = ['actorA', 'actorB', 'actorC', 'tenantA'];
    const userFixtures = MULTI_TENANT_USERS.filter((u) => neededUsers.includes(u.key));
    await seedUsers(state, userFixtures);

    meetingsRoute = await import('../../src/app/api/v1/meetings/route');
  });

  beforeEach(() => {
    vi.clearAllMocks();
    const kit = requireState();
    requireAuthenticatedUserIdMock.mockImplementation(async () => requireCurrentActor(kit));
    setActor(kit, 'actorA');
  });

  afterAll(async () => {
    if (state) await teardownTestKit(state);
  });

  // =========================================================================
  // 1. Create board meeting → verify 48-hour notice deadline
  // =========================================================================

  it('create board meeting returns 201 with correct notice deadline (2-day lead)', async () => {
    const kit = requireState();
    const route = requireMeetingsRoute();
    const communityA = requireCommunity(kit, 'communityA');

    // Schedule meeting 30 days from now (well past any deadline)
    const meetingDate = addDays(new Date(), 30);
    const startsAt = meetingDate.toISOString();

    const response = await route.POST(
      jsonRequest(apiUrl('/api/v1/meetings'), 'POST', {
        communityId: communityA.id,
        title: `Board Meeting ${kit.runSuffix}`,
        meetingType: 'board',
        startsAt,
        location: 'Community Room',
      }),
    );

    expect(response.status).toBe(201);
    const json = await parseJson<{ data: Record<string, unknown> }>(response);
    expect(json.data['title']).toBe(`Board Meeting ${kit.runSuffix}`);
    expect(json.data['meetingType']).toBe('board');

    // Now fetch meetings via GET to verify deadlines
    const getResponse = await route.GET(
      new NextRequest(apiUrl(`/api/v1/meetings?communityId=${communityA.id}`)),
    );
    expect(getResponse.status).toBe(200);
    const getJson = await parseJson<{ data: Array<Record<string, unknown>> }>(getResponse);

    const createdMeeting = getJson.data.find(
      (m) => m['title'] === `Board Meeting ${kit.runSuffix}`,
    );
    if (!createdMeeting) throw new Error('Board meeting not found');

    // Board meeting notice deadline: 2 days before, adjusted for weekends
    const deadlines = createdMeeting['deadlines'] as Record<string, string>;
    expect(deadlines).toHaveProperty('noticePostBy');
    expect(typeof deadlines['noticePostBy']).toBe('string');
    expect(deadlines).toHaveProperty('minutesPostBy');
    expect(typeof deadlines['minutesPostBy']).toBe('string');

    const expectedNoticeBy = adjustWeekendForward(subDays(meetingDate, 2));
    const actualNoticeBy = new Date(deadlines['noticePostBy']);
    expect(isSameDay(actualNoticeBy, expectedNoticeBy)).toBe(true);
  });

  // =========================================================================
  // 2. Create annual meeting → verify 14-day notice deadline
  // =========================================================================

  it('create annual meeting returns 201 with 14-day notice deadline', async () => {
    const kit = requireState();
    const route = requireMeetingsRoute();
    const communityA = requireCommunity(kit, 'communityA');

    const meetingDate = addDays(new Date(), 45);
    const startsAt = meetingDate.toISOString();

    const response = await route.POST(
      jsonRequest(apiUrl('/api/v1/meetings'), 'POST', {
        communityId: communityA.id,
        title: `Annual Meeting ${kit.runSuffix}`,
        meetingType: 'annual',
        startsAt,
        location: 'Main Hall',
      }),
    );
    expect(response.status).toBe(201);

    const getResponse = await route.GET(
      new NextRequest(apiUrl(`/api/v1/meetings?communityId=${communityA.id}`)),
    );
    const getJson = await parseJson<{ data: Array<Record<string, unknown>> }>(getResponse);
    const meeting = getJson.data.find((m) => m['title'] === `Annual Meeting ${kit.runSuffix}`);
    if (!meeting) throw new Error('Annual meeting not found');

    const deadlines = meeting['deadlines'] as Record<string, string>;
    const expectedNoticeBy = adjustWeekendForward(subDays(meetingDate, 14));
    const actualNoticeBy = new Date(deadlines['noticePostBy']);
    expect(isSameDay(actualNoticeBy, expectedNoticeBy)).toBe(true);
  });

  // =========================================================================
  // 3. Minutes posting deadline = 30 days after meeting
  // =========================================================================

  it('minutes posting deadline is 30 days after meeting start', async () => {
    const kit = requireState();
    const route = requireMeetingsRoute();
    const communityA = requireCommunity(kit, 'communityA');

    const getResponse = await route.GET(
      new NextRequest(apiUrl(`/api/v1/meetings?communityId=${communityA.id}`)),
    );
    const getJson = await parseJson<{ data: Array<Record<string, unknown>> }>(getResponse);

    // Use the first meeting created above
    const meeting = getJson.data.find((m) =>
      (m['title'] as string).includes(kit.runSuffix),
    );
    if (!meeting) throw new Error('Meeting not found');

    const startsAt = new Date(meeting['startsAt'] as string);
    const deadlines = meeting['deadlines'] as Record<string, string>;
    const expectedMinutesBy = adjustWeekendForward(addDays(startsAt, 30));
    const actualMinutesBy = new Date(deadlines['minutesPostBy']);
    expect(isSameDay(actualMinutesBy, expectedMinutesBy)).toBe(true);
  });

  // =========================================================================
  // 4. Update meeting
  // =========================================================================

  it('update meeting title and location', async () => {
    const kit = requireState();
    const route = requireMeetingsRoute();
    const communityA = requireCommunity(kit, 'communityA');

    // Get existing meetings to find one to update
    const getResponse = await route.GET(
      new NextRequest(apiUrl(`/api/v1/meetings?communityId=${communityA.id}`)),
    );
    const getJson = await parseJson<{ data: Array<Record<string, unknown>> }>(getResponse);
    const meeting = getJson.data.find((m) =>
      (m['title'] as string).includes(`Board Meeting ${kit.runSuffix}`),
    );
    if (!meeting) throw new Error('Meeting not found for update');

    const meetingId = meeting['id'] as number;
    const updateResponse = await route.POST(
      jsonRequest(apiUrl('/api/v1/meetings'), 'POST', {
        action: 'update',
        id: meetingId,
        communityId: communityA.id,
        title: `Updated Board Meeting ${kit.runSuffix}`,
        location: 'Updated Room',
      }),
    );
    expect(updateResponse.status).toBe(200);
    const updateJson = await parseJson<{ data: Record<string, unknown> }>(updateResponse);
    expect(updateJson.data['title']).toBe(`Updated Board Meeting ${kit.runSuffix}`);
    expect(updateJson.data['location']).toBe('Updated Room');
  });

  // =========================================================================
  // 5. Soft-delete meeting
  // =========================================================================

  it('soft-delete meeting removes it from GET listing', async () => {
    const kit = requireState();
    const route = requireMeetingsRoute();
    const communityA = requireCommunity(kit, 'communityA');

    // Create a meeting to delete
    const createResponse = await route.POST(
      jsonRequest(apiUrl('/api/v1/meetings'), 'POST', {
        communityId: communityA.id,
        title: `Deletable Meeting ${kit.runSuffix}`,
        meetingType: 'committee',
        startsAt: addDays(new Date(), 20).toISOString(),
        location: 'Room 101',
      }),
    );
    expect(createResponse.status).toBe(201);
    const created = await parseJson<{ data: Record<string, unknown> }>(createResponse);
    const meetingId = created.data['id'] as number;

    // Delete it
    const deleteResponse = await route.POST(
      jsonRequest(apiUrl('/api/v1/meetings'), 'POST', {
        action: 'delete',
        id: meetingId,
        communityId: communityA.id,
      }),
    );
    expect(deleteResponse.status).toBe(200);

    // Verify it's gone from GET listing
    const getResponse = await route.GET(
      new NextRequest(apiUrl(`/api/v1/meetings?communityId=${communityA.id}`)),
    );
    const getJson = await parseJson<{ data: Array<Record<string, unknown>> }>(getResponse);
    const deleted = getJson.data.find((m) => m['id'] === meetingId);
    expect(deleted).toBeUndefined();
  });

  // =========================================================================
  // 6. Document attach/detach
  // =========================================================================

  it('attach and detach document from meeting', async () => {
    const kit = requireState();
    const route = requireMeetingsRoute();
    const communityA = requireCommunity(kit, 'communityA');
    const actorA = requireUser(kit, 'actorA');

    // Create a meeting
    const meetingResponse = await route.POST(
      jsonRequest(apiUrl('/api/v1/meetings'), 'POST', {
        communityId: communityA.id,
        title: `Attach Test Meeting ${kit.runSuffix}`,
        meetingType: 'board',
        startsAt: addDays(new Date(), 15).toISOString(),
        location: 'Room 201',
      }),
    );
    expect(meetingResponse.status).toBe(201);
    const meetingJson = await parseJson<{ data: Record<string, unknown> }>(meetingResponse);
    const meetingId = meetingJson.data['id'] as number;

    // Create a document directly in the DB for the attachment test
    const scoped = kit.dbModule.createScopedClient(communityA.id);
    const [docRow] = await scoped.insert(kit.dbModule.documents, {
      title: `Agenda Doc ${kit.runSuffix}`,
      filePath: `communities/${communityA.id}/documents/agenda-${kit.runSuffix}.pdf`,
      fileName: `agenda-${kit.runSuffix}.pdf`,
      fileSize: 1024,
      mimeType: 'application/pdf',
      uploadedBy: actorA.id,
    });
    const documentId = readNumberField(requireInsertedRow(docRow, 'document'), 'id');

    // Attach
    const attachResponse = await route.POST(
      jsonRequest(apiUrl('/api/v1/meetings'), 'POST', {
        action: 'attach',
        communityId: communityA.id,
        meetingId,
        documentId,
      }),
    );
    expect(attachResponse.status).toBe(201);

    // Detach
    const detachResponse = await route.POST(
      jsonRequest(apiUrl('/api/v1/meetings'), 'POST', {
        action: 'detach',
        communityId: communityA.id,
        meetingId,
        documentId,
      }),
    );
    expect(detachResponse.status).toBe(200);
    const detachJson = await parseJson<{ data: { success: boolean } }>(detachResponse);
    expect(detachJson.data.success).toBe(true);
  });

  // =========================================================================
  // 7. Apartments now support meetings for readable/writable roles
  // =========================================================================

  it('GET meetings on apartment community succeeds for property manager admin', async () => {
    const kit = requireState();
    const route = requireMeetingsRoute();
    const communityC = requireCommunity(kit, 'communityC');

    setActor(kit, 'actorC');
    const response = await route.GET(
      new NextRequest(apiUrl(`/api/v1/meetings?communityId=${communityC.id}`)),
    );
    expect(response.status).toBe(200);
  });

  it('POST create meeting on apartment community succeeds for property manager admin', async () => {
    const kit = requireState();
    const route = requireMeetingsRoute();
    const communityC = requireCommunity(kit, 'communityC');

    setActor(kit, 'actorC');
    const response = await route.POST(
      jsonRequest(apiUrl('/api/v1/meetings'), 'POST', {
        communityId: communityC.id,
        title: 'Should Not Work',
        meetingType: 'board',
        startsAt: addDays(new Date(), 10).toISOString(),
        location: 'Nowhere',
      }),
    );
    expect(response.status).toBe(201);
  });

  // =========================================================================
  // 8. HOA community also supports meetings
  // =========================================================================

  it('create meeting on hoa_720 community succeeds', async () => {
    const kit = requireState();
    const route = requireMeetingsRoute();
    const communityB = requireCommunity(kit, 'communityB');

    setActor(kit, 'actorB');
    const response = await route.POST(
      jsonRequest(apiUrl('/api/v1/meetings'), 'POST', {
        communityId: communityB.id,
        title: `HOA Board Meeting ${kit.runSuffix}`,
        meetingType: 'board',
        startsAt: addDays(new Date(), 25).toISOString(),
        location: 'HOA Clubhouse',
      }),
    );
    expect(response.status).toBe(201);
  });

  // =========================================================================
  // 9. Tenant cannot create meetings
  // =========================================================================

  it('tenant cannot create meetings', async () => {
    const kit = requireState();
    const route = requireMeetingsRoute();
    const communityA = requireCommunity(kit, 'communityA');

    setActor(kit, 'tenantA');
    const response = await route.POST(
      jsonRequest(apiUrl('/api/v1/meetings'), 'POST', {
        communityId: communityA.id,
        title: 'Tenant Meeting',
        meetingType: 'board',
        startsAt: addDays(new Date(), 10).toISOString(),
        location: 'Lobby',
      }),
    );
    expect(response.status).toBe(403);
  });
});
