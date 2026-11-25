/**
 * A row of the Operations hub, in the shape of the shared `RecordRow`, for the
 * rows `RecordRow` cannot hold: one whose title is a control (a request opens
 * its panel, an amenity's name opens its form) or that carries row buttons
 * (Reserve, Cancel). Rows with nothing to press use `RecordRow` itself.
 */
import * as React from 'react';
import { StatusGlyph, type StatusGlyphKind } from '@propertypro/ui/components/shared/status-glyph';
import { getStatusConfig } from '@/lib/constants/status';
import { cn } from '@/lib/utils';

const KIND: Record<string, StatusGlyphKind> = {
  submitted: 'not-started',
  created: 'not-started',
  open: 'not-started',
  acknowledged: 'in-progress',
  assigned: 'in-progress',
  in_progress: 'in-progress',
  confirmed: 'done',
  resolved: 'done',
  completed: 'done',
  closed: 'done',
  cancelled: 'not-started',
};

/** The word and glyph for a request, work-order or reservation status. */
export function operationsStatus(status: string): { kind: StatusGlyphKind; word: string } {
  const config = getStatusConfig(status);
  // A status the shared table does not know is shown as written, not as "Neutral".
  const word =
    config === getStatusConfig('neutral')
      ? status.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase())
      : config.label;
  return { kind: KIND[status] ?? 'not-started', word };
}

/**
 * Lead glyph for a row. The row hides its lead from assistive tech and its meta
 * line says the word, so the glyph carries no second, hidden copy of it.
 */
export function StatusLead({ status }: { status: { kind: StatusGlyphKind } }) {
  return <StatusGlyph kind={status.kind} label="" hideLabel />;
}

/**
 * Title button that makes its whole row the target: an invisible layer is
 * stretched over the row (which is `relative`) and carries the focus ring.
 */
export const ROW_OPEN_BUTTON_CLASS =
  'inline-block max-w-full truncate text-left align-top after:absolute after:inset-0 focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-inset focus-visible:after:ring-focus';

interface OperationsRowProps {
  /** A `StatusLead`, or null. Hidden from assistive tech: the meta line says the word. */
  lead: React.ReactNode;
  /** The caller's own element, so it can be a heading or hold a button. */
  title: React.ReactNode;
  preview?: string | null;
  /** First in the meta line. */
  statusWord?: string;
  /** Joined with " · " after the status word. */
  meta?: string[];
  /** Row buttons, at the right from the `cq-sm` width and under the text below it. */
  actions?: React.ReactNode;
  /** Extra lines under the meta line. */
  children?: React.ReactNode;
  /** Set when the title stretches over the row, so the row shows it can be pressed. */
  openable?: boolean;
}

export function OperationsRow({
  lead,
  title,
  preview,
  statusWord,
  meta = [],
  actions,
  children,
  openable,
}: OperationsRowProps) {
  const rest = meta.filter((part) => part !== '');
  return (
    <li
      className={cn(
        'cq relative flex items-start gap-3 px-4 py-3',
        openable && 'transition-colors duration-quick hover:bg-surface-hover',
      )}
    >
      {lead ? (
        <div className="mt-0.5 shrink-0" aria-hidden="true" inert>
          {lead}
        </div>
      ) : null}
      <div className="flex min-w-0 flex-1 flex-col gap-2 cq-sm:flex-row cq-sm:items-start cq-sm:gap-3">
        <div className="min-w-0 flex-1">
          {title}
          {preview ? <p className="truncate text-sm text-content-secondary">{preview}</p> : null}
          {statusWord || rest.length > 0 ? (
            <p className="text-xs text-content-secondary">
              {statusWord ? <span>{statusWord}</span> : null}
              {statusWord && rest.length > 0 ? ' · ' : null}
              {rest.join(' · ')}
            </p>
          ) : null}
          {children}
        </div>
        {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
    </li>
  );
}
