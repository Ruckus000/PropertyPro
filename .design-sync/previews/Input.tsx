import { Input, Label, Button, Separator } from '@propertypro/design-system';
import { Search } from 'lucide-react';

const Panel = ({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) => (
  <div className="w-full max-w-[560px] overflow-hidden rounded-md border border-edge bg-surface-card">
    <div className="border-b border-edge px-5 py-4">
      <p className="text-sm font-semibold text-content">{title}</p>
      {subtitle ? <p className="mt-1 text-xs text-content-secondary">{subtitle}</p> : null}
    </div>
    <div className="px-5 py-4">{children}</div>
    {footer ? <div className="border-t border-edge px-5 py-3">{footer}</div> : null}
  </div>
);

export const WorkOrderForm = () => (
  <Panel
    title="New work order"
    subtitle="Sunset Condos · logged against the common elements"
    footer={
      <div className="flex items-center justify-end gap-3">
        <Button size="sm" variant="outline">
          Cancel
        </Button>
        <Button size="sm">Create work order</Button>
      </div>
    }
  >
    <div className="space-y-5">
      <div className="space-y-2">
        <Label htmlFor="wo-title">Summary</Label>
        <Input id="wo-title" defaultValue="Lobby elevator stalling between floors 3 and 4" />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="wo-unit">Unit or location</Label>
          <Input id="wo-unit" defaultValue="Tower A — Lobby" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="wo-vendor">Assigned vendor</Label>
          <Input id="wo-vendor" placeholder="Search approved vendors" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="wo-cost">Estimated cost (USD)</Label>
          <Input id="wo-cost" type="number" defaultValue="2450" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="wo-due">Target completion</Label>
          <Input id="wo-due" type="date" defaultValue="2026-09-18" />
        </div>
      </div>
    </div>
  </Panel>
);

export const States = () => (
  <Panel title="Field states" subtitle="Owner record — Unit 1204, Sunset Condos">
    <div className="space-y-5">
      <div className="space-y-2">
        <Label htmlFor="in-empty">Placeholder</Label>
        <Input id="in-empty" placeholder="e.g. Marisol Vega" />
      </div>
      <div className="space-y-2">
        <Label htmlFor="in-filled">Filled</Label>
        <Input id="in-filled" defaultValue="Marisol Vega" />
      </div>
      <div className="space-y-2">
        <Label htmlFor="in-invalid">Error</Label>
        <Input
          id="in-invalid"
          defaultValue="marisol.vega@"
          aria-invalid="true"
          className="border-status-danger"
        />
        <p className="text-xs text-status-danger">
          Enter a valid email address — owners of record must be reachable for statutory notices.
        </p>
      </div>
      <Separator />
      <div className="space-y-2">
        <Label htmlFor="in-disabled" className="text-content-disabled">
          Disabled
        </Label>
        <Input id="in-disabled" defaultValue="Unit 1204" disabled />
        <p className="text-xs text-content-tertiary">
          Unit assignment is managed by the property manager.
        </p>
      </div>
    </div>
  </Panel>
);

export const SearchAndFilters = () => (
  <Panel title="Document library" subtitle="42 records posted under §718.111(12)(g)">
    <div className="space-y-5">
      <div className="space-y-2">
        <Label htmlFor="in-search">Search documents</Label>
        <div className="relative">
          <Search
            className="absolute left-3 top-2.5 size-4 text-content-placeholder"
            aria-hidden="true"
          />
          <Input id="in-search" className="pl-9" placeholder="Search by title, category or date" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="in-from">Posted from</Label>
          <Input id="in-from" type="date" defaultValue="2026-01-01" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="in-to">Posted to</Label>
          <Input id="in-to" type="date" defaultValue="2026-09-01" />
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="in-file">Upload a replacement</Label>
        <Input id="in-file" type="file" />
        <p className="text-xs text-content-tertiary">PDF up to 25 MB. Posted within 30 days of creation.</p>
      </div>
    </div>
  </Panel>
);
