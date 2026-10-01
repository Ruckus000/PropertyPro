import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  HELP_FOCUS,
  HelpBreadcrumb,
  HelpCenterShell,
} from '@/components/help/center/help-center-shell';
import { articleHref, guideCount } from '@/lib/help/center';
import { loadHelpCenterPage } from '@/lib/help/center-page';

interface HelpTopicPageProps {
  params: Promise<{ category: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function HelpTopicPage({ params, searchParams }: HelpTopicPageProps) {
  const [{ category }, resolvedSearchParams] = await Promise.all([params, searchParams]);
  const page = await loadHelpCenterPage(resolvedSearchParams, `/help/${category}`);
  const { context, reader, topics, copy, href } = page;

  // A topic the reader has nothing in (another section's, or another
  // community type's) is not found, rather than an empty list.
  const topic = topics.find((candidate) => candidate.key === category);
  if (!topic) notFound();

  return (
    <HelpCenterShell {...page.shell({ currentPath: `/help/${category}`, currentTopic: category })}>
      <HelpBreadcrumb items={[{ label: `Help for ${copy.labelLower}`, href: href('/help') }, { label: topic.label }]} />
      <div className="flex flex-col gap-[0.375rem]">
        <h1 className="m-0 text-3xl font-semibold">{topic.label}</h1>
        <p className="m-0 text-base text-content-secondary">
          {guideCount(topic.articles.length)} for {copy.labelLower}
        </p>
      </div>
      <div className="flex flex-col overflow-hidden rounded-md border border-edge bg-surface-card">
        {topic.articles.map((article, index) => (
          <Link
            key={article.slug}
            href={articleHref(article, context.communityId, reader)}
            className={cn(
              'flex items-center gap-4 px-5 py-4 text-content no-underline hover:bg-surface-hover',
              index > 0 && 'border-t border-edge-subtle',
              HELP_FOCUS,
            )}
          >
            <span className="flex min-w-0 flex-1 flex-col gap-1">
              <span className="text-base font-semibold">{article.title}</span>
              <span className="text-sm leading-[1.5] text-content-secondary">{article.description}</span>
            </span>
            {article.stepCount ? (
              <span className="whitespace-nowrap text-xs text-content-tertiary">{article.stepCount} steps</span>
            ) : null}
            <ChevronRight size={16} className="shrink-0 text-content-tertiary" aria-hidden="true" />
          </Link>
        ))}
      </div>
    </HelpCenterShell>
  );
}
