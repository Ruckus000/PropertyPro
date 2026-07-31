'use client';

/**
 * The "Pages" tool panel — which page of the site the editor is editing
 * (website editor v3, Phase 11b-3).
 *
 * ## What this slice ships
 *
 * A READ-ONLY list with selection. Creating, renaming, reordering, nav toggling
 * and removal all land in the next slice; this one exists so the rest of the
 * editor has a selected page to key off, which is the prerequisite for every
 * block write targeting the right page.
 *
 * ## States (all four, per `.claude/rules/design.md`)
 *
 *   loading → the list is in flight: skeleton rows
 *   error   → the read failed: danger banner + retry
 *   empty   → the community has no pages at all
 *   success → the pages, home pinned first, in nav order
 *
 * The empty state is genuinely reachable despite `listSitePages` creating a home
 * page on demand: an editor that was open when the community's last page was
 * removed refetches into an empty list. It is not "impossible", it is "rare",
 * and rendering nothing for it would look like a broken panel.
 *
 * ## Why the panel queries rather than taking a server seed
 *
 * Same trade as `DomainPanel`: this panel is dynamically imported and mounted
 * only once its tab is clicked, so fetching on mount keeps the request off the
 * initial load of every PM who never opens it. `EditorRoot` separately receives
 * a server-rendered seed, but that is for the *selected page id* — which the
 * write hooks need before any tab is clicked — not for this list.
 *
 * ## Selection repair
 *
 * When the list resolves and the selection does not name a page in it — either
 * because it names a page that is gone, or because there is no selection at all
 * — the panel selects home. Both states are reachable: the first from removing
 * the page you were editing (or from a second browser tab), the second from an
 * editor whose server-side page seed failed.
 *
 * Neither is a correctness hole on its own. The server answers a write to an
 * unknown page with a 404, and it treats an absent page id as home. What the
 * repair fixes is the DISHONEST rendering in between: a panel showing no page as
 * current while every save is quietly landing on home is the wrong-but-200
 * failure, and it is the one nobody reports.
 */

import { useEffect } from 'react';
import { Files } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { AlertBanner } from '@/components/shared/alert-banner';
import { EmptyState } from '@/components/shared/empty-state';
import { useSitePages, type SitePageSummary } from '@/hooks/use-site-pages';

export interface PagesPanelProps {
  communityId: number;
  /**
   * The page being edited, or `null` while none is known.
   *
   * Required, not defaulted: a panel that invented its own selection would
   * disagree with the one the block writes actually use.
   */
  selectedPageId: number | null;
  onSelectPage: (pageId: number) => void;
}

/** The public address of a page, as a PM reads it. Home is the site root. */
function pageAddress(page: SitePageSummary): string {
  return page.isHome ? '/' : `/${page.slug}`;
}

/**
 * The one state badge a row shows, most urgent first.
 *
 * One rather than several on purpose: a row is at most 280px wide, and a page
 * that is both hidden from the nav and staged for removal only needs the
 * removal said out loud — that is the state with a deadline attached.
 */
function rowBadge(page: SitePageSummary): { label: string; className: string } | null {
  if (page.deleteStagedAt) {
    return {
      label: 'Removing',
      className: 'bg-status-danger-bg text-status-danger',
    };
  }
  if (page.isDraft) {
    return {
      label: 'Draft',
      className: 'bg-status-warning-bg text-status-warning',
    };
  }
  if (!page.inNav) {
    return {
      label: 'Hidden',
      className: 'bg-status-neutral-bg text-status-neutral',
    };
  }
  return null;
}

export function PagesPanel({ communityId, selectedPageId, onSelectPage }: PagesPanelProps) {
  const { data, isPending, isError, error, refetch } = useSitePages(communityId);

  const pages = data ?? [];
  // `?? pages[0]` is a real fallback, not defensive noise: the list is
  // home-first, so a community whose home flag is somehow unset still resolves
  // to the page a manager would call home rather than to nothing at all.
  const home = pages.find((page) => page.isHome) ?? pages[0];
  // `data === undefined` — still loading, or the read failed — is NOT a stale
  // selection. Repairing on it would throw away the server-seeded page id on
  // every mount, which is the opposite of the point.
  const selectionNeedsRepair =
    data !== undefined &&
    home !== undefined &&
    !pages.some((page) => page.id === selectedPageId);

  useEffect(() => {
    // Converges in one step: afterwards the selected id IS home's, so the
    // condition above is false and the effect does not re-fire.
    if (selectionNeedsRepair && home) onSelectPage(home.id);
  }, [home, onSelectPage, selectionNeedsRepair]);

  if (isPending) {
    return (
      <div data-testid="site-pages-loading" className="space-y-2">
        <Skeleton className="h-11 w-full" />
        <Skeleton className="h-11 w-full" />
        <Skeleton className="h-11 w-full" />
      </div>
    );
  }

  if (isError || data === undefined) {
    return (
      <div data-testid="site-pages-read-error" className="space-y-4">
        <AlertBanner
          status="danger"
          title="We couldn't load your pages."
          description={error?.message ?? 'Please try again.'}
        />
        <Button type="button" variant="outline" onClick={() => void refetch()}>
          Try again
        </Button>
      </div>
    );
  }

  if (pages.length === 0) {
    return (
      <div data-testid="site-pages-empty">
        <EmptyState
          size="sm"
          icon={Files}
          title="No pages yet"
          description="Your site's pages will show up here."
        />
      </div>
    );
  }

  return (
    <div data-testid="site-pages" className="space-y-3">
      <ul aria-label="Site pages" className="flex flex-col gap-1">
        {pages.map((page) => {
          const selected = page.id === selectedPageId;
          const badge = rowBadge(page);

          return (
            <li key={page.id}>
              <button
                type="button"
                onClick={() => onSelectPage(page.id)}
                aria-current={selected ? 'true' : undefined}
                data-testid={`site-page-row-${page.id}`}
                className={cn(
                  'flex min-h-11 w-full min-w-0 items-center gap-2 rounded-md border px-2 py-1 text-left transition-colors duration-quick',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus',
                  selected
                    ? 'border-interactive bg-interactive-subtle'
                    : 'border-edge-subtle bg-surface-card hover:bg-surface-hover',
                )}
              >
                <span className="flex min-w-0 flex-1 flex-col">
                  <span
                    className={cn(
                      'truncate text-sm',
                      selected ? 'font-semibold text-content' : 'text-content-secondary',
                    )}
                  >
                    {page.name}
                  </span>
                  <span className="truncate text-xs text-content-tertiary">
                    {pageAddress(page)}
                  </span>
                </span>
                {badge && (
                  <span
                    className={cn(
                      'shrink-0 rounded-full px-1.5 py-0.5 text-xs font-medium',
                      badge.className,
                    )}
                  >
                    {badge.label}
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ul>
      {/* No "more is coming" promise here on purpose: this panel can ship
          without the slice that adds the row actions, and copy that commits to
          an unshipped capability is a support ticket waiting to happen. */}
      <p className="text-xs text-content-tertiary">
        Pick a page to edit the sections on it.
      </p>
    </div>
  );
}
