'use client';

import { useState } from 'react';
import { ChevronDown, Eye, Monitor, Plus, Smartphone, Tablet, type LucideIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import type { SitePageSummary } from '@/hooks/use-site-pages';

/**
 * The v4 "Editing page" picker's inputs.
 *
 * Every field is required, for the reason `canOpenPublish` is below: an absent
 * handler yields a picker that opens and whose rows do nothing. `pages` is `[]`
 * while the pages read is in flight or has failed, and the picker then offers
 * only "Add or manage pages".
 */
export interface EditorTopBarPageProps {
  pages: readonly SitePageSummary[];
  selectedPageId: number | null;
  onSelectPage: (pageId: number) => void;
  /** Opens the Pages tool. */
  onManagePages: () => void;
  /**
   * Draft changes waiting to publish, shown as a count on the button. The count
   * is display only — whether the sheet OPENS is still `canOpenPublish`, which
   * also covers the diff-failed case where the count is 0.
   */
  changeCount: number;
  /** v4 device preview: the width the canvas renders the page at. */
  device: PreviewDevice;
  onDeviceChange: (device: PreviewDevice) => void;
}

export type PreviewDevice = 'desktop' | 'tablet' | 'phone';

const DEVICES: readonly { id: PreviewDevice; label: string; icon: LucideIcon }[] = [
  { id: 'desktop', label: 'Preview on a computer', icon: Monitor },
  { id: 'tablet', label: 'Preview on a tablet', icon: Tablet },
  { id: 'phone', label: 'Preview on a phone', icon: Smartphone },
];

export interface EditorTopBarProps extends EditorTopBarPageProps {
  communityName: string;
  /**
   * The site page currently being edited (Phase 11b-3).
   *
   * Optional because it is genuinely absent while the pages read is in flight
   * or has failed — not because a caller may skip it. `EditorRoot` always
   * passes `selectedPage?.name`.
   *
   * Load-bearing since the editor became multi-page: every other surface that
   * names what you are editing (the canvas, the preview, the Pages panel) is
   * either scrolled away or behind a tab, so with the Sections tool open there
   * was nothing on screen at all distinguishing page B from the home page —
   * while every write went to page B.
   */
  pageName?: string;
  /** Rendered on the right, before the actions — the save status line (Phase 3). */
  status?: React.ReactNode;
  /** The Florida requirements pill (v4 Phase 2), rendered before `status`. */
  requirements?: React.ReactNode;
  /**
   * Required, for the same reason `canOpenPublish` and `canPreview` below are.
   *
   * These are the other half of each button. A missing `can*` prop yields a
   * button disabled for everyone; a missing handler yields one ENABLED and
   * inert, which is strictly worse — it invites the click and swallows it. Both
   * have exactly one production caller, so requiring them costs nothing and
   * removes the shape that shipped 11b-1's dead publish button.
   */
  onPreview: () => void;
  onPublish: () => void;
  /**
   * Whether Publish opens the review sheet. Required and undefaulted on
   * purpose: this prop shipped optional with a `= 0` default (as `changeCount`)
   * and `EditorRoot` never passed it, so the button was disabled for every PM
   * in production while the shell's own tests — which pass it explicitly —
   * stayed green. A required prop makes forgetting it a compile error.
   *
   * True when there is something to publish, and also when the change model
   * failed to load: the sheet is the only surface that can explain that failure
   * and offer a retry, so a load error must not lock the PM out of it.
   */
  canOpenPublish: boolean;
  /**
   * Whether Preview can render a truthful page.
   *
   * Required and undefaulted for the same reason `canOpenPublish` is.
   *
   * False whenever the dialog would not render, which is TWO states, not one:
   *
   *  - both page reads failed — the dialog is page-scoped, and with no page id
   *    `blocksForPage` returns every page's sections, so the preview would show
   *    a site that exists at no URL while claiming to be "what visitors see
   *    once you publish";
   *  - the canvas context is null — the community row could not be read, and
   *    the dialog is gated on it having a theme to render with.
   *
   * It must track EVERY conjunct of that render gate. It first shipped tracking
   * only the page-read one, which left the button live and inert in the
   * canvas-context state — precisely the "enabled and swallows the click" shape
   * the paragraph below rules out.
   *
   * Disabled with a title rather than hidden, matching Publish — and rather
   * than left enabled over a gated dialog, which would give the PM a button
   * that visibly does nothing.
   */
  canPreview: boolean;
  /**
   * Why Preview is unavailable, in the parent's words.
   *
   * Required alongside `canPreview` rather than hard-coded here, because only
   * the parent knows WHICH conjunct of the render gate is false. A single
   * sentence baked into this file blamed the pages read on a screen where the
   * pages had loaded and the community row had not — advice to retry something
   * that did not fail. Whoever widens the condition must widen the reason.
   */
  previewDisabledReason: string;
  /**
   * Focus destination when the parent hands focus back — see `EditorRoot`'s
   * preview-gate effect, which takes focus to a failure banner and must return
   * it once the banner goes away.
   *
   * Required, for the same reason as `previewDisabledReason` above: the return
   * leg is `queueMicrotask(() => previewButtonRef.current?.focus())`, and
   * `.current` on a ref that was never attached is null. Optional, the prop
   * could be dropped at either seam and the effect would silently no-op —
   * landing the PM on `<body>` at the top of a document whose main surface has
   * just been replaced, which is the exact state that effect exists to prevent.
   * A missing prop must fail typecheck, not fail quietly on a keyboard.
   */
  previewButtonRef: React.Ref<HTMLButtonElement>;
}

/**
 * The editor's own top bar.
 *
 * This route has no app shell, so this bar carries the page identity the
 * breadcrumb trail would otherwise provide. It is the only `<h1>` on the route.
 *
 * Publish is disabled with an explanatory title rather than hidden when there
 * is nothing to publish — a button that vanishes is harder to find again than
 * one that explains itself.
 */
export function EditorTopBar({
  communityName,
  pageName,
  status,
  requirements,
  onPreview,
  onPublish,
  canOpenPublish,
  canPreview,
  previewDisabledReason,
  previewButtonRef,
  pages,
  selectedPageId,
  onSelectPage,
  onManagePages,
  changeCount,
  device,
  onDeviceChange,
}: EditorTopBarProps) {
  return (
    <div className="flex h-[60px] shrink-0 items-center gap-3 border-b border-edge bg-surface-card px-3">
      <span className="flex min-w-0 flex-col leading-tight">
        <h1 className="font-display text-[0.9375rem] font-semibold text-content">Website</h1>
        <span className="truncate text-xs text-content-secondary">{communityName}</span>
      </span>

      <span aria-hidden="true" className="h-7 w-px shrink-0 bg-edge" />

      {/*
       * Outside the `<h1>` on purpose: the heading is the route's identity and
       * must not change every time the PM switches page.
       */}
      <PagePicker
        pageName={pageName}
        pages={pages}
        selectedPageId={selectedPageId}
        onSelectPage={onSelectPage}
        onManagePages={onManagePages}
      />

      {/*
       * Toggle buttons, not a radiogroup: each is independently operable with
       * Tab and Enter, which a three-item control does not need arrow-key
       * roving for. `aria-pressed` carries which width is showing.
       */}
      <div
        role="group"
        aria-label="Preview size"
        className="flex shrink-0 gap-0.5 rounded-[var(--radius-md)] bg-surface-muted p-0.5"
      >
        {DEVICES.map(({ id, label, icon: Icon }) => {
          const active = id === device;
          return (
            <button
              key={id}
              type="button"
              aria-label={label}
              title={label}
              aria-pressed={active}
              onClick={() => onDeviceChange(id)}
              className={cn(
                'flex h-9 w-11 items-center justify-center rounded-[var(--radius-sm)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus',
                active
                  ? 'bg-surface-card text-content shadow-sm'
                  : 'text-content-secondary hover:text-content',
              )}
            >
              <Icon className="h-[18px] w-[18px]" aria-hidden="true" />
            </button>
          );
        })}
      </div>

      {/*
       * Never shrinks. With `min-w-0` here this group was the one flexbox
       * squeezed — below its own content — while the community name kept its
       * full width, so at iPad widths Publish was laid out past the right edge
       * of the screen. The name block (min-w-0, truncating) is the one that
       * gives way now; measured at 768–1440px with a long name and page name.
       */}
      <div className="ml-auto flex shrink-0 items-center gap-2.5">
        {requirements}
        {status}
        <Button
          ref={previewButtonRef}
          variant="outline"
          onClick={onPreview}
          disabled={!canPreview}
          title={canPreview ? 'Preview' : previewDisabledReason}
          // Icon-only below 1024px (the v4 design's rule) so Publish stays on an
          // iPad screen; the name is constant so the button never loses it.
          aria-label="Preview"
          className="px-3 lg:px-4"
        >
          <Eye className="h-4 w-4" aria-hidden="true" />
          <span className="hidden lg:inline">Preview</span>
        </Button>
        <Button
          onClick={onPublish}
          disabled={!canOpenPublish}
          title={canOpenPublish ? undefined : 'Nothing to publish yet'}
          // The badge is a bare number; the name says what it counts.
          aria-label={
            changeCount > 0
              ? `Publish ${changeCount} ${changeCount === 1 ? 'change' : 'changes'}`
              : undefined
          }
        >
          Publish
          {changeCount > 0 ? (
            <span
              aria-hidden="true"
              data-testid="publish-change-count"
              className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-white/20 px-1.5 text-xs"
            >
              {changeCount}
            </span>
          ) : null}
        </Button>
      </div>
    </div>
  );
}

type PagePickerProps = Pick<
  EditorTopBarProps,
  'pageName' | 'pages' | 'selectedPageId' | 'onSelectPage' | 'onManagePages'
>;

/**
 * "Editing page ▾" — switch page without opening the Pages tool.
 *
 * The app's Popover (Radix) supplies Escape, outside-click dismissal, focus
 * return to the trigger and the trigger's `aria-expanded`; this file supplies
 * only the list. Unpublished pages carry "Not published" — the one fact the PM
 * needs before choosing a page visitors cannot see yet.
 */
function PagePicker({
  pageName,
  pages,
  selectedPageId,
  onSelectPage,
  onManagePages,
}: PagePickerProps) {
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="flex h-11 items-center gap-2.5 rounded-[var(--radius-md)] border border-edge bg-surface-card px-3 text-left hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
        >
          <span className="flex flex-col leading-tight">
            <span className="text-xs text-content-tertiary">Editing page</span>
            <span
              className="max-w-[9rem] truncate text-sm font-semibold text-content xl:max-w-[16rem]"
              data-testid="editing-page-name"
            >
              {pageName ?? 'Loading pages…'}
            </span>
          </span>
          <ChevronDown className="h-4 w-4 text-content-tertiary" aria-hidden="true" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" aria-label="Choose a page to edit" className="w-[260px] p-1.5">
        <ul aria-label="Pages" className="flex flex-col">
          {pages.map((page) => {
            const isCurrent = page.id === selectedPageId;
            return (
              <li key={page.id}>
                <button
                  type="button"
                  aria-current={isCurrent ? 'page' : undefined}
                  onClick={() => {
                    if (!isCurrent) onSelectPage(page.id);
                    setOpen(false);
                  }}
                  className={cn(
                    'flex min-h-11 w-full items-center gap-2.5 rounded-[var(--radius-sm)] px-2.5 text-left text-sm font-medium text-content hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus',
                    isCurrent && 'bg-surface-muted',
                  )}
                >
                  <span className="min-w-0 flex-1 truncate">{page.name}</span>
                  {page.isDraft ? (
                    <span className="shrink-0 rounded-full bg-status-warning-bg px-2 py-0.5 text-xs font-semibold text-status-warning">
                      Not published
                    </span>
                  ) : null}
                </button>
              </li>
            );
          })}
        </ul>
        <div aria-hidden="true" className="my-1.5 h-px bg-edge-subtle" />
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            onManagePages();
          }}
          className="flex min-h-11 w-full items-center gap-2 rounded-[var(--radius-sm)] px-2.5 text-sm font-medium text-content-link hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          Add or manage pages
        </button>
      </PopoverContent>
    </Popover>
  );
}
