import { Checkbox, Label, Button, Separator } from '@propertypro/design-system';

const FormCard = ({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) => (
  <div className="w-full max-w-[560px] overflow-hidden rounded-md border border-edge bg-surface-card">
    <div className="border-b border-edge px-5 py-4">
      <p className="text-sm font-semibold text-content">{title}</p>
      <p className="mt-1 text-xs text-content-secondary">{subtitle}</p>
    </div>
    <div className="px-5 py-4">{children}</div>
    {footer ? <div className="border-t border-edge px-5 py-3">{footer}</div> : null}
  </div>
);

export const ArcSubmissionChecklist = () => (
  <FormCard
    title="Architectural review — submission checklist"
    subtitle="HB 1203 requires the board to state a specific rule for any denial, so every attachment must be on file."
    footer={
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-content-tertiary">3 of 5 requirements complete</p>
        <Button size="sm" disabled>
          Submit to committee
        </Button>
      </div>
    }
  >
    <div className="space-y-4">
      {[
        ['arc-plans', 'Scaled drawings or contractor plans', 'PDF or image, 25 MB max', true],
        ['arc-survey', 'Current property survey', 'Required for any lot-line work', true],
        ['arc-materials', 'Material and colour samples', 'Must match the approved palette', true],
        ['arc-permit', 'Miami-Dade building permit', 'Not yet uploaded', false],
        ['arc-neighbor', 'Adjacent-owner acknowledgement', 'Units 1202 and 1206', false],
      ].map(([id, label, hint, checked]) => (
        <div key={id as string} className="flex items-start gap-3">
          <Checkbox id={id as string} checked={checked as boolean} className="mt-1" />
          <div className="min-w-0">
            <Label htmlFor={id as string} className="text-content">
              {label as string}
            </Label>
            <p className="mt-1 text-xs text-content-tertiary">{hint as string}</p>
          </div>
        </div>
      ))}
    </div>
  </FormCard>
);

export const NoticeDelivery = () => (
  <FormCard
    title="Annual meeting notice — delivery"
    subtitle="Owner meetings need 14 days' notice. Select every channel this association is required to use."
    footer={
      <div className="flex items-center justify-end gap-3">
        <Button size="sm" variant="outline">
          Save draft
        </Button>
        <Button size="sm">Schedule notice</Button>
      </div>
    }
  >
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Checkbox id="ch-post" checked />
        <Label htmlFor="ch-post">Post to the association website</Label>
      </div>
      <div className="flex items-center gap-3">
        <Checkbox id="ch-email" checked />
        <Label htmlFor="ch-email">Email owners of record</Label>
      </div>
      <div className="flex items-center gap-3">
        <Checkbox id="ch-mail" />
        <Label htmlFor="ch-mail">Mail to the address on file</Label>
      </div>
      <Separator />
      <div className="flex items-center gap-3">
        <Checkbox id="ch-sms" disabled />
        <Label htmlFor="ch-sms" className="text-content-disabled">
          Text message — requires the Operations+ plan
        </Label>
      </div>
    </div>
  </FormCard>
);

export const States = () => (
  <div className="w-full max-w-[560px] space-y-4 rounded-md border border-edge bg-surface-card px-5 py-4">
    <div className="flex items-center gap-3">
      <Checkbox id="st-unchecked" />
      <Label htmlFor="st-unchecked">Unchecked — Reserve study on file</Label>
    </div>
    <div className="flex items-center gap-3">
      <Checkbox id="st-checked" checked />
      <Label htmlFor="st-checked">Checked — Milestone inspection complete</Label>
    </div>
    <div className="flex items-center gap-3">
      <Checkbox id="st-indeterminate" checked="indeterminate" />
      <Label htmlFor="st-indeterminate">Indeterminate — 4 of 9 units acknowledged</Label>
    </div>
    <div className="flex items-center gap-3">
      <Checkbox id="st-disabled" disabled />
      <Label htmlFor="st-disabled" className="text-content-disabled">
        Disabled — Fining committee (board vote required)
      </Label>
    </div>
    <div className="flex items-center gap-3">
      <Checkbox id="st-disabled-checked" checked disabled />
      <Label htmlFor="st-disabled-checked" className="text-content-disabled">
        Disabled &amp; checked — Declaration posted 4 Mar 2026
      </Label>
    </div>
  </div>
);
