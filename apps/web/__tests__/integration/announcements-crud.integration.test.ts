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

    const neededUsers: MultiTenantUserKey[] = ['actorA', 'residentA', 'tenantA', 'actorC'];
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

  it('admin can create then edit an announcement in one routed authoring flow', async () => {
    const kit = requireState();
    const route = requireRoute();
    const communityA = requireCommunity(kit, 'communityA');

    const createResponse = await route.POST(
      jsonRequest(apiUrl('/api/v1/announcements'), 'POST', {
        communityId: communityA.id,
        title: `Flow Announcement ${kit.runSuffix}`,
        body: `Created via authoring flow ${kit.runSuffix}`,
        audience: 'all',
        isPinned: false,
      }),
    );

    expect(createResponse.status).toBe(201);
    const createJson = await parseJson<{ data: Record<string, unknown> }>(createResponse);
    const flowAnnouncementId = readNumberField(createJson.data, 'id');

    const updateResponse = await route.POST(
      jsonRequest(apiUrl('/api/v1/announcements'), 'POST', {
        action: 'update',
        id: flowAnnouncementId,
        communityId: communityA.id,
        title: `Flow Announcement Updated ${kit.runSuffix}`,
        body: `Edited via authoring flow ${kit.runSuffix}`,
        audience: 'board_only',
        isPinned: true,
      }),
    );

    expect(updateResponse.status).toBe(200);
    const updateJson = await parseJson<{ data: Record<string, unknown> }>(updateResponse);
    expect(updateJson.data['title']).toBe(`Flow Announcement Updated ${kit.runSuffix}`);
    expect(updateJson.data['audience']).toBe('board_only');
    expect(updateJson.data['isPinned']).toBe(true);
  });

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

  it('POST handles sequential action mutations without consuming the request body twice', async () => {
    const kit = requireState();
    const route = requireRoute();
    const communityA = requireCommunity(kit, 'communityA');

    const createResponse = await route.POST(
      jsonRequest(apiUrl('/api/v1/announcements'), 'POST', {
        communityId: communityA.id,
        title: `Sequential Announcement ${kit.runSuffix}`,
        body: `Sequential body ${kit.runSuffix}`,
        audience: 'all',
        isPinned: false,
      }),
    );
    expect(createResponse.status).toBe(201);
    const createJson = await parseJson<{ data: Record<string, unknown> }>(createResponse);
    const sequentialAnnouncementId = readNumberField(createJson.data, 'id');

    const updateResponse = await route.POST(
      jsonRequest(apiUrl('/api/v1/announcements'), 'POST', {
        action: 'update',
        id: sequentialAnnouncementId,
        communityId: communityA.id,
        title: `Sequential Updated ${kit.runSuffix}`,
        body: `Sequential updated body ${kit.runSuffix}`,
      }),
    );
    expect(updateResponse.status).toBe(200);

    const pinResponse = await route.POST(
      jsonRequest(apiUrl('/api/v1/announcements'), 'POST', {
        action: 'pin',
        id: sequentialAnnouncementId,
        communityId: communityA.id,
        isPinned: true,
      }),
    );
    expect(pinResponse.status).toBe(200);

    const archiveResponse = await route.POST(
      jsonRequest(apiUrl('/api/v1/announcements'), 'POST', {
        action: 'archive',
        id: sequentialAnnouncementId,
        communityId: communityA.id,
        archive: true,
      }),
    );
    expect(archiveResponse.status).toBe(200);
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

  // =========================================================================
  // 9. Soft-delete + restore
  // =========================================================================

  it('author can soft-delete, admin sees it with includeDeleted, restore round-trips', async () => {
    const kit = requireState();
    const route = requireRoute();
    const communityA = requireCommunity(kit, 'communityA');

    setActor(kit, 'actorA');
    const createResponse = await route.POST(
      jsonRequest(apiUrl('/api/v1/announcements'), 'POST', {
        communityId: communityA.id,
        title: `Delete me ${kit.runSuffix}`,
        body: 'Gone soon',
        audience: 'all',
        isPinned: false,
      }),
    );
    expect(createResponse.status).toBe(201);
    const created = await parseJson<{ data: Record<string, unknown> }>(createResponse);
    const toDeleteId = readNumberField(created.data, 'id');

    const deleteResponse = await route.DELETE(
      jsonRequest(apiUrl('/api/v1/announcements'), 'DELETE', {
        communityId: communityA.id,
        id: toDeleteId,
      }),
    );
    expect(deleteResponse.status).toBe(200);
    const deleted = await parseJson<{ data: { id: number; deleted: boolean } }>(deleteResponse);
    expect(deleted.data).toEqual({ id: toDeleteId, deleted: true });

    // Default list excludes it
    const listDefault = await route.GET(
      new NextRequest(apiUrl(`/api/v1/announcements?communityId=${communityA.id}`)),
    );
    const listDefaultJson = await parseJson<{ data: Array<Record<string, unknown>> }>(
      listDefault,
    );
    expect(listDefaultJson.data.find((a) => a['id'] === toDeleteId)).toBeUndefined();

    // Deleting again returns 404 (already soft-deleted)
    const repeatDelete = await route.DELETE(
      jsonRequest(apiUrl('/api/v1/announcements'), 'DELETE', {
        communityId: communityA.id,
        id: toDeleteId,
      }),
    );
    expect(repeatDelete.status).toBe(404);

    // Restore brings it back
    const restoreResponse = await route.POST(
      jsonRequest(apiUrl('/api/v1/announcements'), 'POST', {
        action: 'restore',
        communityId: communityA.id,
        id: toDeleteId,
      }),
    );
    expect(restoreResponse.status).toBe(200);

    const listAfterRestore = await route.GET(
      new NextRequest(apiUrl(`/api/v1/announcements?communityId=${communityA.id}`)),
    );
    const listAfterRestoreJson = await parseJson<{
      data: Array<Record<string, unknown>>;
    }>(listAfterRestore);
    const restored = listAfterRestoreJson.data.find((a) => a['id'] === toDeleteId);
    expect(restored).toBeDefined();
    expect(restored?.['deletedAt']).toBeNull();
  });

  it('tenant cannot delete an announcement they did not author (403)', async () => {
    const kit = requireState();
    const route = requireRoute();
    const communityA = requireCommunity(kit, 'communityA');

    // actorA creates
    setActor(kit, 'actorA');
    const createResponse = await route.POST(
      jsonRequest(apiUrl('/api/v1/announcements'), 'POST', {
        communityId: communityA.id,
        title: `Tenant cannot delete ${kit.runSuffix}`,
        body: 'protected',
        audience: 'all',
        isPinned: false,
      }),
    );
    const { data } = await parseJson<{ data: Record<string, unknown> }>(createResponse);
    const id = readNumberField(data, 'id');

    setActor(kit, 'tenantA');
    const deleteResponse = await route.DELETE(
      jsonRequest(apiUrl('/api/v1/announcements'), 'DELETE', {
        communityId: communityA.id,
        id,
      }),
    );
    expect(deleteResponse.status).toBe(403);
  });

  it('admin can delete an announcement authored by another admin (admin_removal path)', async () => {
    const kit = requireState();
    const route = requireRoute();
    const communityA = requireCommunity(kit, 'communityA');

    // residentA (role=manager, presetKey=board_member → announcements.write=true) authors the announcement
    setActor(kit, 'residentA');
    const createResponse = await route.POST(
      jsonRequest(apiUrl('/api/v1/announcements'), 'POST', {
        communityId: communityA.id,
        title: `Authored by member ${kit.runSuffix}`,
        body: 'member post',
        audience: 'all',
        isPinned: false,
      }),
    );
    expect(createResponse.status).toBe(201);
    const { data } = await parseJson<{ data: Record<string, unknown> }>(createResponse);
    const id = readNumberField(data, 'id');

    // actorA (board_president) deletes someone else's announcement
    setActor(kit, 'actorA');
    const deleteResponse = await route.DELETE(
      jsonRequest(apiUrl('/api/v1/announcements'), 'DELETE', {
        communityId: communityA.id,
        id,
      }),
    );
    expect(deleteResponse.status).toBe(200);
    const deleted = await parseJson<{ data: { id: number; deleted: boolean } }>(deleteResponse);
    expect(deleted.data).toEqual({ id, deleted: true });

    // Row is hidden from the default list
    const listDefault = await route.GET(
      new NextRequest(apiUrl(`/api/v1/announcements?communityId=${communityA.id}`)),
    );
    const listDefaultJson = await parseJson<{ data: Array<Record<string, unknown>> }>(
      listDefault,
    );
    expect(listDefaultJson.data.find((a) => a['id'] === id)).toBeUndefined();
  });

  it('non-admin cannot restore a soft-deleted announcement (403)', async () => {
    const kit = requireState();
    const route = requireRoute();
    const communityA = requireCommunity(kit, 'communityA');

    // actorA creates + soft-deletes their own announcement
    setActor(kit, 'actorA');
    const createResponse = await route.POST(
      jsonRequest(apiUrl('/api/v1/announcements'), 'POST', {
        communityId: communityA.id,
        title: `Non-admin restore denied ${kit.runSuffix}`,
        body: 'denied',
        audience: 'all',
        isPinned: false,
      }),
    );
    const { data } = await parseJson<{ data: Record<string, unknown> }>(createResponse);
    const id = readNumberField(data, 'id');

    const deleteResponse = await route.DELETE(
      jsonRequest(apiUrl('/api/v1/announcements'), 'DELETE', {
        communityId: communityA.id,
        id,
      }),
    );
    expect(deleteResponse.status).toBe(200);

    // tenantA lacks announcements:write — outer requirePermission rejects the restore action
    setActor(kit, 'tenantA');
    const restoreResponse = await route.POST(
      jsonRequest(apiUrl('/api/v1/announcements'), 'POST', {
        action: 'restore',
        communityId: communityA.id,
        id,
      }),
    );
    expect(restoreResponse.status).toBe(403);
  });

  it('restore of a non-deleted announcement is idempotent (200, deletedAt stays null)', async () => {
    const kit = requireState();
    const route = requireRoute();
    const communityA = requireCommunity(kit, 'communityA');

    setActor(kit, 'actorA');
    const createResponse = await route.POST(
      jsonRequest(apiUrl('/api/v1/announcements'), 'POST', {
        communityId: communityA.id,
        title: `Idempotent restore ${kit.runSuffix}`,
        body: 'live row',
        audience: 'all',
        isPinned: false,
      }),
    );
    const { data } = await parseJson<{ data: Record<string, unknown> }>(createResponse);
    const id = readNumberField(data, 'id');

    const restoreResponse = await route.POST(
      jsonRequest(apiUrl('/api/v1/announcements'), 'POST', {
        action: 'restore',
        communityId: communityA.id,
        id,
      }),
    );
    expect(restoreResponse.status).toBe(200);

    const listAfter = await route.GET(
      new NextRequest(apiUrl(`/api/v1/announcements?communityId=${communityA.id}`)),
    );
    const listAfterJson = await parseJson<{ data: Array<Record<string, unknown>> }>(listAfter);
    const row = listAfterJson.data.find((a) => a['id'] === id);
    expect(row).toBeDefined();
    expect(row?.['deletedAt']).toBeNull();
  });
});
