import { createUnscopedClient } from '@propertypro/db/unsafe';
import { billingGroups, communities, pendingSignups, userRoles } from '@propertypro/db';
import { eq, and, isNull, sql, inArray } from '@propertypro/db/filters';
import { AppError } from '../api/errors';
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

  // Serialize concurrent recalculations for the same group for the entire
  // duration — including the Stripe API call. Because pg_advisory_xact_lock
  // is released when the transaction ends, we must wrap the Stripe sync
  // inside the transaction. This keeps a DB connection open for the Stripe
  // round-trip, but avoids the race where two out-of-order Stripe updates
  // leave Stripe and DB disagreeing about the active tier.
  let group!: typeof billingGroups.$inferSelect;
  let previousTier!: VolumeTier;
  let newTier!: VolumeTier;
  let count = 0;
  let tierChanged = false;

  try {
    await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(${billingGroupId})`);

      const [grp] = await tx
        .select()
        .from(billingGroups)
        .where(eq(billingGroups.id, billingGroupId))
        .limit(1);

      if (!grp) throw new Error(`Billing group ${billingGroupId} not found`);
      group = grp;

      const countRows = await tx
        .select({ count: sql<number>`count(*)::int` })
        .from(communities)
        .where(
          and(
            eq(communities.billingGroupId, billingGroupId),
            isNull(communities.deletedAt),
          ),
        );
      count = countRows[0]?.count ?? 0;

      previousTier = grp.volumeTier as VolumeTier;
      newTier = determineTier(count);
      tierChanged = previousTier !== newTier;

      await tx
        .update(billingGroups)
        .set({
          activeCommunityCount: count,
          volumeTier: newTier,
          couponSyncStatus: tierChanged ? 'pending' : 'synced',
          updatedAt: new Date(),
        })
        .where(eq(billingGroups.id, billingGroupId));

      if (tierChanged) {
        // Stripe call happens inside the txn so the advisory lock still holds.
        await applyVolumeDiscountToSubscriptions(grp.stripeCustomerId, newTier);

        await tx
          .update(billingGroups)
          .set({ couponSyncStatus: 'synced', updatedAt: new Date() })
          .where(eq(billingGroups.id, billingGroupId));
      }
    });
  } catch (err) {
    // Stripe (or DB) failed inside the txn — record 'failed' in a fresh
    // transaction so the cron retry worker can pick it up.
    await db
      .update(billingGroups)
      .set({ couponSyncStatus: 'failed', updatedAt: new Date() })
      .where(eq(billingGroups.id, billingGroupId));
    throw err;
  }

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

export async function getOrCreateBillingGroupForPm(
  userId: string,
): Promise<{ billingGroupId: number; stripeCustomerId: string }> {
  const db = createUnscopedClient();

  const existing = await getBillingGroupByOwner(userId);
  if (existing) {
    return { billingGroupId: existing.id, stripeCustomerId: existing.stripeCustomerId };
  }

  const managedCommunities = await db
    .select({
      id: communities.id,
      stripeCustomerId: communities.stripeCustomerId,
      name: communities.name,
      billingGroupId: communities.billingGroupId,
    })
    .from(communities)
    .innerJoin(userRoles, eq(userRoles.communityId, communities.id))
    .where(
      and(
        eq(userRoles.userId, userId),
        eq(userRoles.role, 'pm_admin'),
        isNull(communities.deletedAt),
      ),
    );

  const communitiesWithStripeCustomer = managedCommunities.filter(
    (community): community is typeof community & { stripeCustomerId: string } =>
      typeof community.stripeCustomerId === 'string' && community.stripeCustomerId.length > 0,
  );

  const distinctStripeCustomerIds = [...new Set(
    communitiesWithStripeCustomer.map((community) => community.stripeCustomerId),
  )];

  if (distinctStripeCustomerIds.length === 0) {
    throw new AppError(
      'Portfolio billing can’t be initialized yet because none of your active communities have a Stripe customer.',
      409,
      'BILLING_GROUP_BOOTSTRAP_REQUIRES_STRIPE_CUSTOMER',
      { managedCommunityCount: managedCommunities.length },
    );
  }

  if (distinctStripeCustomerIds.length > 1) {
    throw new AppError(
      'Portfolio billing can’t be initialized automatically because your active communities span multiple Stripe customers.',
      409,
      'BILLING_GROUP_BOOTSTRAP_MULTIPLE_STRIPE_CUSTOMERS',
      {
        stripeCustomerIds: distinctStripeCustomerIds,
        managedCommunityCount: managedCommunities.length,
      },
    );
  }

  const stripeCustomerId = distinctStripeCustomerIds[0]!;
  const bootstrapCommunities = communitiesWithStripeCustomer.filter(
    (community) => community.stripeCustomerId === stripeCustomerId,
  );
  const billingGroupId = await createBillingGroup({
    name: `${bootstrapCommunities[0]!.name} Portfolio`,
    stripeCustomerId,
    ownerUserId: userId,
  });

  await db
    .update(communities)
    .set({ billingGroupId })
    .where(
      and(
        inArray(
          communities.id,
          bootstrapCommunities.map((community) => community.id),
        ),
        eq(communities.stripeCustomerId, stripeCustomerId),
      ),
    );

  await recalculateVolumeTier(billingGroupId);

  return { billingGroupId, stripeCustomerId };
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
  const signupRequestId = `add-${input.billingGroupId}-${crypto.randomUUID()}`;
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
