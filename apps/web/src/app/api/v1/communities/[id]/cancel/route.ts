/**
 * POST /api/v1/communities/[id]/cancel
 *
 * Cancel a community's subscription, soft-delete the community, and
 * recalculate the billing group's volume tier (which may downgrade
 * the discount and notify admins).
 *
 * Plan A1 drain #155. Migrated to `runRoute(contract, handler)`; see
 * `./contract.ts`.
 *
 * Behavior change vs. pre-migration: invalid path param (non-numeric or
 * non-positive `[id]`) now returns 400 `VALIDATION_ERROR` instead of
 * `Number('abc') = NaN` flowing into service lookup. Unauthenticated calls
 * with invalid body may return 400 before 401 (contract validation runs first).
 */
import { runRoute } from '@propertypro/api-contract';
import { logAuditEvent } from '@propertypro/db';
import { PM_SCOPE_DB_ROLES } from '@propertypro/shared';
import { withErrorHandler } from '@/lib/api/error-handler';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
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
  runRoute(communityCancelPostContract, async ({ body, communityId }) => {
    const userId = await requireAuthenticatedUserId();
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

    // Owning the billing group is not enough on its own: nothing ever removes a
    // community from a group or changes its owner, so a manager the association
    // has since removed would still pass the check above — and this route
    // soft-deletes the community immediately, outside the deletion-request
    // lifecycle. Every legitimate owner held a management role here when the
    // community was linked (both link paths require it), so requiring it now
    // refuses only an owner who has lost it. See ADR-006's exception list.
    const membership = await requireCommunityMembership(communityId, userId);
    if (!(PM_SCOPE_DB_ROLES as readonly string[]).includes(membership.role)) {
      throw new ForbiddenError('Only a current manager of this community can cancel it');
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

    await logAuditEvent({
      userId,
      action: 'community_canceled',
      resourceType: 'community',
      resourceId: String(communityId),
      communityId,
      newValues: { reason, note: note ?? null },
      metadata: {
        billingGroupId: community.billingGroupId,
        stripeSubscriptionId: community.stripeSubscriptionId ?? null,
      },
    });

    await recalculateVolumeTier(community.billingGroupId, {
      canceledCommunityName: community.name,
    });

    return { canceled: true as const, communityId };
  }),
);
