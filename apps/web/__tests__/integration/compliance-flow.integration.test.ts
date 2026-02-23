/**
 * P4-58: Compliance flow integration tests.
 *
 * Verifies the compliance checklist lifecycle through actual route handlers:
 *
 * 1. GET compliance for condo → checklist items (or empty)
 * 2. POST compliance (generate checklist) → items created
 * 3. GET compliance → items returned with status
 * 4. Idempotent: second POST → same items (no duplicates)
 * 5. Feature gate: apartment community → 403
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
  setActor,
  requireCurrentActor,
  apiUrl,
  parseJson,
  jsonRequest,
} from './helpers/multi-tenant-test-kit';

if (process.env.CI && !process.env.DATABASE_URL) {
  throw new Error('P4-58 compliance-flow integration tests require DATABASE_URL in CI');
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

describeDb('p4-58 compliance-flow integration', () => {
  beforeAll(async () => {
    if (!process.env.DATABASE_URL) return;

    state = await initTestKit();
    await seedCommunities(state, MULTI_TENANT_COMMUNITIES);

    const neededUsers: MultiTenantUserKey[] = [
      'actorA',  // board_president (condo)
      'actorC',  // pma (apartment)
    ];

    const userFixtures = MULTI_TENANT_USERS.filter((u) =>
      neededUsers.includes(u.key),
    );

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
  // Condo compliance flow
  // =========================================================================

  it('GET compliance for condo → 200', async () => {
    const kit = requireState();
    const route = requireRoute();
    const community = requireCommunity(kit, 'communityA');

    setActor(kit, 'actorA');
    const response = await route.GET(
      new NextRequest(apiUrl(`/api/v1/compliance?communityId=${community.id}`)),
    );
    expect(response.status).toBe(200);
  });

  it('POST compliance (generate) → checklist items created', async () => {
    const kit = requireState();
    const route = requireRoute();
    const community = requireCommunity(kit, 'communityA');

    setActor(kit, 'actorA');
    const response = await route.POST(
      jsonRequest(
        apiUrl(`/api/v1/compliance?communityId=${community.id}`),
        'POST',
        { communityId: community.id },
      ),
    );
    // 200 or 201 on successful generation
    expect([200, 201]).toContain(response.status);
    const json = await parseJson<{ data: Array<Record<string, unknown>> }>(response);
    expect(json.data.length).toBeGreaterThan(0);
  });

  it('GET compliance after generation → items with status', async () => {
    const kit = requireState();
    const route = requireRoute();
    const community = requireCommunity(kit, 'communityA');

    setActor(kit, 'actorA');
    const response = await route.GET(
      new NextRequest(apiUrl(`/api/v1/compliance?communityId=${community.id}`)),
    );
    expect(response.status).toBe(200);
    const json = await parseJson<{ data: Array<Record<string, unknown>> }>(response);
    expect(json.data.length).toBeGreaterThan(0);

    // Each item should have a status field
    for (const item of json.data) {
      expect(item).toHaveProperty('status');
    }
  });

  it('POST compliance (idempotent) → same items, no duplicates', async () => {
    const kit = requireState();
    const route = requireRoute();
    const community = requireCommunity(kit, 'communityA');

    // Get current count
    setActor(kit, 'actorA');
    const getBefore = await route.GET(
      new NextRequest(apiUrl(`/api/v1/compliance?communityId=${community.id}`)),
    );
    const beforeJson = await parseJson<{ data: Array<Record<string, unknown>> }>(getBefore);
    const countBefore = beforeJson.data.length;

    // Re-generate (should be idempotent)
    const postResponse = await route.POST(
      jsonRequest(
        apiUrl(`/api/v1/compliance?communityId=${community.id}`),
        'POST',
        { communityId: community.id },
      ),
    );
    expect([200, 201]).toContain(postResponse.status);

    // Get count after — should be the same
    const getAfter = await route.GET(
      new NextRequest(apiUrl(`/api/v1/compliance?communityId=${community.id}`)),
    );
    const afterJson = await parseJson<{ data: Array<Record<string, unknown>> }>(getAfter);
    expect(afterJson.data.length).toBe(countBefore);
  });

  // =========================================================================
  // Feature gate: apartment → 403
  // =========================================================================

  it('GET compliance for apartment → 403', async () => {
    const kit = requireState();
    const route = requireRoute();
    const community = requireCommunity(kit, 'communityC');

    setActor(kit, 'actorC');
    const response = await route.GET(
      new NextRequest(apiUrl(`/api/v1/compliance?communityId=${community.id}`)),
    );
    expect(response.status).toBe(403);
  });
});
