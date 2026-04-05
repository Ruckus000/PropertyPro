import { randomUUID } from 'node:crypto';
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';

// Mock the Stripe layer — we test DB logic + orchestration, not Stripe
vi.mock('@/lib/billing/volume-discounts', () => ({
  applyVolumeDiscountToSubscriptions: vi.fn().mockResolvedValue(undefined),
}));

import { createUnscopedClient } from '@propertypro/db/unsafe';
import { billingGroups, communities, users } from '@propertypro/db';
import { eq, inArray } from '@propertypro/db/filters';
import {
  recalculateVolumeTier,
  createBillingGroup,
  linkCommunityToBillingGroup,
} from '@/lib/billing/billing-group-service';
import { applyVolumeDiscountToSubscriptions } from '@/lib/billing/volume-discounts';

const TEST_OWNER_USER_ID = randomUUID();
const db = createUnscopedClient();

describe('recalculateVolumeTier (integration)', () => {
  beforeAll(async () => {
    // Seed a user to satisfy the FK constraint on billing_groups.owner_user_id
    await db.insert(users).values({
      id: TEST_OWNER_USER_ID,
      email: `billing-group-integ-${Date.now()}@test.local`,
      fullName: 'Billing Group Test Owner',
    });
  });

  afterAll(async () => {
    // Clean up test user (billing groups + communities cascade via FK)
    await db.delete(billingGroups).where(eq(billingGroups.ownerUserId, TEST_OWNER_USER_ID));
    await db.delete(users).where(eq(users.id, TEST_OWNER_USER_ID));
  });

  beforeEach(async () => {
    vi.clearAllMocks();
    // Clean up test communities first (billingGroupId is set null on delete, not cascade)
    const TEST_SLUGS = [
      't-c1-recalc', 't-c2-recalc', 't-c3-recalc',
      't-fail-c1', 't-fail-c2', 't-fail-c3',
    ];
    await db.delete(communities).where(inArray(communities.slug, TEST_SLUGS));
    await db.delete(billingGroups).where(eq(billingGroups.stripeCustomerId, 'cus_test_recalc'));
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
});
