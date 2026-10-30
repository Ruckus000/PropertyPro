'use client';

import { Plus } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface SectionInserterProps {
  /** Label of the section the new one would follow — for the accessible name. */
  afterLabel: string;
  /** Called with the button, so the Add a part dialog can hand focus back to it. */
  onInsert: (opener: HTMLElement) => void;
}

/**
 * "Add a part": a pill sitting on the seam between two sections.
 *
 * A zero-height row so it does not push the page apart — the canvas must keep
 * rendering what visitors will see. The pill overlaps the seam instead.
 *
 * Named by position ("Add a part after Hero"), since every one of them reads
 * "Add a part" on screen. Always mounted and always in the tab order, at
 * reduced opacity until hover or focus, for the same reason `FloatControls`
 * is: a control that only exists under the mouse can never be reached from the
 * keyboard. 44px tall below 768px, the touch-target rule.
 */
export function SectionInserter({ afterLabel, onInsert }: SectionInserterProps) {
  return (
    <div className="relative z-20 h-0">
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          onInsert(event.currentTarget);
        }}
        aria-label={`Add a part after ${afterLabel}`}
        className={cn(
          'absolute left-1/2 top-0 flex h-11 -translate-x-1/2 -translate-y-1/2 items-center gap-1.5 rounded-full border border-edge-strong bg-surface-card pl-2.5 pr-3.5 text-xs font-semibold text-content-secondary shadow-sm md:h-9',
          // `border-edge-focus`, not `border-interactive`: inside the canvas frame
          // the `interactive` token is the community's primary colour (see
          // site-theme-css-vars.ts), so editor chrome must not depend on it.
          'opacity-60 transition-opacity duration-quick hover:border-edge-focus hover:text-content hover:opacity-100',
          'focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus',
        )}
      >
        <Plus className="h-4 w-4" aria-hidden="true" />
        Add a part
      </button>
    </div>
  );
}
