import { StatusBadge } from '@propertypro/design-system';

/**
 * StatusBadge — the shared (apps/web/src/components/shared) badge. It takes a
 * DOMAIN status key and resolves label + icon + colour from STATUS_CONFIG, so
 * status is never colour alone. Props: status, label, size, subtle, dotOnly.
 * The @propertypro/ui sibling is exported as UiStatusBadge.
 */

export const DomainStatuses = () => (
  <div className="flex flex-wrap items-center gap-2">
    <StatusBadge status="compliant" />
    <StatusBadge status="completed" />
    <StatusBadge status="due_soon" />
    <StatusBadge status="in_progress" />
    <StatusBadge status="review" />
    <StatusBadge status="submitted" />
    <StatusBadge status="open" />
    <StatusBadge status="overdue" />
    <StatusBadge status="rejected" />
    <StatusBadge status="draft" />
    <StatusBadge status="closed" />
  </div>
);

export const FilledVsSubtle = () => (
  <div className="flex flex-col gap-4">
    <div className="flex flex-wrap items-center gap-2">
      <span className="w-24 text-xs uppercase tracking-wide text-content-tertiary">Filled</span>
      <StatusBadge status="compliant" />
      <StatusBadge status="due_soon" />
      <StatusBadge status="overdue" />
      <StatusBadge status="submitted" />
      <StatusBadge status="draft" />
    </div>
    <div className="flex flex-wrap items-center gap-2">
      <span className="w-24 text-xs uppercase tracking-wide text-content-tertiary">Subtle</span>
      <StatusBadge status="compliant" subtle />
      <StatusBadge status="due_soon" subtle />
      <StatusBadge status="overdue" subtle />
      <StatusBadge status="submitted" subtle />
      <StatusBadge status="draft" subtle />
    </div>
  </div>
);

export const Sizes = () => (
  <div className="flex flex-wrap items-center gap-3">
    <StatusBadge status="overdue" size="sm" />
    <StatusBadge status="overdue" size="md" />
    <StatusBadge status="overdue" size="lg" />
    <StatusBadge status="completed" label="Notice Posted" size="lg" />
  </div>
);

export const InViolationQueue = () => (
  <div className="w-full max-w-[640px] overflow-hidden rounded-md border border-edge bg-surface-card">
    <div className="flex items-center justify-between border-b border-edge px-4 py-3">
      <span className="text-sm font-semibold text-content">Violations · Palm Shores HOA</span>
      <span className="text-xs text-content-tertiary">14-day hearing notice required</span>
    </div>
    <div className="divide-y divide-edge">
      {[
        { unit: 'Lot 214', issue: 'Unapproved exterior paint colour', status: 'overdue', meta: 'Hearing was due Aug 22' },
        { unit: 'Lot 087', issue: 'Commercial vehicle in driveway', status: 'in_progress', meta: 'Cure period ends Sep 9' },
        { unit: 'Lot 331', issue: 'Fence height exceeds covenant', status: 'review', meta: 'Board packet circulated' },
        { unit: 'Lot 502', issue: 'Trash receptacle left curbside', status: 'satisfied', meta: 'Cured Aug 28' },
      ].map((row) => (
        <div key={row.unit} className="flex items-center justify-between gap-4 px-4 py-3">
          <div className="flex min-w-0 items-center gap-3">
            <StatusBadge status={row.status} dotOnly />
            <div className="min-w-0">
              <div className="text-sm font-medium text-content">{row.issue}</div>
              <div className="text-xs text-content-tertiary">
                {row.unit} · {row.meta}
              </div>
            </div>
          </div>
          <StatusBadge status={row.status} size="sm" />
        </div>
      ))}
    </div>
  </div>
);
