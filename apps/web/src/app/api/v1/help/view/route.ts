/**
 * Help Article View API
 *
 * POST /api/v1/help/view — record a view event for analytics
 *
 * Invariants:
 * - Append-only: views are never deduplicated on the server. If we want distinct
 *   view counts later, compute them at read time.
 * - Silent failure: views are best-effort. If tracking fails, the article still
 *   renders — we never block content delivery on analytics.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { createScopedClient, helpArticleViews } from '@propertypro/db';
import { withErrorHandler } from '@/lib/api/error-handler';
import { ValidationError } from '@/lib/api/errors/ValidationError';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { resolveEffectiveCommunityId } from '@/lib/api/tenant-context';

const postSchema = z.object({
  communityId: z.number().int().positive(),
  articleSlug: z.string().min(1).max(200),
  articleCategory: z.string().min(1).max(100),
});

export const POST = withErrorHandler(async (req: NextRequest) => {
  const body: unknown = await req.json();
  const result = postSchema.safeParse(body);
  if (!result.success) {
    throw new ValidationError('Invalid view payload');
  }

  const { articleSlug, articleCategory } = result.data;
  const communityId = resolveEffectiveCommunityId(req, result.data.communityId);
  const userId = await requireAuthenticatedUserId();
  await requireCommunityMembership(communityId, userId);

  const scoped = createScopedClient(communityId);
  await scoped.insert(helpArticleViews, {
    userId,
    articleSlug,
    articleCategory,
  });

  return NextResponse.json({ ok: true }, { status: 201 });
});
