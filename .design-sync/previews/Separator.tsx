import { Separator, Button, Badge } from '@propertypro/design-system';

export const CardSections = () => (
  <div className="w-full max-w-[560px] rounded-md border border-edge bg-surface-card px-5 py-4">
    <div>
      <p className="text-sm font-semibold text-content">Compliance summary</p>
      <p className="mt-1 text-xs text-content-secondary">Sunset Condos · 148 units · condo (§718)</p>
    </div>
    <Separator className="my-4" />
    <div className="space-y-3">
      {[
        ['Documents posted within 30 days', '38 of 42'],
        ['Meeting notices on time', '11 of 11'],
        ['Required categories present', '9 of 10'],
      ].map(([label, value]) => (
        <div key={label} className="flex items-center justify-between gap-4">
          <p className="text-sm text-content-secondary">{label}</p>
          <p className="text-sm font-medium tabular-nums text-content">{value}</p>
        </div>
      ))}
    </div>
    <Separator className="my-4" />
    <div className="flex items-center justify-between gap-4">
      <div>
        <p className="text-xs uppercase tracking-wide text-content-tertiary">Overall score</p>
        <p className="text-2xl font-semibold tabular-nums text-content">92</p>
      </div>
      <Button size="sm" variant="outline">
        View report
      </Button>
    </div>
  </div>
);

export const VerticalMetaRow = () => (
  <div className="w-full max-w-[640px] overflow-hidden rounded-md border border-edge bg-surface-card">
    <div className="px-5 py-4">
      <div className="flex items-center gap-3">
        <p className="text-sm font-semibold text-content">V-118 — Unapproved balcony enclosure</p>
        <Badge variant="warning" size="sm">
          Hearing scheduled
        </Badge>
      </div>
      <div className="mt-2 flex items-center gap-3 text-xs text-content-tertiary">
        <span>Unit 1204</span>
        <Separator orientation="vertical" className="h-4" />
        <span>Cited 28 Aug 2026</span>
        <Separator orientation="vertical" className="h-4" />
        <span>Article XII, §4</span>
        <Separator orientation="vertical" className="h-4" />
        <span>Notice due in 6 days</span>
      </div>
    </div>
    <Separator />
    <div className="flex items-center gap-4 px-5 py-3">
      <div>
        <p className="text-xs uppercase tracking-wide text-content-tertiary">Courtesy notice</p>
        <p className="text-sm text-content">Sent 29 Aug 2026</p>
      </div>
      <Separator orientation="vertical" className="h-8" />
      <div>
        <p className="text-xs uppercase tracking-wide text-content-tertiary">Hearing</p>
        <p className="text-sm text-content">11 Sep 2026, 6:30 PM</p>
      </div>
      <Separator orientation="vertical" className="h-8" />
      <div>
        <p className="text-xs uppercase tracking-wide text-content-tertiary">Cure deadline</p>
        <p className="text-sm text-content">25 Sep 2026</p>
      </div>
    </div>
  </div>
);
