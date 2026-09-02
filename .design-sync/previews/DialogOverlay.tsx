import {
  Dialog,
  DialogPortal,
  DialogOverlay,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
  Button,
} from '@propertypro/design-system';

const ViolationsPage = () => (
  <div className="space-y-4" aria-hidden="true">
    <div className="flex items-start justify-between">
      <div>
        <h1 className="text-2xl font-semibold text-content">Violations</h1>
        <p className="text-sm text-content-secondary">Sunset Condos · 6 open cases</p>
      </div>
      <div className="h-9 w-36 rounded-md bg-interactive" />
    </div>
    <div className="rounded-md border border-edge bg-surface-card">
      {[
        ['Unapproved balcony enclosure', 'Unit 1207 · Hearing 12 Sep'],
        ['Vehicle parked in fire lane', 'Unit 0910 · Notice sent 24 Aug'],
        ['Unregistered pet', 'Unit 0712 · Awaiting response'],
        ['Storage on common walkway', 'Unit 0304 · Cured 19 Aug'],
        ['Short-term rental listing', 'Unit 1102 · Under review'],
      ].map(([title, meta]) => (
        <div key={title} className="border-b border-edge px-4 py-3">
          <p className="text-sm font-medium text-content">{title}</p>
          <p className="text-xs text-content-tertiary">{meta}</p>
        </div>
      ))}
    </div>
  </div>
);

/** The default scrim: DialogContent renders DialogOverlay for you. */
export const DefaultScrim = () => (
  <>
    <ViolationsPage />
    <Dialog open>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Schedule a fining committee hearing</DialogTitle>
          <DialogDescription>
            Unit 1207 must receive at least 14 days&rsquo; written notice before the
            hearing date.
          </DialogDescription>
        </DialogHeader>
        <div className="rounded-md border border-edge bg-surface-muted p-4 text-sm text-content-secondary">
          Earliest permitted hearing date: 15 September 2026
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">Cancel</Button>
          </DialogClose>
          <Button>Schedule hearing</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </>
);

/** A lighter scrim, composed by hand so the page stays readable behind a
 *  non-blocking side panel. */
export const LightenedScrim = () => (
  <>
    <ViolationsPage />
    <Dialog open>
      <DialogPortal>
        <DialogOverlay className="bg-black/40" />
        <div className="fixed left-[50%] top-[50%] z-50 grid w-[calc(100vw-2rem)] max-w-[calc(100vw-2rem)] translate-x-[-50%] translate-y-[-50%] gap-4 rounded-lg border border-edge bg-surface-card p-6 shadow-e3 sm:max-w-[560px]">
          <div className="space-y-2">
            <DialogTitle>Case timeline — Unit 1207</DialogTitle>
            <DialogDescription>
              A lighter scrim keeps the violations list legible while the reviewer
              cross-checks dates.
            </DialogDescription>
          </div>
          <ol className="space-y-3 text-sm">
            {[
              ['12 Aug 2026', 'Violation recorded by Carlos Mendez (CAM)'],
              ['24 Aug 2026', 'Courtesy notice mailed to owner of record'],
              ['29 Aug 2026', 'Owner response received — enclosure not removed'],
            ].map(([date, event]) => (
              <li key={date} className="flex gap-3">
                <span className="w-24 shrink-0 tabular-nums text-content-tertiary">{date}</span>
                <span className="text-content-secondary">{event}</span>
              </li>
            ))}
          </ol>
          <div className="flex justify-end gap-2">
            <DialogClose asChild>
              <Button variant="outline">Close</Button>
            </DialogClose>
            <Button>Issue notice of hearing</Button>
          </div>
        </div>
      </DialogPortal>
    </Dialog>
  </>
);
