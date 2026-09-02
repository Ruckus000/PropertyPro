import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  Button,
  ShadcnBadge,
  Separator,
} from '@propertypro/design-system';

const ResidentsPage = () => (
  <div className="min-h-screen bg-surface-page p-6">
    <h1 className="text-2xl font-semibold text-content">Residents</h1>
    <p className="mt-1 text-sm text-content-secondary">Sunset Condos &middot; 148 units &middot; 212 people</p>
    <div className="mt-6 grid grid-cols-2 gap-4">
      {['Unit 4B — Marisol Duarte', 'Unit 7C — Alan Whitfield', 'Unit 11A — Priya Raman', 'Unit 12D — Hector Ruiz'].map(
        (name) => (
          <div key={name} className="rounded-md border border-edge bg-surface-card p-4">
            <p className="text-sm font-medium text-content">{name}</p>
            <p className="mt-1 text-xs text-content-tertiary">Owner occupied &middot; ballot eligible</p>
          </div>
        ),
      )}
    </div>
  </div>
);

export const RightPanel = () => (
  <>
    <ResidentsPage />
    <Sheet open>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-[540px]">
        <SheetHeader>
          <SheetTitle>Marisol Duarte</SheetTitle>
          <SheetDescription>Unit 4B &middot; owner of record since March 2019</SheetDescription>
        </SheetHeader>
        <div className="mt-6 space-y-4">
          <div className="flex flex-wrap gap-2">
            <ShadcnBadge>Unit owner</ShadcnBadge>
            <ShadcnBadge variant="secondary">Board member</ShadcnBadge>
            <ShadcnBadge variant="outline">Ballot eligible</ShadcnBadge>
          </div>
          <Separator />
          <div className="space-y-3">
            <div className="flex justify-between text-sm">
              <span className="text-content-secondary">Assessment balance</span>
              <span className="tabular-nums font-medium text-content">$0.00</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-content-secondary">Open work orders</span>
              <span className="tabular-nums font-medium text-content">1</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-content-secondary">Estoppel requests</span>
              <span className="tabular-nums font-medium text-content">None</span>
            </div>
          </div>
        </div>
        <SheetFooter className="mt-8">
          <Button variant="outline">Message resident</Button>
          <Button>Edit unit record</Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  </>
);

export const LeftNavigationPanel = () => (
  <>
    <ResidentsPage />
    <Sheet open>
      <SheetContent side="left" className="w-full overflow-y-auto sm:max-w-[400px]">
        <SheetHeader>
          <SheetTitle>Sunset Condos</SheetTitle>
          <SheetDescription>Switch section</SheetDescription>
        </SheetHeader>
        <nav className="mt-6 space-y-1">
          {['Dashboard', 'Documents', 'Meetings', 'Violations', 'Work orders', 'Assessments', 'Residents'].map(
            (item) => (
              <a
                key={item}
                href="#"
                className="block rounded-md px-3 py-2 text-sm text-content-secondary hover:bg-surface-muted"
              >
                {item}
              </a>
            ),
          )}
        </nav>
      </SheetContent>
    </Sheet>
  </>
);

export const BottomPanel = () => (
  <>
    <ResidentsPage />
    <Sheet open>
      <SheetContent side="bottom">
        <SheetHeader>
          <SheetTitle>Import owners from CSV</SheetTitle>
          <SheetDescription>
            Column headers must match the roster template. Duplicate email addresses are skipped.
          </SheetDescription>
        </SheetHeader>
        <div className="mt-6 rounded-md border border-edge bg-surface-subtle p-4 text-sm text-content-secondary">
          owner_roster_2026.csv &middot; 148 rows detected &middot; 3 rows missing a unit number
        </div>
        <SheetFooter className="mt-6">
          <Button variant="ghost">Cancel</Button>
          <Button>Import 145 owners</Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  </>
);
