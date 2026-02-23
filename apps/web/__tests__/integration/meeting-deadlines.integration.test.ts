/**
 * P4-58: Meeting-deadlines integration tests.
 *
 * Verifies meeting creation, deadline calculations, and feature gating
 * through actual route handlers:
 *
 * 1. Create meeting in condo → 201 with deadline fields
 * 2. GET meetings → meeting returned with notice deadlines
 * 3. Board meeting: 48-hour notice deadline
 * 4. Owner/annual meeting: 14-day notice deadline
 * 5. Feature gate: apartment community → 403
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
  setActor,
  requireCurrentActor,
  apiUrl,
  parseJson,
  jsonRequest,
} from './helpers/multi-tenant-test-kit';

if (process.env.CI && !process.env.DATABASE_URL) {
  throw new Error('P4-58 meeting-deadlines integration tests require DATABASE_URL in CI');
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

function requireRoute(): MeetingsRouteModule {
  if (!meetingsRoute) throw new Error('Route not loaded');
  return meetingsRoute;
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describeDb('p4-58 meeting-deadlines integration', () => {
  beforeAll(async () => {
    if (!process.env.DATABASE_URL) return;

    state = await initTestKit();
    await seedCommunities(state, MULTI_TENANT_COMMUNITIES);

    const neededUsers: MultiTenantUserKey[] = [
      'actorA',   // board_president (condo)
      'tenantC',  // tenant (apartment)
    ];

    const userFixtures = MULTI_TENANT_USERS.filter((u) =>
      neededUsers.includes(u.key),
    );

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
    if (state) {
      await teardownTestKit(state);
    }
  });

  // =========================================================================
  // Meeting creation + deadline calculations
  // =========================================================================

  it('creates board meeting in condo with 48-hour notice deadline', async () => {
    const kit = requireState();
    const route = requireRoute();
    const community = requireCommunity(kit, 'communityA');

    // Schedule 7 days from now
    const meetingDate = new Date();
    meetingDate.setDate(meetingDate.getDate() + 7);

    setActor(kit, 'actorA');
    const response = await route.POST(
      jsonRequest(
        apiUrl(`/api/v1/meetings?communityId=${community.id}`),
        'POST',
        {
          communityId: community.id,
          action: 'create',
          title: `Board Meeting ${kit.runSuffix}`,
          meetingType: 'board',
          startsAt: meetingDate.toISOString(),
          location: 'Clubhouse',
        },
      ),
    );
    expect(response.status).toBe(201);
    const json = await parseJson<{ data: Record<string, unknown> }>(response);

    // Should have deadline fields
    expect(json.data).toHaveProperty('noticePostBy');
    const noticePostBy = new Date(json.data['noticePostBy'] as string);
    const startsAt = new Date(json.data['startsAt'] as string);

    // Board meeting notice: 48 hours before
    const hoursDiff = (startsAt.getTime() - noticePostBy.getTime()) / (1000 * 60 * 60);
    expect(hoursDiff).toBeCloseTo(48, 0);
  });

  it('creates owner meeting in condo with 14-day notice deadline', async () => {
    const kit = requireState();
    const route = requireRoute();
    const community = requireCommunity(kit, 'communityA');

    // Schedule 30 days from now
    const meetingDate = new Date();
    meetingDate.setDate(meetingDate.getDate() + 30);

    setActor(kit, 'actorA');
    const response = await route.POST(
      jsonRequest(
        apiUrl(`/api/v1/meetings?communityId=${community.id}`),
        'POST',
        {
          communityId: community.id,
          action: 'create',
          title: `Owner Meeting ${kit.runSuffix}`,
          meetingType: 'owner',
          startsAt: meetingDate.toISOString(),
          location: 'Community Hall',
        },
      ),
    );
    expect(response.status).toBe(201);
    const json = await parseJson<{ data: Record<string, unknown> }>(response);

    expect(json.data).toHaveProperty('noticePostBy');
    const noticePostBy = new Date(json.data['noticePostBy'] as string);
    const startsAt = new Date(json.data['startsAt'] as string);

    // Owner meeting notice: 14 days before
    const daysDiff = (startsAt.getTime() - noticePostBy.getTime()) / (1000 * 60 * 60 * 24);
    expect(daysDiff).toBeCloseTo(14, 0);
  });

  it('GET meetings returns created meetings with deadline fields', async () => {
    const kit = requireState();
    const route = requireRoute();
    const community = requireCommunity(kit, 'communityA');

    setActor(kit, 'actorA');
    const response = await route.GET(
      new NextRequest(apiUrl(`/api/v1/meetings?communityId=${community.id}`)),
    );
    expect(response.status).toBe(200);
    const json = await parseJson<{ data: Array<Record<string, unknown>> }>(response);

    const suffix = kit.runSuffix;
    const titles = json.data.map((m) => String(m['title']));
    expect(titles).toContain(`Board Meeting ${suffix}`);
    expect(titles).toContain(`Owner Meeting ${suffix}`);

    // All meetings should have deadline fields
    for (const meeting of json.data) {
      if (String(meeting['title']).includes(suffix)) {
        expect(meeting).toHaveProperty('noticePostBy');
      }
    }
  });

  // =========================================================================
  // Feature gate: apartment → 403
  // =========================================================================

  it('GET meetings for apartment → 403', async () => {
    const kit = requireState();
    const route = requireRoute();
    const community = requireCommunity(kit, 'communityC');

    setActor(kit, 'tenantC');
    const response = await route.GET(
      new NextRequest(apiUrl(`/api/v1/meetings?communityId=${community.id}`)),
    );
    expect(response.status).toBe(403);
  });

  it('POST meeting in apartment → 403', async () => {
    const kit = requireState();
    const route = requireRoute();
    const community = requireCommunity(kit, 'communityC');

    setActor(kit, 'tenantC');
    const response = await route.POST(
      jsonRequest(
        apiUrl(`/api/v1/meetings?communityId=${community.id}`),
        'POST',
        {
          communityId: community.id,
          action: 'create',
          title: `Blocked Meeting ${kit.runSuffix}`,
          meetingType: 'board',
          startsAt: new Date().toISOString(),
          location: 'Nowhere',
        },
      ),
    );
    expect(response.status).toBe(403);
  });
});
