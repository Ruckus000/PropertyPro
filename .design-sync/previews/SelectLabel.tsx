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

export const GroupHeadings = () => (
  <Panel
    title="Schedule a meeting"
    subtitle="Notice windows differ: 14 days for owner meetings, 48 hours for board meetings."
    footer={
      <div className="flex items-center justify-end gap-3">
        <Button size="sm" variant="outline">
          Save draft
        </Button>
        <Button size="sm">Schedule meeting</Button>
      </div>
    }
  >
    <div className="space-y-2">
      <Label htmlFor="sl-type">Meeting type</Label>
      <Select open defaultValue="board-regular">
        <SelectTrigger id="sl-type">
          <SelectValue placeholder="Choose a meeting type" />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            <SelectLabel>Board meetings — 48 hours&rsquo; notice</SelectLabel>
            <SelectItem value="board-regular">Regular board meeting</SelectItem>
            <SelectItem value="board-budget">Budget adoption meeting</SelectItem>
            <SelectItem value="board-emergency">Emergency board meeting</SelectItem>
          </SelectGroup>
          <SelectSeparator />
          <SelectGroup>
            <SelectLabel>Owner meetings — 14 days&rsquo; notice</SelectLabel>
            <SelectItem value="owner-annual">Annual members&rsquo; meeting</SelectItem>
            <SelectItem value="owner-special">Special members&rsquo; meeting</SelectItem>
            <SelectItem value="owner-recall">Recall meeting</SelectItem>
          </SelectGroup>
        </SelectContent>
      </Select>
      <p className="text-xs text-content-tertiary">
        Changing the type resets the notice deadline, so post the notice again afterwards.
      </p>
    </div>
  </Panel>
);
