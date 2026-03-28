import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { withErrorHandler } from '@/lib/api/error-handler';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { ValidationError } from '@/lib/api/errors';
import { formatZodErrors } from '@/lib/api/zod/error-formatter';
import { parseCommunityIdFromQuery } from '@/lib/finance/request';
import { resolveUserDisplayNames } from '@/lib/utils/resolve-users';

const userNamesQuerySchema = z.object({
  communityId: z.coerce.number().int().positive(),
  ids: z
    .string()
    .trim()
    .min(1)
    .transform((value) =>
      value
        .split(',')
        .map((entry) => entry.trim())
        .filter(Boolean),
    )
    .pipe(z.array(z.string().uuid()).min(1).max(50)),
});

export const GET = withErrorHandler(async (req: NextRequest) => {
  const actorUserId = await requireAuthenticatedUserId();

  const searchParams = Object.fromEntries(new URL(req.url).searchParams.entries());
  const parsed = userNamesQuerySchema.safeParse(searchParams);
  if (!parsed.success) {
    throw new ValidationError('Invalid user names query', {
      fields: formatZodErrors(parsed.error),
    });
  }

  const communityId = parseCommunityIdFromQuery(req);
  if (communityId !== parsed.data.communityId) {
    throw new ValidationError('Invalid user names query', {
      fields: [{ field: 'communityId', message: 'communityId does not match the active request context' }],
    });
  }

  await requireCommunityMembership(communityId, actorUserId);

  const displayNames = await resolveUserDisplayNames(communityId, parsed.data.ids);

  return NextResponse.json({
    data: Object.fromEntries(displayNames),
  });
});
