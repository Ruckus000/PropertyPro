import {
  Popover,
  PopoverContent,
  PopoverTrigger,
  Button,
  ShadcnBadge,
  Separator,
} from '@propertypro/design-system';

const TopBar = ({ children }: { children: React.ReactNode }) => (
  <div className="min-h-screen bg-surface-page">
    <div className="flex items-center justify-between border-b border-edge bg-surface-card px-6 py-3">
      <div className="flex items-center gap-3">
        <span className="text-sm font-semibold text-content">Sunset Condos</span>
        <ShadcnBadge variant="outline">Professional</ShadcnBadge>
      </div>
      <div className="flex items-center gap-2">{children}</div>
    </div>
    <div className="p-6">
      <h1 className="text-2xl font-semibold text-content">Dashboard</h1>
      <p className="mt-1 text-sm text-content-secondary">148 units &middot; compliance score 92</p>
      <div className="mt-6 grid grid-cols-3 gap-4">
        {[
          ['Open work orders', '9'],
          ['Documents due', '3'],
          ['Delinquent units', '11'],
        ].map(([label, value]) => (
          <div key={label} className="rounded-md border border-edge bg-surface-card p-4">
            <p className="text-xs uppercase tracking-wide text-content-tertiary">{label}</p>
            <p className="mt-2 text-2xl font-semibold tabular-nums text-content">{value}</p>
          </div>
        ))}
      </div>
    </div>
  </div>
);

export const NotificationBell = () => (
  <Popover open>
    <TopBar>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm">Notifications &middot; 3</Button>
      </PopoverTrigger>
      <Button size="sm">New announcement</Button>
    </TopBar>
    <PopoverContent align="end" sideOffset={8} className="w-80">
      <p className="text-sm font-semibold text-content">Notifications</p>
      <Separator className="mt-3 mb-3" />
      <div className="space-y-3">
        {[
          ['Violation V-2026-0148 escalated', '2 hours ago'],
          ['Reserve study uploaded by the board', 'Yesterday'],
          ['Unit 7C is 45 days delinquent', '3 days ago'],
        ].map(([title, when]) => (
          <div key={title}>
            <p className="text-sm text-content">{title}</p>
            <p className="text-xs text-content-tertiary">{when}</p>
          </div>
        ))}
      </div>
      <Separator className="mt-3 mb-3" />
      <Button variant="outline" size="sm" className="w-full">View all notifications</Button>
    </PopoverContent>
  </Popover>
);

export const CommunitySwitcher = () => (
  <Popover open>
    <TopBar>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm">Switch community</Button>
      </PopoverTrigger>
      <Button size="sm">New announcement</Button>
    </TopBar>
    <PopoverContent align="end" sideOffset={8} className="w-72">
      <p className="text-xs uppercase tracking-wide text-content-tertiary">Your communities</p>
      <div className="mt-3 space-y-1">
        {[
          ['Sunset Condos', 'Miami · condo'],
          ['Palm Shores HOA', 'Fort Lauderdale · HOA'],
          ['Sunset Ridge Apartments', 'Tampa · apartment'],
        ].map(([name, meta]) => (
          <div key={name} className="rounded-md px-3 py-2 hover:bg-surface-muted">
            <p className="text-sm font-medium text-content">{name}</p>
            <p className="text-xs text-content-tertiary">{meta}</p>
          </div>
        ))}
      </div>
    </PopoverContent>
  </Popover>
);
