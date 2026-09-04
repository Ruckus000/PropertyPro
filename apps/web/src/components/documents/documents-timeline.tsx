'use client';

/**
 * The statutory year, and where each record actually sits in it.
 *
 * One row per requirement, twelve columns for the months. A record's dot sits
 * on its own month; an obligation still open today draws a BAR from that month
 * to the current one — so a missed deadline reads as an exposure with a
 * duration rather than a dot in the past. That span is the whole point of the
 * view.
 *
 * The grid is presentational: the accessible reading of each row is its label
 * plus a text status, not the position of a coloured square. Screen readers get
 * the sentence; the grid is `aria-hidden`.
 */

import type { TimelineRow, TimelineTone } from '@/lib/documents/document-state';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Fully spelled — `guard:class-resolution` fails on a runtime-built class. */
const DOT_TONE: Record<TimelineTone, string> = {
  none: 'border border-dashed border-status-danger bg-transparent rounded-full',
  bad: 'bg-status-danger rounded-full',
  warn: 'bg-status-warning rounded-sm',
  ok: 'bg-status-success rounded-sm',
};

const BAR_TONE: Record<TimelineTone, string> = {
  none: 'bg-status-danger-bg',
  bad: 'bg-status-danger',
  warn: 'bg-status-warning',
  ok: 'bg-status-success-bg',
};

export interface DocumentsTimelineProps {
  rows: TimelineRow[];
  year: number;
  currentMonth: number;
  selectedId: number | null;
  onSelectDocument: (documentId: number) => void;
}

export function DocumentsTimeline({
  rows,
  year,
  currentMonth,
  selectedId,
  onSelectDocument,
}: DocumentsTimelineProps) {
  if (rows.length === 0) {
    return (
      <p className="rounded-md border border-edge bg-surface-card p-6 text-sm text-content-secondary">
        Nothing matches those filters.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <div className="overflow-hidden rounded-md border border-edge bg-surface-card">
        <div className="grid grid-cols-[minmax(9rem,14rem)_minmax(0,1fr)] border-b border-edge bg-surface-subtle">
          <span className="px-3 py-2 text-xs font-medium uppercase tracking-wide text-content-secondary">
            Statutory record
          </span>
          <span className="grid grid-cols-12" aria-hidden="true">
            {MONTHS.map((month, index) => (
              <span
                key={month}
                className={`border-l border-edge py-2 text-center text-xs tabular-nums ${
                  index === currentMonth
                    ? 'bg-interactive-subtle font-medium text-interactive'
                    : 'text-content-tertiary'
                }`}
              >
                {month}
              </span>
            ))}
          </span>
        </div>

        {rows.map((row) => (
          <button
            key={row.requirement.id}
            type="button"
            onClick={() => {
              if (row.document) onSelectDocument(row.document.id);
            }}
            aria-pressed={row.document ? selectedId === row.document.id : false}
            className={`grid w-full grid-cols-[minmax(9rem,14rem)_minmax(0,1fr)] border-b border-edge text-left last:border-b-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-interactive ${
              row.document && selectedId === row.document.id
                ? 'bg-interactive-subtle'
                : 'hover:bg-surface-hover'
            }`}
          >
            <span className="min-w-0 px-3 py-2">
              <span className="block truncate text-sm font-medium text-content">
                {row.requirement.title}
              </span>
              <span className="block truncate text-xs tabular-nums text-content-tertiary">
                {row.requirement.statuteReference ?? '—'}
                {' · '}
                {MONTHS[row.monthIndex]}
                {' · '}
                {row.label}
              </span>
            </span>

            <span className="relative grid grid-cols-12 items-center" aria-hidden="true">
              {MONTHS.map((month, index) => (
                <span
                  key={month}
                  className={`h-full border-l border-edge ${
                    index === currentMonth ? 'bg-interactive-subtle' : ''
                  }`}
                />
              ))}

              {row.bar && (
                <span
                  className={`absolute h-1.5 rounded-full ${BAR_TONE[row.tone]}`}
                  style={{
                    left: `${(row.bar.from / 12) * 100}%`,
                    width: `${((row.bar.to - row.bar.from + 1) / 12) * 100}%`,
                  }}
                />
              )}

              <span
                data-testid="timeline-dot"
                data-tone={row.tone}
                className={`absolute size-2.5 ${DOT_TONE[row.tone]}`}
                style={{ left: `calc(${((row.monthIndex + 0.5) / 12) * 100}% - 5px)` }}
              />
            </span>
          </button>
        ))}
      </div>

      <p className="rounded-md border border-edge bg-surface-subtle px-3 py-2 text-xs text-content-secondary">
        {year} · {rows.length} {rows.length === 1 ? 'record' : 'records'} · a coloured span is an
        exposure still open today
      </p>
    </div>
  );
}
