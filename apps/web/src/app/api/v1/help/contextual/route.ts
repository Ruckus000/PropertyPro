/**
 * GET /api/v1/help/contextual?path=/compliance&communityId=N
 *
 * Returns up to 3 platform articles relevant to the given UI route path,
 * filtered by the user's effective role (preset override fallback to base
 * role).
 *
 * Plan A1 drain #27 (Move 2 bundle): input validation (query) and output
 * envelope wrapping delegated to `runRoute()` from `@propertypro/api-contract`.
 * Auth chain preserved verbatim. Wire shape `{ data: Array<{title,
 * description, category, slug}> }` is byte-identical to pre-migration.
 *
 * Behavior change: pre-migration 400s threw `ValidationError('Invalid
 * contextual help parameters')`; runner produces the canonical
 * `VALIDATION_ERROR` envelope (status code 400, code `VALIDATION_ERROR`
 * unchanged; message text shifts to runner default).
 */
import { runRoute } from '@propertypro/api-contract';
import { withErrorHandler } from '@/lib/api/error-handler';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { resolveEffectiveCommunityId } from '@/lib/api/tenant-context';
import { getContextualArticles } from '@/lib/services/help-article-service';
import { helpContextualGetContract } from './contract';

export const GET = withErrorHandler(
  runRoute(helpContextualGetContract, async ({ query, req }) => {
    const communityId = resolveEffectiveCommunityId(req, query.communityId);
    const userId = await requireAuthenticatedUserId();
    const membership = await requireCommunityMembership(communityId, userId);
    const effectiveRole = membership.presetKey ?? membership.role;

    const articles = getContextualArticles(query.path, effectiveRole, 3);
    return articles.map((a) => ({
      title: a.title,
      description: a.description,
      category: a.category,
      slug: a.slug,
    }));
  }),
);
