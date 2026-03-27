import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import type { ElectionStatus } from '@propertypro/db';
import { withErrorHandler } from '@/lib/api/error-handler';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { ValidationError } from '@/lib/api/errors';
import { formatZodErrors } from '@/lib/api/zod/error-formatter';
import { parseCommunityIdFromQuery } from '@/lib/finance/request';
import {
  requireElectionsEnabled,
  requireElectionsReadPermission,
} from '@/lib/elections/common';
import { listElectionsForCommunity } from '@/lib/services/elections-service';

const electionsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(25).optional(),
  statuses: z
    .string()
    .trim()
    .optional()
    .transform((value) => {
      if (!value) {
        return undefined;
      }

      return value
        .split(',')
        .map((entry) => entry.trim())
        .filter(Boolean) as ElectionStatus[];
    }),
});

export const GET = withErrorHandler(async (req: NextRequest) => {
  const actorUserId = await requireAuthenticatedUserId();
  const communityId = parseCommunityIdFromQuery(req);
  const membership = await requireCommunityMembership(communityId, actorUserId);

  requireElectionsEnabled(membership);
  requireElectionsReadPermission(membership);

  const searchParams = Object.fromEntries(new URL(req.url).searchParams.entries());
  const parsed = electionsQuerySchema.safeParse(searchParams);
  if (!parsed.success) {
    throw new ValidationError('Invalid elections query', {
      fields: formatZodErrors(parsed.error),
    });
  }

  const data = await listElectionsForCommunity(communityId, {
    limit: parsed.data.limit,
    statuses: parsed.data.statuses,
  });

  return NextResponse.json({ data });
});
