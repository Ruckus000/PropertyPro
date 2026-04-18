import Link from 'next/link';
import { ChevronRight, Clock, FileText, MessageCircleQuestion } from 'lucide-react';
import { requirePageCommunityMembership as requireCommunityMembership } from '@/lib/request/page-community-context';
import { getAllArticles, searchArticles } from '@/lib/services/help-article-service';
import { createScopedClient, faqs } from '@propertypro/db';
import { ensureFaqsExist } from '@/lib/services/faq-service';
import { HelpSearchInput } from '@/components/help/help-search-input';

interface SearchPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function HelpSearchPage({ searchParams }: SearchPageProps) {
  const resolved = await searchParams;
  const query = typeof resolved.q === 'string' ? resolved.q.trim() : '';
  const membership = await requireCommunityMembership();
  const communityId = membership.communityId;

  let articleResults: { title: string; description: string; category: string; slug: string; readTimeMinutes: number }[] = [];
  let faqResults: { id: number; question: string; answer: string }[] = [];

  if (query.length >= 2) {
    // Search platform articles
    const allArticles = getAllArticles();
    articleResults = searchArticles(allArticles, query);

    // Search community FAQs
    await ensureFaqsExist(communityId);
    const scoped = createScopedClient(communityId);
    const faqRows = await scoped.query(faqs);
    const qLower = query.toLowerCase();
    faqResults = faqRows
      .filter((f) => {
        const question = (f['question'] as string).toLowerCase();
        const answer = (f['answer'] as string).toLowerCase();
        return question.includes(qLower) || answer.includes(qLower);
      })
      .slice(0, 10)
      .map((f) => ({
        id: f['id'] as number,
        question: f['question'] as string,
        answer: f['answer'] as string,
      }));
  }

  const hasResults = articleResults.length > 0 || faqResults.length > 0;

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 lg:px-6">
      <nav aria-label="Breadcrumb" className="mb-6 flex items-center gap-1.5 text-sm text-content-tertiary">
        <Link href="/help" className="hover:text-content-secondary transition-colors">Help</Link>
        <ChevronRight size={14} aria-hidden="true" />
        <span className="text-content-secondary">Search</span>
      </nav>

      <HelpSearchInput defaultValue={query} autoFocus />

      {query.length >= 2 && !hasResults && (
        <div className="mt-12 text-center">
          <p className="text-sm text-content-secondary">
            No results found for &ldquo;{query}&rdquo;
          </p>
          <p className="mt-1 text-xs text-content-tertiary">
            Try different keywords or <Link href="/help" className="text-[var(--interactive-primary)] hover:underline">browse all categories</Link>.
          </p>
        </div>
      )}

      {articleResults.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-content-tertiary">
            <FileText size={14} aria-hidden="true" />
            Platform Guides ({articleResults.length})
          </h2>
          <div className="space-y-3">
            {articleResults.map((article) => (
              <Link
                key={article.slug}
                href={`/help/${article.category}/${article.slug}`}
                className="group block rounded-[var(--radius-md)] border border-edge bg-surface-card p-4 transition-colors hover:bg-surface-muted"
              >
                <p className="text-sm font-medium text-content group-hover:text-[var(--interactive-primary)]">
                  {article.title}
                </p>
                <p className="mt-1 text-xs text-content-tertiary line-clamp-2">
                  {article.description}
                </p>
                <div className="mt-2 flex items-center gap-2 text-xs text-content-disabled">
                  <span className="capitalize">{article.category.replace(/-/g, ' ')}</span>
                  <span aria-hidden="true">&middot;</span>
                  <Clock size={10} aria-hidden="true" />
                  <span>{article.readTimeMinutes} min</span>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {faqResults.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-content-tertiary">
            <MessageCircleQuestion size={14} aria-hidden="true" />
            Community FAQs ({faqResults.length})
          </h2>
          <div className="divide-y divide-edge overflow-hidden rounded-[var(--radius-md)] border border-edge bg-surface-card">
            {faqResults.map((faq) => (
              <details key={faq.id} className="group">
                <summary className="flex cursor-pointer items-center gap-3 px-4 py-3.5 text-sm font-medium text-content hover:bg-surface-muted [&::-webkit-details-marker]:hidden">
                  <ChevronRight size={14} className="shrink-0 text-content-disabled transition-transform group-open:rotate-90" aria-hidden="true" />
                  {faq.question}
                </summary>
                <div className="px-4 pb-4 pl-10 text-sm leading-relaxed text-content-secondary">
                  {faq.answer}
                </div>
              </details>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
