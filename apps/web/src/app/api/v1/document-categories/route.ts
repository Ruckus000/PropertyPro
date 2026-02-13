import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import {
  createScopedClient,
  documentCategories,
} from '@propertypro/db';
import { withErrorHandler } from '@/lib/api/error-handler';
import { ValidationError } from '@/lib/api/errors';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { formatZodErrors } from '@/lib/api/zod/error-formatter';

const querySchema = z.object({
  communityId: z.coerce.number().int().positive(),
});

export const GET = withErrorHandler(async (req: NextRequest) => {
  const userId = await requireAuthenticatedUserId();

  const { searchParams } = new URL(req.url);
  const parseResult = querySchema.safeParse({
    communityId: searchParams.get('communityId'),
  });

  if (!parseResult.success) {
    throw new ValidationError('Invalid query parameters', {
      fields: formatZodErrors(parseResult.error),
    });
  }

  const { communityId } = parseResult.data;
  await requireCommunityMembership(communityId, userId);

  const scoped = createScopedClient(communityId);
  const rows = await scoped.query(documentCategories);

  // Map to cleaner response format
  const categories = rows.map((row) => ({
    id: row['id'] as number,
    name: row['name'] as string,
    description: row['description'] as string | null,
    isSystem: row['isSystem'] as boolean,
  }));

  return NextResponse.json({ data: categories });
});
