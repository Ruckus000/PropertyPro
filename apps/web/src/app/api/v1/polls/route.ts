import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { withErrorHandler } from '@/lib/api/error-handler';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { ValidationError } from '@/lib/api/errors';
import { formatZodErrors } from '@/lib/api/zod/error-formatter';
import { parseCommunityIdFromBody, parseCommunityIdFromQuery } from '@/lib/finance/request';
import {
  requirePollCreatorRole,
  requirePollReadPermission,
  requirePollWritePermission,
  requirePollsEnabled,
} from '@/lib/polls/common';
import { assertNotDemoGrace } from '@/lib/middleware/demo-grace-guard';
import { createPollForCommunity, listPollsForCommunity } from '@/lib/services/polls-service';

const createPollSchema = z.object({
  communityId: z.number().int().positive(),
  title: z.string().trim().min(1).max(240),
  description: z.string().trim().max(5000).nullable().optional(),
  pollType: z.enum(['single_choice', 'multiple_choice']),
  options: z.array(z.string().trim().min(1).max(240)).min(2).max(20),
  endsAt: z.string().datetime({ offset: true }).nullable().optional(),
});

function parseBooleanQuery(value: string | null | undefined, fallback: boolean): boolean {
  if (value === null || value === undefined) {
    return fallback;
  }
  return value === 'true' || value === '1';
}

export const GET = withErrorHandler(async (req: NextRequest) => {
  const actorUserId = await requireAuthenticatedUserId();
  const communityId = parseCommunityIdFromQuery(req);
  const membership = await requireCommunityMembership(communityId, actorUserId);

  requirePollsEnabled(membership);
  requirePollReadPermission(membership);

  const { searchParams } = new URL(req.url);
  const isActive = parseBooleanQuery(searchParams.get('isActive'), true);
  const includeEnded = parseBooleanQuery(searchParams.get('includeEnded'), false);

  const data = await listPollsForCommunity(communityId, { isActive, includeEnded });
  return NextResponse.json({ data });
});

export const POST = withErrorHandler(async (req: NextRequest) => {
  const actorUserId = await requireAuthenticatedUserId();
  const body: unknown = await req.json();
  const parsed = createPollSchema.safeParse(body);

  if (!parsed.success) {
    throw new ValidationError('Invalid poll payload', {
      fields: formatZodErrors(parsed.error),
    });
  }

  const communityId = parseCommunityIdFromBody(req, parsed.data.communityId);
  await assertNotDemoGrace(communityId);
  const membership = await requireCommunityMembership(communityId, actorUserId);

  requirePollsEnabled(membership);
  requirePollWritePermission(membership);
  requirePollCreatorRole(membership);

  const requestId = req.headers.get('x-request-id');
  const data = await createPollForCommunity(
    communityId,
    actorUserId,
    {
      title: parsed.data.title,
      description: parsed.data.description ?? null,
      pollType: parsed.data.pollType,
      options: parsed.data.options,
      endsAt: parsed.data.endsAt ?? null,
    },
    requestId,
  );

  return NextResponse.json({ data }, { status: 201 });
});
