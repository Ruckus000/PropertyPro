import { createUnscopedClient } from '@propertypro/db/unsafe';
import { billingGroups, communities } from '@propertypro/db';
import { eq, and, isNull, sql } from '@propertypro/db/filters';
import { determineTier, type VolumeTier } from './tier-calculator';
import { applyVolumeDiscountToSubscriptions } from './volume-discounts';
import { notifyDowngrade } from './downgrade-notifications';

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
function tierRank(t: VolumeTier): number {
  const ranks: Record<VolumeTier, number> = {
    none: 0,
    tier_10: 1,
    tier_15: 2,
    tier_20: 3,
  };
  return ranks[t];
}

export async function recalculateVolumeTier(
  billingGroupId: number,
  context?: { canceledCommunityName?: string },
): Promise<RecalculateResult> {
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

    const countRows = await tx
      .select({ count: sql<number>`count(*)::int` })
      .from(communities)
      .where(
        and(
          eq(communities.billingGroupId, billingGroupId),
          isNull(communities.deletedAt),
        ),
      );
    const count = countRows[0]?.count ?? 0;

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

  if (tierChanged && tierRank(previousTier) > tierRank(newTier) && context?.canceledCommunityName) {
    await notifyDowngrade({
      billingGroupId,
      previousTier,
      newTier,
      canceledCommunityName: context.canceledCommunityName,
    });
  }

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
  if (!row) throw new Error('Failed to create billing group');
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

import { pendingSignups } from '@propertypro/db';

export async function getOrCreateBillingGroupForPm(
  userId: string,
): Promise<{ billingGroupId: number; stripeCustomerId: string }> {
  const db = createUnscopedClient();

  const existing = await getBillingGroupByOwner(userId);
  if (existing) {
    return { billingGroupId: existing.id, stripeCustomerId: existing.stripeCustomerId };
  }

  // Find PM's first community (from signup) to get its Stripe Customer
  const [firstCommunity] = await db
    .select({
      id: communities.id,
      stripeCustomerId: communities.stripeCustomerId,
      name: communities.name,
    })
    .from(communities)
    .innerJoin(sql`user_roles ur`, sql`ur.community_id = ${communities.id}`)
    .where(and(sql`ur.user_id = ${userId}::uuid`, sql`ur.role = 'pm_admin'`, isNull(communities.deletedAt)))
    .limit(1);

  if (!firstCommunity?.stripeCustomerId) {
    throw new Error('PM has no community with a Stripe customer ID; cannot create billing group');
  }

  const billingGroupId = await createBillingGroup({
    name: firstCommunity.name + ' Portfolio',
    stripeCustomerId: firstCommunity.stripeCustomerId,
    ownerUserId: userId,
  });

  await linkCommunityToBillingGroup(firstCommunity.id, billingGroupId);

  return { billingGroupId, stripeCustomerId: firstCommunity.stripeCustomerId };
}

export async function createPendingAddToGroupSignup(input: {
  userId: string;
  billingGroupId: number;
  input: {
    name: string;
    communityType: string;
    planId: string;
    addressLine1: string;
    addressLine2?: string;
    city: string;
    state: string;
    zipCode: string;
    subdomain: string;
    timezone: string;
    unitCount: number;
  };
}): Promise<number> {
  const db = createUnscopedClient();
  const signupRequestId = `add-${input.billingGroupId}-${Date.now()}`;
  const [row] = await db
    .insert(pendingSignups)
    .values({
      signupRequestId,
      authUserId: input.userId,
      primaryContactName: 'PM Admin',
      email: 'pm-add@placeholder.local',
      emailNormalized: `pm-add-${signupRequestId}@placeholder.local`,
      communityName: input.input.name,
      address: `${input.input.addressLine1}, ${input.input.city}, ${input.input.state} ${input.input.zipCode}`,
      county: input.input.state,
      unitCount: input.input.unitCount,
      communityType: input.input.communityType as any,
      planKey: input.input.planId,
      candidateSlug: input.input.subdomain,
      termsAcceptedAt: new Date(),
      status: 'checkout_started',
      payload: {
        kind: 'add_to_group',
        billingGroupId: input.billingGroupId,
        fullInput: input.input,
      },
    })
    .returning({ id: pendingSignups.id });
  if (!row) throw new Error('Failed to insert pending signup');
  return Number(row.id);
}
