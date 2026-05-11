/**
 * Phase 0.5 tenant-isolation game day.
 *
 * This is the automated CI-sized version of the game-day experiment:
 * a Sunset writer worker mutates tenant data while a Palm Shores reader
 * worker continuously polls the same resource surfaces and asserts that no
 * Sunset sentinel crosses the boundary.
 */
import { randomUUID } from 'node:crypto';
import { NextRequest } from 'next/server';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from '@propertypro/db/filters';
import { MULTI_TENANT_COMMUNITIES } from '../fixtures/multi-tenant-communities';
import { MULTI_TENANT_USERS, type MultiTenantUserKey } from '../fixtures/multi-tenant-users';
import {
  apiUrl,
  getDescribeDb,
  initTestKit,
  jsonRequest,
  parseJson,
  readNumberField,
  requireCommunity,
  requireDatabaseUrlInCI,
  requireInsertedRow,
  requireUser,
  runAsActor,
  seedCommunities,
  seedUsers,
  teardownTestKit,
  trackUserForCleanup,
  type TestKitState,
} from './helpers/multi-tenant-test-kit';

requireDatabaseUrlInCI('Tenant isolation game day integration tests');

const describeDb = getDescribeDb();
const WRITER_ITERATIONS = 6;
const READER_ITERATIONS = 10;

type AnnouncementsRouteModule = typeof import('../../src/app/api/v1/announcements/route');
type DocumentsRouteModule = typeof import('../../src/app/api/v1/documents/route');
type ResidentsRouteModule = typeof import('../../src/app/api/v1/residents/route');

let state: TestKitState | null = null;
let announcementsRoute: AnnouncementsRouteModule | null = null;
let documentsRoute: DocumentsRouteModule | null = null;
let residentsRoute: ResidentsRouteModule | null = null;
let communityACategoryId: number | null = null;
let communityBCategoryId: number | null = null;

function requireState(): TestKitState {
  if (!state) throw new Error('Test state not initialized');
  return state;
}

function routes(): {
  announcements: AnnouncementsRouteModule;
  documents: DocumentsRouteModule;
  residents: ResidentsRouteModule;
} {
  if (!announcementsRoute || !documentsRoute || !residentsRoute) {
    throw new Error('Routes not initialized');
  }
  return {
    announcements: announcementsRoute,
    documents: documentsRoute,
    residents: residentsRoute,
  };
}

function requireCategoryId(value: number | null, label: string): number {
  if (!value) throw new Error(`${label} category not initialized`);
  return value;
}

function assertTenantRows(
  rows: Array<Record<string, unknown>>,
  expectedCommunityId: number,
  forbiddenNeedle: string,
  label: string,
): void {
  for (const row of rows) {
    if ('communityId' in row) {
      expect(row['communityId'], `${label} row communityId`).toBe(expectedCommunityId);
    }

    const serialized = JSON.stringify(row);
    expect(serialized, `${label} row leaked writer sentinel`).not.toContain(forbiddenNeedle);
  }
}

async function seedDocumentCategory(
  kit: TestKitState,
  communityKey: 'communityA' | 'communityB',
): Promise<number> {
  const community = requireCommunity(kit, communityKey);
  const scoped = kit.dbModule.createScopedClient(community.id);
  const [row] = await scoped.insert(kit.dbModule.documentCategories, {
    name: `Game Day Docs ${communityKey} ${kit.runSuffix}`,
    description: 'Tenant isolation game-day fixture category',
    sortOrder: 1,
    isActive: true,
    visibility: 'all',
  });
  return readNumberField(requireInsertedRow(row, `${communityKey} document category`), 'id');
}

async function insertDocumentFixture(
  kit: TestKitState,
  communityKey: 'communityA' | 'communityB',
  categoryId: number,
  title: string,
): Promise<void> {
  const community = requireCommunity(kit, communityKey);
  const uploader = requireUser(kit, communityKey === 'communityA' ? 'actorA' : 'actorB');
  const scoped = kit.dbModule.createScopedClient(community.id);
  await scoped.insert(kit.dbModule.documents, {
    title,
    description: `Game-day document for ${community.fixture.name}`,
    categoryId,
    filePath: `communities/${community.id}/documents/${title}.pdf`,
    fileName: `${title}.pdf`,
    fileSize: 1024,
    mimeType: 'application/pdf',
    sourceType: 'library',
    uploadedBy: uploader.id,
    extractionStatus: 'not_applicable',
  });
}

async function runSunsetWriter(): Promise<void> {
  const kit = requireState();
  const { announcements, residents } = routes();
  const communityA = requireCommunity(kit, 'communityA');
  const categoryA = requireCategoryId(communityACategoryId, 'communityA');

  await runAsActor(kit, 'actorA', async () => {
    for (let i = 0; i < WRITER_ITERATIONS; i += 1) {
      const sentinel = `GAME_DAY_A_${kit.runSuffix}_${i}`;

      const announcementResponse = await announcements.POST(
        jsonRequest(apiUrl('/api/v1/announcements'), 'POST', {
          communityId: communityA.id,
          title: sentinel,
          body: `Sunset writer payload ${sentinel}`,
          audience: 'all',
          isPinned: false,
        }),
      );
      expect(announcementResponse.status).toBe(201);

      const residentResponse = await residents.POST(
        jsonRequest(apiUrl('/api/v1/residents'), 'POST', {
          communityId: communityA.id,
          email: `${sentinel.toLowerCase()}@example.com`,
          fullName: `Sunset Writer ${i}`,
          role: 'manager',
          isUnitOwner: false,
          presetKey: 'board_member',
        }),
      );
      expect(residentResponse.status).toBe(201);
      const residentJson = await parseJson<{ data: Record<string, unknown> }>(residentResponse);
      const createdUserId = residentJson.data['userId'];
      if (typeof createdUserId === 'string') {
        trackUserForCleanup(kit, createdUserId);
      }

      await insertDocumentFixture(kit, 'communityA', categoryA, sentinel);
    }
  });
}

async function pollPalmReader(): Promise<void> {
  const kit = requireState();
  const { announcements, documents, residents } = routes();
  const communityB = requireCommunity(kit, 'communityB');
  const forbiddenNeedle = `GAME_DAY_A_${kit.runSuffix}`;

  await runAsActor(kit, 'actorB', async () => {
    for (let i = 0; i < READER_ITERATIONS; i += 1) {
      const [announcementResponse, documentResponse, residentResponse] = await Promise.all([
        announcements.GET(
          new NextRequest(apiUrl(`/api/v1/announcements?communityId=${communityB.id}`)),
        ),
        documents.GET(
          new NextRequest(apiUrl(`/api/v1/documents?communityId=${communityB.id}&pageSize=100`)),
        ),
        residents.GET(new NextRequest(apiUrl(`/api/v1/residents?communityId=${communityB.id}`))),
      ]);

      expect(announcementResponse.status).toBe(200);
      expect(documentResponse.status).toBe(200);
      expect(residentResponse.status).toBe(200);

      const announcementJson = await parseJson<{
        data: { data: Array<Record<string, unknown>>; pagination: unknown };
      }>(
        announcementResponse,
      );
      const documentJson = await parseJson<{
        data: { data: Array<Record<string, unknown>>; pagination: unknown };
      }>(documentResponse);
      const residentJson = await parseJson<{ data: Array<Record<string, unknown>> }>(
        residentResponse,
      );

      assertTenantRows(
        announcementJson.data.data,
        communityB.id,
        forbiddenNeedle,
        'Palm announcements',
      );
      assertTenantRows(documentJson.data.data, communityB.id, forbiddenNeedle, 'Palm documents');
      assertTenantRows(residentJson.data, communityB.id, forbiddenNeedle, 'Palm residents');
    }
  });
}

async function runRollbackFault(): Promise<void> {
  const kit = requireState();
  const { announcements } = routes();
  const communityA = requireCommunity(kit, 'communityA');
  const sentinel = `GAME_DAY_ROLLBACK_${kit.runSuffix}`;

  await expect(
    kit.db.transaction(async (tx) => {
      await tx.insert(kit.dbModule.announcements).values({
        communityId: communityA.id,
        title: sentinel,
        body: 'This row must roll back after the injected FK violation',
        audience: 'all',
        publishedBy: requireUser(kit, 'actorA').id,
      });

      await tx.insert(kit.dbModule.userRoles).values({
        communityId: communityA.id,
        userId: randomUUID(),
        role: 'resident',
        isUnitOwner: false,
        displayTitle: 'Resident',
        unitId: 9_999_999_999,
      });
    }),
  ).rejects.toThrow();

  await runAsActor(kit, 'actorA', async () => {
    const response = await announcements.GET(
      new NextRequest(apiUrl(`/api/v1/announcements?communityId=${communityA.id}`)),
    );
    expect(response.status).toBe(200);
    const json = await parseJson<{
      data: { data: Array<Record<string, unknown>>; pagination: unknown };
    }>(response);
    expect(json.data.data.some((row) => row['title'] === sentinel)).toBe(false);
  });
}

describeDb('Phase 0.5: tenant-isolation game day (db-backed integration)', () => {
  beforeAll(async () => {
    if (!process.env.DATABASE_URL) return;

    state = await initTestKit();

    const communityFixtures = MULTI_TENANT_COMMUNITIES.filter((community) =>
      community.key === 'communityA' || community.key === 'communityB'
    );
    await seedCommunities(state, communityFixtures);

    const neededUsers: MultiTenantUserKey[] = ['actorA', 'actorB'];
    await seedUsers(
      state,
      MULTI_TENANT_USERS.filter((user) => neededUsers.includes(user.key)),
    );

    communityACategoryId = await seedDocumentCategory(state, 'communityA');
    communityBCategoryId = await seedDocumentCategory(state, 'communityB');
    await insertDocumentFixture(
      state,
      'communityB',
      communityBCategoryId,
      `GAME_DAY_B_BASELINE_${state.runSuffix}`,
    );

    announcementsRoute = await import('../../src/app/api/v1/announcements/route');
    documentsRoute = await import('../../src/app/api/v1/documents/route');
    residentsRoute = await import('../../src/app/api/v1/residents/route');
  });

  afterAll(async () => {
    if (state) await teardownTestKit(state);
  });

  it('holds under concurrent cross-community writer and reader load', async () => {
    await Promise.all([runSunsetWriter(), pollPalmReader()]);
  });

  it('rejects forged x-community-id headers instead of trusting caller tenant context', async () => {
    const kit = requireState();
    const { announcements } = routes();
    const communityA = requireCommunity(kit, 'communityA');
    const communityB = requireCommunity(kit, 'communityB');

    await runAsActor(kit, 'actorB', async () => {
      const mismatchedHeaderResponse = await announcements.GET(
        new NextRequest(apiUrl(`/api/v1/announcements?communityId=${communityB.id}`), {
          headers: { 'x-community-id': String(communityA.id) },
        }),
      );
      expect(mismatchedHeaderResponse.status).toBe(404);

      const forgedTargetResponse = await announcements.GET(
        new NextRequest(apiUrl(`/api/v1/announcements?communityId=${communityA.id}`), {
          headers: { 'x-community-id': String(communityA.id) },
        }),
      );
      expect(forgedTargetResponse.status).toBe(403);
    });
  });

  it('rolls back injected half-state before readers can observe it', async () => {
    await runRollbackFault();
  });

  it('keeps scoped clients fail-closed when community context is missing or crossed', async () => {
    const kit = requireState();
    const communityA = requireCommunity(kit, 'communityA');
    const communityB = requireCommunity(kit, 'communityB');

    expect(() => kit.dbModule.createScopedClient(null)).toThrow('Tenant context is required');

    const scopedA = kit.dbModule.createScopedClient(communityA.id);
    const scopedB = kit.dbModule.createScopedClient(communityB.id);
    const [communityARow] = await scopedA.insert(kit.dbModule.announcements, {
      title: `GAME_DAY_SCOPED_A_${kit.runSuffix}`,
      body: 'This scoped-client sentinel must not be visible through communityB',
      audience: 'all',
      publishedBy: requireUser(kit, 'actorA').id,
    });
    const communityAAnnouncementId = readNumberField(
      requireInsertedRow(communityARow, 'communityA scoped announcement'),
      'id',
    );

    const crossedRows = await scopedB.selectFrom<Record<string, unknown>>(
      kit.dbModule.announcements,
      {},
      eq(kit.dbModule.announcements.id, communityAAnnouncementId),
    );
    expect(crossedRows).toEqual([]);
  });
});
