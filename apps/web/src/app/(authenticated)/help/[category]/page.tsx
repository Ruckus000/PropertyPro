import { notFound } from 'next/navigation';
import Link from 'next/link';
import { ChevronRight, Clock } from 'lucide-react';
import { requirePageCommunityMembership as requireCommunityMembership } from '@/lib/request/page-community-context';
import { getCategoryTree } from '@/lib/services/help-article-service';
import { HelpSearchInput } from '@/components/help/help-search-input';

interface CategoryPageProps {
  params: Promise<{ category: string }>;
}

export default async function HelpCategoryPage({ params }: CategoryPageProps) {
  const { category } = await params;
  const membership = await requireCommunityMembership();
  const effectiveRole = membership.presetKey ?? membership.role;

  const categoryTree = getCategoryTree();
  const articles = categoryTree[category];

  if (!articles || articles.length === 0) {
    notFound();
  }

  // Sort: role-matched first, then alphabetical
  const sorted = [...articles].sort((a, b) => {
    const aMatch = a.roles.length === 0 || a.roles.includes(effectiveRole) ? 0 : 1;
    const bMatch = b.roles.length === 0 || b.roles.includes(effectiveRole) ? 0 : 1;
    if (aMatch !== bMatch) return aMatch - bMatch;
    return a.title.localeCompare(b.title);
  });

  const categoryLabel = category.replace(/-/g, ' ');

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 lg:px-6">
      {/* Breadcrumb */}
      <nav aria-label="Breadcrumb" className="mb-6 flex items-center gap-1.5 text-sm text-content-tertiary">
        <Link href="/help" className="hover:text-content-secondary transition-colors">
          Help
        </Link>
        <ChevronRight size={14} aria-hidden="true" />
        <span className="capitalize text-content-secondary">{categoryLabel}</span>
      </nav>

      <h1 className="text-2xl font-semibold capitalize text-content">
        {categoryLabel}
      </h1>
      <p className="mt-1 text-sm text-content-tertiary">
        {sorted.length} {sorted.length === 1 ? 'article' : 'articles'}
      </p>

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
