'use client';

import { useEffect, useRef } from 'react';
import dynamic from 'next/dynamic';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useMediaQuery } from '@/hooks/use-media-query';
import { cn } from '@/lib/utils';
import { useSiteEditor } from './editor-context';
import { sectionLabel } from './section-label';
import { InspectorBody } from './inspector/InspectorBody';

// Code-split: the Radix dialog stack behind the overlay is ~27 KiB and is only
// reachable below 1280px, on a route already at 684 KiB of a 700 KiB hard
// budget. Docked PMs never download it. See InspectorSheet's header.
const InspectorSheet = dynamic(
  () => import('./InspectorSheet').then((m) => m.InspectorSheet),
  // No `loading`: the overlay is already a transient surface, and a skeleton
  // sheet sliding in before the real one would be worse than a brief nothing.
  { loading: () => null },
);

/**
 * One-line orientation for the overlay sheet's `SheetDescription`.
 *
 * The sheet needs a plain-string `aria-describedby` target regardless of which
 * form renders below it, so this is generic rather than per-block.
 */
const SHEET_DESCRIPTION = 'Edit this section. Changes save automatically.';

export interface InspectorProps {
  communityId: number;
  /** Extra classes for the docked column. Ignored in overlay mode. */
  className?: string;
}

/**
 * Settings column for the selected section.
 *
 * Two presentations of the same content: a third column docked beside the
 * canvas at >=1280px, and a right-hand overlay sheet below that, where three
 * columns no longer fit without squeezing the canvas into uselessness.
 */
export function Inspector({ communityId, className }: InspectorProps) {
  const { selection, clear, blocks } = useSiteEditor();

  // Deliberately phrased as max-width, not min-width — the same inversion
  // EditorShell uses for its phone gate, for the same reason.
  //
  // `useMediaQuery` returns false on the server and on the first client render
  // so hydration matches. Asking `(min-width: 1280px)` would therefore make the
  // OVERLAY the server-rendered output for every user, and every wide PM would
  // watch the panel flip from sheet to column one effect after hydration. The
  // editor is already phone-gated below 768px, so wide is the common case:
  // inverting the query puts that initial false on "docked".
  const isNarrow = useMediaQuery('(max-width: 1279px)');

  const isOpen = selection !== null;

  // Focus return in DOCKED mode.
  //
  // There is no Radix dialog here, so nothing restores focus for us — and the
  // inspector never sees the trigger, because the selection arrives through
  // context from whichever surface set it (a canvas section, the Sections
  // list, a keyboard move). Rather than plumb a ref through the context we
  // remember whatever had focus when the section was selected and put focus
  // back there on close.
  //
  // Keyed on the selected id, not just open/closed: selecting a second section
  // while the panel is already open makes THAT section the trigger. Capturing
  // only on the closed->open edge would leave the ref on the first section, and
  // closing would then drag focus backwards to a section the PM had moved on
  // from.
  //
  // Overlay mode is excluded: Radix already traps, inerts and restores focus,
  // and a second focus manager would fight it.
  const panelRef = useRef<HTMLElement | null>(null);
  const triggerRef = useRef<HTMLElement | null>(null);
  const selectedId = selection?.blockId ?? null;
  useEffect(() => {
    if (isNarrow) return;
    if (selectedId !== null) {
      const active = document.activeElement;
      // Don't capture our own close button as the trigger — that would make
      // closing restore focus to an element that is about to unmount.
      if (active instanceof HTMLElement && !panelRef.current?.contains(active)) {
        triggerRef.current = active;
      }
      return;
    }
    const trigger = triggerRef.current;
    triggerRef.current = null;
    // Only pull focus back if it is somewhere the close left it stranded —
    // inside the now-unmounted panel, or nowhere at all. If the PM has already
    // moved focus elsewhere, stealing it back would be the more annoying bug.
    const active = document.activeElement;
    const stranded = active === null || active === document.body;
    if (trigger?.isConnected && stranded) trigger.focus();
  }, [isNarrow, selectedId]);

  // Esc in docked mode. Bound to the document rather than the panel because the
  // PM's focus is usually still on the canvas section they just clicked.
  useEffect(() => {
    if (isNarrow || !isOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') clear();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [clear, isNarrow, isOpen]);

  if (!selection) return null;

  const label = sectionLabel(selection.blockType);

  // Content comes from the blocks the canvas is already rendering, so opening
  // the inspector costs no extra request. `selection.blockId` is re-resolved
  // every render by `useCanvasSelection`, so this cannot go stale.
  const body = (
    <InspectorBody
      communityId={communityId}
      blockType={selection.blockType}
      blockOrder={selection.blockOrder}
      content={blocks.find((b) => b.id === selection.blockId)?.content}
    />
  );

  if (isNarrow) {
    return (
      <InspectorSheet label={label} description={SHEET_DESCRIPTION} onClose={clear}>
        {body}
      </InspectorSheet>
    );
  }

  return (
    <aside
      ref={panelRef}
      aria-label={`${label} settings`}
      className={cn(
        'flex min-h-0 w-80 shrink-0 flex-col border-l border-edge bg-surface-card',
        className,
      )}
    >
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-edge px-4 py-3">
        <h2 className="text-base font-semibold text-content">{label} settings</h2>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={clear}
          aria-label="Close settings"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </Button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-4">{body}</div>
    </aside>
  );
}
