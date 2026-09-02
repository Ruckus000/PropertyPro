import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Label,
  Button,
} from '@propertypro/design-system';

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

export const SelectedVsPlaceholder = () => (
  <Panel
    title="Reservation request"
    subtitle="Rooftop terrace · Sunset Condos · owner-booked amenity"
    footer={
      <div className="flex items-center justify-end gap-3">
        <Button size="sm" variant="outline">
          Cancel
        </Button>
        <Button size="sm">Request booking</Button>
      </div>
    }
  >
    <div className="space-y-5">
      <div className="space-y-2">
        <Label htmlFor="sv-amenity">Amenity</Label>
        <Select defaultValue="terrace">
          <SelectTrigger id="sv-amenity">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="terrace">Rooftop terrace</SelectItem>
            <SelectItem value="clubhouse">Clubhouse</SelectItem>
            <SelectItem value="pool">Pool deck cabana</SelectItem>
          </SelectContent>
        </Select>
        <p className="text-xs text-content-tertiary">
          The rooftop terrace is limited to one booking per unit each week.
        </p>
      </div>
      <div className="space-y-2">
        <Label htmlFor="sv-slot">Time slot</Label>
        <Select>
          <SelectTrigger id="sv-slot">
            <SelectValue placeholder="Choose an available slot" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="am">9:00 AM – 12:00 PM</SelectItem>
            <SelectItem value="pm">1:00 PM – 4:00 PM</SelectItem>
            <SelectItem value="eve">6:00 PM – 9:00 PM</SelectItem>
          </SelectContent>
        </Select>
        <p className="text-xs text-content-tertiary">
          Slots already reserved by another unit are hidden.
        </p>
      </div>
    </div>
  </Panel>
);

export const ValueInOpenMenu = () => (
  <Panel
    title="Assign a work order"
    subtitle="WO-2026-0311 · Lobby elevator stalling between floors 3 and 4"
  >
    <div className="space-y-2">
      <Label htmlFor="sv-priority">Priority</Label>
      <Select open defaultValue="high">
        <SelectTrigger id="sv-priority">
          <SelectValue placeholder="Set a priority" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="emergency">Emergency — life safety</SelectItem>
          <SelectItem value="high">High — resident impact</SelectItem>
          <SelectItem value="normal">Normal</SelectItem>
          <SelectItem value="low">Low — scheduled maintenance</SelectItem>
        </SelectContent>
      </Select>
    </div>
  </Panel>
);
