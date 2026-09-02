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

export const GroupedVendors = () => (
  <Panel
    title="Assign a vendor"
    subtitle="WO-2026-0311 · Lobby elevator · Sunset Condos"
    footer={
      <div className="flex items-center justify-end gap-3">
        <Button size="sm" variant="outline">
          Cancel
        </Button>
        <Button size="sm">Assign vendor</Button>
      </div>
    }
  >
    <div className="space-y-2">
      <Label htmlFor="sg-vendor">Approved vendor</Label>
      <Select open defaultValue="apex">
        <SelectTrigger id="sg-vendor">
          <SelectValue placeholder="Search approved vendors" />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            <SelectLabel>Under contract</SelectLabel>
            <SelectItem value="apex">Apex Elevator Service</SelectItem>
            <SelectItem value="gulfstream">Gulfstream Mechanical</SelectItem>
          </SelectGroup>
          <SelectSeparator />
          <SelectGroup>
            <SelectLabel>Insured, no contract</SelectLabel>
            <SelectItem value="biscayne">Biscayne Building Systems</SelectItem>
            <SelectItem value="coastal">Coastal Lift &amp; Hoist</SelectItem>
          </SelectGroup>
          <SelectSeparator />
          <SelectGroup>
            <SelectLabel>Insurance expired</SelectLabel>
            <SelectItem value="tropic" disabled>
              Tropic Facilities Group
            </SelectItem>
          </SelectGroup>
        </SelectContent>
      </Select>
      <p className="text-xs text-content-tertiary">
        Only vendors with current certificates of insurance can be assigned to a work order.
      </p>
    </div>
  </Panel>
);
