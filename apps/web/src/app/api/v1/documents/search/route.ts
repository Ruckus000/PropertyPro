import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { searchDocuments } from '@propertypro/db';
import { withErrorHandler } from '@/lib/api/error-handler';
import { ValidationError } from '@/lib/api/errors';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { formatZodErrors } from '@/lib/api/zod/error-formatter';

const querySchema = z.object({
  communityId: z.coerce.number().int().positive(),
  q: z.string().optional(),
  categoryId: z.coerce.number().int().positive().optional(),
  mimeType: z.string().min(1).optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  cursor: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().max(100).optional(),
});

export const GET = withErrorHandler(async (req: NextRequest) => {
  const searchParams = new URL(req.url).searchParams;
  const parseResult = querySchema.safeParse({
    communityId: searchParams.get('communityId'),
    q: searchParams.get('q') ?? undefined,
    categoryId: searchParams.get('categoryId') ?? undefined,
    mimeType: searchParams.get('mimeType') ?? undefined,
    from: searchParams.get('from') ?? undefined,
    to: searchParams.get('to') ?? undefined,
    cursor: searchParams.get('cursor') ?? undefined,
    limit: searchParams.get('limit') ?? undefined,
  });

  if (!parseResult.success) {
    throw new ValidationError('Invalid document search query parameters', {
      fields: formatZodErrors(parseResult.error),
    });
  }

  const userId = await requireAuthenticatedUserId();
  const params = parseResult.data;
  await requireCommunityMembership(params.communityId, userId);

  const result = await searchDocuments({
    communityId: params.communityId,
    query: params.q,
    categoryId: params.categoryId,
    mimeType: params.mimeType,
    createdFrom: params.from ? new Date(params.from) : null,
    createdTo: params.to ? new Date(params.to) : null,
    cursor: params.cursor ?? null,
    limit: params.limit,
  });

  return NextResponse.json({
    data: result.data,
    pagination: {
      nextCursor: result.nextCursor,
      limit: params.limit ?? 20,
    },
  });
});
