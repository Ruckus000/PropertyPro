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
import { runRoute } from '@propertypro/api-contract';
import { withErrorHandler } from '@/lib/api/error-handler';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { resolveEffectiveCommunityId } from '@/lib/api/tenant-context';
import { requireEntitledForAdminRead } from '@/lib/middleware/read-entitlement-guard';
import { resolveHelpReader } from '@/lib/help/reader';
import { getFeaturedForReader } from '@/lib/services/help-article-service';
import { helpFeaturedContract } from './contract';

// route-gate: community-open — getFeaturedForReader filters by the reader's section, type and features
export const GET = withErrorHandler(
  runRoute(helpFeaturedContract, async ({ query, req }) => {
    const communityId = resolveEffectiveCommunityId(req, query.communityId);
    const userId = await requireAuthenticatedUserId();
    const membership = await requireCommunityMembership(communityId, userId);
    // Lapsed communities lose admin reads (residents unaffected — guard short-circuits).
    await requireEntitledForAdminRead(communityId, membership);
    // The in-app panel lists a short set; the Help Center home shows six.
    const articles = getFeaturedForReader(resolveHelpReader(membership), 4);

    return articles.map((a) => ({
      title: a.title,
      description: a.description,
      category: a.category,
      slug: a.slug,
    }));
  }),
);
