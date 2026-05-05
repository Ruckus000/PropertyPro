/**
 * Compliance × document soft-delete integration test.
 *
 * Verifies the audit fix: when a document linked to a compliance checklist
 * item is soft-deleted, the item must NOT remain `'satisfied'`.
 *
 * Coverage:
 *   1. Link a document → status = 'satisfied'
 *   2. Soft-delete the linked document → checklist item's documentId is nulled
 *      and status flips to 'overdue' (deadline already in the past) or
 *      'unsatisfied' (deadline still in the future).
 */
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
  requireDatabaseUrlInCI,
  getDescribeDb,
} from './helpers/multi-tenant-test-kit';

requireDatabaseUrlInCI('Compliance × document soft-delete integration tests');

const describeDb = getDescribeDb();

const { requireAuthenticatedUserIdMock } = vi.hoisted(() => ({
  requireAuthenticatedUserIdMock: vi.fn(),
}));

vi.mock('@/lib/api/auth', () => ({
  requireAuthenticatedUserId: requireAuthenticatedUserIdMock,
}));

vi.mock('@/lib/middleware/subscription-guard', () => ({
  requireActiveSubscriptionForMutation: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/middleware/demo-grace-guard', () => ({
  assertNotDemoGrace: vi.fn().mockResolvedValue(undefined),
}));

type ComplianceRouteModule = typeof import('../../src/app/api/v1/compliance/route');
type DocumentsRouteModule = typeof import('../../src/app/api/v1/documents/route');

describeDb('compliance × document soft-delete (db-backed integration)', () => {
  let state: TestKitState | null = null;
  let complianceRoute: ComplianceRouteModule | null = null;
  let documentsRoute: DocumentsRouteModule | null = null;
  let actorACommunityId: number;

  beforeAll(async () => {
    if (!process.env.DATABASE_URL) return;

    state = await initTestKit();

    const communityA = MULTI_TENANT_COMMUNITIES.find((c) => c.key === 'communityA');
    if (!communityA) throw new Error('communityA fixture not found');
    await seedCommunities(state, [communityA]);

    const neededUsers: MultiTenantUserKey[] = ['actorA'];
    const userFixtures = MULTI_TENANT_USERS.filter((u) => neededUsers.includes(u.key));
    await seedUsers(state, userFixtures);

    complianceRoute = await import('../../src/app/api/v1/compliance/route');
    documentsRoute = await import('../../src/app/api/v1/documents/route');

    actorACommunityId = requireCommunity(state, 'communityA').id;

    // Generate the checklist for community A.
    await complianceRoute.POST(
      jsonRequest(apiUrl('/api/v1/compliance'), 'POST', {
        communityId: actorACommunityId,
      }),
    );
  });

  beforeEach(() => {
    vi.clearAllMocks();
    if (!state) return;
    requireAuthenticatedUserIdMock.mockImplementation(async () => requireCurrentActor(state!));
    setActor(state, 'actorA');
  });

  afterAll(async () => {
    if (state) await teardownTestKit(state);
  });

  it('soft-deleting a linked document unlinks the checklist item and flips it off satisfied', async () => {
    if (!state || !complianceRoute || !documentsRoute) throw new Error('Not initialized');

    // Find the first checklist item.
    const listResponse = await complianceRoute.GET(
      new Request(apiUrl(`/api/v1/compliance?communityId=${actorACommunityId}`)) as never,
    );
    expect(listResponse.status).toBe(200);
    const listJson = await parseJson<{ data: Array<Record<string, unknown>> }>(listResponse);
    const checklistItem = listJson.data[0];
    expect(checklistItem).toBeTruthy();
    const itemId = checklistItem!['id'] as number;

    // Seed a document in the actor community.
    const scoped = state.dbModule.createScopedClient(actorACommunityId);
    const [doc] = await scoped.insert(state.dbModule.documents, {
      title: `Compliance link doc ${state.runSuffix}`,
      filePath: `communities/${actorACommunityId}/documents/cl-${state.runSuffix}.pdf`,
      fileName: `cl-${state.runSuffix}.pdf`,
      fileSize: 4096,
      mimeType: 'application/pdf',
    });
    if (!doc) throw new Error('Failed to seed document');
    const documentId = doc['id'] as number;

    // Link the document.
    const linkResponse = await complianceRoute.PATCH(
      jsonRequest(apiUrl('/api/v1/compliance'), 'PATCH', {
        communityId: actorACommunityId,
        id: itemId,
        action: 'link_document',
        documentId,
      }),
    );
    expect(linkResponse.status).toBe(200);

    // Re-read — should now be satisfied.
    const afterLinkList = await complianceRoute.GET(
      new Request(apiUrl(`/api/v1/compliance?communityId=${actorACommunityId}`)) as never,
    );
    const afterLinkJson = await parseJson<{ data: Array<Record<string, unknown>> }>(afterLinkList);
    const linkedItem = afterLinkJson.data.find((r) => r['id'] === itemId);
    expect(linkedItem?.['status']).toBe('satisfied');
    expect(linkedItem?.['documentId']).toBe(documentId);

    // Soft-delete the document.
    const deleteUrl = apiUrl(
      `/api/v1/documents?id=${documentId}&communityId=${actorACommunityId}`,
    );
    const deleteResponse = await documentsRoute.DELETE(
      new Request(deleteUrl, { method: 'DELETE' }) as never,
    );
    expect(deleteResponse.status).toBe(200);

    // Re-read — the linked-FK must be cleared, and the status must NOT be satisfied.
    const afterDeleteList = await complianceRoute.GET(
      new Request(apiUrl(`/api/v1/compliance?communityId=${actorACommunityId}`)) as never,
    );
    const afterDeleteJson = await parseJson<{ data: Array<Record<string, unknown>> }>(afterDeleteList);
    const unlinkedItem = afterDeleteJson.data.find((r) => r['id'] === itemId);
    expect(unlinkedItem?.['documentId']).toBeNull();
    expect(unlinkedItem?.['status']).not.toBe('satisfied');
  });
});
