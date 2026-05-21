import { notFound } from 'next/navigation';
import { serialize } from 'next-mdx-remote/serialize';
import { Breadcrumbs } from '@/components/shared/breadcrumbs';
import { HelpArticleBody } from '@/components/help/help-article-body';
import { PageHeader } from '@/components/shared/page-header';
import { requireHelpPageContext } from '@/lib/help/page-context';
import { extractTableOfContents } from '@/lib/help/toc';
import { getFeaturesForCommunity } from '@propertypro/shared';
import {
  getAllArticles,
  getArticle,
  isArticleVisibleToRole,
  filterArticlesByFeatures,
  type HelpArticleMetadata,
} from '@/lib/services/help-article-service';

interface HelpArticlePageProps {
  params: Promise<{ category: string; slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function HelpArticlePage({
  params,
  searchParams,
}: HelpArticlePageProps) {
  const [{ category, slug }, resolvedSearchParams] = await Promise.all([
    params,
    searchParams,
  ]);
  const context = await requireHelpPageContext(
    resolvedSearchParams,
    `/help/${category}/${slug}`,
  );
  const effectiveRole = context.membership.presetKey ?? context.membership.role;
  const features = getFeaturesForCommunity(context.membership.communityType);
  const article = getArticle(category, slug);

  if (
    !article ||
    !isArticleVisibleToRole(article.metadata, effectiveRole) ||
    filterArticlesByFeatures([article.metadata], features).length === 0
  ) {
    notFound();
  }

  const source = await serialize(article.rawContent, { parseFrontmatter: true });
  const toc = extractTableOfContents(article.rawContent);

  const related: HelpArticleMetadata[] = article.metadata.relatedArticles
    .map((relatedSlug) => getAllArticles().find((candidate) => candidate.slug === relatedSlug))
    .filter(
      (c): c is HelpArticleMetadata =>
        !!c &&
        isArticleVisibleToRole(c, effectiveRole) &&
        filterArticlesByFeatures([c], features).length > 0,
    );

  return (
    <div className="space-y-8">
      <PageHeader
        title={article.metadata.title}
        description={article.metadata.description}
        breadcrumb={
          <Breadcrumbs
            items={[
              { label: 'Help Center', href: `/help?communityId=${context.communityId}` },
              {
                label: article.metadata.category
                  .replace(/-/g, ' ')
                  .replace(/\b\w/g, (c) => c.toUpperCase()),
                href: `/help/${article.metadata.category}?communityId=${context.communityId}`,
              },
            ]}
            currentLabel={article.metadata.title}
          />
        }
      />

      <HelpArticleBody
        source={source}
        toc={toc}
        metadata={article.metadata}
        related={related}
        communityId={context.communityId}
        displayMode="route"
      />
    </div>
  );
}
