import {
  BulkActionBar,
  Checkbox,
  ShadcnBadge,
} from '@propertypro/design-system';
import { FolderInput, Send, Trash2, Download, Ban } from 'lucide-react';

const noop = () => {};

const Row = ({
  title,
  meta,
  badge,
  selected,
}: {
  title: string;
  meta: string;
  badge: string;
  selected?: boolean;
}) => (
  <div className="flex items-center gap-3 border-b border-edge px-4 py-3 last:border-0">
    <Checkbox defaultChecked={selected} aria-label={`Select ${title}`} />
    <div className="min-w-0 flex-1">
      <p className="text-sm font-medium text-content">{title}</p>
      <p className="text-xs text-content-tertiary">{meta}</p>
    </div>
    <ShadcnBadge variant="outline">{badge}</ShadcnBadge>
  </div>
);

export const DocumentsSelected = () => (
  <div className="w-full bg-surface-page pb-20">
    <div className="mb-4">
      <h2 className="text-lg font-semibold text-content">Documents</h2>
      <p className="text-sm text-content-secondary">Sunset Condos · 3 of 42 selected</p>
    </div>
    <div className="overflow-hidden rounded-md border border-edge bg-surface-card">
      <Row selected title="2025 Audited Financial Statements" meta="Financials · uploaded 4 Aug 2026" badge="Posted" />
      <Row selected title="Amended Declaration of Condominium" meta="Governing docs · uploaded 12 Aug 2026" badge="Posted" />
      <Row selected title="July Board Meeting Minutes" meta="Minutes · uploaded 19 Aug 2026" badge="Draft" />
      <Row title="Reserve Study 2023" meta="Financials · uploaded 3 Mar 2023" badge="Posted" />
    </div>
    <BulkActionBar
      selectedCount={3}
      onClear={noop}
      actions={[
        { label: 'Publish to portal', icon: Send, onClick: noop },
        { label: 'Move to folder', icon: FolderInput, onClick: noop },
        { label: 'Delete', icon: Trash2, onClick: noop, variant: 'destructive' },
      ]}
    />
  </div>
);

export const ViolationsSelected = () => (
  <div className="w-full bg-surface-page pb-20">
    <div className="mb-4">
      <h2 className="text-lg font-semibold text-content">Violations</h2>
      <p className="text-sm text-content-secondary">Palm Shores HOA · 12 of 62 selected</p>
    </div>
    <div className="overflow-hidden rounded-md border border-edge bg-surface-card">
      <Row selected title="Unit 4B · Balcony storage" meta="V-2026-0148 · opened 12 Aug 2026" badge="Open" />
      <Row selected title="Unit 11A · Unregistered vehicle" meta="V-2026-0151 · opened 19 Aug 2026" badge="Open" />
      <Row selected title="Unit 7C · Quiet hours" meta="V-2026-0155 · opened 24 Aug 2026" badge="Open" />
    </div>
    <BulkActionBar
      selectedCount={12}
      onClear={noop}
      actions={[
        { label: 'Send 14-day notice', icon: Send, onClick: noop },
        { label: 'Export CSV', icon: Download, onClick: noop },
        { label: 'Assess fine', icon: Ban, onClick: noop, disabled: true },
      ]}
    />
  </div>
);
