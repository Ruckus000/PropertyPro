/**
 * Documents soft-delete → Deleted column → restore, end to end against a real DB.
 *
 * Both halves of this round trip were dead on arrival because
 * `createScopedClient` unconditionally appends `deleted_at IS NULL` for any
 * table outside `SOFT_DELETE_EXEMPT_TABLES`. `paginateDeletedDocuments` and
 * `restoreDocument` each asked for `deleted_at IS NOT NULL` on top of that, so
 * both compiled to a contradiction and could never match a row:
 *   - the board's Deleted column was always empty, and
 *   - `PATCH { restore: true }` always 400'd with "Document not found, or not
 *     deleted".
 *
 * The route's own unit tests (`__tests__/documents/documents-route.test.ts`)
 * mock `documents-service` wholesale, which is exactly why they stayed green
 * over two dead queries. Only a db-backed test can see the contradiction — the
 * scope filters are built inside the scoped client, against a real table.
 *
 * The three cases are deliberately separable so a revert of either production
 * fix reddens a known subset:
 *   1. soft-delete removes a row from the live list  — independent control
 *   2. the deleted list returns soft-deleted rows    — paginateDeletedDocuments
 *   3. restore puts a row back                       — restoreDocument
 *
 * Nothing is mocked here — no-mock-guard forbids it under `__tests__/integration/`,
 * and none of it was needed:
 *   - auth: setup-integration.ts installs the shared `@/lib/api/auth` double
 *     globally via providers/test-auth-provider; initTestKit() registers this
 *     suite's state with it, so setActor() drives requireAuthenticatedUserId.
 *   - subscription-guard: seedCommunities() leaves subscriptionStatus null,
 *     which requireActiveSubscriptionForMutation explicitly treats as allowed
 *     (and resolveLifecycleState maps it to an entitled state for the read guard).
 *   - demo-grace-guard: seeded communities are not demo-grace communities.
 */
import { eq } from '@propertypro/db/filters';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
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
  apiUrl,
  jsonRequest,
  parseJson,
  requireDatabaseUrlInCI,
  getDescribeDb,
} from './helpers/multi-tenant-test-kit';

requireDatabaseUrlInCI('Documents soft-delete / restore integration tests');

const describeDb = getDescribeDb();

type DocumentsRouteModule = typeof import('../../src/app/api/v1/documents/route');

interface PaginatedEnvelope {
  data: {
    data: Array<Record<string, unknown>>;
    pagination: { nextCursor: string | null; hasMore: boolean; pageSize: number };
  };
}

describeDb('documents soft-delete → deleted list → restore (db-backed integration)', () => {
  let state: TestKitState | null = null;
  let documentsRoute: DocumentsRouteModule | null = null;
  let communityId: number;

  beforeAll(async () => {
    if (!process.env.DATABASE_URL) return;

    state = await initTestKit();

    const communityA = MULTI_TENANT_COMMUNITIES.find((c) => c.key === 'communityA');
    if (!communityA) throw new Error('communityA fixture not found');
    await seedCommunities(state, [communityA]);

    const neededUsers: MultiTenantUserKey[] = ['actorA'];
    await seedUsers(
      state,
      MULTI_TENANT_USERS.filter((u) => neededUsers.includes(u.key)),
    );

    documentsRoute = await import('../../src/app/api/v1/documents/route');
    communityId = requireCommunity(state, 'communityA').id;

    // beforeAll runs before beforeEach, so the actor must be set here too —
    // the shared auth provider throws when no actor is registered.
    setActor(state, 'actorA');
  });

  beforeEach(() => {
    if (!state) return;
    setActor(state, 'actorA');
  });

  afterAll(async () => {
    if (state) await teardownTestKit(state);
  });

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  async function seedDocument(label: string, sourceType?: string): Promise<number> {
    if (!state) throw new Error('Not initialized');
    const scoped = state.dbModule.createScopedClient(communityId);
    const [row] = await scoped.insert(state.dbModule.documents, {
      title: `${label} ${state.runSuffix}`,
      filePath: `communities/${communityId}/documents/${label}-${state.runSuffix}.pdf`,
      fileName: `${label}-${state.runSuffix}.pdf`,
      fileSize: 2048,
      mimeType: 'application/pdf',
      ...(sourceType === undefined ? {} : { sourceType }),
    });
    if (!row) throw new Error(`Failed to seed document "${label}"`);
    return row['id'] as number;
  }

  /**
   * Soft-delete straight through the scoped client, not the DELETE route.
   * Violation evidence is deleted by the violations feature, never by the
   * documents route — this reproduces the row state, not the UI path.
   */
  async function softDeleteDirectly(documentId: number): Promise<void> {
    if (!state) throw new Error('Not initialized');
    const scoped = state.dbModule.createScopedClient(communityId);
    await scoped.softDelete(state.dbModule.documents, eq(state.dbModule.documents.id, documentId));
  }

  async function listLiveDocumentIds(): Promise<number[]> {
    if (!documentsRoute) throw new Error('Not initialized');
    const response = await documentsRoute.GET(
      new Request(apiUrl(`/api/v1/documents?communityId=${communityId}&pageSize=100`)) as never,
    );
    expect(response.status).toBe(200);
    const json = await parseJson<PaginatedEnvelope>(response);
    return json.data.data.map((row) => row['id'] as number);
  }

  async function listDeletedDocumentIds(): Promise<number[]> {
    if (!documentsRoute) throw new Error('Not initialized');
    const response = await documentsRoute.GET(
      new Request(
        apiUrl(`/api/v1/documents?communityId=${communityId}&deleted=true&pageSize=100`),
      ) as never,
    );
    expect(response.status).toBe(200);
    const json = await parseJson<PaginatedEnvelope>(response);
    return json.data.data.map((row) => row['id'] as number);
  }

  async function softDelete(documentId: number): Promise<Response> {
    if (!documentsRoute) throw new Error('Not initialized');
    return documentsRoute.DELETE(
      new Request(apiUrl(`/api/v1/documents?id=${documentId}&communityId=${communityId}`), {
        method: 'DELETE',
      }) as never,
    );
  }

  async function restore(documentId: number): Promise<Response> {
    if (!documentsRoute) throw new Error('Not initialized');
    return documentsRoute.PATCH(
      jsonRequest(
        apiUrl(`/api/v1/documents?id=${documentId}&communityId=${communityId}`),
        'PATCH',
        { restore: true },
      ) as never,
    );
  }

  // -------------------------------------------------------------------------
  // Cases
  // -------------------------------------------------------------------------

  it('soft-deleting a document removes it from the live list and leaves siblings alone', async () => {
    const targetId = await seedDocument('control-target');
    const survivorId = await seedDocument('control-survivor');

    const before = await listLiveDocumentIds();
    expect(before, 'both seeded documents should start out live').toEqual(
      expect.arrayContaining([targetId, survivorId]),
    );

    expect((await softDelete(targetId)).status).toBe(200);

    const after = await listLiveDocumentIds();
    expect(after, 'the soft-deleted document must leave the live list').not.toContain(targetId);
    expect(after, 'an untouched sibling must stay in the live list').toContain(survivorId);
  });

  it("the Deleted column returns soft-deleted documents, and only those", async () => {
    const targetId = await seedDocument('deleted-target');
    const survivorId = await seedDocument('deleted-survivor');

    expect(
      await listDeletedDocumentIds(),
      'a live document must not appear in the deleted list',
    ).not.toContain(targetId);

    expect((await softDelete(targetId)).status).toBe(200);

    const deleted = await listDeletedDocumentIds();
    expect(
      deleted,
      'the deleted list is empty of the document just soft-deleted — the Deleted column can never show it',
    ).toContain(targetId);
    expect(deleted, 'the deleted list must not leak live documents').not.toContain(survivorId);
  });

  it('restoring a soft-deleted document returns it to the live list and clears it from the deleted list', async () => {
    const targetId = await seedDocument('restore-target');

    expect((await softDelete(targetId)).status).toBe(200);
    expect(await listLiveDocumentIds()).not.toContain(targetId);

    const response = await restore(targetId);
    expect(
      response.status,
      'restore was rejected — PATCH { restore: true } could not find the soft-deleted document',
    ).toBe(200);
    const json = await parseJson<{ data: { id: number; restored: true } }>(response);
    expect(json.data).toMatchObject({ id: targetId, restored: true });

    expect(
      await listLiveDocumentIds(),
      'the restored document must be back in the live list',
    ).toContain(targetId);
    expect(
      await listDeletedDocumentIds(),
      'the restored document must be gone from the deleted list',
    ).not.toContain(targetId);
  });

  it('a soft-deleted violation-evidence row never reaches the Deleted column', async () => {
    // `violation_evidence` rows back violation photos and are absent from every
    // documents view — the live list drops them via `buildSourceTypeFilter`
    // inside `buildAccessibleDocumentsFilter`. The deleted list reads through
    // `queryWhere` instead, so it has to apply the same gate itself. Without
    // it, an evidence photo appears in the board's Deleted column with a
    // Restore button that would file it into the library.
    const evidenceId = await seedDocument('evidence', 'violation_evidence');
    const libraryId = await seedDocument('library-sibling');

    await softDeleteDirectly(evidenceId);
    await softDeleteDirectly(libraryId);

    const deleted = await listDeletedDocumentIds();

    expect(
      deleted,
      'a soft-deleted violation-evidence row surfaced in the Deleted column, where it can be restored into the documents library',
    ).not.toContain(evidenceId);
    expect(
      deleted,
      'control: an ordinary soft-deleted library document is still listed, so the filter is not simply emptying the result',
    ).toContain(libraryId);

    // It is absent from the live list too — before AND after, so the case
    // cannot pass merely because the row is invisible everywhere by accident.
    expect(await listLiveDocumentIds()).not.toContain(evidenceId);
  });

  it('restoring a document that is not deleted is rejected', async () => {
    const liveId = await seedDocument('not-deleted');

    const response = await restore(liveId);
    expect(response.status, 'restoring a live document must 400').toBe(400);
  });
});
