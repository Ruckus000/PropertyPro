'use client';

import { useRef, useState, type KeyboardEvent } from 'react';
import { cn } from '@/lib/utils';
import { EDITOR_TOOLS, HELP_RAIL_ITEM, type EditorToolId } from './tools';

const RAIL_ITEMS = [...EDITOR_TOOLS, HELP_RAIL_ITEM];

export interface ToolRailProps {
  /** The open tool, or null when the panel is closed and the canvas has the room. */
  active: EditorToolId | null;
  /**
   * Called with the tool to open, or null to close the panel. Clicking the open
   * tool's button closes it — the v4 rail is a set of disclosures, not tabs.
   */
  onSelect: (id: EditorToolId | null) => void;
  /** Id of the panel the open tool's button controls. */
  panelId: string;
  /**
   * A count to show on a tool — how many things there need attention (the
   * Documents tool's records groups). Absent or 0 shows nothing.
   */
  badges?: Partial<Record<EditorToolId, number>>;
  /** Whether the Help drawer is open; the last tile toggles it. */
  helpOpen: boolean;
  onHelpToggle: () => void;
  /** Id of the Help drawer, for the Help tile's `aria-controls`. */
  helpId: string;
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
export function ToolRail({
  active,
  onSelect,
  panelId,
  badges,
  helpOpen,
  onHelpToggle,
  helpId,
}: ToolRailProps) {
  const buttonRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const activeIndex = active === null ? -1 : RAIL_ITEMS.findIndex((t) => t.id === active);
  // The roving tab stop. Follows the open tool when there is one, otherwise the
  // tile the keyboard last reached — so Tab back into the rail returns there.
  const [focusIndex, setFocusIndex] = useState(0);
  const tabStop = activeIndex === -1 ? focusIndex : activeIndex;

  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const last = RAIL_ITEMS.length - 1;
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
      {RAIL_ITEMS.map((tool, index) => {
        const isHelp = tool.id === HELP_RAIL_ITEM.id;
        const isOpen = isHelp ? helpOpen : tool.id === active;
        const isAdd = tool.id === 'add';
        const Icon = tool.icon;
        const badge = tool.id === 'help' ? 0 : (badges?.[tool.id] ?? 0);
        const label =
          badge > 0
            ? `${tool.label} (${badge} need${badge === 1 ? 's' : ''} attention)`
            : undefined;

        return (
          <button
            key={tool.id}
            ref={(node) => {
              buttonRefs.current[index] = node;
            }}
            type="button"
            data-testid={`site-editor-tool-${tool.id}`}
            aria-expanded={isOpen}
            aria-label={label}
            aria-controls={isOpen ? (isHelp ? helpId : panelId) : undefined}
            tabIndex={index === tabStop ? 0 : -1}
            onClick={() =>
              tool.id === 'help' ? onHelpToggle() : onSelect(isOpen ? null : tool.id)
            }
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
                'relative flex h-9 w-9 items-center justify-center rounded-[var(--radius-md)]',
                // Add is the one filled tile: it is the action the rail exists
                // to make obvious, and the design gives it the brand fill.
                isAdd && 'bg-interactive text-content-inverse',
                !isAdd && isOpen && 'bg-surface-card',
                !isAdd && tool.id === 'notice' && 'text-status-warning',
              )}
            >
              <Icon className="h-5 w-5" aria-hidden="true" />
              {badge > 0 ? (
                <span
                  aria-hidden="true"
                  className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-status-danger px-1 text-xs font-semibold leading-none text-content-inverse"
                >
                  {badge}
                </span>
              ) : null}
            </span>
            <span>{tool.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
