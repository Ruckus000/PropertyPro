/**
 * POST /api/v1/stripe/connect/complete
 *
 * Exchanges the Stripe OAuth authorization code for a connected account ID.
 * Called from the /settings/payments/connected callback page after
 * the user completes Stripe Connect Standard onboarding.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { withErrorHandler } from '@/lib/api/error-handler';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { requireActiveSubscriptionForMutation } from '@/lib/middleware/subscription-guard';
import { requireFinanceEnabled, requireFinanceWritePermission, requireFinanceAdminWrite } from '@/lib/finance/common';
import { completeConnectOnboarding } from '@/lib/services/finance-service';

const bodySchema = z.object({
  communityId: z.number().int().positive(),
  code: z.string().min(1),
});

export const POST = withErrorHandler(async (req: NextRequest) => {
  const userId = await requireAuthenticatedUserId();
  const body = await req.json();
  const { communityId, code } = bodySchema.parse(body);

  const membership = await requireCommunityMembership(communityId, userId);
  requireFinanceEnabled(membership);
  requireFinanceWritePermission(membership);
  requireFinanceAdminWrite(membership);
  await requireActiveSubscriptionForMutation(communityId);

  const requestId = req.headers.get('x-request-id');
  const result = await completeConnectOnboarding(communityId, code, userId, requestId);

  return NextResponse.json({ data: result }, { status: 200 });
});
