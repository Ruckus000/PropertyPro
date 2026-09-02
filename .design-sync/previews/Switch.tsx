import { Switch, Label, Separator, Button } from '@propertypro/design-system';

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

const Row = ({
  id,
  label,
  hint,
  checked,
  disabled,
}: {
  id: string;
  label: string;
  hint: string;
  checked?: boolean;
  disabled?: boolean;
}) => (
  <div className="flex items-center justify-between gap-4">
    <div className="space-y-0.5">
      <Label htmlFor={id} className={disabled ? 'text-content-disabled' : undefined}>
        {label}
      </Label>
      <p className="text-xs text-content-tertiary">{hint}</p>
    </div>
    <Switch id={id} checked={checked} disabled={disabled} className="shrink-0" />
  </div>
);

export const CommunityFeatureToggles = () => (
  <Panel
    title="Community features"
    subtitle="Sunset Condos · Professional plan · changed by the root manager"
    footer={
      <div className="flex items-center justify-end gap-3">
        <Button size="sm" variant="outline">
          Discard
        </Button>
        <Button size="sm">Save settings</Button>
      </div>
    }
  >
    <div className="space-y-5">
      <Row
        id="sw-transparency"
        label="Public transparency page"
        hint="Publishes required records at sunset-condos.getpropertypro.com."
        checked
      />
      <Separator />
      <Row
        id="sw-forum"
        label="Resident forum"
        hint="Threaded discussion, moderated by the board."
        checked
      />
      <Separator />
      <Row
        id="sw-arc"
        label="Architectural review requests"
        hint="Owners submit plans; the committee records a written reason for any denial."
      />
      <Separator />
      <Row
        id="sw-sms"
        label="SMS emergency broadcasts"
        hint="Requires the Operations+ plan and a verified sender."
        disabled
      />
    </div>
  </Panel>
);

export const NotificationPreferences = () => (
  <Panel title="Email notifications" subtitle="Marisol Vega · Unit 1204 · Owner">
    <div className="space-y-5">
      <Row
        id="sw-digest"
        label="Weekly community digest"
        hint="Board decisions, new documents and upcoming deadlines."
        checked
      />
      <Separator />
      <Row
        id="sw-violations"
        label="Violation notices for my unit"
        hint="Statutory notices are always mailed as well."
        checked
      />
      <Separator />
      <Row
        id="sw-amenity"
        label="Amenity reservation reminders"
        hint="A reminder the morning of a booked slot."
      />
      <Separator />
      <Row
        id="sw-marketing"
        label="Product announcements from PropertyPro"
        hint="Occasional release notes. Off by default."
      />
    </div>
  </Panel>
);

export const States = () => (
  <div className="w-full max-w-[560px] space-y-5 rounded-md border border-edge bg-surface-card px-5 py-4">
    <div className="flex items-center justify-between gap-4">
      <Label htmlFor="sw-on">On — Digest enabled for owners</Label>
      <Switch id="sw-on" checked />
    </div>
    <Separator />
    <div className="flex items-center justify-between gap-4">
      <Label htmlFor="sw-off">Off — Fining committee disabled</Label>
      <Switch id="sw-off" />
    </div>
    <Separator />
    <div className="flex items-center justify-between gap-4">
      <Label htmlFor="sw-on-disabled" className="text-content-disabled">
        On &amp; disabled — Managed by the PM company
      </Label>
      <Switch id="sw-on-disabled" checked disabled />
    </div>
    <Separator />
    <div className="flex items-center justify-between gap-4">
      <Label htmlFor="sw-off-disabled" className="text-content-disabled">
        Off &amp; disabled — Requires Operations+
      </Label>
      <Switch id="sw-off-disabled" disabled />
    </div>
  </div>
);
