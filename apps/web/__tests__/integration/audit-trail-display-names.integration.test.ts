/**
 * P0 — audit-trail route returns real actor display names + scopes per
 * community + denies users without audit:read permission.
 *
 * Validates the swap from the broken UUID-prefix fallback to
 * `resolveUserDisplayNames`, which joins users via user_roles for the
 * requested community.
 */
import { NextRequest } from 'next/server';
import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest';
import { MULTI_TENANT_COMMUNITIES } from '../fixtures/multi-tenant-communities';
import {
  MULTI_TENANT_USERS,
  type MultiTenantUserKey,
} from '../fixtures/multi-tenant-users';
import {
  apiUrl,
  getDescribeDb,
  initTestKit,
  requireCommunity,
  requireDatabaseUrlInCI,
  requireUser,
  seedCommunities,
  seedUsers,
  setActor,
  teardownTestKit,
  type TestKitState,
} from './helpers/multi-tenant-test-kit';

requireDatabaseUrlInCI('audit-trail display-name integration tests');

const describeDb = getDescribeDb();

type AuditTrailRouteModule = typeof import('../../src/app/api/v1/audit-trail/route');

/**
 * Post-B3: audit-trail returns the canonical double-wrapped envelope. The
 * inner page lives at `body.data` and contains `{ data, pagination, users }`.
 */
interface AuditTrailResponse {
  data: {
    data: Array<{ id: number; userId: string | null; action: string }>;
    pagination: { nextCursor: string | null; hasMore: boolean; pageSize: number };
    users: Record<string, string>;
  };
}

let state: TestKitState | null = null;
let auditRoute: AuditTrailRouteModule | null = null;

function requireState(): TestKitState {
  if (!state) throw new Error('Test state not initialized');
  return state;
}

function requireAuditRoute(): AuditTrailRouteModule {
  if (!auditRoute) throw new Error('audit-trail route not loaded');
  return auditRoute;
}

async function insertAuditRow(
  kit: TestKitState,
  params: {
    communityId: number;
    userId: string;
    action: string;
    resourceType: string;
    resourceId: string;
  },
): Promise<void> {
  await kit.db.insert(kit.dbModule.complianceAuditLog).values({
    communityId: params.communityId,
    userId: params.userId,
    action: params.action,
    resourceType: params.resourceType,
    resourceId: params.resourceId,
    metadata: { testSuffix: kit.runSuffix },
  });
}

describeDb('audit-trail returns real actor display names + scopes correctly', () => {
  beforeAll(async () => {
    if (!process.env.DATABASE_URL) return;

    state = await initTestKit();

    await seedCommunities(state, MULTI_TENANT_COMMUNITIES);

    const neededUsers: MultiTenantUserKey[] = [
      'actorA',
      'actorB',
      'tenantA',
    ];
    await seedUsers(
      state,
      MULTI_TENANT_USERS.filter((u) => neededUsers.includes(u.key)),
    );

    auditRoute = await import('../../src/app/api/v1/audit-trail/route');
  });

  beforeEach(() => {
    if (!state) return;
    setActor(state, 'actorA');
  });

  afterAll(async () => {
    if (state) {
      await teardownTestKit(state);
    }
  });

  it('resolves the actor full name from the users table (not a UUID prefix)', async () => {
    const kit = requireState();
    const route = requireAuditRoute();
    const communityA = requireCommunity(kit, 'communityA');
    const actorA = requireUser(kit, 'actorA');

    await insertAuditRow(kit, {
      communityId: communityA.id,
      userId: actorA.id,
      action: 'upload_document',
      resourceType: 'document',
      resourceId: '1001',
    });

    setActor(kit, 'actorA');
    const res = await route.GET(
      new NextRequest(apiUrl(`/api/v1/audit-trail?communityId=${communityA.id}&limit=50`)),
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as AuditTrailResponse;

    const expectedFullName = `${actorA.fixture.fullName} ${kit.runSuffix}`;
    expect(body.data.users[actorA.id]).toBe(expectedFullName);

    // The old (buggy) behavior would return a UUID prefix; assert it doesn't.
    expect(body.data.users[actorA.id]).not.toBe(actorA.id.substring(0, 8));
    expect(body.data.users[actorA.id]?.length ?? 0).toBeGreaterThan(8);
  });

  it('returns 403 when an actor in another community queries communityA', async () => {
    const kit = requireState();
    const route = requireAuditRoute();
    const communityA = requireCommunity(kit, 'communityA');

    // actorB is a member of communityB, not communityA.
    setActor(kit, 'actorB');
    const res = await route.GET(
      new NextRequest(apiUrl(`/api/v1/audit-trail?communityId=${communityA.id}`)),
    );

    expect(res.status).toBe(403);
  });

  it('returns 403 when a resident (no audit:read) queries their own community', async () => {
    const kit = requireState();
    const route = requireAuditRoute();
    const communityA = requireCommunity(kit, 'communityA');

    setActor(kit, 'tenantA');
    const res = await route.GET(
      new NextRequest(apiUrl(`/api/v1/audit-trail?communityId=${communityA.id}`)),
    );

    expect(res.status).toBe(403);
  });

  it('does not leak audit rows from a different community', async () => {
    const kit = requireState();
    const route = requireAuditRoute();
    const communityA = requireCommunity(kit, 'communityA');
    const communityB = requireCommunity(kit, 'communityB');
    const actorB = requireUser(kit, 'actorB');

    await insertAuditRow(kit, {
      communityId: communityB.id,
      userId: actorB.id,
      action: 'upload_document',
      resourceType: 'document',
      resourceId: 'b-only-resource',
    });

    setActor(kit, 'actorA');
    const res = await route.GET(
      new NextRequest(apiUrl(`/api/v1/audit-trail?communityId=${communityA.id}&limit=200`)),
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as AuditTrailResponse;

    const leaked = body.data.data.find((row) => row.userId === actorB.id);
    expect(leaked).toBeUndefined();
    expect(body.data.users[actorB.id]).toBeUndefined();
  });
});
