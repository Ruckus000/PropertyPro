import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { withErrorHandler } from '@/lib/api/error-handler';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { ForbiddenError, NotFoundError, ValidationError } from '@/lib/api/errors';
import { getStripeClient } from '@/lib/services/stripe-service';
import {
  getBillingGroupOwner,
  getCommunityForCancel,
  recalculateVolumeTier,
  softDeleteCommunityForCancellation,
} from '@/lib/billing/billing-group-service';
import { cancellationReasonSchema } from '@propertypro/shared';

const cancelBodySchema = z.object({
  reason: cancellationReasonSchema,
  note: z.string().max(2000).optional(),
});

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
  async (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
    const userId = await requireAuthenticatedUserId();
    const params = await ctx.params;
    const communityId = Number(params.id);

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      throw new ValidationError('Invalid JSON body');
    }
    const parsed = cancelBodySchema.safeParse(body);
    if (!parsed.success) {
      throw new ValidationError('Invalid request body', { issues: parsed.error.issues });
    }
    const { reason, note } = parsed.data;

    const community = await getCommunityForCancel(communityId);
    if (!community) throw new NotFoundError('Community not found');
    if (!community.billingGroupId) {
      throw new ForbiddenError('Community is not linked to a billing group');
    }

    const ownerUserId = await getBillingGroupOwner(community.billingGroupId);
    if (ownerUserId === null || ownerUserId !== userId) {
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

    await softDeleteCommunityForCancellation(communityId, {
      reason,
      note: note ?? null,
    });

    // Recalculate volume tier — may downgrade and notify admins.
    await recalculateVolumeTier(community.billingGroupId, {
      canceledCommunityName: community.name,
    });

    return NextResponse.json({ data: { canceled: true, communityId } });
  },
);
