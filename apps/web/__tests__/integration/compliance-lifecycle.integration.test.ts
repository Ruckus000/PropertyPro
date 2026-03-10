/**
 * P4-58: Compliance lifecycle integration test.
 *
 * Verifies the full compliance flow:
 *   1. Generate compliance checklist for a condo community → items created
 *   2. Idempotent re-generation returns existing items
 *   3. GET returns items with calculated status (unsatisfied initially)
 *   4. Feature gate: apartment community → 403
 *   5. Role gate: tenant cannot generate checklist
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
  setActor,
  requireCurrentActor,
  apiUrl,
  jsonRequest,
  parseJson,
  requireDatabaseUrlInCI,
  getDescribeDb,
} from './helpers/multi-tenant-test-kit';

requireDatabaseUrlInCI('Compliance lifecycle integration tests');

const describeDb = getDescribeDb();

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const { requireAuthenticatedUserIdMock } = vi.hoisted(() => ({
  requireAuthenticatedUserIdMock: vi.fn(),
}));

vi.mock('@/lib/api/auth', () => ({
  requireAuthenticatedUserId: requireAuthenticatedUserIdMock,
}));

vi.mock('@/lib/services/notification-service', () => ({
  queueNotification: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/workers/pdf-extraction', () => ({
  queuePdfExtraction: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Route types
// ---------------------------------------------------------------------------

type ComplianceRouteModule = typeof import('../../src/app/api/v1/compliance/route');

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

let state: TestKitState | null = null;
let complianceRoute: ComplianceRouteModule | null = null;

function requireState(): TestKitState {
  if (!state) throw new Error('Test state not initialized');
  return state;
}

function requireRoute(): ComplianceRouteModule {
  if (!complianceRoute) throw new Error('Route not loaded');
  return complianceRoute;
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describeDb('P4-58: compliance lifecycle (db-backed integration)', () => {
  beforeAll(async () => {
    if (!process.env.DATABASE_URL) return;

    state = await initTestKit();

    // Seed communityA (condo_718) and communityC (apartment)
    const communityA = MULTI_TENANT_COMMUNITIES.find((c) => c.key === 'communityA');
    const communityC = MULTI_TENANT_COMMUNITIES.find((c) => c.key === 'communityC');
    if (!communityA || !communityC) throw new Error('Required community fixtures not found');
    await seedCommunities(state, [communityA, communityC]);

    // Seed actorA (board_president, communityA), tenantA (tenant, communityA), actorC (pm_admin, communityC)
    const neededUsers: MultiTenantUserKey[] = ['actorA', 'tenantA', 'actorC'];
    const userFixtures = MULTI_TENANT_USERS.filter((u) => neededUsers.includes(u.key));
    await seedUsers(state, userFixtures);

    complianceRoute = await import('../../src/app/api/v1/compliance/route');
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
  // 1. Generate checklist for condo community
  // =========================================================================

  it('POST generates compliance checklist items for condo_718 community', async () => {
    const kit = requireState();
    const route = requireRoute();
    const communityA = requireCommunity(kit, 'communityA');

    const response = await route.POST(
      jsonRequest(apiUrl('/api/v1/compliance'), 'POST', {
        communityId: communityA.id,
      }),
    );

    expect(response.status).toBe(201);
    const json = await parseJson<{ data: Array<Record<string, unknown>> }>(response);
    expect(json.data.length).toBeGreaterThan(0);

    // Each item should have expected fields
    const firstItem = json.data[0];
    expect(firstItem).toHaveProperty('templateKey');
    expect(typeof firstItem['templateKey']).toBe('string');
    expect(firstItem).toHaveProperty('title');
    expect(typeof firstItem['title']).toBe('string');
    expect(firstItem).toHaveProperty('statuteReference');
    expect(typeof firstItem['statuteReference']).toBe('string');
    expect(firstItem).toHaveProperty('documentId');
    expect(firstItem['documentId']).toBeNull();
  });

  // =========================================================================
  // 2. Idempotent re-generation
  // =========================================================================

  it('POST re-generation returns existing items with alreadyGenerated flag', async () => {
    const kit = requireState();
    const route = requireRoute();
    const communityA = requireCommunity(kit, 'communityA');

    const response = await route.POST(
      jsonRequest(apiUrl('/api/v1/compliance'), 'POST', {
        communityId: communityA.id,
      }),
    );

    expect(response.status).toBe(200);
    const json = await parseJson<{
      data: Array<Record<string, unknown>>;
      meta: { alreadyGenerated: boolean };
    }>(response);
    expect(json.meta.alreadyGenerated).toBe(true);
    expect(json.data.length).toBeGreaterThan(0);
  });

  // =========================================================================
  // 3. GET returns items with computed compliance status
  // =========================================================================

  it('GET returns checklist items with computed status', async () => {
    const kit = requireState();
    const route = requireRoute();
    const communityA = requireCommunity(kit, 'communityA');

    const response = await route.GET(
      new NextRequest(apiUrl(`/api/v1/compliance?communityId=${communityA.id}`)),
    );

    expect(response.status).toBe(200);
    const json = await parseJson<{ data: Array<Record<string, unknown>> }>(response);
    expect(json.data.length).toBeGreaterThan(0);

    // Items without documents should be unsatisfied or overdue
    for (const item of json.data) {
      expect(item).toHaveProperty('status');
      // Since no documents have been linked, status should indicate unsatisfied
      expect(['unsatisfied', 'overdue', 'not_applicable']).toContain(item['status']);
    }
  });

  // =========================================================================
  // 4. Feature gate: apartment community → 403
  // =========================================================================

  it('GET on apartment community returns 403', async () => {
    const kit = requireState();
    const route = requireRoute();
    const communityC = requireCommunity(kit, 'communityC');

    setActor(kit, 'actorC');
    const response = await route.GET(
      new NextRequest(apiUrl(`/api/v1/compliance?communityId=${communityC.id}`)),
    );

    expect(response.status).toBe(403);
  });

  it('POST on apartment community returns 403', async () => {
    const kit = requireState();
    const route = requireRoute();
    const communityC = requireCommunity(kit, 'communityC');

    setActor(kit, 'actorC');
    const response = await route.POST(
      jsonRequest(apiUrl('/api/v1/compliance'), 'POST', {
        communityId: communityC.id,
      }),
    );

    expect(response.status).toBe(403);
  });

  // =========================================================================
  // 5. Role gate: tenant cannot generate checklist
  // =========================================================================

  it('tenant cannot POST to generate compliance checklist', async () => {
    const kit = requireState();
    const route = requireRoute();
    const communityA = requireCommunity(kit, 'communityA');

    setActor(kit, 'tenantA');
    const response = await route.POST(
      jsonRequest(apiUrl('/api/v1/compliance'), 'POST', {
        communityId: communityA.id,
      }),
    );

    expect(response.status).toBe(403);
  });
});
