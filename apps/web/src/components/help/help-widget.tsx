'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { X, Search, BookOpen, ChevronRight, ExternalLink } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useHelpWidget } from './help-widget-provider';
import { useHelpSearch, useContextualHelp, type HelpArticleResult } from '@/hooks/use-help';

interface HelpWidgetProps {
  communityId: number;
}

function ArticleLink({ article }: { article: HelpArticleResult }) {
  const { close } = useHelpWidget();
  return (
    <Link
      href={`/help/${article.category}/${article.slug}`}
      onClick={close}
      className="flex items-start gap-3 rounded-[var(--radius-sm)] px-3 py-2.5 transition-colors hover:bg-surface-muted"
    >
      <BookOpen size={14} className="mt-0.5 shrink-0 text-content-disabled" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-content">{article.title}</p>
        <p className="mt-0.5 text-xs text-content-tertiary line-clamp-1">{article.description}</p>
      </div>
      <ChevronRight size={12} className="mt-1 shrink-0 text-content-disabled" aria-hidden="true" />
    </Link>
  );
}

export function HelpWidget({ communityId }: HelpWidgetProps) {
  const { isOpen, close } = useHelpWidget();
  const pathname = usePathname();
  const [searchQuery, setSearchQuery] = useState('');

  const { data: searchResults } = useHelpSearch(searchQuery, communityId);
  const { data: contextualArticles } = useContextualHelp(pathname, communityId);

  const isSearching = searchQuery.length >= 2;
  const hasSearchResults = searchResults && (searchResults.articles.length > 0 || searchResults.faqs.length > 0);

  return (
    <>
      {/* Backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 z-[60] bg-black/20 backdrop-blur-sm lg:hidden"
          onClick={close}
          aria-hidden="true"
        />
      )}

      {/* Drawer */}
      <aside
        className={cn(
          'fixed right-0 top-0 z-[70] flex h-full w-full max-w-md flex-col border-l border-edge bg-surface-page shadow-xl transition-transform duration-200',
          isOpen ? 'translate-x-0' : 'translate-x-full',
        )}
        aria-label="Help panel"
        aria-hidden={!isOpen}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-edge px-4 py-3">
          <h2 className="text-sm font-semibold text-content">Help</h2>
          <button
            type="button"
            onClick={close}
            className="flex size-8 items-center justify-center rounded-[var(--radius-sm)] text-content-tertiary transition-colors hover:bg-surface-muted hover:text-content focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
            aria-label="Close help panel"
          >
            <X size={16} />
          </button>
        </div>

        {/* Search */}
        <div className="border-b border-edge-subtle px-4 py-3">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-content-disabled" aria-hidden="true" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search help..."
              className="w-full rounded-[var(--radius-sm)] border border-edge bg-surface-card py-2 pl-9 pr-3 text-sm text-content placeholder:text-content-placeholder focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
            />
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-4 py-4">
          {/* Search results */}
          {isSearching && hasSearchResults && searchResults && (
            <div className="space-y-4">
              {searchResults.articles.length > 0 && (
                <section>
                  <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-content-tertiary">Guides</h3>
                  <div className="space-y-0.5">
                    {searchResults.articles.map((a) => (
                      <ArticleLink key={a.slug} article={a} />
                    ))}
                  </div>
                </section>
              )}
              {searchResults.faqs.length > 0 && (
                <section>
                  <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-content-tertiary">FAQs</h3>
                  <div className="space-y-1">
                    {searchResults.faqs.map((faq) => (
                      <details key={faq.id} className="group rounded-[var(--radius-sm)] hover:bg-surface-muted">
                        <summary className="flex cursor-pointer items-center gap-2 px-3 py-2 text-sm font-medium text-content [&::-webkit-details-marker]:hidden">
                          <ChevronRight size={12} className="shrink-0 text-content-disabled transition-transform group-open:rotate-90" aria-hidden="true" />
                          {faq.question}
                        </summary>
                        <div className="px-3 pb-2 pl-7 text-xs leading-relaxed text-content-secondary">
                          {faq.answer}
                        </div>
                      </details>
                    ))}
                  </div>
                </section>
              )}
            </div>
          )}

          {isSearching && !hasSearchResults && (
            <p className="py-8 text-center text-sm text-content-tertiary">
              No results for &ldquo;{searchQuery}&rdquo;
            </p>
          )}

          {/* Contextual suggestions (shown when not searching) */}
          {!isSearching && contextualArticles && contextualArticles.length > 0 && (
            <section>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-content-tertiary">
                Relevant to this page
              </h3>
              <div className="space-y-0.5">
                {contextualArticles.map((a) => (
                  <ArticleLink key={a.slug} article={a} />
                ))}
              </div>
            </section>
          )}

          {!isSearching && (!contextualArticles || contextualArticles.length === 0) && (
            <div className="py-8 text-center">
              <p className="text-sm text-content-secondary">
                Search for help or browse the full help center.
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-edge px-4 py-3">
          <Link
            href="/help"
            onClick={close}
            className="flex items-center justify-center gap-2 rounded-[var(--radius-md)] bg-surface-muted px-4 py-2.5 text-sm font-medium text-content transition-colors hover:bg-surface-hover"
          >
            <ExternalLink size={14} aria-hidden="true" />
            Visit Help Center
          </Link>
        </div>
      </aside>
    </>
  );
}
