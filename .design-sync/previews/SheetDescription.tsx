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

const LedgerPage = () => (
  <div className="min-h-screen bg-surface-page p-6">
    <h1 className="text-2xl font-semibold text-content">Assessments</h1>
    <p className="mt-1 text-sm text-content-secondary">Q4 2026 &middot; 148 units billed &middot; 11 delinquent</p>
    <div className="mt-6 overflow-hidden rounded-md border border-edge bg-surface-card">
      {[
        ['Unit 4B', '$0.00'],
        ['Unit 7C', '$1,240.00'],
        ['Unit 11A', '$620.00'],
      ].map(([unit, bal]) => (
        <div key={unit} className="flex items-center justify-between border-b border-edge px-4 py-3 last:border-0">
          <span className="text-sm text-content">{unit}</span>
          <span className="tabular-nums text-sm font-medium text-content">{bal}</span>
        </div>
      ))}
    </div>
  </div>
);

export const SupportingContext = () => (
  <>
    <LedgerPage />
    <Sheet open>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-[540px]">
        <SheetHeader>
          <SheetTitle>Unit 7C ledger</SheetTitle>
          <SheetDescription>
            Balances reflect posted charges only. Payments made after 5:00 PM Eastern settle the next
            business day and are not included here.
          </SheetDescription>
        </SheetHeader>
        <div className="mt-6 space-y-3">
          {[
            ['01 Oct 2026', 'Quarterly assessment', '$620.00'],
            ['16 Oct 2026', 'Late fee', '$25.00'],
            ['01 Nov 2026', 'Quarterly assessment', '$620.00'],
          ].map(([date, memo, amt]) => (
            <div key={date} className="flex items-center justify-between text-sm">
              <div>
                <p className="text-content">{memo}</p>
                <p className="text-xs text-content-tertiary">{date}</p>
              </div>
              <span className="tabular-nums font-medium text-content">{amt}</span>
            </div>
          ))}
          <Separator />
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-content">Balance due</span>
            <span className="tabular-nums text-lg font-semibold text-status-danger">$1,240.00</span>
          </div>
        </div>
        <SheetFooter className="mt-8">
          <Button variant="outline">Export ledger</Button>
          <Button>Record payment</Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  </>
);

export const ShortContext = () => (
  <>
    <LedgerPage />
    <Sheet open>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-[400px]">
        <SheetHeader>
          <SheetTitle>Delinquency letter</SheetTitle>
          <SheetDescription>Sent to the owner of record and the mailing address on file.</SheetDescription>
        </SheetHeader>
        <div className="mt-6 rounded-md border border-edge bg-surface-subtle p-4 text-sm text-content-secondary">
          A statutory demand letter starts a 45-day cure period before a lien may be recorded.
        </div>
        <SheetFooter className="mt-8">
          <Button>Preview letter</Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  </>
);
