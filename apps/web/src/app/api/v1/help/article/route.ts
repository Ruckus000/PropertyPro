/**
 * GET /api/v1/help/article?category=X&slug=Y&communityId=N
 *
 * Returns server-rendered article HTML + TOC + metadata + related articles
 * for the reader's version of the requested help article (their section, community
 * type and features — see lib/help/reader.ts).
 *
 * Returns 404 (NOT 403) for role-gated/feature-gated articles to avoid
 * leaking existence of restricted content. The 404 is surfaced by throwing
 * `NotFoundError` which `withErrorHandler` translates to a 404 response.
 *
 * Plan A1: input validation (query) and output validation + canonical
 * envelope wrapping are delegated to `runRoute()` from `@propertypro/api-contract`.
 * The wire response is the canonical non-paginated envelope:
 *
 *     { data: { html, toc, metadata, related } }
 *
 * so consumers can use `requestJson<HelpArticleResponse>` and get the right
 * payload after the outer `{ data }` is unwrapped.
 */
import { runRoute } from '@propertypro/api-contract';
import { withErrorHandler } from '@/lib/api/error-handler';
import { NotFoundError } from '@/lib/api/errors/NotFoundError';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { resolveEffectiveCommunityId } from '@/lib/api/tenant-context';
import { requireEntitledForAdminRead } from '@/lib/middleware/read-entitlement-guard';
import { resolveLegacyHelpSlug } from '@/lib/help/legacy-redirects';
import { resolveHelpReader } from '@/lib/help/reader';
import { getCompiledHelpArticleHtml } from '@/lib/help/render-article';
import {
  findArticleForReader,
  getArticleForReader,
  type HelpArticleMetadata,
} from '@/lib/services/help-article-service';
import { helpArticleContract } from './contract';

// route-gate: community-open — help content filtered by the reader's section, type and features
export const GET = withErrorHandler(
  runRoute(helpArticleContract, async ({ query, req }) => {
    const communityId = resolveEffectiveCommunityId(req, query.communityId);
    const userId = await requireAuthenticatedUserId();
    const membership = await requireCommunityMembership(communityId, userId);
    // Lapsed communities lose admin reads (residents unaffected — guard short-circuits).
    await requireEntitledForAdminRead(communityId, membership);
    const reader = resolveHelpReader(membership);

    // Old deep links (`?help=<old-category>/<old-slug>`) and articles that
    // changed topic resolve to the reader's current article.
    const moved = getArticleForReader(query.category, query.slug, reader)
      ? null
      : findArticleForReader(
          resolveLegacyHelpSlug(query.category, query.slug, reader.section) ?? query.slug,
          reader,
        );
    const article = moved
      ? getArticleForReader(moved.category, moved.slug, reader)
      : getArticleForReader(query.category, query.slug, reader);
    if (!article) {
      // 404, NOT 403 — don't leak existence of articles the reader can't see
      throw new NotFoundError('Help article not found');
    }

    const compiled = await getCompiledHelpArticleHtml(article, reader);
    const related = article.metadata.relatedArticles
      .map((slug) => findArticleForReader(slug, reader))
      .filter((a): a is HelpArticleMetadata => !!a);
    const upNext = article.metadata.upNext
      ? findArticleForReader(article.metadata.upNext, reader)
      : null;

    return {
      html: compiled.html,
      toc: compiled.toc,
      metadata: article.metadata,
      related,
      upNext,
    };
  }),
);
