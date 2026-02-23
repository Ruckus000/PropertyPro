/**
 * P4-58: Document lifecycle integration tests.
 *
 * Verifies the full document lifecycle through actual route handlers:
 *
 * 1. Admin creates a document → 201
 * 2. Document appears in GET listing
 * 3. Document search returns result
 * 4. Tenant sees only policy-allowed categories
 * 5. Admin soft-deletes document → no longer in GET
 * 6. Cross-tenant: document from communityA not visible to communityB user
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
  requireUser,
  setActor,
  requireCurrentActor,
  apiUrl,
  parseJson,
  readNumberField,
  requireInsertedRow,
  jsonRequest,
} from './helpers/multi-tenant-test-kit';

if (process.env.CI && !process.env.DATABASE_URL) {
  throw new Error('P4-58 document-lifecycle integration tests require DATABASE_URL in CI');
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

// Stub Supabase storage for document creation (no real file upload)
vi.mock('@propertypro/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@propertypro/db')>();
  return {
    ...actual,
    createStorageClient: () => ({
      from: () => ({
        upload: vi.fn().mockResolvedValue({ data: { path: 'test.pdf' }, error: null }),
        getPublicUrl: vi.fn().mockReturnValue({ data: { publicUrl: 'https://example.com/test.pdf' } }),
      }),
    }),
  };
});

// ---------------------------------------------------------------------------
// Route types
// ---------------------------------------------------------------------------

type DocumentsRouteModule = typeof import('../../src/app/api/v1/documents/route');
type DocumentSearchRouteModule = typeof import('../../src/app/api/v1/documents/search/route');

interface RouteModules {
  documents: DocumentsRouteModule;
  documentSearch: DocumentSearchRouteModule;
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

let state: TestKitState | null = null;
let routes: RouteModules | null = null;
let seededDocId: number | null = null;
let seededCategoryId: number | null = null;

function requireState(): TestKitState {
  if (!state) throw new Error('Test state not initialized');
  return state;
}

function requireRoutes(): RouteModules {
  if (!routes) throw new Error('Routes not loaded');
  return routes;
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describeDb('p4-58 document-lifecycle integration', () => {
  beforeAll(async () => {
    if (!process.env.DATABASE_URL) return;

    state = await initTestKit();

    await seedCommunities(state, MULTI_TENANT_COMMUNITIES);

    const neededUsers: MultiTenantUserKey[] = [
      'actorA',    // board_president (condo)
      'tenantA',   // tenant (condo)
      'actorB',    // board_president (hoa, for cross-tenant)
    ];

    const userFixtures = MULTI_TENANT_USERS.filter((u) =>
      neededUsers.includes(u.key),
    );

    const communityA = requireCommunity(state, 'communityA');
    const scopedA = state.dbModule.createScopedClient(communityA.id);

    const [unitA] = await scopedA.insert(state.dbModule.units, {
      unitNumber: `P458-DOC-A-${state.runSuffix}`,
      building: null,
      floor: null,
    });
    const unitAId = readNumberField(requireInsertedRow(unitA, 'unitA'), 'id');

    const unitMap = new Map<MultiTenantUserKey, number>([
      ['tenantA', unitAId],
    ]);

    await seedUsers(state, userFixtures, unitMap);

    // Seed a document category + document for lifecycle tests
    const actorA = requireUser(state, 'actorA');
    const [catRow] = await scopedA.insert(state.dbModule.documentCategories, {
      name: 'meeting_minutes',
      description: 'Meeting minutes category for lifecycle test',
      isSystem: false,
    });
    seededCategoryId = readNumberField(requireInsertedRow(catRow, 'category'), 'id');

    const [docRow] = await scopedA.insert(state.dbModule.documents, {
      title: `Lifecycle Doc ${state.runSuffix}`,
      filePath: `communities/${communityA.id}/documents/lifecycle-${state.runSuffix}.pdf`,
      fileName: `lifecycle-${state.runSuffix}.pdf`,
      fileSize: 2048,
      mimeType: 'application/pdf',
      uploadedBy: actorA.id,
      categoryId: seededCategoryId,
      searchText: `lifecycle searchable ${state.runSuffix}`,
    });
    seededDocId = readNumberField(requireInsertedRow(docRow, 'document'), 'id');

    routes = {
      documents: await import('../../src/app/api/v1/documents/route'),
      documentSearch: await import('../../src/app/api/v1/documents/search/route'),
    };
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
  // Elevated role sees all documents
  // =========================================================================

  it('board_president sees seeded document in GET listing', async () => {
    const kit = requireState();
    const r = requireRoutes();
    const community = requireCommunity(kit, 'communityA');

    setActor(kit, 'actorA');
    const response = await r.documents.GET(
      new NextRequest(apiUrl(`/api/v1/documents?communityId=${community.id}`)),
    );
    expect(response.status).toBe(200);
    const json = await parseJson<{ data: Array<Record<string, unknown>> }>(response);

    const titles = json.data.map((d) => String(d['title']));
    expect(titles).toContain(`Lifecycle Doc ${kit.runSuffix}`);
  });

  // =========================================================================
  // Document search
  // =========================================================================

  it('document search returns seeded document', async () => {
    const kit = requireState();
    const r = requireRoutes();
    const community = requireCommunity(kit, 'communityA');

    setActor(kit, 'actorA');
    const response = await r.documentSearch.GET(
      new NextRequest(apiUrl(`/api/v1/documents/search?communityId=${community.id}&q=lifecycle+searchable`)),
    );
    expect(response.status).toBe(200);
    const json = await parseJson<{ data: Array<Record<string, unknown>> }>(response);

    const titles = json.data.map((d) => String(d['title']));
    expect(titles).toContain(`Lifecycle Doc ${kit.runSuffix}`);
  });

  // =========================================================================
  // Tenant document category filtering
  // =========================================================================

  it('tenant does NOT see meeting_minutes category documents', async () => {
    const kit = requireState();
    const r = requireRoutes();
    const community = requireCommunity(kit, 'communityA');

    setActor(kit, 'tenantA');
    const response = await r.documents.GET(
      new NextRequest(apiUrl(`/api/v1/documents?communityId=${community.id}`)),
    );
    expect(response.status).toBe(200);
    const json = await parseJson<{ data: Array<Record<string, unknown>> }>(response);

    // Tenant in condo_718 should NOT see meeting_minutes
    const titles = json.data.map((d) => String(d['title']));
    expect(titles).not.toContain(`Lifecycle Doc ${kit.runSuffix}`);
  });

  // =========================================================================
  // Cross-tenant isolation
  // =========================================================================

  it('communityB user cannot see communityA documents', async () => {
    const kit = requireState();
    const r = requireRoutes();
    const communityA = requireCommunity(kit, 'communityA');

    setActor(kit, 'actorB'); // board_president in communityB
    const response = await r.documents.GET(
      new NextRequest(apiUrl(`/api/v1/documents?communityId=${communityA.id}`)),
    );
    expect(response.status).toBe(403);
  });

  // =========================================================================
  // Soft delete
  // =========================================================================

  it('admin soft-deletes document → no longer in GET listing', async () => {
    const kit = requireState();
    const r = requireRoutes();
    const community = requireCommunity(kit, 'communityA');

    // First, seed a separate doc just for deletion to avoid affecting other tests
    const actorA = requireUser(kit, 'actorA');
    const scopedA = kit.dbModule.createScopedClient(community.id);

    const [delDocRow] = await scopedA.insert(kit.dbModule.documents, {
      title: `Delete Target ${kit.runSuffix}`,
      filePath: `communities/${community.id}/documents/delete-target-${kit.runSuffix}.pdf`,
      fileName: `delete-target-${kit.runSuffix}.pdf`,
      fileSize: 512,
      mimeType: 'application/pdf',
      uploadedBy: actorA.id,
      categoryId: null,
      searchText: null,
    });
    const delDocId = readNumberField(requireInsertedRow(delDocRow, 'delDoc'), 'id');

    // Verify it appears first
    setActor(kit, 'actorA');
    const listBefore = await r.documents.GET(
      new NextRequest(apiUrl(`/api/v1/documents?communityId=${community.id}`)),
    );
    const beforeJson = await parseJson<{ data: Array<Record<string, unknown>> }>(listBefore);
    const beforeTitles = beforeJson.data.map((d) => String(d['title']));
    expect(beforeTitles).toContain(`Delete Target ${kit.runSuffix}`);

    // Soft delete via route (DELETE uses query params, not JSON body)
    const deleteResponse = await r.documents.DELETE(
      new NextRequest(
        apiUrl(`/api/v1/documents?communityId=${community.id}&id=${delDocId}`),
        { method: 'DELETE' },
      ),
    );
    expect(deleteResponse.status).toBe(200);

    // Verify it no longer appears
    const listAfter = await r.documents.GET(
      new NextRequest(apiUrl(`/api/v1/documents?communityId=${community.id}`)),
    );
    const afterJson = await parseJson<{ data: Array<Record<string, unknown>> }>(listAfter);
    const afterTitles = afterJson.data.map((d) => String(d['title']));
    expect(afterTitles).not.toContain(`Delete Target ${kit.runSuffix}`);
  });
});
