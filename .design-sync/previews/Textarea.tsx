import { Textarea, Label, Input, Button, Separator } from '@propertypro/design-system';

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

export const ViolationNotice = () => (
  <Panel
    title="Courtesy violation notice"
    subtitle="V-118 · Unit 1204 · a hearing needs 14 days' written notice"
    footer={
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-content-tertiary">Saved as a draft 2 minutes ago</p>
        <div className="flex items-center gap-3">
          <Button size="sm" variant="outline">
            Preview
          </Button>
          <Button size="sm">Send notice</Button>
        </div>
      </div>
    }
  >
    <div className="space-y-5">
      <div className="space-y-2">
        <Label htmlFor="ta-subject">Subject</Label>
        <Input id="ta-subject" defaultValue="Notice of violation — balcony enclosure" />
      </div>
      <div className="space-y-2">
        <Label htmlFor="ta-body">Notice body</Label>
        <Textarea
          id="ta-body"
          className="min-h-40"
          defaultValue={
            'Our records show a glass enclosure was installed on the east balcony of Unit 1204 without prior architectural approval, contrary to Article XII, §4 of the declaration.\n\nPlease remove the enclosure or submit an architectural review request by 25 September 2026. If the matter is not resolved, the board may schedule a hearing before the fining committee.'
          }
        />
        <p className="text-xs text-content-tertiary">
          The cited rule appears in the mailed notice exactly as written here.
        </p>
      </div>
    </div>
  </Panel>
);

export const States = () => (
  <Panel title="Textarea states" subtitle="Architectural review — committee decision">
    <div className="space-y-5">
      <div className="space-y-2">
        <Label htmlFor="ta-empty">Placeholder</Label>
        <Textarea
          id="ta-empty"
          className="min-h-20"
          placeholder="Describe the proposed work, materials and finish colours"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="ta-filled">Filled</Label>
        <Textarea
          id="ta-filled"
          className="min-h-20"
          defaultValue="Replace six sliding windows with impact-rated units in bronze frames, matching the approved exterior palette."
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="ta-invalid">Error</Label>
        <Textarea
          id="ta-invalid"
          className="min-h-20 border-status-danger"
          aria-invalid="true"
          defaultValue="Denied."
        />
        <p className="text-xs text-status-danger">
          A denial must cite the specific rule or covenant relied on (HB 1203).
        </p>
      </div>
      <Separator />
      <div className="space-y-2">
        <Label htmlFor="ta-disabled" className="text-content-disabled">
          Disabled
        </Label>
        <Textarea
          id="ta-disabled"
          className="min-h-20"
          disabled
          defaultValue="Locked once the committee records its vote."
        />
      </div>
    </div>
  </Panel>
);

export const AnnouncementComposer = () => (
  <Panel
    title="New announcement"
    subtitle="Sunset Condos · audience: all residents"
    footer={
      <div className="flex items-center justify-end gap-3">
        <Button size="sm" variant="outline">
          Save draft
        </Button>
        <Button size="sm">Publish</Button>
      </div>
    }
  >
    <div className="space-y-5">
      <div className="space-y-2">
        <Label htmlFor="ta-title">Title</Label>
        <Input id="ta-title" defaultValue="Elevator maintenance — Tower A, 14–16 September" />
      </div>
      <div className="space-y-2">
        <Label htmlFor="ta-message">Message</Label>
        <Textarea
          id="ta-message"
          className="min-h-24"
          defaultValue={
            'Apex Elevator Service will service the Tower A elevator from Monday 14 September through Wednesday 16 September, 9:00 AM to 4:00 PM each day. The Tower B elevator stays in service throughout.'
          }
        />
        <div className="flex items-center justify-between gap-4">
          <p className="text-xs text-content-tertiary">Plain text; links are made clickable.</p>
          <p className="text-xs tabular-nums text-content-tertiary">241 / 2000</p>
        </div>
      </div>
    </div>
  </Panel>
);
