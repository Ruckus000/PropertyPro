/**
 * Help Article Feedback API
 *
 * POST /api/v1/help/feedback — submit thumbs up/down and optional comment
 *
 * Invariants:
 * - withErrorHandler wrapper (structured errors, request ID)
 * - Tenant isolation via createScopedClient(communityId)
 * - Auth via requireAuthenticatedUserId + requireCommunityMembership
 * - One active feedback row per (user, article). Resubmissions update the
 *   existing row so users can change their mind without creating duplicates.
 * - No audit log — feedback is not compliance-critical.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { createScopedClient, helpArticleFeedback } from '@propertypro/db';
import { and, eq } from '@propertypro/db/filters';
import { withErrorHandler } from '@/lib/api/error-handler';
import { ValidationError } from '@/lib/api/errors/ValidationError';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { resolveEffectiveCommunityId } from '@/lib/api/tenant-context';

const postSchema = z.object({
  communityId: z.number().int().positive(),
  articleSlug: z.string().min(1).max(200),
  articleCategory: z.string().min(1).max(100),
  rating: z.union([z.literal(1), z.literal(-1)]),
  comment: z.string().max(2000).optional().nullable(),
});

export const POST = withErrorHandler(async (req: NextRequest) => {
  const body: unknown = await req.json();
  const result = postSchema.safeParse(body);
  if (!result.success) {
    throw new ValidationError('Invalid feedback payload');
  }

  const { articleSlug, articleCategory, rating, comment } = result.data;
  const communityId = resolveEffectiveCommunityId(req, result.data.communityId);
  const userId = await requireAuthenticatedUserId();
  await requireCommunityMembership(communityId, userId);

  const scoped = createScopedClient(communityId);

  const existing = await scoped.selectFrom(
    helpArticleFeedback,
    {
      id: helpArticleFeedback.id,
      rating: helpArticleFeedback.rating,
    },
    and(
      eq(helpArticleFeedback.userId, userId),
      eq(helpArticleFeedback.articleSlug, articleSlug),
    ),
  );

  const existingRow = (await existing) as Array<{ id: number; rating: number }>;

  if (existingRow.length > 0) {
    const updated = await scoped.update(
      helpArticleFeedback,
      {
        rating,
        comment: comment ?? null,
        updatedAt: new Date(),
      },
      and(
        eq(helpArticleFeedback.userId, userId),
        eq(helpArticleFeedback.articleSlug, articleSlug),
      ),
    );
    return NextResponse.json({ data: updated[0] }, { status: 200 });
  }

  const inserted = await scoped.insert(helpArticleFeedback, {
    userId,
    articleSlug,
    articleCategory,
    rating,
    comment: comment ?? null,
  });

  return NextResponse.json({ data: inserted[0] }, { status: 201 });
});
