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
 */
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ExternalLink, Search } from 'lucide-react';
import { useHelpWidget } from '@/components/help/help-widget-provider';
import { useContextualHelp, useHelpArticle } from '@/hooks/use-help';
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

  // Reset search when article changes.
  useEffect(() => {
    setShowSearch(false);
    setSearchQuery('');
  }, [selectedArticle]);

  const { data: contextual } = useContextualHelp(pathname, communityId, flagEnabled && isOpen);
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

  const isMobile = useIsMobile();

  if (!flagEnabled) return null;

  const header = (
    <div className="flex items-center gap-2 border-b border-edge px-4 py-3">
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
              className="h-8 w-full rounded-[var(--radius-sm)] border border-edge bg-surface-input pl-8 pr-3 text-sm text-content placeholder:text-content-tertiary focus:border-interactive-primary focus:outline-none focus:ring-1 focus:ring-interactive-primary"
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

  const body =
    showSearch || !selectedArticle ? (
      <HelpDocsModalSearchPanel
        communityId={communityId}
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

  const footer =
    upNextArticle && !showSearch ? (
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
          className="flex h-[85vh] flex-col p-0"
          onPointerDownOutside={lightboxOpen ? (e) => e.preventDefault() : undefined}
          onEscapeKeyDown={lightboxOpen ? (e) => e.preventDefault() : undefined}
        >
          <SheetTitle className="sr-only">Help</SheetTitle>
          <SheetDescription className="sr-only">Help documentation panel</SheetDescription>
          {header}
          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">{body}</div>
          {footer}
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <Dialog open={isOpen} onOpenChange={(o) => !o && close()}>
      <DialogContent
        className="flex h-[85vh] w-[440px] flex-col p-0 sm:max-w-[440px]"
        onPointerDownOutside={lightboxOpen ? (e) => e.preventDefault() : undefined}
        onEscapeKeyDown={lightboxOpen ? (e) => e.preventDefault() : undefined}
      >
        <DialogTitle className="sr-only">Help</DialogTitle>
        <DialogDescription className="sr-only">Help documentation panel</DialogDescription>
        {header}
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">{body}</div>
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
