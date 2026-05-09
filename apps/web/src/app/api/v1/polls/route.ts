/**
 * Polls API.
 *
 * GET   /api/v1/polls  — paginated polls list (Plan B3 rollout)
 * POST  /api/v1/polls  — create a new poll
 *
 * GET pagination (Plan B3):
 * - Cursor-based via the canonical `paginate()` helper, wrapped behind
 *   `paginatePollsForCommunity()` on `polls-service` so the route doesn't
 *   import the table or scoped client directly.
 * - Filters push into the SQL `where` predicate inside the helper:
 *   - `isActive` (default `true`)
 *   - `includeEnded=false` (default) → `or(isNull(polls.endsAt), gt(polls.endsAt, now))`
 * - Order by `id` desc — for monotonic bigserial PKs this is equivalent to
 *   the previous `desc(createdAt)` sort. Same-instant inserts may break ties
 *   differently; rare edge case.
 * - Response envelope is double-wrapped per the paginated-route contract:
 *   `{ data: { data: PollRecord[], pagination } }`.
 *
 * Time-dependent `endsAt` filter: `now` is captured once per request and
 * passed to the helper. Polls expiring mid-walk drop out of subsequent
 * pages — this matches the prior semantics where the per-request `now` cut
 * off the JS filter as well.
 */
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
import {
  createPollForCommunity,
  paginatePollsForCommunity,
} from '@/lib/services/polls-service';

const createPollSchema = z.object({
  communityId: z.number().int().positive(),
  title: z.string().trim().min(1).max(240),
  description: z.string().trim().max(5000).nullable().optional(),
  pollType: z.enum(['single_choice', 'multiple_choice']),
  options: z.array(z.string().trim().min(1).max(240)).min(2).max(20),
  endsAt: z.string().datetime({ offset: true }).nullable().optional(),
});

const listQuerySchema = z.object({
  cursor: z.string().min(1).max(256).optional(),
  pageSize: z.coerce.number().int().positive().optional(),
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

  // Use `||` not `??` so empty-string query params (`?cursor=`, `?pageSize=`)
  // are treated as missing rather than passed to Zod, which would 400 on the
  // `min(1)` / `positive()` constraints.
  const parsedQuery = listQuerySchema.safeParse({
    cursor: searchParams.get('cursor') || undefined,
    pageSize: searchParams.get('pageSize') || undefined,
  });
  if (!parsedQuery.success) {
    throw new ValidationError('Invalid query parameters');
  }

  const result = await paginatePollsForCommunity({
    communityId,
    cursor: parsedQuery.data.cursor,
    pageSize: parsedQuery.data.pageSize,
    isActive,
    includeEnded,
    now: new Date(),
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
