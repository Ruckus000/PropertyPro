/**
 * Help Article Feedback API
 *
 * GET  /api/v1/help/feedback?articleSlug=X&communityId=N — current user's rating (or null)
 * POST /api/v1/help/feedback                            — submit/update thumbs up/down + optional comment
 *
 * Invariants:
 * - withErrorHandler wrapper (structured errors, request ID)
 * - Tenant isolation via the help-feedback service (createScopedClient inside)
 * - Auth via requireAuthenticatedUserId + requireCommunityMembership
 * - Upsert (INSERT-then-UPDATE-on-23505) lives in the service. The route
 *   only owns validation, telemetry, and HTTP status mapping.
 * - No audit log — feedback is not compliance-critical.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { captureMessage } from '@sentry/nextjs';
import { withErrorHandler } from '@/lib/api/error-handler';
import { ValidationError } from '@/lib/api/errors/ValidationError';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { resolveEffectiveCommunityId } from '@/lib/api/tenant-context';
import {
  getMyArticleFeedback,
  upsertArticleFeedback,
} from '@/lib/services/help-feedback-service';

const NEGATIVE_FEEDBACK_COMMENT_MAX_LEN = 500;

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

  const data = await getMyArticleFeedback(communityId, userId, parsedSlug.data);

  return NextResponse.json({ data });
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

  // Telemetry: thumbs-down with a comment is the highest-signal content-gap
  // event — surface it via Sentry so the weekly content-gaps script can
  // collect it. We truncate the comment to bound any incidental PII the
  // user types into the feedback box. Sentry's beforeSend hook strips
  // auth/cookie headers; this is the runtime defense for body content.
  if (rating === -1 && comment && comment.trim().length > 0) {
    captureMessage('help_feedback_negative', {
      level: 'info',
      extra: {
        articleSlug,
        articleCategory,
        communityId,
        comment: comment.slice(0, NEGATIVE_FEEDBACK_COMMENT_MAX_LEN),
      },
    });
  }

  const { row, created } = await upsertArticleFeedback({
    communityId,
    userId,
    articleSlug,
    articleCategory,
    rating,
    comment: comment ?? null,
  });

  return NextResponse.json({ data: row }, { status: created ? 201 : 200 });
});
