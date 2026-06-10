'use client';

/**
 * <HelpDocsModalSearchPanel/> — browse/search view inside HelpDocsModal.
 * Shown when the user is searching (header input, query ≥ 2 chars) or when
 * no contextual article matches the route. Three sections:
 *   1. Search results — articles AND community FAQs (the API returns both;
 *      the old panel silently dropped faqs).
 *   2. "Help for this page" — ALL contextual matches with read checkmarks.
 *   3. Featured-for-role fallback when neither applies.
 * Query state lives in the modal header; this panel is presentational.
 */
import Link from 'next/link';
import { useState } from 'react';
import { Check } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { useHelpSearch, useFeaturedArticles, type HelpArticleResult } from '@/hooks/use-help';
import { getHelpCategoryMeta } from '@/lib/help/category-meta';
import { cn } from '@/lib/utils';

const INITIAL_CONTEXTUAL_SHOWN = 4;

interface HelpDocsModalSearchPanelProps {
  communityId: number;
  query: string;
  contextualArticles: Array<{ category: string; slug: string; title: string; description: string }>;
  readSlugs: Set<string> | null;
  onPickArticle: (category: string, slug: string) => void;
}

function ArticleRow({
  article,
  read,
  onPick,
}: {
  article: Pick<HelpArticleResult, 'category' | 'slug' | 'title' | 'description'>;
  read: boolean;
  onPick: (category: string, slug: string) => void;
}) {
  const meta = getHelpCategoryMeta(article.category);
  const Icon = meta.icon;
  return (
    <button
      type="button"
      onClick={() => onPick(article.category, article.slug)}
      className={cn(
        'flex w-full items-start gap-3 rounded-[var(--radius-sm)] px-3 py-2.5 text-left transition-colors hover:bg-surface-muted',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus',
      )}
    >
      <Icon size={15} className="mt-0.5 shrink-0 text-content-tertiary" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-content">{article.title}</p>
        <p className="mt-0.5 text-sm text-content-secondary line-clamp-1">{article.description}</p>
      </div>
      {read && (
        <Check size={14} className="mt-1 shrink-0 text-status-success" aria-label="Read" />
      )}
    </button>
  );
}

export function HelpDocsModalSearchPanel({
  communityId,
  query,
  contextualArticles,
  readSlugs,
  onPickArticle,
}: HelpDocsModalSearchPanelProps) {
  const [showAllContextual, setShowAllContextual] = useState(false);
  const { data: searchResults, isFetching } = useHelpSearch(query, communityId);
  const { data: featured = [] } = useFeaturedArticles(communityId);
  const isSearching = query.trim().length >= 2;

  const visibleContextual = showAllContextual
    ? contextualArticles
    : contextualArticles.slice(0, INITIAL_CONTEXTUAL_SHOWN);
  const hiddenContextualCount = contextualArticles.length - visibleContextual.length;

  return (
    <div className="space-y-6">
      {isSearching && isFetching && (
        <div className="space-y-2" aria-label="Searching">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      )}

      {isSearching && !isFetching && searchResults && (
        <>
          <section>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-content-tertiary">
              Articles
            </h3>
            {searchResults.articles.length === 0 ? (
              <p className="text-sm text-content-tertiary">No articles match "{query}".</p>
            ) : (
              <div className="space-y-1">
                {searchResults.articles.map((article) => (
                  <ArticleRow
                    key={`${article.category}/${article.slug}`}
                    article={article}
                    read={readSlugs?.has(article.slug) ?? false}
                    onPick={onPickArticle}
                  />
                ))}
              </div>
            )}
          </section>

          {searchResults.faqs.length > 0 && (
            <section>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-content-tertiary">
                From your community's FAQ
              </h3>
              <div className="space-y-2">
                {searchResults.faqs.map((faq) => (
                  <details
                    key={faq.id}
                    className="rounded-[var(--radius-md)] border border-edge px-3 py-2.5"
                  >
                    <summary className="cursor-pointer list-none text-sm font-medium text-content [&::-webkit-details-marker]:hidden">
                      {faq.question}
                    </summary>
                    <p className="mt-2 text-sm leading-6 text-content-secondary">{faq.answer}</p>
                  </details>
                ))}
              </div>
            </section>
          )}

          {searchResults.articles.length === 0 && searchResults.faqs.length === 0 && (
            <div className="rounded-[var(--radius-md)] border border-edge bg-surface-card p-6 text-center">
              <p className="text-sm text-content-secondary">
                Nothing matches "{query}" yet — try different words, or reach out.
              </p>
              <Link
                href={`/help/contact?communityId=${communityId}`}
                className="mt-2 inline-block text-sm font-medium text-[var(--interactive-primary)] hover:underline"
              >
                Contact support →
              </Link>
            </div>
          )}
        </>
      )}

      {!isSearching && contextualArticles.length > 0 && (
        <section>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-content-tertiary">
            Help for this page · {contextualArticles.length}{' '}
            {contextualArticles.length === 1 ? 'article' : 'articles'}
          </h3>
          <div className="space-y-1">
            {visibleContextual.map((article) => (
              <ArticleRow
                key={`${article.category}/${article.slug}`}
                article={article}
                read={readSlugs?.has(article.slug) ?? false}
                onPick={onPickArticle}
              />
            ))}
          </div>
          {hiddenContextualCount > 0 && (
            <button
              type="button"
              onClick={() => setShowAllContextual(true)}
              className="mt-2 text-sm font-medium text-[var(--interactive-primary)] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
            >
              Show {hiddenContextualCount} more
            </button>
          )}
        </section>
      )}

      {!isSearching && contextualArticles.length === 0 && featured.length > 0 && (
        <section>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-content-tertiary">
            Featured for you
          </h3>
          <div className="space-y-1">
            {featured.map((article) => (
              <ArticleRow
                key={`${article.category}/${article.slug}`}
                article={article}
                read={readSlugs?.has(article.slug) ?? false}
                onPick={onPickArticle}
              />
            ))}
          </div>
        </section>
      )}

      {!isSearching && contextualArticles.length === 0 && featured.length === 0 && (
        <div className="rounded-[var(--radius-md)] border border-edge bg-surface-card p-6 text-center">
          <p className="text-sm text-content-secondary">
            Help articles for your role haven't been written yet.
          </p>
          <Link
            href={`/help/contact?communityId=${communityId}`}
            className="mt-2 inline-block text-sm font-medium text-[var(--interactive-primary)] hover:underline"
          >
            Contact support →
          </Link>
        </div>
      )}
    </div>
  );
}
