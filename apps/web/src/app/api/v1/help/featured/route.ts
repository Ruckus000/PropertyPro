/**
 * Help Featured Articles API
 *
 * GET /api/v1/help/featured?communityId=N
 *
 * Returns featured articles for the viewer's role. Used by the
 * HelpDocsModalSearchPanel empty-state when no contextual article
 * matches the current route.
 *
 * Wraps the server-only getFeaturedForRole() so it can be consumed
 * by client components.
 *
 * Plan A1: input validation (query) and output validation + canonical
 * envelope wrapping are delegated to `runRoute()` from `@propertypro/api-contract`.
 * The wire response is the canonical non-paginated envelope:
 *
 *     { data: HelpArticleSummary[] }
 *
 * so consumers can use `requestJson<HelpArticleResult[]>` and get the array
 * directly after the outer `{ data }` is unwrapped.
 */
import { getFeaturesForCommunity } from '@propertypro/shared';
import { runRoute } from '@propertypro/api-contract';
import { withErrorHandler } from '@/lib/api/error-handler';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { resolveEffectiveCommunityId } from '@/lib/api/tenant-context';
import { resolveHelpViewerRoleFromMembership } from '@/lib/help/viewer-role';
import {
  getFeaturedForRole,
  filterArticlesByFeatures,
} from '@/lib/services/help-article-service';
import { helpFeaturedContract } from './contract';

export const GET = withErrorHandler(
  runRoute(helpFeaturedContract, async ({ query, req }) => {
    const communityId = resolveEffectiveCommunityId(req, query.communityId);
    const userId = await requireAuthenticatedUserId();
    const membership = await requireCommunityMembership(communityId, userId);
    const effectiveRole = resolveHelpViewerRoleFromMembership(membership);

    const features = getFeaturesForCommunity(membership.communityType);
    const articles = filterArticlesByFeatures(
      getFeaturedForRole(effectiveRole),
      features,
    );

    return articles.map((a) => ({
      title: a.title,
      description: a.description,
      category: a.category,
      slug: a.slug,
    }));
  }),
);
