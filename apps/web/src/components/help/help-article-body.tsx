'use client';

/**
 * <HelpArticleBody/> — shared article-rendering component used by both
 * /help/[category]/[slug]/page.tsx (route mode) and HelpDocsModal (modal mode).
 *
 * Extracted from the inline JSX previously at
 * apps/web/src/app/(authenticated)/help/[category]/[slug]/page.tsx lines 91–186.
 *
 * Mode tweaks chrome only:
 * - route: outer wrapper preserves PageHeader spacing
 * - modal: outer wrapper applies scroll boundary for the article column
 */
import Link from 'next/link';
import { MDXRemote, type MDXRemoteSerializeResult } from 'next-mdx-remote';
import {
  TableOfContents,
  helpMdxComponents,
  type TocItem,
} from '@/components/help/mdx-components';
import { ArticleFeedback } from '@/components/help/article-feedback';
import { ArticleViewTracker } from '@/components/help/article-view-tracker';
import type { HelpArticleMetadata } from '@/lib/services/help-article-service';
import { cn } from '@/lib/utils';

function formatUpdatedAt(value: string | undefined): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short' });
}

export interface HelpArticleBodyProps {
  source: MDXRemoteSerializeResult;
  toc: TocItem[];
  metadata: HelpArticleMetadata;
  related: HelpArticleMetadata[];
  communityId: number;
  displayMode: 'route' | 'modal';
}

export function HelpArticleBody({
  source,
  toc,
  metadata,
  related,
  communityId,
  displayMode,
}: HelpArticleBodyProps) {
  const formattedUpdatedAt = formatUpdatedAt(metadata.updatedAt);
  const isModal = displayMode === 'modal';

  return (
    <div className={cn('space-y-8', isModal && 'pb-4')}>
      <ArticleViewTracker
        communityId={communityId}
        articleSlug={metadata.slug}
        articleCategory={metadata.category}
      />

      <div className="flex flex-wrap items-center gap-3 text-xs text-content-tertiary">
        {typeof metadata.readTimeMinutes === 'number' && (
          <span>{metadata.readTimeMinutes} min read</span>
        )}
        {formattedUpdatedAt && (
          <>
            <span aria-hidden="true">/</span>
            <span>Updated {formattedUpdatedAt}</span>
          </>
        )}
        {metadata.roles.length > 0 && (
          <>
            <span aria-hidden="true">/</span>
            <div className="flex flex-wrap gap-2">
              {metadata.roles.map((role) => (
                <span
                  key={role}
                  className="rounded-full bg-surface-muted px-2 py-0.5 capitalize"
                >
                  {role.replace(/_/g, ' ')}
                </span>
              ))}
            </div>
          </>
        )}
        {(metadata.statutes ?? []).length > 0 && (
          <>
            <span aria-hidden="true">/</span>
            <div className="flex flex-wrap gap-2">
              {(metadata.statutes ?? []).map((statute) => (
                <Link
                  key={statute}
                  href={`/help/statutes/${encodeURIComponent(statute)}?communityId=${communityId}`}
                  className="rounded-full bg-purple-50 px-2 py-0.5 text-purple-900 transition-colors hover:bg-purple-100"
                  aria-label={`See all articles tagged with ${statute}`}
                >
                  {statute}
                </Link>
              ))}
            </div>
          </>
        )}
      </div>

      {toc.length > 0 && (
        <details className="rounded-2xl border border-edge bg-surface-card lg:hidden">
          <summary className="cursor-pointer list-none px-4 py-3 text-sm font-semibold text-content [&::-webkit-details-marker]:hidden">
            On this page
          </summary>
          <div className="border-t border-edge-subtle px-4 py-3">
            <TableOfContents items={toc} />
          </div>
        </details>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_240px]">
        {/* Scrolling is handled by the outer DialogContent body wrapper in
            modal mode (single scroll source). No max-h here — nested
            scrollers fight each other for the user's wheel events. */}
        <article className="rounded-2xl border border-edge bg-surface-card p-6 shadow-sm">
          <MDXRemote {...source} components={helpMdxComponents} />
        </article>

        {toc.length > 0 && (
          <aside className="hidden lg:block">
            <div className="sticky top-24">
              <TableOfContents items={toc} />
            </div>
          </aside>
        )}
      </div>

      <ArticleFeedback
        communityId={communityId}
        articleSlug={metadata.slug}
        articleCategory={metadata.category}
      />

      {related.length > 0 && (
        <section className="space-y-4">
          <h2 className="text-xl font-semibold text-content">Related guides</h2>
          <div className="grid gap-4 lg:grid-cols-2">
            {related.map((candidate) => (
              <Link
                key={candidate.slug}
                href={`/help/${candidate.category}/${candidate.slug}?communityId=${communityId}`}
                className="rounded-2xl border border-edge bg-surface-card p-5 shadow-sm transition-colors hover:border-edge-strong hover:bg-surface-hover"
              >
                <h3 className="text-base font-semibold text-content">{candidate.title}</h3>
                <p className="mt-2 text-sm leading-6 text-content-secondary">
                  {candidate.description}
                </p>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
