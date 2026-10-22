/**
 * P0 Integration tests — subscription gate end-to-end
 *
 * The real chain, against the real database:
 *   announcements POST → membership + permission → requireActiveSubscriptionForMutation
 *   → reads `communities.subscription_status` → 403 SUBSCRIPTION_REQUIRED (or 200)
 *
 * Each case writes the community's subscription columns, then calls the route.
 * Only the session comes from the shared auth double (setup-integration.ts),
 * and announcement fan-out from the shared capture sink; the guard, its DB read,
 * the lifecycle rules and the insert are all real.
 *
 * Why this matters (P0 — Day 14 lock):
 *   Route unit tests mock the guard away. If someone removed the guard call
 *   from a route, those tests would not notice. This file does, because the
 *   guard runs and a locked community must leave no announcement behind.
 */
import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest';
import { and, eq } from '@propertypro/db/filters';
import { MULTI_TENANT_COMMUNITIES } from '../fixtures/multi-tenant-communities';
import { MULTI_TENANT_USERS } from '../fixtures/multi-tenant-users';
import {
  type TestKitState,
  apiUrl,
  getDescribeDb,
  initTestKit,
  jsonRequest,
  parseJson,
  requireCommunity,
  requireDatabaseUrlInCI,
  seedCommunities,
  seedUsers,
  setActor,
  teardownTestKit,
} from '../integration/helpers/multi-tenant-test-kit';

requireDatabaseUrlInCI('Subscription guard integration tests');

const describeDb = getDescribeDb();

type AnnouncementsRouteModule = typeof import('../../src/app/api/v1/announcements/route');

let state: TestKitState | null = null;
let route: AnnouncementsRouteModule | null = null;

function requireState(): TestKitState {
  if (!state) throw new Error('Test state not initialized');
  return state;
}

function requireRoute(): AnnouncementsRouteModule {
  if (!route) throw new Error('Route not loaded');
  return route;
}

/** Well past the seven-day grace a fresh cancellation still gets. */
const LONG_AGO = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);

async function setSubscription(status: string, canceledAt: Date | null = null): Promise<number> {
  const kit = requireState();
  const community = requireCommunity(kit, 'communityA');
  await kit.db
    .update(kit.dbModule.communities)
    .set({
      subscriptionStatus: status,
      subscriptionCanceledAt: canceledAt,
      freeAccessExpiresAt: null,
    })
    .where(eq(kit.dbModule.communities.id, community.id));
  return community.id;
}

async function postAnnouncement(communityId: number, title: string): Promise<Response> {
  return requireRoute().POST(
    jsonRequest(apiUrl('/api/v1/announcements'), 'POST', {
      title,
      body: 'Test body',
      audience: 'all',
      isPinned: false,
      communityId,
    }),
  );
}

async function countAnnouncementsTitled(communityId: number, title: string): Promise<number> {
  const kit = requireState();
  const rows = await kit.db
    .select({ id: kit.dbModule.announcements.id })
    .from(kit.dbModule.announcements)
    .where(
      and(
        eq(kit.dbModule.announcements.communityId, communityId),
        eq(kit.dbModule.announcements.title, title),
      ),
    );
  return rows.length;
}

describeDb('P0: subscription gate end-to-end (real guard, real DB)', () => {
  beforeAll(async () => {
    state = await initTestKit();
    await seedCommunities(
      state,
      MULTI_TENANT_COMMUNITIES.filter((c) => c.key === 'communityA'),
    );
    await seedUsers(
      state,
      MULTI_TENANT_USERS.filter((u) => u.key === 'actorA'),
    );
    route = await import('../../src/app/api/v1/announcements/route');
  });

  beforeEach(() => {
    setActor(requireState(), 'actorA');
  });

  afterAll(async () => {
    if (state) await teardownTestKit(state);
  });

  it('POST returns 403 with SUBSCRIPTION_REQUIRED when subscriptionStatus is "canceled"', async () => {
    const communityId = await setSubscription('canceled', LONG_AGO);
    const title = `Canceled ${requireState().runSuffix}`;

    const res = await postAnnouncement(communityId, title);
    expect(res.status).toBe(403);

    const json = await parseJson<{ error: { code: string } }>(res);
    expect(json.error.code).toBe('SUBSCRIPTION_REQUIRED');
    expect(await countAnnouncementsTitled(communityId, title)).toBe(0);
  });

  it('POST returns 201 when subscriptionStatus is "active"', async () => {
    const communityId = await setSubscription('active');
    const title = `Active ${requireState().runSuffix}`;

    const res = await postAnnouncement(communityId, title);
    expect(res.status).toBe(200);
    expect(await countAnnouncementsTitled(communityId, title)).toBe(1);
  });

  it('POST returns 403 with SUBSCRIPTION_REQUIRED when subscriptionStatus is "expired"', async () => {
    const communityId = await setSubscription('expired');
    const title = `Expired ${requireState().runSuffix}`;

    const res = await postAnnouncement(communityId, title);
    expect(res.status).toBe(403);
    const json = await parseJson<{ error: { code: string } }>(res);
    expect(json.error.code).toBe('SUBSCRIPTION_REQUIRED');
    expect(await countAnnouncementsTitled(communityId, title)).toBe(0);
  });
});
