import { NextResponse } from 'next/server';
import { withErrorHandler } from '@/lib/api/error-handler';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { ForbiddenError } from '@/lib/api/errors';
import { isPmAdminInAnyCommunity } from '@propertypro/db/unsafe';
import { getOrCreateBillingGroupForPm } from '@/lib/billing/billing-group-service';

/**
 * GET /api/v1/billing-groups/mine
 *
 * Returns the billing group owned by the authenticated PM, creating one
 * on-demand from the PM's active portfolio when none exists yet. Only
 * callable by users who are pm_admin in at least one community.
 */
export const GET = withErrorHandler(async () => {
  const userId = await requireAuthenticatedUserId();

  const isPm = await isPmAdminInAnyCommunity(userId);
  if (!isPm) {
    throw new ForbiddenError('This endpoint is only available to property managers');
  }

  const { billingGroupId } = await getOrCreateBillingGroupForPm(userId);
  return NextResponse.json({ data: { billingGroupId } });
});
