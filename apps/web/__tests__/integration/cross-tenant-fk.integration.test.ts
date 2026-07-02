/**
 * Cross-tenant FK validation integration test.
 *
 * Verifies that routes accepting `unitId` / `documentId` in their request body
 * reject IDs that resolve outside the actor's active community. Without these
 * checks, a community-A admin can post a community-B unitId or documentId and
 * silently bind the new row to a foreign tenant — defeating tenant isolation.
 *
 * Coverage:
 *   1. POST /api/v1/residents — foreign unitId rejected with 400
 *   2. PATCH /api/v1/residents — foreign unitId rejected with 400
 *   3. PATCH /api/v1/compliance link_document — foreign documentId rejected with 400
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

requireDatabaseUrlInCI('Cross-tenant FK rejection integration tests');

const describeDb = getDescribeDb();

const { requireAuthenticatedUserIdMock } = vi.hoisted(() => ({
  requireAuthenticatedUserIdMock: vi.fn(),
}));

vi.mock('@/lib/api/auth', () => ({
  requireAuthenticatedUserId: requireAuthenticatedUserIdMock,
}));

type ResidentsRouteModule = typeof import('../../src/app/api/v1/residents/route');
type ComplianceRouteModule = typeof import('../../src/app/api/v1/compliance/route');

describeDb('cross-tenant FK rejection (db-backed integration)', () => {
  let state: TestKitState | null = null;
  let residentsRoute: ResidentsRouteModule | null = null;
  let complianceRoute: ComplianceRouteModule | null = null;
  let foreignUnitId: number;
  let foreignDocumentId: number;
  let actorACommunityId: number;
  let createdResidentUserId: string | null = null;

  beforeAll(async () => {
    if (!process.env.DATABASE_URL) return;

    state = await initTestKit();

    const communityA = MULTI_TENANT_COMMUNITIES.find((c) => c.key === 'communityA');
    const communityC = MULTI_TENANT_COMMUNITIES.find((c) => c.key === 'communityC');
    if (!communityA || !communityC) throw new Error('Required community fixtures not found');
    await seedCommunities(state, [communityA, communityC]);

    const neededUsers: MultiTenantUserKey[] = ['actorA', 'actorC', 'tenantA'];
    const userFixtures = MULTI_TENANT_USERS.filter((u) => neededUsers.includes(u.key));
    await seedUsers(state, userFixtures);

    residentsRoute = await import('../../src/app/api/v1/residents/route');
    complianceRoute = await import('../../src/app/api/v1/compliance/route');

    actorACommunityId = requireCommunity(state, 'communityA').id;
    const communityCId = requireCommunity(state, 'communityC').id;

    // Seed a unit and a document inside community C — they must NOT be usable
    // from community A.
    const scopedC = state.dbModule.createScopedClient(communityCId);
    const [unitC] = await scopedC.insert(state.dbModule.units, {
      unitNumber: `XFK-UNIT-${state.runSuffix}`,
      buildingId: null,
    });
    if (!unitC) throw new Error('Failed to seed foreign unit');
    foreignUnitId = unitC['id'] as number;

    const [docC] = await scopedC.insert(state.dbModule.documents, {
      title: `XFK Doc ${state.runSuffix}`,
      filePath: `communities/${communityCId}/documents/xfk-${state.runSuffix}.pdf`,
      fileName: `xfk-${state.runSuffix}.pdf`,
      fileSize: 4096,
      mimeType: 'application/pdf',
    });
    if (!docC) throw new Error('Failed to seed foreign document');
    foreignDocumentId = docC['id'] as number;
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

  it('POST /residents rejects a unitId that belongs to another community', async () => {
    if (!state || !residentsRoute) throw new Error('Not initialized');

    const response = await residentsRoute.POST(
      jsonRequest(apiUrl('/api/v1/residents'), 'POST', {
        communityId: actorACommunityId,
        email: `xfk-resident-${state.runSuffix}@example.com`,
        fullName: `XFK Resident ${state.runSuffix}`,
        role: 'resident',
        unitId: foreignUnitId,
        isUnitOwner: false,
      }),
    );

    expect(response.status).toBe(400);
    const body = await parseJson<{ error?: { details?: { fields?: Record<string, string> } } }>(response);
    expect(body.error?.details?.fields).toMatchObject({ unitId: expect.any(String) });
  });

  it('POST /residents accepts a unitId from the actor community', async () => {
    if (!state || !residentsRoute) throw new Error('Not initialized');

    const scopedA = state.dbModule.createScopedClient(actorACommunityId);
    const [unitA] = await scopedA.insert(state.dbModule.units, {
      unitNumber: `XFK-OK-${state.runSuffix}`,
      buildingId: null,
    });
    if (!unitA) throw new Error('Failed to seed actor-community unit');

    const response = await residentsRoute.POST(
      jsonRequest(apiUrl('/api/v1/residents'), 'POST', {
        communityId: actorACommunityId,
        email: `xfk-ok-${state.runSuffix}@example.com`,
        fullName: `XFK OK ${state.runSuffix}`,
        role: 'resident',
        unitId: unitA['id'] as number,
        isUnitOwner: false,
      }),
    );

    expect(response.status).toBe(201);
    const body = await parseJson<{ data: { userId: string } }>(response);
    createdResidentUserId = body.data.userId;
  });

  it('PATCH /residents rejects a unitId that belongs to another community', async () => {
    if (!state || !residentsRoute) throw new Error('Not initialized');
    if (!createdResidentUserId) throw new Error('Resident not created');

    const response = await residentsRoute.PATCH(
      jsonRequest(apiUrl('/api/v1/residents'), 'PATCH', {
        communityId: actorACommunityId,
        userId: createdResidentUserId,
        unitId: foreignUnitId,
      }),
    );

    expect(response.status).toBe(400);
    const body = await parseJson<{ error?: { details?: { fields?: Record<string, string> } } }>(response);
    expect(body.error?.details?.fields).toMatchObject({ unitId: expect.any(String) });
  });

  it('PATCH /compliance link_document rejects a foreign documentId', async () => {
    if (!state || !complianceRoute) throw new Error('Not initialized');

    // Seed a checklist item in community A.
    const scopedA = state.dbModule.createScopedClient(actorACommunityId);
    const [item] = await scopedA.insert(state.dbModule.complianceChecklistItems, {
      itemKey: `xfk-${state.runSuffix}`,
      title: `XFK Compliance Item ${state.runSuffix}`,
      category: 'governing_documents',
      isApplicable: true,
    });
    if (!item) throw new Error('Failed to seed compliance checklist item');

    const response = await complianceRoute.PATCH(
      jsonRequest(apiUrl('/api/v1/compliance'), 'PATCH', {
        communityId: actorACommunityId,
        id: item['id'] as number,
        action: 'link_document',
        documentId: foreignDocumentId,
      }),
    );

    expect(response.status).toBe(400);
    const body = await parseJson<{ error?: { details?: { fields?: Record<string, string> } } }>(response);
    expect(body.error?.details?.fields).toMatchObject({ documentId: expect.any(String) });
  });
});
