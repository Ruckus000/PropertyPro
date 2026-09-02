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

export const CloseInFooter = () => (
  <Dialog open>
    <DialogContent>
      <DialogHeader>
        <DialogTitle>Assign unit to resident</DialogTitle>
        <DialogDescription>
          Marisol Vega will be listed as the owner of record for Unit 402 in the
          resident directory.
        </DialogDescription>
      </DialogHeader>
      <div className="rounded-md border border-edge bg-surface-muted p-4 text-sm text-content-secondary">
        Ownership verified against the deed recorded 14 February 2023.
      </div>
      <DialogFooter>
        <DialogClose asChild>
          <Button variant="outline">Cancel</Button>
        </DialogClose>
        <Button>Assign unit</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
);

export const CloseAsGhostLink = () => (
  <Dialog open>
    <DialogContent size="sm">
      <DialogHeader>
        <DialogTitle>Enable two-factor sign-in</DialogTitle>
        <DialogDescription>
          Board members handling official records are strongly encouraged to turn
          on two-factor authentication.
        </DialogDescription>
      </DialogHeader>
      <DialogFooter>
        <DialogClose asChild>
          <Button variant="ghost" size="sm">Not now</Button>
        </DialogClose>
        <Button size="sm">Set up</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
);

export const AcknowledgeOnlyClose = () => (
  <Dialog open>
    <DialogContent size="sm">
      <DialogHeader>
        <DialogTitle>Export queued</DialogTitle>
        <DialogDescription>
          Your full records export for Sunset Condos is being prepared. We will
          email a download link to you within 15 minutes.
        </DialogDescription>
      </DialogHeader>
      <DialogFooter>
        <DialogClose asChild>
          <Button>Done</Button>
        </DialogClose>
      </DialogFooter>
    </DialogContent>
  </Dialog>
);
