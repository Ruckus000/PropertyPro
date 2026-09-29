'use client';

import { EyeOff } from 'lucide-react';
import { usePublishedBlocks } from '@/hooks/use-content-blocks';
import { describeHiddenSection } from '@/lib/site-editor/describe-section-state';
import { cn } from '@/lib/utils';
import type { SiteBlockSummary } from '@/hooks/use-content-blocks';
import { useSiteEditor } from '../editor-context';
import { sectionLabel } from '../section-label';
import { FloatControls } from './FloatControls';
import { HERO_BLOCK_ORDER } from './use-canvas-selection';

export interface SectionShellProps {
  /** The block this shell wraps. */
  block: SiteBlockSummary;
  /** Needed by FloatControls' community-scoped delete mutation. */
  communityId: number;
  /** The rendered block — a `CanvasBlock`. */
  children: React.ReactNode;
}

/**
 * Selection chrome around one rendered section on the canvas.
 *
 * The section is a focusable stop in the tab order rather than a click-only
 * region: the whole thing is clickable for the mouse, and Enter/Space selects
 * for the keyboard. `Alt+Arrow` moves the selected section — Alt because the
 * bare arrows belong to the page (and to any editable content inside the
 * block), and a modifier keeps the reorder gesture out of their way.
 *
 * Bounds are *not* re-checked here. `move` in the editor context already treats
 * the first-up and last-down cases as silent no-ops, and duplicating that test
 * is how the canvas and the Sections panel end up disagreeing about what is at
 * the top of the list.
 *
 * The hero is selectable — a PM still needs to open its inspector — but has no
 * controls: it is pinned to slot 1 and cannot be reordered or removed.
 */
export function SectionShell({ block, communityId, children }: SectionShellProps) {
  const { isSelected, select, move, toggleHidden } = useSiteEditor();
  const isHidden = isHiddenContent(block.content);
  // The PUBLISHED row at this slot decides what the placeholder may claim —
  // see `describeHiddenSection`. Same read and match as `FloatControls`, and it
  // shares the blocks query key, so it costs no request.
  const { data: publishedBlocks } = usePublishedBlocks(communityId);
  const publishedRow = isHidden
    ? (publishedBlocks ?? []).find(
        (row) => row.pageId === block.pageId && row.blockOrder === block.blockOrder,
      )
    : undefined;
  const hiddenSentence = describeHiddenSection(
    publishedRow === undefined ? 'none' : isHiddenContent(publishedRow.content) ? 'hidden' : 'shown',
  );

  const selected = isSelected(block.id);
  const isHero = block.blockType === 'hero' || block.blockOrder === HERO_BLOCK_ORDER;
  const label = sectionLabel(block.blockType);

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Enter' || event.key === ' ') {
      // Only when the section itself has focus — Enter on a nested control
      // (or inside a future inline editor) must not be swallowed here.
      if (event.target !== event.currentTarget) return;
      event.preventDefault();
      select(block.id);
      return;
    }

    if (!event.altKey) return;
    if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
    if (!selected) return;

    event.preventDefault();
    move(block.id, event.key === 'ArrowUp' ? 'up' : 'down');
  };

  return (
    <div
      role="group"
      tabIndex={0}
      aria-label={`${label} section`}
      data-selected={selected || undefined}
      data-block-id={block.id}
      onClick={() => select(block.id)}
      onKeyDown={handleKeyDown}
      className={cn(
        'group relative cursor-pointer outline-none ring-inset transition-shadow',
        'hover:ring-2 hover:ring-edge-strong',
        'focus-visible:ring-2 focus-visible:ring-focus',
        selected && 'ring-2 ring-interactive hover:ring-interactive',
      )}
    >
      {selected && !isHidden ? (
        <span
          data-testid="selected-section-label"
          className="pointer-events-none absolute left-2.5 top-2.5 z-10 rounded-[var(--radius-sm)] bg-interactive px-2.5 py-1 text-xs font-semibold text-content-inverse"
        >
          {label}
        </span>
      ) : null}

      {/*
       * A hidden section is not rendered at all on the canvas — an absent
       * section cannot be found again. It collapses instead to a placeholder
       * whose sentence comes from `describeHiddenSection`, with the way back
       * right there. The block itself stays selectable for its inspector.
       *
       * Its controls sit INLINE in the placeholder row rather than floating at
       * the top-right corner: the placeholder is only one row tall, so the
       * floating cluster would cover "Show again" — the one control a PM looking
       * at a hidden section most wants. The name chip is skipped for the same
       * reason; the placeholder already names the section.
       */}
      {isHidden ? (
        <div
          data-testid="hidden-section-placeholder"
          className="mx-4 my-2 flex flex-wrap items-center gap-2.5 rounded-[var(--radius-md)] border border-dashed border-edge-strong bg-surface-subtle px-3.5 py-3"
        >
          <EyeOff className="h-[18px] w-[18px] shrink-0 text-content-tertiary" aria-hidden="true" />
          <span className="min-w-[12rem] flex-1 text-sm text-content-secondary">
            <strong className="font-semibold text-content">{label}</strong> {hiddenSentence.text}
          </span>
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              toggleHidden(block.id, false);
            }}
            className="min-h-9 rounded-[var(--radius-md)] border border-edge bg-surface-card px-3 text-xs font-semibold text-content hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
          >
            Show again
          </button>
          {isHero ? null : <FloatControls block={block} communityId={communityId} />}
        </div>
      ) : (
        children
      )}

      {!isHero && !isHidden && (
        <FloatControls
          block={block}
          communityId={communityId}
          className={cn(
            'absolute right-3 top-3 z-10 opacity-0 transition-opacity',
            'group-hover:opacity-100 group-focus-within:opacity-100',
            selected && 'opacity-100',
          )}
        />
      )}
    </div>
  );
}

/** `hidden` is `z.literal(true).optional()`, so only an exact `true` hides. */
function isHiddenContent(content: unknown): boolean {
  return (
    content !== null &&
    typeof content === 'object' &&
    (content as { hidden?: unknown }).hidden === true
  );
}
