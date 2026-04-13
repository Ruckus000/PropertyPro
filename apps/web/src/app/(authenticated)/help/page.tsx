import Link from 'next/link';
import { ChevronRight, BookOpen } from 'lucide-react';
import { requirePageCommunityMembership as requireCommunityMembership } from '@/lib/request/page-community-context';
import { createScopedClient, faqs } from '@propertypro/db';
import { ensureFaqsExist } from '@/lib/services/faq-service';
import {
  getFeaturedForRole,
  getCategoryTree,
} from '@/lib/services/help-article-service';
import { HelpSearchInput } from '@/components/help/help-search-input';
import { PageHeader } from '@/components/shared/page-header';

export default async function HelpHubPage() {
  const membership = await requireCommunityMembership();
  const communityId = membership.communityId;
  const effectiveRole = membership.presetKey ?? membership.role;

  // Fetch featured articles and category tree
  const featured = getFeaturedForRole(effectiveRole);
  const categoryTree = getCategoryTree();
  const categories = Object.entries(categoryTree);

  // Fetch community FAQs
  await ensureFaqsExist(communityId);
  const scoped = createScopedClient(communityId);
  const faqRows = await scoped.query(faqs);
  const sortedFaqs = [...faqRows].sort(
    (a, b) => ((a['sortOrder'] as number) ?? 0) - ((b['sortOrder'] as number) ?? 0),
  );

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 lg:px-6">
      <PageHeader title="Help Center" description="Guides, FAQs, and support" />

      {/* Search */}
      <HelpSearchInput className="mt-6" placeholder={
        membership.isAdmin
          ? 'Search compliance guides, admin tools...'
          : 'Search help articles...'
      } />

      {/* Featured quick links */}
      {featured.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-content-tertiary">
            Quick Links
          </h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {featured.map((article) => (
              <Link
                key={article.slug}
                href={`/help/${article.category}/${article.slug}`}
                className="group flex items-start gap-3 rounded-[var(--radius-md)] border border-edge bg-surface-card p-4 transition-colors hover:bg-surface-muted"
              >
                <BookOpen size={18} className="mt-0.5 shrink-0 text-[var(--interactive-primary)]" aria-hidden="true" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-content group-hover:text-[var(--interactive-primary)]">
                    {article.title}
                  </p>
                  <p className="mt-1 text-xs text-content-tertiary line-clamp-2">
                    {article.description}
                  </p>
                </div>
                <ChevronRight size={14} className="mt-1 shrink-0 text-content-disabled" aria-hidden="true" />
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Categories */}
      <section className="mt-10">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-content-tertiary">
          Browse by Category
        </h2>
        <div className="grid gap-4 sm:grid-cols-2">
          {categories.map(([category, articles]) => (
            <Link
              key={category}
              href={`/help/${category}`}
              className="group rounded-[var(--radius-md)] border border-edge bg-surface-card p-5 transition-colors hover:bg-surface-muted"
            >
              <h3 className="text-base font-medium capitalize text-content group-hover:text-[var(--interactive-primary)]">
                {category.replace(/-/g, ' ')}
              </h3>
              <p className="mt-1 text-xs text-content-tertiary">
                {articles.length} {articles.length === 1 ? 'article' : 'articles'}
              </p>
            </Link>
          ))}
        </div>
      </section>

      {/* Community FAQs */}
      {sortedFaqs.length > 0 && (
        <section className="mt-10">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-content-tertiary">
              Community FAQs
            </h2>
            {membership.isAdmin && (
              <Link href="/help/manage" className="text-xs text-[var(--interactive-primary)] hover:underline">
                Manage FAQs
              </Link>
            )}
          </div>
          <div className="mt-4 divide-y divide-edge overflow-hidden rounded-[var(--radius-md)] border border-edge bg-surface-card">
            {sortedFaqs.slice(0, 5).map((faq) => (
              <details key={faq['id'] as number} className="group">
                <summary className="flex cursor-pointer items-center gap-3 px-4 py-3.5 text-sm font-medium text-content hover:bg-surface-muted [&::-webkit-details-marker]:hidden">
                  <ChevronRight size={14} className="shrink-0 text-content-disabled transition-transform group-open:rotate-90" aria-hidden="true" />
                  {faq['question'] as string}
                </summary>
                <div className="px-4 pb-4 pl-10 text-sm leading-relaxed text-content-secondary">
                  {faq['answer'] as string}
                </div>
              </details>
            ))}
          </div>
          {sortedFaqs.length > 5 && (
            <p className="mt-3 text-center text-xs text-content-tertiary">
              Showing 5 of {sortedFaqs.length} FAQs.{' '}
              <Link href="/help/manage" className="text-[var(--interactive-primary)] hover:underline">
                View all
              </Link>
            </p>
          )}
        </section>
      )}
    </div>
  );
}
