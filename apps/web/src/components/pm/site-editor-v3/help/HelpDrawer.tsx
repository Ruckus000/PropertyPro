'use client';

/**
 * The editor's Help drawer (website builder v4, Phase 3).
 *
 * Replaces the Help tool panel. The `(site-editor)` route group renders none of
 * the app shell's help chrome, so this is still the editor's only help — but a
 * guide now opens IN the drawer, beside the page it is about, instead of in a
 * new tab that hides the editor.
 *
 * ## It surfaces the existing help centre — it is not a second one
 *
 * Everything comes from `/api/v1/help/*` and the MDX corpus, through the hooks
 * the help modal uses, and a guide renders through the modal's
 * `HelpArticleBody` (server-rendered HTML, figures, lightbox, "Was this
 * helpful?"). The guides are articles tagged `/pm/website-editor`, so the help
 * centre lists the same ones. `./guides.ts` adds only what is editor code: the
 * group each guide is listed under and what its "Show me" opens.
 *
 * ## Not a modal
 *
 * The PM reads a guide while doing what it says, so the canvas and panels stay
 * usable beside it. Focus moves into the drawer when it opens and returns to
 * the button that opened it when it closes; Escape closes it (after closing an
 * enlarged figure first).
 */

import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { ArrowLeft, ArrowRight, ExternalLink, Search, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { AlertBanner } from '@/components/shared/alert-banner';
import { cn } from '@/lib/utils';
import { HelpArticleBody } from '@/components/help/help-article-body';
import {
  useContextualHelp,
  useHelpArticle,
  useHelpSearch,
  type HelpArticleResult,
} from '@/hooks/use-help';
import type { EditorView } from '../EditorTopBar';
import { HELP_DRAWER_ID, type EditorMode } from '../tools';
import { EDITOR_GUIDES, GUIDE_GROUPS, sortGuides, type HelpAction } from './guides';

export interface HelpDrawerProps {
  communityId: number;
  /** The area on screen, whose guides are listed first. */
  view: EditorView;
  onClose: () => void;
  /** Runs a guide's "Show me". The drawer has already asked to close. */
  onShowMe: (action: HelpAction) => void;
  /**
   * Whether Publish can open. When it cannot, "Open Publish" is left out
   * rather than offered as a button that does nothing.
   */
  canPublish: boolean;
  /** Guided or Free edit: "How you work" switches it, at every screen width. */
  mode: EditorMode;
  onModeChange: (mode: EditorMode) => void;
  /** "Take the 1-minute tour". The drawer has already asked to close. */
  onStartTour: () => void;
}

const MODE_CARDS: readonly { mode: EditorMode; title: string; body: string }[] = [
  { mode: 'guided', title: 'Guided', body: 'A checklist walks you through each step.' },
  { mode: 'free', title: 'Free edit', body: 'Every tool is one click away.' },
];

/**
 * The route the guides are tagged for. A literal, not `usePathname()`:
 * `matchContextPath` compares segment counts exactly, and the guides are about
 * the editor, not whatever URL it happens to be mounted at.
 */
const EDITOR_HELP_PATH = '/pm/website-editor';

/** The route's maximum; about 12 guides are tagged for the editor. */
const GUIDE_LIMIT = 20;

/** Below 2 characters `useHelpSearch` stays disabled. */
const MIN_QUERY_LENGTH = 2;

const TITLE_ID = `${HELP_DRAWER_ID}-title`;

interface OpenGuide {
  category: string;
  slug: string;
}

const ROW_CLASS =
  'flex w-full flex-col gap-1 rounded-[var(--radius-md)] border border-edge p-3 text-left transition-colors duration-quick hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus';

function GuideRow({
  article,
  onOpen,
}: {
  article: HelpArticleResult;
  onOpen: (guide: OpenGuide) => void;
}) {
  return (
    <li>
      <button
        type="button"
        onClick={() => onOpen({ category: article.category, slug: article.slug })}
        className={ROW_CLASS}
      >
        <span className="text-sm font-medium text-content">{article.title}</span>
        {article.description ? (
          <span className="text-sm text-content-secondary">{article.description}</span>
        ) : null}
      </button>
    </li>
  );
}

function GuideList({
  title,
  articles,
  onOpen,
}: {
  title: string;
  articles: readonly HelpArticleResult[];
  onOpen: (guide: OpenGuide) => void;
}) {
  if (articles.length === 0) return null;
  return (
    <section aria-label={title} className="space-y-2">
      <h3 className="text-sm font-semibold text-content">{title}</h3>
      <ul className="space-y-2">
        {articles.map((article) => (
          <GuideRow key={`${article.category}/${article.slug}`} article={article} onOpen={onOpen} />
        ))}
      </ul>
    </section>
  );
}

function ListSkeleton() {
  return (
    <div className="space-y-2" data-testid="help-drawer-loading">
      <Skeleton className="h-16 w-full" />
      <Skeleton className="h-16 w-full" />
      <Skeleton className="h-16 w-full" />
    </div>
  );
}

export function HelpDrawer({
  communityId,
  view,
  onClose,
  onShowMe,
  canPublish,
  mode,
  onModeChange,
  onStartTour,
}: HelpDrawerProps) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState<OpenGuide | null>(null);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);
  // Whatever had focus when the drawer opened — the Help button, in practice.
  const openerRef = useRef<Element | null>(null);

  const trimmed = query.trim();
  const isSearching = trimmed.length >= MIN_QUERY_LENGTH;
  const guidesQuery = useContextualHelp(EDITOR_HELP_PATH, communityId, { limit: GUIDE_LIMIT });
  const search = useHelpSearch(trimmed, communityId);
  const article = useHelpArticle(open?.category ?? null, open?.slug ?? null, communityId);

  const guides = useMemo(() => sortGuides(guidesQuery.data ?? []), [guidesQuery.data]);

  useEffect(() => {
    openerRef.current = document.activeElement;
  }, []);

  // A new screen (home or a guide) starts at its top, with focus on its heading
  // so a screen reader announces where the PM now is.
  useEffect(() => {
    scrollerRef.current?.scrollTo?.({ top: 0 });
    headingRef.current?.focus();
  }, [open]);

  const close = () => {
    const opener = openerRef.current;
    onClose();
    if (opener instanceof HTMLElement && opener.isConnected) opener.focus();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    // The enlarged figure is a nested dialog whose Escape bubbles here through
    // the React tree; it closes itself, and the drawer stays.
    if (event.key !== 'Escape' || lightboxOpen || event.defaultPrevented) return;
    event.preventDefault();
    close();
  };

  const meta = open ? EDITOR_GUIDES[open.slug] : undefined;
  const showMe =
    meta?.showMe && (meta.showMe.action.kind !== 'publish' || canPublish) ? meta.showMe : null;
  const openIndex = open ? guides.findIndex((g) => g.slug === open.slug) : -1;
  const openTitle =
    article.data?.metadata.title ?? (openIndex !== -1 ? guides[openIndex]?.title : undefined);
  const nextGuide =
    openIndex !== -1 && guides.length > 1 ? guides[(openIndex + 1) % guides.length] : null;

  return (
    <aside
      id={HELP_DRAWER_ID}
      aria-labelledby={TITLE_ID}
      onKeyDown={handleKeyDown}
      className="absolute inset-y-0 right-0 z-30 flex w-[420px] group-has-[[data-docked-inspector]]/editor:right-80 max-w-full flex-col border-l border-edge bg-surface-card shadow-lg"
    >
      <div className="flex shrink-0 items-center gap-2 border-b border-edge px-4 py-3">
        {open ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setOpen(null)}
            className="-ml-2"
            data-testid="help-drawer-back"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            All help
          </Button>
        ) : null}
        <h2
          id={TITLE_ID}
          ref={headingRef}
          tabIndex={-1}
          className={
            open
              ? 'sr-only'
              : 'flex-1 text-base font-semibold text-content focus-visible:outline-none'
          }
        >
          {/* In a guide this is announced on arrival, so it names the guide. */}
          {open ? `Help: ${openTitle ?? 'guide'}` : 'Help'}
        </h2>
        <button
          type="button"
          aria-label="Close help"
          onClick={close}
          className="ml-auto flex h-9 w-9 items-center justify-center rounded-[var(--radius-md)] text-content-secondary hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
        >
          <X className="h-[18px] w-[18px]" aria-hidden="true" />
        </button>
      </div>

      <div ref={scrollerRef} className="relative min-h-0 flex-1 overflow-y-auto px-4 py-4">
        {open ? (
          <div className="space-y-5" data-testid="help-drawer-guide">
            {article.isPending ? <ListSkeleton /> : null}
            {article.isError ? (
              <AlertBanner
                status="danger"
                title="We couldn't load this guide."
                description="Try again, or open it in the help centre."
                action={
                  <Button size="sm" variant="outline" onClick={() => void article.refetch()}>
                    Try again
                  </Button>
                }
              />
            ) : null}
            {article.data ? (
              <>
                {meta ? (
                  <p className="text-xs font-semibold uppercase tracking-wide text-content-tertiary">
                    {meta.group}
                  </p>
                ) : null}
                <HelpArticleBody
                  html={article.data.html}
                  metadata={article.data.metadata}
                  related={article.data.related}
                  communityId={communityId}
                  onOpenArticle={(category, slug) => setOpen({ category, slug })}
                  onLightboxOpenChange={setLightboxOpen}
                />
              </>
            ) : null}
            {showMe && article.data ? (
              <Button
                className="w-full"
                onClick={() => {
                  onClose();
                  onShowMe(showMe.action);
                }}
              >
                {showMe.label}
              </Button>
            ) : null}
            {nextGuide && article.data ? (
              <button
                type="button"
                onClick={() => setOpen({ category: nextGuide.category, slug: nextGuide.slug })}
                className={ROW_CLASS}
              >
                <span className="text-xs text-content-tertiary">Next guide</span>
                <span className="flex items-center justify-between gap-2 text-sm font-medium text-content">
                  {nextGuide.title}
                  <ArrowRight className="h-4 w-4 shrink-0" aria-hidden="true" />
                </span>
              </button>
            ) : null}
            <a
              href={`/help/${open.category}/${open.slug}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-sm font-medium text-content-link hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
            >
              Open in the help centre
              <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
            </a>
          </div>
        ) : (
          <div className="space-y-6">
            <div className="relative">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-content-tertiary"
                aria-hidden="true"
              />
              <Input
                type="search"
                aria-label="Search help"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="What do you need help with?"
                className="pl-9"
              />
            </div>

            {isSearching ? (
              <section aria-label="Search results" className="space-y-3">
                {search.isPending ? <ListSkeleton /> : null}
                {search.isError ? (
                  <AlertBanner
                    status="danger"
                    title="We couldn't run that search."
                    description={search.error.message}
                  />
                ) : null}
                {search.data ? (
                  search.data.articles.length === 0 && search.data.faqs.length === 0 ? (
                    <div className="space-y-1">
                      <p className="text-sm font-medium text-content">
                        Nothing found for &ldquo;{trimmed}&rdquo;
                      </p>
                      <p className="text-sm text-content-secondary">
                        Try a simpler word, like page, photo, document or domain.
                      </p>
                    </div>
                  ) : (
                    <>
                      <p className="text-sm text-content-secondary" role="status">
                        {search.data.articles.length}{' '}
                        {search.data.articles.length === 1 ? 'guide' : 'guides'} found
                      </p>
                      <ul className="space-y-2">
                        {search.data.articles.map((a) => (
                          <GuideRow key={`${a.category}/${a.slug}`} article={a} onOpen={setOpen} />
                        ))}
                      </ul>
                      {search.data.faqs.length > 0 ? (
                        <div className="space-y-2">
                          <h3 className="text-sm font-semibold text-content">
                            From your community&rsquo;s FAQs
                          </h3>
                          <ul className="space-y-2">
                            {search.data.faqs.map((faq) => (
                              <li
                                key={faq.id}
                                className="rounded-[var(--radius-md)] border border-edge p-3"
                              >
                                <p className="text-sm font-medium text-content">{faq.question}</p>
                                <p className="mt-1 text-sm text-content-secondary">{faq.answer}</p>
                              </li>
                            ))}
                          </ul>
                        </div>
                      ) : null}
                    </>
                  )
                ) : null}
              </section>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onStartTour();
                  }}
                  className={ROW_CLASS}
                >
                  <span className="text-sm font-medium text-content">Take the 1-minute tour</span>
                  <span className="text-sm text-content-secondary">
                    We point out each part of the screen.
                  </span>
                </button>
                {guidesQuery.isPending ? <ListSkeleton /> : null}
                {/*
                  A failed list is not worth an error banner: search above and
                  the help centre link below still work.
                */}
                {!guidesQuery.isPending && guides.length === 0 ? (
                  <p className="text-sm text-content-secondary">
                    No guides right now. Search above, or open the help centre.
                  </p>
                ) : null}
                <GuideList
                  title={view === 'settings' ? 'Help with Settings' : 'Help with your website'}
                  articles={guides.filter((g) => EDITOR_GUIDES[g.slug]?.views.includes(view))}
                  onOpen={setOpen}
                />
                {GUIDE_GROUPS.map((group) => (
                  <GuideList
                    key={group}
                    title={group}
                    articles={guides.filter((g) => {
                      const m = EDITOR_GUIDES[g.slug];
                      return m?.group === group && !m.views.includes(view);
                    })}
                    onOpen={setOpen}
                  />
                ))}
                <GuideList
                  title="More help"
                  articles={guides.filter((g) => !EDITOR_GUIDES[g.slug])}
                  onOpen={setOpen}
                />
              </>
            )}

            {!isSearching ? (
              <section aria-labelledby="help-drawer-mode" className="space-y-2">
                <h3 id="help-drawer-mode" className="text-sm font-semibold text-content">
                  How you work
                </h3>
                {/* Pressed buttons, not radios: both stay in the Tab order, which the
                    radio pattern's arrow keys would not. */}
                <div role="group" aria-labelledby="help-drawer-mode" className="grid grid-cols-2 gap-2">
                  {MODE_CARDS.map((card) => {
                    const checked = card.mode === mode;
                    return (
                      <button
                        key={card.mode}
                        type="button"
                        aria-pressed={checked}
                        onClick={() => {
                          if (!checked) onModeChange(card.mode);
                        }}
                        className={cn(
                          'flex flex-col gap-1 rounded-[var(--radius-md)] p-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus',
                          checked
                            ? 'border-2 border-interactive'
                            : 'border border-edge hover:bg-surface-hover',
                        )}
                      >
                        <span className="text-sm font-semibold text-content">{card.title}</span>
                        <span className="text-xs text-content-secondary">{card.body}</span>
                      </button>
                    );
                  })}
                </div>
              </section>
            ) : null}

            <div className="space-y-3 border-t border-edge pt-4">
              {/*
                No reply-time promise: the design's "within one business day"
                is stated nowhere else for support, only for sales enquiries.
              */}
              <p className="text-sm text-content-secondary">
                Still stuck? Email{' '}
                <a
                  href="mailto:support@getpropertypro.com"
                  className="font-medium text-content-link hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
                >
                  support@getpropertypro.com
                </a>
                .
              </p>
              <a
                href="/help"
                target="_blank"
                rel="noopener noreferrer"
                data-testid="help-drawer-hub-link"
                className="inline-flex items-center gap-1.5 text-sm font-medium text-content-link hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
              >
                Open the full help centre
                <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
              </a>
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}
