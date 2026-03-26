import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { withErrorHandler } from '@/lib/api/error-handler';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { formatZodErrors } from '@/lib/api/zod/error-formatter';
import { BadRequestError, ValidationError } from '@/lib/api/errors';
import { requireActiveSubscriptionForMutation } from '@/lib/middleware/subscription-guard';
import {
  parsePositiveInt,
  requireFinanceAdminWrite,
  requireFinanceEnabled,
  requireFinanceWritePermission,
} from '@/lib/finance/common';
import { parseCommunityIdFromBody } from '@/lib/finance/request';
import { assertNotDemoGrace } from '@/lib/middleware/demo-grace-guard';
import { waiveLateFeesForUnit } from '@/lib/services/finance-service';

const waiveSchema = z.object({
  communityId: z.number().int().positive(),
});

async function parseUnitId(
  context?: { params: Promise<Record<string, string>> },
): Promise<number> {
  const rawUnitId = (await context?.params)?.['unitId'] ?? '';
  if (!rawUnitId) {
    throw new BadRequestError('unitId route parameter is required');
  }
  return parsePositiveInt(rawUnitId, 'unitId');
}

export const POST = withErrorHandler(async (
  req: NextRequest,
  context?: { params: Promise<Record<string, string>> },
) => {
  const actorUserId = await requireAuthenticatedUserId();
  const unitId = await parseUnitId(context);

  const body: unknown = await req.json();
  const parseResult = waiveSchema.safeParse(body);
  if (!parseResult.success) {
    throw new ValidationError('Invalid waive-late-fees payload', {
      fields: formatZodErrors(parseResult.error),
    });
  }

  const communityId = parseCommunityIdFromBody(req, parseResult.data.communityId);
  await assertNotDemoGrace(communityId);
  const membership = await requireCommunityMembership(communityId, actorUserId);
  await requireFinanceEnabled(membership);
  requireFinanceWritePermission(membership);
  requireFinanceAdminWrite(membership);
  await requireActiveSubscriptionForMutation(communityId);

  const requestId = req.headers.get('x-request-id');
  const result = await waiveLateFeesForUnit(communityId, unitId, actorUserId, requestId);
  return NextResponse.json({ data: result });
});
