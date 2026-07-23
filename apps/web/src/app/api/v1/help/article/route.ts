/**
 * GET /api/v1/help/article?category=X&slug=Y&communityId=N
 *
 * Returns server-rendered article HTML + TOC + metadata + related articles
 * for the requested help article, filtered by the viewer's role and
 * community features.
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
import { unstable_cache } from 'next/cache';
import { compileMDX } from 'next-mdx-remote/rsc';
import { getFeaturesForCommunity } from '@propertypro/shared';
import { runRoute } from '@propertypro/api-contract';
import { withErrorHandler } from '@/lib/api/error-handler';
import { NotFoundError } from '@/lib/api/errors/NotFoundError';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { resolveEffectiveCommunityId } from '@/lib/api/tenant-context';
import { requireEntitledForAdminRead } from '@/lib/middleware/read-entitlement-guard';
import { resolveHelpViewerRoleFromMembership } from '@/lib/help/viewer-role';
import {
  getAllArticles,
  getArticle,
  isArticleVisibleToRole,
  filterArticlesByFeatures,
  type HelpArticleMetadata,
  type HelpArticleSource,
} from '@/lib/services/help-article-service';
import { extractTableOfContents } from '@/lib/help/toc';
import { helpMdxComponents, type TocItem } from '@/components/help/mdx-components';
import { sanitizeHelpHtml } from '@/lib/help/sanitize-help-html';
import { helpArticleCacheKey } from '@/lib/help/render-version';
import { helpArticleContract } from './contract';

interface CompiledArticle {
  html: string;
  toc: TocItem[];
}

export const GET = withErrorHandler(
  runRoute(helpArticleContract, async ({ query, req }) => {
    const communityId = resolveEffectiveCommunityId(req, query.communityId);
    const userId = await requireAuthenticatedUserId();
    const membership = await requireCommunityMembership(communityId, userId);
    // Lapsed communities lose admin reads (residents unaffected — guard short-circuits).
    await requireEntitledForAdminRead(communityId, membership);
    const features = getFeaturesForCommunity(membership.communityType);
    const effectiveRole = resolveHelpViewerRoleFromMembership(membership);

    const article = getArticle(query.category, query.slug);
    if (
      !article ||
      !isArticleVisibleToRole(article.metadata, effectiveRole) ||
      filterArticlesByFeatures([article.metadata], features).length === 0
    ) {
      // 404, NOT 403 — don't leak existence of role-gated articles
      throw new NotFoundError('Help article not found');
    }

    const compiled = await getCompiledArticle(article);
    const related = getRelatedArticles(article, effectiveRole, features);
    const upNext = resolveUpNext(article, effectiveRole, features);

    return {
      html: compiled.html,
      toc: compiled.toc,
      metadata: article.metadata,
      related,
      upNext,
    };
  }),
);

/**
 * Wraps MDX compile/render + extractTableOfContents in unstable_cache, keyed
 * on (category, slug, contentHash, renderVersion). Rendering MDX to sanitized
 * HTML on the server keeps the modal compatible with production CSP: the browser
 * no longer needs `new Function()` / `'unsafe-eval'` to open contextual help.
 */
async function getCompiledArticle(article: HelpArticleSource): Promise<CompiledArticle> {
  const key = helpArticleCacheKey(
    article.metadata.category,
    article.metadata.slug,
    article.metadata.contentHash,
  );
  return unstable_cache(
    async (): Promise<CompiledArticle> => {
      // Render with compileMDX from next-mdx-remote/rsc (the RSC-native path),
      // NOT the client <MDXRemote/>. In an App Router route handler, React
      // resolves under the `react-server` export condition, where the client
      // hooks dispatcher is null — rendering <MDXRemote/> (which uses useState)
      // through renderToStaticMarkup throws "Cannot read properties of null
      // (reading 'useState')". compileMDX returns a hook-free element tree that
      // renders to static markup safely. Mirrors /help/[category]/[slug]/page.tsx.
      const { content } = await compileMDX({
        source: article.rawContent,
        components: helpMdxComponents,
        options: { parseFrontmatter: true },
      });
      const { renderToStaticMarkup } = await import('react-dom/server');
      const html = renderToStaticMarkup(content);

      return {
        html: sanitizeHelpHtml(html),
        toc: extractTableOfContents(article.rawContent),
      };
    },
    ['help-article', key],
    { tags: ['help-article', key] },
  )();
}

/**
 * Resolves frontmatter `relatedArticles` slugs to full metadata, filtered
 * by the viewer's role and community features. Mirrors the existing logic at
 * /help/[category]/[slug]/page.tsx lines 57–62, with feature-gate parity so
 * related links don't 404 when clicked.
 */
function getRelatedArticles(
  article: HelpArticleSource,
  effectiveRole: string,
  features: ReturnType<typeof getFeaturesForCommunity>,
): HelpArticleMetadata[] {
  return article.metadata.relatedArticles
    .map((slug) => getAllArticles().find((a) => a.slug === slug))
    .filter(
      (a): a is HelpArticleMetadata =>
        !!a &&
        isArticleVisibleToRole(a, effectiveRole) &&
        filterArticlesByFeatures([a], features).length > 0,
    );
}

/**
 * Resolves the optional frontmatter `upNext` slug to full metadata with the
 * same role/feature visibility rules as related articles. Null when unset,
 * unresolvable, or not visible to this viewer.
 */
function resolveUpNext(
  article: HelpArticleSource,
  effectiveRole: string,
  features: ReturnType<typeof getFeaturesForCommunity>,
): HelpArticleMetadata | null {
  const slug = article.metadata.upNext;
  if (!slug) return null;
  const target = getAllArticles().find((a) => a.slug === slug);
  if (
    !target ||
    !isArticleVisibleToRole(target, effectiveRole) ||
    filterArticlesByFeatures([target], features).length === 0
  ) {
    return null;
  }
  return target;
}
