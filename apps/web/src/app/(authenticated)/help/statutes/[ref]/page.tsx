/**
 * Statute detail page — every article tagged with a given Florida statute
 * or bill reference. Links from the article-detail statute pills (made
 * clickable in WS5) and from /help/statutes index.
 *
 * The [ref] param is URL-decoded automatically by Next.js. We re-encode in
 * outbound links so the §-prefixed references survive a round-trip.
 */
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { Clock } from 'lucide-react';
import { Breadcrumbs } from '@/components/shared/breadcrumbs';
import { PageHeader } from '@/components/shared/page-header';
import { requireHelpPageContext } from '@/lib/help/page-context';
import { resolveHelpViewerRoleFromMembership } from '@/lib/help/viewer-role';
import {
  findArticlesByStatute,
  isArticleVisibleToRole,
} from '@/lib/services/help-article-service';

interface StatuteDetailPageProps {
  params: Promise<{ ref: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function StatuteDetailPage({
  params,
  searchParams,
}: StatuteDetailPageProps) {
  const [{ ref }, resolvedSearchParams] = await Promise.all([
    params,
    searchParams,
  ]);
  const decodedRef = decodeURIComponent(ref);
  const context = await requireHelpPageContext(
    resolvedSearchParams,
    `/help/statutes/${ref}`,
  );
  const effectiveRole = resolveHelpViewerRoleFromMembership(context.membership);

  const allMatches = findArticlesByStatute(decodedRef);
  const articles = allMatches.filter((article) =>
    isArticleVisibleToRole(article, effectiveRole),
  );

  if (articles.length === 0) {
    notFound();
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={decodedRef}
        breadcrumb={
          <Breadcrumbs
            items={[
              {
                label: 'Help Center',
                href: `/help?communityId=${context.communityId}`,
              },
              {
                label: 'Statutes & bills',
                href: `/help/statutes?communityId=${context.communityId}`,
              },
            ]}
            currentLabel={decodedRef}
          />
        }
        description={`${articles.length} ${articles.length === 1 ? 'article' : 'articles'} reference this statute.`}
      />

      <ul className="space-y-3">
        {articles.map((article) => (
          <li key={article.slug}>
            <Link
              href={`/help/${article.category}/${article.slug}?communityId=${context.communityId}`}
              className="group block rounded-2xl border border-edge bg-surface-card p-4 transition-colors hover:border-edge-strong hover:bg-surface-hover"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold uppercase tracking-[0.12em] text-content-tertiary">
                    {article.category.replace(/-/g, ' ')}
                  </p>
                  <p className="mt-1 text-sm font-medium text-content group-hover:text-[var(--interactive-primary)]">
                    {article.title}
                  </p>
                  <p className="mt-1 text-xs leading-5 text-content-tertiary line-clamp-2">
                    {article.description}
                  </p>
                </div>
                {typeof article.readTimeMinutes === 'number' && (
                  <div className="flex shrink-0 items-center gap-1 text-xs text-content-disabled">
                    <Clock size={12} aria-hidden="true" />
                    <span>{article.readTimeMinutes} min</span>
                  </div>
                )}
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
