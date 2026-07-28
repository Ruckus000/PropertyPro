'use client';

import { useRef, type KeyboardEvent } from 'react';
import { cn } from '@/lib/utils';
import { EDITOR_TOOLS, TOOL_PLAN_FEATURE, type EditorToolId, type ProToolAccess, type ProToolId } from './tools';

export interface ToolTabsProps {
  active: EditorToolId;
  onSelect: (id: EditorToolId) => void;
  /** Per-tool unlock state — the two Pro tools have separate plan features. */
  proToolAccess: ProToolAccess;
  panelId: string;
}

/**
 * The six tool tabs.
 *
 * Hand-rolled rather than built on `components/ui/tabs.tsx` because these are
 * icon+label tiles in a fixed six-across row, and Radix's Tabs would be
 * fighting the layout the whole way. The ARIA contract is the same and is
 * asserted in tests: `role="tablist"`, roving tabindex, arrow-key traversal
 * that wraps, Home/End, and `aria-controls` pointing at the panel.
 *
 * These tabs carried a pending-change count badge until the count was wired up
 * for real, at which point it was wrong: the badge sat on the Site tab, but
 * since Phase 8 that tab is site settings, whose writes skip the draft layer
 * entirely and so never count. A PM would have seen "4" on Site and found a
 * settings form with nothing pending. The top bar's Publish button and the
 * review sheet already state the pending count; a third, mislocated surface was
 * worse than none.
 */
export function ToolTabs({ active, onSelect, proToolAccess, panelId }: ToolTabsProps) {
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const last = EDITOR_TOOLS.length - 1;
    let next: number | null = null;

    switch (event.key) {
      case 'ArrowRight':
        next = index === last ? 0 : index + 1;
        break;
      case 'ArrowLeft':
        next = index === 0 ? last : index - 1;
        break;
      case 'Home':
        next = 0;
        break;
      case 'End':
        next = last;
        break;
      default:
        return;
    }

    event.preventDefault();
    const tool = EDITOR_TOOLS[next];
    if (!tool) return;
    onSelect(tool.id);
    tabRefs.current[next]?.focus();
  };

  return (
    <div
      role="tablist"
      aria-label="Website tools"
      aria-orientation="horizontal"
      /* Wraps rather than truncates.
       *
       * Six equal tabs do not fit a 280px panel at this app's type scale — the
       * root font-size is 18px (globals.css), so `text-xs` renders ~12.4px and
       * "Sections" alone needs ~57px of a ~51px tab. The design's own note
       * makes the labels a deliberate decision ("tool tabs — labelled"), so
       * clipping them to "Sectio…" is not an option. `min-w-20` forces a wrap
       * to two rows of three on a narrow panel and relaxes back to one row of
       * six once the panel is wide enough. */
      className="flex shrink-0 flex-wrap items-stretch gap-1 border-b border-edge px-2 py-1.5"
    >
      {EDITOR_TOOLS.map((tool, index) => {
        const isActive = tool.id === active;
        const isProTool = tool.id in TOOL_PLAN_FEATURE;
        const isProLocked = isProTool && !proToolAccess[tool.id as ProToolId];
        const Icon = tool.icon;

        return (
          <button
            key={tool.id}
            ref={(node) => {
              tabRefs.current[index] = node;
            }}
            type="button"
            role="tab"
            id={`site-editor-tab-${tool.id}`}
            aria-selected={isActive}
            aria-controls={panelId}
            tabIndex={isActive ? 0 : -1}
            onClick={() => onSelect(tool.id)}
            onKeyDown={(event) => handleKeyDown(event, index)}
            className={cn(
              'relative flex min-w-20 flex-1 flex-col items-center justify-center gap-1 rounded-[var(--radius-md)] px-1 pb-1.5 pt-2 text-xs font-medium leading-tight transition-colors duration-quick',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus',
              isActive
                ? 'bg-interactive-subtle font-semibold text-brand'
                : 'text-content-secondary hover:bg-surface-hover',
            )}
          >
            <Icon className="h-[18px] w-[18px]" aria-hidden="true" />
            <span>{tool.label}</span>
            {isProLocked && <span className="sr-only">Professional feature</span>}
          </button>
        );
      })}
    </div>
  );
}
