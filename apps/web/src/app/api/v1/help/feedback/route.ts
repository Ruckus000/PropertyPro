/**
 * Help Article Feedback API
 *
 * GET  /api/v1/help/feedback?articleSlug=X&communityId=N — current user's rating (or null)
 * POST /api/v1/help/feedback                            — submit/update thumbs up/down + optional comment
 *
 * Invariants:
 * - withErrorHandler wrapper (structured errors, request ID)
 * - Tenant isolation via createScopedClient(communityId)
 * - Auth via requireAuthenticatedUserId + requireCommunityMembership
 * - One active feedback row per (user, article). Upsert is atomic: try INSERT,
 *   on unique_violation (Postgres 23505) fall back to UPDATE. This eliminates
 *   the SELECT-then-write race that was in the original implementation.
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

const UNIQUE_VIOLATION = '23505';

function isUniqueViolation(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const candidate = error as { code?: unknown; cause?: { code?: unknown } };
  if (candidate.code === UNIQUE_VIOLATION) return true;
  if (candidate.cause && typeof candidate.cause === 'object' && candidate.cause.code === UNIQUE_VIOLATION) {
    return true;
  }
  return false;
}

const communityIdSchema = z.coerce.number().int().positive();
const articleSlugSchema = z.string().min(1).max(200);

const postSchema = z.object({
  communityId: z.number().int().positive(),
  articleSlug: articleSlugSchema,
  articleCategory: z.string().min(1).max(100),
  rating: z.union([z.literal(1), z.literal(-1)]),
  comment: z.string().max(2000).optional().nullable(),
});

export const GET = withErrorHandler(async (req: NextRequest) => {
  const { searchParams } = new URL(req.url);
  const parsedCommunity = communityIdSchema.safeParse(searchParams.get('communityId'));
  const parsedSlug = articleSlugSchema.safeParse(searchParams.get('articleSlug'));
  if (!parsedCommunity.success || !parsedSlug.success) {
    throw new ValidationError('Invalid or missing communityId / articleSlug');
  }

  const communityId = resolveEffectiveCommunityId(req, parsedCommunity.data);
  const userId = await requireAuthenticatedUserId();
  await requireCommunityMembership(communityId, userId);

  const scoped = createScopedClient(communityId);
  const rows = (await scoped.selectFrom(
    helpArticleFeedback,
    {
      rating: helpArticleFeedback.rating,
      comment: helpArticleFeedback.comment,
      updatedAt: helpArticleFeedback.updatedAt,
    },
    and(
      eq(helpArticleFeedback.userId, userId),
      eq(helpArticleFeedback.articleSlug, parsedSlug.data),
    ),
  )) as Array<{ rating: number; comment: string | null; updatedAt: Date }>;

  return NextResponse.json({ data: rows[0] ?? null });
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

  try {
    const inserted = await scoped.insert(helpArticleFeedback, {
      userId,
      articleSlug,
      articleCategory,
      rating,
      comment: comment ?? null,
    });
    return NextResponse.json({ data: inserted[0] }, { status: 201 });
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;

    // Row already exists for this (user, article). Update their rating.
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
});
