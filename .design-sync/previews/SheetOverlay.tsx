import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  Button,
  ShadcnBadge,
} from '@propertypro/design-system';

const Dashboard = () => (
  <div className="min-h-screen bg-surface-page p-6">
    <h1 className="text-2xl font-semibold text-content">Dashboard</h1>
    <p className="mt-1 text-sm text-content-secondary">Sunset Condos &middot; compliance score 92</p>
    <div className="mt-6 grid grid-cols-3 gap-4">
      {[
        ['Open work orders', '9'],
        ['Documents due', '3'],
        ['Delinquent units', '11'],
      ].map(([label, value]) => (
        <div key={label} className="rounded-md border border-edge bg-surface-card p-4">
          <p className="text-xs uppercase tracking-wide text-content-tertiary">{label}</p>
          <p className="mt-2 text-2xl font-semibold tabular-nums text-content">{value}</p>
        </div>
      ))}
    </div>
    <div className="mt-6 rounded-md border border-edge bg-surface-card p-4">
      <p className="text-sm font-medium text-content">Upcoming statutory deadlines</p>
      <p className="mt-1 text-sm text-content-secondary">
        Milestone inspection report due 31 Dec 2026 &middot; SIRS update due 01 Mar 2027
      </p>
    </div>
  </div>
);

export const ScrimOverDashboard = () => (
  <>
    <Dashboard />
    <Sheet open>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-[540px]">
        <SheetHeader>
          <SheetTitle>Report a maintenance issue</SheetTitle>
          <SheetDescription>
            The scrim behind this panel dims and blocks the page underneath while the sheet is open.
          </SheetDescription>
        </SheetHeader>
        <div className="mt-6 space-y-3">
          <ShadcnBadge variant="secondary">Common area</ShadcnBadge>
          <p className="text-sm text-content-secondary">
            Water is pooling at the base of the north stairwell after every irrigation cycle.
          </p>
        </div>
        <SheetFooter className="mt-8">
          <Button variant="outline">Cancel</Button>
          <Button>Submit request</Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  </>
);

export const ScrimUnderBottomSheet = () => (
  <>
    <Dashboard />
    <Sheet open>
      <SheetContent side="bottom">
        <SheetHeader>
          <SheetTitle>Compliance score breakdown</SheetTitle>
          <SheetDescription>
            A bottom sheet leaves more of the dimmed page visible behind the scrim.
          </SheetDescription>
        </SheetHeader>
        <div className="mt-6 grid grid-cols-3 gap-4">
          {[
            ['Document posting', '30-day window met'],
            ['Meeting notices', '14-day window met'],
            ['Required categories', '2 missing'],
          ].map(([label, value]) => (
            <div key={label} className="rounded-md border border-edge bg-surface-subtle p-4">
              <p className="text-xs uppercase tracking-wide text-content-tertiary">{label}</p>
              <p className="mt-1 text-sm text-content">{value}</p>
            </div>
          ))}
        </div>
        <SheetFooter className="mt-6">
          <Button>View compliance report</Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  </>
);
