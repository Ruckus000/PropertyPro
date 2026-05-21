'use client';

/**
 * <HelpDocsModalSearchPanel/> — empty-state panel shown inside HelpDocsModal
 * when there is no contextual article for the current route. Lets the user
 * search across all articles + browse featured-for-role suggestions.
 *
 * Clicking a result calls onPickArticle(category, slug), which the modal
 * uses to switch its content via openArticle() — no navigation.
 */
import Link from 'next/link';
import { useState } from 'react';
import { BookOpen, Search } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { useHelpSearch, useFeaturedArticles } from '@/hooks/use-help';
import { cn } from '@/lib/utils';

interface HelpDocsModalSearchPanelProps {
  communityId: number;
  onPickArticle: (category: string, slug: string) => void;
}

export function HelpDocsModalSearchPanel({
  communityId,
  onPickArticle,
}: HelpDocsModalSearchPanelProps) {
  const [query, setQuery] = useState('');
  const { data: searchResults, isFetching } = useHelpSearch(query, communityId);
  const { data: featured = [] } = useFeaturedArticles(communityId);
  const isSearching = query.length >= 2;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-content">Browse help articles</h2>
        <p className="mt-1 text-sm text-content-secondary">
          We don't have a guide tailored to this page yet — search or pick a featured guide below.
        </p>
      </div>

      <div className="relative">
        <Search
          size={16}
          aria-hidden="true"
          className="absolute left-3 top-1/2 -translate-y-1/2 text-content-tertiary"
        />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search help articles..."
          className="h-10 w-full rounded-[var(--radius-sm)] border border-edge bg-surface-card pl-9 pr-3 text-base text-content placeholder:text-content-placeholder focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
          aria-label="Search help articles"
        />
      </div>

      {!isSearching && featured.length === 0 && (
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

      {isSearching && isFetching && (
        <div className="space-y-2" aria-label="Searching">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      )}

      {isSearching && !isFetching && searchResults && (
        <div className="space-y-1">
          {searchResults.articles.length === 0 ? (
            <p className="text-sm text-content-tertiary">No results for "{query}".</p>
          ) : (
            searchResults.articles.map((article) => (
              <button
                key={`${article.category}/${article.slug}`}
                type="button"
                onClick={() => onPickArticle(article.category, article.slug)}
                className={cn(
                  'flex w-full items-start gap-3 rounded-[var(--radius-sm)] px-3 py-2.5 text-left transition-colors hover:bg-surface-muted',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus',
                )}
              >
                <BookOpen size={14} className="mt-0.5 shrink-0 text-content-disabled" aria-hidden="true" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-content">{article.title}</p>
                  <p className="mt-0.5 text-xs text-content-tertiary line-clamp-1">
                    {article.description}
                  </p>
                </div>
              </button>
            ))
          )}
        </div>
      )}

      {!isSearching && featured.length > 0 && (
        <section>
          <h3 className="mb-3 text-sm font-semibold text-content">Featured for you</h3>
          <div className="space-y-1">
            {featured.map((article) => (
              <button
                key={`${article.category}/${article.slug}`}
                type="button"
                onClick={() => onPickArticle(article.category, article.slug)}
                className={cn(
                  'flex w-full items-start gap-3 rounded-[var(--radius-sm)] px-3 py-2.5 text-left transition-colors hover:bg-surface-muted',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus',
                )}
                aria-label={article.title}
              >
                <BookOpen size={14} className="mt-0.5 shrink-0 text-content-disabled" aria-hidden="true" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-content">{article.title}</p>
                  <p className="mt-0.5 text-xs text-content-tertiary line-clamp-1">
                    {article.description}
                  </p>
                </div>
              </button>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
