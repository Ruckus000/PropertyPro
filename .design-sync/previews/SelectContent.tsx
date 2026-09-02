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

export const GroupedContent = () => (
  <Panel
    title="Post a document"
    subtitle="Documents must be posted within 30 days of creation."
    footer={
      <div className="flex items-center justify-end gap-3">
        <Button size="sm" variant="outline">
          Cancel
        </Button>
        <Button size="sm">Post document</Button>
      </div>
    }
  >
    <div className="space-y-2">
      <Label htmlFor="sc-category">Document category</Label>
      <Select open defaultValue="reserves">
        <SelectTrigger id="sc-category">
          <SelectValue placeholder="Choose a category" />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            <SelectLabel>Governance</SelectLabel>
            <SelectItem value="declaration">Declaration of condominium</SelectItem>
            <SelectItem value="bylaws">Bylaws &amp; articles</SelectItem>
            <SelectItem value="rules">Rules &amp; regulations</SelectItem>
          </SelectGroup>
          <SelectSeparator />
          <SelectGroup>
            <SelectLabel>Financial &amp; structural</SelectLabel>
            <SelectItem value="budget">Adopted budget</SelectItem>
            <SelectItem value="reserves">Structural integrity reserve study</SelectItem>
            <SelectItem value="milestone">Milestone inspection report</SelectItem>
            <SelectItem value="insurance">Insurance certificate</SelectItem>
          </SelectGroup>
        </SelectContent>
      </Select>
    </div>
  </Panel>
);

export const AlignedToTrigger = () => (
  <Panel
    title="Board designation"
    subtitle="Board status is recorded separately from a member's role."
  >
    <div className="space-y-5">
      <div className="space-y-2">
        <Label htmlFor="sc-member">Member</Label>
        <Select defaultValue="vega">
          <SelectTrigger id="sc-member">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="vega">Marisol Vega — Unit 1204</SelectItem>
          </SelectContent>
        </Select>
        <p className="text-xs text-content-tertiary">
          A board president is elected by the directors, not by the owners.
        </p>
      </div>
      <div className="space-y-2">
        <Label htmlFor="sc-designation">Designation</Label>
        <Select open defaultValue="member">
          <SelectTrigger id="sc-designation" className="max-w-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">No board designation</SelectItem>
            <SelectItem value="member">Board member</SelectItem>
            <SelectItem value="president">Board president</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  </Panel>
);
