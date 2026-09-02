import {
  Popover,
  PopoverAnchor,
  PopoverContent,
  PopoverTrigger,
  Button,
  Input,
  Separator,
} from '@propertypro/design-system';

const rows = [
  ['Unit 7C', '61 days', '$1,240.00'],
  ['Unit 11A', '32 days', '$620.00'],
  ['Unit 19', '14 days', '$310.00'],
];

const ReportsPage = ({
  filterRow,
  firstCell,
}: {
  filterRow?: React.ReactNode;
  firstCell?: React.ReactNode;
}) => (
  <div className="min-h-screen bg-surface-page p-6">
    <h1 className="text-2xl font-semibold text-content">Delinquency report</h1>
    <p className="mt-1 text-sm text-content-secondary">Palm Shores HOA &middot; 11 units past due</p>
    {filterRow ?? (
      <div className="mt-6 flex items-center gap-3 rounded-md border border-edge bg-surface-card p-4">
        <Input className="max-w-sm" defaultValue="01 Jul 2026 — 30 Sep 2026" />
        <Button variant="outline" size="sm">Change period</Button>
        <Button size="sm" className="ml-auto">Export CSV</Button>
      </div>
    )}
    <div className="mt-6 overflow-hidden rounded-md border border-edge bg-surface-card">
      {rows.map(([unit, age, bal], i) => (
        <div key={unit} className="flex items-center justify-between border-b border-edge px-4 py-3 last:border-0">
          {i === 0 && firstCell ? firstCell : <span className="text-sm text-content">{unit}</span>}
          <span className="tabular-nums text-sm text-content-secondary">{age}</span>
          <span className="tabular-nums text-sm font-medium text-content">{bal}</span>
        </div>
      ))}
    </div>
  </div>
);

export const AnchoredToTheFilterRow = () => (
  <Popover open>
    <ReportsPage
      filterRow={
        <PopoverAnchor asChild>
          <div className="mt-6 flex items-center gap-3 rounded-md border border-edge bg-surface-card p-4">
            <Input className="max-w-sm" defaultValue="01 Jul 2026 — 30 Sep 2026" />
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm">Change period</Button>
            </PopoverTrigger>
            <Button size="sm" className="ml-auto">Export CSV</Button>
          </div>
        </PopoverAnchor>
      }
    />
    <PopoverContent align="center" sideOffset={8} className="w-80">
      <p className="text-sm font-semibold text-content">Reporting period</p>
      <p className="mt-1 text-xs text-content-tertiary">
        The popover is positioned against the whole filter row, not just the button inside it.
      </p>
      <Separator className="mt-3 mb-3" />
      <div className="space-y-1">
        {['Current quarter', 'Previous quarter', 'Year to date', 'Trailing 12 months', 'Custom range'].map((p) => (
          <div key={p} className="rounded-md px-3 py-2 text-sm text-content hover:bg-surface-muted">{p}</div>
        ))}
      </div>
    </PopoverContent>
  </Popover>
);

export const AnchoredToATableCell = () => (
  <Popover open>
    <ReportsPage
      firstCell={
        <PopoverAnchor asChild>
          <div className="flex items-center gap-2">
            <PopoverTrigger asChild>
              <Button variant="ghost" size="sm">Unit 7C</Button>
            </PopoverTrigger>
            <span className="text-xs text-content-tertiary">Alan Whitfield</span>
          </div>
        </PopoverAnchor>
      }
    />
    <PopoverContent side="bottom" align="start" sideOffset={8} className="w-72">
      <p className="text-sm font-semibold text-content">Unit 7C</p>
      <p className="mt-1 text-xs text-content-tertiary">
        Anchored to the row cell, so the card lines up with the unit column rather than the button.
      </p>
      <Separator className="mt-3 mb-3" />
      <div className="space-y-2 text-sm">
        <div className="flex justify-between">
          <span className="text-content-secondary">Owner</span>
          <span className="text-content">Alan Whitfield</span>
        </div>
        <div className="flex justify-between">
          <span className="text-content-secondary">Balance</span>
          <span className="tabular-nums font-medium text-status-danger">$1,240.00</span>
        </div>
        <div className="flex justify-between">
          <span className="text-content-secondary">Demand letter</span>
          <span className="text-content">Sent 18 Aug 2026</span>
        </div>
      </div>
      <Button size="sm" className="mt-4 w-full">Open unit ledger</Button>
    </PopoverContent>
  </Popover>
);
