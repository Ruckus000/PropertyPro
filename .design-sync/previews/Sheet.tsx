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

const rows = [
  { id: 'V-2026-0148', unit: 'Unit 4B', rule: 'Balcony storage', opened: '12 Aug 2026' },
  { id: 'V-2026-0151', unit: 'Unit 11A', rule: 'Unregistered vehicle', opened: '19 Aug 2026' },
  { id: 'V-2026-0155', unit: 'Unit 7C', rule: 'Quiet hours', opened: '24 Aug 2026' },
];

const ViolationsPage = () => (
  <div className="min-h-screen bg-surface-page p-6">
    <h1 className="text-2xl font-semibold text-content">Violations</h1>
    <p className="mt-1 text-sm text-content-secondary">Sunset Condos &middot; 12 open matters</p>
    <div className="mt-6 overflow-hidden rounded-md border border-edge bg-surface-card">
      {rows.map((r) => (
        <div key={r.id} className="flex items-center justify-between border-b border-edge px-4 py-3 last:border-0">
          <div className="min-w-0">
            <p className="text-sm font-medium text-content">{r.unit} &middot; {r.rule}</p>
            <p className="text-xs text-content-tertiary">{r.id} &middot; opened {r.opened}</p>
          </div>
          <ShadcnBadge variant="outline">Open</ShadcnBadge>
        </div>
      ))}
    </div>
  </div>
);

export const ViolationDetail = () => (
  <>
    <ViolationsPage />
    <Sheet open>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-[540px]">
        <SheetHeader>
          <SheetTitle>Violation V-2026-0148</SheetTitle>
          <SheetDescription>
            Unit 4B &middot; Balcony storage &middot; reported by the site manager on 12 August 2026.
          </SheetDescription>
        </SheetHeader>
        <div className="mt-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs uppercase tracking-wide text-content-tertiary">Rule cited</p>
              <p className="text-sm text-content">Declaration &sect; 8.3(b)</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-content-tertiary">Hearing notice due</p>
              <p className="text-sm text-content">26 August 2026</p>
            </div>
          </div>
          <Separator />
          <div className="rounded-md border border-edge bg-surface-subtle p-4">
            <p className="text-sm text-content-secondary">
              Bicycles and storage bins are visible from the common walkway. Photographs were
              attached to the inspection log; the owner has not responded to the courtesy notice.
            </p>
          </div>
        </div>
        <SheetFooter className="mt-8">
          <Button variant="outline">Save draft</Button>
          <Button>Send 14-day notice</Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  </>
);

export const BottomFilterSheet = () => (
  <>
    <ViolationsPage />
    <Sheet open>
      <SheetContent side="bottom">
        <SheetHeader>
          <SheetTitle>Filter violations</SheetTitle>
          <SheetDescription>Narrow the register before exporting it for the board packet.</SheetDescription>
        </SheetHeader>
        <div className="mt-6 flex flex-wrap gap-2">
          <ShadcnBadge>Open</ShadcnBadge>
          <ShadcnBadge variant="secondary">Hearing scheduled</ShadcnBadge>
          <ShadcnBadge variant="outline">Cured</ShadcnBadge>
          <ShadcnBadge variant="outline">Fine assessed</ShadcnBadge>
          <ShadcnBadge variant="outline">Referred to counsel</ShadcnBadge>
        </div>
        <SheetFooter className="mt-6">
          <Button variant="ghost">Reset</Button>
          <Button>Apply filters</Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  </>
);
