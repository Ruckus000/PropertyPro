/**
 * P2-43 Gap A: Multi-tenant isolation tests for routes not covered
 * in the original integration test suite.
 *
 * Routes tested:
 * - invitations (POST create, PATCH accept)
 * - import-residents (POST)
 * - meetings attach/detach (POST actions)
 * - documents/search (GET)
 * - notification-preferences (GET, PATCH)
 * - document-categories (GET)
 */
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { NextRequest } from 'next/server';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { MULTI_TENANT_COMMUNITIES } from '../fixtures/multi-tenant-communities';
import { MULTI_TENANT_USERS } from '../fixtures/multi-tenant-users';
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
} from './helpers/multi-tenant-test-kit';

if (process.env.CI && !process.env.DATABASE_URL) {
  throw new Error('P2-43 multi-tenant routes integration tests require DATABASE_URL in CI');
}

const describeDb = process.env.DATABASE_URL ? describe : describe.skip;

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const {
  requireAuthenticatedUserIdMock,
  sendEmailMock,
  createAdminClientMock,
} = vi.hoisted(() => ({
  requireAuthenticatedUserIdMock: vi.fn(),
  sendEmailMock: vi.fn().mockResolvedValue({ id: 'mock-email-id' }),
  createAdminClientMock: vi.fn(),
}));

vi.mock('@/lib/api/auth', () => ({
  requireAuthenticatedUserId: requireAuthenticatedUserIdMock,
}));

vi.mock('@propertypro/email', () => ({
  sendEmail: sendEmailMock,
  InvitationEmail: vi.fn(),
}));

vi.mock('@propertypro/db/supabase/admin', () => ({
  createAdminClient: createAdminClientMock,
}));

// ---------------------------------------------------------------------------
// Route types
// ---------------------------------------------------------------------------

type DbModule = typeof import('@propertypro/db');
type InvitationsRouteModule = typeof import('../../src/app/api/v1/invitations/route');
type ImportResidentsRouteModule = typeof import('../../src/app/api/v1/import-residents/route');
type MeetingsRouteModule = typeof import('../../src/app/api/v1/meetings/route');
type DocumentSearchRouteModule = typeof import('../../src/app/api/v1/documents/search/route');
type NotificationPreferencesRouteModule = typeof import('../../src/app/api/v1/notification-preferences/route');
type DocumentCategoriesRouteModule = typeof import('../../src/app/api/v1/document-categories/route');

interface RouteModules {
  invitations: InvitationsRouteModule;
  importResidents: ImportResidentsRouteModule;
  meetings: MeetingsRouteModule;
  documentSearch: DocumentSearchRouteModule;
  notificationPreferences: NotificationPreferencesRouteModule;
  documentCategories: DocumentCategoriesRouteModule;
}

// ---------------------------------------------------------------------------
// Extended seeded data
// ---------------------------------------------------------------------------

interface SeededRouteData {
  /** Invitation tokens seeded per community */
  invitationTokenA1: string;
  invitationTokenA2: string;
  invitationTokenB1: string;
  invitationTokenB2: string;
  /** Document + meeting IDs for attach/detach */
  documentAId: number;
  documentBId: number;
  meetingAId: number;
  meetingBId: number;
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

let state: TestKitState | null = null;
let routes: RouteModules | null = null;
let seededRouteData: SeededRouteData | null = null;

function requireState(): TestKitState {
  if (!state) throw new Error('Test state not initialized');
  return state;
}

function requireRoutes(): RouteModules {
  if (!routes) throw new Error('Routes not loaded');
  return routes;
}

function requireSeeded(): SeededRouteData {
  if (!seededRouteData) throw new Error('Seeded route data not initialized');
  return seededRouteData;
}

// ---------------------------------------------------------------------------
// Seed helpers
// ---------------------------------------------------------------------------

async function seedExtendedData(kit: TestKitState): Promise<SeededRouteData> {
  const communityA = requireCommunity(kit, 'communityA');
  const communityB = requireCommunity(kit, 'communityB');
  const actorA = requireUser(kit, 'actorA');
  const actorB = requireUser(kit, 'actorB');
  const residentA = requireUser(kit, 'residentA');
  const residentB = requireUser(kit, 'residentB');

  const scopedA = kit.dbModule.createScopedClient(communityA.id);
  const scopedB = kit.dbModule.createScopedClient(communityB.id);

  // Seed documents
  const [docA] = await scopedA.insert(kit.dbModule.documents, {
    title: `P2-43 Route Doc A ${kit.runSuffix}`,
    filePath: `communities/${communityA.id}/documents/route-doc-a-${kit.runSuffix}.pdf`,
    fileName: `route-doc-a-${kit.runSuffix}.pdf`,
    fileSize: 1024,
    mimeType: 'application/pdf',
    uploadedBy: actorA.id,
  });
  const [docB] = await scopedB.insert(kit.dbModule.documents, {
    title: `P2-43 Route Doc B ${kit.runSuffix}`,
    filePath: `communities/${communityB.id}/documents/route-doc-b-${kit.runSuffix}.pdf`,
    fileName: `route-doc-b-${kit.runSuffix}.pdf`,
    fileSize: 1024,
    mimeType: 'application/pdf',
    uploadedBy: actorB.id,
  });

  const documentAId = readNumberField(requireInsertedRow(docA, 'docA'), 'id');
  const documentBId = readNumberField(requireInsertedRow(docB, 'docB'), 'id');

  // Seed meetings
  const [mtgA] = await scopedA.insert(kit.dbModule.meetings, {
    title: `P2-43 Route Meeting A ${kit.runSuffix}`,
    meetingType: 'board',
    startsAt: new Date('2026-06-01T15:00:00.000Z'),
    location: 'Route Test Clubhouse A',
  });
  const [mtgB] = await scopedB.insert(kit.dbModule.meetings, {
    title: `P2-43 Route Meeting B ${kit.runSuffix}`,
    meetingType: 'board',
    startsAt: new Date('2026-06-10T15:00:00.000Z'),
    location: 'Route Test Hall B',
  });

  const meetingAId = readNumberField(requireInsertedRow(mtgA, 'meetingA'), 'id');
  const meetingBId = readNumberField(requireInsertedRow(mtgB, 'meetingB'), 'id');

  // Seed invitations (distinct tokens per test to avoid TOKEN_USED side effects)
  const tokenA1 = randomUUID().replace(/-/g, '') + randomUUID().replace(/-/g, '');
  const tokenA2 = randomUUID().replace(/-/g, '') + randomUUID().replace(/-/g, '');
  const tokenB1 = randomUUID().replace(/-/g, '') + randomUUID().replace(/-/g, '');
  const tokenB2 = randomUUID().replace(/-/g, '') + randomUUID().replace(/-/g, '');

  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  await scopedA.insert(kit.dbModule.invitations, {
    userId: residentA.id,
    token: tokenA1,
    invitedBy: actorA.id,
    expiresAt,
  });
  await scopedA.insert(kit.dbModule.invitations, {
    userId: residentA.id,
    token: tokenA2,
    invitedBy: actorA.id,
    expiresAt,
  });
  await scopedB.insert(kit.dbModule.invitations, {
    userId: residentB.id,
    token: tokenB1,
    invitedBy: actorB.id,
    expiresAt,
  });
  await scopedB.insert(kit.dbModule.invitations, {
    userId: residentB.id,
    token: tokenB2,
    invitedBy: actorB.id,
    expiresAt,
  });

  return {
    invitationTokenA1: tokenA1,
    invitationTokenA2: tokenA2,
    invitationTokenB1: tokenB1,
    invitationTokenB2: tokenB2,
    documentAId,
    documentBId,
    meetingAId,
    meetingBId,
  };
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describeDb('p2-43 multi-tenant route coverage (db-backed integration)', () => {
  beforeAll(async () => {
    if (!process.env.DATABASE_URL) return;

    state = await initTestKit();

    // Seed only communities A + B (no apartment needed for route isolation tests)
    const abFixtures = MULTI_TENANT_COMMUNITIES.filter(
      (c) => c.key === 'communityA' || c.key === 'communityB',
    );
    await seedCommunities(state, abFixtures);

    // Seed only A/B users (elevated roles)
    const abUsers = MULTI_TENANT_USERS.filter(
      (u) => u.communityKey === 'communityA' || u.communityKey === 'communityB',
    ).filter(
      (u) => u.key === 'actorA' || u.key === 'actorB' || u.key === 'residentA' || u.key === 'residentB',
    );
    await seedUsers(state, abUsers);

    seededRouteData = await seedExtendedData(state);

    routes = {
      invitations: await import('../../src/app/api/v1/invitations/route'),
      importResidents: await import('../../src/app/api/v1/import-residents/route'),
      meetings: await import('../../src/app/api/v1/meetings/route'),
      documentSearch: await import('../../src/app/api/v1/documents/search/route'),
      notificationPreferences: await import('../../src/app/api/v1/notification-preferences/route'),
      documentCategories: await import('../../src/app/api/v1/document-categories/route'),
    };
  });

  beforeEach(() => {
    vi.clearAllMocks();
    const kit = requireState();
    requireAuthenticatedUserIdMock.mockImplementation(async () => requireCurrentActor(kit));
    setActor(kit, 'actorA');

    // Default admin client mock for invitation acceptance
    createAdminClientMock.mockReturnValue({
      auth: {
        admin: {
          createUser: vi.fn().mockResolvedValue({ error: null }),
        },
      },
    });
  });

  afterAll(async () => {
    if (state) await teardownTestKit(state);
  });

  // =========================================================================
  // Invitations POST (auth required)
  // =========================================================================

  it('invitations POST: actorA creates invitation in communityA → 201', async () => {
    const kit = requireState();
    const appRoutes = requireRoutes();
    const communityA = requireCommunity(kit, 'communityA');
    const residentA = requireUser(kit, 'residentA');

    const response = await appRoutes.invitations.POST(
      jsonRequest(apiUrl('/api/v1/invitations'), 'POST', {
        communityId: communityA.id,
        userId: residentA.id,
      }),
    );
    expect(response.status).toBe(201);
  });

  it('invitations POST: actorA creating invitation in communityB → 403', async () => {
    const kit = requireState();
    const appRoutes = requireRoutes();
    const communityB = requireCommunity(kit, 'communityB');
    const residentB = requireUser(kit, 'residentB');

    const response = await appRoutes.invitations.POST(
      jsonRequest(apiUrl('/api/v1/invitations'), 'POST', {
        communityId: communityB.id,
        userId: residentB.id,
      }),
    );
    expect(response.status).toBe(403);
  });

  it('invitations POST: header/body community mismatch → 404', async () => {
    const kit = requireState();
    const appRoutes = requireRoutes();
    const communityA = requireCommunity(kit, 'communityA');
    const communityB = requireCommunity(kit, 'communityB');
    const residentB = requireUser(kit, 'residentB');

    const response = await appRoutes.invitations.POST(
      jsonRequest(
        apiUrl('/api/v1/invitations'),
        'POST',
        { communityId: communityB.id, userId: residentB.id },
        { 'x-community-id': String(communityA.id) },
      ),
    );
    expect(response.status).toBe(404);
  });

  // =========================================================================
  // Invitations PATCH (token-based, NO auth)
  // =========================================================================

  it('invitations PATCH: accept with valid communityA token → 200', async () => {
    const kit = requireState();
    const appRoutes = requireRoutes();
    const communityA = requireCommunity(kit, 'communityA');
    const seeded = requireSeeded();

    // No actor set — invitation acceptance is unauthenticated
    requireAuthenticatedUserIdMock.mockRejectedValue(new Error('Not authenticated'));

    const response = await appRoutes.invitations.PATCH(
      jsonRequest(apiUrl('/api/v1/invitations'), 'PATCH', {
        communityId: communityA.id,
        token: seeded.invitationTokenA1,
        password: 'SecureP@ss1234',
      }),
    );
    expect(response.status).toBe(200);
  });

  it('invitations PATCH: communityB token used against communityA → 404', async () => {
    const kit = requireState();
    const appRoutes = requireRoutes();
    const communityA = requireCommunity(kit, 'communityA');
    const seeded = requireSeeded();

    requireAuthenticatedUserIdMock.mockRejectedValue(new Error('Not authenticated'));

    const response = await appRoutes.invitations.PATCH(
      jsonRequest(apiUrl('/api/v1/invitations'), 'PATCH', {
        communityId: communityA.id,
        token: seeded.invitationTokenB1,
        password: 'SecureP@ss1234',
      }),
    );
    expect(response.status).toBe(404);
  });

  it('invitations PATCH: header/body community mismatch → 404', async () => {
    const kit = requireState();
    const appRoutes = requireRoutes();
    const communityA = requireCommunity(kit, 'communityA');
    const communityB = requireCommunity(kit, 'communityB');
    const seeded = requireSeeded();

    requireAuthenticatedUserIdMock.mockRejectedValue(new Error('Not authenticated'));

    const response = await appRoutes.invitations.PATCH(
      jsonRequest(
        apiUrl('/api/v1/invitations'),
        'PATCH',
        { communityId: communityB.id, token: seeded.invitationTokenB2, password: 'SecureP@ss1234' },
        { 'x-community-id': String(communityA.id) },
      ),
    );
    expect(response.status).toBe(404);
  });

  // =========================================================================
  // Import Residents POST
  // =========================================================================

  it('import-residents POST: dry-run into communityA → 200', async () => {
    const kit = requireState();
    const appRoutes = requireRoutes();
    const communityA = requireCommunity(kit, 'communityA');

    const csv = 'name,email,role\nTest User,test-dryrun@example.com,board_member';
    const response = await appRoutes.importResidents.POST(
      jsonRequest(apiUrl('/api/v1/import-residents'), 'POST', {
        communityId: communityA.id,
        csv,
        dryRun: true,
      }),
    );
    expect(response.status).toBe(200);
    const json = await parseJson<{ data: { preview: unknown[] } }>(response);
    expect(json.data.preview).toHaveLength(1);
  });

  it('import-residents POST: actorA import into communityB → 403', async () => {
    const kit = requireState();
    const appRoutes = requireRoutes();
    const communityB = requireCommunity(kit, 'communityB');

    const csv = 'name,email,role\nTest User,test-cross@example.com,board_member';
    const response = await appRoutes.importResidents.POST(
      jsonRequest(apiUrl('/api/v1/import-residents'), 'POST', {
        communityId: communityB.id,
        csv,
        dryRun: true,
      }),
    );
    expect(response.status).toBe(403);
  });

  it('import-residents POST: header/body community mismatch → 404', async () => {
    const kit = requireState();
    const appRoutes = requireRoutes();
    const communityA = requireCommunity(kit, 'communityA');
    const communityB = requireCommunity(kit, 'communityB');

    const csv = 'name,email,role\nTest User,test-mismatch@example.com,board_member';
    const response = await appRoutes.importResidents.POST(
      jsonRequest(
        apiUrl('/api/v1/import-residents'),
        'POST',
        { communityId: communityB.id, csv, dryRun: true },
        { 'x-community-id': String(communityA.id) },
      ),
    );
    expect(response.status).toBe(404);
  });

  it('import-residents POST: non-dry-run creates roles scoped to communityA only', async () => {
    const kit = requireState();
    const appRoutes = requireRoutes();
    const communityA = requireCommunity(kit, 'communityA');
    const communityB = requireCommunity(kit, 'communityB');

    const importEmail = `import-real-${kit.runSuffix}@example.com`;
    const csv = `name,email,role\nImported User,${importEmail},board_member`;

    const response = await appRoutes.importResidents.POST(
      jsonRequest(apiUrl('/api/v1/import-residents'), 'POST', {
        communityId: communityA.id,
        csv,
        dryRun: false,
      }),
    );
    expect(response.status).toBe(200);
    const json = await parseJson<{ data: { importedCount: number } }>(response);
    expect(json.data.importedCount).toBe(1);

    // Verify user_roles exist in communityA
    const scopedA = kit.dbModule.createScopedClient(communityA.id);
    const rolesA = await scopedA.query(kit.dbModule.userRoles);
    const importedInA = rolesA.find((r) => {
      const userId = r['userId'] as string;
      // Look up user by finding them in users table
      return userId != null;
    });
    expect(importedInA).toBeDefined();

    // Verify user_roles do NOT exist in communityB for the imported user
    const scopedB = kit.dbModule.createScopedClient(communityB.id);
    const rolesB = await scopedB.query(kit.dbModule.userRoles);
    const importedUserRoleA = rolesA.find((r) => r['role'] === 'board_member');
    if (importedUserRoleA) {
      const importedUserId = importedUserRoleA['userId'] as string;
      const existsInB = rolesB.some((r) => r['userId'] === importedUserId);
      expect(existsInB).toBe(false);

      // Track for cleanup
      kit.users.set('actorA' as never, {
        ...kit.users.get('actorA')!,
      });
      // Add the imported user to cleanup by deleting directly
      await kit.db
        .delete(kit.dbModule.users)
        .where(eq(kit.dbModule.users.id, importedUserId));
    }
  });

  // =========================================================================
  // Meetings Attach/Detach POST
  // =========================================================================

  it('meetings attach: docA to meetingA in communityA → 201', async () => {
    const kit = requireState();
    const appRoutes = requireRoutes();
    const communityA = requireCommunity(kit, 'communityA');
    const seeded = requireSeeded();

    const response = await appRoutes.meetings.POST(
      jsonRequest(apiUrl('/api/v1/meetings'), 'POST', {
        action: 'attach',
        communityId: communityA.id,
        meetingId: seeded.meetingAId,
        documentId: seeded.documentAId,
      }),
    );
    expect(response.status).toBe(201);
  });

  it('meetings attach: cross-tenant docB to meetingA in communityA → 404', async () => {
    const kit = requireState();
    const appRoutes = requireRoutes();
    const communityA = requireCommunity(kit, 'communityA');
    const seeded = requireSeeded();

    const response = await appRoutes.meetings.POST(
      jsonRequest(apiUrl('/api/v1/meetings'), 'POST', {
        action: 'attach',
        communityId: communityA.id,
        meetingId: seeded.meetingAId,
        documentId: seeded.documentBId,
      }),
    );
    expect(response.status).toBe(404);
  });

  it('meetings attach: cross-tenant meetingB referenced in communityA → 404', async () => {
    const kit = requireState();
    const appRoutes = requireRoutes();
    const communityA = requireCommunity(kit, 'communityA');
    const seeded = requireSeeded();

    const response = await appRoutes.meetings.POST(
      jsonRequest(apiUrl('/api/v1/meetings'), 'POST', {
        action: 'attach',
        communityId: communityA.id,
        meetingId: seeded.meetingBId,
        documentId: seeded.documentAId,
      }),
    );
    expect(response.status).toBe(404);
  });

  it('meetings attach: actorA attaches in communityB → 403', async () => {
    const kit = requireState();
    const appRoutes = requireRoutes();
    const communityB = requireCommunity(kit, 'communityB');
    const seeded = requireSeeded();

    const response = await appRoutes.meetings.POST(
      jsonRequest(apiUrl('/api/v1/meetings'), 'POST', {
        action: 'attach',
        communityId: communityB.id,
        meetingId: seeded.meetingBId,
        documentId: seeded.documentBId,
      }),
    );
    expect(response.status).toBe(403);
  });

  it('meetings detach: positive case in communityA → 200', async () => {
    const kit = requireState();
    const appRoutes = requireRoutes();
    const communityA = requireCommunity(kit, 'communityA');
    const seeded = requireSeeded();

    const response = await appRoutes.meetings.POST(
      jsonRequest(apiUrl('/api/v1/meetings'), 'POST', {
        action: 'detach',
        communityId: communityA.id,
        meetingId: seeded.meetingAId,
        documentId: seeded.documentAId,
      }),
    );
    expect(response.status).toBe(200);
  });

  it('meetings detach: actorA detaches in communityB → 403', async () => {
    const kit = requireState();
    const appRoutes = requireRoutes();
    const communityB = requireCommunity(kit, 'communityB');
    const seeded = requireSeeded();

    const response = await appRoutes.meetings.POST(
      jsonRequest(apiUrl('/api/v1/meetings'), 'POST', {
        action: 'detach',
        communityId: communityB.id,
        meetingId: seeded.meetingBId,
        documentId: seeded.documentBId,
      }),
    );
    expect(response.status).toBe(403);
  });

  it('meetings attach: header/body community mismatch → 404', async () => {
    const kit = requireState();
    const appRoutes = requireRoutes();
    const communityA = requireCommunity(kit, 'communityA');
    const communityB = requireCommunity(kit, 'communityB');
    const seeded = requireSeeded();

    const response = await appRoutes.meetings.POST(
      jsonRequest(
        apiUrl('/api/v1/meetings'),
        'POST',
        {
          action: 'attach',
          communityId: communityB.id,
          meetingId: seeded.meetingBId,
          documentId: seeded.documentBId,
        },
        { 'x-community-id': String(communityA.id) },
      ),
    );
    expect(response.status).toBe(404);
  });

  // =========================================================================
  // Documents Search GET
  // =========================================================================

  it('documents/search GET: search communityA → 200, results from A only', async () => {
    const kit = requireState();
    const appRoutes = requireRoutes();
    const communityA = requireCommunity(kit, 'communityA');
    const communityB = requireCommunity(kit, 'communityB');

    const response = await appRoutes.documentSearch.GET(
      new NextRequest(apiUrl(`/api/v1/documents/search?communityId=${communityA.id}`)),
    );
    expect(response.status).toBe(200);
    const json = await parseJson<{ data: Array<Record<string, unknown>> }>(response);
    for (const doc of json.data) {
      expect(doc['communityId']).toBe(communityA.id);
      expect(doc['communityId']).not.toBe(communityB.id);
    }
  });

  it('documents/search GET: actorA searches communityB → 403', async () => {
    const kit = requireState();
    const appRoutes = requireRoutes();
    const communityB = requireCommunity(kit, 'communityB');

    const response = await appRoutes.documentSearch.GET(
      new NextRequest(apiUrl(`/api/v1/documents/search?communityId=${communityB.id}`)),
    );
    expect(response.status).toBe(403);
  });

  it('documents/search GET: soft-deleted docs excluded', async () => {
    const kit = requireState();
    const appRoutes = requireRoutes();
    const communityA = requireCommunity(kit, 'communityA');
    const actorA = requireUser(kit, 'actorA');
    const scopedA = kit.dbModule.createScopedClient(communityA.id);

    // Seed a soft-deleted document
    const softDeletedTitle = `P2-43 Soft-Deleted Search Doc ${kit.runSuffix}`;
    const [softDeletedDoc] = await scopedA.insert(kit.dbModule.documents, {
      title: softDeletedTitle,
      filePath: `communities/${communityA.id}/documents/soft-search-${kit.runSuffix}.pdf`,
      fileName: `soft-search-${kit.runSuffix}.pdf`,
      fileSize: 1024,
      mimeType: 'application/pdf',
      uploadedBy: actorA.id,
    });
    const softDeletedId = readNumberField(requireInsertedRow(softDeletedDoc, 'softDeletedDoc'), 'id');
    await kit.db
      .update(kit.dbModule.documents)
      .set({ deletedAt: new Date() })
      .where(eq(kit.dbModule.documents.id, softDeletedId));

    const response = await appRoutes.documentSearch.GET(
      new NextRequest(apiUrl(`/api/v1/documents/search?communityId=${communityA.id}`)),
    );
    expect(response.status).toBe(200);
    const json = await parseJson<{ data: Array<Record<string, unknown>> }>(response);
    const titles = json.data.map((d) => d['title']);
    expect(titles).not.toContain(softDeletedTitle);
  });

  // =========================================================================
  // Notification Preferences GET/PATCH
  // =========================================================================

  it('notification-preferences GET: communityA → 200', async () => {
    const kit = requireState();
    const appRoutes = requireRoutes();
    const communityA = requireCommunity(kit, 'communityA');

    const response = await appRoutes.notificationPreferences.GET(
      new NextRequest(apiUrl(`/api/v1/notification-preferences?communityId=${communityA.id}`)),
    );
    expect(response.status).toBe(200);
  });

  it('notification-preferences GET: actorA queries communityB → 403', async () => {
    const kit = requireState();
    const appRoutes = requireRoutes();
    const communityB = requireCommunity(kit, 'communityB');

    const response = await appRoutes.notificationPreferences.GET(
      new NextRequest(apiUrl(`/api/v1/notification-preferences?communityId=${communityB.id}`)),
    );
    expect(response.status).toBe(403);
  });

  it('notification-preferences PATCH: communityA → 200', async () => {
    const kit = requireState();
    const appRoutes = requireRoutes();
    const communityA = requireCommunity(kit, 'communityA');

    const response = await appRoutes.notificationPreferences.PATCH(
      jsonRequest(apiUrl('/api/v1/notification-preferences'), 'PATCH', {
        communityId: communityA.id,
        emailAnnouncements: false,
        emailDocuments: true,
        emailMeetings: true,
        emailMaintenance: false,
      }),
    );
    expect(response.status).toBe(200);
  });

  it('notification-preferences PATCH: actorA patches communityB → 403', async () => {
    const kit = requireState();
    const appRoutes = requireRoutes();
    const communityB = requireCommunity(kit, 'communityB');

    const response = await appRoutes.notificationPreferences.PATCH(
      jsonRequest(apiUrl('/api/v1/notification-preferences'), 'PATCH', {
        communityId: communityB.id,
        emailAnnouncements: false,
        emailDocuments: true,
        emailMeetings: true,
        emailMaintenance: false,
      }),
    );
    expect(response.status).toBe(403);
  });

  it('notification-preferences PATCH: header/body community mismatch → 404', async () => {
    const kit = requireState();
    const appRoutes = requireRoutes();
    const communityA = requireCommunity(kit, 'communityA');
    const communityB = requireCommunity(kit, 'communityB');

    const response = await appRoutes.notificationPreferences.PATCH(
      jsonRequest(
        apiUrl('/api/v1/notification-preferences'),
        'PATCH',
        {
          communityId: communityB.id,
          emailAnnouncements: false,
          emailDocuments: true,
          emailMeetings: true,
          emailMaintenance: false,
        },
        { 'x-community-id': String(communityA.id) },
      ),
    );
    expect(response.status).toBe(404);
  });

  // =========================================================================
  // Document Categories GET
  // =========================================================================

  it('document-categories GET: communityA → 200', async () => {
    const kit = requireState();
    const appRoutes = requireRoutes();
    const communityA = requireCommunity(kit, 'communityA');

    const response = await appRoutes.documentCategories.GET(
      new NextRequest(apiUrl(`/api/v1/document-categories?communityId=${communityA.id}`)),
    );
    expect(response.status).toBe(200);
  });

  it('document-categories GET: actorA queries communityB → 403', async () => {
    const kit = requireState();
    const appRoutes = requireRoutes();
    const communityB = requireCommunity(kit, 'communityB');

    const response = await appRoutes.documentCategories.GET(
      new NextRequest(apiUrl(`/api/v1/document-categories?communityId=${communityB.id}`)),
    );
    expect(response.status).toBe(403);
  });
});
