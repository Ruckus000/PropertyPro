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

/**
 * The dialog is mounted from inside a clipped, scrolling sidebar card. The
 * portal lifts it out of that stacking/overflow context so it still centres on
 * the viewport instead of being cropped by the card.
 */
export const EscapesClippedPanel = () => (
  <div className="grid grid-cols-3 gap-4">
    <div className="col-span-2 space-y-3">
      <h1 className="text-2xl font-semibold text-content">Reserve funding</h1>
      <p className="text-sm text-content-secondary">
        Palm Shores HOA · fiscal year 2026
      </p>
      <div className="rounded-md border border-edge bg-surface-card p-4">
        <p className="text-xs uppercase tracking-wide text-content-tertiary">
          Reserve balance
        </p>
        <p className="mt-2 text-2xl font-semibold tabular-nums text-content">$1,284,610</p>
        <p className="mt-1 text-sm text-content-secondary">
          Fully funded through the roof replacement scheduled for 2029.
        </p>
      </div>
    </div>
    <div className="h-40 overflow-hidden rounded-md border border-edge bg-surface-muted p-4">
      <p className="text-xs uppercase tracking-wide text-content-tertiary">
        Pending approvals
      </p>
      <p className="mt-2 text-sm text-content-secondary">
        Special assessment — roof replacement
      </p>
      <Dialog open>
        <DialogContent size="sm">
          <DialogHeader>
            <DialogTitle>Approve special assessment</DialogTitle>
            <DialogDescription>
              $4,820 per unit, payable in four quarterly instalments beginning
              1 January 2027.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline" size="sm">Cancel</Button>
            </DialogClose>
            <Button size="sm">Approve</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  </div>
);

/**
 * Explicit portal composition — overlay and panel are siblings inside
 * DialogPortal, which is exactly what DialogContent does internally.
 */
export const ExplicitPortalComposition = () => (
  <div className="space-y-4">
    <h1 className="text-2xl font-semibold text-content">Amenity reservations</h1>
    <div className="rounded-md border border-edge bg-surface-card">
      {[
        ['Clubhouse', 'Sat 5 Sep · 4:00–9:00 PM · Unit 0402'],
        ['Rooftop terrace', 'Sun 6 Sep · 11:00 AM–2:00 PM · Unit 0910'],
        ['Guest suite', 'Fri 11 Sep – Sun 13 Sep · Unit 1102'],
      ].map(([amenity, slot]) => (
        <div key={amenity} className="border-b border-edge px-4 py-3">
          <p className="text-sm font-medium text-content">{amenity}</p>
          <p className="text-xs text-content-tertiary">{slot}</p>
        </div>
      ))}
    </div>
    <Dialog open>
      <DialogPortal>
        <DialogOverlay />
        <div className="fixed left-[50%] top-[50%] z-50 grid w-[calc(100vw-2rem)] max-w-[calc(100vw-2rem)] translate-x-[-50%] translate-y-[-50%] gap-4 rounded-lg border border-edge bg-surface-card p-6 shadow-e3 sm:max-w-[560px]">
          <div className="space-y-2">
            <DialogTitle>Confirm clubhouse reservation</DialogTitle>
            <DialogDescription>
              Saturday 5 September, 4:00–9:00 PM for Unit 0402. A $150 refundable
              deposit will be added to the October assessment.
            </DialogDescription>
          </div>
          <div className="flex justify-end gap-2">
            <DialogClose asChild>
              <Button variant="outline">Cancel</Button>
            </DialogClose>
            <Button>Confirm reservation</Button>
          </div>
        </div>
      </DialogPortal>
    </Dialog>
  </div>
);
