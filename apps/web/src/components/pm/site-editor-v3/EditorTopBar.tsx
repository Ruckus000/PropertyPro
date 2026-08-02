'use client';

import { Eye } from 'lucide-react';
import { Button } from '@/components/ui/button';

export interface EditorTopBarProps {
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
  onPreview?: () => void;
  onPublish?: () => void;
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
   * Required and undefaulted for the same reason `canOpenPublish` is. False
   * only when both page reads failed: the dialog is page-scoped, and with no
   * page id `blocksForPage` returns every page's sections, so the preview shows
   * a site that exists at no URL while claiming to be "what visitors see once
   * you publish".
   *
   * Disabled with a title rather than hidden, matching Publish — and rather
   * than left enabled over a gated dialog, which would give the PM a button
   * that visibly does nothing.
   */
  canPreview: boolean;
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
  onPreview,
  onPublish,
  canOpenPublish,
  canPreview,
}: EditorTopBarProps) {
  return (
    <div className="flex h-[52px] shrink-0 items-center gap-3 border-b border-edge bg-surface-card px-3.5">
      <span className="flex min-w-0 flex-col leading-tight">
        <h1 className="font-display text-[0.9375rem] font-semibold text-content">Website</h1>
        <span className="truncate text-xs text-content-secondary">{communityName}</span>
      </span>

      {/*
       * Outside the `<h1>`'s span rather than inside it: the heading is the
       * route's identity and the breadcrumb trail's leaf, and it must not
       * change every time the PM clicks a different page in the Pages panel.
       */}
      {pageName ? (
        <span className="flex min-w-0 items-center gap-1.5 text-xs text-content-secondary">
          <span aria-hidden="true">/</span>
          <span className="truncate font-medium text-content" data-testid="editing-page-name">
            {pageName}
          </span>
        </span>
      ) : null}

      <div className="ml-auto flex min-w-0 items-center gap-2.5">
        {status}
        <Button
          variant="outline"
          size="sm"
          onClick={onPreview}
          disabled={!canPreview}
          title={canPreview ? undefined : "We couldn't load this site's pages"}
        >
          <Eye className="h-4 w-4" aria-hidden="true" />
          Preview
        </Button>
        <Button
          onClick={onPublish}
          disabled={!canOpenPublish}
          title={canOpenPublish ? undefined : 'Nothing to publish yet'}
        >
          Publish…
        </Button>
      </div>
    </div>
  );
}
