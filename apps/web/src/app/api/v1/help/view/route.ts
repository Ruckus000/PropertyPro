/**
 * Help Article View API
 *
 * POST /api/v1/help/view — record a view event for analytics
 *
 * Plan A1 drain #110. Contract in `./contract.ts`; validation and envelope
 * wrapping via `runRoute()`.
 */
import { runRoute } from '@propertypro/api-contract';
import { withErrorHandler } from '@/lib/api/error-handler';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { resolveEffectiveCommunityId } from '@/lib/api/tenant-context';
import { recordArticleView } from '@/lib/services/help-views-service';
import { postHelpViewContract } from './contract';

export const POST = withErrorHandler(
  runRoute(postHelpViewContract, async ({ body, req }) => {
    const { articleSlug, articleCategory } = body;
    const communityId = resolveEffectiveCommunityId(req, body.communityId);
    const userId = await requireAuthenticatedUserId();
    await requireCommunityMembership(communityId, userId);

    await recordArticleView({
      communityId,
      userId,
      articleSlug,
      articleCategory,
    });

    return { ok: true as const };
  }),
);
