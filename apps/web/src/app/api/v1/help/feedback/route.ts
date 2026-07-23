/**
 * Help Article Feedback API
 *
 * GET  /api/v1/help/feedback?articleSlug=X&communityId=N
 * POST /api/v1/help/feedback
 *
 * Plan A1 drain #109. Contracts in `./contract.ts`; validation and envelope
 * wrapping via `runRoute()`.
 */
import { runRoute } from '@propertypro/api-contract';
import { captureMessage } from '@sentry/nextjs';
import { withErrorHandler } from '@/lib/api/error-handler';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { resolveEffectiveCommunityId } from '@/lib/api/tenant-context';
import { requireEntitledForAdminRead } from '@/lib/middleware/read-entitlement-guard';
import {
  getMyArticleFeedback,
  upsertArticleFeedback,
} from '@/lib/services/help-feedback-service';
import { getHelpFeedbackContract, postHelpFeedbackContract } from './contract';

const NEGATIVE_FEEDBACK_COMMENT_MAX_LEN = 500;

export const GET = withErrorHandler(
  runRoute(getHelpFeedbackContract, async ({ query, req }) => {
    const communityId = resolveEffectiveCommunityId(req, query.communityId);
    const userId = await requireAuthenticatedUserId();
    const membership = await requireCommunityMembership(communityId, userId);
    // Lapsed communities lose admin reads (residents unaffected — guard short-circuits).
    await requireEntitledForAdminRead(communityId, membership);

    return getMyArticleFeedback(communityId, userId, query.articleSlug);
  }),
);

export const POST = withErrorHandler(
  runRoute(postHelpFeedbackContract, async ({ body, req }) => {
    const { articleSlug, articleCategory, rating, comment } = body;
    const communityId = resolveEffectiveCommunityId(req, body.communityId);
    const userId = await requireAuthenticatedUserId();
    await requireCommunityMembership(communityId, userId);

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

    const { row } = await upsertArticleFeedback({
      communityId,
      userId,
      articleSlug,
      articleCategory,
      rating,
      comment: comment ?? null,
    });

    return row;
  }),
);
