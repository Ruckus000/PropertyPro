import { createUnscopedClient } from '@propertypro/db/unsafe';
import { billingGroups, communities } from '@propertypro/db';
import { eq, and, isNull, sql } from '@propertypro/db/filters';
import { determineTier, type VolumeTier } from './tier-calculator';
import { applyVolumeDiscountToSubscriptions } from './volume-discounts';

export interface RecalculateResult {
  billingGroupId: number;
  previousTier: VolumeTier;
  newTier: VolumeTier;
  activeCount: number;
  tierChanged: boolean;
}

/**
 * Recalculates the volume tier for a billing group based on the count
 * of non-deleted communities linked to it. Applies the correct Stripe
 * discount across all active subscriptions on the group's customer.
 *
 * Uses a PostgreSQL advisory lock to serialize concurrent recalculations
 * for the same group.
 */
export async function recalculateVolumeTier(billingGroupId: number): Promise<RecalculateResult> {
  const db = createUnscopedClient();

  // Phase 1: Acquire advisory lock, read counts, and update DB — all in one transaction.
  // The advisory lock serializes concurrent recalculations for the same group.
  const { group, previousTier, newTier, count, tierChanged } = await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(${billingGroupId})`);

    const [grp] = await tx
      .select()
      .from(billingGroups)
      .where(eq(billingGroups.id, billingGroupId))
      .limit(1);

    if (!grp) throw new Error(`Billing group ${billingGroupId} not found`);

    const [{ count }] = await tx
      .select({ count: sql<number>`count(*)::int` })
      .from(communities)
      .where(
        and(
          eq(communities.billingGroupId, billingGroupId),
          isNull(communities.deletedAt),
        ),
      );

    const prev = grp.volumeTier as VolumeTier;
    const next = determineTier(count);

    await tx
      .update(billingGroups)
      .set({
        activeCommunityCount: count,
        volumeTier: next,
        couponSyncStatus: 'pending',
        updatedAt: new Date(),
      })
      .where(eq(billingGroups.id, billingGroupId));

    return { group: grp, previousTier: prev, newTier: next, count, tierChanged: prev !== next };
  });

  // Phase 2: Apply Stripe discount outside the transaction so that a Stripe failure
  // can be durably recorded (the transaction would roll back any update inside it).
  if (tierChanged) {
    try {
      await applyVolumeDiscountToSubscriptions(group.stripeCustomerId, newTier);
    } catch (err) {
      await db
        .update(billingGroups)
        .set({ couponSyncStatus: 'failed', updatedAt: new Date() })
        .where(eq(billingGroups.id, billingGroupId));
      throw err;
    }
  }

  await db
    .update(billingGroups)
    .set({ couponSyncStatus: 'synced', updatedAt: new Date() })
    .where(eq(billingGroups.id, billingGroupId));

  return { billingGroupId, previousTier, newTier, activeCount: count, tierChanged };
}

export interface CreateBillingGroupInput {
  name: string;
  stripeCustomerId: string;
  ownerUserId: string;
}

export async function createBillingGroup(input: CreateBillingGroupInput): Promise<number> {
  const db = createUnscopedClient();
  const [row] = await db.insert(billingGroups).values(input).returning({ id: billingGroups.id });
  return row.id;
}

export async function linkCommunityToBillingGroup(
  communityId: number,
  billingGroupId: number,
): Promise<void> {
  const db = createUnscopedClient();
  await db
    .update(communities)
    .set({ billingGroupId })
    .where(eq(communities.id, communityId));
}

export async function getBillingGroupByOwner(ownerUserId: string) {
  const db = createUnscopedClient();
  const [row] = await db
    .select()
    .from(billingGroups)
    .where(and(eq(billingGroups.ownerUserId, ownerUserId), isNull(billingGroups.deletedAt)))
    .limit(1);
  return row ?? null;
}
