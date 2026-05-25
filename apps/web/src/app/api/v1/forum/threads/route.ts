import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { withErrorHandler } from '@/lib/api/error-handler';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { ValidationError } from '@/lib/api/errors';
import { formatZodErrors } from '@/lib/api/zod/error-formatter';
import { parseCommunityIdFromBody, parseCommunityIdFromQuery } from '@/lib/finance/request';
import {
  requireCommunityBoardEnabled,
  requirePollReadPermission,
  requirePollWritePermission,
} from '@/lib/polls/common';
import { assertNotDemoGrace } from '@/lib/middleware/demo-grace-guard';
import { createForumThreadForCommunity, paginateForumThreadsForCommunity } from '@/lib/services/polls-service';

const createThreadSchema = z.object({
  communityId: z.number().int().positive(),
  title: z.string().trim().min(1).max(240),
  body: z.string().trim().min(1).max(8000),
});

const listThreadsQuerySchema = z.object({
  cursor: z.string().min(1).max(512).optional(),
  pageSize: z.coerce.number().int().positive().optional(),
});

export const GET = withErrorHandler(async (req: NextRequest) => {
  const actorUserId = await requireAuthenticatedUserId();
  const communityId = parseCommunityIdFromQuery(req);
  const membership = await requireCommunityMembership(communityId, actorUserId);

  requireCommunityBoardEnabled(membership);
  requirePollReadPermission(membership);

  const { searchParams } = new URL(req.url);
  const parsedQuery = listThreadsQuerySchema.safeParse({
    cursor: searchParams.get('cursor') || undefined,
    pageSize: searchParams.get('pageSize') || undefined,
  });
  if (!parsedQuery.success) {
    throw new ValidationError('Invalid query parameters', {
      fields: formatZodErrors(parsedQuery.error),
    });
  }

  const result = await paginateForumThreadsForCommunity({
    communityId,
    cursor: parsedQuery.data.cursor,
    pageSize: parsedQuery.data.pageSize,
  });

  return NextResponse.json({
    data: {
      data: result.data,
      pagination: result.pagination,
    },
  });
});

export const POST = withErrorHandler(async (req: NextRequest) => {
  const actorUserId = await requireAuthenticatedUserId();
  const body: unknown = await req.json();
  const parsed = createThreadSchema.safeParse(body);

  if (!parsed.success) {
    throw new ValidationError('Invalid thread payload', {
      fields: formatZodErrors(parsed.error),
    });
  }

  const communityId = parseCommunityIdFromBody(req, parsed.data.communityId);
  await assertNotDemoGrace(communityId);
  const membership = await requireCommunityMembership(communityId, actorUserId);

  requireCommunityBoardEnabled(membership);
  requirePollWritePermission(membership);

  const requestId = req.headers.get('x-request-id');
  const data = await createForumThreadForCommunity(
    communityId,
    actorUserId,
    {
      title: parsed.data.title,
      body: parsed.data.body,
    },
    requestId,
  );

  return NextResponse.json({ data });
});
