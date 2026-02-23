/**
 * P2-43 Gap B+C+D: Access policy integration tests.
 *
 * Verifies that restricted roles (tenant, cam, site_manager) see only
 * their allowed document categories through the real API layer, and that
 * elevated roles (board_president, property_manager_admin) see everything.
 *
 * Seeds 3 community types:
 *   A: condo_718, B: hoa_720, C: apartment
 *
 * Seeds document categories with deterministic names matching policy keys,
 * documents WITH categoryId set, and one uncategorized document per community.
 *
 * Uses sentinel searchText in forbidden-category docs to verify no leakage.
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
  parseJson,
  readNumberField,
  requireInsertedRow,
} from './helpers/multi-tenant-test-kit';

if (process.env.CI && !process.env.DATABASE_URL) {
  throw new Error('P2-43 access policy integration tests require DATABASE_URL in CI');
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

type DocumentsRouteModule = typeof import('../../src/app/api/v1/documents/route');
type DocumentSearchRouteModule = typeof import('../../src/app/api/v1/documents/search/route');

interface RouteModules {
  documents: DocumentsRouteModule;
  documentSearch: DocumentSearchRouteModule;
}

// ---------------------------------------------------------------------------
// Category definitions per community type
// ---------------------------------------------------------------------------

const CONDO_CATEGORIES = ['declaration', 'rules', 'inspection_reports', 'meeting_minutes', 'announcements'] as const;
const HOA_CATEGORIES = ['declaration', 'rules', 'inspection_reports', 'meeting_minutes', 'announcements'] as const;
const APARTMENT_CATEGORIES = ['rules', 'lease_docs', 'community_handbook', 'move_in_out_docs', 'announcements', 'maintenance_records'] as const;

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

let state: TestKitState | null = null;
let routes: RouteModules | null = null;

/** Maps community key → category name → category DB id */
let categoryIds: Record<string, Record<string, number>> = {};

/** Sentinel value embedded in forbidden documents' searchText */
const SENTINEL_PREFIX = 'FORBIDDEN_SENTINEL_';

function requireState(): TestKitState {
  if (!state) throw new Error('Test state not initialized');
  return state;
}

function requireRoutes(): RouteModules {
  if (!routes) throw new Error('Routes not loaded');
  return routes;
}

// ---------------------------------------------------------------------------
// Seed helpers
// ---------------------------------------------------------------------------

async function seedCategoriesAndDocuments(kit: TestKitState): Promise<void> {
  // Community A (condo_718)
  const communityA = requireCommunity(kit, 'communityA');
  const actorA = requireUser(kit, 'actorA');
  const scopedA = kit.dbModule.createScopedClient(communityA.id);
  categoryIds['communityA'] = {};

  for (const catName of CONDO_CATEGORIES) {
    const [catRow] = await scopedA.insert(kit.dbModule.documentCategories, {
      name: catName,
      description: `${catName} category for testing`,
      isSystem: false,
    });
    const catId = readNumberField(requireInsertedRow(catRow, catName), 'id');
    categoryIds['communityA'][catName] = catId;

    // Create a document in this category with sentinel searchText
    await scopedA.insert(kit.dbModule.documents, {
      title: `${catName} Doc ${kit.runSuffix}`,
      filePath: `communities/${communityA.id}/documents/${catName}-${kit.runSuffix}.pdf`,
      fileName: `${catName}-${kit.runSuffix}.pdf`,
      fileSize: 1024,
      mimeType: 'application/pdf',
      uploadedBy: actorA.id,
      categoryId: catId,
      searchText: `${SENTINEL_PREFIX}${catName}_A`,
    });
  }

  // Uncategorized doc in community A
  await scopedA.insert(kit.dbModule.documents, {
    title: `Uncategorized Doc A ${kit.runSuffix}`,
    filePath: `communities/${communityA.id}/documents/uncategorized-a-${kit.runSuffix}.pdf`,
    fileName: `uncategorized-a-${kit.runSuffix}.pdf`,
    fileSize: 1024,
    mimeType: 'application/pdf',
    uploadedBy: actorA.id,
    categoryId: null,
    searchText: `${SENTINEL_PREFIX}uncategorized_A`,
  });

  // Community B (hoa_720)
  const communityB = requireCommunity(kit, 'communityB');
  const actorB = requireUser(kit, 'actorB');
  const scopedB = kit.dbModule.createScopedClient(communityB.id);
  categoryIds['communityB'] = {};

  for (const catName of HOA_CATEGORIES) {
    const [catRow] = await scopedB.insert(kit.dbModule.documentCategories, {
      name: catName,
      description: `${catName} category for HOA testing`,
      isSystem: false,
    });
    const catId = readNumberField(requireInsertedRow(catRow, catName), 'id');
    categoryIds['communityB'][catName] = catId;

    await scopedB.insert(kit.dbModule.documents, {
      title: `${catName} Doc ${kit.runSuffix}`,
      filePath: `communities/${communityB.id}/documents/${catName}-${kit.runSuffix}.pdf`,
      fileName: `${catName}-${kit.runSuffix}.pdf`,
      fileSize: 1024,
      mimeType: 'application/pdf',
      uploadedBy: actorB.id,
      categoryId: catId,
      searchText: `${SENTINEL_PREFIX}${catName}_B`,
    });
  }

  // Uncategorized doc in community B
  await scopedB.insert(kit.dbModule.documents, {
    title: `Uncategorized Doc B ${kit.runSuffix}`,
    filePath: `communities/${communityB.id}/documents/uncategorized-b-${kit.runSuffix}.pdf`,
    fileName: `uncategorized-b-${kit.runSuffix}.pdf`,
    fileSize: 1024,
    mimeType: 'application/pdf',
    uploadedBy: actorB.id,
    categoryId: null,
    searchText: `${SENTINEL_PREFIX}uncategorized_B`,
  });

  // Community C (apartment)
  const communityC = requireCommunity(kit, 'communityC');
  const actorC = requireUser(kit, 'actorC');
  const scopedC = kit.dbModule.createScopedClient(communityC.id);
  categoryIds['communityC'] = {};

  for (const catName of APARTMENT_CATEGORIES) {
    const [catRow] = await scopedC.insert(kit.dbModule.documentCategories, {
      name: catName,
      description: `${catName} category for testing`,
      isSystem: false,
    });
    const catId = readNumberField(requireInsertedRow(catRow, catName), 'id');
    categoryIds['communityC'][catName] = catId;

    await scopedC.insert(kit.dbModule.documents, {
      title: `${catName} Doc ${kit.runSuffix}`,
      filePath: `communities/${communityC.id}/documents/${catName}-${kit.runSuffix}.pdf`,
      fileName: `${catName}-${kit.runSuffix}.pdf`,
      fileSize: 1024,
      mimeType: 'application/pdf',
      uploadedBy: actorC.id,
      categoryId: catId,
      searchText: `${SENTINEL_PREFIX}${catName}_C`,
    });
  }

  // Uncategorized doc in community C
  await scopedC.insert(kit.dbModule.documents, {
    title: `Uncategorized Doc C ${kit.runSuffix}`,
    filePath: `communities/${communityC.id}/documents/uncategorized-c-${kit.runSuffix}.pdf`,
    fileName: `uncategorized-c-${kit.runSuffix}.pdf`,
    fileSize: 1024,
    mimeType: 'application/pdf',
    uploadedBy: actorC.id,
    categoryId: null,
    searchText: `${SENTINEL_PREFIX}uncategorized_C`,
  });
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describeDb('p2-43 multi-tenant access policy (db-backed integration)', () => {
  beforeAll(async () => {
    if (!process.env.DATABASE_URL) return;

    state = await initTestKit();

    // Seed all 3 communities
    await seedCommunities(state, MULTI_TENANT_COMMUNITIES);

    // Seed users needed for this test:
    // actorA (board_president, communityA), actorC (property_manager_admin, communityC)
    // tenantA (communityA), camA (communityA)
    // tenantC (communityC), siteManagerC (communityC)
    // actorB (for cross-tenant tests)
    const neededUsers: MultiTenantUserKey[] = [
      'actorA', 'actorB', 'actorC',
      'tenantA', 'camA', 'ownerA',
      'ownerB', 'tenantB', 'camB',
      'tenantC', 'siteManagerC',
    ];

    const userFixtures = MULTI_TENANT_USERS.filter((u) =>
      neededUsers.includes(u.key),
    );

    // Seed units for tenant/owner users
    const communityA = requireCommunity(state, 'communityA');
    const communityB = requireCommunity(state, 'communityB');
    const communityC = requireCommunity(state, 'communityC');
    const scopedA = state.dbModule.createScopedClient(communityA.id);
    const scopedB = state.dbModule.createScopedClient(communityB.id);
    const scopedC = state.dbModule.createScopedClient(communityC.id);

    const [unitA] = await scopedA.insert(state.dbModule.units, {
      unitNumber: `P243-A-${state.runSuffix}`,
      building: null,
      floor: null,
    });
    const [unitB] = await scopedB.insert(state.dbModule.units, {
      unitNumber: `P243-B-${state.runSuffix}`,
      building: null,
      floor: null,
    });
    const [unitC] = await scopedC.insert(state.dbModule.units, {
      unitNumber: `P243-C-${state.runSuffix}`,
      building: null,
      floor: null,
    });

    const unitAId = readNumberField(requireInsertedRow(unitA, 'unitA'), 'id');
    const unitBId = readNumberField(requireInsertedRow(unitB, 'unitB'), 'id');
    const unitCId = readNumberField(requireInsertedRow(unitC, 'unitC'), 'id');

    const unitMap = new Map<MultiTenantUserKey, number>([
      ['tenantA', unitAId],
      ['ownerA', unitAId],
      ['ownerB', unitBId],
      ['tenantB', unitBId],
      ['tenantC', unitCId],
    ]);

    await seedUsers(state, userFixtures, unitMap);

    // Seed categories and documents
    await seedCategoriesAndDocuments(state);

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
    if (state) {
      await teardownTestKit(state);
    }
  });

  // =========================================================================
  // Helper: extract category names from document list response
  // =========================================================================

  async function getDocumentCategoryNames(
    actor: MultiTenantUserKey,
    communityKey: 'communityA' | 'communityB' | 'communityC',
  ): Promise<{ titles: string[]; categoryIds: Array<number | null> }> {
    const kit = requireState();
    const appRoutes = requireRoutes();
    const community = requireCommunity(kit, communityKey);

    setActor(kit, actor);
    const response = await appRoutes.documents.GET(
      new NextRequest(apiUrl(`/api/v1/documents?communityId=${community.id}`)),
    );
    expect(response.status).toBe(200);
    const json = await parseJson<{ data: Array<Record<string, unknown>> }>(response);
    return {
      titles: json.data.map((d) => String(d['title'])),
      categoryIds: json.data.map((d) => (d['categoryId'] as number | null)),
    };
  }

  // =========================================================================
  // Condo tenant (communityA, condo_718)
  // =========================================================================

  it('tenant in condo_718 sees only declaration, rules, inspection_reports', async () => {
    const { titles } = await getDocumentCategoryNames('tenantA', 'communityA');
    const suffix = requireState().runSuffix;

    // Should see
    expect(titles).toContain(`declaration Doc ${suffix}`);
    expect(titles).toContain(`rules Doc ${suffix}`);
    expect(titles).toContain(`inspection_reports Doc ${suffix}`);

    // Should NOT see
    expect(titles).not.toContain(`meeting_minutes Doc ${suffix}`);
    expect(titles).not.toContain(`announcements Doc ${suffix}`);
    expect(titles).not.toContain(`Uncategorized Doc A ${suffix}`);
  });

  // =========================================================================
  // CAM (communityA, condo_718)
  // =========================================================================

  it('cam in condo_718 sees only rules, inspection_reports, announcements, meeting_minutes', async () => {
    const { titles } = await getDocumentCategoryNames('camA', 'communityA');
    const suffix = requireState().runSuffix;

    // Should see
    expect(titles).toContain(`rules Doc ${suffix}`);
    expect(titles).toContain(`inspection_reports Doc ${suffix}`);
    expect(titles).toContain(`announcements Doc ${suffix}`);
    expect(titles).toContain(`meeting_minutes Doc ${suffix}`);

    // Should NOT see
    expect(titles).not.toContain(`declaration Doc ${suffix}`);
    expect(titles).not.toContain(`Uncategorized Doc A ${suffix}`);
  });

  // =========================================================================
  // Apartment tenant (communityC, apartment)
  // =========================================================================

  it('tenant in apartment sees only lease_docs, rules, community_handbook, move_in_out_docs', async () => {
    const { titles } = await getDocumentCategoryNames('tenantC', 'communityC');
    const suffix = requireState().runSuffix;

    // Should see
    expect(titles).toContain(`lease_docs Doc ${suffix}`);
    expect(titles).toContain(`rules Doc ${suffix}`);
    expect(titles).toContain(`community_handbook Doc ${suffix}`);
    expect(titles).toContain(`move_in_out_docs Doc ${suffix}`);

    // Should NOT see
    expect(titles).not.toContain(`announcements Doc ${suffix}`);
    expect(titles).not.toContain(`maintenance_records Doc ${suffix}`);
    expect(titles).not.toContain(`Uncategorized Doc C ${suffix}`);
  });

  // =========================================================================
  // Apartment site manager (communityC, apartment)
  // =========================================================================

  it('site_manager in apartment sees only rules, announcements, maintenance_records', async () => {
    const { titles } = await getDocumentCategoryNames('siteManagerC', 'communityC');
    const suffix = requireState().runSuffix;

    // Should see
    expect(titles).toContain(`rules Doc ${suffix}`);
    expect(titles).toContain(`announcements Doc ${suffix}`);
    expect(titles).toContain(`maintenance_records Doc ${suffix}`);

    // Should NOT see
    expect(titles).not.toContain(`lease_docs Doc ${suffix}`);
    expect(titles).not.toContain(`community_handbook Doc ${suffix}`);
    expect(titles).not.toContain(`move_in_out_docs Doc ${suffix}`);
    expect(titles).not.toContain(`Uncategorized Doc C ${suffix}`);
  });

  // =========================================================================
  // Elevated role regression
  // =========================================================================

  it('board_president in condo_718 sees ALL categories + uncategorized', async () => {
    const { titles } = await getDocumentCategoryNames('actorA', 'communityA');
    const suffix = requireState().runSuffix;

    for (const cat of CONDO_CATEGORIES) {
      expect(titles).toContain(`${cat} Doc ${suffix}`);
    }
    expect(titles).toContain(`Uncategorized Doc A ${suffix}`);
  });

  it('property_manager_admin in apartment sees ALL categories + uncategorized', async () => {
    const { titles } = await getDocumentCategoryNames('actorC', 'communityC');
    const suffix = requireState().runSuffix;

    for (const cat of APARTMENT_CATEGORIES) {
      expect(titles).toContain(`${cat} Doc ${suffix}`);
    }
    expect(titles).toContain(`Uncategorized Doc C ${suffix}`);
  });

  // =========================================================================
  // Restricted role cross-tenant → 403
  // =========================================================================

  it('tenantA querying communityB → 403', async () => {
    const kit = requireState();
    const appRoutes = requireRoutes();
    const communityB = requireCommunity(kit, 'communityB');

    setActor(kit, 'tenantA');
    const response = await appRoutes.documents.GET(
      new NextRequest(apiUrl(`/api/v1/documents?communityId=${communityB.id}`)),
    );
    expect(response.status).toBe(403);
  });

  it('camA querying communityC → 403', async () => {
    const kit = requireState();
    const appRoutes = requireRoutes();
    const communityC = requireCommunity(kit, 'communityC');

    setActor(kit, 'camA');
    const response = await appRoutes.documents.GET(
      new NextRequest(apiUrl(`/api/v1/documents?communityId=${communityC.id}`)),
    );
    expect(response.status).toBe(403);
  });

  it('siteManagerC querying communityA → 403', async () => {
    const kit = requireState();
    const appRoutes = requireRoutes();
    const communityA = requireCommunity(kit, 'communityA');

    setActor(kit, 'siteManagerC');
    const response = await appRoutes.documents.GET(
      new NextRequest(apiUrl(`/api/v1/documents?communityId=${communityA.id}`)),
    );
    expect(response.status).toBe(403);
  });

  // =========================================================================
  // Document search respects role policy + sentinel check
  // =========================================================================

  it('tenantA search: only allowed categories; sentinel text from forbidden docs never appears', async () => {
    const kit = requireState();
    const appRoutes = requireRoutes();
    const communityA = requireCommunity(kit, 'communityA');

    setActor(kit, 'tenantA');
    const response = await appRoutes.documentSearch.GET(
      new NextRequest(apiUrl(`/api/v1/documents/search?communityId=${communityA.id}`)),
    );
    expect(response.status).toBe(200);
    const json = await parseJson<{ data: Array<Record<string, unknown>> }>(response);

    // Collect all searchText from results
    const searchTexts = json.data
      .map((d) => d['searchText'] as string | null)
      .filter(Boolean) as string[];

    // Forbidden sentinels for tenant in condo_718: meeting_minutes, announcements, uncategorized
    for (const text of searchTexts) {
      expect(text).not.toContain(`${SENTINEL_PREFIX}meeting_minutes`);
      expect(text).not.toContain(`${SENTINEL_PREFIX}announcements`);
      expect(text).not.toContain(`${SENTINEL_PREFIX}uncategorized`);
    }
  });

  it('siteManagerC search: only allowed categories; sentinel text from forbidden docs never appears', async () => {
    const kit = requireState();
    const appRoutes = requireRoutes();
    const communityC = requireCommunity(kit, 'communityC');

    setActor(kit, 'siteManagerC');
    const response = await appRoutes.documentSearch.GET(
      new NextRequest(apiUrl(`/api/v1/documents/search?communityId=${communityC.id}`)),
    );
    expect(response.status).toBe(200);
    const json = await parseJson<{ data: Array<Record<string, unknown>> }>(response);

    const searchTexts = json.data
      .map((d) => d['searchText'] as string | null)
      .filter(Boolean) as string[];

    // Forbidden sentinels for site_manager in apartment: lease_docs, community_handbook, move_in_out_docs, uncategorized
    for (const text of searchTexts) {
      expect(text).not.toContain(`${SENTINEL_PREFIX}lease_docs`);
      expect(text).not.toContain(`${SENTINEL_PREFIX}community_handbook`);
      expect(text).not.toContain(`${SENTINEL_PREFIX}move_in_out_docs`);
      expect(text).not.toContain(`${SENTINEL_PREFIX}uncategorized`);
    }
  });

  // =========================================================================
  // P4-58 expansion: Owner role (elevated) — condo + HOA
  // =========================================================================

  it('owner in condo_718 sees ALL categories + uncategorized (elevated)', async () => {
    const { titles } = await getDocumentCategoryNames('ownerA', 'communityA');
    const suffix = requireState().runSuffix;

    for (const cat of CONDO_CATEGORIES) {
      expect(titles).toContain(`${cat} Doc ${suffix}`);
    }
    expect(titles).toContain(`Uncategorized Doc A ${suffix}`);
  });

  // =========================================================================
  // P4-58 expansion: HOA (communityB) coverage
  // =========================================================================

  it('board_president in hoa_720 sees ALL categories + uncategorized', async () => {
    const { titles } = await getDocumentCategoryNames('actorB', 'communityB');
    const suffix = requireState().runSuffix;

    for (const cat of HOA_CATEGORIES) {
      expect(titles).toContain(`${cat} Doc ${suffix}`);
    }
    expect(titles).toContain(`Uncategorized Doc B ${suffix}`);
  });

  it('owner in hoa_720 sees ALL categories + uncategorized (elevated)', async () => {
    const { titles } = await getDocumentCategoryNames('ownerB', 'communityB');
    const suffix = requireState().runSuffix;

    for (const cat of HOA_CATEGORIES) {
      expect(titles).toContain(`${cat} Doc ${suffix}`);
    }
    expect(titles).toContain(`Uncategorized Doc B ${suffix}`);
  });

  it('tenant in hoa_720 sees only declaration, rules, inspection_reports', async () => {
    const { titles } = await getDocumentCategoryNames('tenantB', 'communityB');
    const suffix = requireState().runSuffix;

    // Should see
    expect(titles).toContain(`declaration Doc ${suffix}`);
    expect(titles).toContain(`rules Doc ${suffix}`);
    expect(titles).toContain(`inspection_reports Doc ${suffix}`);

    // Should NOT see
    expect(titles).not.toContain(`meeting_minutes Doc ${suffix}`);
    expect(titles).not.toContain(`announcements Doc ${suffix}`);
    expect(titles).not.toContain(`Uncategorized Doc B ${suffix}`);
  });

  it('cam in hoa_720 sees only rules, inspection_reports, announcements, meeting_minutes', async () => {
    const { titles } = await getDocumentCategoryNames('camB', 'communityB');
    const suffix = requireState().runSuffix;

    // Should see
    expect(titles).toContain(`rules Doc ${suffix}`);
    expect(titles).toContain(`inspection_reports Doc ${suffix}`);
    expect(titles).toContain(`announcements Doc ${suffix}`);
    expect(titles).toContain(`meeting_minutes Doc ${suffix}`);

    // Should NOT see
    expect(titles).not.toContain(`declaration Doc ${suffix}`);
    expect(titles).not.toContain(`Uncategorized Doc B ${suffix}`);
  });
});
