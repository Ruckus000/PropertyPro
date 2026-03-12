import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { withErrorHandler } from '@/lib/api/error-handler';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { ValidationError } from '@/lib/api/errors';
import { formatZodErrors } from '@/lib/api/zod/error-formatter';
import { parseCommunityIdFromBody } from '@/lib/finance/request';
import {
  requireAccountingEnabled,
  requireAccountingWritePermission,
} from '@/lib/accounting/common';
import { initiateAccountingConnect } from '@/lib/services/accounting-connectors-service';

const connectSchema = z.object({
  communityId: z.number().int().positive(),
  provider: z.enum(['quickbooks', 'xero']),
});

export const POST = withErrorHandler(async (req: NextRequest) => {
  const actorUserId = await requireAuthenticatedUserId();
  const body: unknown = await req.json();
  const parsed = connectSchema.safeParse(body);

  if (!parsed.success) {
    throw new ValidationError('Invalid accounting connect payload', {
      fields: formatZodErrors(parsed.error),
    });
  }

  const communityId = parseCommunityIdFromBody(req, parsed.data.communityId);
  const membership = await requireCommunityMembership(communityId, actorUserId);

  requireAccountingEnabled(membership);
  requireAccountingWritePermission(membership);

  const data = await initiateAccountingConnect(
    communityId,
    actorUserId,
    parsed.data.provider,
  );

  return NextResponse.json({ data });
});
