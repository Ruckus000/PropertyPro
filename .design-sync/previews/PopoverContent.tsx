import {
  Popover,
  PopoverContent,
  PopoverTrigger,
  Button,
  Separator,
  ShadcnBadge,
} from '@propertypro/design-system';

const CompliancePage = ({ children }: { children: React.ReactNode }) => (
  <div className="min-h-screen bg-surface-page p-6">
    <h1 className="text-2xl font-semibold text-content">Compliance</h1>
    <p className="mt-1 text-sm text-content-secondary">
      Sunset Condos &middot; &sect;718.111(12)(g) website posting requirements
    </p>
    <div className="mt-6 flex items-center gap-3 rounded-md border border-edge bg-surface-card p-4">
      <span className="text-2xl font-semibold tabular-nums text-content">92</span>
      <span className="text-sm text-content-secondary">Compliance score</span>
      <div className="ml-auto flex items-center gap-2">{children}</div>
    </div>
    <div className="mt-6 space-y-3">
      {['Governing documents — posted', 'Adopted budget — posted', 'Reserve study — due in 6 days'].map((i) => (
        <div key={i} className="rounded-md border border-edge bg-surface-card px-4 py-3 text-sm text-content">{i}</div>
      ))}
    </div>
  </div>
);

export const ScoreBreakdown = () => (
  <Popover open>
    <CompliancePage>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm">How is this scored?</Button>
      </PopoverTrigger>
    </CompliancePage>
    <PopoverContent align="end" sideOffset={8} className="w-80">
      <p className="text-sm font-semibold text-content">Score breakdown</p>
      <Separator className="mt-3 mb-3" />
      <div className="space-y-3">
        {[
          ['Document posting timeliness', '38 / 40'],
          ['Meeting notice windows', '30 / 30'],
          ['Required categories present', '24 / 30'],
        ].map(([label, value]) => (
          <div key={label} className="flex items-center justify-between text-sm">
            <span className="text-content-secondary">{label}</span>
            <span className="tabular-nums font-medium text-content">{value}</span>
          </div>
        ))}
      </div>
      <Separator className="mt-3 mb-3" />
      <p className="text-xs text-content-tertiary">
        Scores are factual measurements of posting dates. PropertyPro does not offer legal advice.
      </p>
    </PopoverContent>
  </Popover>
);

export const SideRightAlignStart = () => (
  <Popover open>
    <CompliancePage>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm">Missing categories</Button>
      </PopoverTrigger>
    </CompliancePage>
    <PopoverContent side="bottom" align="start" sideOffset={8} className="w-72">
      <p className="text-sm font-semibold text-content">2 categories missing</p>
      <Separator className="mt-3 mb-3" />
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-sm text-content">Insurance certificates</span>
          <ShadcnBadge variant="destructive">Overdue</ShadcnBadge>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-sm text-content">Vendor contracts</span>
          <ShadcnBadge variant="secondary">Due in 6 days</ShadcnBadge>
        </div>
      </div>
      <Button size="sm" className="mt-4 w-full">Upload records</Button>
    </PopoverContent>
  </Popover>
);
