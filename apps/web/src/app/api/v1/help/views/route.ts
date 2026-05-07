/**
 * Help Article Read-State API
 *
 * GET /api/v1/help/views?communityId=N — distinct article slugs the current
 *                                        user has ever viewed in this community.
 *
 * Sourced from help_article_views (write-only, append-only — see
 * /api/v1/help/view). The "read" UI is purely advisory — there is no SLA on
 * freshness and views are best-effort.
 *
 * Invariants:
 * - withErrorHandler wrapper for structured errors / request ID
 * - Tenant isolation via createScopedClient(communityId)
 * - Auth via requireAuthenticatedUserId + requireCommunityMembership
 * - Returns { data: { slugs: string[] } } per the standard envelope.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { createScopedClient, helpArticleViews } from '@propertypro/db';
import { eq } from '@propertypro/db/filters';
import { withErrorHandler } from '@/lib/api/error-handler';
import { ValidationError } from '@/lib/api/errors/ValidationError';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { resolveEffectiveCommunityId } from '@/lib/api/tenant-context';

const querySchema = z.object({
  communityId: z.coerce.number().int().positive(),
});

export const GET = withErrorHandler(async (req: NextRequest) => {
  const { searchParams } = new URL(req.url);
  const parsed = querySchema.safeParse({
    communityId: searchParams.get('communityId'),
  });
  if (!parsed.success) {
    throw new ValidationError('Invalid communityId');
  }

  const communityId = resolveEffectiveCommunityId(req, parsed.data.communityId);
  const userId = await requireAuthenticatedUserId();
  await requireCommunityMembership(communityId, userId);

  const scoped = createScopedClient(communityId);
  const rows = (await scoped.selectFrom(
    helpArticleViews,
    { articleSlug: helpArticleViews.articleSlug },
    eq(helpArticleViews.userId, userId),
  )) as Array<{ articleSlug: string }>;

  // De-dupe in JS — `help_article_views` is append-only by design.
  const slugs = Array.from(new Set(rows.map((row) => row.articleSlug)));

  return NextResponse.json({ data: { slugs } });
});
