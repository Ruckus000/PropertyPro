import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
  Button,
} from '@propertypro/design-system';

const Kpis = ({ children }: { children: React.ReactNode }) => (
  <div className="min-h-screen bg-surface-page p-6">
    <h1 className="text-2xl font-semibold text-content">Portfolio summary</h1>
    <p className="mt-1 text-sm text-content-secondary">3 communities &middot; 421 units under management</p>
    <div className="mt-6 grid grid-cols-3 gap-4">{children}</div>
  </div>
);

const Kpi = ({ label, value }: { label: string; value: string }) => (
  <div className="rounded-md border border-edge bg-surface-card p-4">
    <p className="text-xs uppercase tracking-wide text-content-tertiary">{label}</p>
    <p className="mt-2 text-2xl font-semibold tabular-nums text-content">{value}</p>
  </div>
);

export const SideBottom = () => (
  <TooltipProvider>
    <Kpis>
      <Tooltip open>
        <TooltipTrigger asChild>
          <div className="rounded-md border border-edge bg-surface-card p-4">
            <p className="text-xs uppercase tracking-wide text-content-tertiary">Compliance score</p>
            <p className="mt-2 text-2xl font-semibold tabular-nums text-content">92</p>
          </div>
        </TooltipTrigger>
        <TooltipContent side="bottom" align="start" className="max-w-xs">
          Weighted across document posting timeliness, meeting notice windows and required record
          categories. Updated nightly.
        </TooltipContent>
      </Tooltip>
      <Kpi label="Delinquent units" value="19" />
      <Kpi label="Open work orders" value="27" />
    </Kpis>
  </TooltipProvider>
);

export const SideRightLongCopy = () => (
  <TooltipProvider>
    <Kpis>
      <Tooltip open>
        <TooltipTrigger asChild>
          <div className="rounded-md border border-edge bg-surface-card p-4">
            <p className="text-xs uppercase tracking-wide text-content-tertiary">Milestone inspections</p>
            <p className="mt-2 text-2xl font-semibold tabular-nums text-content">2 due</p>
          </div>
        </TooltipTrigger>
        <TooltipContent side="right" className="max-w-xs">
          Buildings three storeys or taller reaching 30 years of age require a milestone inspection.
          PropertyPro reports the dates on file and does not assess structural adequacy.
        </TooltipContent>
      </Tooltip>
      <Kpi label="Compliance score" value="92" />
      <Kpi label="Open work orders" value="27" />
    </Kpis>
  </TooltipProvider>
);

export const ShortLabel = () => (
  <TooltipProvider>
    <div className="min-h-screen bg-surface-page p-6">
      <h1 className="text-2xl font-semibold text-content">Board</h1>
      <p className="mt-1 text-sm text-content-secondary">Sunset Condos &middot; five seats</p>
      <div className="mt-6 flex items-center gap-3 rounded-md border border-edge bg-surface-card p-4">
        <Tooltip open>
          <TooltipTrigger asChild>
            <Button variant="outline" size="sm">Export roster</Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">Downloads a CSV</TooltipContent>
        </Tooltip>
        <Button variant="outline" size="sm">Print sign-in sheet</Button>
      </div>
    </div>
  </TooltipProvider>
);
