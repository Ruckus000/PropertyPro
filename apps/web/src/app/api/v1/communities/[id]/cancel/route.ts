/**
 * POST /api/v1/communities/[id]/cancel
 *
 * Cancel a community's subscription, soft-delete the community, and
 * recalculate the billing group's volume tier (which may downgrade
 * the discount and notify admins).
 *
 * Plan A1 drain #155. Migrated to `runRoute(contract, handler)`; see
 * `./contract.ts`.
 */
import { runRoute } from '@propertypro/api-contract';
import { withErrorHandler } from '@/lib/api/error-handler';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { ForbiddenError, NotFoundError } from '@/lib/api/errors';
import { getStripeClient } from '@/lib/services/stripe-service';
import {
  getBillingGroupOwner,
  getCommunityForCancel,
  recalculateVolumeTier,
  softDeleteCommunityForCancellation,
} from '@/lib/billing/billing-group-service';
import { communityCancelPostContract } from './contract';

export const POST = withErrorHandler(
  runRoute(communityCancelPostContract, async ({ body, params }) => {
    const userId = await requireAuthenticatedUserId();
    const communityId = params.id;
    const { reason, note } = body;

    const community = await getCommunityForCancel(communityId);
    if (!community) throw new NotFoundError('Community not found');
    if (!community.billingGroupId) {
      throw new ForbiddenError('Community is not linked to a billing group');
    }

    const ownerUserId = await getBillingGroupOwner(community.billingGroupId);
    if (ownerUserId === null || ownerUserId !== userId) {
      throw new ForbiddenError('You do not own this billing group');
    }

    if (community.stripeSubscriptionId) {
      const stripe = getStripeClient();
      try {
        await stripe.subscriptions.cancel(community.stripeSubscriptionId);
      } catch (err: unknown) {
        const maybeStripeErr = err as { code?: string; statusCode?: number };
        if (maybeStripeErr?.statusCode !== 404) throw err;
      }
    }

    await softDeleteCommunityForCancellation(communityId, {
      reason,
      note: note ?? null,
    });

    await recalculateVolumeTier(community.billingGroupId, {
      canceledCommunityName: community.name,
    });

    return { canceled: true as const, communityId };
  }),
);
