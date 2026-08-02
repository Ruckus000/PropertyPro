'use client';

import { useState, type DragEvent, type KeyboardEvent } from 'react';
import { ChevronDown, ChevronUp, GripVertical, Layers } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/shared/empty-state';
import { useSiteEditor } from '@/components/pm/site-editor-v3/editor-context';
import { sectionLabel } from '@/components/pm/site-editor-v3/section-label';

const KEYBOARD_HINT_ID = 'site-editor-section-reorder-hint';

interface DragState {
  blockId: number;
  index: number;
}

export interface SectionListProps {
  /** Optional wrapper class — the panel column owns padding, not this list. */
  className?: string;
  /**
   * Switches the shell to the Add tab. Optional so this list still renders
   * standalone, but without it the empty state names an action it cannot
   * perform — which is what it did before the Add panel existed.
   */
  onAddSection?: () => void;
}

/**
 * The Sections tool panel: the community's content sections in slot order, with
 * two equally capable ways to reorder them.
 *
 * **Why native HTML5 drag-and-drop.** `@dnd-kit` is deliberately not a
 * dependency of this route — the editor already ships a canvas, a preview
 * frame and TipTap, and the JS budget has no room for a sortable library to
 * reorder at most a dozen rows. Native `draggable` costs nothing.
 *
 * **Keyboard parity, not a keyboard fallback.** Native drag-and-drop is
 * mouse-only, so every drag affordance has an exact keyboard equal:
 *
 * | Pointer                | Keyboard (on the grip)      |
 * | ---------------------- | --------------------------- |
 * | drag one slot          | Arrow Up / Arrow Down       |
 * | drag across the list   | Home / End                  |
 *
 * Home/End matter: a drag can cross the whole list in one gesture, so an
 * arrows-only keyboard path would be strictly weaker. Both routes go through
 * the same `move` / `moveTo` in `SiteEditorProvider`, so both are announced
 * once by the provider's single live region — this component deliberately
 * renders no live region and announces nothing itself.
 *
 * **The grip's ARIA.** The grip is a plain `<button>` carrying
 * `aria-roledescription="sortable item"`, an accessible name that restates the
 * section's *current* position ("Reorder Text section, position 2 of 4"), and
 * `aria-keyshortcuts`. That combination was chosen over the alternatives
 * because:
 *
 * - `role="listbox"`/`option` with `aria-activedescendant` would mis-describe
 *   the widget — the rows are not a value being chosen, and selection here
 *   opens an editor panel rather than picking an item.
 *   `aria-grabbed`/`aria-dropeffect` are deprecated in ARIA 1.1 and are no
 *   longer implemented by screen readers, so they would announce nothing.
 * - Keeping the position inside the accessible name means the state a
 *   sortable item actually has — where it currently sits — is exposed on the
 *   control itself and re-read on refocus, not only in the transient live
 *   announcement a user may have missed.
 *
 * A visually-hidden instruction (`aria-describedby`) states the shortcuts once
 * for the whole list rather than repeating them on every row.
 *
 * Per-direction chevrons are rendered next to the grip and **disabled, never
 * hidden**, at the ends of the list: a control that vanishes at the boundary
 * makes the row's layout jump and gives no clue why the move stopped working.
 * The grip itself is only disabled when the section cannot move in *either*
 * direction (a one-section list) — disabling it on the first row would take
 * away that row's ability to move *down*.
 */
export function SectionList({ className, onAddSection }: SectionListProps) {
  const { movableSections, isSelected, select, canMove, move, moveTo, isMoving } =
    useSiteEditor();
  const [drag, setDrag] = useState<DragState | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);

  const count = movableSections.length;

  if (count === 0) {
    return (
      <div className={className}>
        <EmptyState
          size="sm"
          icon={Layers}
          // PAGE-scoped, like the list it stands in for. `movableSections` has
          // been narrowed to the selected page since D-C2, so on a PM's second
          // page "Add your first section" / "your site" was flatly false beside
          // a 12-section home page — and contradicted the canvas one column
          // over, which says "This page is empty". Round 5 corrected the canvas
          // copy from a hand-written list of surfaces that did not include this
          // one; this is the same panel's half of that fix.
          title="This page has no sections yet"
          description="Sections you add to this page show up here, ready to reorder."
          action={
            onAddSection && (
              <Button type="button" size="sm" onClick={onAddSection}>
                Add a section
              </Button>
            )
          }
        />
      </div>
    );
  }

  const endDrag = () => {
    setDrag(null);
    setOverIndex(null);
  };

  const handleDragStart = (event: DragEvent<HTMLLIElement>, blockId: number, index: number) => {
    event.dataTransfer?.setData('text/plain', String(blockId));
    if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
    setDrag({ blockId, index });
    setOverIndex(index);
  };

  const handleDragOver = (event: DragEvent<HTMLLIElement>, index: number) => {
    if (!drag) return;
    // Required: without preventDefault the browser refuses the drop outright.
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
    setOverIndex(index);
  };

  const handleDrop = (event: DragEvent<HTMLLIElement>, toOrder: number) => {
    event.preventDefault();
    if (drag) moveTo(drag.blockId, toOrder);
    endDrag();
  };

  const handleGripKeyDown = (event: KeyboardEvent<HTMLButtonElement>, blockId: number) => {
    switch (event.key) {
      case 'ArrowUp':
        event.preventDefault();
        move(blockId, 'up');
        return;
      case 'ArrowDown':
        event.preventDefault();
        move(blockId, 'down');
        return;
      case 'Home': {
        event.preventDefault();
        const first = movableSections[0];
        if (first) moveTo(blockId, first.blockOrder);
        return;
      }
      case 'End': {
        event.preventDefault();
        const last = movableSections[count - 1];
        if (last) moveTo(blockId, last.blockOrder);
        return;
      }
      default:
        // Every other key belongs to the browser (Tab, Enter, typeahead).
        return;
    }
  };

  return (
    <div className={className}>
      <p id={KEYBOARD_HINT_ID} className="sr-only">
        Press Arrow Up or Arrow Down to move this section one position. Press Home to move
        it to the top, or End to move it to the bottom.
      </p>
      <ul aria-label="Page sections" aria-busy={isMoving} className="flex flex-col gap-1">
        {movableSections.map((section, index) => {
          const label = sectionLabel(section.blockType);
          const selected = isSelected(section.id);
          const canUp = canMove(section.id, 'up');
          const canDown = canMove(section.id, 'down');
          const isDragging = drag?.blockId === section.id;
          // The dragged row would land on this slot: draw the seam on the side
          // it is travelling from, so the line reads as "it goes here".
          const showIndicator = drag !== null && overIndex === index && !isDragging;
          const indicatorAbove = drag !== null && drag.index > index;

          return (
            <li
              key={section.id}
              draggable
              onDragStart={(event) => handleDragStart(event, section.id, index)}
              onDragOver={(event) => handleDragOver(event, index)}
              onDrop={(event) => handleDrop(event, section.blockOrder)}
              onDragEnd={endDrag}
              data-block-id={section.id}
              data-testid={`section-row-${section.id}`}
              className={cn(
                'relative flex items-center gap-1 rounded-md border px-1.5 py-1 transition-colors duration-quick',
                selected
                  ? 'border-interactive bg-interactive-subtle'
                  : 'border-edge-subtle bg-surface-card hover:bg-surface-hover',
                isDragging && 'opacity-50',
              )}
            >
              {showIndicator && (
                <span
                  data-testid="section-drop-indicator"
                  aria-hidden="true"
                  className={cn(
                    'pointer-events-none absolute inset-x-1 h-0.5 rounded-full bg-interactive',
                    indicatorAbove ? '-top-1' : '-bottom-1',
                  )}
                />
              )}

              <button
                type="button"
                aria-roledescription="sortable item"
                aria-label={`Reorder ${label} section, position ${index + 1} of ${count}`}
                aria-describedby={KEYBOARD_HINT_ID}
                aria-keyshortcuts="ArrowUp ArrowDown Home End"
                disabled={!canUp && !canDown}
                onKeyDown={(event) => handleGripKeyDown(event, section.id)}
                data-testid={`section-grip-${section.id}`}
                className="flex h-9 w-9 shrink-0 cursor-grab items-center justify-center rounded-sm text-content-tertiary hover:text-content focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus disabled:cursor-default disabled:text-content-disabled"
              >
                <GripVertical className="h-4 w-4" aria-hidden="true" />
              </button>

              <button
                type="button"
                onClick={() => select(section.id)}
                aria-current={selected ? 'true' : undefined}
                className={cn(
                  'flex min-h-9 min-w-0 flex-1 items-center gap-2 rounded-sm px-1 text-left text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus',
                  selected ? 'font-semibold text-content' : 'text-content-secondary',
                )}
              >
                <span className="truncate">{label}</span>
                {section.isDraft && (
                  <span className="shrink-0 rounded-full bg-status-warning-bg px-1.5 py-0.5 text-xs font-medium text-status-warning">
                    Draft
                  </span>
                )}
              </button>

              <button
                type="button"
                disabled={!canUp}
                onClick={() => move(section.id, 'up')}
                aria-label={`Move ${label} section up`}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-sm text-content-tertiary hover:bg-surface-hover hover:text-content focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus disabled:cursor-default disabled:text-content-disabled disabled:hover:bg-transparent"
              >
                <ChevronUp className="h-4 w-4" aria-hidden="true" />
              </button>
              <button
                type="button"
                disabled={!canDown}
                onClick={() => move(section.id, 'down')}
                aria-label={`Move ${label} section down`}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-sm text-content-tertiary hover:bg-surface-hover hover:text-content focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus disabled:cursor-default disabled:text-content-disabled disabled:hover:bg-transparent"
              >
                <ChevronDown className="h-4 w-4" aria-hidden="true" />
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
