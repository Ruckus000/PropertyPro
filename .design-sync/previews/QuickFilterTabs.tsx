import { QuickFilterTabs, Button, Input } from '@propertypro/design-system';

const noop = () => {};

const Toolbar = ({ children }: { children: React.ReactNode }) => (
  <div className="w-full rounded-md border border-edge bg-surface-card p-4">
    {children}
  </div>
);

export const ViolationFilters = () => (
  <Toolbar>
    <div className="flex flex-wrap items-center justify-between gap-3">
      <QuickFilterTabs
        active="open"
        onChange={noop}
        tabs={[
          { label: 'Open', value: 'open', count: 12 },
          { label: 'Hearing scheduled', value: 'hearing', count: 3 },
          { label: 'Cured', value: 'cured', count: 47 },
          { label: 'All', value: 'all', count: 62 },
        ]}
      />
      <Button size="sm">Log violation</Button>
    </div>
  </Toolbar>
);

export const LeaseFilters = () => (
  <Toolbar>
    <div className="flex flex-wrap items-center justify-between gap-3">
      <QuickFilterTabs
        active="expiring_soon"
        onChange={noop}
        tabs={[
          { label: 'All', value: 'all' },
          { label: 'Expiring Soon', value: 'expiring_soon' },
          { label: 'Month-to-Month', value: 'month_to_month' },
          { label: 'Vacant Units', value: 'vacant' },
        ]}
      />
      <div className="w-64">
        <Input placeholder="Search by unit or tenant" />
      </div>
    </div>
  </Toolbar>
);

export const VisitorFilters = () => (
  <Toolbar>
    <div className="flex flex-col gap-3">
      <QuickFilterTabs
        active="today"
        onChange={noop}
        tabs={[
          { label: 'Today', value: 'today', count: 9 },
          { label: 'Expected', value: 'expected', count: 4 },
          { label: 'Checked In', value: 'checked_in', count: 2 },
          { label: 'All', value: 'all', count: 231 },
        ]}
      />
      <p className="text-xs text-content-tertiary">
        Front-desk view · Sunset Ridge Apartments · refreshed 2 minutes ago
      </p>
    </div>
  </Toolbar>
);
