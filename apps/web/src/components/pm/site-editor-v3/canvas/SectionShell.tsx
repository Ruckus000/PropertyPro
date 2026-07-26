'use client';

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
  const { isSelected, select, move } = useSiteEditor();

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
      {children}

      {!isHero && (
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
