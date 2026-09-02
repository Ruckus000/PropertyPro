import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  Button,
  Separator,
} from '@propertypro/design-system';

const WorkOrdersPage = () => (
  <div className="min-h-screen bg-surface-page p-6">
    <h1 className="text-2xl font-semibold text-content">Work orders</h1>
    <p className="mt-1 text-sm text-content-secondary">Sunset Ridge Apartments &middot; 9 unassigned</p>
    <div className="mt-6 space-y-3">
      {['WO-4471 — Pool pump seal leak', 'WO-4472 — Garage gate sensor', 'WO-4473 — Lobby HVAC filter'].map((w) => (
        <div key={w} className="rounded-md border border-edge bg-surface-card px-4 py-3 text-sm text-content">{w}</div>
      ))}
    </div>
  </div>
);

export const PrimaryAndSecondary = () => (
  <>
    <WorkOrdersPage />
    <Sheet open>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-[540px]">
        <SheetHeader>
          <SheetTitle>Assign WO-4471</SheetTitle>
          <SheetDescription>Pool pump seal leak &middot; reported 28 Aug 2026 by the site manager.</SheetDescription>
        </SheetHeader>
        <div className="mt-6 space-y-3">
          {['Gulfstream Mechanical — insured through Mar 2027', 'Bayside Pool Service — insured through Jan 2027'].map(
            (v) => (
              <div key={v} className="rounded-md border border-edge bg-surface-card px-4 py-3 text-sm text-content">
                {v}
              </div>
            ),
          )}
          <Separator />
          <p className="text-sm text-content-secondary">
            Assigning a vendor notifies them by email and starts the response-time clock.
          </p>
        </div>
        <SheetFooter className="mt-8">
          <Button variant="outline">Cancel</Button>
          <Button>Assign vendor</Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  </>
);

export const DestructiveFooter = () => (
  <>
    <WorkOrdersPage />
    <Sheet open>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-[400px]">
        <SheetHeader>
          <SheetTitle>Close WO-4472</SheetTitle>
          <SheetDescription>Closing removes it from the open queue and stops reminder emails.</SheetDescription>
        </SheetHeader>
        <SheetFooter className="mt-8">
          <Button variant="ghost">Keep open</Button>
          <Button variant="destructive">Close work order</Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  </>
);
