/**
 * The draft leak matrix: a document with `posted_at` NULL is visible to
 * managers and to NO ONE ELSE, on every path that reads `documents`.
 *
 * Real database, real routes and services. Each reader is asked about two
 * documents in a category every role may read — one draft, one posted — so a
 * case can only pass by telling them apart. The draft is ALSO flagged
 * `public_access = true`, which the API refuses to do, so the public-site
 * readers are shown not to rely on that refusal.
 *
 * Owners are the case that matters most: `buildDocumentAccessFilter` used to
 * return no filter at all for an elevated role, and owners are elevated.
 */
import { NextRequest } from 'next/server';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { MULTI_TENANT_COMMUNITIES } from '../fixtures/multi-tenant-communities';
import {
  MULTI_TENANT_USERS,
  type MultiTenantUserFixture,
  type MultiTenantUserKey,
} from '../fixtures/multi-tenant-users';
import {
  type TestKitState,
  apiUrl,
  getDescribeDb,
  initTestKit,
  jsonRequest,
  parseJson,
  readNumberField,
  requireCommunity,
  requireDatabaseUrlInCI,
  requireInsertedRow,
  seedCommunities,
  seedUsers,
  setActor,
  teardownTestKit,
} from './helpers/multi-tenant-test-kit';

requireDatabaseUrlInCI('Document draft integration tests');

const describeDb = getDescribeDb();

// The shared fixtures carry no unit owner, and owners are the role this file
// exists for. Authentication comes from the shared setup (`setActor`).
const OWNER_KEY = 'ownerA' as MultiTenantUserKey;
const OWNER_FIXTURE: MultiTenantUserFixture = {
  key: OWNER_KEY,
  communityKey: 'communityA',
  role: 'resident',
  isUnitOwner: true,
  displayTitle: 'Owner',
  emailPrefix: 'drafts-owner-a',
  fullName: 'Drafts Owner A',
};

let state: TestKitState | null = null;
let marker = '';
const ids = { draft: 0, posted: 0 };

function kit(): TestKitState {
  if (!state) throw new Error('Test state not initialized');
  return state;
}

function communityId(): number {
  return requireCommunity(kit(), 'communityA').id;
}

async function listedIds(): Promise<number[]> {
  const route = await import('../../src/app/api/v1/documents/route');
  const res = await route.GET(
    jsonRequest(apiUrl(`/api/v1/documents?communityId=${communityId()}&pageSize=100`), 'GET'),
  );
  expect(res.status).toBe(200);
  const body = await parseJson<{ data: { data: Array<{ id: number }> } }>(res);
  return body.data.data.map((d) => d.id);
}

async function downloadStatus(documentId: number): Promise<number> {
  const route = await import('../../src/app/api/v1/documents/[id]/download/route');
  const res = await route.GET(
    new NextRequest(apiUrl(`/api/v1/documents/${documentId}/download?communityId=${communityId()}`)),
    { params: Promise.resolve({ id: String(documentId) }) },
  );
  return res.status;
}

async function paletteIds(q: string): Promise<number[]> {
  const route = await import('../../src/app/api/v1/search/route');
  const res = await route.GET(
    new NextRequest(apiUrl(`/api/v1/search?communityId=${communityId()}&q=${encodeURIComponent(q)}&limit=20`)),
  );
  const body = await parseJson<{
    data: { groups: Array<{ key: string; status: string; results: Array<{ id: number | string }> }> };
  }>(res);
  const group = body.data.groups.find((g) => g.key === 'documents');
  expect(group?.status).toBe('ok');
  return (group?.results ?? []).map((r) => Number(r.id));
}

async function documentSearchIds(q: string): Promise<number[]> {
  const route = await import('../../src/app/api/v1/documents/search/route');
  const res = await route.GET(
    new NextRequest(apiUrl(`/api/v1/documents/search?communityId=${communityId()}&q=${encodeURIComponent(q)}`)),
  );
  expect(res.status).toBe(200);
  const body = await parseJson<{ data: Array<{ id: number }> | { data: Array<{ id: number }> } }>(res);
  const rows = Array.isArray(body.data) ? body.data : body.data.data;
  return rows.map((r) => Number(r.id));
}

describeDb('document drafts are visible to managers only', () => {
  beforeAll(async () => {
    if (!process.env.DATABASE_URL) return;
    state = await initTestKit();
    marker = `zd${state.runSuffix.replace(/[^a-z0-9]/gi, '').toLowerCase()}`;

    const communityA = MULTI_TENANT_COMMUNITIES.find((c) => c.key === 'communityA');
    if (!communityA) throw new Error('communityA fixture missing');
    await seedCommunities(state, [communityA]);
    const needed: MultiTenantUserKey[] = ['actorA', 'tenantA'];
    await seedUsers(state, [...MULTI_TENANT_USERS.filter((u) => needed.includes(u.key)), OWNER_FIXTURE]);

    const id = communityId();
    const db = state.dbModule;
    const scoped = db.createScopedClient(id);
    // `rules` is readable by every role, so only the draft rule can hide a row.
    const categoryId = readNumberField(
      requireInsertedRow(
        (await scoped.insert(db.documentCategories, {
          name: 'Rules',
          description: 'drafts integration',
          sortOrder: 1,
          isActive: true,
          visibility: 'all',
        }))[0],
        'category',
      ),
      'id',
    );

    const insert = async (title: string, postedAt: Date | null) =>
      readNumberField(
        requireInsertedRow(
          (await scoped.insert(db.documents, {
            title,
            categoryId,
            filePath: `communities/${id}/documents/${marker}/${title}.pdf`,
            fileName: `${title}.pdf`,
            fileSize: 10,
            mimeType: 'application/pdf',
            sourceType: 'library',
            publicAccess: true,
            postedAt,
          }))[0],
          title,
        ),
        'id',
      );
    ids.draft = await insert(`Pool Rules Draft ${marker}`, null);
    ids.posted = await insert(`Pool Rules Posted ${marker}`, new Date());

    for (const documentId of [ids.draft, ids.posted]) {
      await db.updateDocumentExtractionSuccess({
        communityId: id,
        documentId,
        text: `swimming hours ${marker}body`,
        status: 'completed',
      });
    }
  });

  afterAll(async () => {
    if (state) await teardownTestKit(state);
  });

  it.each([['tenantA'], [OWNER_KEY]] as Array<[MultiTenantUserKey]>)(
    '%s: the library list, download, palette and documents search all hide the draft',
    async (actor) => {
      setActor(kit(), actor);

      const listed = await listedIds();
      expect(listed).toContain(ids.posted);
      expect(listed).not.toContain(ids.draft);

      expect(await downloadStatus(ids.draft)).toBe(404);

      const palette = await paletteIds(marker);
      expect(palette).toContain(ids.posted);
      expect(palette).not.toContain(ids.draft);

      const content = await paletteIds(`${marker}body`);
      expect(content).not.toContain(ids.draft);

      const search = await documentSearchIds(marker);
      expect(search).toContain(ids.posted);
      expect(search).not.toContain(ids.draft);
    },
  );

  it('a manager sees the draft in the list, can open it, and finds it in search', async () => {
    setActor(kit(), 'actorA');

    expect(await listedIds()).toEqual(expect.arrayContaining([ids.draft, ids.posted]));
    expect(await downloadStatus(ids.draft)).not.toBe(404);
    expect(await paletteIds(marker)).toContain(ids.draft);
  });

  it('the public site, public download and sitemap never serve the draft — even flagged public', async () => {
    const { getPublicCommunityScopedReader } = await import('../../src/lib/db/public-community-reader');
    const reader = getPublicCommunityScopedReader(communityId());

    const listed = (await reader.listDocuments({ limit: 50, includeCategories: ['Rules'] })).map((d) => d.id);
    expect(listed).toContain(ids.posted);
    expect(listed).not.toContain(ids.draft);

    expect(await reader.getPublicDocumentFile(ids.draft)).toBeNull();
    expect(await reader.getPublicDocumentFile(ids.posted)).not.toBeNull();

    const sitemap = (await reader.listPublicDocumentsForSitemap({ limit: 50 })).map((d) => d.id);
    expect(sitemap).toContain(ids.posted);
    expect(sitemap).not.toContain(ids.draft);
  });

  it('the snowbird digest lists the posted document and not the draft', async () => {
    const { compileSnowbirdDigest } = await import('../../src/lib/services/snowbird-digest-service');
    const scoped = kit().dbModule.createScopedClient(communityId());
    const now = new Date();

    const out = await compileSnowbirdDigest(
      scoped,
      communityId(),
      new Date(now.getTime() - 60 * 60 * 1000),
      new Date(now.getTime() + 60 * 60 * 1000),
      false,
    );

    const titles = out.newDocuments.map((d) => d.title);
    expect(titles).toContain(`Pool Rules Posted ${marker}`);
    expect(titles).not.toContain(`Pool Rules Draft ${marker}`);
  });

  it('meeting attachments do not show a draft', async () => {
    const { listMeetingAttachedDocuments } = await import('../../src/lib/services/meeting-service');

    const shown = (await listMeetingAttachedDocuments(communityId(), [ids.draft, ids.posted])).map(
      (d) => d.id,
    );

    expect(shown).toEqual([ids.posted]);
  });

  it('the community export (which a board-designated resident can run) leaves the draft out', async () => {
    const { exportDocuments } = await import('../../src/lib/services/community-export');

    const csv = (await exportDocuments(communityId())).content;

    expect(csv).toContain(`Pool Rules Posted ${marker}`);
    expect(csv).not.toContain(`Pool Rules Draft ${marker}`);
  });

  it('posting the draft makes it visible to owners; taking it back hides it again', async () => {
    const route = await import('../../src/app/api/v1/documents/route');
    const patch = (body: Record<string, unknown>) =>
      route.PATCH(
        jsonRequest(
          apiUrl(`/api/v1/documents?id=${ids.draft}&communityId=${communityId()}`),
          'PATCH',
          body,
        ),
      );

    setActor(kit(), 'actorA');
    expect((await patch({ posted: true, redactionAttested: true })).status).toBe(200);
    setActor(kit(), OWNER_KEY);
    expect(await listedIds()).toContain(ids.draft);

    // Link it to a compliance item while posted, so un-posting has a link to clear.
    const scoped = kit().dbModule.createScopedClient(communityId());
    const [itemRow] = await scoped.insert(kit().dbModule.complianceChecklistItems, {
      templateKey: `drafts_${marker}`,
      title: 'Rules and regulations',
      category: 'governing_documents',
      statuteReference: '§718.111(12)(g)',
      documentId: ids.draft,
      documentPostedAt: new Date(),
    });
    const itemId = readNumberField(requireInsertedRow(itemRow, 'checklist item'), 'id');

    setActor(kit(), 'actorA');
    expect((await patch({ posted: false })).status).toBe(200);
    // Un-posting unlinks, as deleting does: compliance counters read the link alone.
    const items = await scoped.query(kit().dbModule.complianceChecklistItems);
    expect(items.find((r) => r['id'] === itemId)?.['documentId']).toBeNull();
    setActor(kit(), OWNER_KEY);
    expect(await listedIds()).not.toContain(ids.draft);

    // Taking it back also took it off the public site.
    const { getPublicCommunityScopedReader } = await import('../../src/lib/db/public-community-reader');
    expect(await getPublicCommunityScopedReader(communityId()).getPublicDocumentFile(ids.draft)).toBeNull();
    const rows = await kit().dbModule.createScopedClient(communityId()).query(kit().dbModule.documents);
    expect(rows.find((r) => r['id'] === ids.draft)?.['publicAccess']).toBe(false);
  });
});
