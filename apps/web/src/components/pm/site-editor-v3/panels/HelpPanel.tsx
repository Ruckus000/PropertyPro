'use client';

/**
 * The "Help" tool panel — the editor's only help affordance.
 *
 * The `(site-editor)` route group renders none of the app shell's help chrome:
 * no `PageHeaderHelpButton`, no help widget. So unlike everywhere else in the
 * app, if this tab does not answer a manager's question, nothing else in the
 * editor will.
 *
 * ## It surfaces the existing help centre — it is not a second one
 *
 * Everything here comes from `/api/v1/help/*` and the MDX corpus, through the
 * same `useContextualHelp` / `useHelpSearch` hooks the help modal uses. The
 * implementation plan's integration criteria call this out explicitly ("no
 * parallel help system"), and it is also just correct: help content is written
 * and reviewed in one place, and an article tagged for this route shows up here
 * without anyone touching this file.
 *
 * Resting state mirrors `HelpDocsModalSearchPanel`: contextual articles for this
 * route, falling back to the role's featured list when nothing is tagged for it,
 * so the panel is never empty on arrival.
 *
 * ## Why every link opens in a new tab
 *
 * This is a full-bleed editor. Following a link in-place would tear down the
 * canvas, the inspector's open form and the tool panel's state to read a page
 * the manager wants to read *alongside* their work. The editor autosaves, so
 * nothing is lost — but the context is, and that is the point of the tab.
 */

import { useState } from 'react';
import { ExternalLink, Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { AlertBanner } from '@/components/shared/alert-banner';
import { EmptyState } from '@/components/shared/empty-state';
import {
  useContextualHelp,
  useFeaturedArticles,
  useHelpSearch,
  type HelpArticleResult,
  type HelpFaqResult,
} from '@/hooks/use-help';

export interface HelpPanelProps {
  communityId: number;
}

/**
 * The route these articles are contextual to.
 *
 * A literal, not `usePathname()`: `matchContextPath` compares segment counts
 * exactly, so a stray trailing segment or a future nested editor route would
 * silently match nothing. The articles are about the editor, not about whatever
 * URL it happens to be mounted at.
 */
const EDITOR_HELP_PATH = '/pm/website-editor';

/** Search needs 2+ characters — below that `useHelpSearch` stays disabled. */
const MIN_QUERY_LENGTH = 2;

function ArticleRow({ article }: { article: HelpArticleResult }) {
  return (
    <li>
      <a
        href={`/help/${article.category}/${article.slug}`}
        target="_blank"
        rel="noopener noreferrer"
        className="group flex flex-col gap-1 rounded-[var(--radius-md)] border border-edge p-3 transition-colors duration-quick hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
      >
        <span className="flex items-start justify-between gap-2">
          <span className="text-sm font-medium text-content">{article.title}</span>
          <ExternalLink
            className="mt-0.5 h-3.5 w-3.5 shrink-0 text-content-tertiary"
            aria-hidden="true"
          />
        </span>
        {article.description ? (
          <span className="text-sm text-content-secondary">{article.description}</span>
        ) : null}
        {article.readTimeMinutes ? (
          <span className="text-xs text-content-tertiary">
            {article.readTimeMinutes} min read
          </span>
        ) : null}
      </a>
    </li>
  );
}

function FaqRow({ faq }: { faq: HelpFaqResult }) {
  return (
    <li className="rounded-[var(--radius-md)] border border-edge p-3">
      <p className="text-sm font-medium text-content">{faq.question}</p>
      <p className="mt-1 text-sm text-content-secondary">{faq.answer}</p>
    </li>
  );
}

function ResultsSkeleton() {
  return (
    <div className="space-y-2" data-testid="help-panel-loading">
      <Skeleton className="h-16 w-full" />
      <Skeleton className="h-16 w-full" />
      <Skeleton className="h-16 w-full" />
    </div>
  );
}

export function HelpPanel({ communityId }: HelpPanelProps) {
  const [query, setQuery] = useState('');
  const trimmed = query.trim();
  const isSearching = trimmed.length >= MIN_QUERY_LENGTH;

  const contextual = useContextualHelp(EDITOR_HELP_PATH, communityId, {
    enabled: !isSearching,
  });
  // Fires alongside the contextual query rather than after it: the hook takes
  // no `enabled`, and widening a shared help hook to save one cached GET on a
  // tab most managers open once is not the trade. Both responses cache for 5
  // minutes, and only one of the two lists is ever rendered.
  const featured = useFeaturedArticles(communityId);
  const search = useHelpSearch(trimmed, communityId);

  const contextualArticles = contextual.data ?? [];
  const restingArticles =
    contextualArticles.length > 0 ? contextualArticles : (featured.data ?? []);
  const restingIsPending =
    contextual.isPending || (contextualArticles.length === 0 && featured.isPending);

  return (
    <div className="space-y-4" data-testid="tool-panel-help">
      <div className="space-y-2">
        <Label htmlFor="help-panel-search">Search help</Label>
        <div className="relative">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-content-tertiary"
            aria-hidden="true"
          />
          <Input
            id="help-panel-search"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Publishing, colours, domains…"
            className="pl-9"
          />
        </div>
      </div>

      {isSearching ? (
        <section aria-label="Search results" className="space-y-3">
          {search.isPending ? <ResultsSkeleton /> : null}

          {search.isError ? (
            <AlertBanner
              status="danger"
              title="We couldn't run that search."
              description={search.error.message}
            />
          ) : null}

          {search.data ? (
            search.data.articles.length === 0 && search.data.faqs.length === 0 ? (
              <EmptyState
                size="sm"
                // The lucide component, not an icon key — `EmptyStateIconKey`
                // has no `search` entry, and inventing one for a single caller
                // would widen a shared union for no reason.
                icon={Search}
                title="Nothing matched that"
                description="Try a different word, or browse the full help centre below."
              />
            ) : (
              <>
                {search.data.articles.length > 0 ? (
                  <ul className="space-y-2" data-testid="help-panel-article-results">
                    {search.data.articles.map((article) => (
                      <ArticleRow key={`${article.category}/${article.slug}`} article={article} />
                    ))}
                  </ul>
                ) : null}

                {search.data.faqs.length > 0 ? (
                  <div className="space-y-2">
                    <h3 className="text-sm font-semibold text-content">
                      From your community&rsquo;s FAQs
                    </h3>
                    <ul className="space-y-2" data-testid="help-panel-faq-results">
                      {search.data.faqs.map((faq) => (
                        <FaqRow key={faq.id} faq={faq} />
                      ))}
                    </ul>
                  </div>
                ) : null}
              </>
            )
          ) : null}
        </section>
      ) : (
        <section aria-label="Suggested help" className="space-y-3">
          <h3 className="text-sm font-semibold text-content">
            {contextualArticles.length > 0 ? 'About your website' : 'Popular with managers'}
          </h3>

          {restingIsPending ? <ResultsSkeleton /> : null}

          {/*
            A failed contextual fetch is not worth an error banner: the search
            box above still works and the help centre link below still works, so
            the panel is not broken — it just has no suggestions. `retry: false`
            on that query means this is a single quiet failure, not a spinner.
          */}
          {!restingIsPending && restingArticles.length === 0 ? (
            <p className="text-sm text-content-secondary">
              No suggestions right now. Search above, or open the help centre.
            </p>
          ) : null}

          {restingArticles.length > 0 ? (
            <ul className="space-y-2" data-testid="help-panel-suggested">
              {restingArticles.map((article) => (
                <ArticleRow key={`${article.category}/${article.slug}`} article={article} />
              ))}
            </ul>
          ) : null}
        </section>
      )}

      <div className="border-t border-edge pt-4">
        <a
          href="/help"
          target="_blank"
          rel="noopener noreferrer"
          data-testid="help-panel-hub-link"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-content-link hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
        >
          Open the full help centre
          <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
        </a>
      </div>
    </div>
  );
}
