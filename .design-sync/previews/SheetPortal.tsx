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

const DocumentsPage = () => (
  <div className="min-h-screen bg-surface-page p-6">
    <h1 className="text-2xl font-semibold text-content">Documents</h1>
    <p className="mt-1 text-sm text-content-secondary">
      Official records must be posted within 30 days of creation.
    </p>
    <div className="mt-6 overflow-hidden rounded-md border border-edge bg-surface-card">
      {[
        ['Declaration of condominium', 'Governing documents'],
        ['2026 adopted budget', 'Financial'],
        ['Board meeting minutes — 21 Aug', 'Minutes'],
        ['Milestone inspection report', 'Structural'],
      ].map(([name, cat]) => (
        <div key={name} className="flex items-center justify-between border-b border-edge px-4 py-3 last:border-0">
          <span className="text-sm text-content">{name}</span>
          <span className="text-xs text-content-tertiary">{cat}</span>
        </div>
      ))}
    </div>
  </div>
);

export const PanelRendersAboveThePage = () => (
  <>
    <DocumentsPage />
    <Sheet open>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-[540px]">
        <SheetHeader>
          <SheetTitle>Board packet &mdash; 18 September 2026</SheetTitle>
          <SheetDescription>
            The panel is portalled to the document root, so it layers above the page rather than
            inside the table it was opened from.
          </SheetDescription>
        </SheetHeader>
        <div className="mt-6 space-y-3">
          {['Agenda', 'Treasurer report', 'Reserve study summary', 'Vendor contract — landscaping'].map((doc) => (
            <div key={doc} className="flex items-center justify-between text-sm">
              <span className="text-content">{doc}</span>
              <span className="text-xs text-content-tertiary">PDF</span>
            </div>
          ))}
          <Separator />
          <p className="text-sm text-content-secondary">
            Packets posted here satisfy the 48-hour board-meeting notice requirement.
          </p>
        </div>
        <SheetFooter className="mt-8">
          <Button variant="outline">Download all</Button>
          <Button>Post to portal</Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  </>
);

export const LayeredOverTheRecordsTable = () => (
  <>
    <DocumentsPage />
    <Sheet open>
      <SheetContent side="left" className="w-full overflow-y-auto sm:max-w-[400px]">
        <SheetHeader>
          <SheetTitle>Filter records</SheetTitle>
          <SheetDescription>Category, posting window and retention status.</SheetDescription>
        </SheetHeader>
        <div className="mt-6 space-y-2">
          {['Governing documents', 'Financial', 'Minutes', 'Structural', 'Insurance', 'Contracts'].map((c) => (
            <div key={c} className="rounded-md border border-edge bg-surface-card px-3 py-2 text-sm text-content">
              {c}
            </div>
          ))}
        </div>
        <SheetFooter className="mt-8">
          <Button>Apply</Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  </>
);
