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

export const StandardTitle = () => (
  <Dialog open>
    <DialogContent>
      <DialogHeader>
        <DialogTitle>Add a resident</DialogTitle>
        <DialogDescription>
          Residents receive an invitation email and appear in the directory once
          they accept.
        </DialogDescription>
      </DialogHeader>
      <div className="rounded-md border border-edge bg-surface-muted p-4 text-sm text-content-secondary">
        Sunset Condos · 148 units · 210 registered residents
      </div>
      <DialogFooter>
        <DialogClose asChild>
          <Button variant="outline">Cancel</Button>
        </DialogClose>
        <Button>Send invitation</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
);

export const LongStatutoryTitle = () => (
  <Dialog open>
    <DialogContent size="sm">
      <DialogHeader>
        <DialogTitle className="pr-8">
          Structural Integrity Reserve Study — funding schedule adoption
        </DialogTitle>
        <DialogDescription>
          A long title wraps onto multiple lines and keeps its tight leading, so
          the description below stays visually attached to it.
        </DialogDescription>
      </DialogHeader>
      <DialogFooter>
        <DialogClose asChild>
          <Button variant="outline" size="sm">Cancel</Button>
        </DialogClose>
        <Button size="sm">Adopt schedule</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
);

export const TitleWithoutDescription = () => (
  <Dialog open>
    <DialogContent size="lg">
      <DialogHeader>
        <DialogTitle>Ballot preview — 2026 Board Election</DialogTitle>
      </DialogHeader>
      <div className="space-y-3 rounded-md border border-edge p-4 text-sm">
        <p className="font-medium text-content">
          Elect three directors to a two-year term
        </p>
        {['Angela Whitfield — Unit 0304', 'Carlos Mendez — Unit 0910', 'Priya Raman — Unit 0712', 'Theo Brandt — Unit 1102'].map(
          (candidate) => (
            <div
              key={candidate}
              className="flex items-center gap-3 rounded-md border border-edge px-3 py-2 text-content-secondary"
            >
              <span className="h-4 w-4 rounded-full border border-edge-strong" aria-hidden="true" />
              {candidate}
            </div>
          ),
        )}
      </div>
      <DialogFooter>
        <DialogClose asChild>
          <Button variant="outline">Close preview</Button>
        </DialogClose>
        <Button>Open voting</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
);
