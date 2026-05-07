/**
 * GET /api/v1/document-categories
 *
 * Lists document categories for a community. Cursor-based keyset pagination
 * via the canonical `paginate()` helper from `@propertypro/db` (Plan B3 pilot;
 * see ADR-003 / Plan A2).
 *
 * Response envelope is double-wrapped per the paginated-route contract:
 *
 *     { data: { data: Category[], pagination: { nextCursor, hasMore, pageSize } } }
 *
 * so consumers can use `requestJson<{ data, pagination }>` and get the right
 * payload. See `apps/web/src/lib/api/request-json.ts` for the envelope rules.
 *
 * The single in-app consumer (`useDocumentCategories`) needs the full list to
 * resolve a category by name; it walks pages until `hasMore` is false. In
 * practice document_categories tables hold ~10–30 rows per community so a
 * single page (default size 50) covers everything.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import {
  createScopedClient,
  documentCategories,
  paginate,
} from '@propertypro/db';
import { withErrorHandler } from '@/lib/api/error-handler';
import { ValidationError } from '@/lib/api/errors';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { resolveEffectiveCommunityId } from '@/lib/api/tenant-context';
import { formatZodErrors } from '@/lib/api/zod/error-formatter';

const querySchema = z.object({
  communityId: z.coerce.number().int().positive(),
  cursor: z.string().min(1).max(256).optional(),
  pageSize: z.coerce.number().int().positive().optional(),
});

function toSlug(name: string): string {
  return name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

export const GET = withErrorHandler(async (req: NextRequest) => {
  const userId = await requireAuthenticatedUserId();

  const { searchParams } = new URL(req.url);
  const parseResult = querySchema.safeParse({
    communityId: searchParams.get('communityId'),
    cursor: searchParams.get('cursor') ?? undefined,
    pageSize: searchParams.get('pageSize') ?? undefined,
  });

  if (!parseResult.success) {
    throw new ValidationError('Invalid query parameters', {
      fields: formatZodErrors(parseResult.error),
    });
  }

  const communityId = resolveEffectiveCommunityId(req, parseResult.data.communityId);
  await requireCommunityMembership(communityId, userId);

  const scoped = createScopedClient(communityId);
  const result = await paginate(scoped, documentCategories, {
    cursor: parseResult.data.cursor,
    pageSize: parseResult.data.pageSize,
  });

  // Map raw rows (typed as Record<string, unknown>) to the public response
  // shape, adding the derived `slug`.
  const categories = result.data.map((row) => {
    const name = row['name'] as string;
    return {
      id: row['id'] as number,
      name,
      slug: toSlug(name),
      description: (row['description'] as string | null) ?? null,
      isSystem: row['isSystem'] as boolean,
    };
  });

  return NextResponse.json({
    data: {
      data: categories,
      pagination: result.pagination,
    },
  });
});
