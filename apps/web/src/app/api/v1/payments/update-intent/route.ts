import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { withErrorHandler } from '@/lib/api/error-handler';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { formatZodErrors } from '@/lib/api/zod/error-formatter';
import { ValidationError } from '@/lib/api/errors';
import { requireFinanceAdminWrite, requireFinanceEnabled, requireFinanceWritePermission } from '@/lib/finance/common';
import { parseCommunityIdFromBody } from '@/lib/finance/request';
import { requireActorOwnsPi, updatePaymentIntentFee } from '@/lib/services/finance-service';

const updateIntentSchema = z.object({
  communityId: z.number().int().positive(),
  paymentIntentId: z.string().startsWith('pi_'),
  paymentMethod: z.enum(['card', 'us_bank_account']),
});

export const PATCH = withErrorHandler(async (req: NextRequest) => {
  const actorUserId = await requireAuthenticatedUserId();
  const body: unknown = await req.json();
  const parseResult = updateIntentSchema.safeParse(body);

  if (!parseResult.success) {
    throw new ValidationError('Invalid update-intent payload', {
      fields: formatZodErrors(parseResult.error),
    });
  }

  const communityId = parseCommunityIdFromBody(req, parseResult.data.communityId);
  const membership = await requireCommunityMembership(communityId, actorUserId);
  requireFinanceEnabled(membership);
  requireFinanceWritePermission(membership);

  // Owners can only update PIs they created; admins can update any PI in their community
  if (membership.role === 'resident' && membership.isUnitOwner) {
    await requireActorOwnsPi(parseResult.data.paymentIntentId, actorUserId);
  } else {
    requireFinanceAdminWrite(membership);
  }

  const result = await updatePaymentIntentFee(
    communityId,
    parseResult.data.paymentIntentId,
    parseResult.data.paymentMethod,
    actorUserId,
  );

  return NextResponse.json({ data: result });
});
