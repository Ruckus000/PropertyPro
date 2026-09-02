import {
  Popover,
  PopoverContent,
  PopoverTrigger,
  Button,
  Checkbox,
  Label,
  Separator,
} from '@propertypro/design-system';

const RegisterPage = ({ children }: { children: React.ReactNode }) => (
  <div className="min-h-screen bg-surface-page p-6">
    <h1 className="text-2xl font-semibold text-content">Work orders</h1>
    <p className="mt-1 text-sm text-content-secondary">Sunset Ridge Apartments &middot; 42 records</p>
    <div className="mt-6 flex items-center gap-3 rounded-md border border-edge bg-surface-card p-4">
      {children}
    </div>
    <div className="mt-6 overflow-hidden rounded-md border border-edge bg-surface-card">
      {[
        ['WO-4471', 'Pool pump seal leak', 'Urgent'],
        ['WO-4472', 'Garage gate sensor', 'Normal'],
        ['WO-4473', 'Lobby HVAC filter', 'Low'],
      ].map(([id, title, pri]) => (
        <div key={id} className="flex items-center justify-between border-b border-edge px-4 py-3 last:border-0">
          <span className="text-sm text-content">{id} &middot; {title}</span>
          <span className="text-xs text-content-tertiary">{pri}</span>
        </div>
      ))}
    </div>
  </div>
);

export const FilterButtonTrigger = () => (
  <Popover open>
    <RegisterPage>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm">Priority &middot; 2 selected</Button>
      </PopoverTrigger>
      <Button variant="outline" size="sm">Assignee</Button>
      <Button variant="outline" size="sm">Status</Button>
    </RegisterPage>
    <PopoverContent align="start" sideOffset={8} className="w-72">
      <p className="text-sm font-semibold text-content">Filter by priority</p>
      <Separator className="mt-3 mb-3" />
      <div className="space-y-3">
        {[
          ['urgent', 'Urgent — 24 hour response'],
          ['normal', 'Normal — 5 business days'],
          ['low', 'Low — next scheduled visit'],
        ].map(([id, label]) => (
          <div key={id} className="flex items-center gap-3">
            <Checkbox id={id} defaultChecked={id !== 'low'} />
            <Label htmlFor={id} className="text-sm font-normal text-content-secondary">{label}</Label>
          </div>
        ))}
      </div>
    </PopoverContent>
  </Popover>
);

export const IconTrigger = () => (
  <Popover open>
    <RegisterPage>
      <Button variant="outline" size="sm">Priority</Button>
      <Button variant="outline" size="sm">Assignee</Button>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm" className="ml-auto">Column options</Button>
      </PopoverTrigger>
    </RegisterPage>
    <PopoverContent align="end" sideOffset={8} className="w-72">
      <p className="text-sm font-semibold text-content">Visible columns</p>
      <Separator className="mt-3 mb-3" />
      <div className="space-y-3">
        {['Work order ID', 'Unit', 'Vendor', 'Opened', 'Due date'].map((col) => (
          <div key={col} className="flex items-center gap-3">
            <Checkbox id={col} defaultChecked={col !== 'Due date'} />
            <Label htmlFor={col} className="text-sm font-normal text-content-secondary">{col}</Label>
          </div>
        ))}
      </div>
    </PopoverContent>
  </Popover>
);
