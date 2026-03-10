import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { withErrorHandler } from '@/lib/api/error-handler';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { BadRequestError, ValidationError } from '@/lib/api/errors';
import { formatZodErrors } from '@/lib/api/zod/error-formatter';
import { parseCommunityIdFromQuery } from '@/lib/finance/request';
import {
  requireAccountingEnabled,
  requireAccountingWritePermission,
} from '@/lib/accounting/common';
import { completeAccountingConnect } from '@/lib/services/accounting-connectors-service';

const callbackSchema = z.object({
  provider: z.enum(['quickbooks', 'xero']),
});

export const GET = withErrorHandler(async (req: NextRequest) => {
  const actorUserId = await requireAuthenticatedUserId();
  const communityId = parseCommunityIdFromQuery(req);
  const membership = await requireCommunityMembership(communityId, actorUserId);

  requireAccountingEnabled(membership);
  requireAccountingWritePermission(membership);

  const { searchParams } = new URL(req.url);
  const code = searchParams.get('code');
  if (!code || code.trim().length === 0) {
    throw new BadRequestError('code query parameter is required');
  }

  const parsed = callbackSchema.safeParse({
    provider: searchParams.get('provider'),
  });

  if (!parsed.success) {
    throw new ValidationError('Invalid accounting callback query', {
      fields: formatZodErrors(parsed.error),
    });
  }

  const requestId = req.headers.get('x-request-id');
  const data = await completeAccountingConnect(
    communityId,
    actorUserId,
    parsed.data.provider,
    code,
    requestId,
  );

  return NextResponse.json({ data });
});
