import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { COMMUNITY_TYPES } from '@propertypro/shared';
import { isPmAdminInAnyCommunity } from '@propertypro/db/unsafe';
import { withErrorHandler } from '@/lib/api/error-handler';
import { ForbiddenError, ValidationError } from '@/lib/api/errors';
import { formatZodErrors } from '@/lib/api/zod/error-formatter';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { listManagedCommunitiesForPm } from '@/lib/api/pm-communities';

const querySchema = z.object({
  communityType: z.enum(COMMUNITY_TYPES).optional(),
  search: z
    .string()
    .trim()
    .min(1)
    .max(100)
    .optional(),
});

export const GET = withErrorHandler(async (req: NextRequest) => {
  const userId = await requireAuthenticatedUserId();

  const isPm = await isPmAdminInAnyCommunity(userId);
  if (!isPm) {
    throw new ForbiddenError('This endpoint is only available to property managers');
  }

  const { searchParams } = new URL(req.url);

  const rawQuery = {
    communityType: searchParams.get('communityType') ?? undefined,
    search: searchParams.get('search') ?? undefined,
  };

  const parseResult = querySchema.safeParse(rawQuery);
  if (!parseResult.success) {
    throw new ValidationError('Invalid PM communities query', {
      fields: formatZodErrors(parseResult.error),
    });
  }

  const rows = await listManagedCommunitiesForPm(userId, parseResult.data);
  return NextResponse.json({ data: rows });
});
