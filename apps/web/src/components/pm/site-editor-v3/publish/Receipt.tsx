'use client';

/**
 * The publish receipt — a persistent record of what a publish attempt did.
 *
 * Deliberately not a toast. A toast is the right affordance for "that worked,
 * carry on" and the wrong one for "your publish failed": it takes the only
 * copy of the error away after four seconds, while the PM is still looking at
 * the sheet wondering whether their site changed. A receipt states what was
 * attempted, what happened, and what to do next, and stays put until the
 * person who read it dismisses it.
 *
 * It is a plain region rather than the shared `AlertBanner` because it carries
 * a third line (`nextStep`) and an action slot that the banner's
 * title/description contract has no place for — and because a receipt that is
 * one `dismissible` prop away from evaporating invites exactly the change this
 * component exists to prevent.
 */

import { AlertTriangle, CheckCircle2, Info, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export type ReceiptStatus = 'success' | 'error' | 'conflict' | 'nothing';

export interface ReceiptProps {
  status: ReceiptStatus;
  /** What was attempted, e.g. "Publishing 3 changes". */
  attempted: string;
  /** What happened. The server's message, verbatim, when there is one. */
  outcome: string;
  /**
   * The individual reasons behind `outcome`, when the server sent any.
   *
   * A `ValidationError` refusing a publish carries a `fields` array naming each
   * offending page and what is wrong with it; `outcome` alone is the summary
   * sentence ("This site cannot be published yet."), which on its own tells the
   * PM nothing they can act on. Rendered as a list rather than folded into
   * `outcome` so several reasons stay several reasons.
   */
  reasons?: readonly string[];
  /** What to do next. Never omitted — a receipt with no next step is a dead end. */
  nextStep: string;
  /** Optional action, e.g. "Try again". */
  action?: React.ReactNode;
  onDismiss: () => void;
  className?: string;
}

const TONE = {
  success: {
    icon: CheckCircle2,
    wrapper: 'border-status-success-border bg-status-success-bg',
    icons: 'text-status-success',
    label: 'Publish succeeded',
  },
  error: {
    icon: AlertTriangle,
    wrapper: 'border-status-danger-border bg-status-danger-bg',
    icons: 'text-status-danger',
    label: 'Publish failed',
  },
  conflict: {
    icon: AlertTriangle,
    wrapper: 'border-status-warning-border bg-status-warning-bg',
    icons: 'text-status-warning',
    label: 'Publish stopped',
  },
  nothing: {
    icon: Info,
    wrapper: 'border-status-info-border bg-status-info-bg',
    icons: 'text-status-info',
    label: 'Nothing published',
  },
} as const;

export function Receipt({
  status,
  attempted,
  outcome,
  reasons,
  nextStep,
  action,
  onDismiss,
  className,
}: ReceiptProps) {
  const tone = TONE[status];
  const Icon = tone.icon;
  const failed = status === 'error' || status === 'conflict';

  return (
    <section
      // `alert` for a failure so a screen reader hears it without hunting;
      // `status` for the quieter outcomes, which must not interrupt.
      role={failed ? 'alert' : 'status'}
      aria-label={tone.label}
      data-testid="publish-receipt"
      className={cn(
        'relative rounded-md border p-4 pr-12 text-sm',
        tone.wrapper,
        className,
      )}
    >
      <div className="flex gap-3">
        <Icon className={cn('mt-0.5 h-5 w-5 shrink-0', tone.icons)} aria-hidden="true" />
        <div className="min-w-0 space-y-1">
          <p className="font-semibold text-content">{tone.label}</p>
          <p className="text-content-secondary">{attempted}</p>
          <p className="text-content break-words">{outcome}</p>
          {reasons && reasons.length > 0 ? (
            <ul
              data-testid="publish-receipt-reasons"
              className="list-disc space-y-1 pl-5 text-content break-words"
            >
              {reasons.map((reason) => (
                <li key={reason}>{reason}</li>
              ))}
            </ul>
          ) : null}
          <p className="text-content-secondary">{nextStep}</p>
          {action ? <div className="pt-2">{action}</div> : null}
        </div>
      </div>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="absolute right-2 top-2"
        onClick={onDismiss}
      >
        <X className="h-4 w-4" aria-hidden="true" />
        <span className="sr-only">Dismiss this receipt</span>
      </Button>
    </section>
  );
}
