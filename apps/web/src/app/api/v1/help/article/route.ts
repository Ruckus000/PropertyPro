/**
 * Help Article API
 *
 * GET /api/v1/help/article?category=X&slug=Y&communityId=N
 *
 * Returns the serialized MDX body + TOC + metadata + related articles
 * for the requested help article, filtered by the viewer's role and
 * community features.
 *
 * Returns 404 (NOT 403) for role-gated/feature-gated articles to avoid
 * leaking existence of restricted content.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { unstable_cache } from 'next/cache';
import { serialize } from 'next-mdx-remote/serialize';
import type { MDXRemoteSerializeResult } from 'next-mdx-remote';
import { z } from 'zod';
import { getFeaturesForCommunity } from '@propertypro/shared';
import { withErrorHandler } from '@/lib/api/error-handler';
import { ValidationError } from '@/lib/api/errors/ValidationError';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { resolveEffectiveCommunityId } from '@/lib/api/tenant-context';
import {
  getAllArticles,
  getArticle,
  isArticleVisibleToRole,
  filterArticlesByFeatures,
  type HelpArticleMetadata,
  type HelpArticleSource,
} from '@/lib/services/help-article-service';
import { extractTableOfContents } from '@/lib/help/toc';
import type { TocItem } from '@/components/help/mdx-components';

const querySchema = z.object({
  category: z
    .string()
    .regex(/^[a-z0-9-]+$/)
    .min(1)
    .max(64),
  slug: z
    .string()
    .regex(/^[a-z0-9-]+$/)
    .min(1)
    .max(128),
  communityId: z.coerce.number().int().positive(),
});

interface CompiledArticle {
  source: MDXRemoteSerializeResult;
  toc: TocItem[];
}

export const GET = withErrorHandler(async (req: NextRequest) => {
  const { searchParams } = new URL(req.url);
  const parsed = querySchema.safeParse({
    category: searchParams.get('category') || undefined,
    slug: searchParams.get('slug') || undefined,
    communityId: searchParams.get('communityId') || undefined,
  });
  if (!parsed.success) {
    throw new ValidationError('Invalid help article parameters');
  }

  const communityId = resolveEffectiveCommunityId(req, parsed.data.communityId);
  const userId = await requireAuthenticatedUserId();
  const membership = await requireCommunityMembership(communityId, userId);
  const features = getFeaturesForCommunity(membership.communityType);
  const effectiveRole = membership.presetKey ?? membership.role;

  const article = getArticle(parsed.data.category, parsed.data.slug);
  if (
    !article ||
    !isArticleVisibleToRole(article.metadata, effectiveRole) ||
    filterArticlesByFeatures([article.metadata], features).length === 0
  ) {
    // 404, NOT 403 — don't leak existence of role-gated articles
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const compiled = await getCompiledArticle(article);
  const related = getRelatedArticles(article, effectiveRole, features);

  return NextResponse.json({
    data: {
      source: compiled.source,
      toc: compiled.toc,
      metadata: article.metadata,
      related,
    },
  });
});

/**
 * Wraps next-mdx-remote/serialize + extractTableOfContents in unstable_cache,
 * keyed on (category, slug, contentHash). Sub-ms hits after warmup; new
 * deploy = new contentHash = automatic cache invalidation.
 */
async function getCompiledArticle(article: HelpArticleSource): Promise<CompiledArticle> {
  const key = `${article.metadata.category}:${article.metadata.slug}:${article.metadata.contentHash}`;
  return unstable_cache(
    async (): Promise<CompiledArticle> => ({
      source: await serialize(article.rawContent, { parseFrontmatter: true }),
      toc: extractTableOfContents(article.rawContent),
    }),
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
