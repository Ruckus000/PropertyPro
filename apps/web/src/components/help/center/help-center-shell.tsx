/**
 * Help Center frame: sticky header (brand, community, search, "Back to
 * PropertyPro"), the community-type bar for board members and managers, and
 * the topic sidebar beside the page content. Server-rendered; the searches
 * are plain GET forms, so the Help Center works before hydration.
 */
import type { ReactNode } from 'react';
import Link from 'next/link';
import { Building, Search } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { HelpTypeBar } from '@/lib/help/center';

export const HELP_FOCUS =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2';

export interface HelpSidebarTopic {
  key: string;
  label: string;
  href: string;
  count: number;
  current: boolean;
}

export interface HelpSearchScope {
  communityId: number;
  /** Preview type to keep, when previewing. */
  type?: string;
}

interface HelpCenterShellProps {
  communityName: string;
  homeHref: string;
  portalHref: string;
  /** Header search is hidden on the home page, which has its own. */
  showHeaderSearch: boolean;
  query?: string;
  searchScope: HelpSearchScope;
  typeBar: HelpTypeBar | null;
  sidebarLabel: string;
  topics: HelpSidebarTopic[];
  children: ReactNode;
}

export function HelpSearchHiddenFields({ scope }: { scope: HelpSearchScope }) {
  return (
    <>
      <input type="hidden" name="communityId" value={scope.communityId} />
      {scope.type ? <input type="hidden" name="type" value={scope.type} /> : null}
    </>
  );
}

export function HelpCenterShell({
  communityName,
  homeHref,
  portalHref,
  showHeaderSearch,
  query,
  searchScope,
  typeBar,
  sidebarLabel,
  topics,
  children,
}: HelpCenterShellProps) {
  return (
    <div className="min-h-screen bg-surface-page font-sans text-content">
      <header className="sticky top-0 z-20 border-b border-edge bg-surface-card">
        <div className="mx-auto flex h-[4rem] max-w-[calc(1180px+3rem)] items-center gap-4 px-[1.5rem]">
          <Link
            href={homeHref}
            className={cn('flex shrink-0 items-center gap-[0.625rem] rounded-md text-content no-underline', HELP_FOCUS)}
          >
            <span className="flex h-9 w-9 items-center justify-center rounded-md bg-interactive">
              <Building size={20} className="text-content-inverse" aria-hidden="true" />
            </span>
            <span className="flex flex-col leading-[1.2]">
              <span className="text-base font-semibold">
                PropertyPro <span className="text-content-link">Help</span>
              </span>
              <span className="text-xs text-content-secondary">{communityName}</span>
            </span>
          </Link>
          {showHeaderSearch ? (
            <form
              role="search"
              action="/help/search"
              method="get"
              className="relative ml-auto flex max-w-[460px] flex-1 items-center"
            >
              <Search
                size={16}
                className="pointer-events-none absolute left-[0.875rem] text-content-tertiary"
                aria-hidden="true"
              />
              <input
                type="search"
                name="q"
                aria-label="Search help"
                placeholder="Search help"
                defaultValue={query}
                className={cn(
                  'h-10 w-full rounded-md border border-edge bg-surface-card pl-10 pr-[0.875rem] text-[0.9375rem] text-content placeholder:text-content-placeholder',
                  HELP_FOCUS,
                )}
              />
              <HelpSearchHiddenFields scope={searchScope} />
            </form>
          ) : null}
          <Link
            href={portalHref}
            className={cn(
              'inline-flex h-10 shrink-0 items-center gap-[0.375rem] rounded-md border border-edge px-[0.875rem] text-sm font-medium text-content no-underline hover:bg-surface-hover',
              !showHeaderSearch && 'ml-auto',
              HELP_FOCUS,
            )}
          >
            Back to PropertyPro
          </Link>
        </div>
      </header>

      {typeBar ? (
        <div
          className={cn(
            'border-b border-edge',
            typeBar.previewing ? 'bg-status-info-bg' : 'bg-surface-subtle',
          )}
        >
          <div className="mx-auto flex max-w-[calc(1180px+3rem)] flex-wrap items-center gap-x-4 gap-y-2 px-[1.5rem] py-[0.625rem]">
            <span id="help-type-label" className="text-sm text-content-secondary">
              {typeBar.text}
            </span>
            <div
              role="radiogroup"
              aria-labelledby="help-type-label"
              className="flex gap-1 rounded-md border border-edge bg-surface-card p-[0.1875rem]"
            >
              {typeBar.options.map((option) => (
                <Link
                  key={option.type}
                  href={option.href}
                  role="radio"
                  aria-checked={option.current}
                  className={cn(
                    'inline-flex h-8 items-center gap-[0.375rem] rounded-sm px-3 text-sm font-medium no-underline',
                    option.current
                      ? 'bg-surface-muted text-content'
                      : 'bg-transparent text-content-secondary hover:text-content',
                    HELP_FOCUS,
                  )}
                >
                  {option.label}
                  {option.mine ? <span className="text-xs text-content-tertiary">· yours</span> : null}
                </Link>
              ))}
            </div>
          </div>
        </div>
      ) : null}

      <div className="mx-auto grid max-w-[calc(1180px+3rem)] items-start gap-10 px-[1.5rem] pb-16 pt-8 min-[900px]:grid-cols-[15rem_minmax(0,1fr)]">
        <nav
          aria-label="Help topics"
          className="sticky top-[5.5rem] hidden flex-col gap-[0.125rem] min-[900px]:flex"
        >
          <span className="px-3 pb-2 text-xs font-semibold uppercase tracking-[0.08em] text-content-tertiary">
            {sidebarLabel}
          </span>
          {topics.map((topic) => (
            <Link
              key={topic.key}
              href={topic.href}
              aria-current={topic.current ? 'page' : undefined}
              className={cn(
                'relative flex min-h-[2.25rem] items-center gap-2 rounded-md px-3 py-1 text-sm no-underline hover:bg-surface-hover hover:text-content',
                topic.current
                  ? 'bg-surface-muted font-semibold text-content'
                  : 'font-medium text-content-secondary',
                HELP_FOCUS,
              )}
            >
              <span
                aria-hidden="true"
                className={cn(
                  'absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r',
                  topic.current ? 'bg-interactive' : 'bg-transparent',
                )}
              />
              <span className="flex-1">{topic.label}</span>
              <span className="text-xs font-medium text-content-tertiary">{topic.count}</span>
            </Link>
          ))}
        </nav>
        <div className="flex min-w-0 flex-col gap-8">{children}</div>
      </div>
    </div>
  );
}

export function HelpBreadcrumb({ items }: { items: Array<{ label: string; href?: string }> }) {
  return (
    <nav aria-label="Breadcrumb" className="text-sm text-content-secondary">
      {items.map((item, index) => (
        <span key={`${item.label}-${index}`}>
          {index > 0 ? <span aria-hidden="true"> / </span> : null}
          {item.href ? (
            <Link
              href={item.href}
              className={cn('text-content-link no-underline hover:text-content-link-hover hover:underline', HELP_FOCUS)}
            >
              {item.label}
            </Link>
          ) : (
            item.label
          )}
        </span>
      ))}
    </nav>
  );
}
