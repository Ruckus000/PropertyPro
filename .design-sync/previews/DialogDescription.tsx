import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
  Button,
} from '@propertypro/design-system';

export const ShortDescription = () => (
  <Dialog open>
    <DialogContent size="sm">
      <DialogHeader>
        <DialogTitle>Reassign work order</DialogTitle>
        <DialogDescription>
          Move #WO-2418 to another vendor.
        </DialogDescription>
      </DialogHeader>
      <DialogFooter>
        <DialogClose asChild>
          <Button variant="outline" size="sm">Cancel</Button>
        </DialogClose>
        <Button size="sm">Reassign</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
);

export const StatutoryDescription = () => (
  <Dialog open>
    <DialogContent>
      <DialogHeader>
        <DialogTitle>Post the milestone inspection report</DialogTitle>
        <DialogDescription>
          Buildings three storeys or taller and 30 years or older must complete a
          milestone inspection. Once posted, the report stays publicly available
          on the association website and the 30-day posting clock is satisfied
          for this record.
        </DialogDescription>
      </DialogHeader>
      <div className="rounded-md border border-edge bg-surface-muted p-4 text-sm text-content-secondary">
        Tower B · inspected 2 November 2025 by Meridian Structural Engineering
      </div>
      <DialogFooter>
        <DialogClose asChild>
          <Button variant="outline">Cancel</Button>
        </DialogClose>
        <Button>Post report</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
);

export const DescriptionWithConsequences = () => (
  <Dialog open>
    <DialogContent>
      <DialogHeader>
        <DialogTitle>Change billing plan</DialogTitle>
        <DialogDescription>
          Palm Shores HOA moves from Essentials to Professional on the next
          billing date. Payments, Violations and Board tools unlock immediately;
          the prorated difference appears on the September invoice.
        </DialogDescription>
      </DialogHeader>
      <div className="flex items-center justify-between rounded-md border border-edge px-4 py-3 text-sm">
        <span className="text-content-secondary">Professional · billed monthly</span>
        <span className="font-semibold tabular-nums text-content">$249.00 / mo</span>
      </div>
      <DialogFooter>
        <DialogClose asChild>
          <Button variant="outline">Cancel</Button>
        </DialogClose>
        <Button>Confirm change</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
);
