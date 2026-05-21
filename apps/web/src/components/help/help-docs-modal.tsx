'use client';

/**
 * <HelpDocsModal/> — shadcn-docs-style modal that opens the contextual help
 * article in place, replacing the old drawer. Reads selectedArticle from
 * HelpWidgetProvider; falls back to the first contextual article for the
 * current pathname. When no article matches, renders a search-and-browse
 * panel inside the same modal shell.
 *
 * Render gating:
 * - flagEnabled=false → renders null (Phase A safety; flag flips in Phase B)
 *
 * Mobile: same component renders as a bottom Sheet under 768px; Dialog
 * above. Width on desktop is xl modal token (960px).
 */
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { ExternalLink } from 'lucide-react';
import { useHelpWidget } from '@/components/help/help-widget-provider';
import { useContextualHelp, useHelpArticle } from '@/hooks/use-help';
import { HelpArticleBody } from '@/components/help/help-article-body';
import { HelpDocsModalSearchPanel } from '@/components/help/help-docs-modal-search-panel';
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

export function HelpDocsModal({
  communityId,
  flagEnabled,
}: HelpDocsModalProps) {
  const { isOpen, close, selectedArticle, openArticle } = useHelpWidget();
  const pathname = usePathname();

  const { data: contextualArticles, isFetching: isFetchingContextual } =
    useContextualHelp(pathname, communityId, flagEnabled);

  const targetArticle = useMemo<{ category: string; slug: string } | null>(() => {
    if (selectedArticle) return selectedArticle;
    if (contextualArticles && contextualArticles.length > 0) {
      const first = contextualArticles[0]!;
      return { category: first.category, slug: first.slug };
    }
    return null;
  }, [selectedArticle, contextualArticles]);

  const articleQuery = useHelpArticle(
    targetArticle?.category ?? null,
    targetArticle?.slug ?? null,
    communityId,
    flagEnabled,
  );

  const isMobile = useIsMobile();

  if (!flagEnabled) return null;

  const articleTitle = articleQuery.data?.metadata.title ?? 'Help';
  const showSearchPanel = !targetArticle;

  const content = (
    <ModalContent
      showSearchPanel={showSearchPanel}
      isLoading={Boolean(targetArticle) && articleQuery.isLoading}
      isError={Boolean(articleQuery.isError)}
      onRetry={() => articleQuery.refetch?.()}
      articleData={articleQuery.data ?? null}
      communityId={communityId}
      contextualArticles={contextualArticles ?? []}
      isFetchingContextual={isFetchingContextual}
      onPickArticle={openArticle}
      onClose={close}
    />
  );

  if (isMobile) {
    return (
      <Sheet open={isOpen} onOpenChange={(o) => (o ? null : close())}>
        <SheetContent side="bottom" className="h-[92vh] overflow-y-auto p-6">
          <SheetTitle className="text-xl font-semibold text-content">
            {articleTitle}
          </SheetTitle>
          <SheetDescription className="sr-only">
            Help article viewer
          </SheetDescription>
          <div className="mt-4">{content}</div>
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <Dialog open={isOpen} onOpenChange={(o) => (o ? null : close())}>
      <DialogContent
        className={cn(
          'max-w-[960px] w-[95vw] p-0',
          'data-[state=open]:animate-in data-[state=closed]:animate-out',
        )}
      >
        <header className="flex items-start justify-between gap-4 border-b border-edge px-6 py-4">
          <div className="min-w-0 flex-1">
            <DialogTitle className="truncate text-xl font-semibold text-content">
              {articleTitle}
            </DialogTitle>
            <DialogDescription className="sr-only">
              Help article viewer
            </DialogDescription>
          </div>
        </header>
        <div className="px-6 py-6">{content}</div>
        <footer className="flex items-center justify-end border-t border-edge px-6 py-3">
          <Link
            href={`/help?communityId=${communityId}`}
            onClick={close}
            className="inline-flex items-center gap-1.5 text-sm font-medium text-[var(--interactive-primary)] hover:underline"
          >
            Browse all help articles
            <ExternalLink size={14} aria-hidden="true" />
          </Link>
        </footer>
      </DialogContent>
    </Dialog>
  );
}

interface ModalContentProps {
  showSearchPanel: boolean;
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
  articleData: NonNullable<ReturnType<typeof useHelpArticle>['data']> | null;
  communityId: number;
  contextualArticles: Array<{ category: string; slug: string; title: string }>;
  isFetchingContextual: boolean;
  onPickArticle: (category: string, slug: string) => void;
  onClose: () => void;
}

function ModalContent({
  showSearchPanel,
  isLoading,
  isError,
  onRetry,
  articleData,
  communityId,
  contextualArticles,
  isFetchingContextual,
  onPickArticle,
}: ModalContentProps) {
  if (showSearchPanel) {
    return (
      <HelpDocsModalSearchPanel
        communityId={communityId}
        onPickArticle={onPickArticle}
      />
    );
  }

  if (isLoading || isFetchingContextual) {
    return (
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_240px]" aria-label="Loading article">
        <div className="space-y-3">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-5 w-full" />
          ))}
        </div>
        <div className="hidden lg:block">
          <Skeleton className="h-4 w-32" />
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="mt-2 h-3 w-full" />
          ))}
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <AlertBanner
        status="danger"
        title="We couldn't load this article."
        description={
          <button
            type="button"
            onClick={onRetry}
            className="text-sm font-medium underline underline-offset-2"
          >
            Retry
          </button>
        }
      />
    );
  }

  if (!articleData) return null;

  return (
    <div className="space-y-6">
      <HelpArticleBody
        source={articleData.source}
        toc={articleData.toc}
        metadata={articleData.metadata}
        related={articleData.related}
        communityId={communityId}
        displayMode="modal"
      />

      {contextualArticles.length > 1 && (
        <section className="rounded-[var(--radius-md)] border border-edge bg-surface-muted p-4">
          <h3 className="text-sm font-semibold text-content">More for this page</h3>
          <ul className="mt-2 space-y-1">
            {contextualArticles.slice(1).map((article) => (
              <li key={`${article.category}/${article.slug}`}>
                <button
                  type="button"
                  onClick={() => onPickArticle(article.category, article.slug)}
                  className="text-sm text-[var(--interactive-primary)] hover:underline"
                >
                  {article.title}
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
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
