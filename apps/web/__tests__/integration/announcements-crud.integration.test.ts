/**
 * P4-58: Announcements CRUD integration test.
 *
 * Verifies:
 *   1. Create announcement → 201
 *   2. GET lists announcements (pinned first, chronological)
 *   3. Update announcement title/body
 *   4. Pin/unpin announcement
 *   5. Archive/unarchive announcement
 *   6. Archived announcements excluded by default, included with flag
 *   7. Tenant cannot create announcements (write permission required)
 *   8. Cross-tenant isolation
 */
import { NextRequest } from 'next/server';
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
  setActor,
  requireCurrentActor,
  apiUrl,
  jsonRequest,
  parseJson,
  readNumberField,
  requireDatabaseUrlInCI,
  getDescribeDb,
} from './helpers/multi-tenant-test-kit';

requireDatabaseUrlInCI('Announcements CRUD integration tests');

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

vi.mock('@/lib/services/announcement-delivery', () => ({
  queueAnnouncementDelivery: vi.fn().mockResolvedValue(0),
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

// ---------------------------------------------------------------------------
// Route types
// ---------------------------------------------------------------------------

type AnnouncementsRouteModule = typeof import('../../src/app/api/v1/announcements/route');

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

let state: TestKitState | null = null;
let announcementsRoute: AnnouncementsRouteModule | null = null;

function requireState(): TestKitState {
  if (!state) throw new Error('Test state not initialized');
  return state;
}

function requireRoute(): AnnouncementsRouteModule {
  if (!announcementsRoute) throw new Error('Route not loaded');
  return announcementsRoute;
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describeDb('P4-58: announcements CRUD (db-backed integration)', () => {
  let createdAnnouncementId: number;

  beforeAll(async () => {
    if (!process.env.DATABASE_URL) return;

    state = await initTestKit();

    const communityA = MULTI_TENANT_COMMUNITIES.find((c) => c.key === 'communityA');
    const communityC = MULTI_TENANT_COMMUNITIES.find((c) => c.key === 'communityC');
    if (!communityA || !communityC) throw new Error('Required community fixtures not found');
    await seedCommunities(state, [communityA, communityC]);

    const neededUsers: MultiTenantUserKey[] = ['actorA', 'tenantA', 'actorC'];
    const userFixtures = MULTI_TENANT_USERS.filter((u) => neededUsers.includes(u.key));
    await seedUsers(state, userFixtures);

    announcementsRoute = await import('../../src/app/api/v1/announcements/route');
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
  // 1. Create announcement
  // =========================================================================

  it('POST creates announcement with 201', async () => {
    const kit = requireState();
    const route = requireRoute();
    const communityA = requireCommunity(kit, 'communityA');

    const response = await route.POST(
      jsonRequest(apiUrl('/api/v1/announcements'), 'POST', {
        communityId: communityA.id,
        title: `Test Announcement ${kit.runSuffix}`,
        body: `This is a test announcement body for ${kit.runSuffix}`,
        audience: 'all',
        isPinned: false,
      }),
    );

    expect(response.status).toBe(201);
    const json = await parseJson<{ data: Record<string, unknown> }>(response);
    expect(json.data['title']).toBe(`Test Announcement ${kit.runSuffix}`);
    expect(json.data['audience']).toBe('all');
    expect(json.data['isPinned']).toBe(false);
    createdAnnouncementId = readNumberField(json.data, 'id');
  });

  // =========================================================================
  // 2. GET lists announcements
  // =========================================================================

  it('GET returns created announcements', async () => {
    const kit = requireState();
    const route = requireRoute();
    const communityA = requireCommunity(kit, 'communityA');

    const response = await route.GET(
      new NextRequest(apiUrl(`/api/v1/announcements?communityId=${communityA.id}`)),
    );

    expect(response.status).toBe(200);
    const json = await parseJson<{ data: Array<Record<string, unknown>> }>(response);
    expect(json.data.length).toBeGreaterThanOrEqual(1);

    const found = json.data.find((a) => a['title'] === `Test Announcement ${kit.runSuffix}`);
    expect(found).toBeDefined();
  });

  // =========================================================================
  // 3. Update announcement
  // =========================================================================

  it('POST update changes announcement title and body', async () => {
    const kit = requireState();
    const route = requireRoute();
    const communityA = requireCommunity(kit, 'communityA');

    const response = await route.POST(
      jsonRequest(apiUrl('/api/v1/announcements'), 'POST', {
        action: 'update',
        id: createdAnnouncementId,
        communityId: communityA.id,
        title: `Updated Announcement ${kit.runSuffix}`,
        body: `Updated body for ${kit.runSuffix}`,
      }),
    );

    expect(response.status).toBe(200);
    const json = await parseJson<{ data: Record<string, unknown> }>(response);
    expect(json.data['title']).toBe(`Updated Announcement ${kit.runSuffix}`);
  });

  // =========================================================================
  // 4. Pin/unpin announcement
  // =========================================================================

  it('POST pin sets isPinned to true', async () => {
    const kit = requireState();
    const route = requireRoute();
    const communityA = requireCommunity(kit, 'communityA');

    const pinResponse = await route.POST(
      jsonRequest(apiUrl('/api/v1/announcements'), 'POST', {
        action: 'pin',
        id: createdAnnouncementId,
        communityId: communityA.id,
        isPinned: true,
      }),
    );

    expect(pinResponse.status).toBe(200);
    const pinJson = await parseJson<{ data: Record<string, unknown> }>(pinResponse);
    expect(pinJson.data['isPinned']).toBe(true);

    // Verify pinned announcements appear first in GET
    const getResponse = await route.GET(
      new NextRequest(apiUrl(`/api/v1/announcements?communityId=${communityA.id}`)),
    );
    const getJson = await parseJson<{ data: Array<Record<string, unknown>> }>(getResponse);
    expect(getJson.data.length).toBeGreaterThan(0);
    // The created announcement should be pinned and appear first
    expect(getJson.data[0]['id']).toBe(createdAnnouncementId);
    expect(getJson.data[0]['isPinned']).toBe(true);

    // Unpin
    const unpinResponse = await route.POST(
      jsonRequest(apiUrl('/api/v1/announcements'), 'POST', {
        action: 'pin',
        id: createdAnnouncementId,
        communityId: communityA.id,
        isPinned: false,
      }),
    );
    expect(unpinResponse.status).toBe(200);
  });

  // =========================================================================
  // 5. Archive/unarchive
  // =========================================================================

  it('POST archive sets archivedAt', async () => {
    const kit = requireState();
    const route = requireRoute();
    const communityA = requireCommunity(kit, 'communityA');

    const response = await route.POST(
      jsonRequest(apiUrl('/api/v1/announcements'), 'POST', {
        action: 'archive',
        id: createdAnnouncementId,
        communityId: communityA.id,
        archive: true,
      }),
    );

    expect(response.status).toBe(200);
    const json = await parseJson<{ data: Record<string, unknown> }>(response);
    expect(json.data['archivedAt']).not.toBeNull();
  });

  // =========================================================================
  // 6. Archived excluded by default, included with flag
  // =========================================================================

  it('GET excludes archived by default, includes with includeArchived=true', async () => {
    const kit = requireState();
    const route = requireRoute();
    const communityA = requireCommunity(kit, 'communityA');

    // Default: archived excluded
    const defaultResponse = await route.GET(
      new NextRequest(apiUrl(`/api/v1/announcements?communityId=${communityA.id}`)),
    );
    const defaultJson = await parseJson<{ data: Array<Record<string, unknown>> }>(defaultResponse);
    const archivedInDefault = defaultJson.data.find((a) => a['id'] === createdAnnouncementId);
    expect(archivedInDefault).toBeUndefined();

    // With includeArchived=true
    const archivedResponse = await route.GET(
      new NextRequest(apiUrl(`/api/v1/announcements?communityId=${communityA.id}&includeArchived=true`)),
    );
    const archivedJson = await parseJson<{ data: Array<Record<string, unknown>> }>(archivedResponse);
    const archivedInList = archivedJson.data.find((a) => a['id'] === createdAnnouncementId);
    expect(archivedInList).toBeDefined();

    // Unarchive for cleanup
    await route.POST(
      jsonRequest(apiUrl('/api/v1/announcements'), 'POST', {
        action: 'archive',
        id: createdAnnouncementId,
        communityId: communityA.id,
        archive: false,
      }),
    );
  });

  // =========================================================================
  // 7. Tenant cannot create announcements
  // =========================================================================

  it('tenant cannot create announcements (403)', async () => {
    const kit = requireState();
    const route = requireRoute();
    const communityA = requireCommunity(kit, 'communityA');

    setActor(kit, 'tenantA');
    const response = await route.POST(
      jsonRequest(apiUrl('/api/v1/announcements'), 'POST', {
        communityId: communityA.id,
        title: 'Tenant Announcement',
        body: 'Should not be created',
        audience: 'all',
      }),
    );

    expect(response.status).toBe(403);
  });

  // =========================================================================
  // 8. Cross-tenant isolation
  // =========================================================================

  it('cross-tenant: actorC cannot read communityA announcements', async () => {
    const kit = requireState();
    const route = requireRoute();
    const communityA = requireCommunity(kit, 'communityA');

    setActor(kit, 'actorC');
    const response = await route.GET(
      new NextRequest(apiUrl(`/api/v1/announcements?communityId=${communityA.id}`)),
    );

    expect(response.status).toBe(403);
  });
});
