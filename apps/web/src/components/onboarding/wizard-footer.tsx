import type { ReactNode } from 'react';
import { Check } from 'lucide-react';

interface WizardFooterProps {
  /** Optional reassurance note shown on the left (hidden on narrow viewports). */
  note?: string;
  /** Action controls (primary button, optional back link). Right-aligned. */
  children: ReactNode;
}

/**
 * Sticky action bar anchored to the bottom of a wizard step's right pane.
 * Padding matches the step body so the note aligns with the form's left edge.
 */
export function WizardFooter({ note, children }: WizardFooterProps) {
  return (
    <div className="sticky bottom-0 z-10 flex items-center justify-between gap-4 border-t border-edge-subtle bg-surface-card px-6 py-4 sm:px-10 lg:px-14">
      {note ? (
        <span className="hidden items-center gap-2 text-xs text-content-tertiary sm:flex">
          <Check className="h-4 w-4 text-status-success" aria-hidden="true" />
          {note}
        </span>
      ) : (
        <span aria-hidden="true" />
      )}
      <div className="flex items-center gap-3">{children}</div>
    </div>
  );
}
