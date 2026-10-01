import Link from 'next/link';
import { Search } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  HELP_FOCUS,
  HelpCenterShell,
  HelpSearchHiddenFields,
} from '@/components/help/center/help-center-shell';
import { articleHref, guideCount } from '@/lib/help/center';
import { loadHelpCenterPage } from '@/lib/help/center-page';
import { getHelpCategoryMeta } from '@/lib/help/category-meta';
import { getFeaturedForReader } from '@/lib/services/help-article-service';

interface HelpHomePageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

const TOPIC_PREVIEW = 4;

export default async function HelpHomePage({ searchParams }: HelpHomePageProps) {
  const page = await loadHelpCenterPage(await searchParams, '/help');
  const { context, reader, topics, copy, href } = page;
  const shell = page.shell({ currentPath: '/help', showHeaderSearch: false });
  const popular = getFeaturedForReader(reader, 6);

  return (
    <HelpCenterShell {...shell}>
      <section className="flex flex-col gap-4 rounded-lg border border-edge bg-gradient-to-b from-interactive-subtle to-surface-card p-8">
        <span className="text-xs font-semibold uppercase tracking-[0.08em] text-content-brand">{copy.who}</span>
        <h1 className="m-0 text-balance text-3xl font-semibold leading-[1.15]">{copy.heroTitle}</h1>
        <p className="m-0 max-w-[38rem] text-pretty text-base leading-[1.55] text-content-secondary">{copy.blurb}</p>
        <form role="search" action="/help/search" method="get" className="relative flex max-w-[36rem] items-center">
          <Search size={18} className="pointer-events-none absolute left-4 text-content-tertiary" aria-hidden="true" />
          <input
            type="search"
            name="q"
            aria-label="Search help"
            placeholder={copy.searchPlaceholder}
            className={cn(
              'h-12 w-full rounded-md border border-edge-strong bg-surface-card pl-11 pr-4 text-base text-content placeholder:text-content-placeholder',
              HELP_FOCUS,
            )}
          />
          <HelpSearchHiddenFields scope={shell.searchScope} />
        </form>
      </section>

      {popular.length > 0 ? (
        <section aria-labelledby="help-popular" className="flex flex-col gap-3">
          <h2 id="help-popular" className="m-0 text-lg font-semibold">
            Most-used guides
          </h2>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-3">
            {popular.map((article) => (
              <Link
                key={article.slug}
                href={articleHref(article, context.communityId, reader)}
                className={cn(
                  'flex flex-col gap-[0.375rem] rounded-md border border-edge bg-surface-card p-4 text-content no-underline hover:shadow-e1',
                  HELP_FOCUS,
                )}
              >
                <span className="text-xs font-semibold text-content-brand">
                  {getHelpCategoryMeta(article.category).label}
                </span>
                <span className="text-base font-semibold leading-[1.35]">{article.title}</span>
                <span className="text-sm leading-[1.5] text-content-secondary">{article.description}</span>
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      <section aria-labelledby="help-topics" className="flex flex-col gap-3">
        <h2 id="help-topics" className="m-0 text-lg font-semibold">
          All topics
        </h2>
        <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-3">
          {topics.map((topic) => (
            <section
              key={topic.key}
              aria-label={topic.label}
              className="flex flex-col gap-2 rounded-md border border-edge bg-surface-card px-[1.125rem] py-4"
            >
              <Link
                href={href(`/help/${topic.key}`)}
                className={cn('flex items-baseline gap-2 rounded-sm text-content no-underline', HELP_FOCUS)}
              >
                <span className="flex-1 text-base font-semibold">{topic.label}</span>
                <span className="text-xs text-content-tertiary">{guideCount(topic.articles.length)}</span>
              </Link>
              <ul className="m-0 flex list-none flex-col gap-1 p-0">
                {topic.articles.slice(0, TOPIC_PREVIEW).map((article) => (
                  <li key={article.slug}>
                    <Link
                      href={articleHref(article, context.communityId, reader)}
                      className={cn(
                        'text-sm leading-[1.45] text-content-link no-underline hover:text-content-link-hover hover:underline',
                        HELP_FOCUS,
                      )}
                    >
                      {article.title}
                    </Link>
                  </li>
                ))}
              </ul>
              {topic.articles.length > TOPIC_PREVIEW ? (
                <Link
                  href={href(`/help/${topic.key}`)}
                  className={cn(
                    'text-[0.8125rem] font-semibold text-content-link no-underline hover:text-content-link-hover hover:underline',
                    HELP_FOCUS,
                  )}
                >
                  All {topic.articles.length} guides →
                </Link>
              ) : null}
            </section>
          ))}
        </div>
      </section>

      <p className="m-0 flex flex-wrap gap-x-4 gap-y-1 text-sm text-content-secondary">
        <span>Can’t find what you need?</span>
        <Link
          href={`/help/contact?communityId=${context.communityId}`}
          className={cn('font-semibold text-content-link no-underline hover:underline', HELP_FOCUS)}
        >
          Contact support
        </Link>
        {context.membership.isAdmin ? (
          <Link
            href={`/help/manage?communityId=${context.communityId}`}
            className={cn('font-semibold text-content-link no-underline hover:underline', HELP_FOCUS)}
          >
            Manage your community’s FAQs
          </Link>
        ) : null}
      </p>
    </HelpCenterShell>
  );
}
