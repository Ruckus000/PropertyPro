import { HelpTooltip, Button, Input, Label, Separator } from '@propertypro/design-system';

export const ElectionSettingsForm = () => (
  <div className="min-h-screen bg-surface-page p-6">
    <h1 className="text-2xl font-semibold text-content">Election settings</h1>
    <p className="mt-1 text-sm text-content-secondary">
      Sunset Condos &middot; 2026 board election &middot; &sect;718.128 electronic voting
    </p>
    <div className="mt-6 max-w-lg rounded-md border border-edge bg-surface-card p-6">
      <div className="space-y-5">
        <div className="space-y-2">
          <div className="flex items-center gap-1.5">
            <Label htmlFor="quorum" className="text-sm font-medium text-content">Quorum threshold</Label>
            <HelpTooltip
              articleSlug="running-a-board-election"
              articleCategory="elections"
              content="Quorum is the minimum share of eligible units that must cast a ballot for the election to be valid under your bylaws and Florida statute."
              label="What is quorum?"
            />
          </div>
          <Input id="quorum" defaultValue="50%" />
        </div>
        <div className="space-y-2">
          <div className="flex items-center gap-1.5">
            <Label htmlFor="ballot" className="text-sm font-medium text-content">Ballot secrecy</Label>
            <HelpTooltip
              articleSlug="secret-ballot-requirements"
              articleCategory="elections"
              content="Board elections require a secret ballot. Votes are separated from voter identity before any result is shown."
              label="How secret ballots work"
            />
          </div>
          <Input id="ballot" defaultValue="Secret ballot (required for board seats)" />
        </div>
        <Separator />
        <div className="space-y-2">
          <div className="flex items-center gap-1.5">
            <Label htmlFor="consent" className="text-sm font-medium text-content">Consent on file</Label>
            <HelpTooltip
              content="Each owner must consent in writing before they may vote electronically. Consent is per unit, not per person."
              label="Electronic voting consent"
            />
          </div>
          <Input id="consent" defaultValue="98 of 148 units" />
        </div>
      </div>
      <div className="mt-6 flex justify-end gap-3">
        <Button variant="outline">Cancel</Button>
        <Button>Save settings</Button>
      </div>
    </div>
  </div>
);

export const InlineWithStatutoryFields = () => (
  <div className="min-h-screen bg-surface-page p-6">
    <h1 className="text-2xl font-semibold text-content">Structural integrity</h1>
    <p className="mt-1 text-sm text-content-secondary">Sunset Condos &middot; Tower B &middot; built 1988</p>
    <div className="mt-6 overflow-hidden rounded-md border border-edge bg-surface-card">
      {[
        ['Milestone inspection due', '31 Dec 2026', 'milestone-inspections', 'compliance',
          'Buildings three storeys or taller must complete a milestone inspection at 30 years of age, then every 10 years.'],
        ['SIRS reserve study', '01 Mar 2027', 'sirs-reserve-studies', 'compliance',
          'A Structural Integrity Reserve Study sets the reserve items that may not be waived or reduced by the members.'],
        ['Last posted report', '21 Aug 2026', '', '',
          'Reports are published to the association website within 30 days of receipt.'],
      ].map(([label, value, slug, category, help]) => (
        <div key={label} className="flex items-center justify-between border-b border-edge px-4 py-3 last:border-0">
          <div className="flex items-center gap-1.5">
            <span className="text-sm text-content">{label}</span>
            <HelpTooltip
              content={help}
              articleSlug={slug || undefined}
              articleCategory={category || undefined}
              label={`About ${label}`}
            />
          </div>
          <span className="tabular-nums text-sm font-medium text-content">{value}</span>
        </div>
      ))}
    </div>
    <p className="mt-4 text-xs text-content-tertiary">
      PropertyPro reports the dates on file. It does not provide engineering, legal or financial advice.
    </p>
  </div>
);
