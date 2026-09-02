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
  StatusBadge,
} from '@propertypro/design-system';

export const SizeSm = () => (
  <Dialog open>
    <DialogContent size="sm">
      <DialogHeader>
        <DialogTitle>Waive late fee</DialogTitle>
        <DialogDescription>
          Unit 402 — Marisol Vega. A $25 late fee will be reversed on the July
          assessment.
        </DialogDescription>
      </DialogHeader>
      <DialogFooter>
        <DialogClose asChild>
          <Button variant="outline" size="sm">Cancel</Button>
        </DialogClose>
        <Button size="sm">Waive fee</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
);

export const SizeMd = () => (
  <Dialog open>
    <DialogContent size="md">
      <DialogHeader>
        <DialogTitle>Record a violation</DialogTitle>
        <DialogDescription>
          Owners receive a 14-day notice before any fining committee hearing.
        </DialogDescription>
      </DialogHeader>
      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="violation-unit">Unit</Label>
          <Input id="violation-unit" defaultValue="1207 — Dennis Ruiz" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="violation-rule">Rule or covenant</Label>
          <Input id="violation-rule" defaultValue="Art. VII §3 — Balcony enclosures" />
        </div>
      </div>
      <DialogFooter>
        <DialogClose asChild>
          <Button variant="outline">Cancel</Button>
        </DialogClose>
        <Button>Record violation</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
);

export const SizeLg = () => (
  <Dialog open>
    <DialogContent size="lg">
      <DialogHeader>
        <DialogTitle>Review delinquent accounts</DialogTitle>
        <DialogDescription>
          Five units are more than 90 days past due as of 1 September 2026.
        </DialogDescription>
      </DialogHeader>
      <div className="rounded-md border border-edge">
        <div className="flex items-center justify-between border-b border-edge bg-surface-muted px-4 py-2 text-xs uppercase tracking-wide text-content-tertiary">
          <span>Unit / owner</span>
          <span>Balance · days past due</span>
        </div>
        {[
          ['0304 — Angela Whitfield', '$2,480.00', '118 days'],
          ['0712 — Priya Raman', '$1,905.50', '104 days'],
          ['1102 — Theo Brandt', '$1,240.00', '97 days'],
          ['1207 — Dennis Ruiz', '$980.25', '93 days'],
        ].map(([unit, balance, age]) => (
          <div key={unit} className="flex items-center justify-between px-4 py-3 text-sm">
            <span className="font-medium text-content">{unit}</span>
            <span className="tabular-nums text-content-secondary">
              {balance} · <span className="text-status-danger">{age}</span>
            </span>
          </div>
        ))}
      </div>
      <DialogFooter>
        <DialogClose asChild>
          <Button variant="outline">Close</Button>
        </DialogClose>
        <Button>Send demand letters</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
);

export const SizeXl = () => (
  <Dialog open>
    <DialogContent size="xl">
      <DialogHeader>
        <DialogTitle>Compliance snapshot — Sunset Condos</DialogTitle>
        <DialogDescription>
          Statutory posting obligations under §718.111(12)(g), refreshed nightly.
        </DialogDescription>
      </DialogHeader>
      <div className="grid grid-cols-4 gap-4">
        {[
          ['Compliance score', '92%', 'text-status-success'],
          ['Documents overdue', '2', 'text-status-danger'],
          ['Notices due in 7 days', '3', 'text-status-warning'],
          ['Records posted (90d)', '18', 'text-content'],
        ].map(([label, value, tone]) => (
          <div key={label} className="rounded-md border border-edge bg-surface-muted p-4">
            <p className="text-xs uppercase tracking-wide text-content-tertiary">{label}</p>
            <p className={'mt-2 text-2xl font-semibold ' + tone}>{value}</p>
          </div>
        ))}
      </div>
      <div className="rounded-md border border-edge">
        {[
          ['Milestone inspection report', 'Posted 2 Nov 2025', 'compliant'],
          ['Structural integrity reserve study', 'Due 31 Dec 2026', 'due_soon'],
          ['Annual budget & reserve schedule', 'Overdue by 6 days', 'overdue'],
        ].map(([record, detail, status]) => (
          <div
            key={record}
            className="flex items-center justify-between border-b border-edge px-4 py-3 text-sm"
          >
            <div>
              <p className="font-medium text-content">{record}</p>
              <p className="text-xs text-content-tertiary">{detail}</p>
            </div>
            <StatusBadge status={status} size="sm" subtle />
          </div>
        ))}
      </div>
      <DialogFooter>
        <DialogClose asChild>
          <Button variant="outline">Close</Button>
        </DialogClose>
        <Button>Export report</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
);
