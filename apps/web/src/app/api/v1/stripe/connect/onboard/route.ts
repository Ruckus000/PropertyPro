import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { withErrorHandler } from '@/lib/api/error-handler';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { formatZodErrors } from '@/lib/api/zod/error-formatter';
import { ValidationError } from '@/lib/api/errors';
import { requireActiveSubscriptionForMutation } from '@/lib/middleware/subscription-guard';
import {
  requireFinanceAdminWrite,
  requireFinanceEnabled,
  requireFinanceWritePermission,
} from '@/lib/finance/common';
import { parseCommunityIdFromBody } from '@/lib/finance/request';
import { startConnectOnboarding } from '@/lib/services/finance-service';

const onboardSchema = z.object({
  communityId: z.number().int().positive(),
});

export const POST = withErrorHandler(async (req: NextRequest) => {
  const actorUserId = await requireAuthenticatedUserId();
  const body: unknown = await req.json();
  const parseResult = onboardSchema.safeParse(body);

  if (!parseResult.success) {
    throw new ValidationError('Invalid Stripe Connect onboarding payload', {
      fields: formatZodErrors(parseResult.error),
    });
  }

  const communityId = parseCommunityIdFromBody(req, parseResult.data.communityId);
  const membership = await requireCommunityMembership(communityId, actorUserId);
  requireFinanceEnabled(membership);
  requireFinanceWritePermission(membership);
  requireFinanceAdminWrite(membership);
  await requireActiveSubscriptionForMutation(communityId);

  const result = await startConnectOnboarding(
    communityId,
    actorUserId,
    req.headers.get('x-request-id'),
  );

  return NextResponse.json({ data: result });
});
