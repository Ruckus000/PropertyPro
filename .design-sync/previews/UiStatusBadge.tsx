import { UiStatusBadge } from '@propertypro/design-system';

/**
 * UiStatusBadge — the @propertypro/ui StatusBadge. It wraps the ui `Badge`
 * (pill, uppercase, tracked) and resolves label + inline SVG icon from the same
 * STATUS_CONFIG. Props: status, size, showIcon, showLabel. The shared/ sibling
 * — different shape, different props (subtle, dotOnly) — is exported as
 * StatusBadge.
 */

export const DomainStatuses = () => (
  <div className="flex flex-wrap items-center gap-2">
    <UiStatusBadge status="compliant" />
    <UiStatusBadge status="certified" />
    <UiStatusBadge status="due_soon" />
    <UiStatusBadge status="in_progress" />
    <UiStatusBadge status="review" />
    <UiStatusBadge status="submitted" />
    <UiStatusBadge status="confirmed" />
    <UiStatusBadge status="overdue" />
    <UiStatusBadge status="rejected" />
    <UiStatusBadge status="draft" />
    <UiStatusBadge status="not_applicable" />
  </div>
);

export const Sizes = () => (
  <div className="flex flex-wrap items-center gap-3">
    <UiStatusBadge status="overdue" size="sm" />
    <UiStatusBadge status="overdue" size="md" />
    <UiStatusBadge status="overdue" size="lg" />
    <UiStatusBadge status="compliant" size="lg" />
  </div>
);

export const IconAndLabelToggles = () => (
  <div className="flex flex-col gap-4">
    <div className="flex flex-wrap items-center gap-3">
      <span className="w-40 text-xs uppercase tracking-wide text-content-tertiary">Icon + label</span>
      <UiStatusBadge status="compliant" />
      <UiStatusBadge status="due_soon" />
      <UiStatusBadge status="overdue" />
    </div>
    <div className="flex flex-wrap items-center gap-3">
      <span className="w-40 text-xs uppercase tracking-wide text-content-tertiary">Label only</span>
      <UiStatusBadge status="compliant" showIcon={false} />
      <UiStatusBadge status="due_soon" showIcon={false} />
      <UiStatusBadge status="overdue" showIcon={false} />
    </div>
    <div className="flex flex-wrap items-center gap-3">
      <span className="w-40 text-xs uppercase tracking-wide text-content-tertiary">
        Icon only (aria-label carries the status)
      </span>
      <UiStatusBadge status="compliant" showLabel={false} />
      <UiStatusBadge status="due_soon" showLabel={false} />
      <UiStatusBadge status="overdue" showLabel={false} />
    </div>
  </div>
);

export const InComplianceChecklist = () => (
  <div className="w-full max-w-[560px] overflow-hidden rounded-md border border-edge bg-surface-card">
    <div className="border-b border-edge px-4 py-3">
      <div className="text-sm font-semibold text-content">Website posting checklist</div>
      <div className="text-xs text-content-tertiary">Documents must be posted within 30 days of creation</div>
    </div>
    <div className="divide-y divide-edge">
      {[
        { doc: 'Declaration & Bylaws', status: 'compliant' },
        { doc: 'Annual Budget (FY2026)', status: 'compliant' },
        { doc: 'Board Meeting Minutes — Aug', status: 'due_soon' },
        { doc: 'Structural Integrity Reserve Study', status: 'overdue' },
        { doc: 'Executed Vendor Contracts', status: 'draft' },
      ].map((row) => (
        <div key={row.doc} className="flex items-center justify-between gap-4 px-4 py-3">
          <span className="min-w-0 text-sm text-content">{row.doc}</span>
          <UiStatusBadge status={row.status} size="sm" />
        </div>
      ))}
    </div>
  </div>
);
