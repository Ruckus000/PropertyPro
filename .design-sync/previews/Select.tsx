import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
  Label,
  Input,
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

export const ViolationCategory = () => (
  <Panel
    title="Log a violation"
    subtitle="Unit 1204 · Sunset Condos · cited under Article XII of the declaration"
    footer={
      <div className="flex items-center justify-end gap-3">
        <Button size="sm" variant="outline">
          Cancel
        </Button>
        <Button size="sm">Save violation</Button>
      </div>
    }
  >
    <div className="space-y-5">
      <div className="space-y-2">
        <Label htmlFor="vi-category">Violation category</Label>
        <Select open defaultValue="architectural">
          <SelectTrigger id="vi-category">
            <SelectValue placeholder="Choose a category" />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectLabel>Declaration &amp; covenants</SelectLabel>
              <SelectItem value="architectural">Unapproved architectural change</SelectItem>
              <SelectItem value="use">Prohibited use of a unit</SelectItem>
              <SelectItem value="lease">Unregistered lease or occupant</SelectItem>
            </SelectGroup>
            <SelectSeparator />
            <SelectGroup>
              <SelectLabel>Rules &amp; regulations</SelectLabel>
              <SelectItem value="parking">Parking or vehicle rule</SelectItem>
              <SelectItem value="pet">Pet rule</SelectItem>
              <SelectItem value="noise">Noise or nuisance</SelectItem>
              <SelectItem value="trash" disabled>
                Waste disposal (retired rule)
              </SelectItem>
            </SelectGroup>
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label htmlFor="vi-observed">Date observed</Label>
        <Input id="vi-observed" type="date" defaultValue="2026-08-28" />
      </div>
    </div>
  </Panel>
);

export const TriggerStates = () => (
  <Panel title="Select states" subtitle="Work order intake · Sunset Ridge Apartments">
    <div className="space-y-5">
      <div className="space-y-2">
        <Label htmlFor="se-filled">Selected value</Label>
        <Select defaultValue="plumbing">
          <SelectTrigger id="se-filled">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="plumbing">Plumbing</SelectItem>
            <SelectItem value="electrical">Electrical</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label htmlFor="se-placeholder">Placeholder</Label>
        <Select>
          <SelectTrigger id="se-placeholder">
            <SelectValue placeholder="Assign a vendor" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="acme">Acme Elevator Co.</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label htmlFor="se-disabled" className="text-content-disabled">
          Disabled
        </Label>
        <Select disabled defaultValue="professional">
          <SelectTrigger id="se-disabled">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="professional">Professional plan</SelectItem>
          </SelectContent>
        </Select>
        <p className="text-xs text-content-tertiary">
          Plan changes are made by the root manager in Billing.
        </p>
      </div>
    </div>
  </Panel>
);
