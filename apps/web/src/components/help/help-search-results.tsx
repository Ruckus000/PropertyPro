import Link from 'next/link';
import type { HelpArticleMetadata } from '@/lib/services/help-article-service';
import type { VisibleFaq } from '@/lib/services/faq-service';

interface HelpSearchResultsProps {
  communityId: number;
  query: string;
  articleResults: HelpArticleMetadata[];
  faqResults: VisibleFaq[];
}

function articleHref(article: HelpArticleMetadata, communityId: number) {
  return `/help/${article.category}/${article.slug}?communityId=${communityId}`;
}

export function HelpSearchResults({
  communityId,
  query,
  articleResults,
  faqResults,
}: HelpSearchResultsProps) {
  const hasResults = articleResults.length > 0 || faqResults.length > 0;

  if (!hasResults) {
    return (
      <div className="rounded-2xl border border-dashed border-edge bg-surface-card p-8 text-sm text-content-secondary">
        No help results matched <span className="font-medium text-content">{query}</span>. Try a
        different keyword like documents, payments, maintenance, or meetings.
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <section className="space-y-4">
        <div>
          <h2 className="text-xl font-semibold text-content">Platform Guides</h2>
          <p className="mt-1 text-sm text-content-secondary">
            Guided articles for the most common workflows.
          </p>
        </div>
        {articleResults.length === 0 ? (
          <p className="text-sm text-content-secondary">No guide results for this query.</p>
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            {articleResults.map((article) => (
              <Link
                key={article.slug}
                href={articleHref(article, communityId)}
                className="rounded-2xl border border-edge bg-surface-card p-5 shadow-sm transition-colors hover:border-edge-strong hover:bg-surface-hover"
              >
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-content-tertiary">
                  {article.category.replace(/-/g, ' ')}
                </p>
                <h3 className="mt-2 text-lg font-semibold text-content">{article.title}</h3>
                <p className="mt-2 text-sm leading-6 text-content-secondary">
                  {article.description}
                </p>
              </Link>
            ))}
          </div>
        )}
      </section>

      <section className="space-y-4">
        <div>
          <h2 className="text-xl font-semibold text-content">Community FAQs</h2>
          <p className="mt-1 text-sm text-content-secondary">
            Quick answers currently configured for this community.
          </p>
        </div>
        {faqResults.length === 0 ? (
          <p className="text-sm text-content-secondary">No FAQ results for this query.</p>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-edge bg-surface-card shadow-sm">
            {faqResults.map((faq) => (
              <div key={faq.id} className="border-b border-edge px-5 py-4 last:border-b-0">
                <h3 className="text-sm font-semibold text-content">{faq.question}</h3>
                <p className="mt-2 text-sm leading-6 text-content-secondary">{faq.answer}</p>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
