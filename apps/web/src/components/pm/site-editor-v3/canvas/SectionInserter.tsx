'use client';

import { Plus } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface SectionInserterProps {
  /** Label of the section the new one would go above — for the accessible name. */
  beforeLabel: string;
  onInsert: () => void;
}

/**
 * v4 "Add section here": a pill sitting on the seam between two sections.
 *
 * A zero-height row so it does not push the page apart — the canvas must keep
 * rendering what visitors will see. The pill overlaps the seam instead.
 *
 * Always mounted and always in the tab order, at reduced opacity until hover or
 * focus, for the same reason `FloatControls` is: a control that only exists
 * under the mouse can never be reached from the keyboard.
 */
export function SectionInserter({ beforeLabel, onInsert }: SectionInserterProps) {
  return (
    <div className="relative z-20 h-0">
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          onInsert();
        }}
        aria-label={`Add a section above ${beforeLabel}`}
        className={cn(
          'absolute left-1/2 top-0 flex h-9 -translate-x-1/2 -translate-y-1/2 items-center gap-1.5 rounded-full border border-edge-strong bg-surface-card pl-2.5 pr-3.5 text-xs font-semibold text-content-secondary shadow-sm',
          'opacity-60 transition-opacity duration-quick hover:border-interactive hover:text-content hover:opacity-100',
          'focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus',
        )}
      >
        <Plus className="h-4 w-4" aria-hidden="true" />
        Add section here
      </button>
    </div>
  );
}
