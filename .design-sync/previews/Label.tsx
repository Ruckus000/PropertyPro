import { Label, Input, Textarea, Checkbox, Button, Separator } from '@propertypro/design-system';

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

export const FormFields = () => (
  <Panel
    title="Board meeting notice"
    subtitle="Board meetings require 48 hours' posted notice; owner meetings require 14 days."
    footer={
      <div className="flex items-center justify-end gap-3">
        <Button size="sm" variant="outline">
          Save draft
        </Button>
        <Button size="sm">Post notice</Button>
      </div>
    }
  >
    <div className="space-y-5">
      <div className="space-y-2">
        <Label htmlFor="mt-title">
          Meeting title <span className="text-status-danger">*</span>
        </Label>
        <Input id="mt-title" defaultValue="Regular Board Meeting — September 2026" />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="mt-date">
            Date <span className="text-status-danger">*</span>
          </Label>
          <Input id="mt-date" type="date" defaultValue="2026-09-24" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="mt-location">Location</Label>
          <Input id="mt-location" defaultValue="Clubhouse — Sunset Condos" />
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="mt-agenda">Agenda</Label>
        <Textarea
          id="mt-agenda"
          className="min-h-24"
          defaultValue={'1. Roll call and quorum\n2. Reserve funding for the 2027 milestone inspection\n3. Vendor contract — landscaping renewal'}
        />
        <p className="text-xs text-content-tertiary">
          Agenda items must be posted with the notice. Owners may not vote on items added later.
        </p>
      </div>
    </div>
  </Panel>
);

export const WithControls = () => (
  <Panel
    title="Notification preferences"
    subtitle="Marisol Vega · Unit 1204 · Owner"
  >
    <div className="space-y-5">
      <div className="flex items-start gap-3">
        <Checkbox id="lb-digest" checked className="mt-1" />
        <div className="space-y-0.5">
          <Label htmlFor="lb-digest">Weekly community digest</Label>
          <p className="text-xs text-content-tertiary">
            Board decisions, new documents and upcoming deadlines.
          </p>
        </div>
      </div>
      <div className="flex items-start gap-3">
        <Checkbox id="lb-violations" checked className="mt-1" />
        <div className="space-y-0.5">
          <Label htmlFor="lb-violations">Violation notices for my unit</Label>
          <p className="text-xs text-content-tertiary">
            Statutory notices are always mailed as well.
          </p>
        </div>
      </div>
      <Separator />
      <div className="flex items-center gap-3">
        <Checkbox id="lb-arc" checked />
        <Label htmlFor="lb-arc">Notify me when an ARC request changes status</Label>
      </div>
      <div className="flex items-center gap-3">
        <Checkbox id="lb-forum" />
        <Label htmlFor="lb-forum">Notify me about new forum replies</Label>
      </div>
      <Separator />
      <div className="space-y-2">
        <Label htmlFor="lb-email">Send notifications to</Label>
        <Input id="lb-email" type="email" defaultValue="marisol.vega@example.com" />
      </div>
    </div>
  </Panel>
);

export const RequiredAndDisabled = () => (
  <Panel title="Label variants" subtitle="Assessment record — Unit 806">
    <div className="space-y-5">
      <div className="space-y-2">
        <Label htmlFor="lb-req">
          Assessment amount <span className="text-status-danger">*</span>
        </Label>
        <Input id="lb-req" type="number" defaultValue="1250" />
      </div>
      <div className="space-y-2">
        <Label htmlFor="lb-opt">
          Internal memo <span className="font-normal text-content-tertiary">(optional)</span>
        </Label>
        <Input id="lb-opt" placeholder="Visible to managers only" />
      </div>
      <div className="space-y-2">
        <Label htmlFor="lb-dis" className="text-content-disabled">
          Ledger entry ID
        </Label>
        <Input id="lb-dis" defaultValue="LDG-2026-004182" disabled />
      </div>
    </div>
  </Panel>
);
