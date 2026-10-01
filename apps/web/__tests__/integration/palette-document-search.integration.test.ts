/**
 * The command palette's document search must apply the same read rule as the
 * documents library.
 *
 * It did not: `searchDocumentsByTrigram` filtered on community and
 * `deleted_at` only, so a tenant searching "Board Minutes" was shown minutes
 * their library hides, violation-evidence rows came back, and a content query
 * answered "yes, a record you cannot open contains this word". Found while
 * auditing for the document draft state (2026-09-30), confirmed in a browser.
 *
 * Real database, real route: the defect lived in the SQL and in the caller's
 * wiring, and a mocked query would prove neither.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { MULTI_TENANT_COMMUNITIES } from '../fixtures/multi-tenant-communities';
import { MULTI_TENANT_USERS, type MultiTenantUserKey } from '../fixtures/multi-tenant-users';
import {
  type TestKitState,
  apiUrl,
  getDescribeDb,
  initTestKit,
  parseJson,
  readNumberField,
  requireCommunity,
  requireCurrentActor,
  requireDatabaseUrlInCI,
  requireInsertedRow,
  seedCommunities,
  seedUsers,
  setActor,
  teardownTestKit,
} from './helpers/multi-tenant-test-kit';
import { NextRequest } from 'next/server';

requireDatabaseUrlInCI('Palette document search integration tests');

const describeDb = getDescribeDb();

const { requireAuthenticatedUserIdMock } = vi.hoisted(() => ({
  requireAuthenticatedUserIdMock: vi.fn(),
}));

vi.mock('@/lib/api/auth', () => ({
  requireAuthenticatedUserId: requireAuthenticatedUserIdMock,
}));

type SearchRouteModule = typeof import('../../src/app/api/v1/search/route');

let state: TestKitState | null = null;
let searchRoute: SearchRouteModule | null = null;
/** A word unique to this run, so other suites' rows cannot match. */
let marker = '';
const ids = { rules: 0, minutes: 0, evidence: 0 };

function kit(): TestKitState {
  if (!state) throw new Error('Test state not initialized');
  return state;
}

async function searchDocuments(q: string): Promise<number[]> {
  if (!searchRoute) throw new Error('Route not loaded');
  const communityA = requireCommunity(kit(), 'communityA');
  const res = await searchRoute.GET(
    new NextRequest(apiUrl(`/api/v1/search?communityId=${communityA.id}&q=${encodeURIComponent(q)}&limit=20`)),
  );
  expect(res.status).toBe(200);
  const body = await parseJson<{
    // Raw SQL returns bigint ids as strings; compare as numbers.
    data: { groups: Array<{ key: string; status: string; results: Array<{ id: number | string }> }> };
  }>(res);
  const group = body.data.groups.find((g) => g.key === 'documents');
  // A group that errored would read as "found nothing" — refuse that.
  expect(group?.status).toBe('ok');
  return (group?.results ?? []).map((r) => Number(r.id));
}

describeDb('command palette document search respects document access', () => {
  beforeAll(async () => {
    if (!process.env.DATABASE_URL) return;
    state = await initTestKit();
    marker = `zq${state.runSuffix.replace(/[^a-z0-9]/gi, '').toLowerCase()}`;

    const communityA = MULTI_TENANT_COMMUNITIES.find((c) => c.key === 'communityA');
    if (!communityA) throw new Error('communityA fixture missing');
    await seedCommunities(state, [communityA]);
    const needed: MultiTenantUserKey[] = ['actorA', 'tenantA'];
    await seedUsers(state, MULTI_TENANT_USERS.filter((u) => needed.includes(u.key)));

    const id = requireCommunity(state, 'communityA').id;
    const db = state.dbModule;
    const scoped = db.createScopedClient(id);

    const category = async (name: string) =>
      readNumberField(
        requireInsertedRow(
          (await scoped.insert(db.documentCategories, {
            name,
            description: 'palette search integration',
            sortOrder: 1,
            isActive: true,
            visibility: 'all',
          }))[0],
          name,
        ),
        'id',
      );
    // A condo tenant may read `rules`; `meeting_minutes` is owners and managers only.
    const rulesCategory = await category('Rules');
    const minutesCategory = await category('Meeting Minutes');

    const doc = async (title: string, categoryId: number, sourceType: 'library' | 'violation_evidence') =>
      readNumberField(
        requireInsertedRow(
          (await scoped.insert(db.documents, {
            title,
            categoryId,
            filePath: `communities/${id}/documents/${marker}/${title}.pdf`,
            fileName: `${title}.pdf`,
            fileSize: 10,
            mimeType: 'application/pdf',
            sourceType,
          }))[0],
          title,
        ),
        'id',
      );
    ids.rules = await doc(`Pool Rules ${marker}`, rulesCategory, 'library');
    ids.minutes = await doc(`Board Minutes ${marker}`, minutesCategory, 'library');
    ids.evidence = await doc(`Violation Photo ${marker}`, rulesCategory, 'violation_evidence');

    // Content the title search cannot see, for the tsvector fallback.
    for (const documentId of [ids.rules, ids.minutes, ids.evidence]) {
      await db.updateDocumentExtractionSuccess({
        communityId: id,
        documentId,
        text: `confidential settlement ${marker}content`,
        status: 'completed',
      });
    }

    searchRoute = await import('../../src/app/api/v1/search/route');
  });

  beforeEach(() => {
    requireAuthenticatedUserIdMock.mockImplementation(async () => requireCurrentActor(kit()));
  });

  afterAll(async () => {
    if (state) await teardownTestKit(state);
  });

  it('a tenant’s TITLE search returns only what their library shows', async () => {
    setActor(kit(), 'tenantA');

    const found = await searchDocuments(marker);

    expect(found).toContain(ids.rules);
    expect(found).not.toContain(ids.minutes);
    expect(found).not.toContain(ids.evidence);
  });

  it('a tenant’s CONTENT search cannot probe a record they cannot open', async () => {
    setActor(kit(), 'tenantA');

    const found = await searchDocuments(`${marker}content`);

    expect(found).toContain(ids.rules);
    expect(found).not.toContain(ids.minutes);
    expect(found).not.toContain(ids.evidence);
  });

  it('a manager finds every library record, and still never violation evidence', async () => {
    setActor(kit(), 'actorA');

    const byTitle = await searchDocuments(marker);
    const byContent = await searchDocuments(`${marker}content`);

    expect(byTitle).toEqual(expect.arrayContaining([ids.rules, ids.minutes]));
    expect(byContent).toEqual(expect.arrayContaining([ids.rules, ids.minutes]));
    expect([...byTitle, ...byContent]).not.toContain(ids.evidence);
  });
});
