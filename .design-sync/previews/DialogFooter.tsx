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

export const PrimaryAndCancel = () => (
  <Dialog open>
    <DialogContent>
      <DialogHeader>
        <DialogTitle>Publish announcement</DialogTitle>
        <DialogDescription>
          &ldquo;Pool closure for resurfacing — 8 to 12 September&rdquo; will be
          visible to all owners and tenants at Sunset Condos.
        </DialogDescription>
      </DialogHeader>
      <div className="rounded-md border border-edge bg-surface-muted p-4 text-sm text-content-secondary">
        148 units · 210 recipients · email and in-app notification
      </div>
      <DialogFooter>
        <DialogClose asChild>
          <Button variant="outline">Save as draft</Button>
        </DialogClose>
        <Button>Publish now</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
);

export const DestructiveFooter = () => (
  <Dialog open>
    <DialogContent size="sm">
      <DialogHeader>
        <DialogTitle>Withdraw ARC application</DialogTitle>
        <DialogDescription>
          Impact window replacement — Unit 508. The architectural review
          committee will be notified that the application is withdrawn.
        </DialogDescription>
      </DialogHeader>
      <DialogFooter>
        <DialogClose asChild>
          <Button variant="outline">Keep application</Button>
        </DialogClose>
        <Button variant="destructive">Withdraw</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
);

export const FooterWithPendingAction = () => (
  <Dialog open>
    <DialogContent>
      <DialogHeader>
        <DialogTitle>Send demand letters</DialogTitle>
        <DialogDescription>
          Four delinquent accounts over 90 days past due will receive a
          statutory notice of late assessment.
        </DialogDescription>
      </DialogHeader>
      <DialogFooter>
        <DialogClose asChild>
          <Button variant="outline">Cancel</Button>
        </DialogClose>
        <Button loading>Sending</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
);
