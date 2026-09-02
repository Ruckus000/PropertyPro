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

export const ItemStates = () => (
  <Panel
    title="Change a member's role"
    subtitle="Only the root manager may assign roles (ADR-006)."
    footer={
      <div className="flex items-center justify-end gap-3">
        <Button size="sm" variant="outline">
          Cancel
        </Button>
        <Button size="sm">Save role</Button>
      </div>
    }
  >
    <div className="space-y-2">
      <Label htmlFor="si-role">Community role</Label>
      <Select open defaultValue="property_manager">
        <SelectTrigger id="si-role">
          <SelectValue placeholder="Choose a role" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="resident_owner">Resident — unit owner</SelectItem>
          <SelectItem value="resident_tenant">Resident — tenant</SelectItem>
          <SelectItem value="property_manager">Property manager</SelectItem>
          <SelectItem value="root_manager" disabled>
            Root manager — transfer required
          </SelectItem>
        </SelectContent>
      </Select>
      <p className="text-xs text-content-tertiary">
        Root manager cannot be assigned here — it moves only by an explicit transfer.
      </p>
    </div>
  </Panel>
);

export const LongItemList = () => (
  <Panel
    title="Record a payment"
    subtitle="Palm Shores HOA · quarterly assessment"
  >
    <div className="space-y-2">
      <Label htmlFor="si-unit">Unit</Label>
      <Select open defaultValue="u-0311">
        <SelectTrigger id="si-unit">
          <SelectValue placeholder="Choose a unit" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="u-0104">Unit 104 — Rios</SelectItem>
          <SelectItem value="u-0208">Unit 208 — Whitfield</SelectItem>
          <SelectItem value="u-0311">Unit 311 — Okonkwo</SelectItem>
          <SelectItem value="u-0412">Unit 412 — Delacroix</SelectItem>
          <SelectItem value="u-0806">Unit 806 — Barnes</SelectItem>
          <SelectItem value="u-1204">Unit 1204 — Vega</SelectItem>
        </SelectContent>
      </Select>
    </div>
  </Panel>
);
