import { notFound } from 'next/navigation';
import Link from 'next/link';
import { Clock } from 'lucide-react';
import { getFeaturesForCommunity } from '@propertypro/shared';
import { requirePageCommunityMembership as requireCommunityMembership } from '@/lib/request/page-community-context';
import {
  filterArticlesByFeatures,
  getCategoryTree,
} from '@/lib/services/help-article-service';
import { HelpSearchInput } from '@/components/help/help-search-input';
import { PageHeader } from '@/components/shared/page-header';
import { Breadcrumbs } from '@/components/shared/breadcrumbs';

interface CategoryPageProps {
  params: Promise<{ category: string }>;
}

export default async function HelpCategoryPage({ params }: CategoryPageProps) {
  const { category } = await params;
  const membership = await requireCommunityMembership();
  const effectiveRole = membership.presetKey ?? membership.role;

  const categoryTree = getCategoryTree();
  const allArticles = categoryTree[category];

  if (!allArticles || allArticles.length === 0) {
    notFound();
  }

  // Filter out articles whose featureGates don't match this community type
  // (e.g. apartment-only articles for a condo). If every article in the
  // category is gated out for this community, treat the category as missing.
  const features = getFeaturesForCommunity(membership.communityType);
  const articles = filterArticlesByFeatures(allArticles, features);

  if (articles.length === 0) {
    notFound();
  }

  // Sort: role-matched first, then alphabetical
  const sorted = [...articles].sort((a, b) => {
    const aIsRelevant = a.roles.length === 0 || a.roles.includes(effectiveRole);
    const bIsRelevant = b.roles.length === 0 || b.roles.includes(effectiveRole);
    if (aIsRelevant !== bIsRelevant) return aIsRelevant ? -1 : 1;
    return a.title.localeCompare(b.title);
  });

  const categoryLabel = category
    .replace(/-/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 lg:px-6">
      <PageHeader
        title={categoryLabel}
        breadcrumb={
          <Breadcrumbs
            items={[{ label: 'Help Center', href: `/help?communityId=${membership.communityId}` }]}
            currentLabel={categoryLabel}
          />
        }
        description={`${sorted.length} ${sorted.length === 1 ? 'article' : 'articles'}`}
      />

      <HelpSearchInput className="mt-6" />

      <div className="mt-6 space-y-3">
        {sorted.map((article) => (
          <Link
            key={article.slug}
            href={`/help/${article.category}/${article.slug}`}
            className="group block rounded-[var(--radius-md)] border border-edge bg-surface-card p-4 transition-colors hover:bg-surface-muted"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-content group-hover:text-[var(--interactive-primary)]">
                  {article.title}
                </p>
                <p className="mt-1 text-xs text-content-tertiary line-clamp-2">
                  {article.description}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1 text-xs text-content-disabled">
                <Clock size={12} aria-hidden="true" />
                <span>{article.readTimeMinutes} min</span>
              </div>
            </div>
            {article.roles.length > 0 && (
              <div className="mt-2 flex gap-1.5">
                {article.roles.slice(0, 3).map((r) => (
                  <span key={r} className="rounded-full bg-surface-muted px-2 py-0.5 text-[10px] text-content-tertiary capitalize">
                    {r.replace(/_/g, ' ')}
                  </span>
                ))}
              </div>
            )}
          </Link>
        ))}
      </div>
    </div>
  );
}
