import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { withErrorHandler } from '@/lib/api/error-handler';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { ValidationError } from '@/lib/api/errors';
import { formatZodErrors } from '@/lib/api/zod/error-formatter';
import { parseCommunityIdFromBody, parseCommunityIdFromQuery } from '@/lib/finance/request';
import {
  requireAccountingEnabled,
  requireAccountingReadPermission,
  requireAccountingWritePermission,
} from '@/lib/accounting/common';
import { assertNotDemoGrace } from '@/lib/middleware/demo-grace-guard';
import {
  getAccountingMapping,
  updateAccountingMapping,
} from '@/lib/services/accounting-connectors-service';

const providerQuerySchema = z.object({
  provider: z.enum(['quickbooks', 'xero']),
});

const updateMappingSchema = z.object({
  communityId: z.number().int().positive(),
  provider: z.enum(['quickbooks', 'xero']),
  mapping: z.record(z.string(), z.string()),
});

export const GET = withErrorHandler(async (req: NextRequest) => {
  const actorUserId = await requireAuthenticatedUserId();
  const communityId = parseCommunityIdFromQuery(req);
  const membership = await requireCommunityMembership(communityId, actorUserId);

  requireAccountingEnabled(membership);
  requireAccountingReadPermission(membership);

  const { searchParams } = new URL(req.url);
  const parsed = providerQuerySchema.safeParse({
    provider: searchParams.get('provider'),
  });

  if (!parsed.success) {
    throw new ValidationError('Invalid mapping query parameters', {
      fields: formatZodErrors(parsed.error),
    });
  }

  const data = await getAccountingMapping(communityId, parsed.data.provider);
  return NextResponse.json({ data });
});

export const PUT = withErrorHandler(async (req: NextRequest) => {
  const actorUserId = await requireAuthenticatedUserId();
  const body: unknown = await req.json();
  const parsed = updateMappingSchema.safeParse(body);

  if (!parsed.success) {
    throw new ValidationError('Invalid accounting mapping payload', {
      fields: formatZodErrors(parsed.error),
    });
  }

  const communityId = parseCommunityIdFromBody(req, parsed.data.communityId);
  await assertNotDemoGrace(communityId);
  const membership = await requireCommunityMembership(communityId, actorUserId);

  requireAccountingEnabled(membership);
  requireAccountingWritePermission(membership);

  const requestId = req.headers.get('x-request-id');
  const data = await updateAccountingMapping(
    communityId,
    actorUserId,
    parsed.data.provider,
    parsed.data.mapping,
    requestId,
  );

  return NextResponse.json({ data });
});
