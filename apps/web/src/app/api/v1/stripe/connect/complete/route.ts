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
import { ValidationError } from '@/lib/api/errors';
import { formatZodErrors } from '@/lib/api/zod/error-formatter';
import { completeConnectOnboarding, validateConnectOAuthState } from '@/lib/services/finance-service';

const bodySchema = z.object({
  communityId: z.number().int().positive(),
  code: z.string().min(1).max(256),
  state: z.string().min(1).max(2048),
});

export const POST = withErrorHandler(async (req: NextRequest) => {
  const userId = await requireAuthenticatedUserId();
  const body: unknown = await req.json();
  const parseResult = bodySchema.safeParse(body);

  if (!parseResult.success) {
    throw new ValidationError('Invalid Stripe Connect completion payload', {
      fields: formatZodErrors(parseResult.error),
    });
  }

  const { communityId, code, state } = parseResult.data;

  // Validate HMAC-signed OAuth state before any mutations
  validateConnectOAuthState(state, communityId, userId);

  const membership = await requireCommunityMembership(communityId, userId);
  await requireFinanceEnabled(membership);
  requireFinanceWritePermission(membership);
  requireFinanceAdminWrite(membership);
  await requireActiveSubscriptionForMutation(communityId);

  const requestId = req.headers.get('x-request-id');
  const result = await completeConnectOnboarding(communityId, code, userId, requestId);

  return NextResponse.json({ data: result }, { status: 200 });
});
