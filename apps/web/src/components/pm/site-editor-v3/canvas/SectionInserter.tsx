'use client';

import { Plus } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface SectionInserterProps {
  /**
   * Slot the new section lands after. Passed straight through to `onInsert` —
   * the shell that owns the Add panel decides what "after" resolves to.
   */
  afterOrder: number;
  /** Opens the Add panel targeted at this gap. */
  onInsert: (afterOrder: number) => void;
  /** Names the gap for screen readers, e.g. "after the Text section". */
  positionLabel?: string;
  className?: string;
}

/**
 * The thin between-section "add a section here" affordance.
 *
 * Always mounted and always in the tab order; the plus badge is revealed on
 * hover or focus. Hiding it behind `display: none` until hover would make the
 * only way to add a section mid-page a mouse gesture.
 *
 * Not yet wired into `Canvas` — the Add panel that `onInsert` opens is a later
 * slice of this phase. It ships now so the canvas markup and the panel can land
 * independently.
 */
export function SectionInserter({
  afterOrder,
  onInsert,
  positionLabel,
  className,
}: SectionInserterProps) {
  return (
    <div className={cn('group relative flex h-6 items-center justify-center', className)}>
      <span
        aria-hidden="true"
        className="absolute inset-x-0 top-1/2 h-px bg-interactive opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100"
      />
      <button
        type="button"
        onClick={() => onInsert(afterOrder)}
        aria-label={
          positionLabel ? `Add a section ${positionLabel}` : 'Add a section here'
        }
        className={cn(
          'relative z-10 inline-flex h-9 w-9 items-center justify-center rounded-full',
          'border border-edge bg-surface-card text-content-secondary shadow-sm',
          'opacity-0 transition-opacity hover:bg-surface-hover hover:text-content',
          'group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:opacity-100',
          'focus-visible:ring-2 focus-visible:ring-focus',
        )}
      >
        <Plus className="h-4 w-4" aria-hidden="true" />
      </button>
    </div>
  );
}
