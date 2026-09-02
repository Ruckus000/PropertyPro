import {
  SlideOverPanel,
  Button,
  Input,
  Label,
  Separator,
  ShadcnBadge,
  Textarea,
} from '@propertypro/design-system';

const noop = () => {};

const workOrders = [
  { id: 'WO-2026-0412', unit: 'Unit 806', summary: 'Chiller line leak', opened: '28 Aug 2026', status: 'In progress' },
  { id: 'WO-2026-0418', unit: 'Unit 1204', summary: 'Garage door sensor', opened: '30 Aug 2026', status: 'Assigned' },
  { id: 'WO-2026-0421', unit: 'Lobby', summary: 'Elevator inspection sticker', opened: '31 Aug 2026', status: 'Open' },
];

const WorkOrdersPage = () => (
  <div className="min-h-screen bg-surface-page p-6">
    <h1 className="text-2xl font-semibold text-content">Work orders</h1>
    <p className="mt-1 text-sm text-content-secondary">Sunset Condos · 23 open</p>
    <div className="mt-6 overflow-hidden rounded-md border border-edge bg-surface-card">
      {workOrders.map((w) => (
        <div
          key={w.id}
          className="flex items-center justify-between border-b border-edge px-4 py-3 last:border-0"
        >
          <div className="min-w-0">
            <p className="text-sm font-medium text-content">
              {w.unit} · {w.summary}
            </p>
            <p className="text-xs text-content-tertiary">
              {w.id} · opened {w.opened}
            </p>
          </div>
          <ShadcnBadge variant="outline">{w.status}</ShadcnBadge>
        </div>
      ))}
    </div>
  </div>
);

export const WorkOrderDetail = () => (
  <>
    <WorkOrdersPage />
    <SlideOverPanel
      open
      onClose={noop}
      title="Work order WO-2026-0412"
      description="Unit 806 · Chiller line leak · reported 28 August 2026"
    >
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-xs uppercase tracking-wide text-content-tertiary">Assigned vendor</p>
            <p className="text-sm text-content">Bayfront Mechanical</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-content-tertiary">Priority</p>
            <p className="text-sm text-content">High · water intrusion</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-content-tertiary">Access</p>
            <p className="text-sm text-content">Owner present · weekdays after 4pm</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-content-tertiary">Estimate</p>
            <p className="text-sm text-content">$1,850</p>
          </div>
        </div>
        <Separator />
        <div className="rounded-md border border-edge bg-surface-subtle p-4">
          <p className="text-sm text-content-secondary">
            Condensate line is backing up into the drywall on the west wall. Vendor recommends
            replacing the trap and re-pitching the run before the drywall is patched.
          </p>
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="wo-note">Add an internal note</Label>
          <Textarea id="wo-note" placeholder="Visible to managers and board members only" rows={3} />
        </div>
        <div className="flex items-center gap-3">
          <Button>Mark complete</Button>
          <Button variant="outline">Reassign vendor</Button>
        </div>
      </div>
    </SlideOverPanel>
  </>
);

export const ScheduleMeetingWide = () => (
  <>
    <WorkOrdersPage />
    <SlideOverPanel
      open
      onClose={noop}
      width="lg"
      title="Schedule a board meeting"
      description="PropertyPro posts the notice and tracks the 48-hour board / 14-day owner window."
    >
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="mtg-title">Meeting title</Label>
            <Input id="mtg-title" defaultValue="October budget meeting" />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="mtg-date">Date and time</Label>
            <Input id="mtg-date" defaultValue="12 October 2026, 6:30 PM" />
          </div>
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="mtg-location">Location</Label>
          <Input id="mtg-location" defaultValue="Sunset Condos clubhouse, 1400 Collins Ave" />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="mtg-agenda">Agenda</Label>
          <Textarea
            id="mtg-agenda"
            rows={4}
            defaultValue={'1. Adoption of the 2027 operating budget\n2. Reserve funding resolution\n3. Milestone inspection update'}
          />
        </div>
        <div className="rounded-md border border-edge bg-surface-subtle p-4">
          <p className="text-sm text-content-secondary">
            Owner notice must be posted by 28 September 2026 to satisfy the 14-day requirement.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button>Post notice</Button>
          <Button variant="outline">Save draft</Button>
        </div>
      </div>
    </SlideOverPanel>
  </>
);
