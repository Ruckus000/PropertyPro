import { afterAll, beforeAll, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import {
  initTestKit,
  seedCommunities,
  teardownTestKit,
  requireCommunity,
  getDescribeDb,
  requireDatabaseUrlInCI,
  type TestKitState,
} from './helpers/multi-tenant-test-kit';
import { MULTI_TENANT_COMMUNITIES } from '../fixtures/multi-tenant-communities';
import { requireEntitledForAdminRead } from '@/lib/middleware/read-entitlement-guard';

requireDatabaseUrlInCI('read-entitlement-lapsed');

const describeDb = getDescribeDb();

describeDb('read-entitlement guard — real lifecycle over a lapsed community', () => {
  let state: TestKitState;
  let communityId: number;

  beforeAll(async () => {
    state = await initTestKit();

    // Seed just communityA (condo_718). Reuse the fixture array filtered to it.
    const communityA = MULTI_TENANT_COMMUNITIES.find((c) => c.key === 'communityA')!;
    await seedCommunities(state, [communityA]);
    communityId = requireCommunity(state, 'communityA').id;

    // Flip to lapsed: canceled 30 days ago (past the 7-day paid grace).
    // Use the kit's own drizzle connection + the real column names.
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    await state.db
      .update(state.dbModule.communities)
      .set({ subscriptionStatus: 'canceled', subscriptionCanceledAt: thirtyDaysAgo })
      .where(eq(state.dbModule.communities.id, communityId));
  });

  afterAll(async () => {
    if (state) await teardownTestKit(state);
  });

  it('throws SUBSCRIPTION_REQUIRED for an admin on a lapsed community', async () => {
    await expect(
      requireEntitledForAdminRead(communityId, { isAdmin: true }),
    ).rejects.toMatchObject({ code: 'SUBSCRIPTION_REQUIRED', statusCode: 403 });
  });

  it('resolves for a resident on the same lapsed community', async () => {
    await expect(
      requireEntitledForAdminRead(communityId, { isAdmin: false }),
    ).resolves.toBeUndefined();
  });

  it('resolves for an admin once the community is active again', async () => {
    await state.db
      .update(state.dbModule.communities)
      .set({ subscriptionStatus: 'active', subscriptionCanceledAt: null })
      .where(eq(state.dbModule.communities.id, communityId));

    await expect(
      requireEntitledForAdminRead(communityId, { isAdmin: true }),
    ).resolves.toBeUndefined();
  });
});
