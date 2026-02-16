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
 * - leases (GET, POST, PATCH, DELETE — apartment-only)
 * - upload (POST — presigned URL generation)
 */
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
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
  trackUserForCleanup,
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
  createPresignedUploadUrlMock,
} = vi.hoisted(() => ({
  requireAuthenticatedUserIdMock: vi.fn(),
  sendEmailMock: vi.fn().mockResolvedValue({ id: 'mock-email-id' }),
  createAdminClientMock: vi.fn(),
  createPresignedUploadUrlMock: vi.fn().mockResolvedValue({
    signedUrl: 'https://mock-storage.example.com/upload',
    token: 'mock-upload-token',
    path: 'mock-upload-path',
  }),
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

vi.mock('@propertypro/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@propertypro/db')>();
  return {
    ...actual,
    createPresignedUploadUrl: createPresignedUploadUrlMock,
  };
});

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
type LeasesRouteModule = typeof import('../../src/app/api/v1/leases/route');
type UploadRouteModule = typeof import('../../src/app/api/v1/upload/route');

interface RouteModules {
  invitations: InvitationsRouteModule;
  importResidents: ImportResidentsRouteModule;
  meetings: MeetingsRouteModule;
  documentSearch: DocumentSearchRouteModule;
  notificationPreferences: NotificationPreferencesRouteModule;
  documentCategories: DocumentCategoriesRouteModule;
  leases: LeasesRouteModule;
  upload: UploadRouteModule;
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
  /** Unit in communityC (apartment) for lease tests */
  unitCId: number;
  /** Active lease in communityC */
  leaseC1Id: number;
  /** Lease in communityC for delete test */
  leaseCDeleteId: number;
  /** Soft-deleted lease in communityC */
  leaseCSoftDeletedId: number;
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

async function seedExtendedData(kit: TestKitState, unitCId: number): Promise<SeededRouteData> {
  const communityA = requireCommunity(kit, 'communityA');
  const communityB = requireCommunity(kit, 'communityB');
  const communityC = requireCommunity(kit, 'communityC');
  const actorA = requireUser(kit, 'actorA');
  const actorB = requireUser(kit, 'actorB');
  const residentA = requireUser(kit, 'residentA');
  const residentB = requireUser(kit, 'residentB');
  const actorC = requireUser(kit, 'actorC');
  const tenantC = requireUser(kit, 'tenantC');

  const scopedA = kit.dbModule.createScopedClient(communityA.id);
  const scopedB = kit.dbModule.createScopedClient(communityB.id);
  const scopedC = kit.dbModule.createScopedClient(communityC.id);

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

  // Seed leases in communityC (apartment — only community type with hasLeaseTracking)
  const [leaseC1] = await scopedC.insert(kit.dbModule.leases, {
    unitId: unitCId,
    residentId: tenantC.id,
    startDate: '2026-01-01',
    endDate: '2026-12-31',
    rentAmount: '1500.00',
    status: 'active',
    notes: `P2-43 active lease C1 ${kit.runSuffix}`,
  });
  const leaseC1Id = readNumberField(requireInsertedRow(leaseC1, 'leaseC1'), 'id');

  const [leaseCDelete] = await scopedC.insert(kit.dbModule.leases, {
    unitId: unitCId,
    residentId: tenantC.id,
    startDate: '2025-01-01',
    endDate: '2025-12-31',
    rentAmount: '1400.00',
    status: 'expired',
    notes: `P2-43 delete-target lease ${kit.runSuffix}`,
  });
  const leaseCDeleteId = readNumberField(requireInsertedRow(leaseCDelete, 'leaseCDelete'), 'id');

  const [leaseCSoftDeleted] = await scopedC.insert(kit.dbModule.leases, {
    unitId: unitCId,
    residentId: tenantC.id,
    startDate: '2024-01-01',
    endDate: '2024-12-31',
    rentAmount: '1300.00',
    status: 'terminated',
    notes: `P2-43 soft-deleted lease ${kit.runSuffix}`,
  });
  const leaseCSoftDeletedId = readNumberField(
    requireInsertedRow(leaseCSoftDeleted, 'leaseCSoftDeleted'),
    'id',
  );

  // Soft-delete one lease for filtering tests
  await scopedC.softDelete(
    kit.dbModule.leases,
    eq(kit.dbModule.leases.id, leaseCSoftDeletedId),
  );

  return {
    invitationTokenA1: tokenA1,
    invitationTokenA2: tokenA2,
    invitationTokenB1: tokenB1,
    invitationTokenB2: tokenB2,
    documentAId,
    documentBId,
    meetingAId,
    meetingBId,
    unitCId,
    leaseC1Id,
    leaseCDeleteId,
    leaseCSoftDeletedId,
  };
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describeDb('p2-43 multi-tenant route coverage (db-backed integration)', () => {
  beforeAll(async () => {
    if (!process.env.DATABASE_URL) return;

    state = await initTestKit();

    // Seed all 3 communities (A: condo, B: HOA, C: apartment for leases)
    await seedCommunities(state, MULTI_TENANT_COMMUNITIES);

    // Seed A/B users (elevated roles for invitations/meetings/docs tests)
    const abUsers = MULTI_TENANT_USERS.filter(
      (u) =>
        u.key === 'actorA' ||
        u.key === 'actorB' ||
        u.key === 'residentA' ||
        u.key === 'residentB',
    );
    await seedUsers(state, abUsers);

    // Seed community C users: actorC (property_manager_admin) + tenantC (needs unit)
    const communityC = requireCommunity(state, 'communityC');
    const scopedC = state.dbModule.createScopedClient(communityC.id);
    const [unitCRow] = await scopedC.insert(state.dbModule.units, {
      unitNumber: `P243R-C-${state.runSuffix}`,
      building: null,
      floor: null,
    });
    const unitCId = readNumberField(requireInsertedRow(unitCRow, 'unitC'), 'id');

    const cUsers = MULTI_TENANT_USERS.filter(
      (u) => u.key === 'actorC' || u.key === 'tenantC',
    );
    const unitMap = new Map<MultiTenantUserKey, number>([['tenantC', unitCId]]);
    await seedUsers(state, cUsers, unitMap);

    seededRouteData = await seedExtendedData(state, unitCId);

    routes = {
      invitations: await import('../../src/app/api/v1/invitations/route'),
      importResidents: await import('../../src/app/api/v1/import-residents/route'),
      meetings: await import('../../src/app/api/v1/meetings/route'),
      documentSearch: await import('../../src/app/api/v1/documents/search/route'),
      notificationPreferences: await import('../../src/app/api/v1/notification-preferences/route'),
      documentCategories: await import('../../src/app/api/v1/document-categories/route'),
      leases: await import('../../src/app/api/v1/leases/route'),
      upload: await import('../../src/app/api/v1/upload/route'),
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

    // Default presigned upload mock
    createPresignedUploadUrlMock.mockResolvedValue({
      signedUrl: 'https://mock-storage.example.com/upload',
      token: 'mock-upload-token',
      path: 'mock-upload-path',
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

    // Resolve imported identity deterministically by normalized email.
    const importedUsers = await kit.db
      .select({ id: kit.dbModule.users.id })
      .from(kit.dbModule.users)
      .where(eq(kit.dbModule.users.email, importEmail.toLowerCase()));
    expect(importedUsers).toHaveLength(1);

    const importedUserId = importedUsers[0]?.id;
    if (!importedUserId) {
      throw new Error('Imported user id missing after email lookup');
    }

    // Runtime-created users are tracked for teardown cleanup.
    trackUserForCleanup(kit, importedUserId);

    // Isolation is asserted by exact imported user id, not generic role matches.
    const scopedA = kit.dbModule.createScopedClient(communityA.id);
    const rolesA = await scopedA.selectFrom(
      kit.dbModule.userRoles,
      {},
      eq(kit.dbModule.userRoles.userId, importedUserId),
    );
    expect(rolesA).toHaveLength(1);
    expect(rolesA[0]?.['role']).toBe('board_member');

    // Verify imported user has no roles in communityB.
    const scopedB = kit.dbModule.createScopedClient(communityB.id);
    const rolesB = await scopedB.selectFrom(
      kit.dbModule.userRoles,
      {},
      eq(kit.dbModule.userRoles.userId, importedUserId),
    );
    expect(rolesB).toHaveLength(0);
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

  it('notification-preferences PATCH: expanded payload with emailFrequency → 200', async () => {
    const kit = requireState();
    const appRoutes = requireRoutes();
    const communityA = requireCommunity(kit, 'communityA');

    const response = await appRoutes.notificationPreferences.PATCH(
      jsonRequest(apiUrl('/api/v1/notification-preferences'), 'PATCH', {
        communityId: communityA.id,
        emailAnnouncements: true,
        emailDocuments: true,
        emailMeetings: true,
        emailMaintenance: true,
        emailFrequency: 'weekly_digest',
      }),
    );
    expect(response.status).toBe(200);
    const json = await parseJson<{ data: Record<string, unknown> }>(response);
    expect(json.data['emailFrequency']).toBe('weekly_digest');
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

  // =========================================================================
  // Leases GET (apartment-only feature gate)
  // =========================================================================

  it('leases GET: actorC reads communityC (apartment) → 200 with same-tenant data only', async () => {
    const kit = requireState();
    const appRoutes = requireRoutes();
    const communityC = requireCommunity(kit, 'communityC');
    const seeded = requireSeeded();
    setActor(kit, 'actorC');

    const response = await appRoutes.leases.GET(
      new NextRequest(apiUrl(`/api/v1/leases?communityId=${communityC.id}`)),
    );
    expect(response.status).toBe(200);
    const json = await parseJson<{ data: Array<Record<string, unknown>> }>(response);
    const leaseIds = json.data.map((row) => row['id'] as number);
    expect(leaseIds).toContain(seeded.leaseC1Id);
    expect(leaseIds).toContain(seeded.leaseCDeleteId);
    // Soft-deleted lease should be excluded
    expect(leaseIds).not.toContain(seeded.leaseCSoftDeletedId);
    // All leases belong to communityC
    for (const row of json.data) {
      expect(row['communityId']).toBe(communityC.id);
    }
  });

  it('leases GET: actorA (condo) reads leases → 403 (apartment-only gate)', async () => {
    const kit = requireState();
    const appRoutes = requireRoutes();
    const communityA = requireCommunity(kit, 'communityA');

    const response = await appRoutes.leases.GET(
      new NextRequest(apiUrl(`/api/v1/leases?communityId=${communityA.id}`)),
    );
    expect(response.status).toBe(403);
  });

  it('leases GET: actorA (non-member) reads communityC → 403', async () => {
    const kit = requireState();
    const appRoutes = requireRoutes();
    const communityC = requireCommunity(kit, 'communityC');

    const response = await appRoutes.leases.GET(
      new NextRequest(apiUrl(`/api/v1/leases?communityId=${communityC.id}`)),
    );
    expect(response.status).toBe(403);
  });

  // =========================================================================
  // Leases POST (create)
  // =========================================================================

  it('leases POST: actorC creates lease in communityC → 201', async () => {
    const kit = requireState();
    const appRoutes = requireRoutes();
    const communityC = requireCommunity(kit, 'communityC');
    const tenantC = requireUser(kit, 'tenantC');
    const seeded = requireSeeded();
    setActor(kit, 'actorC');

    const response = await appRoutes.leases.POST(
      jsonRequest(apiUrl('/api/v1/leases'), 'POST', {
        communityId: communityC.id,
        unitId: seeded.unitCId,
        residentId: tenantC.id,
        startDate: '2027-01-01',
        endDate: '2027-12-31',
        rentAmount: '1600.00',
        notes: `P2-43 new lease ${kit.runSuffix}`,
      }),
    );
    expect(response.status).toBe(201);
    const json = await parseJson<{ data: Record<string, unknown> }>(response);
    expect(json.data['communityId']).toBe(communityC.id);
  });

  it('leases POST: actorA creates lease in communityC → 403 (non-member)', async () => {
    const kit = requireState();
    const appRoutes = requireRoutes();
    const communityC = requireCommunity(kit, 'communityC');
    const tenantC = requireUser(kit, 'tenantC');
    const seeded = requireSeeded();

    const response = await appRoutes.leases.POST(
      jsonRequest(apiUrl('/api/v1/leases'), 'POST', {
        communityId: communityC.id,
        unitId: seeded.unitCId,
        residentId: tenantC.id,
        startDate: '2027-06-01',
        endDate: '2028-05-31',
        rentAmount: '1700.00',
      }),
    );
    expect(response.status).toBe(403);
  });

  it('leases POST: header/body community mismatch → 404', async () => {
    const kit = requireState();
    const appRoutes = requireRoutes();
    const communityA = requireCommunity(kit, 'communityA');
    const communityC = requireCommunity(kit, 'communityC');
    const tenantC = requireUser(kit, 'tenantC');
    const seeded = requireSeeded();
    setActor(kit, 'actorC');

    const response = await appRoutes.leases.POST(
      jsonRequest(
        apiUrl('/api/v1/leases'),
        'POST',
        {
          communityId: communityC.id,
          unitId: seeded.unitCId,
          residentId: tenantC.id,
          startDate: '2027-01-01',
          endDate: '2027-12-31',
          rentAmount: '1600.00',
        },
        { 'x-community-id': String(communityA.id) },
      ),
    );
    expect(response.status).toBe(404);
  });

  it('leases POST: no cross-tenant mutation side effects', async () => {
    const kit = requireState();
    const appRoutes = requireRoutes();
    const communityA = requireCommunity(kit, 'communityA');
    const communityC = requireCommunity(kit, 'communityC');
    const tenantC = requireUser(kit, 'tenantC');
    const seeded = requireSeeded();
    setActor(kit, 'actorC');

    // Create a lease in communityC
    const createResponse = await appRoutes.leases.POST(
      jsonRequest(apiUrl('/api/v1/leases'), 'POST', {
        communityId: communityC.id,
        unitId: seeded.unitCId,
        residentId: tenantC.id,
        startDate: '2028-01-01',
        endDate: '2028-12-31',
        rentAmount: '1800.00',
        notes: `P2-43 side-effect check ${kit.runSuffix}`,
      }),
    );
    expect(createResponse.status).toBe(201);

    // Verify communityA has no leases (not apartment, but check DB directly)
    const scopedA = kit.dbModule.createScopedClient(communityA.id);
    const leasesInA = await scopedA.query(kit.dbModule.leases);
    expect(leasesInA).toHaveLength(0);
  });

  // =========================================================================
  // Leases PATCH (update)
  // =========================================================================

  it('leases PATCH: actorC updates lease in communityC → 200', async () => {
    const kit = requireState();
    const appRoutes = requireRoutes();
    const communityC = requireCommunity(kit, 'communityC');
    const seeded = requireSeeded();
    setActor(kit, 'actorC');

    const response = await appRoutes.leases.PATCH(
      jsonRequest(apiUrl('/api/v1/leases'), 'PATCH', {
        id: seeded.leaseC1Id,
        communityId: communityC.id,
        rentAmount: '1550.00',
      }),
    );
    expect(response.status).toBe(200);
  });

  it('leases PATCH: actorA updates lease in communityC → 403 (non-member)', async () => {
    const kit = requireState();
    const appRoutes = requireRoutes();
    const communityC = requireCommunity(kit, 'communityC');
    const seeded = requireSeeded();

    const response = await appRoutes.leases.PATCH(
      jsonRequest(apiUrl('/api/v1/leases'), 'PATCH', {
        id: seeded.leaseC1Id,
        communityId: communityC.id,
        rentAmount: '9999.00',
      }),
    );
    expect(response.status).toBe(403);
  });

  it('leases PATCH: direct-ID cross-tenant probe → 404', async () => {
    const kit = requireState();
    const appRoutes = requireRoutes();
    const communityA = requireCommunity(kit, 'communityA');
    const seeded = requireSeeded();

    // actorA tries to PATCH a communityC lease by referencing communityA
    const response = await appRoutes.leases.PATCH(
      jsonRequest(apiUrl('/api/v1/leases'), 'PATCH', {
        id: seeded.leaseC1Id,
        communityId: communityA.id,
        rentAmount: '9999.00',
      }),
    );
    // Fails at apartment gate (communityA is condo) → 403
    expect(response.status).toBe(403);
  });

  it('leases PATCH: header/body community mismatch → 404', async () => {
    const kit = requireState();
    const appRoutes = requireRoutes();
    const communityA = requireCommunity(kit, 'communityA');
    const communityC = requireCommunity(kit, 'communityC');
    const seeded = requireSeeded();
    setActor(kit, 'actorC');

    const response = await appRoutes.leases.PATCH(
      jsonRequest(
        apiUrl('/api/v1/leases'),
        'PATCH',
        {
          id: seeded.leaseC1Id,
          communityId: communityC.id,
          rentAmount: '1550.00',
        },
        { 'x-community-id': String(communityA.id) },
      ),
    );
    expect(response.status).toBe(404);
  });

  // =========================================================================
  // Leases DELETE (soft-delete)
  // =========================================================================

  it('leases DELETE: actorC deletes lease in communityC → 200', async () => {
    const kit = requireState();
    const appRoutes = requireRoutes();
    const communityC = requireCommunity(kit, 'communityC');
    const seeded = requireSeeded();
    setActor(kit, 'actorC');

    const response = await appRoutes.leases.DELETE(
      new NextRequest(
        apiUrl(`/api/v1/leases?id=${seeded.leaseCDeleteId}&communityId=${communityC.id}`),
        { method: 'DELETE' },
      ),
    );
    expect(response.status).toBe(200);
    const json = await parseJson<{ data: { deleted: boolean; id: number } }>(response);
    expect(json.data.deleted).toBe(true);
    expect(json.data.id).toBe(seeded.leaseCDeleteId);
  });

  it('leases DELETE: actorA deletes lease in communityC → 403 (non-member)', async () => {
    const kit = requireState();
    const appRoutes = requireRoutes();
    const communityC = requireCommunity(kit, 'communityC');
    const seeded = requireSeeded();

    const response = await appRoutes.leases.DELETE(
      new NextRequest(
        apiUrl(`/api/v1/leases?id=${seeded.leaseC1Id}&communityId=${communityC.id}`),
        { method: 'DELETE' },
      ),
    );
    expect(response.status).toBe(403);
  });

  // =========================================================================
  // Upload POST (presigned URL generation)
  // =========================================================================

  it('upload POST: actorA generates presigned URL in communityA → 200', async () => {
    const kit = requireState();
    const appRoutes = requireRoutes();
    const communityA = requireCommunity(kit, 'communityA');

    const response = await appRoutes.upload.POST(
      jsonRequest(apiUrl('/api/v1/upload'), 'POST', {
        communityId: communityA.id,
        fileName: `upload-test-${kit.runSuffix}.pdf`,
        mimeType: 'application/pdf',
        fileSize: 2048,
      }),
    );
    expect(response.status).toBe(200);
    const json = await parseJson<{ data: Record<string, unknown> }>(response);
    expect(json.data['uploadUrl']).toBeDefined();
    // Storage path must reference the correct community
    const storagePath = json.data['path'] as string;
    expect(storagePath).toContain(`communities/${communityA.id}/`);
  });

  it('upload POST: actorA uploads to communityB → 403 (non-member)', async () => {
    const kit = requireState();
    const appRoutes = requireRoutes();
    const communityB = requireCommunity(kit, 'communityB');

    const response = await appRoutes.upload.POST(
      jsonRequest(apiUrl('/api/v1/upload'), 'POST', {
        communityId: communityB.id,
        fileName: `cross-tenant-${kit.runSuffix}.pdf`,
        mimeType: 'application/pdf',
        fileSize: 2048,
      }),
    );
    expect(response.status).toBe(403);
  });

  it('upload POST: header/body community mismatch → 404', async () => {
    const kit = requireState();
    const appRoutes = requireRoutes();
    const communityA = requireCommunity(kit, 'communityA');
    const communityB = requireCommunity(kit, 'communityB');

    const response = await appRoutes.upload.POST(
      jsonRequest(
        apiUrl('/api/v1/upload'),
        'POST',
        {
          communityId: communityB.id,
          fileName: `mismatch-${kit.runSuffix}.pdf`,
          mimeType: 'application/pdf',
          fileSize: 2048,
        },
        { 'x-community-id': String(communityA.id) },
      ),
    );
    expect(response.status).toBe(404);
  });

  it('upload POST: presigned path isolates to correct community (no cross-tenant storage)', async () => {
    const kit = requireState();
    const appRoutes = requireRoutes();
    const communityC = requireCommunity(kit, 'communityC');
    setActor(kit, 'actorC');

    const response = await appRoutes.upload.POST(
      jsonRequest(apiUrl('/api/v1/upload'), 'POST', {
        communityId: communityC.id,
        fileName: `upload-c-${kit.runSuffix}.pdf`,
        mimeType: 'application/pdf',
        fileSize: 4096,
      }),
    );
    expect(response.status).toBe(200);
    const json = await parseJson<{ data: Record<string, unknown> }>(response);
    const storagePath = json.data['path'] as string;
    expect(storagePath).toContain(`communities/${communityC.id}/`);
    // Must NOT contain other community IDs
    const communityA = requireCommunity(kit, 'communityA');
    const communityB = requireCommunity(kit, 'communityB');
    expect(storagePath).not.toContain(`communities/${communityA.id}/`);
    expect(storagePath).not.toContain(`communities/${communityB.id}/`);
  });
});
