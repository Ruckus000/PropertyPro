import { StatusDot } from '@propertypro/design-system';

/**
 * StatusDot — the 8px indicator exported alongside StatusBadge. It takes a
 * StatusVariant and is aria-hidden by design: it is a colour accent, never the
 * whole message, so it always ships next to a written label.
 *
 * Only the six domain-status variants are shown. `owner` and `board` are
 * legal StatusVariants but StatusDot builds its class at runtime
 * (`text-status-x` → `bg-status-x`), and `bg-status-owner` / `bg-status-board`
 * are never written literally anywhere Tailwind scans — so they emit no CSS and
 * render as an invisible dot. Use the ui `Badge` (variant="owner" | "board",
 * which uses arbitrary `var()` values) for those two.
 */

export const VariantLegend = () => (
  <div className="grid max-w-[640px] grid-cols-2 gap-4">
    {[
      { variant: 'success' as const, label: 'Compliant — all records posted' },
      { variant: 'brand' as const, label: 'Featured on the public site' },
      { variant: 'warning' as const, label: 'Due soon — within 7 days' },
      { variant: 'danger' as const, label: 'Overdue — past the 30-day window' },
      { variant: 'info' as const, label: 'Submitted — awaiting board review' },
      { variant: 'neutral' as const, label: 'Draft — not yet published' },
    ].map((row) => (
      <span key={row.variant} className="flex items-center gap-2 text-sm text-content-secondary">
        <StatusDot variant={row.variant} />
        {row.label}
      </span>
    ))}
  </div>
);

export const InMeetingNoticeList = () => (
  <div className="w-full max-w-[560px] overflow-hidden rounded-md border border-edge bg-surface-card">
    <div className="border-b border-edge px-4 py-3">
      <div className="text-sm font-semibold text-content">Meeting notices</div>
      <div className="text-xs text-content-tertiary">
        14 days for owner meetings · 48 hours for board meetings
      </div>
    </div>
    <div className="divide-y divide-edge">
      {[
        { variant: 'success' as const, title: 'Annual Owner Meeting', meta: 'Noticed 21 days ahead', state: 'Notice met' },
        { variant: 'warning' as const, title: 'Budget Workshop', meta: 'Notice posts in 2 days', state: 'Due soon' },
        { variant: 'danger' as const, title: 'Emergency Board Meeting', meta: 'Noticed 12 hours ahead', state: 'Short notice' },
        { variant: 'neutral' as const, title: 'Landscape Committee', meta: 'Draft agenda only', state: 'Draft' },
      ].map((row) => (
        <div key={row.title} className="flex items-center justify-between gap-4 px-4 py-3">
          <span className="flex min-w-0 items-center gap-2">
            <StatusDot variant={row.variant} />
            <span className="min-w-0">
              <span className="block text-sm font-medium text-content">{row.title}</span>
              <span className="block text-xs text-content-tertiary">{row.meta}</span>
            </span>
          </span>
          <span className="shrink-0 text-xs font-medium text-content-secondary">{row.state}</span>
        </div>
      ))}
    </div>
  </div>
);

export const InlineWithText = () => (
  <p className="max-w-xl text-sm leading-relaxed text-content-secondary">
    Sunset Condos is{' '}
    <span className="inline-flex items-center gap-1.5 font-medium text-content">
      <StatusDot variant="success" />
      compliant
    </span>{' '}
    for the current quarter. Two documents are{' '}
    <span className="inline-flex items-center gap-1.5 font-medium text-content">
      <StatusDot variant="warning" />
      due soon
    </span>{' '}
    and one milestone inspection report is{' '}
    <span className="inline-flex items-center gap-1.5 font-medium text-content">
      <StatusDot variant="danger" />
      overdue
    </span>
    .
  </p>
);
