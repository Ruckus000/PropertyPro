import Link from 'next/link';
import { redirect } from 'next/navigation';
import { cn } from '@/lib/utils';
import {
  HELP_FOCUS,
  HelpBreadcrumb,
  HelpCenterShell,
} from '@/components/help/center/help-center-shell';
import { articleHref } from '@/lib/help/center';
import { loadHelpCenterPage } from '@/lib/help/center-page';
import { getHelpCategoryMeta } from '@/lib/help/category-meta';
import { resolveHelpViewerTokens } from '@/lib/help/viewer-role';
import { ensureFaqsExist, searchCommunityFaqs } from '@/lib/services/faq-service';
import { searchArticles } from '@/lib/services/help-article-service';

interface HelpSearchPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function firstParam(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value) ?? '';
}

export default async function HelpSearchPage({ searchParams }: HelpSearchPageProps) {
  const resolvedSearchParams = await searchParams;
  const page = await loadHelpCenterPage(resolvedSearchParams, '/help/search');
  const { context, reader, articles, copy, href } = page;
  const query = firstParam(resolvedSearchParams.q).trim();

  if (!query) redirect(href('/help'));

  await ensureFaqsExist(context.communityId);
  const results = searchArticles(articles, query);
  const { hits: faqs } = await searchCommunityFaqs(
    context.communityId,
    query,
    resolveHelpViewerTokens(context.membership),
    10,
  );
  const total = results.length + faqs.length;

  return (
    <HelpCenterShell {...page.shell({ currentPath: '/help/search', query })}>
      <HelpBreadcrumb items={[{ label: `Help for ${copy.labelLower}`, href: href('/help') }, { label: 'Search' }]} />
      <h1 className="m-0 text-2xl font-semibold" role="status">
        {total > 0
          ? `${total} result${total === 1 ? '' : 's'} for “${query}”`
          : `No guides match “${query}”`}
      </h1>

      {results.length > 0 ? (
        <div className="flex flex-col overflow-hidden rounded-md border border-edge bg-surface-card">
          {results.map((article, index) => (
            <Link
              key={article.slug}
              href={articleHref(article, context.communityId, reader)}
              className={cn(
                'flex flex-col gap-1 px-5 py-4 text-content no-underline hover:bg-surface-hover',
                index > 0 && 'border-t border-edge-subtle',
                HELP_FOCUS,
              )}
            >
              <span className="text-xs font-semibold text-content-brand">
                {getHelpCategoryMeta(article.category).label}
              </span>
              <span className="text-base font-semibold">{article.title}</span>
              <span className="text-sm leading-[1.5] text-content-secondary">{article.description}</span>
            </Link>
          ))}
        </div>
      ) : null}

      {faqs.length > 0 ? (
        <section aria-labelledby="help-faq-results" className="flex flex-col gap-3">
          <h2 id="help-faq-results" className="m-0 text-lg font-semibold">
            From your community’s FAQs
          </h2>
          <div className="flex flex-col overflow-hidden rounded-md border border-edge bg-surface-card">
            {faqs.map((faq, index) => (
              <details key={faq.id} className={cn('px-5 py-4', index > 0 && 'border-t border-edge-subtle')}>
                <summary className={cn('cursor-pointer rounded-sm text-base font-semibold', HELP_FOCUS)}>
                  {faq.question}
                </summary>
                <p className="m-0 mt-2 whitespace-pre-line text-sm leading-[1.5] text-content-secondary">
                  {faq.answer}
                </p>
              </details>
            ))}
          </div>
        </section>
      ) : null}

      {total === 0 ? (
        <div className="flex flex-col gap-2 rounded-md border border-edge bg-surface-card p-5">
          <p className="m-0 text-base text-content-secondary">
            Try a different word, such as {copy.noResultsSuggestion}. Your community’s FAQs are searched too.
          </p>
          <Link
            href={`/help/contact?communityId=${context.communityId}`}
            className={cn('text-sm font-semibold text-content-link no-underline hover:underline', HELP_FOCUS)}
          >
            Contact support
          </Link>
        </div>
      ) : null}
    </HelpCenterShell>
  );
}
