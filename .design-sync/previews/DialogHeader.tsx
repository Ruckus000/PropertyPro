import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
  Button,
  StatusBadge,
} from '@propertypro/design-system';

export const TitleAndDescription = () => (
  <Dialog open>
    <DialogContent>
      <DialogHeader>
        <DialogTitle>Approve access request</DialogTitle>
        <DialogDescription>
          Grant portal access to Marisol Vega and assign her to Unit 402. She
          will receive an invitation email immediately.
        </DialogDescription>
      </DialogHeader>
      <div className="rounded-md border border-edge bg-surface-muted p-4 text-sm text-content-secondary">
        Requested 28 August 2026 · verified against the ownership roster filed
        with Miami-Dade County.
      </div>
      <DialogFooter>
        <DialogClose asChild>
          <Button variant="outline">Cancel</Button>
        </DialogClose>
        <Button>Approve request</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
);

export const HeaderWithStatus = () => (
  <Dialog open>
    <DialogContent size="lg">
      <DialogHeader>
        <div className="flex items-center gap-3">
          <DialogTitle>Work order #WO-2418</DialogTitle>
          <StatusBadge status="in_progress" size="sm" subtle />
        </div>
        <DialogDescription>
          Elevator 2 — intermittent door fault reported by three residents in
          Tower B.
        </DialogDescription>
      </DialogHeader>
      <dl className="grid grid-cols-2 gap-4 text-sm">
        <div>
          <dt className="text-xs uppercase tracking-wide text-content-tertiary">Vendor</dt>
          <dd className="mt-1 font-medium text-content">Atlantic Elevator Service</dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide text-content-tertiary">Opened</dt>
          <dd className="mt-1 font-medium text-content">26 August 2026</dd>
        </div>
      </dl>
      <DialogFooter>
        <DialogClose asChild>
          <Button variant="outline">Close</Button>
        </DialogClose>
        <Button>Mark complete</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
);

export const HeaderOnlyNotice = () => (
  <Dialog open>
    <DialogContent size="sm">
      <DialogHeader>
        <DialogTitle>Notice scheduled</DialogTitle>
        <DialogDescription>
          The owner meeting notice for 14 October 2026 will be emailed to all
          148 units tomorrow at 8:00 AM.
        </DialogDescription>
      </DialogHeader>
      <DialogFooter>
        <DialogClose asChild>
          <Button>Got it</Button>
        </DialogClose>
      </DialogFooter>
    </DialogContent>
  </Dialog>
);
