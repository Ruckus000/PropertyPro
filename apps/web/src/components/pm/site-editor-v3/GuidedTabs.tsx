'use client';

import { useRef, type KeyboardEvent } from 'react';
import { ArrowLeft, CircleHelp } from 'lucide-react';
import { cn } from '@/lib/utils';
import { GUIDED_PANEL_ID } from './guided-panel-id';
import { HELP_DRAWER_ID, TOOL_PANEL_TITLES, type EditorToolId } from './tools';

/** The Guided panel's tabs (v4 Phase 3). `null` is Next steps. */
const TABS: readonly { tool: 'pages' | 'design' | null; id: string; label: string }[] = [
  { tool: null, id: 'steps', label: 'Next steps' },
  { tool: 'pages', id: 'pages', label: 'Pages' },
  { tool: 'design', id: 'design', label: 'Design' },
];


export interface GuidedTabsProps {
  activeTool: EditorToolId | null;
  onActiveToolChange: (tool: EditorToolId | null) => void;
  helpOpen: boolean;
  onHelpToggle: () => void;
}

/**
 * The top of the Guided panel: Next steps · Pages · Design, and Help.
 *
 * In Guided mode the panel never closes, so these are real WAI-ARIA tabs (one
 * always selected), unlike the Free-edit rail's disclosures. Help is a button
 * beside the tabs, not a tab: it opens the drawer on the right and leaves the
 * panel showing what it was. A tool the tabs don't name (Add, Sections,
 * Notice, Documents, reached from the checklist or the canvas) keeps Next
 * steps selected, as the design draws it, and gets a way back above its title.
 */
export function GuidedTabs({ activeTool, onActiveToolChange, helpOpen, onHelpToggle }: GuidedTabsProps) {
  const refs = useRef<Array<HTMLButtonElement | null>>([]);
  const selectedIndex = Math.max(
    0,
    TABS.findIndex((t) => t.tool === activeTool),
  );
  // The title of a tool the tabs don't name, or null.
  const otherTitle =
    activeTool !== null && !TABS.some((t) => t.tool === activeTool)
      ? TOOL_PANEL_TITLES[activeTool]
      : null;

  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const last = TABS.length - 1;
    const next =
      event.key === 'ArrowRight'
        ? index === last ? 0 : index + 1
        : event.key === 'ArrowLeft'
          ? index === 0 ? last : index - 1
          : event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? last
              : null;
    if (next === null) return;
    event.preventDefault();
    onActiveToolChange(TABS[next]!.tool);
    refs.current[next]?.focus();
  };

  return (
    <div className="shrink-0 border-b border-edge">
      <div className="flex items-center gap-1 px-2 pt-2">
        <div role="tablist" aria-label="Builder sections" className="flex min-w-0 flex-1 gap-1">
          {TABS.map((tab, index) => {
            const selected = index === selectedIndex;
            return (
              <button
                key={tab.id}
                ref={(node) => {
                  refs.current[index] = node;
                }}
                type="button"
                role="tab"
                id={`guided-tab-${tab.id}`}
                aria-selected={selected}
                aria-controls={GUIDED_PANEL_ID}
                tabIndex={selected ? 0 : -1}
                onClick={() => onActiveToolChange(tab.tool)}
                onKeyDown={(event) => handleKeyDown(event, index)}
                className={cn(
                  '-mb-px min-h-11 whitespace-nowrap border-b-2 px-3 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus',
                  selected
                    ? 'border-interactive text-content'
                    : 'border-transparent text-content-secondary hover:text-content',
                )}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
        <button
          type="button"
          onClick={onHelpToggle}
          aria-expanded={helpOpen}
          aria-controls={helpOpen ? HELP_DRAWER_ID : undefined}
          className="flex min-h-11 items-center gap-1.5 rounded-[var(--radius-md)] px-3 text-sm font-medium text-content-secondary hover:bg-surface-hover hover:text-content focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
        >
          <CircleHelp className="h-4 w-4" aria-hidden="true" />
          Help
        </button>
      </div>
      {otherTitle !== null ? (
        <div className="space-y-1 px-2 py-2">
          <button
            type="button"
            onClick={() => onActiveToolChange(null)}
            className="flex min-h-9 items-center gap-1.5 rounded-[var(--radius-md)] px-2 text-sm font-medium text-content-link hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Back to next steps
          </button>
          <h2 id={`${GUIDED_PANEL_ID}-title`} className="px-2 text-base font-semibold text-content">
            {otherTitle}
          </h2>
        </div>
      ) : (
        // The selected tab already says where the PM is; the heading names the
        // panel for screen readers and for its `aria-labelledby`.
        <h2 id={`${GUIDED_PANEL_ID}-title`} className="sr-only">
          {TABS[selectedIndex]!.label}
        </h2>
      )}
    </div>
  );
}
