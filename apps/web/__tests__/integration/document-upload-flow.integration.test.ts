/**
 * P4-58: Document upload flow integration test.
 *
 * Verifies:
 *   1. POST document with valid PDF magic bytes → created with extractionStatus=pending
 *   2. POST document with valid PNG magic bytes → created with extractionStatus=not_applicable
 *   3. POST document with invalid magic bytes → 422 rejection
 *   4. GET lists documents scoped to community
 *   5. DELETE soft-deletes document (elevated role only)
 *   6. DELETE by tenant → 403
 *   7. Document search returns documents by searchText
 *   8. Cross-tenant isolation: actorC cannot see communityA docs
 *
 * Storage is mocked — files are not uploaded to Supabase. The magic bytes
 * validation and DB operations are exercised against the real database.
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

requireDatabaseUrlInCI('Document upload flow integration tests');

const describeDb = getDescribeDb();

// ---------------------------------------------------------------------------
// Magic byte constants for test file generation
// ---------------------------------------------------------------------------

/** Minimal PDF magic bytes: %PDF-1.4 header */
const PDF_MAGIC = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34]);

/** Minimal valid PNG (1x1 RGBA): signature + IHDR + IDAT + IEND (~67 bytes).
 * The file-type library parses the IHDR chunk, so 8-byte signature alone is insufficient. */
const PNG_MAGIC = new Uint8Array(
  '89504E470D0A1A0A0000000D49484452000000010000000108060000001F15C4890000000A49444154789C6360000000020001E221BC330000000049454E44AE426082'
    .match(/.{1,2}/g)!
    .map((b) => parseInt(b, 16)),
);

/** Invalid magic bytes: random data */
const INVALID_MAGIC = new Uint8Array([0xDE, 0xAD, 0xBE, 0xEF, 0x00, 0x00, 0x00, 0x00]);

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const { requireAuthenticatedUserIdMock, mockStorageBytes } = vi.hoisted(() => ({
  requireAuthenticatedUserIdMock: vi.fn(),
  mockStorageBytes: {
    current: new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34]) as Uint8Array,
  },
}));

vi.mock('@/lib/api/auth', () => ({
  requireAuthenticatedUserId: requireAuthenticatedUserIdMock,
}));

// Mock storage download to return our controlled bytes
vi.mock('@propertypro/db', async (importOriginal) => {
  const mod = await importOriginal<typeof import('@propertypro/db')>();
  return {
    ...mod,
    createPresignedDownloadUrl: vi.fn().mockResolvedValue('http://mock-storage/file'),
    deleteStorageObject: vi.fn().mockResolvedValue(undefined),
  };
});

// Override global fetch for the storage download URL
const originalFetch = globalThis.fetch;
vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  if (url === 'http://mock-storage/file') {
    return new Response(mockStorageBytes.current, { status: 200 });
  }
  return originalFetch(input, init);
});

vi.mock('@/lib/services/notification-service', () => ({
  queueNotification: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/workers/pdf-extraction', () => ({
  queuePdfExtraction: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Route types
// ---------------------------------------------------------------------------

type DocumentsRouteModule = typeof import('../../src/app/api/v1/documents/route');
type DocumentSearchRouteModule = typeof import('../../src/app/api/v1/documents/search/route');

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

let state: TestKitState | null = null;
let documentsRoute: DocumentsRouteModule | null = null;
let searchRoute: DocumentSearchRouteModule | null = null;

function requireState(): TestKitState {
  if (!state) throw new Error('Test state not initialized');
  return state;
}

function requireDocumentsRoute(): DocumentsRouteModule {
  if (!documentsRoute) throw new Error('Route not loaded');
  return documentsRoute;
}

function requireSearchRoute(): DocumentSearchRouteModule {
  if (!searchRoute) throw new Error('Route not loaded');
  return searchRoute;
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describeDb('P4-58: document upload flow (db-backed integration)', () => {
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

    documentsRoute = await import('../../src/app/api/v1/documents/route');
    searchRoute = await import('../../src/app/api/v1/documents/search/route');
  });

  beforeEach(() => {
    vi.clearAllMocks();
    const kit = requireState();
    requireAuthenticatedUserIdMock.mockImplementation(async () => requireCurrentActor(kit));
    setActor(kit, 'actorA');
    // Reset storage bytes to PDF by default
    mockStorageBytes.current = PDF_MAGIC;
  });

  afterAll(async () => {
    vi.unstubAllGlobals();
    if (state) await teardownTestKit(state);
  });

  // =========================================================================
  // 1. POST document with valid PDF magic bytes
  // =========================================================================

  it('POST with PDF magic bytes creates document with extractionStatus=pending', async () => {
    const kit = requireState();
    const route = requireDocumentsRoute();
    const communityA = requireCommunity(kit, 'communityA');

    mockStorageBytes.current = PDF_MAGIC;

    const response = await route.POST(
      jsonRequest(apiUrl('/api/v1/documents'), 'POST', {
        communityId: communityA.id,
        title: `PDF Test Doc ${kit.runSuffix}`,
        filePath: `communities/${communityA.id}/documents/test-${kit.runSuffix}.pdf`,
        fileName: `test-${kit.runSuffix}.pdf`,
        fileSize: PDF_MAGIC.byteLength,
      }),
    );

    expect(response.status).toBe(201);
    const json = await parseJson<{ data: Record<string, unknown> }>(response);
    expect(json.data['title']).toBe(`PDF Test Doc ${kit.runSuffix}`);
    expect(json.data['mimeType']).toBe('application/pdf');
    expect(json.data['extractionStatus']).toBe('pending');
  });

  // =========================================================================
  // 2. POST document with valid PNG magic bytes
  // =========================================================================

  it('POST with PNG magic bytes creates document with extractionStatus=not_applicable', async () => {
    const kit = requireState();
    const route = requireDocumentsRoute();
    const communityA = requireCommunity(kit, 'communityA');

    mockStorageBytes.current = PNG_MAGIC;

    const response = await route.POST(
      jsonRequest(apiUrl('/api/v1/documents'), 'POST', {
        communityId: communityA.id,
        title: `PNG Test Doc ${kit.runSuffix}`,
        filePath: `communities/${communityA.id}/documents/test-${kit.runSuffix}.png`,
        fileName: `test-${kit.runSuffix}.png`,
        fileSize: PNG_MAGIC.byteLength,
      }),
    );

    expect(response.status).toBe(201);
    const json = await parseJson<{ data: Record<string, unknown> }>(response);
    expect(json.data['mimeType']).toBe('image/png');
    expect(json.data['extractionStatus']).toBe('not_applicable');
  });

  // =========================================================================
  // 3. POST document with invalid magic bytes → 422
  // =========================================================================

  it('POST with invalid magic bytes returns 422', async () => {
    const kit = requireState();
    const route = requireDocumentsRoute();
    const communityA = requireCommunity(kit, 'communityA');

    mockStorageBytes.current = INVALID_MAGIC;

    const response = await route.POST(
      jsonRequest(apiUrl('/api/v1/documents'), 'POST', {
        communityId: communityA.id,
        title: `Invalid Test Doc ${kit.runSuffix}`,
        filePath: `communities/${communityA.id}/documents/invalid-${kit.runSuffix}.exe`,
        fileName: `invalid-${kit.runSuffix}.exe`,
        fileSize: INVALID_MAGIC.byteLength,
      }),
    );

    expect(response.status).toBe(422);
  });

  // =========================================================================
  // 4. GET lists documents scoped to community
  // =========================================================================

  it('GET lists uploaded documents for the community', async () => {
    const kit = requireState();
    const route = requireDocumentsRoute();
    const communityA = requireCommunity(kit, 'communityA');

    const response = await route.GET(
      new NextRequest(apiUrl(`/api/v1/documents?communityId=${communityA.id}`)),
    );

    expect(response.status).toBe(200);
    const json = await parseJson<{ data: Array<Record<string, unknown>> }>(response);
    expect(json.data.length).toBeGreaterThanOrEqual(2); // PDF + PNG from tests above

    const titles = json.data.map((d) => d['title'] as string);
    expect(titles).toContain(`PDF Test Doc ${kit.runSuffix}`);
    expect(titles).toContain(`PNG Test Doc ${kit.runSuffix}`);
  });

  // =========================================================================
  // 5. DELETE soft-deletes document (elevated role)
  // =========================================================================

  it('DELETE by board_president soft-deletes document', async () => {
    const kit = requireState();
    const route = requireDocumentsRoute();
    const communityA = requireCommunity(kit, 'communityA');

    // Get current documents to find one to delete
    const getResponse = await route.GET(
      new NextRequest(apiUrl(`/api/v1/documents?communityId=${communityA.id}`)),
    );
    const getJson = await parseJson<{ data: Array<Record<string, unknown>> }>(getResponse);
    const pngDoc = getJson.data.find((d) => d['title'] === `PNG Test Doc ${kit.runSuffix}`);
    if (!pngDoc) throw new Error('PNG document not found for deletion');

    const response = await route.DELETE(
      new NextRequest(
        apiUrl(`/api/v1/documents?id=${pngDoc['id']}&communityId=${communityA.id}`),
        { method: 'DELETE' },
      ),
    );

    expect(response.status).toBe(200);
    const json = await parseJson<{ data: { deleted: boolean; id: number } }>(response);
    expect(json.data.deleted).toBe(true);

    // Verify it's no longer in GET listing
    const getAfter = await route.GET(
      new NextRequest(apiUrl(`/api/v1/documents?communityId=${communityA.id}`)),
    );
    const afterJson = await parseJson<{ data: Array<Record<string, unknown>> }>(getAfter);
    const deleted = afterJson.data.find((d) => d['id'] === pngDoc!['id']);
    expect(deleted).toBeUndefined();
  });

  // =========================================================================
  // 6. DELETE by tenant → 403
  // =========================================================================

  it('DELETE by tenant returns 403', async () => {
    const kit = requireState();
    const route = requireDocumentsRoute();
    const communityA = requireCommunity(kit, 'communityA');

    // Get a document to try to delete
    const getResponse = await route.GET(
      new NextRequest(apiUrl(`/api/v1/documents?communityId=${communityA.id}`)),
    );
    const getJson = await parseJson<{ data: Array<Record<string, unknown>> }>(getResponse);
    const doc = getJson.data[0];
    expect(doc).toBeDefined();

    setActor(kit, 'tenantA');
    const response = await route.DELETE(
      new NextRequest(
        apiUrl(`/api/v1/documents?id=${doc['id']}&communityId=${communityA.id}`),
        { method: 'DELETE' },
      ),
    );

    expect(response.status).toBe(403);
  });

  // =========================================================================
  // 7. Document search returns documents by searchText
  // =========================================================================

  it('search returns documents with matching searchText', async () => {
    const kit = requireState();
    const search = requireSearchRoute();
    const communityA = requireCommunity(kit, 'communityA');
    const actorA = requireUser(kit, 'actorA');

    // Insert a document with known searchText directly
    const searchSentinel = `INTEGRATION_SEARCH_${kit.runSuffix}`;
    const scoped = kit.dbModule.createScopedClient(communityA.id);
    await scoped.insert(kit.dbModule.documents, {
      title: `Searchable Doc ${kit.runSuffix}`,
      filePath: `communities/${communityA.id}/documents/searchable-${kit.runSuffix}.pdf`,
      fileName: `searchable-${kit.runSuffix}.pdf`,
      fileSize: 1024,
      mimeType: 'application/pdf',
      uploadedBy: actorA.id,
      searchText: searchSentinel,
    });

    // Search for the sentinel text
    const response = await search.GET(
      new NextRequest(apiUrl(`/api/v1/documents/search?communityId=${communityA.id}&q=${searchSentinel}`)),
    );

    expect(response.status).toBe(200);
    const json = await parseJson<{ data: Array<Record<string, unknown>> }>(response);

    const found = json.data.find((d) => d['title'] === `Searchable Doc ${kit.runSuffix}`);
    expect(found).toBeDefined();
  });

  // =========================================================================
  // 8. Cross-tenant isolation: actorC cannot see communityA docs
  // =========================================================================

  it('cross-tenant: actorC cannot access communityA documents', async () => {
    const kit = requireState();
    const route = requireDocumentsRoute();
    const communityA = requireCommunity(kit, 'communityA');

    setActor(kit, 'actorC');
    const response = await route.GET(
      new NextRequest(apiUrl(`/api/v1/documents?communityId=${communityA.id}`)),
    );

    expect(response.status).toBe(403);
  });
});
