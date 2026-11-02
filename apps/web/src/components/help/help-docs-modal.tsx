'use client';

/**
 * <HelpDocsModal/> — "Showcase" help modal. Single-pane reader with an
 * in-modal navigation stack (HelpWidgetProvider), persistent header search,
 * and a slim Up-next footer. Nothing in here navigates the app away except
 * the two explicit affordances (open-full-page, browse-all) — both of which
 * call markCloseAsNavigation() to keep the ?help= deep-link strip race-free.
 *
 * While the media lightbox is open (nested dialog), outside-pointer and
 * escape dismissal of THIS dialog are suppressed: lightbox overlay clicks
 * land outside our DialogContent and would otherwise close everything.
 *
 * ## Opening
 *
 * Opened without a specific article (the Help button, the `?` key), the modal
 * goes straight to the page's FIRST contextual article rather than a list of
 * them, showing a skeleton while that list loads. When the page has more than
 * one, the footer's Next button walks them in order; back from the first one
 * lands on the full "Help for this page" list. A page with no articles of its
 * own, or a failed lookup, keeps the list view. An article opened by name (a
 * `?help=` link, an in-page help link) is left alone.
 *
 * ## Sizing
 *
 * The box is sized by its content, not by a constant. It used to be a fixed
 * 440px × 85vh panel, which left a short contextual list floating in empty
 * space and gave a long article no more room on a wide screen. Now:
 *
 *  - width follows the viewport: `min(100vw - 2rem, 40rem)`, then up to
 *    48rem from `lg` and 56rem from `xl`, never more than 90vw,
 *  - height is whatever the content needs, capped at 85dvh (90dvh for the
 *    phone sheet) with a small floor so the search view never collapses,
 *  - the body is the only scroll container, so header and Up-next stay put,
 *  - on desktop the reader can drag any edge, or the corner, to resize it.
 *    `overflow-visible` lets the edge strips reach past the border, so they
 *    stay off the body's scrollbar; the body is the scroller, not the box.
 *
 * The Dialog and Sheet both draw their own close X, centred 24px in from the
 * top-right corner. The header is 48px tall with a 56px right gutter, so the X
 * sits level with the header's controls instead of on top of the last one.
 */
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, ExternalLink, Search } from 'lucide-react';
import { useHelpWidget } from '@/components/help/help-widget-provider';
import { useContextualHelp, useHelpArticle, useReadArticles } from '@/hooks/use-help';
import { HelpArticleBody } from '@/components/help/help-article-body';
import { HelpDocsModalSearchPanel } from '@/components/help/help-docs-modal-search-panel';
import { getHelpCategoryMeta } from '@/lib/help/category-meta';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog';
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { AlertBanner } from '@/components/shared/alert-banner';
import { cn } from '@/lib/utils';

interface HelpDocsModalProps {
  communityId: number;
  flagEnabled: boolean;
}

export function HelpDocsModal({ communityId, flagEnabled }: HelpDocsModalProps) {
  const {
    isOpen,
    close,
    selectedArticle,
    stackDepth,
    openArticle,
    back,
    markCloseAsNavigation,
  } = useHelpWidget();
  const pathname = usePathname();

  const [searchQuery, setSearchQuery] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  // Whether this open has already decided where to land (first page article,
  // or the list). Cleared on close so the next open decides again.
  const [landingDecided, setLandingDecided] = useState(false);

  // Reset search when article changes.
  useEffect(() => {
    setShowSearch(false);
    setSearchQuery('');
  }, [selectedArticle]);

  const contextualQuery = useContextualHelp(pathname, communityId, flagEnabled && isOpen);
  const contextual = contextualQuery.data;

  useEffect(() => {
    if (!isOpen) setLandingDecided(false);
  }, [isOpen]);

  // Land on the page's first article when opened without one.
  useEffect(() => {
    if (!flagEnabled || !isOpen || landingDecided) return;
    if (selectedArticle || showSearch) {
      setLandingDecided(true);
      return;
    }
    // A disabled query also reports `isPending`, but never fetches; only wait
    // on a lookup that is actually running, or the skeleton would never clear.
    if (contextualQuery.isPending && contextualQuery.fetchStatus !== 'idle') return;
    setLandingDecided(true);
    const first = contextual?.[0];
    if (first) openArticle(first.category, first.slug);
  }, [
    flagEnabled,
    isOpen,
    landingDecided,
    selectedArticle,
    showSearch,
    contextual,
    contextualQuery.isPending,
    contextualQuery.fetchStatus,
    openArticle,
  ]);
  const { data: readArticles } = useReadArticles(communityId);
  const articleQuery = useHelpArticle(
    selectedArticle?.category ?? null,
    selectedArticle?.slug ?? null,
    communityId,
    flagEnabled && isOpen && selectedArticle !== null,
  );

  const categoryMeta = useMemo(
    () => (selectedArticle ? getHelpCategoryMeta(selectedArticle.category) : null),
    [selectedArticle],
  );

  const upNextArticle = articleQuery.data?.upNext ?? null;

  // Where the open article sits among this page's articles, if it is one.
  const pageIndex =
    selectedArticle && contextual
      ? contextual.findIndex(
          (a) => a.category === selectedArticle.category && a.slug === selectedArticle.slug,
        )
      : -1;
  const nextPageArticle =
    pageIndex >= 0 && contextual && pageIndex < contextual.length - 1
      ? contextual[pageIndex + 1]!
      : null;
  const awaitingLanding = isOpen && !landingDecided && !selectedArticle && !showSearch;

  const isMobile = useIsMobile();

  if (!flagEnabled) return null;

  const header = (
    <div
      data-help-header
      className="flex h-12 shrink-0 items-center gap-2 border-b border-edge pl-4 pr-14"
    >
      {stackDepth > 0 && (
        <button
          type="button"
          onClick={back}
          aria-label="Go back"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[var(--radius-sm)] text-content-secondary hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
        >
          <ChevronLeft size={18} aria-hidden="true" />
        </button>
      )}
      <div className="min-w-0 flex-1">
        {categoryMeta && !showSearch ? (
          <span
            className={cn(
              'inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium',
              categoryMeta.chipClass,
            )}
          >
            <categoryMeta.icon size={11} aria-hidden="true" />
            {categoryMeta.label}
          </span>
        ) : (
          <div className="relative">
            <Search
              size={14}
              className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-content-tertiary"
              aria-hidden="true"
            />
            <input
              type="search"
              placeholder="Search help…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-8 w-full rounded-[var(--radius-sm)] border border-edge bg-surface-muted pl-8 pr-3 text-sm text-content placeholder:text-content-tertiary focus:border-interactive focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-interactive"
              aria-label="Search help articles"
              // eslint-disable-next-line jsx-a11y/no-autofocus
              autoFocus={showSearch}
            />
          </div>
        )}
      </div>
      <button
        type="button"
        onClick={() => setShowSearch((s) => !s)}
        aria-label={showSearch ? 'Close search' : 'Search help'}
        aria-pressed={showSearch}
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[var(--radius-sm)] text-content-secondary hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
      >
        <Search size={16} aria-hidden="true" />
      </button>
      {selectedArticle && articleQuery.data && (
        <Link
          href={`/help/${selectedArticle.category}/${selectedArticle.slug}`}
          target="_blank"
          rel="noopener"
          onClick={markCloseAsNavigation}
          aria-label="Open full help page"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[var(--radius-sm)] text-content-secondary hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
        >
          <ExternalLink size={16} aria-hidden="true" />
        </Link>
      )}
    </div>
  );

  const body = awaitingLanding ? (
    <div role="status" className="space-y-4">
      <span className="sr-only">Loading help for this page</span>
      <Skeleton className="h-6 w-2/3" />
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-5/6" />
      <Skeleton className="h-32 w-full" />
    </div>
  ) : showSearch || !selectedArticle ? (
      <HelpDocsModalSearchPanel
        communityId={communityId}
        query={searchQuery}
        contextualArticles={contextual ?? []}
        readSlugs={readArticles?.slugs ?? null}
        onPickArticle={(category, slug) => {
          setShowSearch(false);
          setSearchQuery('');
          openArticle(category, slug);
        }}
      />
    ) : (
      <>
        {articleQuery.isPending && (
          <div className="space-y-4 p-6">
            <Skeleton className="h-6 w-2/3" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-5/6" />
            <Skeleton className="h-32 w-full" />
          </div>
        )}
        {articleQuery.isError && (
          <div className="p-6">
            <AlertBanner
              status="danger"
              title="Couldn't load this article"
              description="We hit an error loading this help article. Please try again."
            />
          </div>
        )}
        {articleQuery.data && (
          <HelpArticleBody
            html={articleQuery.data.html}
            metadata={articleQuery.data.metadata}
            related={articleQuery.data.related}
            communityId={communityId}
            onOpenArticle={openArticle}
            onLightboxOpenChange={setLightboxOpen}
          />
        )}
      </>
    );

  const pageCount = contextual?.length ?? 0;
  const footer = showSearch || !selectedArticle ? null : nextPageArticle ? (
    <div className="flex items-center justify-between gap-3 border-t border-edge px-4 py-3">
      <p className="shrink-0 text-sm text-content-tertiary">
        {pageIndex + 1} of {pageCount}
      </p>
      <Button
        type="button"
        size="sm"
        variant="outline"
        onClick={() => openArticle(nextPageArticle.category, nextPageArticle.slug)}
        aria-label={`Next: ${nextPageArticle.title}`}
        className="min-w-0"
      >
        <span className="truncate">Next: {nextPageArticle.title}</span>
        <ChevronRight aria-hidden="true" />
      </Button>
    </div>
  ) : upNextArticle ? (
      <div className="border-t border-edge px-4 py-3">
        <button
          type="button"
          onClick={() => openArticle(upNextArticle.category, upNextArticle.slug)}
          className="flex w-full items-start gap-3 rounded-[var(--radius-md)] p-2 text-left hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
        >
          <div className="min-w-0 flex-1">
            <p className="text-xs text-content-tertiary">Up next</p>
            <p className="truncate text-sm font-medium text-content">{upNextArticle.title}</p>
          </div>
          <ChevronLeft
            size={16}
            className="mt-0.5 shrink-0 rotate-180 text-content-tertiary"
            aria-hidden="true"
          />
        </button>
      </div>
    ) : null;

  // Mobile: Sheet from bottom. Desktop: Dialog from side.
  if (isMobile) {
    return (
      <Sheet open={isOpen} onOpenChange={(o) => !o && close()}>
        <SheetContent
          side="bottom"
          className="flex max-h-[90dvh] flex-col gap-0 p-0"
          onPointerDownOutside={lightboxOpen ? (e) => e.preventDefault() : undefined}
          onEscapeKeyDown={lightboxOpen ? (e) => e.preventDefault() : undefined}
        >
          <SheetTitle className="sr-only">Help</SheetTitle>
          <SheetDescription className="sr-only">Help documentation panel</SheetDescription>
          {header}
          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 md:px-6">{body}</div>
          {footer}
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <Dialog open={isOpen} onOpenChange={(o) => !o && close()}>
      <DialogContent
        resizable
        minWidth={360}
        minHeight={320}
        className="flex max-h-[85dvh] min-h-[16rem] w-[min(100vw-2rem,40rem)] max-w-[min(100vw-2rem,40rem)] flex-col gap-0 overflow-visible p-0 sm:max-w-[min(100vw-2rem,40rem)] lg:w-[min(90vw,48rem)] lg:max-w-[min(90vw,48rem)] xl:w-[min(90vw,56rem)] xl:max-w-[min(90vw,56rem)]"
        onPointerDownOutside={lightboxOpen ? (e) => e.preventDefault() : undefined}
        onEscapeKeyDown={lightboxOpen ? (e) => e.preventDefault() : undefined}
      >
        <DialogTitle className="sr-only">Help</DialogTitle>
        <DialogDescription className="sr-only">Help documentation panel</DialogDescription>
        {header}
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 md:px-6">{body}</div>
        {footer}
      </DialogContent>
    </Dialog>
  );
}

function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mql = window.matchMedia('(max-width: 767px)');
    setIsMobile(mql.matches);
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mql.addEventListener('change', handler);
    return () => mql.removeEventListener('change', handler);
  }, []);
  return isMobile;
}
