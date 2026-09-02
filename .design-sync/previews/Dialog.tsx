import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
  Button,
  Input,
  Label,
  Textarea,
} from '@propertypro/design-system';

/** Page content the modal sits on top of — makes the scrim read as real product chrome. */
const DocumentsPage = () => (
  <div className="space-y-4" aria-hidden="true">
    <div className="flex items-start justify-between">
      <div>
        <h1 className="text-2xl font-semibold text-content">Documents</h1>
        <p className="text-sm text-content-secondary">
          Sunset Condos · 148 units · 42 documents posted
        </p>
      </div>
      <div className="h-9 w-36 rounded-md bg-interactive" />
    </div>
    <div className="rounded-md border border-edge bg-surface-card">
      {[
        ['Declaration of Condominium (Amended 2024)', 'Governing Documents', 'Mar 4, 2024'],
        ['2026 Reserve Study', 'Financial', 'Jan 18, 2026'],
        ['Milestone Inspection Report — Tower B', 'Structural', 'Nov 2, 2025'],
        ['Q3 2026 Operating Budget', 'Financial', 'Jul 9, 2026'],
        ['Board Meeting Minutes — June 2026', 'Meetings', 'Jun 24, 2026'],
      ].map(([name, category, posted]) => (
        <div
          key={name}
          className="flex items-center justify-between border-b border-edge px-4 py-3 text-sm"
        >
          <span className="font-medium text-content">{name}</span>
          <span className="text-content-tertiary">
            {category} · {posted}
          </span>
        </div>
      ))}
    </div>
  </div>
);

export const UploadDocumentDialog = () => (
  <>
    <DocumentsPage />
    <Dialog open>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Upload document</DialogTitle>
          <DialogDescription>
            Florida §718.111(12) requires official records to be posted to the
            association website within 30 days of receipt.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="doc-title">Document title</Label>
            <Input id="doc-title" defaultValue="2026 Reserve Study" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="doc-notes">Notes for owners</Label>
            <Textarea
              id="doc-notes"
              rows={3}
              defaultValue="Prepared by Coastal Reserve Advisors, adopted at the January 2026 board meeting."
            />
          </div>
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">Cancel</Button>
          </DialogClose>
          <Button>Upload document</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </>
);

export const MeetingNoticeDialog = () => (
  <>
    <DocumentsPage />
    <Dialog open>
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle>Board of Directors — Regular Meeting</DialogTitle>
          <DialogDescription>
            Notice was posted 3 days before the meeting, satisfying the 48-hour
            board-meeting requirement.
          </DialogDescription>
        </DialogHeader>
        <dl className="grid grid-cols-2 gap-4 rounded-md border border-edge bg-surface-muted p-4 text-sm">
          <div>
            <dt className="text-xs uppercase tracking-wide text-content-tertiary">Date &amp; time</dt>
            <dd className="mt-1 font-medium text-content">Tuesday, 22 September 2026 · 6:30 PM</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-content-tertiary">Location</dt>
            <dd className="mt-1 font-medium text-content">Clubhouse, 1400 Ocean Drive, Miami</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-content-tertiary">Notice posted</dt>
            <dd className="mt-1 font-medium text-content">19 September 2026, 9:04 AM</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-content-tertiary">Quorum</dt>
            <dd className="mt-1 font-medium text-content">4 of 7 directors</dd>
          </div>
        </dl>
        <div className="space-y-2 text-sm text-content-secondary">
          <p className="font-medium text-content">Agenda</p>
          <ol className="space-y-1 pl-5">
            <li>1. Approval of June minutes</li>
            <li>2. Reserve study presentation — Coastal Reserve Advisors</li>
            <li>3. Roof replacement special assessment — first reading</li>
            <li>4. Owner comment</li>
          </ol>
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">Close</Button>
          </DialogClose>
          <Button>Download notice (PDF)</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </>
);
