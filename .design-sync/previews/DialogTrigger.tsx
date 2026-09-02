import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
  Button,
  Input,
  Label,
} from '@propertypro/design-system';

/** Closed dialog — the trigger is the only thing that renders, in real page chrome. */
export const TriggerInPageHeader = () => (
  <div className="space-y-4">
    <div className="flex items-start justify-between">
      <div>
        <h1 className="text-2xl font-semibold text-content">Announcements</h1>
        <p className="text-sm text-content-secondary">
          Sunset Condos · 12 published this year
        </p>
      </div>
      <Dialog>
        <DialogTrigger asChild>
          <Button>New announcement</Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New announcement</DialogTitle>
            <DialogDescription>
              Choose who sees this before publishing.
            </DialogDescription>
          </DialogHeader>
        </DialogContent>
      </Dialog>
    </div>
    <div className="rounded-md border border-edge bg-surface-card">
      {[
        ['Pool closure for resurfacing', 'Published 26 Aug 2026'],
        ['Hurricane season preparedness', 'Published 1 Jun 2026'],
        ['Elevator modernization schedule', 'Published 12 May 2026'],
      ].map(([title, meta]) => (
        <div key={title} className="border-b border-edge px-4 py-3">
          <p className="text-sm font-medium text-content">{title}</p>
          <p className="text-xs text-content-tertiary">{meta}</p>
        </div>
      ))}
    </div>
  </div>
);

export const TriggerInRowActions = () => (
  <div className="space-y-4">
    <h1 className="text-2xl font-semibold text-content">Units</h1>
    <div className="rounded-md border border-edge bg-surface-card">
      {[
        ['Unit 0304', 'Angela Whitfield · Owner'],
        ['Unit 0402', 'Marisol Vega · Owner'],
        ['Unit 0712', 'Priya Raman · Tenant'],
      ].map(([unit, occupant]) => (
        <div
          key={unit}
          className="flex items-center justify-between border-b border-edge px-4 py-3"
        >
          <div>
            <p className="text-sm font-medium text-content">{unit}</p>
            <p className="text-xs text-content-tertiary">{occupant}</p>
          </div>
          <Dialog>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm">Edit unit</Button>
            </DialogTrigger>
            <DialogContent />
          </Dialog>
        </div>
      ))}
    </div>
  </div>
);

/** Open — the same trigger, showing what it opens. */
export const TriggerOpensDialog = () => (
  <div className="space-y-4">
    <div className="flex items-start justify-between">
      <div>
        <h1 className="text-2xl font-semibold text-content">Announcements</h1>
        <p className="text-sm text-content-secondary">
          Sunset Condos · 12 published this year
        </p>
      </div>
      <Dialog open>
        <DialogTrigger asChild>
          <Button>New announcement</Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New announcement</DialogTitle>
            <DialogDescription>
              Owners and tenants at Sunset Condos will be notified by email.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="announcement-title">Title</Label>
            <Input
              id="announcement-title"
              defaultValue="Pool closure for resurfacing — 8 to 12 September"
            />
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">Cancel</Button>
            </DialogClose>
            <Button>Publish</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
    <div className="rounded-md border border-edge bg-surface-card">
      {[
        ['Pool closure for resurfacing', 'Published 26 Aug 2026'],
        ['Hurricane season preparedness', 'Published 1 Jun 2026'],
        ['Elevator modernization schedule', 'Published 12 May 2026'],
      ].map(([title, meta]) => (
        <div key={title} className="border-b border-edge px-4 py-3">
          <p className="text-sm font-medium text-content">{title}</p>
          <p className="text-xs text-content-tertiary">{meta}</p>
        </div>
      ))}
    </div>
  </div>
);
