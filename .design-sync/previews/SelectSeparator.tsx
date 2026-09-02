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

export const SeparatedSections = () => (
  <Panel
    title="Announcement audience"
    subtitle="Audience is enforced on the feed and on every notification, so choose carefully."
    footer={
      <div className="flex items-center justify-end gap-3">
        <Button size="sm" variant="outline">
          Save draft
        </Button>
        <Button size="sm">Publish announcement</Button>
      </div>
    }
  >
    <div className="space-y-2">
      <Label htmlFor="ss-audience">Send to</Label>
      <Select open defaultValue="owners_only">
        <SelectTrigger id="ss-audience">
          <SelectValue placeholder="Choose an audience" />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            <SelectLabel>Everyone</SelectLabel>
            <SelectItem value="all">All residents</SelectItem>
          </SelectGroup>
          <SelectSeparator />
          <SelectGroup>
            <SelectLabel>By tenure</SelectLabel>
            <SelectItem value="owners_only">Owners only</SelectItem>
            <SelectItem value="tenants_only">Tenants only</SelectItem>
          </SelectGroup>
          <SelectSeparator />
          <SelectGroup>
            <SelectLabel>Governance</SelectLabel>
            <SelectItem value="board">Board members only</SelectItem>
            <SelectItem value="committee">Fining committee</SelectItem>
          </SelectGroup>
        </SelectContent>
      </Select>
      <p className="text-xs text-content-tertiary">
        Residents outside the chosen audience will not see this announcement anywhere.
      </p>
    </div>
  </Panel>
);
