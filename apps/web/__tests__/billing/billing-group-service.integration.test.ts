import { randomUUID } from 'node:crypto';
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';

// Mock the Stripe layer — we test DB logic + orchestration, not Stripe
vi.mock('@/lib/billing/volume-discounts', () => ({
  applyVolumeDiscountToSubscriptions: vi.fn().mockResolvedValue(undefined),
}));

import { createUnscopedClient } from '@propertypro/db/unsafe';
import { billingGroups, communities, userRoles, users } from '@propertypro/db';
import { eq, inArray } from '@propertypro/db/filters';
import {
  recalculateVolumeTier,
  getOrCreateBillingGroupForPm,
} from '@/lib/billing/billing-group-service';
import { applyVolumeDiscountToSubscriptions } from '@/lib/billing/volume-discounts';
import { AppError } from '@/lib/api/errors';

const TEST_OWNER_USER_ID = randomUUID();
const TEST_PM_USER_ID = randomUUID();
const db = createUnscopedClient();

describe('recalculateVolumeTier (integration)', () => {
  beforeAll(async () => {
    // Seed a user to satisfy the FK constraint on billing_groups.owner_user_id
    await db.insert(users).values({
      id: TEST_OWNER_USER_ID,
      email: `billing-group-integ-${Date.now()}@test.local`,
      fullName: 'Billing Group Test Owner',
    });
    await db.insert(users).values({
      id: TEST_PM_USER_ID,
      email: `billing-group-pm-${Date.now()}@test.local`,
      fullName: 'Billing Group Test PM',
    });
  });

  afterAll(async () => {
    // Clean up test user (billing groups + communities cascade via FK)
    await db.delete(billingGroups).where(inArray(billingGroups.ownerUserId, [TEST_OWNER_USER_ID, TEST_PM_USER_ID]));
    await db.delete(users).where(eq(users.id, TEST_OWNER_USER_ID));
    await db.delete(users).where(eq(users.id, TEST_PM_USER_ID));
  });

  beforeEach(async () => {
    vi.clearAllMocks();
    // Clean up test communities first (billingGroupId is set null on delete, not cascade)
    const TEST_SLUGS = [
      't-c1-recalc', 't-c2-recalc', 't-c3-recalc',
      't-fail-c1', 't-fail-c2', 't-fail-c3',
      't-bootstrap-c1', 't-bootstrap-c2', 't-bootstrap-c3',
      't-bootstrap-none-1', 't-bootstrap-none-2',
      't-bootstrap-multi-1', 't-bootstrap-multi-2',
    ];
    await db.delete(communities).where(inArray(communities.slug, TEST_SLUGS));
    await db.delete(billingGroups).where(inArray(billingGroups.ownerUserId, [TEST_OWNER_USER_ID, TEST_PM_USER_ID]));
  });

  it('upgrades from none to tier_10 when count hits 3', async () => {
    const [group] = await db
      .insert(billingGroups)
      .values({
        name: 'Test Group',
        stripeCustomerId: 'cus_test_recalc',
        ownerUserId: TEST_OWNER_USER_ID,
        volumeTier: 'none',
        activeCommunityCount: 2,
      })
      .returning();

    await db.insert(communities).values([
      { name: 'C1', slug: 't-c1-recalc', communityType: 'condo_718', billingGroupId: group.id } as any,
      { name: 'C2', slug: 't-c2-recalc', communityType: 'condo_718', billingGroupId: group.id } as any,
      { name: 'C3', slug: 't-c3-recalc', communityType: 'condo_718', billingGroupId: group.id } as any,
    ]);

    const result = await recalculateVolumeTier(group.id);

    expect(result.previousTier).toBe('none');
    expect(result.newTier).toBe('tier_10');
    expect(applyVolumeDiscountToSubscriptions).toHaveBeenCalledWith('cus_test_recalc', 'tier_10');

    const [updated] = await db.select().from(billingGroups).where(eq(billingGroups.id, group.id));
    expect(updated.volumeTier).toBe('tier_10');
    expect(updated.activeCommunityCount).toBe(3);
    expect(updated.couponSyncStatus).toBe('synced');
  });

  it('sets coupon_sync_status to failed on Stripe error', async () => {
    vi.mocked(applyVolumeDiscountToSubscriptions).mockRejectedValueOnce(new Error('Stripe API down'));

    const [group] = await db
      .insert(billingGroups)
      .values({
        name: 'Test Group 2',
        stripeCustomerId: 'cus_test_recalc',
        ownerUserId: TEST_OWNER_USER_ID,
        volumeTier: 'none',
        activeCommunityCount: 0,
      })
      .returning();

    await db.insert(communities).values([
      { name: 'C1', slug: 't-fail-c1', communityType: 'condo_718', billingGroupId: group.id } as any,
      { name: 'C2', slug: 't-fail-c2', communityType: 'condo_718', billingGroupId: group.id } as any,
      { name: 'C3', slug: 't-fail-c3', communityType: 'condo_718', billingGroupId: group.id } as any,
    ]);

    await expect(recalculateVolumeTier(group.id)).rejects.toThrow('Stripe API down');

    const [updated] = await db.select().from(billingGroups).where(eq(billingGroups.id, group.id));
    expect(updated.couponSyncStatus).toBe('failed');
  });

  it('returns an existing PM billing group unchanged', async () => {
    const [group] = await db
      .insert(billingGroups)
      .values({
        name: 'Existing PM Group',
        stripeCustomerId: 'cus_existing_pm_group',
        ownerUserId: TEST_PM_USER_ID,
      })
      .returning();

    const result = await getOrCreateBillingGroupForPm(TEST_PM_USER_ID);

    expect(result).toEqual({
      billingGroupId: group.id,
      stripeCustomerId: 'cus_existing_pm_group',
    });
    expect(applyVolumeDiscountToSubscriptions).not.toHaveBeenCalled();
  });

  it('bootstraps a PM billing group from all active communities on one Stripe customer', async () => {
    const insertedCommunities = await db
      .insert(communities)
      .values([
        { name: 'Bootstrap C1', slug: 't-bootstrap-c1', communityType: 'condo_718', stripeCustomerId: 'cus_bootstrap_pm' } as any,
        { name: 'Bootstrap C2', slug: 't-bootstrap-c2', communityType: 'hoa_720', stripeCustomerId: 'cus_bootstrap_pm' } as any,
        { name: 'Bootstrap C3', slug: 't-bootstrap-c3', communityType: 'apartment', stripeCustomerId: 'cus_bootstrap_pm' } as any,
      ])
      .returning({ id: communities.id });

    await db.insert(userRoles).values(
      insertedCommunities.map((community) => ({
        userId: TEST_PM_USER_ID,
        communityId: community.id,
        role: 'pm_admin',
      })),
    );

    const result = await getOrCreateBillingGroupForPm(TEST_PM_USER_ID);

    expect(result.stripeCustomerId).toBe('cus_bootstrap_pm');
    expect(applyVolumeDiscountToSubscriptions).toHaveBeenCalledWith('cus_bootstrap_pm', 'tier_10');

    const [group] = await db
      .select()
      .from(billingGroups)
      .where(eq(billingGroups.id, result.billingGroupId));
    expect(group.activeCommunityCount).toBe(3);
    expect(group.volumeTier).toBe('tier_10');
    expect(group.couponSyncStatus).toBe('synced');

    const linkedCommunities = await db
      .select({ billingGroupId: communities.billingGroupId })
      .from(communities)
      .where(inArray(communities.id, insertedCommunities.map((community) => community.id)));
    expect(linkedCommunities.every((community) => community.billingGroupId === result.billingGroupId)).toBe(true);
  });

  it('throws a typed 409 when no managed community has a Stripe customer', async () => {
    const insertedCommunities = await db
      .insert(communities)
      .values([
        { name: 'No Stripe 1', slug: 't-bootstrap-none-1', communityType: 'condo_718' } as any,
        { name: 'No Stripe 2', slug: 't-bootstrap-none-2', communityType: 'hoa_720' } as any,
      ])
      .returning({ id: communities.id });

    await db.insert(userRoles).values(
      insertedCommunities.map((community) => ({
        userId: TEST_PM_USER_ID,
        communityId: community.id,
        role: 'pm_admin',
      })),
    );

    await expect(getOrCreateBillingGroupForPm(TEST_PM_USER_ID)).rejects.toMatchObject({
      statusCode: 409,
      code: 'BILLING_GROUP_BOOTSTRAP_REQUIRES_STRIPE_CUSTOMER',
    } satisfies Partial<AppError>);
  });

  it('throws a typed 409 when managed communities span multiple Stripe customers', async () => {
    const insertedCommunities = await db
      .insert(communities)
      .values([
        { name: 'Multi Stripe 1', slug: 't-bootstrap-multi-1', communityType: 'condo_718', stripeCustomerId: 'cus_bootstrap_multi_1' } as any,
        { name: 'Multi Stripe 2', slug: 't-bootstrap-multi-2', communityType: 'hoa_720', stripeCustomerId: 'cus_bootstrap_multi_2' } as any,
      ])
      .returning({ id: communities.id });

    await db.insert(userRoles).values(
      insertedCommunities.map((community) => ({
        userId: TEST_PM_USER_ID,
        communityId: community.id,
        role: 'pm_admin',
      })),
    );

    await expect(getOrCreateBillingGroupForPm(TEST_PM_USER_ID)).rejects.toMatchObject({
      statusCode: 409,
      code: 'BILLING_GROUP_BOOTSTRAP_MULTIPLE_STRIPE_CUSTOMERS',
    } satisfies Partial<AppError>);
  });
});
