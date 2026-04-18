import Link from 'next/link';
import { notFound } from 'next/navigation';
import { PageHeader } from '@/components/shared/page-header';
import { requireHelpPageContext } from '@/lib/help/page-context';
import {
  getAllArticles,
  getArticle,
  isArticleVisibleToRole,
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
  const article = await getArticle(category, slug);

  if (!article || !isArticleVisibleToRole(article.metadata, context.membership.role)) {
    notFound();
  }

  const related = (await getAllArticles())
    .filter((candidate) => article.metadata.relatedArticles.includes(candidate.slug))
    .filter((candidate) => isArticleVisibleToRole(candidate, context.membership.role));

  return (
    <div className="space-y-8">
      <PageHeader
        title={article.metadata.title}
        description={article.metadata.description}
        breadcrumb={
          <div className="flex items-center gap-2">
            <Link href={`/help?communityId=${context.communityId}`} className="hover:text-content">
              Help Center
            </Link>
            <span>/</span>
            <span className="capitalize">{article.metadata.category.replace(/-/g, ' ')}</span>
          </div>
        }
      />

      <article className="rounded-2xl border border-edge bg-surface-card p-6 shadow-sm">
        {article.content}
      </article>

      {related.length > 0 && (
        <section className="space-y-4">
          <h2 className="text-xl font-semibold text-content">Related guides</h2>
          <div className="grid gap-4 lg:grid-cols-2">
            {related.map((candidate) => (
              <Link
                key={candidate.slug}
                href={`/help/${candidate.category}/${candidate.slug}?communityId=${context.communityId}`}
                className="rounded-2xl border border-edge bg-surface-card p-5 shadow-sm transition-colors hover:border-edge-strong hover:bg-surface-hover"
              >
                <h3 className="text-base font-semibold text-content">{candidate.title}</h3>
                <p className="mt-2 text-sm leading-6 text-content-secondary">
                  {candidate.description}
                </p>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
