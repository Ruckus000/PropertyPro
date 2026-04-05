import { NextResponse, type NextRequest } from 'next/server';
import { withErrorHandler } from '@/lib/api/error-handler';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { ForbiddenError, NotFoundError } from '@/lib/api/errors';
import { createUnscopedClient } from '@propertypro/db/unsafe';
import { communities, billingGroups } from '@propertypro/db';
import { eq, and, isNull } from '@propertypro/db/filters';
import { getStripeClient } from '@/lib/services/stripe-service';
import { recalculateVolumeTier } from '@/lib/billing/billing-group-service';

/**
 * POST /api/v1/communities/[id]/cancel
 *
 * Cancel a community's subscription, soft-delete the community, and
 * recalculate the billing group's volume tier (which may downgrade
 * the discount and notify admins).
 *
 * Authorization: caller must be the PM owner of the community's
 * billing group.
 */
export const POST = withErrorHandler(
  async (_req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
    const userId = await requireAuthenticatedUserId();
    const params = await ctx.params;
    const communityId = Number(params.id);

    const db = createUnscopedClient();

    const [community] = await db
      .select({
        id: communities.id,
        name: communities.name,
        billingGroupId: communities.billingGroupId,
        stripeSubscriptionId: communities.stripeSubscriptionId,
      })
      .from(communities)
      .where(and(eq(communities.id, communityId), isNull(communities.deletedAt)))
      .limit(1);

    if (!community) throw new NotFoundError('Community not found');
    if (!community.billingGroupId) {
      throw new ForbiddenError('Community is not linked to a billing group');
    }

    const [group] = await db
      .select({ id: billingGroups.id, ownerUserId: billingGroups.ownerUserId })
      .from(billingGroups)
      .where(eq(billingGroups.id, community.billingGroupId))
      .limit(1);

    if (!group || group.ownerUserId !== userId) {
      throw new ForbiddenError('You do not own this billing group');
    }

    // Cancel the Stripe subscription if one exists.
    if (community.stripeSubscriptionId) {
      const stripe = getStripeClient();
      try {
        await stripe.subscriptions.cancel(community.stripeSubscriptionId);
      } catch (err: unknown) {
        const maybeStripeErr = err as { code?: string; statusCode?: number };
        // Ignore already-canceled / not-found: proceed with soft-delete.
        if (maybeStripeErr?.statusCode !== 404) throw err;
      }
    }

    // Soft-delete the community.
    await db
      .update(communities)
      .set({ deletedAt: new Date() })
      .where(eq(communities.id, communityId));

    // Recalculate volume tier — may downgrade and notify admins.
    await recalculateVolumeTier(community.billingGroupId, {
      canceledCommunityName: community.name,
    });

    return NextResponse.json({ data: { canceled: true, communityId } });
  },
);
