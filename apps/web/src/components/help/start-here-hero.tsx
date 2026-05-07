/**
 * Role-aware "Start here" hero for the help hub.
 *
 * Server component — derives content from the user's effective role and
 * renders a small set of role-pinned articles plus a primary CTA. Designed
 * to occupy the above-the-fold space on /help so a brand-new user lands on
 * a path, not an 18-tile category buffet (per 2026-05-07 audit / WS3).
 *
 * No `featureGates` filtering is applied here — the role-pinned set should
 * be small and curated. If a slug ever needs feature-gating, prefer pinning
 * a different slug; do not add gating logic to the hero.
 */

import Link from 'next/link';
import { ArrowRight, Check, Sparkles } from 'lucide-react';
import type { HelpArticleMetadata } from '@/lib/services/help-article-service';
import type { StartHereContent } from '@/lib/help/start-here';

interface StartHereHeroProps {
  communityId: number;
  content: StartHereContent;
  articles: HelpArticleMetadata[];
  /** Slugs the current user has already viewed; surface a ✓ on those tiles. */
  readSlugs?: ReadonlySet<string>;
}

function articleHref(article: HelpArticleMetadata, communityId: number): string {
  return `/help/${article.category}/${article.slug}?communityId=${communityId}`;
}

export function StartHereHero({
  communityId,
  content,
  articles,
  readSlugs,
}: StartHereHeroProps) {
  if (articles.length === 0) return null;

  return (
    <section
      aria-labelledby="start-here-heading"
      className="rounded-2xl border border-edge bg-surface-card p-6 shadow-sm sm:p-8"
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex items-start gap-3">
          <span
            className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-status-brand-subtle text-status-brand"
            aria-hidden="true"
          >
            <Sparkles size={18} />
          </span>
          <div>
            <h2 id="start-here-heading" className="text-xl font-semibold text-content">
              {content.headline}
            </h2>
            <p className="mt-1 text-sm leading-6 text-content-secondary">
              {content.subhead}
            </p>
          </div>
        </div>
        {content.cta && (
          <Link
            href={`${content.cta.href}?communityId=${communityId}`}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-edge bg-surface-card px-4 py-2 text-sm font-medium text-content transition-colors hover:bg-surface-hover"
          >
            {content.cta.label}
            <ArrowRight size={14} aria-hidden="true" />
          </Link>
        )}
      </div>

      <ol className="mt-6 grid gap-3 md:grid-cols-2">
        {articles.map((article, index) => {
          const isRead = readSlugs?.has(article.slug) ?? false;
          return (
            <li key={article.slug}>
              <Link
                href={articleHref(article, communityId)}
                className="group flex items-start gap-3 rounded-xl border border-edge bg-surface-page p-4 transition-colors hover:border-edge-strong hover:bg-surface-hover"
              >
                <span
                  className={
                    isRead
                      ? 'flex size-7 shrink-0 items-center justify-center rounded-lg bg-status-success-subtle text-status-success'
                      : 'flex size-7 shrink-0 items-center justify-center rounded-lg bg-surface-muted text-xs font-semibold text-content-secondary'
                  }
                  aria-hidden="true"
                >
                  {isRead ? <Check size={14} /> : index + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-content group-hover:text-[var(--interactive-primary)]">
                    {article.title}
                    {isRead && (
                      <span className="sr-only"> — already read</span>
                    )}
                  </p>
                  <p className="mt-1 text-xs leading-5 text-content-tertiary line-clamp-2">
                    {article.description}
                  </p>
                </div>
              </Link>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
