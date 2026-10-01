import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { cn } from '@/lib/utils';
import { ArticleFeedback } from '@/components/help/article-feedback';
import { ArticleViewTracker } from '@/components/help/article-view-tracker';
import { HelpArticleDisclaimer } from '@/components/help/help-article-disclaimer';
import {
  HELP_FOCUS,
  HelpBreadcrumb,
  HelpCenterShell,
} from '@/components/help/center/help-center-shell';
import { HELP_ARTICLE_BODY_CLASS } from '@/components/help/mdx-components';
import { articleHref } from '@/lib/help/center';
import { loadHelpCenterPage } from '@/lib/help/center-page';
import { getHelpCategoryMeta } from '@/lib/help/category-meta';
import { resolveLegacyHelpSlug } from '@/lib/help/legacy-redirects';
import { helpQuery } from '@/lib/help/reader';
import { compileHelpArticle } from '@/lib/help/render-article';
import {
  findArticleForReader,
  getArticleForReader,
  type HelpArticleMetadata,
} from '@/lib/services/help-article-service';

interface HelpArticlePageProps {
  params: Promise<{ category: string; slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

const RELATED_LIMIT = 3;
const STATUTE_CHIP_LIMIT = 3;

export default async function HelpArticlePage({ params, searchParams }: HelpArticlePageProps) {
  const [{ category, slug }, resolvedSearchParams] = await Promise.all([params, searchParams]);
  const currentPath = `/help/${category}/${slug}`;
  const page = await loadHelpCenterPage(resolvedSearchParams, currentPath);
  const { context, reader, topics, copy, href } = page;

  const source = getArticleForReader(category, slug, reader);
  if (!source) {
    // Old URLs (the pre-2026-09 corpus) and articles that changed topic.
    const moved = findArticleForReader(resolveLegacyHelpSlug(category, slug, reader.section) ?? slug, reader);
    if (moved) redirect(articleHref(moved, context.communityId, reader));
    notFound();
  }

  const article = source.metadata;
  const content = await compileHelpArticle(source, reader, helpQuery(context.communityId, reader));
  const topic = topics.find((candidate) => candidate.key === article.category);
  const siblings = topic?.articles ?? [];
  const index = siblings.findIndex((candidate) => candidate.slug === article.slug);
  const previous = index > 0 ? siblings[index - 1] : undefined;
  const next = index >= 0 ? siblings[index + 1] : undefined;
  const related = article.relatedArticles
    .map((relatedSlug) => findArticleForReader(relatedSlug, reader))
    .filter((candidate): candidate is HelpArticleMetadata => !!candidate)
    .slice(0, RELATED_LIMIT);
  const categoryLabel = getHelpCategoryMeta(article.category).label;
  const statutes = (article.statutes ?? []).slice(0, STATUTE_CHIP_LIMIT);

  return (
    <HelpCenterShell {...page.shell({ currentPath, currentTopic: article.category, currentArticle: article })}>
      <ArticleViewTracker
        communityId={context.communityId}
        articleSlug={article.slug}
        articleCategory={article.category}
      />
      <HelpBreadcrumb
        items={[
          { label: `Help for ${copy.labelLower}`, href: href('/help') },
          { label: categoryLabel, href: href(`/help/${article.category}`) },
        ]}
      />
      <div className="flex max-w-[46rem] flex-col gap-8">
        <article className="flex flex-col gap-5 text-content">
          <header className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-[0.375rem]">
              <span className="text-xs font-semibold uppercase tracking-[0.06em] text-content-brand">
                {categoryLabel}
              </span>
              {statutes.map((statute) => (
                <Link
                  key={statute}
                  href={`/help/statutes/${encodeURIComponent(statute)}?communityId=${context.communityId}`}
                  aria-label={`All guides that cite ${statute}`}
                  className={cn(
                    'inline-flex h-[1.375rem] items-center whitespace-nowrap rounded-full border border-edge px-2 text-xs font-medium text-content-secondary no-underline hover:bg-surface-hover',
                    HELP_FOCUS,
                  )}
                >
                  {statute}
                </Link>
              ))}
            </div>
            <h1 className="m-0 text-balance text-3xl font-semibold leading-[1.2] tracking-[-0.01em]">
              {article.title}
            </h1>
            <p className="m-0 text-pretty text-base leading-[1.55] text-content-secondary">{article.description}</p>
          </header>

          <div className={HELP_ARTICLE_BODY_CLASS}>{content}</div>

          {/* Injected on every article, never authored — see HelpArticleDisclaimer. */}
          <HelpArticleDisclaimer statutes={article.statutes ?? []} />

          {related.length > 0 ? (
            <section aria-labelledby="help-related" className="flex flex-col gap-2 border-t border-edge-subtle pt-5">
              <h2
                id="help-related"
                className="m-0 text-xs font-semibold uppercase tracking-[0.06em] text-content-tertiary"
              >
                Related articles
              </h2>
              <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-2">
                {related.map((candidate) => (
                  <Link
                    key={candidate.slug}
                    href={articleHref(candidate, context.communityId, reader)}
                    className={cn(
                      'flex flex-col gap-1 rounded-md border border-edge bg-surface-card px-[0.875rem] py-3 text-content no-underline hover:shadow-e1',
                      HELP_FOCUS,
                    )}
                  >
                    <span className="text-xs text-content-tertiary">{getHelpCategoryMeta(candidate.category).label}</span>
                    <span className="text-[0.9375rem] font-semibold leading-[1.35]">{candidate.title}</span>
                  </Link>
                ))}
              </div>
            </section>
          ) : null}
        </article>

        <ArticleFeedback communityId={context.communityId} articleSlug={article.slug} articleCategory={article.category} />

        {next ? (
          <div className="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-3 border-t border-edge-subtle pt-5">
            {previous ? (
              <Link
                href={articleHref(previous, context.communityId, reader)}
                className={cn(
                  'flex flex-col gap-[0.125rem] rounded-md border border-edge px-4 py-3 text-content no-underline hover:bg-surface-hover',
                  HELP_FOCUS,
                )}
              >
                <span className="text-xs text-content-tertiary">← Previous in {categoryLabel}</span>
                <span className="text-[0.9375rem] font-semibold">{previous.title}</span>
              </Link>
            ) : null}
            <Link
              href={articleHref(next, context.communityId, reader)}
              className={cn(
                'flex flex-col gap-[0.125rem] rounded-md border border-edge px-4 py-3 text-right text-content no-underline hover:bg-surface-hover',
                HELP_FOCUS,
              )}
            >
              <span className="text-xs text-content-tertiary">Next in {categoryLabel} →</span>
              <span className="text-[0.9375rem] font-semibold">{next.title}</span>
            </Link>
          </div>
        ) : null}
      </div>
    </HelpCenterShell>
  );
}
