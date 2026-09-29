'use client';

import { useRef, useState, type KeyboardEvent } from 'react';
import { cn } from '@/lib/utils';
import {
  EDITOR_TOOLS,
  TOOL_PLAN_FEATURE,
  type EditorToolId,
  type ProToolAccess,
  type ProToolId,
} from './tools';

export interface ToolRailProps {
  /** The open tool, or null when the panel is closed and the canvas has the room. */
  active: EditorToolId | null;
  /**
   * Called with the tool to open, or null to close the panel. Clicking the open
   * tool's button closes it — the v4 rail is a set of disclosures, not tabs.
   */
  onSelect: (id: EditorToolId | null) => void;
  /** Per-tool unlock state — the two Pro tools have separate plan features. */
  proToolAccess: ProToolAccess;
  /** Id of the panel the open tool's button controls. */
  panelId: string;
}

/**
 * The v4 builder's vertical tool rail: labelled icon tiles down the left edge.
 *
 * Disclosure buttons (`aria-expanded` + `aria-controls`) rather than the v3
 * `tablist`, because the panel can now be CLOSED — a tablist always has exactly
 * one selected tab, and "nothing open, canvas full width" is the rail's resting
 * state in the design. The buttons still behave as one composite widget for the
 * keyboard: a single tab stop with Up/Down/Home/End moving focus, so a keyboard
 * PM does not have to Tab through eight tiles to reach the canvas.
 *
 * Arrow keys move FOCUS only and do not open panels. Opening on focus would
 * mount a panel (and fetch its code-split chunk) for every tile an arrow key
 * passes over.
 */
export function ToolRail({ active, onSelect, proToolAccess, panelId }: ToolRailProps) {
  const buttonRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const activeIndex = active === null ? -1 : EDITOR_TOOLS.findIndex((t) => t.id === active);
  // The roving tab stop. Follows the open tool when there is one, otherwise the
  // tile the keyboard last reached — so Tab back into the rail returns there.
  const [focusIndex, setFocusIndex] = useState(0);
  const tabStop = activeIndex === -1 ? focusIndex : activeIndex;

  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const last = EDITOR_TOOLS.length - 1;
    let next: number;
    switch (event.key) {
      case 'ArrowDown':
        next = index === last ? 0 : index + 1;
        break;
      case 'ArrowUp':
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
    setFocusIndex(next);
    buttonRefs.current[next]?.focus();
  };

  return (
    <nav
      aria-label="Website tools"
      className="flex w-[84px] shrink-0 flex-col gap-1 overflow-y-auto border-r border-edge bg-surface-card px-2 py-2.5"
    >
      {EDITOR_TOOLS.map((tool, index) => {
        const isOpen = tool.id === active;
        const isProLocked =
          tool.id in TOOL_PLAN_FEATURE && !proToolAccess[tool.id as ProToolId];
        const isAdd = tool.id === 'add';
        const Icon = tool.icon;

        return (
          <button
            key={tool.id}
            ref={(node) => {
              buttonRefs.current[index] = node;
            }}
            type="button"
            data-testid={`site-editor-tool-${tool.id}`}
            aria-expanded={isOpen}
            // A locked Pro tool is labelled, not disabled: its panel explains
            // the plan and offers the upgrade.
            aria-label={isProLocked ? `${tool.label} (Professional feature)` : undefined}
            aria-controls={isOpen ? panelId : undefined}
            tabIndex={index === tabStop ? 0 : -1}
            onClick={() => onSelect(isOpen ? null : tool.id)}
            onFocus={() => setFocusIndex(index)}
            onKeyDown={(event) => handleKeyDown(event, index)}
            className={cn(
              'flex min-h-16 flex-col items-center justify-center gap-1 rounded-[var(--radius-md)] text-xs font-medium leading-tight transition-colors duration-quick',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus',
              isOpen
                ? 'bg-interactive-subtle text-content-brand'
                : 'text-content-secondary hover:bg-surface-hover hover:text-content',
            )}
          >
            <span
              className={cn(
                'flex h-9 w-9 items-center justify-center rounded-[var(--radius-md)]',
                // Add is the one filled tile: it is the action the rail exists
                // to make obvious, and the design gives it the brand fill.
                isAdd && 'bg-interactive text-content-inverse',
                !isAdd && isOpen && 'bg-surface-card',
                !isAdd && tool.id === 'notice' && 'text-status-warning',
              )}
            >
              <Icon className="h-5 w-5" aria-hidden="true" />
            </span>
            <span>{tool.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
